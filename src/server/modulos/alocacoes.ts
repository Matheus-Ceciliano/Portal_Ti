import type { EstadoAlocacao, Prisma } from "@/generated/prisma/client";
import { ehComponente } from "@/lib/componentes";
import { CATEGORIAS_COMPONENTE, ESTADOS_FISICOS, ROTULO_SITUACAO, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { alugueisQueValem, diaDe, exigirEmpresaAutorizada, notebooksDosCarregadores } from "./alugueis";
import { fotosDasVerificacoes, prepararVerificacoes, registrarVerificacoes, type EntradaVerificacao, type InstantaneoEntrega } from "./inspecoes";
import { PERFIS_TI } from "@/server/authz/catalogo";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import { prisma, type ClienteBanco } from "@/server/db";
import {
  cancelarTransferenciaPendente,
  dadosFoto,
  descartarFotos,
  encerrarAlocacaoSemItens,
  encerrarItem,
  type FotoEnviada,
  type FotoPreparada,
  gravarArquivosFotos,
  lerData,
  lerMomento,
  mudarSituacao,
  prepararFotos,
  proximoNumero,
  proximoNumeroAlocacao,
  rotuloAtivo,
  rotuloTipo,
  SELECAO_TIPO,
  traduzirConflito,
  travarAtivos,
  urlFoto,
  UUID,
} from "./inventario-base";

/**
 * Alocações: entrega física (ATIVA) ou reserva de entrega futura (RESERVADA), devolução total
 * ou parcial e histórico. A custódia só muda na confirmação da entrega física, independente
 * da assinatura do TER (Q-27). Empresa proprietária (no item) e empresa do colaborador (na
 * alocação) ficam separadas.
 */

export const ESTADOS_ALOCACAO = ["RESERVADA", "ATIVA", "ENCERRADA", "CANCELADA"] as const;
export const MAX_ITENS_ALOCACAO = 30;

const exigirGrupo = (ator: Ator, permissao: "ativo.ver") => {
  const { escopo } = exigirPermissao(ator, permissao);
  if (escopo !== "GRUPO") throw new ErroAutorizacao(permissao, "ESCOPO_PROPRIO");
};

const textoOpcional = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim();
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t || null;
};

const auditar = (ator: Ator, origem: string, acao: string, alvo: { id: string; descricao: string }, detalhe: Record<string, unknown>) =>
  ({
    acao,
    resultado: "SUCESSO" as const,
    ator: { contaId: ator.contaId, nome: ator.nome },
    alvo: { tipo: "alocacao", ...alvo },
    origemPermissao: origem,
    detalhe,
  });

/* Lista */

export type FiltroAlocacoes = {
  busca?: string;
  colaboradorId?: string;
  /** Empresa do colaborador (na data da alocação). */
  empresaColaboradorId?: string;
  /** Empresa proprietária de algum dos equipamentos. */
  empresaProprietariaId?: string;
  estado?: EstadoAlocacao;
  periodo?: "30" | "90" | "365";
  ordem?: "recentes" | "antigas";
  /** Classificação pelas colunas da tabela; as encerradas continuam no fim. */
  ordenar?: "numero" | "colaborador" | "data" | "situacao";
  direcao?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
};

function ondeAlocacoes(f: FiltroAlocacoes, agora = new Date()): Prisma.AlocacaoWhereInput {
  const busca = f.busca?.trim().slice(0, 80);
  const contem = { contains: busca, mode: "insensitive" as const };
  const limite = f.periodo ? new Date(agora.getTime() - Number(f.periodo) * 86_400_000) : null;
  return {
    AND: [
      f.colaboradorId && UUID.test(f.colaboradorId) ? { colaboradorId: f.colaboradorId } : {},
      f.empresaColaboradorId && UUID.test(f.empresaColaboradorId) ? { empresaColaboradorId: f.empresaColaboradorId } : {},
      f.empresaProprietariaId && UUID.test(f.empresaProprietariaId) ? { itens: { some: { empresaProprietariaId: f.empresaProprietariaId } } } : {},
      f.estado ? { estado: f.estado } : {},
      limite ? { criadaEm: { gte: limite } } : {},
      busca
        ? {
            OR: [
              { numero: contem },
              { colaborador: { nome: contem } },
              { itens: { some: { ativo: { OR: [{ patrimonio: contem }, { nomeDispositivo: contem }, { modelo: contem }, { numeroSerie: contem }] } } } },
            ],
          }
        : {},
    ],
  };
}

/** Ordem de cada coluna (o número segue a ordem de registro: AL0033 vem depois de ALO-2026-0032). */
const ORDEM_ALOCACOES: Record<NonNullable<FiltroAlocacoes["ordenar"]>, (d: "asc" | "desc") => Prisma.AlocacaoOrderByWithRelationInput[]> = {
  numero: (d) => [{ criadaEm: d }, { numero: d }],
  colaborador: (d) => [{ colaborador: { nome: d } }, { criadaEm: "desc" }],
  data: (d) => [{ entregueEm: { sort: d, nulls: "last" } }, { previstaPara: { sort: d, nulls: "last" } }, { criadaEm: d }],
  situacao: (d) => [{ estado: d }, { criadaEm: "desc" }],
};

export async function listarAlocacoes(ator: Ator, f: FiltroAlocacoes = {}) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "ativo.ver");
    const where = ondeAlocacoes(f);
    const porPagina = f.porPagina ?? 12;
    // Em aberto (reservas e entregas) primeiro; encerradas e canceladas no fim da lista.
    const emAberto: EstadoAlocacao[] = ["RESERVADA", "ATIVA"];
    const ondeAbertas: Prisma.AlocacaoWhereInput = { AND: [where, { estado: { in: emAberto } }] };
    const ondeFechadas: Prisma.AlocacaoWhereInput = { AND: [where, { estado: { notIn: emAberto } }] };
    const [total, totalAbertas, totalGeral, porEstado, equipamentosEntregues, terPendente] = await Promise.all([
      prisma.alocacao.count({ where }),
      prisma.alocacao.count({ where: ondeAbertas }),
      prisma.alocacao.count(),
      prisma.alocacao.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.itemAlocacao.count({ where: { aberto: true, alocacao: { estado: "ATIVA" } } }),
      prisma.alocacao.count({ where: { estado: "ATIVA", termos: { none: { tipo: "TER", estado: "ASSINADO" } } } }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const inicio = (pagina - 1) * porPagina;
    const quantasAbertas = Math.max(0, Math.min(porPagina, totalAbertas - inicio));
    const consulta = (onde: Prisma.AlocacaoWhereInput, skip: number, take: number) =>
      take > 0
        ? prisma.alocacao.findMany({
            where: onde,
            orderBy: f.ordenar ? ORDEM_ALOCACOES[f.ordenar](f.direcao === "asc" ? "asc" : "desc") : [{ criadaEm: f.ordem === "antigas" ? "asc" : "desc" }, { numero: "desc" }],
            skip,
            take,
            include: {
              colaborador: { select: { id: true, nome: true } },
              empresaColaborador: { select: { id: true, nome: true, sigla: true } },
              itens: {
                orderBy: { ativo: { categoria: "asc" } },
                select: {
                  aberto: true,
                  empresaProprietaria: { select: { id: true, sigla: true, nome: true } },
                  ativo: { select: { id: true, nomeDispositivo: true, patrimonio: true, modelo: true, categoria: true } },
                },
              },
              termos: { where: { tipo: "TER", estado: { not: "CANCELADO" } }, orderBy: { criadoEm: "desc" }, take: 1, select: { numero: true, estado: true } },
            },
          })
        : Promise.resolve([]);
    const [abertas, fechadas] = await Promise.all([
      consulta(ondeAbertas, inicio, quantasAbertas),
      consulta(ondeFechadas, Math.max(0, inicio - totalAbertas), porPagina - quantasAbertas),
    ]);
    const linhas = [...abertas, ...fechadas];
    const contar = (e: EstadoAlocacao) => porEstado.find((p) => p.estado === e)?._count._all ?? 0;
    return {
      linhas: linhas.map((a) => {
        const proprietarias = [...new Map(a.itens.map((i) => [i.empresaProprietaria.id, i.empresaProprietaria])).values()];
        return {
          id: a.id,
          numero: a.numero,
          estado: a.estado,
          colaborador: a.colaborador,
          empresaColaborador: a.empresaColaborador,
          proprietarias,
          /** Algum equipamento é de empresa diferente da do colaborador. */
          outraEmpresa: proprietarias.some((p) => p.id !== a.empresaColaborador.id),
          itens: a.itens.map((i) => ({ ...i.ativo, rotulo: rotuloAtivo(i.ativo), aberto: i.aberto === true })),
          entregueEm: a.entregueEm?.toISOString() ?? null,
          previstaPara: a.previstaPara?.toISOString().slice(0, 10) ?? null,
          criadaEm: a.criadaEm.toISOString(),
          ter: a.termos[0] ?? null,
          responsavelTi: a.responsavelTiNome,
        };
      }),
      total,
      totalGeral,
      pagina,
      paginas,
      indicadores: {
        ativas: contar("ATIVA"),
        reservas: contar("RESERVADA"),
        encerradas: contar("ENCERRADA"),
        equipamentosEntregues,
        terPendente,
      },
    };
  });
}

export type ResultadoAlocacoes = Awaited<ReturnType<typeof listarAlocacoes>>;
export type LinhaAlocacao = ResultadoAlocacoes["linhas"][number];

/* Detalhe */

export async function obterAlocacao(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "ativo.ver");
    const a = UUID.test(id)
      ? await prisma.alocacao.findUnique({
          where: { id },
          include: {
            colaborador: { select: { id: true, nome: true, cargo: true, departamento: true, situacao: true } },
            empresaColaborador: { select: { id: true, nome: true, sigla: true } },
            itens: {
              orderBy: [{ ativo: { categoria: "asc" } }, { ativo: { nomeDispositivo: "asc" } }],
              include: {
                empresaProprietaria: { select: { id: true, nome: true, sigla: true } },
                verificacaoEntrega: { select: { modo: true, instantaneo: true, verificadaEm: true, responsavelNome: true } },
                ativo: {
                  select: {
                    id: true,
                    categoria: true,
                    ...SELECAO_TIPO,
                    inspecoes: { where: { pendente: true }, take: 1, select: { id: true } },
                    nomeDispositivo: true,
                    patrimonio: true,
                    marca: true,
                    modelo: true,
                    numeroSerie: true,
                    situacao: true,
                    notebookId: true,
                    fotos: { where: { contexto: "CADASTRO", removidaEm: null }, orderBy: [{ tipo: "asc" }], take: 1, select: { id: true } },
                    transferencias: { where: { pendente: true }, take: 1 },
                  },
                },
                itemDevolucao: {
                  include: {
                    devolucao: { select: { id: true, numero: true, recebidaEm: true, recebidaPorNome: true } },
                    fotos: { where: { removidaEm: null }, select: { id: true, tipo: true } },
                  },
                },
              },
            },
            devolucoes: { orderBy: { recebidaEm: "desc" }, include: { itens: { select: { id: true } } } },
            termos: { orderBy: { criadoEm: "desc" } },
          },
        })
      : null;
    if (!a) throw new ErroNegocio("Alocação não encontrada.");
    const historico = await prisma.movimentacaoAtivo.findMany({
      where: { alocacaoId: a.id },
      orderBy: { realizadoEm: "desc" },
      take: 80,
      include: { ativo: { select: { nomeDispositivo: true, patrimonio: true, modelo: true } } },
    });
    return {
      id: a.id,
      numero: a.numero,
      estado: a.estado,
      colaborador: a.colaborador,
      empresaColaborador: a.empresaColaborador,
      entregueEm: a.entregueEm?.toISOString() ?? null,
      entreguePorNome: a.entreguePorNome,
      previstaPara: a.previstaPara?.toISOString().slice(0, 10) ?? null,
      observacoes: a.observacoes,
      /** Responsável TI escolhido (alocações anteriores à mudança não têm). */
      responsavelTi: a.responsavelTiNome,
      criadaEm: a.criadaEm.toISOString(),
      /** Quem registrou a operação no portal. */
      criadaPorNome: a.criadaPorNome,
      canceladaEm: a.canceladaEm?.toISOString() ?? null,
      motivoCancelamento: a.motivoCancelamento,
      itens: a.itens.map((i) => ({
        id: i.id,
        aberto: i.aberto === true,
        encerradoEm: i.encerradoEm?.toISOString() ?? null,
        motivoEncerramento: i.motivoEncerramento,
        encerradoPorNome: i.encerradoPorNome,
        empresaProprietaria: i.empresaProprietaria,
        ativo: {
          id: i.ativo.id,
          categoria: i.ativo.categoria,
          rotuloCategoria: rotuloTipo(i.ativo),
          nome: i.ativo.nomeDispositivo,
          patrimonio: i.ativo.patrimonio,
          marca: i.ativo.marca,
          modelo: i.ativo.modelo,
          numeroSerie: i.ativo.numeroSerie,
          situacao: i.ativo.situacao,
          carregadorDe: i.ativo.notebookId,
          miniatura: i.ativo.fotos[0] ? urlFoto(i.ativo.fotos[0].id) : null,
          parteKit: i.ativo.parteKit,
          /** Devolvido e aguardando a inspeção técnica. */
          inspecaoPendente: i.ativo.inspecoes.length > 0 && i.ativo.situacao === "DEVOLVIDO_EM_AVALIACAO",
        },
        /** Condição verificada na entrega física (instantâneo imutável para o TER). */
        verificacao: i.verificacaoEntrega
          ? {
              modo: i.verificacaoEntrega.modo,
              verificadaEm: i.verificacaoEntrega.verificadaEm.toISOString(),
              responsavel: i.verificacaoEntrega.responsavelNome,
              instantaneo: i.verificacaoEntrega.instantaneo as unknown as InstantaneoEntrega,
            }
          : null,
        /** Transferência para outro colaborador reservada (a custódia atual continua até a entrega). */
        transferenciaPendente: (() => {
          const t = i.ativo.transferencias[0];
          return t
            ? {
                id: t.id,
                colaborador: { id: t.colaboradorDestinoId!, nome: t.colaboradorDestinoNome! },
                previstaPara: t.previstaPara?.toISOString().slice(0, 10) ?? null,
                motivo: t.motivo,
                registradaEm: t.criadaEm.toISOString(),
                registradaPorNome: t.realizadaPorNome,
              }
            : null;
        })(),
        devolucao: i.itemDevolucao
          ? {
              numero: i.itemDevolucao.devolucao.numero,
              recebidaEm: i.itemDevolucao.devolucao.recebidaEm.toISOString(),
              recebidaPorNome: i.itemDevolucao.devolucao.recebidaPorNome,
              estadoFisico: i.itemDevolucao.estadoFisico,
              destino: i.itemDevolucao.destino,
              observacoes: i.itemDevolucao.observacoes,
              fotos: i.itemDevolucao.fotos.map((f) => ({ id: f.id, tipo: f.tipo, url: urlFoto(f.id) })),
            }
          : null,
      })),
      devolucoes: a.devolucoes.map((d) => ({
        id: d.id,
        numero: d.numero,
        abrangencia: d.abrangencia,
        recebidaEm: d.recebidaEm.toISOString(),
        recebidaPorNome: d.recebidaPorNome,
        observacoes: d.observacoes,
        itens: d.itens.length,
      })),
      termos: a.termos.map((t) => ({
        id: t.id,
        numero: t.numero,
        tipo: t.tipo,
        estado: t.estado,
        emitidoEm: t.emitidoEm?.toISOString() ?? null,
        assinadoEm: t.assinadoRegistradoEm?.toISOString() ?? null,
        assinadoPorNome: t.assinadoRegistradoPorNome,
        temPdf: Boolean(t.arquivoAssinadoChave),
      })),
      historico: historico.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        equipamento: rotuloAtivo(m.ativo),
        ativoId: m.ativoId,
        situacaoAnterior: m.situacaoAnterior,
        situacaoNova: m.situacaoNova,
        realizadoPorNome: m.realizadoPorNome,
        realizadoEm: m.realizadoEm.toISOString(),
        observacao: m.observacao,
      })),
    };
  });
}

export type DetalheAlocacaoReal = Awaited<ReturnType<typeof obterAlocacao>>;

/* Responsável TI */

export type ResponsavelTi = { contaId: string; nome: string; cargo: string };

/**
 * Membros da TI que podem ser o Responsável TI de uma alocação: conta e cadastro ativos,
 * perfil de TI com a ativação concluída e permissão para registrar alocações.
 */
export async function responsaveisTiElegiveis(db: ClienteBanco): Promise<ResponsavelTi[]> {
  const contas = await db.contaAcesso.findMany({
    where: { situacao: "ATIVA", colaborador: { situacao: "ATIVO", perfis: { some: { revogadoEm: null, perfil: { in: [...PERFIS_TI] } } } } },
    select: { id: true },
  });
  const atores = await Promise.all(contas.map((c) => carregarAtor(db, c.id, { mfaVerificado: true })));
  return atores
    .filter((a): a is Ator => a !== null && pode(a, "alocacao.criar"))
    .map((a) => ({ contaId: a.contaId, nome: a.nome, cargo: a.cargo }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function exigirResponsavelTi(db: ClienteBanco, contaId: string | null | undefined) {
  if (!contaId) throw new ErroNegocio("Selecione o responsável TI.");
  const ator = contaId.length <= 64 ? await carregarAtor(db, contaId, { mfaVerificado: true }) : null;
  if (!ator || !ator.perfisAtribuidos.length || !pode(ator, "alocacao.criar")) throw new ErroNegocio("Responsável TI: escolha um membro da TI ativo e autorizado.");
  return ator;
}

/* Opções do formulário de nova alocação */

export async function opcoesNovaAlocacao(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "alocacao.criar");
    exigirGrupo(ator, "ativo.ver");
    const [colaboradores, disponiveis, responsaveis] = await Promise.all([
      prisma.colaborador.findMany({
        where: { situacao: { not: "DESLIGADO" } },
        orderBy: { nome: "asc" },
        take: 2000,
        select: { id: true, nome: true, cargo: true, situacao: true, empresa: { select: { id: true, nome: true, sigla: true } } },
      }),
      prisma.ativo.findMany({
        // RAM, SSD e HD não são alocados a pessoas: entram no notebook.
        where: { situacao: "DISPONIVEL", desvinculadoEm: null, categoria: { notIn: [...CATEGORIAS_COMPONENTE] } },
        orderBy: [{ categoria: "asc" }, { nomeDispositivo: "asc" }, { patrimonio: "asc" }],
        take: 1000,
        select: {
          id: true,
          categoria: true,
          ...SELECAO_TIPO,
          nomeDispositivo: true,
          patrimonio: true,
          marca: true,
          modelo: true,
          notebookId: true,
          desvinculadoEm: true,
          empresaId: true,
          sequenciaCarregador: true,
          empresa: { select: { id: true, nome: true, sigla: true } },
          fotos: { where: { contexto: "CADASTRO", removidaEm: null }, orderBy: [{ tipo: "asc" }, { enviadaEm: "asc" }], take: 1, select: { id: true } },
        },
      }),
      responsaveisTiElegiveis(prisma),
    ]);
    // Aluguel vigente de cada equipamento (ou do notebook, no carregador): define a empresa que pode usá-lo.
    const alugueis = await alugueisQueValem(prisma, disponiveis);
    return {
      colaboradores,
      equipamentos: disponiveis.map(({ categoriaEquipamento: _c, parteKit: _p, fotos, ...a }) => ({
        ...a,
        rotulo: rotuloAtivo(a),
        rotuloCategoria: rotuloTipo({ categoriaEquipamento: _c, parteKit: _p }),
        miniatura: fotos[0] ? urlFoto(fotos[0].id) : null,
        aluguel: (() => {
          const v = alugueis.get(a.id);
          return v ? { empresa: v.empresaLocataria, inicio: v.inicio.toISOString().slice(0, 10) } : null;
        })(),
      })),
      responsaveis,
      /** Quem está registrando, quando é elegível: começa como responsável. */
      responsavelPadrao: responsaveis.some((r) => r.contaId === ator.contaId) ? ator.contaId : null,
    };
  });
}

export type OpcoesNovaAlocacao = Awaited<ReturnType<typeof opcoesNovaAlocacao>>;

/* Nova alocação */

export type EntradaAlocacao = {
  colaboradorId: string;
  ativoIds: string[];
  /** ENTREGAR = entrega física agora (custódia muda); RESERVAR = entrega futura preparada. */
  modo: "ENTREGAR" | "RESERVAR";
  /** Membro da TI responsável pela alocação (não é quem recebe os equipamentos). */
  responsavelTiContaId: string;
  /** Entrega: data e hora (ISO, não futura). Reserva: data prevista (AAAA-MM-DD). */
  data?: string | null;
  observacoes?: string | null;
  chaveRequisicao?: string;
  /** Entrega física: a verificação técnica de cada equipamento (confirmar a última inspeção ou uma nova). */
  verificacoes?: EntradaVerificacao[];
};

export async function criarAlocacao(ator: Ator, entrada: EntradaAlocacao) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.criar");
    if (entrada.modo === "ENTREGAR") exigirPermissao(ator, "alocacao.confirmar_entrega");
    else if (entrada.modo !== "RESERVAR") throw new ErroNegocio("Escolha entre entregar agora ou reservar.");
    const chave = entrada.chaveRequisicao && UUID.test(entrada.chaveRequisicao) ? entrada.chaveRequisicao : null;
    if (chave) {
      const ja = await prisma.alocacao.findUnique({ where: { chaveRequisicao: chave }, select: { id: true, numero: true } });
      if (ja) return { ...ja, repetido: true };
    }
    const ids = [...new Set(entrada.ativoIds)];
    if (!ids.length) throw new ErroNegocio("Selecione ao menos um equipamento.");
    if (ids.length > MAX_ITENS_ALOCACAO) throw new ErroNegocio(`Selecione no máximo ${MAX_ITENS_ALOCACAO} equipamentos por operação.`);
    if (!ids.every((i) => UUID.test(i))) throw new ErroNegocio("Equipamento não encontrado.");
    if (!UUID.test(entrada.colaboradorId)) throw new ErroNegocio("Selecione o colaborador.");
    const colaborador = await prisma.colaborador.findUnique({ where: { id: entrada.colaboradorId }, select: { id: true, nome: true, situacao: true, empresaId: true } });
    if (!colaborador) throw new ErroNegocio("Selecione o colaborador.");
    if (colaborador.situacao === "DESLIGADO") throw new ErroNegocio("Colaborador desligado não recebe equipamentos.");
    const observacoes = textoOpcional(entrada.observacoes, 1000, "Observações");
    const responsavel = await exigirResponsavelTi(prisma, entrada.responsavelTiContaId);
    const entregar = entrada.modo === "ENTREGAR";
    const entregueEm = entregar ? lerMomento(entrada.data, "Data da entrega") : null;
    const previstaPara = entregar ? null : lerData(entrada.data, "Data prevista");
    if (previstaPara && previstaPara.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      throw new ErroNegocio("Data prevista: não pode estar no passado.");
    }
    // Entrega física exige a verificação técnica de cada item; a reserva fica para a confirmação.
    const verificacoes = entregar ? await prepararVerificacoes(prisma, ids, entrada.verificacoes) : new Map();
    const fotos = fotosDasVerificacoes(verificacoes);
    if (fotos.length) exigirPermissao(ator, "evidencia.enviar");
    await gravarArquivosFotos(fotos);

    try {
      return await prisma.$transaction(async (tx) => {
        // Trava os equipamentos e só então confere a situação: duas alocações simultâneas do
        // mesmo patrimônio não passam (o índice único do item aberto é a última barreira).
        // Os notebooks dos carregadores também: o aluguel do notebook decide o uso do carregador.
        const previos = await tx.ativo.findMany({ where: { id: { in: ids } }, select: { notebookId: true, desvinculadoEm: true } });
        await travarAtivos(tx, [...ids, ...notebooksDosCarregadores(previos)]);
        const ativos = await tx.ativo.findMany({ where: { id: { in: ids } } });
        if (ativos.length !== ids.length) throw new ErroNegocio("Um dos equipamentos não foi encontrado.");
        const componente = ativos.find((a) => ehComponente(a.categoria));
        if (componente) {
          throw new ErroNegocio(`${rotuloAtivo(componente)}: componentes internos (RAM, SSD, HD) não são alocados a pessoas. Instale-o no notebook.`);
        }
        const indisponiveis = ativos.filter((a) => a.situacao !== "DISPONIVEL" || a.desvinculadoEm);
        if (indisponiveis.length) {
          const a = indisponiveis[0];
          throw new ErroNegocio(
            a.situacao === "MANUTENCAO"
              ? `${rotuloAtivo(a)} está em manutenção e não pode ser alocado.`
              : `${rotuloAtivo(a)} não está disponível (${ROTULO_SITUACAO[a.situacao as Situacao].toLowerCase()}).`,
          );
        }
        // Só a empresa proprietária ou, com aluguel vigente, a locatária (no dia do uso).
        await exigirEmpresaAutorizada(tx, ativos, colaborador.empresaId, entregueEm ? diaDe(entregueEm) : previstaPara ? previstaPara.toISOString().slice(0, 10) : diaDe(new Date()));
        const quando = entregueEm ?? new Date();
        const numero = await proximoNumeroAlocacao(tx);
        const alocacao = await tx.alocacao.create({
          data: {
            numero,
            colaboradorId: colaborador.id,
            empresaColaboradorId: colaborador.empresaId,
            estado: entregar ? "ATIVA" : "RESERVADA",
            entregueEm,
            entreguePorNome: entregar ? ator.nome : null,
            previstaPara,
            observacoes,
            chaveRequisicao: chave,
            responsavelTiContaId: responsavel.contaId,
            responsavelTiNome: responsavel.nome,
            criadaPorContaId: ator.contaId,
            criadaPorNome: ator.nome,
            itens: { create: ativos.map((a) => ({ ativoId: a.id, empresaProprietariaId: a.empresaId })) },
          },
          include: { itens: { select: { id: true, ativoId: true } } },
        });
        if (entregar) await registrarVerificacoes(tx, ator, alocacao.id, alocacao.itens, verificacoes);
        for (const a of ativos) {
          await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo: rotuloAtivo(a) }, entregar ? "ALOCADO" : "RESERVADO", {
            tipo: entregar ? "ENTREGA" : "RESERVA",
            colaborador,
            alocacaoId: alocacao.id,
            observacao: `${
              entregar ? `${numero}: entrega física.` : `${numero}: reservado para entrega${previstaPara ? ` em ${previstaPara.toISOString().slice(0, 10).split("-").reverse().join("/")}` : ""}.`
            } Responsável TI: ${responsavel.nome}.`,
            quando,
          });
        }
        const outraEmpresa = ativos.filter((a) => a.empresaId !== colaborador.empresaId).length;
        await registrarAuditoria(
          tx,
          auditar(ator, origem, entregar ? "alocacao.confirmar_entrega" : "alocacao.criar", { id: alocacao.id, descricao: numero }, {
            modo: entrada.modo,
            equipamentos: ativos.length,
            equipamentosDeOutraEmpresa: outraEmpresa,
            responsavelTi: responsavel.nome,
            verificacoesTecnicas: entregar ? ativos.length : 0,
          }),
        );
        return { id: alocacao.id, numero, repetido: false };
      });
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      // Envio repetido em paralelo: o outro pedido já gravou e este viu os equipamentos alocados.
      if (chave) {
        const ja = await prisma.alocacao.findUnique({ where: { chaveRequisicao: chave }, select: { id: true, numero: true } });
        if (ja) return { ...ja, repetido: true };
      }
      throw traduzirConflito(erro);
    }
  });
}

/** Reserva → entrega física: a partir daqui a pessoa é responsável pelos equipamentos. */
export async function confirmarEntrega(ator: Ator, entrada: { alocacaoId: string; data?: string | null; verificacoes?: EntradaVerificacao[] }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.confirmar_entrega");
    if (!UUID.test(entrada.alocacaoId)) throw new ErroNegocio("Alocação não encontrada.");
    const entregueEm = lerMomento(entrada.data, "Data da entrega");
    // A entrega física exige a verificação técnica de cada item reservado.
    const reservados = (await prisma.itemAlocacao.findMany({ where: { alocacaoId: entrada.alocacaoId, aberto: true }, select: { ativoId: true } })).map((i) => i.ativoId);
    const verificacoes = await prepararVerificacoes(prisma, reservados, entrada.verificacoes);
    const fotos = fotosDasVerificacoes(verificacoes);
    if (fotos.length) exigirPermissao(ator, "evidencia.enviar");
    await gravarArquivosFotos(fotos);
    try {
      return await prisma.$transaction(async (tx) => {
        const previa = await tx.alocacao.findUnique({
          where: { id: entrada.alocacaoId },
          select: { itens: { where: { aberto: true }, select: { ativoId: true, ativo: { select: { notebookId: true, desvinculadoEm: true } } } } },
        });
        if (!previa) throw new ErroNegocio("Alocação não encontrada.");
        await travarAtivos(tx, [...previa.itens.map((i) => i.ativoId), ...notebooksDosCarregadores(previa.itens.map((i) => i.ativo))]);
        const a = await tx.alocacao.findUniqueOrThrow({
          where: { id: entrada.alocacaoId },
          include: { colaborador: { select: { id: true, nome: true, empresaId: true } }, itens: { where: { aberto: true }, include: { ativo: true } } },
        });
        if (a.estado !== "RESERVADA") throw new ErroNegocio("Só uma reserva pode ter a entrega confirmada.");
        if (!a.itens.length) throw new ErroNegocio("A reserva não tem equipamentos.");
        if (a.itens.length !== reservados.length || a.itens.some((i) => !verificacoes.has(i.ativoId))) {
          throw new ErroNegocio("A reserva mudou enquanto a entrega era conferida. Revise os equipamentos.");
        }
        // A entrega confere de novo: o aluguel pode ter terminado desde a reserva.
        await exigirEmpresaAutorizada(tx, a.itens.map((i) => i.ativo), a.colaborador.empresaId, diaDe(entregueEm));
        await registrarVerificacoes(tx, ator, a.id, a.itens.map((i) => ({ id: i.id, ativoId: i.ativoId })), verificacoes);
        for (const i of a.itens) {
          await mudarSituacao(tx, ator, { id: i.ativo.id, situacao: i.ativo.situacao as Situacao, rotulo: rotuloAtivo(i.ativo) }, "ALOCADO", {
            tipo: "ENTREGA",
            colaborador: a.colaborador,
            alocacaoId: a.id,
            observacao: `${a.numero}: entrega física confirmada.`,
            quando: entregueEm,
          });
        }
        await tx.alocacao.update({ where: { id: a.id }, data: { estado: "ATIVA", entregueEm, entreguePorNome: ator.nome } });
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "alocacao.confirmar_entrega", { id: a.id, descricao: a.numero }, { equipamentos: a.itens.length, verificacoesTecnicas: a.itens.length }),
        );
        return { numero: a.numero };
      });
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      throw traduzirConflito(erro);
    }
  });
}

export async function cancelarReserva(ator: Ator, entrada: { alocacaoId: string; motivo: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.cancelar");
    if (!UUID.test(entrada.alocacaoId)) throw new ErroNegocio("Alocação não encontrada.");
    const motivo = textoOpcional(entrada.motivo, 500, "Motivo");
    if (!motivo) throw new ErroNegocio("Informe o motivo do cancelamento.");
    return prisma.$transaction(async (tx) => {
      const previa = await tx.alocacao.findUnique({ where: { id: entrada.alocacaoId }, select: { itens: { where: { aberto: true }, select: { ativoId: true } } } });
      if (!previa) throw new ErroNegocio("Alocação não encontrada.");
      await travarAtivos(tx, previa.itens.map((i) => i.ativoId));
      const a = await tx.alocacao.findUniqueOrThrow({
        where: { id: entrada.alocacaoId },
        include: { colaborador: { select: { id: true, nome: true } }, itens: { where: { aberto: true }, include: { ativo: true } } },
      });
      // Depois da entrega física, os itens só se encerram por devolução.
      if (a.estado !== "RESERVADA") throw new ErroNegocio("Só reservas podem ser canceladas; depois da entrega, registre a devolução.");
      const agora = new Date();
      for (const i of a.itens) {
        await encerrarItem(tx, ator, i.id, "CANCELAMENTO", agora);
        await mudarSituacao(tx, ator, { id: i.ativo.id, situacao: i.ativo.situacao as Situacao, rotulo: rotuloAtivo(i.ativo) }, "DISPONIVEL", {
          tipo: "CANCELAMENTO_RESERVA",
          colaborador: a.colaborador,
          alocacaoId: a.id,
          observacao: `${a.numero}: ${motivo}`,
          quando: agora,
        });
      }
      await tx.alocacao.update({ where: { id: a.id }, data: { estado: "CANCELADA", canceladaEm: agora, motivoCancelamento: motivo } });
      await registrarAuditoria(tx, auditar(ator, origem, "alocacao.cancelar", { id: a.id, descricao: a.numero }, { equipamentos: a.itens.length }));
      return { numero: a.numero };
    });
  });
}

/* Devolução */

export type ItemDevolucaoEntrada = {
  itemId: string;
  estadoFisico: string;
  destino: string;
  observacoes?: string | null;
  fotos?: FotoEnviada[];
};

/**
 * Devolução total ou parcial: encerra só os itens devolvidos, registra estado físico e
 * destino (avaliação ou manutenção) e preserva a alocação e o histórico.
 */
export async function registrarDevolucao(
  ator: Ator,
  entrada: { alocacaoId: string; recebidaEm?: string | null; observacoes?: string | null; itens: ItemDevolucaoEntrada[]; chaveRequisicao?: string },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "devolucao.registrar");
    const comFotos = entrada.itens.some((i) => i.fotos?.some((f) => f.dados.length));
    if (comFotos) exigirPermissao(ator, "evidencia.enviar");
    const temManutencao = entrada.itens.some((i) => i.destino === "MANUTENCAO");
    if (temManutencao) exigirPermissao(ator, "ativo.transicionar");
    const chave = entrada.chaveRequisicao && UUID.test(entrada.chaveRequisicao) ? entrada.chaveRequisicao : null;
    if (chave) {
      const ja = await prisma.devolucao.findUnique({ where: { chaveRequisicao: chave }, select: { id: true, numero: true } });
      if (ja) return { ...ja, repetido: true };
    }
    if (!UUID.test(entrada.alocacaoId)) throw new ErroNegocio("Alocação não encontrada.");
    if (!entrada.itens.length) throw new ErroNegocio("Selecione ao menos um equipamento devolvido.");
    const itens = entrada.itens.map((i) => {
      const estadoFisico = ESTADOS_FISICOS.find((e) => e === i.estadoFisico);
      if (!estadoFisico) throw new ErroNegocio("Informe o estado físico de cada equipamento devolvido.");
      if (i.destino !== "AVALIACAO" && i.destino !== "MANUTENCAO") throw new ErroNegocio("Escolha o encaminhamento de cada equipamento.");
      const observacoes = textoOpcional(i.observacoes, 1000, "Observações do equipamento");
      if (i.destino === "MANUTENCAO" && !observacoes) throw new ErroNegocio("Descreva o problema dos equipamentos encaminhados para manutenção.");
      if (!UUID.test(i.itemId)) throw new ErroNegocio("Item da alocação não encontrado.");
      return { ...i, estadoFisico, destino: i.destino as "AVALIACAO" | "MANUTENCAO", observacoes };
    });
    if (new Set(itens.map((i) => i.itemId)).size !== itens.length) throw new ErroNegocio("Equipamento repetido na devolução.");
    const recebidaEm = lerMomento(entrada.recebidaEm, "Data da devolução");
    const observacoes = textoOpcional(entrada.observacoes, 1000, "Observações");
    const fotosPorItem = new Map<string, FotoPreparada[]>(itens.map((i) => [i.itemId, prepararFotos(i.fotos ?? [])]));
    const todas = [...fotosPorItem.values()].flat();
    if (todas.length > 24) throw new ErroNegocio("Envie no máximo 24 fotos por devolução.");
    await gravarArquivosFotos(todas);

    try {
      return await prisma.$transaction(async (tx) => {
        const previa = await tx.alocacao.findUnique({ where: { id: entrada.alocacaoId }, select: { itens: { where: { aberto: true }, select: { ativoId: true } } } });
        if (!previa) throw new ErroNegocio("Alocação não encontrada.");
        await travarAtivos(tx, previa.itens.map((i) => i.ativoId));
        const a = await tx.alocacao.findUniqueOrThrow({
          where: { id: entrada.alocacaoId },
          include: { colaborador: { select: { id: true, nome: true } }, itens: { where: { aberto: true }, include: { ativo: true } } },
        });
        if (a.estado !== "ATIVA") throw new ErroNegocio(a.estado === "RESERVADA" ? "Reserva não tem devolução: cancele a reserva." : "Esta alocação não tem equipamentos com o colaborador.");
        const abertos = new Map(a.itens.map((i) => [i.id, i]));
        for (const i of itens) if (!abertos.has(i.itemId)) throw new ErroNegocio("Um dos equipamentos já foi devolvido ou não pertence a esta alocação.");
        const numero = await proximoNumero(tx, "DEV", recebidaEm);
        const devolucao = await tx.devolucao.create({
          data: {
            numero,
            alocacaoId: a.id,
            colaboradorId: a.colaborador.id,
            abrangencia: itens.length === a.itens.length ? "TOTAL" : "PARCIAL",
            recebidaEm,
            recebidaPorNome: ator.nome,
            observacoes,
            chaveRequisicao: chave,
          },
        });
        for (const i of itens) {
          const item = abertos.get(i.itemId)!;
          const itemDevolucao = await tx.itemDevolucao.create({
            data: { devolucaoId: devolucao.id, itemAlocacaoId: item.id, estadoFisico: i.estadoFisico, destino: i.destino, observacoes: i.observacoes },
          });
          await encerrarItem(tx, ator, item.id, "DEVOLUCAO", recebidaEm);
          await cancelarTransferenciaPendente(tx, ator, item.ativo.id, `devolução registrada (${numero}).`, recebidaEm);
          const rotulo = rotuloAtivo(item.ativo);
          let manutencaoId: string | undefined;
          if (i.destino === "MANUTENCAO") {
            const m = await tx.manutencao.create({
              data: {
                ativoId: item.ativo.id,
                motivo: "Avaria identificada na devolução",
                observacoes: i.observacoes!,
                abertaEm: recebidaEm,
                abertaPorNome: ator.nome,
                recolhidoDeId: a.colaborador.id,
                recolhidoDeNome: a.colaborador.nome,
                recolhimentoConfirmadoEm: recebidaEm,
                devolucaoId: devolucao.id,
              },
            });
            manutencaoId = m.id;
            await tx.itemAlocacao.update({ where: { id: item.id }, data: { manutencaoId: m.id } });
          }
          await mudarSituacao(tx, ator, { id: item.ativo.id, situacao: item.ativo.situacao as Situacao, rotulo }, i.destino === "MANUTENCAO" ? "MANUTENCAO" : "DEVOLVIDO_EM_AVALIACAO", {
            tipo: "DEVOLUCAO",
            colaborador: a.colaborador,
            alocacaoId: a.id,
            devolucaoId: devolucao.id,
            manutencaoId,
            observacao: `${numero}: ${i.destino === "MANUTENCAO" ? "encaminhado para manutenção" : "encaminhado para avaliação"}${i.observacoes ? ` — ${i.observacoes}` : ""}.`,
            quando: recebidaEm,
          });
          const fotos = fotosPorItem.get(i.itemId) ?? [];
          if (fotos.length) {
            await tx.fotoAtivo.createMany({
              data: fotos.map((f) => ({ ...dadosFoto(f, item.ativo.id, ator), contexto: "DEVOLUCAO" as const, itemDevolucaoId: itemDevolucao.id })),
            });
          }
        }
        await encerrarAlocacaoSemItens(tx, a.id);
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "devolucao.registrar", { id: a.id, descricao: `${a.numero} / ${numero}` }, {
            abrangencia: itens.length === a.itens.length ? "TOTAL" : "PARCIAL",
            equipamentos: itens.length,
            paraManutencao: itens.filter((i) => i.destino === "MANUTENCAO").length,
            fotos: todas.length,
          }),
        );
        return { id: devolucao.id, numero, repetido: false };
      });
    } catch (erro) {
      await descartarFotos(todas.map((f) => f.chave));
      if (chave) {
        const ja = await prisma.devolucao.findUnique({ where: { chaveRequisicao: chave }, select: { id: true, numero: true } });
        if (ja) return { ...ja, repetido: true };
      }
      throw traduzirConflito(erro);
    }
  });
}

/** Colaboradores que já tiveram alocação (filtro da lista). */
export async function colaboradoresComAlocacao(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "ativo.ver");
    const linhas = await prisma.alocacao.findMany({ distinct: ["colaboradorId"], select: { colaborador: { select: { id: true, nome: true } } } });
    return linhas.map((l) => l.colaborador).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });
}
