import type { Ativo, TipoIntervencao } from "@/generated/prisma/client";
import {
  CAPACIDADE_MAXIMA,
  COMPONENTES,
  compativeis,
  descreverPeca,
  ehComponente,
  FORMATOS,
  INTERFACES,
  pecasDaConfiguracao,
  resumirConfiguracao,
  ROTULO_COMPONENTE,
  TECNOLOGIAS_RAM,
  type ConfiguracaoOriginal,
  type EspecPeca,
  type TipoArmazenamento,
  type TipoComponente,
} from "@/lib/componentes";
import { DESTINOS_REMOCAO, FORMATO_IDENTIFICADOR, normalizarIdentificador, ROTULO_DESTINO_REMOCAO, ROTULO_SITUACAO, type DestinoRemocao, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type ClienteBanco, type Transacao } from "@/server/db";
import {
  lerMomento,
  marcaCanonica,
  mudarSituacao,
  proximoIdentificadorComponente,
  registrarMovimentacao,
  traduzirConflito,
  travarAtivos,
  UUID,
} from "./inventario-base";

/**
 * Componentes internos dos notebooks (memória RAM, SSD e HD).
 * - O cadastro do notebook guarda só a configuração original: nenhuma peça física é criada.
 * - Peças físicas (RAM001, SSD001, HDD001...) são cadastradas no estoque quando a TI precisa
 *   controlá-las e são instaladas em notebooks — nunca alocadas a pessoas.
 * - Instalação, remoção e substituição são intervenções: uma transação, com a configuração
 *   anterior e a resultante, data, operador, motivo e o destino da peça removida. A ficha
 *   técnica do notebook passa a refletir as peças vigentes, sem somar a original com a que a
 *   substituiu.
 */

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

const textoLivre = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t || null;
};

const opcao = (v: string | null | undefined, opcoes: readonly string[], rotulo: string) => {
  const t = (v ?? "").trim();
  if (!t) return null;
  const achada = opcoes.find((o) => o.toLowerCase() === t.toLowerCase());
  if (!achada) throw new ErroNegocio(`${rotulo}: escolha uma das opções.`);
  return achada;
};

const inteiro = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/* Peça física */

export type DadosComponente = {
  categoria: string;
  capacidadeGb: number | string;
  tecnologia?: string | null;
  interfaceConexao?: string | null;
  formato?: string | null;
  frequenciaMhz?: number | string | null;
  marca: string;
  modelo: string;
  numeroSerie?: string | null;
  observacoes?: string | null;
};

/** Especificação e fabricante do componente, validados como no restante do inventário. */
export async function validarComponente(db: ClienteBanco, d: DadosComponente) {
  const tipo = COMPONENTES.find((c) => c === d.categoria);
  if (!tipo) throw new ErroNegocio("Selecione o tipo do componente.");
  const capacidadeGb = inteiro(d.capacidadeGb);
  if (!Number.isInteger(capacidadeGb) || capacidadeGb <= 0 || capacidadeGb > CAPACIDADE_MAXIMA[tipo]) throw new ErroNegocio("Informe a capacidade.");
  const memoria = tipo === "MEMORIA_RAM";
  const frequencia = memoria && d.frequenciaMhz !== null && d.frequenciaMhz !== undefined && String(d.frequenciaMhz).trim() ? inteiro(d.frequenciaMhz) : null;
  if (frequencia !== null && (!Number.isInteger(frequencia) || frequencia < 100 || frequencia > 20000)) throw new ErroNegocio("Frequência: informe em MHz (ex.: 3200).");
  const marca = textoLivre(d.marca, 60, "Marca");
  const modelo = textoLivre(d.modelo, 80, "Modelo");
  if (!marca) throw new ErroNegocio("Informe a marca.");
  if (!modelo) throw new ErroNegocio("Informe o modelo.");
  const serie = normalizarIdentificador(d.numeroSerie);
  if (serie && !FORMATO_IDENTIFICADOR.test(serie)) throw new ErroNegocio("Número de série: use letras sem acento, números, hífen, ponto ou barra (até 40).");
  return {
    tipo,
    dados: {
      categoria: tipo,
      capacidadeGb,
      tecnologia: memoria ? opcao(d.tecnologia, TECNOLOGIAS_RAM, "Tecnologia") : null,
      interfaceConexao: memoria ? null : opcao(d.interfaceConexao, INTERFACES[tipo], "Interface"),
      formato: opcao(d.formato, FORMATOS[tipo], "Formato"),
      frequenciaMhz: frequencia,
      marca: await marcaCanonica(db, marca),
      modelo,
      numeroSerie: serie || null,
      observacoes: textoLivre(d.observacoes, 1000, "Observações"),
    },
  };
}

export type ComponenteValidado = Awaited<ReturnType<typeof validarComponente>>;

/**
 * Cadastra a peça no estoque (disponível) com o próximo identificador da sequência. Um nome
 * já usado por outro cadastro é pulado, nunca reaproveitado.
 */
export async function criarComponente(
  tx: Transacao,
  ator: Ator,
  c: ComponenteValidado,
  empresaId: string,
  observacao: string,
  extra: { quando?: Date; chaveRequisicao?: string | null } = {},
) {
  let nome = await proximoIdentificadorComponente(tx, c.tipo);
  for (let i = 0; i < 20 && (await tx.ativo.findUnique({ where: { nomeDispositivo: nome }, select: { id: true } })); i++) {
    nome = await proximoIdentificadorComponente(tx, c.tipo);
  }
  const componente = await tx.ativo.create({
    data: { ...c.dados, nomeDispositivo: nome, patrimonio: null, empresaId, criadoPorNome: ator.nome, chaveRequisicao: extra.chaveRequisicao ?? null },
  });
  await registrarMovimentacao(tx, ator, componente.id, { tipo: "CADASTRO", situacaoNova: "DISPONIVEL", observacao, quando: extra.quando });
  return componente;
}

const especDoAtivo = (a: Pick<Ativo, "categoria" | "capacidadeGb" | "tecnologia" | "interfaceConexao" | "formato">): EspecPeca => ({
  tipo: a.categoria as TipoComponente,
  capacidadeGb: a.capacidadeGb!,
  tecnologia: a.tecnologia,
  interfaceConexao: a.interfaceConexao,
  formato: a.formato,
});

/* Configuração do notebook */

const espec = (p: { tipo: TipoComponente; capacidadeGb: number; tecnologia: string | null; interfaceConexao: string | null; formato: string | null }): EspecPeca => ({
  tipo: p.tipo,
  capacidadeGb: p.capacidadeGb,
  tecnologia: p.tecnologia,
  interfaceConexao: p.interfaceConexao,
  formato: p.formato,
});

async function pecasVigentes(db: ClienteBanco, notebookId: string) {
  return db.pecaConfiguracao.findMany({
    where: { equipamentoId: notebookId, vigente: true },
    orderBy: [{ tipo: "asc" }, { instaladaEm: "asc" }],
    include: { componente: { select: { id: true, nomeDispositivo: true } } },
  });
}

/** Texto antigo da ficha (antes da configuração estruturada). */
const textoLegado = (a: { memoriaRam: string | null; armazenamento: string | null }) =>
  [a.memoriaRam ? `RAM ${a.memoriaRam}` : null, a.armazenamento].filter(Boolean).join(" · ") || null;

/** Ficha técnica (memória e armazenamento) sempre igual às peças vigentes. */
async function sincronizarFicha(tx: Transacao, notebookId: string, pecas: EspecPeca[]) {
  const r = resumirConfiguracao(pecas);
  await tx.ativo.update({ where: { id: notebookId }, data: { memoriaRam: r.memoria, armazenamento: r.armazenamento } });
  return r;
}

/** Configuração original informada no formulário: vazia → nula (nada a gravar). */
export function validarConfiguracao(c: unknown): ConfiguracaoOriginal | null {
  if (!c || typeof c !== "object") return null;
  const entrada = c as { memoria?: { capacidadeGb?: unknown; tecnologia?: string | null } | null; armazenamento?: unknown };
  let memoria: ConfiguracaoOriginal["memoria"] = null;
  if (entrada.memoria && String(entrada.memoria.capacidadeGb ?? "").trim()) {
    const gb = inteiro(entrada.memoria.capacidadeGb);
    if (!Number.isInteger(gb) || gb <= 0 || gb > CAPACIDADE_MAXIMA.MEMORIA_RAM) throw new ErroNegocio("Memória RAM: informe a capacidade total.");
    memoria = { capacidadeGb: gb, tecnologia: opcao(entrada.memoria.tecnologia, TECNOLOGIAS_RAM, "Tecnologia da memória") };
  }
  const lista = Array.isArray(entrada.armazenamento) ? entrada.armazenamento : [];
  if (lista.length > 4) throw new ErroNegocio("Armazenamento: informe no máximo 4 dispositivos.");
  const armazenamento = lista.map((a: { tipo?: string; capacidadeGb?: unknown; interfaceConexao?: string | null }) => {
    const tipo: TipoArmazenamento | null = a?.tipo === "SSD" || a?.tipo === "HD" ? a.tipo : null;
    if (!tipo) throw new ErroNegocio("Armazenamento: escolha SSD ou HD.");
    const gb = inteiro(a.capacidadeGb);
    if (!Number.isInteger(gb) || gb <= 0 || gb > CAPACIDADE_MAXIMA[tipo]) throw new ErroNegocio(`Armazenamento: informe a capacidade do ${tipo}.`);
    return { tipo, capacidadeGb: gb, interfaceConexao: opcao(a.interfaceConexao, INTERFACES[tipo], `Interface do ${tipo}`) };
  });
  return memoria || armazenamento.length ? { memoria, armazenamento } : null;
}

const assinatura = (pecas: EspecPeca[]) =>
  pecas
    .map((p) => [p.tipo, p.capacidadeGb, p.tecnologia ?? "", p.interfaceConexao ?? ""].join("|"))
    .sort()
    .join(";");

/**
 * Grava a configuração original do notebook (cadastro ou correção antes de qualquer
 * intervenção). Só especificação: nenhuma peça física é criada. Corrigir encerra as linhas
 * anteriores — o histórico permanece.
 */
export async function aplicarConfiguracaoOriginal(
  tx: Transacao,
  ator: Ator,
  notebook: { id: string; memoriaRam: string | null; armazenamento: string | null },
  config: ConfiguracaoOriginal,
  quando = new Date(),
) {
  const atuais = await pecasVigentes(tx, notebook.id);
  const novas = pecasDaConfiguracao(config);
  if (assinatura(atuais.map(espec)) === assinatura(novas)) return null;
  const intervencoes = await tx.intervencaoConfiguracao.count({ where: { equipamentoId: notebook.id, tipo: { not: "CONFIGURACAO_ORIGINAL" } } });
  if (intervencoes) throw new ErroNegocio("A configuração já foi alterada por intervenções: use Componentes internos, na ficha do notebook.");
  const anterior = atuais.length ? resumirConfiguracao(atuais.map(espec)).texto : textoLegado(notebook);
  const resultante = resumirConfiguracao(novas).texto;
  const intervencao = await tx.intervencaoConfiguracao.create({
    data: {
      equipamentoId: notebook.id,
      tipo: "CONFIGURACAO_ORIGINAL",
      motivo: anterior ? "Correção da configuração original." : null,
      configuracaoAnterior: anterior,
      configuracaoResultante: resultante,
      realizadaEm: quando,
      realizadaPorContaId: ator.contaId,
      realizadaPorNome: ator.nome,
    },
  });
  for (const p of atuais) {
    await tx.pecaConfiguracao.update({
      where: { id: p.id },
      data: { vigente: null, removidaEm: quando, removidaPorNome: ator.nome, removidaNaId: intervencao.id, motivoRemocao: "Correção da configuração original." },
    });
  }
  for (const p of novas) {
    await tx.pecaConfiguracao.create({
      data: {
        equipamentoId: notebook.id,
        tipo: p.tipo,
        original: true,
        capacidadeGb: p.capacidadeGb,
        tecnologia: p.tecnologia ?? null,
        interfaceConexao: p.interfaceConexao ?? null,
        instaladaEm: quando,
        instaladaPorNome: ator.nome,
        instaladaNaId: intervencao.id,
      },
    });
  }
  await sincronizarFicha(tx, notebook.id, novas);
  // Texto sem setas e afins: o banco grava em WIN1252.
  await registrarMovimentacao(tx, ator, notebook.id, { tipo: "CONFIGURACAO_ORIGINAL", observacao: anterior ? `Antes: ${anterior}. Agora: ${resultante}.` : resultante, quando });
  return intervencao;
}

/** Configuração original informada (ou corrigida) depois do cadastro, antes de qualquer intervenção. */
export async function definirConfiguracaoOriginal(ator: Ator, entrada: { notebookId: string; configuracao: unknown }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirGrupo(ator);
    if (!UUID.test(entrada.notebookId)) throw new ErroNegocio("Notebook não encontrado.");
    const config = validarConfiguracao(entrada.configuracao);
    if (!config) throw new ErroNegocio("Informe a memória RAM ou o armazenamento.");
    return prisma.$transaction(async (tx) => {
      await travarAtivos(tx, [entrada.notebookId]);
      const nb = await tx.ativo.findUnique({ where: { id: entrada.notebookId } });
      if (!nb || nb.categoria !== "NOTEBOOK") throw new ErroNegocio("Notebook não encontrado.");
      const intervencao = await aplicarConfiguracaoOriginal(tx, ator, nb, config);
      if (intervencao) {
        await registrarAuditoria(tx, {
          acao: "ativo.configuracao_original",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: nb.id, descricao: nb.nomeDispositivo ?? nb.id },
          origemPermissao: origem,
          detalhe: { anterior: intervencao.configuracaoAnterior, resultante: intervencao.configuracaoResultante },
        });
      }
      return { alterada: Boolean(intervencao) };
    });
  });
}

/* Intervenções: instalação, remoção e substituição */

export type EntradaIntervencao = {
  notebookId: string;
  /** Peça vigente a remover (remoção e substituição). */
  pecaId?: string | null;
  /** Componente do estoque a instalar... */
  componenteId?: string | null;
  /** ...ou um novo, cadastrado na própria operação (identificador automático). */
  novoComponente?: DadosComponente | null;
  /** Destino da peça removida: obrigatório para peça identificada (ou registrada agora no estoque). */
  destino?: string | null;
  /** Peça original (sem identificação) que entra no estoque ao ser removida: cadastro individual nesse momento. */
  registrarRemovida?: Omit<DadosComponente, "categoria" | "capacidadeGb"> & { capacidadeGb?: number | string | null } | null;
  motivo?: string | null;
  /** Data e hora da intervenção (ISO, não futura). */
  data?: string | null;
  /** Notebook alocado: confirmação de que está disponível para a intervenção técnica. */
  confirmacaoIntervencao?: boolean;
  chaveRequisicao?: string;
};

export type ResultadoIntervencao = { anterior: string | null; resultante: string; instalado: string | null; registrado: string | null; repetido: boolean };

const MOVIMENTO: Record<Exclude<TipoIntervencao, "CONFIGURACAO_ORIGINAL">, "COMPONENTE_INSTALADO" | "COMPONENTE_REMOVIDO" | "COMPONENTE_SUBSTITUIDO"> = {
  INSTALACAO: "COMPONENTE_INSTALADO",
  REMOCAO: "COMPONENTE_REMOVIDO",
  SUBSTITUICAO: "COMPONENTE_SUBSTITUIDO",
};

async function repeticao(chave: string | null): Promise<ResultadoIntervencao | null> {
  if (!chave) return null;
  const i = await prisma.intervencaoConfiguracao.findUnique({
    where: { chaveRequisicao: chave },
    include: { pecasInstaladas: { include: { componente: { select: { nomeDispositivo: true } } } } },
  });
  if (!i) return null;
  return { anterior: i.configuracaoAnterior, resultante: i.configuracaoResultante, instalado: i.pecasInstaladas[0]?.componente?.nomeDispositivo ?? null, registrado: null, repetido: true };
}

/** Componente removido: estoque, avaliação, manutenção (com o registro de manutenção) ou baixa. */
async function encaminharRemovida(
  tx: Transacao,
  ator: Ator,
  componente: Ativo,
  destino: DestinoRemocao,
  notebook: string,
  motivo: string,
  quando: Date,
) {
  if (componente.situacao === destino) return;
  let manutencaoId: string | undefined;
  if (destino === "MANUTENCAO") {
    const m = await tx.manutencao.create({
      data: { ativoId: componente.id, motivo: `Removido de ${notebook}`, observacoes: motivo, abertaEm: quando, abertaPorNome: ator.nome },
    });
    manutencaoId = m.id;
  }
  await mudarSituacao(tx, ator, { id: componente.id, situacao: componente.situacao as Situacao, rotulo: componente.nomeDispositivo! }, destino, {
    tipo: "COMPONENTE_REMOVIDO",
    manutencaoId,
    observacao: `Removido de ${notebook}: ${motivo} Destino: ${ROTULO_DESTINO_REMOCAO[destino].toLowerCase()}.`,
    quando,
  });
}

async function intervir(ator: Ator, tipo: Exclude<TipoIntervencao, "CONFIGURACAO_ORIGINAL">, e: EntradaIntervencao): Promise<ResultadoIntervencao> {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirPermissao(ator, "ativo.transicionar");
    exigirGrupo(ator);
    const instala = tipo !== "REMOCAO";
    const remove = tipo !== "INSTALACAO";
    if (instala && e.novoComponente) exigirPermissao(ator, "ativo.criar");
    if (remove && e.registrarRemovida) exigirPermissao(ator, "ativo.criar");
    const destino = remove ? (DESTINOS_REMOCAO.find((d) => d === e.destino) ?? null) : null;
    if (remove && e.destino && !destino) throw new ErroNegocio("Escolha o destino da peça removida.");
    if (destino === "BAIXADO") exigirPermissao(ator, "ativo.baixar");
    if (!UUID.test(e.notebookId)) throw new ErroNegocio("Notebook não encontrado.");
    if (remove && !(e.pecaId && UUID.test(e.pecaId))) throw new ErroNegocio("Escolha a peça a remover.");
    if (instala && Boolean(e.componenteId) === Boolean(e.novoComponente)) throw new ErroNegocio("Escolha um componente do estoque ou cadastre um novo.");
    if (e.componenteId && !UUID.test(e.componenteId)) throw new ErroNegocio("Componente não encontrado.");
    const chave = e.chaveRequisicao && UUID.test(e.chaveRequisicao) ? e.chaveRequisicao : null;
    const ja = await repeticao(chave);
    if (ja) return ja;
    const motivo = textoLivre(e.motivo, 500, "Motivo");
    if (remove && !motivo) throw new ErroNegocio(`Informe o motivo da ${tipo === "SUBSTITUICAO" ? "substituição" : "remoção"}.`);
    const quando = lerMomento(e.data, "Data da intervenção");
    const novo = instala && e.novoComponente ? await validarComponente(prisma, e.novoComponente) : null;
    const previa = remove ? await prisma.pecaConfiguracao.findUnique({ where: { id: e.pecaId! }, select: { equipamentoId: true, componenteId: true } }) : null;
    if (remove && previa?.equipamentoId !== e.notebookId) throw new ErroNegocio("Peça não encontrada neste notebook.");

    try {
      return await prisma.$transaction(async (tx) => {
        // Trava notebook e componentes envolvidos: o mesmo componente não entra em dois notebooks.
        await travarAtivos(tx, [e.notebookId, e.componenteId, previa?.componenteId].filter((x): x is string => Boolean(x)));
        const nb = await tx.ativo.findUnique({
          where: { id: e.notebookId },
          include: { itensAlocacao: { where: { aberto: true, alocacao: { estado: "ATIVA" } }, include: { alocacao: { select: { numero: true, colaborador: { select: { nome: true } } } } } } },
        });
        if (!nb || nb.categoria !== "NOTEBOOK") throw new ErroNegocio("Notebook não encontrado.");
        if (nb.situacao === "BAIXADO") throw new ErroNegocio("Notebook baixado não recebe intervenções.");
        const nomeNb = nb.nomeDispositivo ?? "o notebook";
        // Alocado: a alocação continua; a intervenção exige a confirmação de disponibilidade.
        const alocacao = nb.itensAlocacao[0]?.alocacao ?? null;
        if (alocacao && !e.confirmacaoIntervencao) {
          throw new ErroNegocio(`O notebook está com ${alocacao.colaborador.nome} (${alocacao.numero}). Confirme que ele está disponível para a intervenção técnica.`);
        }
        const vigentes = await pecasVigentes(tx, nb.id);
        if (!vigentes.length && textoLegado(nb) && !(await tx.intervencaoConfiguracao.count({ where: { equipamentoId: nb.id } }))) {
          throw new ErroNegocio("Informe a configuração original do notebook antes de alterar os componentes.");
        }

        const peca = remove ? (vigentes.find((p) => p.id === e.pecaId) ?? null) : null;
        if (remove && !peca) throw new ErroNegocio("Esta peça já foi removida. Atualize a ficha.");
        const identificada = Boolean(peca?.componenteId);
        if (remove && (identificada || e.registrarRemovida) && !destino) throw new ErroNegocio("Escolha o destino da peça removida.");

        let componente: Ativo | null = null;
        if (instala && e.componenteId) {
          componente = await tx.ativo.findUnique({ where: { id: e.componenteId } });
          if (!componente || !ehComponente(componente.categoria)) throw new ErroNegocio("Componente não encontrado.");
          if (componente.situacao !== "DISPONIVEL") {
            throw new ErroNegocio(`${componente.nomeDispositivo} não está disponível (${ROTULO_SITUACAO[componente.situacao as Situacao].toLowerCase()}).`);
          }
        }
        const tipoNovo = (componente?.categoria as TipoComponente | undefined) ?? novo?.tipo;
        if (peca && tipoNovo && !compativeis(peca.tipo, tipoNovo)) {
          throw new ErroNegocio("Substitua memória por memória e armazenamento por armazenamento (SSD ou HD).");
        }
        if (novo) componente = await criarComponente(tx, ator, novo, nb.empresaId, `Cadastrado na instalação em ${nomeNb}.`, { quando });

        // Peça original que entra no estoque: identificada agora, nunca antes (sem estoque fictício).
        let registrada: Ativo | null = null;
        if (peca && !identificada && e.registrarRemovida) {
          const r = e.registrarRemovida;
          const v = await validarComponente(tx, {
            ...r,
            categoria: peca.tipo,
            capacidadeGb: r.capacidadeGb ?? peca.capacidadeGb,
            tecnologia: r.tecnologia ?? peca.tecnologia,
            interfaceConexao: r.interfaceConexao ?? peca.interfaceConexao,
          });
          registrada = await criarComponente(tx, ator, v, nb.empresaId, `Peça original removida de ${nomeNb}.`, { quando });
        }

        // Configuração antes e depois: a peça nova entra no lugar da removida (sem soma duplicada).
        const instalada = componente ? especDoAtivo(componente) : null;
        const depois = [...vigentes.filter((p) => p.id !== peca?.id).map(espec), ...(instalada ? [instalada] : [])];
        const anterior = vigentes.length ? resumirConfiguracao(vigentes.map(espec)).texto : textoLegado(nb);
        const resultante = resumirConfiguracao(depois).texto;
        const intervencao = await tx.intervencaoConfiguracao.create({
          data: {
            equipamentoId: nb.id,
            tipo,
            motivo,
            configuracaoAnterior: anterior,
            configuracaoResultante: resultante,
            colaboradorNome: alocacao?.colaborador.nome ?? null,
            alocacaoNumero: alocacao?.numero ?? null,
            realizadaEm: quando,
            realizadaPorContaId: ator.contaId,
            realizadaPorNome: ator.nome,
            chaveRequisicao: chave,
          },
        });

        let removidaTexto: string | null = null;
        if (peca) {
          const fisica = peca.componenteId ? await tx.ativo.findUniqueOrThrow({ where: { id: peca.componenteId } }) : registrada;
          await tx.pecaConfiguracao.update({
            where: { id: peca.id },
            data: {
              vigente: null,
              removidaEm: quando,
              removidaPorNome: ator.nome,
              removidaNaId: intervencao.id,
              motivoRemocao: motivo,
              destinoRemocao: fisica ? destino : null,
              ...(registrada ? { componenteId: registrada.id } : {}),
            },
          });
          removidaTexto = peca.componenteId
            ? `${peca.componente!.nomeDispositivo} (${descreverPeca(espec(peca))})`
            : `${ROTULO_COMPONENTE[peca.tipo]} original ${descreverPeca(espec(peca))}${registrada ? `, registrada no estoque como ${registrada.nomeDispositivo}` : ""}`;
          if (fisica && destino) await encaminharRemovida(tx, ator, fisica, destino, nomeNb, motivo!, quando);
        }

        if (componente) {
          await tx.pecaConfiguracao.create({
            data: {
              equipamentoId: nb.id,
              tipo: componente.categoria as TipoComponente,
              componenteId: componente.id,
              capacidadeGb: componente.capacidadeGb!,
              tecnologia: componente.tecnologia,
              interfaceConexao: componente.interfaceConexao,
              formato: componente.formato,
              instaladaEm: quando,
              instaladaPorNome: ator.nome,
              instaladaNaId: intervencao.id,
            },
          });
          await mudarSituacao(tx, ator, { id: componente.id, situacao: "DISPONIVEL", rotulo: componente.nomeDispositivo! }, "INSTALADO", {
            tipo: "COMPONENTE_INSTALADO",
            observacao: `Instalado em ${nomeNb}${motivo ? `: ${motivo}` : "."}`,
            quando,
          });
        }

        await sincronizarFicha(tx, nb.id, depois);
        const instaladoTexto = componente ? `${componente.nomeDispositivo} (${descreverPeca(especDoAtivo(componente))})` : null;
        const acao =
          tipo === "INSTALACAO"
            ? `${instaladoTexto} instalado.`
            : tipo === "REMOCAO"
              ? `${removidaTexto} removida.`
              : `${removidaTexto} substituída por ${instaladoTexto}.`;
        await registrarMovimentacao(tx, ator, nb.id, {
          tipo: MOVIMENTO[tipo],
          observacao: [acao, `Antes: ${anterior ?? "não informada"}. Agora: ${resultante}.`, motivo ? `Motivo: ${motivo}` : null, alocacao ? `Com ${alocacao.colaborador.nome} (${alocacao.numero}).` : null]
            .filter(Boolean)
            .join(" "),
          quando,
        });
        await registrarAuditoria(tx, {
          acao: `ativo.componente_${tipo.toLowerCase()}`,
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: nb.id, descricao: nomeNb },
          origemPermissao: origem,
          detalhe: {
            instalado: componente?.nomeDispositivo ?? null,
            removido: peca ? (peca.componente?.nomeDispositivo ?? "original") : null,
            destino,
            registradoNoEstoque: registrada?.nomeDispositivo ?? null,
            anterior,
            resultante,
            alocado: Boolean(alocacao),
          },
        });
        return { anterior, resultante, instalado: componente?.nomeDispositivo ?? null, registrado: registrada?.nomeDispositivo ?? null, repetido: false };
      });
    } catch (erro) {
      const repetido = await repeticao(chave);
      if (repetido) return repetido;
      throw traduzirConflito(erro);
    }
  });
}

export const instalarComponente = (ator: Ator, e: EntradaIntervencao) => intervir(ator, "INSTALACAO", e);
export const removerComponente = (ator: Ator, e: EntradaIntervencao) => intervir(ator, "REMOCAO", e);
export const substituirComponente = (ator: Ator, e: EntradaIntervencao) => intervir(ator, "SUBSTITUICAO", e);

/* Opções */

/** Componentes disponíveis no estoque para instalar (seleção no formulário). */
export async function componentesDisponiveis(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "ativo.editar");
    exigirGrupo(ator);
    const lista = await prisma.ativo.findMany({
      where: { categoria: { in: [...COMPONENTES] }, situacao: "DISPONIVEL" },
      orderBy: [{ categoria: "asc" }, { nomeDispositivo: "asc" }],
      take: 500,
      select: { id: true, categoria: true, nomeDispositivo: true, marca: true, modelo: true, capacidadeGb: true, tecnologia: true, interfaceConexao: true, formato: true },
    });
    return lista.map((c) => ({
      id: c.id,
      tipo: c.categoria as TipoComponente,
      nome: c.nomeDispositivo!,
      descricao: descreverPeca(especDoAtivo(c)),
      fabricante: `${c.marca} ${c.modelo}`,
    }));
  });
}

export type ComponenteDisponivel = Awaited<ReturnType<typeof componentesDisponiveis>>[number];
