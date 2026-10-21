import { ehComponente } from "@/lib/componentes";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type ClienteBanco, type Transacao } from "@/server/db";
import { lerData, registrarMovimentacao, rotuloAtivo, traduzirConflito, travarAtivos, UUID } from "./inventario-base";

/**
 * Uso de equipamentos entre empresas do grupo.
 * - Regra: o equipamento só vai para colaborador da empresa proprietária ou, com aluguel
 *   vigente, da empresa locatária. Sem isso, é preciso transferir a propriedade ou alugar.
 * - Aluguel: a propriedade não muda; um só aluguel vigente por equipamento (índice único) e a
 *   troca de dono bloqueada no banco enquanto ele vale. O aluguel não entrega nada a ninguém:
 *   a entrega física continua sendo uma alocação. A devolução prevista é só um prazo — o
 *   aluguel termina pelo encerramento registrado, que exige os equipamentos devolvidos.
 * - Carregador vinculado acompanha o notebook: vale o aluguel do notebook (mesma proprietária).
 * Toda verificação acontece com os equipamentos travados na transação (SELECT … FOR UPDATE).
 */

export const MENSAGEM_OUTRA_EMPRESA = "Este equipamento pertence a outra empresa. Para utilizá-lo, realize uma transferência ou registre um aluguel entre empresas.";

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

const textoLivre = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim();
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t || null;
};

/** Dia (AAAA-MM-DD) no horário de Brasília de um momento; datas puras (@db.Date) usam o próprio dia. */
export const diaDe = (momento: Date) => momento.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const diaData = (d: Date) => d.toISOString().slice(0, 10);
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

const MOVIMENTADO = "O equipamento foi movimentado por outra pessoa enquanto você preenchia. Revise e tente de novo.";

/* Elegibilidade */

type ItemUso = { id: string; empresaId: string; categoria: string; notebookId: string | null; desvinculadoEm: Date | null; nomeDispositivo: string | null; patrimonio: string | null; modelo?: string };

/**
 * Aluguel vigente que vale para cada equipamento: o próprio ou, no carregador vinculado, o do
 * notebook — desde que o carregador seja da mesma proprietária do notebook alugado.
 */
export async function alugueisQueValem(db: ClienteBanco, itens: Pick<ItemUso, "id" | "empresaId" | "notebookId" | "desvinculadoEm">[]) {
  const ids = [...new Set(itens.flatMap((i) => [i.id, ...(i.notebookId && !i.desvinculadoEm ? [i.notebookId] : [])]))];
  const vigentes = ids.length
    ? await db.aluguelEquipamento.findMany({ where: { ativoId: { in: ids }, vigente: true }, include: { empresaLocataria: { select: { id: true, nome: true, sigla: true } } } })
    : [];
  const porAtivo = new Map(vigentes.map((v) => [v.ativoId, v]));
  const resultado = new Map<string, (typeof vigentes)[number] & { herdado: boolean }>();
  for (const i of itens) {
    const proprio = porAtivo.get(i.id);
    if (proprio) {
      resultado.set(i.id, { ...proprio, herdado: false });
      continue;
    }
    const doNotebook = i.notebookId && !i.desvinculadoEm ? porAtivo.get(i.notebookId) : undefined;
    if (doNotebook && doNotebook.empresaProprietariaId === i.empresaId) resultado.set(i.id, { ...doNotebook, herdado: true });
  }
  return resultado;
}

/**
 * Bloqueia o uso por colaborador de empresa sem direito ao equipamento. `dia` é a data do uso
 * (entrega ou previsão). Chamar com os equipamentos (e notebooks dos carregadores) travados.
 */
export async function exigirEmpresaAutorizada(db: ClienteBanco, itens: ItemUso[], empresaColaboradorId: string, dia: string) {
  const alugueis = await alugueisQueValem(db, itens);
  for (const i of itens) {
    const rotulo = rotuloAtivo(i);
    const aluguel = alugueis.get(i.id);
    if (aluguel) {
      if (aluguel.empresaLocatariaId !== empresaColaboradorId) {
        throw new ErroNegocio(
          i.empresaId === empresaColaboradorId
            ? `${rotulo}: equipamento alugado para ${aluguel.empresaLocataria.nome}. Encerre o aluguel antes de alocá-lo a colaboradores da empresa proprietária.`
            : `${rotulo}: ${MENSAGEM_OUTRA_EMPRESA}`,
        );
      }
      if (diaData(aluguel.inicio) > dia) throw new ErroNegocio(`${rotulo}: o aluguel para ${aluguel.empresaLocataria.nome} começa em ${dataBr(diaData(aluguel.inicio))}.`);
    } else if (i.empresaId !== empresaColaboradorId) {
      throw new ErroNegocio(`${rotulo}: ${MENSAGEM_OUTRA_EMPRESA}`);
    }
  }
}

/** Ids a travar junto: os notebooks dos carregadores vinculados (o aluguel do notebook decide o uso deles). */
export const notebooksDosCarregadores = (itens: Pick<ItemUso, "notebookId" | "desvinculadoEm">[]) =>
  itens.filter((i) => i.notebookId && !i.desvinculadoEm).map((i) => i.notebookId!);

/* Leitura travada */

async function lerTravado(tx: Transacao, ativoId: string) {
  const previa = await tx.ativo.findUnique({ where: { id: ativoId }, select: { carregadores: { where: { desvinculadoEm: null }, select: { id: true } } } });
  if (!previa) throw new ErroNegocio("Equipamento não encontrado.");
  await travarAtivos(tx, [ativoId, ...previa.carregadores.map((c) => c.id)]);
  const abertos = {
    where: { aberto: true },
    include: { alocacao: { select: { id: true, numero: true, estado: true, colaborador: { select: { id: true, nome: true, empresaId: true, empresa: { select: { sigla: true } } } } } } },
  } as const;
  return tx.ativo.findUniqueOrThrow({
    where: { id: ativoId },
    include: {
      empresa: { select: { id: true, nome: true, sigla: true } },
      notebook: { select: { nomeDispositivo: true } },
      carregadores: { where: { desvinculadoEm: null }, include: { itensAlocacao: abertos } },
      itensAlocacao: abertos,
      transferencias: { where: { pendente: true }, take: 1 },
    },
  });
}

type Travado = Awaited<ReturnType<typeof lerTravado>>;

/** O equipamento e os carregadores que seguem o aluguel dele (vinculados, da mesma proprietária). */
const comCarregadores = (a: Travado) => [
  { ativo: a, itens: a.itensAlocacao },
  ...a.carregadores.filter((c) => c.empresaId === a.empresaId).map((c) => ({ ativo: c, itens: c.itensAlocacao })),
];

const descreverAlocacao = (i: Travado["itensAlocacao"][number]) =>
  `${i.alocacao.colaborador.nome} (${i.alocacao.colaborador.empresa.sigla}, ${i.alocacao.numero}${i.alocacao.estado === "RESERVADA" ? ", reserva" : ""})`;

const auditar = (ator: Ator, origem: string, acao: string, alvo: { id: string; descricao: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo: { tipo: "ativo", ...alvo },
  origemPermissao: origem,
  detalhe,
});

/** Conflito de índice único: outro aluguel vigente gravado ao mesmo tempo. */
function conflitoAluguel(erro: unknown) {
  if ((erro as { code?: string })?.code === "P2002") {
    const meta = JSON.stringify((erro as { meta?: unknown }).meta ?? {});
    if (/vigente|aluguel/i.test(meta)) return new ErroNegocio("Outro aluguel acabou de ser registrado para este equipamento. Revise e tente de novo.");
  }
  return traduzirConflito(erro);
}

/* Aluguel */

export type EntradaAluguel = {
  ativoId: string;
  empresaLocatariaId: string;
  /** AAAA-MM-DD. */
  inicio: string;
  /** AAAA-MM-DD; prazo combinado (não encerra o aluguel sozinho). */
  devolucaoPrevista?: string | null;
  motivo: string;
  observacoes?: string | null;
  /** Confirmação explícita da operação. */
  confirmacao: boolean;
  /** Proprietária que o operador viu. Se mudou no caminho, nada é gravado. */
  empresaAtualId: string;
  chaveRequisicao?: string;
};

export async function alugarEquipamento(ator: Ator, e: EntradaAluguel) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirGrupo(ator);
    if (!UUID.test(e.ativoId)) throw new ErroNegocio("Equipamento não encontrado.");
    const chave = e.chaveRequisicao && UUID.test(e.chaveRequisicao) ? e.chaveRequisicao : null;
    if (chave) {
      const ja = await prisma.aluguelEquipamento.findUnique({ where: { chaveRequisicao: chave }, include: { empresaLocataria: { select: { nome: true } } } });
      if (ja) return { id: ja.id, empresa: ja.empresaLocataria.nome, repetido: true };
    }
    if (!UUID.test(e.empresaLocatariaId)) throw new ErroNegocio("Selecione a empresa que vai usar o equipamento.");
    const motivo = textoLivre(e.motivo, 500, "Motivo");
    if (!motivo) throw new ErroNegocio("Informe o motivo do aluguel.");
    const observacoes = textoLivre(e.observacoes, 1000, "Observações");
    const inicio = lerData(e.inicio, "Data de início");
    if (!inicio) throw new ErroNegocio("Informe a data de início.");
    const devolucaoPrevista = lerData(e.devolucaoPrevista, "Devolução prevista");
    if (devolucaoPrevista && devolucaoPrevista < inicio) throw new ErroNegocio("Devolução prevista: não pode ser anterior ao início.");
    if (e.confirmacao !== true) throw new ErroNegocio("Confirme o aluguel entre empresas.");
    const locataria = await prisma.empresa.findUnique({ where: { id: e.empresaLocatariaId }, select: { id: true, nome: true, sigla: true, ativa: true } });
    if (!locataria) throw new ErroNegocio("Selecione a empresa que vai usar o equipamento.");
    if (!locataria.ativa) throw new ErroNegocio("A empresa locatária está inativa.");

    try {
      return await prisma.$transaction(async (tx) => {
        const a = await lerTravado(tx, e.ativoId);
        const rotulo = rotuloAtivo(a);
        if (ehComponente(a.categoria)) throw new ErroNegocio("Componentes internos (RAM, SSD, HD) não são alugados: eles acompanham o notebook.");
        if (a.categoria === "CARREGADOR" && a.notebookId && !a.desvinculadoEm) {
          throw new ErroNegocio(`O carregador acompanha o notebook${a.notebook?.nomeDispositivo ? ` ${a.notebook.nomeDispositivo}` : ""}: registre o aluguel do notebook.`);
        }
        if (a.situacao === "BAIXADO") throw new ErroNegocio("Equipamento baixado não pode ser alugado.");
        if (a.empresaId !== e.empresaAtualId) throw new ErroNegocio(MOVIMENTADO);
        if (locataria.id === a.empresaId) throw new ErroNegocio("Selecione uma empresa diferente da proprietária.");
        const vigente = await tx.aluguelEquipamento.findFirst({ where: { ativoId: a.id, vigente: true }, include: { empresaLocataria: { select: { nome: true } } } });
        if (vigente) throw new ErroNegocio(`${rotulo} já está alugado para ${vigente.empresaLocataria.nome}. Encerre esse aluguel antes de registrar outro.`);
        // Períodos não se sobrepõem: o novo começa no fim do último aluguel ou depois.
        const ultimo = await tx.aluguelEquipamento.findFirst({ where: { ativoId: a.id, vigente: null }, orderBy: { encerradoEm: "desc" }, select: { encerradoEm: true } });
        if (ultimo?.encerradoEm && diaData(inicio) < diaDe(ultimo.encerradoEm)) {
          throw new ErroNegocio(`Data de início: o último aluguel deste equipamento terminou em ${dataBr(diaDe(ultimo.encerradoEm))}.`);
        }
        // Alocação em aberto só é compatível se já for de colaborador da locatária (regulariza o uso).
        for (const { ativo, itens } of comCarregadores(a)) {
          const fora = itens.find((i) => i.alocacao.colaborador.empresaId !== locataria.id);
          if (fora) throw new ErroNegocio(`${rotuloAtivo(ativo)} está com ${descreverAlocacao(fora)}. Registre a devolução ou cancele a reserva antes do aluguel.`);
        }
        if (a.transferencias[0]) throw new ErroNegocio(`Há uma transferência reservada para ${a.transferencias[0].colaboradorDestinoNome}: confirme ou cancele antes do aluguel.`);

        const aluguel = await tx.aluguelEquipamento.create({
          data: {
            ativoId: a.id,
            empresaProprietariaId: a.empresaId,
            empresaLocatariaId: locataria.id,
            inicio,
            devolucaoPrevista,
            motivo,
            observacoes,
            registradoPorContaId: ator.contaId,
            registradoPorNome: ator.nome,
            chaveRequisicao: chave,
          },
        });
        const prazo = devolucaoPrevista ? ` Devolução prevista: ${dataBr(diaData(devolucaoPrevista))}.` : "";
        const texto = `Alugado de ${a.empresa.nome} (${a.empresa.sigla}) para ${locataria.nome} (${locataria.sigla}) a partir de ${dataBr(diaData(inicio))}.${prazo} Motivo: ${motivo}`;
        await registrarMovimentacao(tx, ator, a.id, { tipo: "ALUGUEL_INICIADO", observacao: texto });
        const carregadores = comCarregadores(a).slice(1);
        for (const { ativo } of carregadores) {
          await registrarMovimentacao(tx, ator, ativo.id, { tipo: "ALUGUEL_INICIADO", observacao: `Acompanha o aluguel de ${rotulo} para ${locataria.nome} (${locataria.sigla}).` });
        }
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "ativo.alugar_empresa", { id: a.id, descricao: rotulo }, {
            proprietaria: a.empresa.sigla,
            locataria: locataria.sigla,
            inicio: diaData(inicio),
            devolucaoPrevista: devolucaoPrevista ? diaData(devolucaoPrevista) : null,
            carregadores: carregadores.length,
          }),
        );
        return { id: aluguel.id, empresa: locataria.nome, repetido: false };
      });
    } catch (erro) {
      if (chave) {
        const ja = await prisma.aluguelEquipamento.findUnique({ where: { chaveRequisicao: chave }, include: { empresaLocataria: { select: { nome: true } } } });
        if (ja) return { id: ja.id, empresa: ja.empresaLocataria.nome, repetido: true };
      }
      throw conflitoAluguel(erro);
    }
  });
}

/**
 * Encerramento: exige os equipamentos devolvidos (ou as reservas canceladas) e o motivo. A
 * situação do equipamento não muda (em manutenção, em avaliação ou baixado continuam assim).
 */
export async function encerrarAluguel(ator: Ator, e: { aluguelId: string; motivo: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirGrupo(ator);
    if (!UUID.test(e.aluguelId)) throw new ErroNegocio("Aluguel não encontrado.");
    const motivo = textoLivre(e.motivo, 500, "Motivo");
    if (!motivo) throw new ErroNegocio("Informe o motivo do encerramento.");
    const previa = await prisma.aluguelEquipamento.findUnique({ where: { id: e.aluguelId }, select: { ativoId: true } });
    if (!previa) throw new ErroNegocio("Aluguel não encontrado.");

    return prisma.$transaction(async (tx) => {
      const a = await lerTravado(tx, previa.ativoId);
      const aluguel = await tx.aluguelEquipamento.findUniqueOrThrow({ where: { id: e.aluguelId }, include: { empresaLocataria: { select: { nome: true, sigla: true } } } });
      if (aluguel.vigente !== true) throw new ErroNegocio("Este aluguel já foi encerrado.");
      const rotulo = rotuloAtivo(a);
      // Depois do encerramento, o uso volta a ser só da proprietária: nada pode ficar com outra empresa.
      for (const { ativo, itens } of comCarregadores(a)) {
        const fora = itens.find((i) => i.alocacao.colaborador.empresaId !== a.empresaId);
        if (fora) {
          throw new ErroNegocio(
            `${rotuloAtivo(ativo)} está com ${descreverAlocacao(fora)}. ${fora.alocacao.estado === "RESERVADA" ? "Cancele a reserva" : "Registre a devolução"} antes de encerrar o aluguel.`,
          );
        }
      }
      if (a.transferencias[0]) throw new ErroNegocio(`Há uma transferência reservada para ${a.transferencias[0].colaboradorDestinoNome}: confirme ou cancele antes de encerrar o aluguel.`);
      const agora = new Date();
      await tx.aluguelEquipamento.update({
        where: { id: aluguel.id },
        data: { vigente: null, encerradoEm: agora, encerradoPorContaId: ator.contaId, encerradoPorNome: ator.nome, motivoEncerramento: motivo },
      });
      const texto = `Aluguel para ${aluguel.empresaLocataria.nome} (${aluguel.empresaLocataria.sigla}) encerrado. Motivo: ${motivo}`;
      await registrarMovimentacao(tx, ator, a.id, { tipo: "ALUGUEL_ENCERRADO", observacao: texto, quando: agora });
      const carregadores = comCarregadores(a).slice(1);
      for (const { ativo } of carregadores) {
        await registrarMovimentacao(tx, ator, ativo.id, { tipo: "ALUGUEL_ENCERRADO", observacao: `Encerrado com o aluguel de ${rotulo}.`, quando: agora });
      }
      await registrarAuditoria(
        tx,
        auditar(ator, origem, "ativo.encerrar_aluguel", { id: a.id, descricao: rotulo }, { locataria: aluguel.empresaLocataria.sigla, inicio: diaData(aluguel.inicio), carregadores: carregadores.length }),
      );
      return { empresa: aluguel.empresaLocataria.nome };
    });
  });
}
