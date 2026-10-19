import type { EstadoAlocacao, Prisma } from "@/generated/prisma/client";
import { ehComponente } from "@/lib/componentes";
import { CATEGORIAS_COMPONENTE, ESTADOS_FISICOS, ROTULO_CATEGORIA, ROTULO_SITUACAO, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import {
  cancelarTransferenciaPendente,
  dadosFoto,
  descartarFotos,
  encerrarAlocacaoSemItens,
  encerrarItem,
  gravarArquivosFotos,
  lerData,
  lerMomento,
  mudarSituacao,
  prepararFotos,
  proximoNumero,
  rotuloAtivo,
  traduzirConflito,
  travarAtivos,
  urlFoto,
  UUID,
  type FotoEnviada,
  type FotoPreparada,
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

export async function listarAlocacoes(ator: Ator, f: FiltroAlocacoes = {}) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "ativo.ver");
    const where = ondeAlocacoes(f);
    const porPagina = f.porPagina ?? 12;
    const [total, totalGeral, porEstado, equipamentosEntregues, terPendente] = await Promise.all([
      prisma.alocacao.count({ where }),
      prisma.alocacao.count(),
      prisma.alocacao.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.itemAlocacao.count({ where: { aberto: true, alocacao: { estado: "ATIVA" } } }),
      prisma.alocacao.count({ where: { estado: "ATIVA", termos: { none: { tipo: "TER", estado: "ASSINADO" } } } }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const linhas = await prisma.alocacao.findMany({
      where,
      orderBy: [{ criadaEm: f.ordem === "antigas" ? "asc" : "desc" }, { numero: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
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
    });
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
                ativo: {
                  select: {
                    id: true,
                    categoria: true,
                    nomeDispositivo: true,
                    patrimonio: true,
                    marca: true,
                    modelo: true,
                    numeroSerie: true,
                    situacao: true,
                    notebookId: true,
                    fotos: { where: { contexto: "CADASTRO" }, orderBy: [{ tipo: "asc" }], take: 1, select: { id: true } },
                  },
                },
                itemDevolucao: {
                  include: {
                    devolucao: { select: { id: true, numero: true, recebidaEm: true, recebidaPorNome: true } },
                    fotos: { select: { id: true, tipo: true } },
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
      criadaEm: a.criadaEm.toISOString(),
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
          rotuloCategoria: ROTULO_CATEGORIA[i.ativo.categoria],
          nome: i.ativo.nomeDispositivo,
          patrimonio: i.ativo.patrimonio,
          marca: i.ativo.marca,
          modelo: i.ativo.modelo,
          numeroSerie: i.ativo.numeroSerie,
          situacao: i.ativo.situacao,
          carregadorDe: i.ativo.notebookId,
          miniatura: i.ativo.fotos[0] ? urlFoto(i.ativo.fotos[0].id) : null,
        },
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

/* Opções do formulário de nova alocação */

export async function opcoesNovaAlocacao(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "alocacao.criar");
    exigirGrupo(ator, "ativo.ver");
    const [colaboradores, disponiveis] = await Promise.all([
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
          nomeDispositivo: true,
          patrimonio: true,
          marca: true,
          modelo: true,
          notebookId: true,
          empresa: { select: { id: true, nome: true, sigla: true } },
        },
      }),
    ]);
    return {
      colaboradores,
      equipamentos: disponiveis.map((a) => ({ ...a, rotulo: rotuloAtivo(a), rotuloCategoria: ROTULO_CATEGORIA[a.categoria] })),
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
  /** Entrega: data e hora (ISO, não futura). Reserva: data prevista (AAAA-MM-DD). */
  data?: string | null;
  observacoes?: string | null;
  chaveRequisicao?: string;
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
    const entregar = entrada.modo === "ENTREGAR";
    const entregueEm = entregar ? lerMomento(entrada.data, "Data da entrega") : null;
    const previstaPara = entregar ? null : lerData(entrada.data, "Data prevista");
    if (previstaPara && previstaPara.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      throw new ErroNegocio("Data prevista: não pode estar no passado.");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Trava os equipamentos e só então confere a situação: duas alocações simultâneas do
        // mesmo patrimônio não passam (o índice único do item aberto é a última barreira).
        await travarAtivos(tx, ids);
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
        const quando = entregueEm ?? new Date();
        const numero = await proximoNumero(tx, "ALO", quando);
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
            criadaPorNome: ator.nome,
            itens: { create: ativos.map((a) => ({ ativoId: a.id, empresaProprietariaId: a.empresaId })) },
          },
        });
        for (const a of ativos) {
          await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo: rotuloAtivo(a) }, entregar ? "ALOCADO" : "RESERVADO", {
            tipo: entregar ? "ENTREGA" : "RESERVA",
            colaborador,
            alocacaoId: alocacao.id,
            observacao: entregar ? `${numero}: entrega física.` : `${numero}: reservado para entrega${previstaPara ? ` em ${previstaPara.toISOString().slice(0, 10).split("-").reverse().join("/")}` : ""}.`,
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
          }),
        );
        return { id: alocacao.id, numero, repetido: false };
      });
    } catch (erro) {
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
export async function confirmarEntrega(ator: Ator, entrada: { alocacaoId: string; data?: string | null }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "alocacao.confirmar_entrega");
    if (!UUID.test(entrada.alocacaoId)) throw new ErroNegocio("Alocação não encontrada.");
    const entregueEm = lerMomento(entrada.data, "Data da entrega");
    return prisma.$transaction(async (tx) => {
      const previa = await tx.alocacao.findUnique({ where: { id: entrada.alocacaoId }, select: { itens: { where: { aberto: true }, select: { ativoId: true } } } });
      if (!previa) throw new ErroNegocio("Alocação não encontrada.");
      await travarAtivos(tx, previa.itens.map((i) => i.ativoId));
      const a = await tx.alocacao.findUniqueOrThrow({
        where: { id: entrada.alocacaoId },
        include: { colaborador: { select: { id: true, nome: true } }, itens: { where: { aberto: true }, include: { ativo: true } } },
      });
      if (a.estado !== "RESERVADA") throw new ErroNegocio("Só uma reserva pode ter a entrega confirmada.");
      if (!a.itens.length) throw new ErroNegocio("A reserva não tem equipamentos.");
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
      await registrarAuditoria(tx, auditar(ator, origem, "alocacao.confirmar_entrega", { id: a.id, descricao: a.numero }, { equipamentos: a.itens.length }));
      return { numero: a.numero };
    });
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
