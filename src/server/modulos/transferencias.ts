import type { Transferencia } from "@/generated/prisma/client";
import { ehComponente } from "@/lib/componentes";
import { BLOQUEIO_TRANSFERENCIA_COLABORADOR, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type Transacao } from "@/server/db";
import { diaDe, exigirEmpresaAutorizada } from "./alugueis";
import {
  encerrarAlocacaoSemItens,
  encerrarItem,
  lerData,
  lerMomento,
  proximoNumeroAlocacao,
  registrarMovimentacao,
  rotuloAtivo,
  traduzirConflito,
  travarAtivos,
  UUID,
} from "./inventario-base";

/**
 * Transferências do equipamento, com histórico e auditoria:
 * - entre colaboradores (no detalhe da alocação ativa): com a entrega física confirmada, os itens da alocação anterior são
 *   encerrados e a nova alocação ATIVA nasce na mesma transação (o equipamento nunca fica em
 *   duas alocações abertas). Sem a entrega, só uma reserva: a custódia atual continua (Q-27);
 * - entre empresas (na ficha): muda a proprietária. Alocação, responsável e empresa do
 *   colaborador ficam como estão.
 * Carregadores vinculados acompanham o notebook, sem novo C1 nem renumeração. Termos
 * anteriores não são tocados.
 */

const MOVIMENTADO = "O equipamento foi movimentado por outra pessoa enquanto você preenchia. Revise e tente de novo.";

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

const textoLivre = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim();
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t || null;
};

const chaveValida = (v: string | undefined) => (v && UUID.test(v) ? v : null);
const dataBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

const auditar = (ator: Ator, origem: string, acao: string, alvo: { id: string; descricao: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo: { tipo: "ativo", ...alvo },
  origemPermissao: origem,
  detalhe,
});

/* Opções do formulário */

export async function colaboradoresParaTransferencia(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "alocacao.criar");
    exigirGrupo(ator);
    return prisma.colaborador.findMany({
      where: { situacao: { not: "DESLIGADO" } },
      orderBy: { nome: "asc" },
      take: 2000,
      select: { id: true, nome: true, empresa: { select: { id: true, nome: true, sigla: true } } },
    });
  });
}

export type ColaboradorTransferencia = Awaited<ReturnType<typeof colaboradoresParaTransferencia>>[number];

/* Leitura dentro da transação */

/** Equipamento travado (com os carregadores vinculados), o item de alocação em aberto e a pendência. */
async function lerEquipamento(tx: Transacao, ativoId: string) {
  const previa = await tx.ativo.findUnique({ where: { id: ativoId }, select: { carregadores: { where: { desvinculadoEm: null }, select: { id: true } } } });
  if (!previa) throw new ErroNegocio("Equipamento não encontrado.");
  await travarAtivos(tx, [ativoId, ...previa.carregadores.map((c) => c.id)]);
  return tx.ativo.findUniqueOrThrow({
    where: { id: ativoId },
    include: {
      empresa: { select: { id: true, nome: true, sigla: true } },
      notebook: { select: { nomeDispositivo: true } },
      carregadores: { where: { desvinculadoEm: null }, orderBy: { sequenciaCarregador: "asc" }, include: { empresa: { select: { nome: true, sigla: true } } } },
      itensAlocacao: {
        where: { aberto: true },
        include: { alocacao: { include: { colaborador: { select: { id: true, nome: true, empresaId: true, empresa: { select: { sigla: true } } } } } } },
      },
      transferencias: { where: { pendente: true } },
      alugueis: { where: { vigente: true }, include: { empresaLocataria: { select: { nome: true } } } },
    },
  });
}

type EquipamentoTravado = Awaited<ReturnType<typeof lerEquipamento>>;

/** Carregador vinculado segue o notebook: transferir só ele separaria o par. */
function exigirNaoVinculado(a: { categoria: string; notebookId: string | null; desvinculadoEm: Date | null; notebook: { nomeDispositivo: string | null } | null }) {
  if (a.categoria === "CARREGADOR" && a.notebookId && !a.desvinculadoEm) {
    throw new ErroNegocio(`O carregador acompanha o notebook${a.notebook?.nomeDispositivo ? ` ${a.notebook.nomeDispositivo}` : ""}: transfira o notebook.`);
  }
}

type Destino = { id: string; nome: string; empresaId: string };

/**
 * Entrega física ao novo colaborador, na transação do chamador: encerra os itens da alocação
 * anterior (o equipamento e os carregadores entregues com ele) e cria a nova alocação ATIVA.
 */
async function efetivar(tx: Transacao, ator: Ator, a: EquipamentoTravado, destino: Destino, quando: Date, observacao: string | null) {
  const item = a.itensAlocacao[0];
  const origem = item.alocacao;
  const carregadores = await tx.itemAlocacao.findMany({
    where: { aberto: true, alocacaoId: origem.id, ativoId: { in: a.carregadores.map((c) => c.id) } },
    include: { ativo: true },
  });
  const levados = [{ itemId: item.id, ativo: a as { id: string; empresaId: string } }, ...carregadores.map((c) => ({ itemId: c.id, ativo: c.ativo }))];
  // O novo colaborador precisa ser da proprietária ou, com aluguel vigente, da locatária.
  await exigirEmpresaAutorizada(tx, [a, ...carregadores.map((c) => c.ativo)], destino.empresaId, diaDe(quando));
  for (const l of levados) await encerrarItem(tx, ator, l.itemId, "TRANSFERENCIA", quando);
  await encerrarAlocacaoSemItens(tx, origem.id);
  const numero = await proximoNumeroAlocacao(tx);
  const nova = await tx.alocacao.create({
    data: {
      numero,
      // Quem executa a transferência (TI autorizada) responde pela nova alocação.
      responsavelTiContaId: ator.contaId,
      responsavelTiNome: ator.nome,
      criadaPorContaId: ator.contaId,
      colaboradorId: destino.id,
      empresaColaboradorId: destino.empresaId,
      estado: "ATIVA",
      entregueEm: quando,
      entreguePorNome: ator.nome,
      observacoes: observacao,
      criadaPorNome: ator.nome,
      // A empresa proprietária de cada equipamento não muda com a transferência.
      itens: { create: levados.map((l) => ({ ativoId: l.ativo.id, empresaProprietariaId: l.ativo.empresaId })) },
    },
  });
  for (const l of levados) {
    await registrarMovimentacao(tx, ator, l.ativo.id, {
      tipo: "TRANSFERENCIA_COLABORADOR",
      colaborador: destino,
      alocacaoId: nova.id,
      observacao: `De ${origem.colaborador.nome} (${origem.numero}) para ${destino.nome} (${numero})${observacao ? `: ${observacao}` : "."}`,
      quando,
    });
  }
  return { origem: { id: origem.id, numero: origem.numero, colaborador: origem.colaborador }, nova: { id: nova.id, numero }, itens: levados.length };
}

/* Entre colaboradores */

export type EntradaTransferenciaColaborador = {
  ativoId: string;
  colaboradorId: string;
  /** ENTREGAR: entrega física agora (a custódia muda). RESERVAR: entrega futura (a custódia atual continua). */
  modo: "ENTREGAR" | "RESERVAR";
  /** ENTREGAR: data e hora da entrega física (ISO, não futura). RESERVAR: data prevista (AAAA-MM-DD). */
  data?: string | null;
  observacoes?: string | null;
  /** Devolução por quem está com o equipamento e entrega ao novo colaborador, confirmadas. */
  confirmacaoFisica?: boolean;
  /** Alocação que o operador viu (nula: em estoque). Se mudou no caminho, nada é gravado. */
  alocacaoAtualId: string | null;
  chaveRequisicao?: string;
};

export type ResultadoTransferenciaColaborador = {
  /** CONCLUIDA: custódia transferida. RESERVADA: transferência pendente. ALOCADO/RESERVADO: saída do estoque. */
  resultado: "CONCLUIDA" | "RESERVADA" | "ALOCADO" | "RESERVADO";
  colaborador: string;
  numero: string | null;
  repetido: boolean;
};

async function repeticao(chave: string | null): Promise<ResultadoTransferenciaColaborador | null> {
  if (!chave) return null;
  const t = await prisma.transferencia.findUnique({ where: { chaveRequisicao: chave } });
  if (!t) return null;
  const nova = t.alocacaoDestinoId ? await prisma.alocacao.findUnique({ where: { id: t.alocacaoDestinoId }, select: { numero: true } }) : null;
  return { resultado: t.estado === "PENDENTE" ? "RESERVADA" : "CONCLUIDA", colaborador: t.colaboradorDestinoNome ?? "", numero: nova?.numero ?? null, repetido: true };
}

export async function transferirColaborador(ator: Ator, e: EntradaTransferenciaColaborador): Promise<ResultadoTransferenciaColaborador> {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.criar");
    exigirGrupo(ator);
    const entregar = e.modo === "ENTREGAR";
    if (!entregar && e.modo !== "RESERVAR") throw new ErroNegocio("Escolha entre a entrega física agora ou a reserva.");
    if (entregar) exigirPermissao(ator, "alocacao.confirmar_entrega");
    // Encerrar a custódia de outra pessoa equivale a registrar a devolução dela.
    if (entregar && e.alocacaoAtualId) exigirPermissao(ator, "devolucao.registrar");
    if (!UUID.test(e.ativoId)) throw new ErroNegocio("Equipamento não encontrado.");
    if (e.alocacaoAtualId !== null && !UUID.test(e.alocacaoAtualId)) throw new ErroNegocio(MOVIMENTADO);
    const chave = chaveValida(e.chaveRequisicao);
    const ja = await repeticao(chave);
    if (ja) return ja;

    if (!UUID.test(e.colaboradorId)) throw new ErroNegocio("Selecione o novo colaborador.");
    const colaborador = await prisma.colaborador.findUnique({ where: { id: e.colaboradorId }, select: { id: true, nome: true, situacao: true, empresaId: true } });
    if (!colaborador) throw new ErroNegocio("Selecione o novo colaborador.");
    if (colaborador.situacao === "DESLIGADO") throw new ErroNegocio("Colaborador desligado não recebe equipamentos.");
    const observacoes = textoLivre(e.observacoes, 1000, "Observação");

    // A transferência parte sempre de uma alocação ativa (detalhe da alocação). Em estoque, a
    // entrega é uma nova alocação.
    if (e.alocacaoAtualId === null) {
      throw new ErroNegocio("A transferência entre colaboradores é feita a partir de uma alocação ativa. Para equipamento em estoque, registre uma nova alocação.");
    }

    if (entregar && !e.confirmacaoFisica) throw new ErroNegocio("Confirme a devolução e a entrega física do equipamento.");
    const quando = entregar ? lerMomento(e.data, "Data da transferência") : new Date();
    const previstaPara = entregar ? null : lerData(e.data, "Data prevista");
    if (previstaPara && previstaPara.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      throw new ErroNegocio("Data prevista: não pode estar no passado.");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Trava o equipamento e só então confere: duas transferências simultâneas não passam.
        const a = await lerEquipamento(tx, e.ativoId);
        exigirNaoVinculado(a);
        if (ehComponente(a.categoria)) throw new ErroNegocio("Componentes internos (RAM, SSD, HD) não são alocados a pessoas: instale-os no notebook.");
        const bloqueio = BLOQUEIO_TRANSFERENCIA_COLABORADOR[a.situacao as Situacao];
        if (bloqueio) throw new ErroNegocio(bloqueio);
        const item = a.itensAlocacao[0];
        if (!item || item.alocacaoId !== e.alocacaoAtualId || item.alocacao.estado !== "ATIVA") throw new ErroNegocio(MOVIMENTADO);
        const atual = item.alocacao.colaborador;
        if (atual.id === colaborador.id) throw new ErroNegocio("Selecione um colaborador diferente do atual.");
        const pendente = a.transferencias[0];
        if (pendente) {
          throw new ErroNegocio(`Já existe uma transferência reservada para ${pendente.colaboradorDestinoNome}. Confirme ou cancele antes de registrar outra.`);
        }
        const base = {
          ativoId: a.id,
          tipo: "COLABORADOR" as const,
          colaboradorOrigemId: atual.id,
          colaboradorOrigemNome: atual.nome,
          colaboradorDestinoId: colaborador.id,
          colaboradorDestinoNome: colaborador.nome,
          alocacaoOrigemId: item.alocacaoId,
          motivo: observacoes,
          realizadaPorContaId: ator.contaId,
          realizadaPorNome: ator.nome,
          chaveRequisicao: chave,
        };
        const rotulo = rotuloAtivo(a);

        if (!entregar) {
          await exigirEmpresaAutorizada(tx, [a], colaborador.empresaId, previstaPara ? previstaPara.toISOString().slice(0, 10) : diaDe(new Date()));
          await tx.transferencia.create({ data: { ...base, estado: "PENDENTE", previstaPara } });
          await registrarMovimentacao(tx, ator, a.id, {
            tipo: "RESERVA",
            colaborador,
            alocacaoId: item.alocacaoId,
            observacao: `Transferência de ${atual.nome} para ${colaborador.nome} reservada${previstaPara ? ` para ${dataBr(previstaPara)}` : ""}. A custódia continua com ${atual.nome} até a entrega física.`,
          });
          await registrarAuditoria(
            tx,
            auditar(ator, origem, "ativo.transferir_colaborador", { id: a.id, descricao: rotulo }, { modo: "RESERVAR", alocacaoOrigem: item.alocacao.numero }),
          );
          return { resultado: "RESERVADA" as const, colaborador: colaborador.nome, numero: null, repetido: false };
        }

        const r = await efetivar(tx, ator, a, colaborador, quando, observacoes);
        await tx.transferencia.create({
          data: { ...base, estado: "CONCLUIDA", pendente: null, alocacaoDestinoId: r.nova.id, efetivadaEm: quando, concluidaPorNome: ator.nome },
        });
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "ativo.transferir_colaborador", { id: a.id, descricao: rotulo }, {
            modo: "ENTREGAR",
            alocacaoOrigem: r.origem.numero,
            alocacaoDestino: r.nova.numero,
            equipamentos: r.itens,
          }),
        );
        return { resultado: "CONCLUIDA" as const, colaborador: colaborador.nome, numero: r.nova.numero, repetido: false };
      });
    } catch (erro) {
      // Envio repetido em paralelo: o outro pedido já gravou.
      const repetido = await repeticao(chave);
      if (repetido) return repetido;
      throw traduzirConflito(erro);
    }
  });
}

/** Transferência reservada → entrega física: a partir daqui o novo colaborador é responsável. */
export async function confirmarTransferencia(ator: Ator, e: { transferenciaId: string; data?: string | null; confirmacaoFisica?: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.confirmar_entrega");
    exigirPermissao(ator, "devolucao.registrar");
    exigirGrupo(ator);
    if (!UUID.test(e.transferenciaId)) throw new ErroNegocio("Transferência não encontrada.");
    if (!e.confirmacaoFisica) throw new ErroNegocio("Confirme a devolução e a entrega física do equipamento.");
    const quando = lerMomento(e.data, "Data da transferência");
    const previa = await prisma.transferencia.findUnique({ where: { id: e.transferenciaId }, select: { ativoId: true } });
    if (!previa) throw new ErroNegocio("Transferência não encontrada.");

    try {
      return await prisma.$transaction(async (tx) => {
        const a = await lerEquipamento(tx, previa.ativoId);
        const t = await tx.transferencia.findUniqueOrThrow({ where: { id: e.transferenciaId } });
        if (t.estado !== "PENDENTE") throw new ErroNegocio(t.estado === "CONCLUIDA" ? "Esta transferência já foi concluída." : "Esta transferência foi cancelada.");
        const item = a.itensAlocacao[0];
        if (!item || item.alocacaoId !== t.alocacaoOrigemId || item.alocacao.estado !== "ATIVA") {
          throw new ErroNegocio("A custódia do equipamento mudou desde a reserva. Cancele a transferência e registre de novo.");
        }
        const destino = await tx.colaborador.findUnique({ where: { id: t.colaboradorDestinoId! }, select: { id: true, nome: true, situacao: true, empresaId: true } });
        if (!destino || destino.situacao === "DESLIGADO") throw new ErroNegocio("O colaborador de destino foi desligado. Cancele a transferência.");
        const r = await efetivar(tx, ator, a, destino, quando, t.motivo);
        await tx.transferencia.update({
          where: { id: t.id },
          data: { estado: "CONCLUIDA", pendente: null, alocacaoDestinoId: r.nova.id, efetivadaEm: quando, concluidaPorNome: ator.nome },
        });
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "ativo.transferir_colaborador", { id: a.id, descricao: rotuloAtivo(a) }, {
            modo: "CONFIRMAR_RESERVA",
            alocacaoOrigem: r.origem.numero,
            alocacaoDestino: r.nova.numero,
            equipamentos: r.itens,
          }),
        );
        return { colaborador: destino.nome, numero: r.nova.numero };
      });
    } catch (erro) {
      throw traduzirConflito(erro);
    }
  });
}

export async function cancelarTransferencia(ator: Ator, e: { transferenciaId: string; motivo: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.cancelar");
    exigirGrupo(ator);
    if (!UUID.test(e.transferenciaId)) throw new ErroNegocio("Transferência não encontrada.");
    const motivo = textoLivre(e.motivo, 500, "Motivo");
    if (!motivo) throw new ErroNegocio("Informe o motivo do cancelamento.");
    const previa = await prisma.transferencia.findUnique({ where: { id: e.transferenciaId }, select: { ativoId: true } });
    if (!previa) throw new ErroNegocio("Transferência não encontrada.");
    return prisma.$transaction(async (tx) => {
      const a = await lerEquipamento(tx, previa.ativoId);
      const t = await tx.transferencia.findUniqueOrThrow({ where: { id: e.transferenciaId } });
      if (t.estado !== "PENDENTE") throw new ErroNegocio(t.estado === "CONCLUIDA" ? "Esta transferência já foi concluída." : "Esta transferência já foi cancelada.");
      const agora = new Date();
      await tx.transferencia.update({
        where: { id: t.id },
        data: { estado: "CANCELADA", pendente: null, canceladaEm: agora, canceladaPorNome: ator.nome, motivoCancelamento: motivo },
      });
      await registrarMovimentacao(tx, ator, a.id, {
        tipo: "CANCELAMENTO_RESERVA",
        colaborador: { id: t.colaboradorDestinoId!, nome: t.colaboradorDestinoNome! },
        alocacaoId: t.alocacaoOrigemId ?? undefined,
        observacao: `Transferência para ${t.colaboradorDestinoNome} cancelada: ${motivo}`,
        quando: agora,
      });
      await registrarAuditoria(tx, auditar(ator, origem, "ativo.cancelar_transferencia", { id: a.id, descricao: rotuloAtivo(a) }, { colaboradorDestino: t.colaboradorDestinoNome }));
      return { colaborador: t.colaboradorDestinoNome };
    });
  });
}

/* Entre empresas */

export type EntradaTransferenciaEmpresa = {
  ativoId: string;
  empresaDestinoId: string;
  motivo: string;
  /** Data e hora da transferência (ISO, não futura). */
  data?: string | null;
  /** Confirmação explícita da operação. */
  confirmacao: boolean;
  /** Empresa que o operador viu. Se mudou no caminho, nada é gravado. */
  empresaAtualId: string;
  /** Carregadores vinculados com patrimônio próprio que também mudam; sem patrimônio, acompanham o notebook. */
  carregadoresComPatrimonio?: string[];
  chaveRequisicao?: string;
};

const resumoEmpresa = (t: Pick<Transferencia, "empresaOrigemNome" | "empresaDestinoNome">) => ({ de: t.empresaOrigemNome!, para: t.empresaDestinoNome! });

export async function transferirEmpresa(ator: Ator, e: EntradaTransferenciaEmpresa) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirGrupo(ator);
    if (!UUID.test(e.ativoId)) throw new ErroNegocio("Equipamento não encontrado.");
    const chave = chaveValida(e.chaveRequisicao);
    if (chave) {
      const ja = await prisma.transferencia.findUnique({ where: { chaveRequisicao: chave } });
      if (ja) return { ...resumoEmpresa(ja), repetido: true };
    }
    if (!UUID.test(e.empresaDestinoId)) throw new ErroNegocio("Selecione a empresa de destino.");
    const motivo = textoLivre(e.motivo, 500, "Motivo");
    if (!motivo) throw new ErroNegocio("Informe o motivo da transferência.");
    if (e.confirmacao !== true) throw new ErroNegocio("Confirme a transferência entre empresas.");
    const quando = lerMomento(e.data, "Data da transferência");
    const destino = await prisma.empresa.findUnique({ where: { id: e.empresaDestinoId }, select: { id: true, nome: true, sigla: true, ativa: true } });
    if (!destino) throw new ErroNegocio("Selecione a empresa de destino.");
    if (!destino.ativa) throw new ErroNegocio("A empresa de destino está inativa.");
    const escolhidos = new Set(e.carregadoresComPatrimonio ?? []);

    try {
      return await prisma.$transaction(async (tx) => {
        const a = await lerEquipamento(tx, e.ativoId);
        exigirNaoVinculado(a);
        if (a.situacao === "BAIXADO") throw new ErroNegocio("Equipamento baixado não pode ser transferido.");
        if (a.empresaId !== e.empresaAtualId) throw new ErroNegocio(MOVIMENTADO);
        if (a.empresaId === destino.id) throw new ErroNegocio("Selecione uma empresa diferente da atual.");
        for (const id of escolhidos) {
          if (!a.carregadores.some((c) => c.id === id && c.patrimonio)) throw new ErroNegocio("Um dos carregadores escolhidos não está vinculado a este notebook.");
        }
        // Sem patrimônio próprio, o carregador acompanha o notebook (regra do cadastro); com
        // patrimônio, só muda se escolhido — nunca em silêncio.
        const movidos = a.carregadores.filter((c) => (!c.patrimonio || escolhidos.has(c.id)) && c.empresaId !== destino.id);
        const mantidos = a.carregadores.filter((c) => c.patrimonio && !escolhidos.has(c.id));
        // A propriedade não muda durante um aluguel (o banco também recusa).
        if (a.alugueis[0]) throw new ErroNegocio(`${rotuloAtivo(a)} está alugado para ${a.alugueis[0].empresaLocataria.nome}. Encerre o aluguel antes de transferir a propriedade.`);
        // Quem está com o equipamento (ou com a reserva) precisa ser da empresa de destino: a
        // alocação nunca é encerrada em silêncio — a TI regulariza antes.
        const abertos = [
          ...a.itensAlocacao.map((i) => ({ rotulo: rotuloAtivo(a), alocacao: i.alocacao })),
          ...(
            await tx.itemAlocacao.findMany({
              where: { aberto: true, ativoId: { in: movidos.map((c) => c.id) } },
              include: { ativo: true, alocacao: { include: { colaborador: { select: { id: true, nome: true, empresaId: true, empresa: { select: { sigla: true } } } } } } },
            })
          ).map((i) => ({ rotulo: rotuloAtivo(i.ativo), alocacao: i.alocacao })),
        ];
        const fora = abertos.find((x) => x.alocacao.colaborador.empresaId !== destino.id);
        if (fora) {
          throw new ErroNegocio(
            `${fora.rotulo} está com ${fora.alocacao.colaborador.nome} (${fora.alocacao.colaborador.empresa.sigla}, ${fora.alocacao.numero}). A propriedade só pode passar para a empresa do colaborador; para outra empresa, registre a devolução ou cancele a reserva antes.`,
          );
        }
        const pendente = a.transferencias[0];
        if (pendente?.colaboradorDestinoId) {
          const alvo = await tx.colaborador.findUnique({ where: { id: pendente.colaboradorDestinoId }, select: { empresaId: true } });
          if (alvo?.empresaId !== destino.id) throw new ErroNegocio(`Há uma transferência reservada para ${pendente.colaboradorDestinoNome}, de outra empresa: confirme ou cancele antes.`);
        }
        const de = `${a.empresa.nome} (${a.empresa.sigla})`;
        const para = `${destino.nome} (${destino.sigla})`;
        const nomes = (cs: typeof a.carregadores) => cs.map((c) => (c.patrimonio ? `${c.nomeDispositivo} (${c.patrimonio})` : c.nomeDispositivo)).join(", ");

        await tx.ativo.update({ where: { id: a.id }, data: { empresaId: destino.id } });
        await registrarMovimentacao(tx, ator, a.id, {
          tipo: "TRANSFERENCIA_EMPRESA",
          observacao: [
            `De ${de} para ${para}. Motivo: ${motivo}`,
            movidos.length ? `Carregadores transferidos com o notebook: ${nomes(movidos)}.` : null,
            mantidos.length ? `Carregadores com patrimônio próprio mantidos na empresa atual: ${nomes(mantidos)}.` : null,
          ]
            .filter(Boolean)
            .join(" "),
          quando,
        });
        for (const c of movidos) {
          await tx.ativo.update({ where: { id: c.id }, data: { empresaId: destino.id } });
          await registrarMovimentacao(tx, ator, c.id, {
            tipo: "TRANSFERENCIA_EMPRESA",
            observacao: `De ${c.empresa.nome} (${c.empresa.sigla}) para ${para}, com o notebook ${a.nomeDispositivo}. Motivo: ${motivo}`,
            quando,
          });
        }
        const t = await tx.transferencia.create({
          data: {
            ativoId: a.id,
            tipo: "EMPRESA",
            estado: "CONCLUIDA",
            pendente: null,
            empresaOrigemId: a.empresa.id,
            empresaOrigemNome: a.empresa.nome,
            empresaDestinoId: destino.id,
            empresaDestinoNome: destino.nome,
            motivo,
            efetivadaEm: quando,
            realizadaPorContaId: ator.contaId,
            realizadaPorNome: ator.nome,
            concluidaPorNome: ator.nome,
            chaveRequisicao: chave,
          },
        });
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "ativo.transferir_empresa", { id: a.id, descricao: rotuloAtivo(a) }, {
            de: a.empresa.sigla,
            para: destino.sigla,
            carregadoresTransferidos: movidos.length,
            carregadoresMantidos: mantidos.length,
            alocado: a.situacao === "ALOCADO",
          }),
        );
        return { ...resumoEmpresa(t), repetido: false };
      });
    } catch (erro) {
      if (chave) {
        const ja = await prisma.transferencia.findUnique({ where: { chaveRequisicao: chave } });
        if (ja) return { ...resumoEmpresa(ja), repetido: true };
      }
      throw traduzirConflito(erro);
    }
  });
}
