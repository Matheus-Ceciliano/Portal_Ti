import type { Prisma } from "@/generated/prisma/client";
import { obterConectores } from "@/integrations/fabrica";
import type { CenarioSimulacao } from "@/integrations/core/tipos";
import type { Ator } from "@/server/authz/ator";
import { executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { FORA_DE_EQUIPAMENTOS } from "@/lib/inventario";
import { nomeDaPessoa } from "@/server/dados-ficticios/cadastros";
import { CHAMADOS, TUTORIAIS } from "@/server/dados-ficticios/operacao";
import { prisma } from "@/server/db";
import { listarMeusTers } from "./ter-colaborador";
import { listarMeusDocumentos } from "./termos";
import { rotuloTipo, SELECAO_TIPO } from "./inventario-base";

export { listarMeusDocumentos, listarTermos } from "./termos";

/* Inventário (banco do portal) */

/**
 * Equipamentos da própria pessoa: sempre filtrados pelo ator, mesmo para a TI. Entregues
 * (sob responsabilidade desde a entrega física) e reservados (ainda não entregues).
 */
export async function listarMeusEquipamentos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "ativo.ver");
    const itens = await prisma.itemAlocacao.findMany({
      where: { aberto: true, alocacao: { colaboradorId: ator.colaboradorId, estado: { in: ["ATIVA", "RESERVADA"] } } },
      orderBy: { alocacao: { criadaEm: "desc" } },
      select: {
        ativo: { select: { id: true, categoria: true, ...SELECAO_TIPO, nomeDispositivo: true, patrimonio: true, marca: true, modelo: true } },
        alocacao: { select: { estado: true, entregueEm: true, previstaPara: true, criadaEm: true } },
      },
    });
    return itens.map((i) => ({
      id: i.ativo.id,
      categoria: i.ativo.categoria,
      tipo: rotuloTipo(i.ativo),
      nome: i.ativo.nomeDispositivo,
      patrimonio: i.ativo.patrimonio,
      modelo: `${i.ativo.marca} ${i.ativo.modelo}`,
      situacao: i.alocacao.estado === "ATIVA" ? ("ALOCADO" as const) : ("RESERVADO" as const),
      desde: (i.alocacao.entregueEm ?? i.alocacao.previstaPara ?? i.alocacao.criadaEm).toISOString(),
    }));
  });
}

export type MeuEquipamento = Awaited<ReturnType<typeof listarMeusEquipamentos>>[number];

/* Chamados */

export async function listarChamados(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "chamado.ver");
    const visiveis = escopo === "GRUPO" ? CHAMADOS : CHAMADOS.filter((c) => c.solicitanteId === ator.colaboradorId);
    return visiveis.map((c) => ({
      ...c,
      solicitante: nomeDaPessoa(c.solicitanteId),
      responsavel: c.responsavelId ? nomeDaPessoa(c.responsavelId) : null,
    }));
  });
}

export async function listarMeusChamados(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "chamado.ver");
    return CHAMADOS.filter((c) => c.solicitanteId === ator.colaboradorId).map((c) => ({
      ...c,
      responsavel: c.responsavelId ? nomeDaPessoa(c.responsavelId) : null,
    }));
  });
}

export async function listarTutoriais(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "tutorial.ver");
    return TUTORIAIS;
  });
}

/* Auditoria (dados reais do banco) */

export async function listarAuditoria(
  ator: Ator,
  filtro: { acao?: string; resultado?: "SUCESSO" | "NEGADO" | "FALHA"; pagina?: number },
) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "auditoria.ver");
    const where: Prisma.EventoAuditoriaWhereInput = {
      ...(filtro.acao ? { acao: { contains: filtro.acao, mode: "insensitive" } } : {}),
      ...(filtro.resultado ? { resultado: filtro.resultado } : {}),
    };
    const pagina = Math.max(1, filtro.pagina ?? 1);
    const porPagina = 15;
    const [total, eventos] = await Promise.all([
      prisma.eventoAuditoria.count({ where }),
      prisma.eventoAuditoria.findMany({
        where,
        orderBy: { criadoEm: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { total, pagina, paginas: Math.max(1, Math.ceil(total / porPagina)), eventos };
  });
}

/* Integrações (adaptadores simulados) */

export async function obterEstadoIntegracoes(ator: Ator, cenario: CenarioSimulacao = "NORMAL") {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "integracao.ver");
    const conectores = obterConectores(undefined, cenario);
    const [saudeM365, saudeTeams, licencas, equipes] = await Promise.all([
      conectores.microsoft365.verificarSaude(),
      conectores.teams.verificarSaude(),
      conectores.microsoft365.listarLicencas(),
      conectores.teams.listarEquipes(),
    ]);
    return { saude: [saudeM365, saudeTeams], licencas, equipes };
  });
}

/* Painéis */

export async function obterPainelTi(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "dashboard.ver");
    const [pessoasAtivas, empresasAtivas, contasPendentes, eventosRecentes, pessoasPorEmpresa, negacoes] =
      await Promise.all([
        prisma.colaborador.count({ where: { situacao: "ATIVO" } }),
        prisma.empresa.count({ where: { ativa: true } }),
        prisma.contaAcesso.count({ where: { senhaPessoalDefinidaEm: null, situacao: "ATIVA" } }),
        prisma.eventoAuditoria.findMany({ orderBy: { criadoEm: "desc" }, take: 6 }),
        prisma.empresa.findMany({
          orderBy: { nome: "asc" },
          select: { nome: true, sigla: true, _count: { select: { colaboradores: { where: { situacao: "ATIVO" } } } } },
        }),
        prisma.eventoAuditoria.count({
          where: { resultado: "NEGADO", criadoEm: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
        }),
      ]);

    const semCarregador = { categoria: { notIn: FORA_DE_EQUIPAMENTOS } }; // equipamentos: sem carregadores e componentes
    const [porSituacao, porEmpresaSituacao, empresas, termosPendentes, reservas] = await Promise.all([
      prisma.ativo.groupBy({ by: ["situacao"], where: semCarregador, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["empresaId", "situacao"], where: { ...semCarregador, situacao: { in: ["ALOCADO", "DISPONIVEL"] } }, _count: { _all: true } }),
      prisma.empresa.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      prisma.termo.count({ where: { tipo: "TER", estado: "AGUARDANDO_ASSINATURA" } }),
      prisma.itemAlocacao.findMany({
        where: { aberto: true, alocacao: { estado: "RESERVADA" }, ativo: semCarregador },
        orderBy: { alocacao: { previstaPara: "asc" } },
        take: 8,
        select: {
          id: true,
          ativo: { select: { id: true, marca: true, modelo: true, patrimonio: true, nomeDispositivo: true } },
          alocacao: { select: { id: true, numero: true, previstaPara: true, colaborador: { select: { nome: true } } } },
        },
      }),
    ]);
    const contar = (s: string) => porSituacao.find((p) => p.situacao === s)?._count._all ?? 0;
    const chamadosAbertos = CHAMADOS.filter((c) => c.estado !== "RESOLVIDO");
    const chamadosSemResponsavel = chamadosAbertos.filter((c) => !c.responsavelId);
    const daEmpresa = (empresaId: string, situacao: string) =>
      porEmpresaSituacao.find((p) => p.empresaId === empresaId && p.situacao === situacao)?._count._all ?? 0;

    return {
      real: {
        pessoasAtivas,
        empresasAtivas,
        contasPendentes,
        negacoesUltimos7Dias: negacoes,
        eventosRecentes,
        pessoasPorEmpresa: pessoasPorEmpresa.map((e) => ({ nome: e.nome, sigla: e.sigla, total: e._count.colaboradores })),
      },
      inventario: {
        ativosAlocados: contar("ALOCADO"),
        ativosDisponiveis: contar("DISPONIVEL"),
        ativosEmManutencao: contar("MANUTENCAO"),
        termosPendentes,
        /** Reservas (entregas futuras) mais próximas. */
        reservas: reservas.map((r) => ({
          id: r.id,
          ativoId: r.ativo.id,
          alocacaoId: r.alocacao.id,
          modelo: `${r.ativo.marca} ${r.ativo.modelo}`,
          patrimonio: r.ativo.patrimonio ?? r.ativo.nomeDispositivo ?? "—",
          colaborador: r.alocacao.colaborador.nome,
          previstaPara: r.alocacao.previstaPara?.toISOString().slice(0, 10) ?? null,
        })),
        totalReservados: contar("RESERVADO"),
        equipamentosPorEmpresa: empresas.map((e) => ({ sigla: e.sigla, nome: e.nome, alocados: daEmpresa(e.id, "ALOCADO"), disponiveis: daEmpresa(e.id, "DISPONIVEL") })),
      },
      ficticio: {
        chamadosAbertos: chamadosAbertos.length,
        chamadosSemResponsavel: chamadosSemResponsavel.map((c) => ({ ...c, solicitante: nomeDaPessoa(c.solicitanteId) })),
        chamadosPorEstado: (["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "RESOLVIDO"] as const).map((estado) => ({
          estado,
          total: CHAMADOS.filter((c) => c.estado === estado).length,
        })),
        chamadosPorPrioridade: (["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const).map((prioridade) => ({
          prioridade,
          total: chamadosAbertos.filter((c) => c.prioridade === prioridade).length,
        })),
      },
    };
  });
}

export async function obterPainelColaborador(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "portal.acessar");
    const [equipamentos, chamados, documentos, termos, tutoriais] = await Promise.all([
      listarMeusEquipamentos(ator),
      listarMeusChamados(ator),
      listarMeusDocumentos(ator),
      listarMeusTers(ator),
      listarTutoriais(ator),
    ]);
    return { equipamentos, chamados, documentos, termos, tutoriais: tutoriais.slice(0, 3) };
  });
}
