import type { Prisma } from "@/generated/prisma/client";
import { obterConectores } from "@/integrations/fabrica";
import type { CenarioSimulacao } from "@/integrations/core/tipos";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { EMPRESAS, nomeDaPessoa } from "@/server/dados-ficticios/cadastros";
import { ATIVOS, CHAMADOS, TERMOS, TUTORIAIS } from "@/server/dados-ficticios/operacao";
import { prisma } from "@/server/db";

const nomeEmpresa = (id: string) => EMPRESAS.find((e) => e.id === id)?.nome ?? "—";

/* Inventário (dados fictícios em memória) */

export async function listarAtivos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "ativo.ver");
    const visiveis = escopo === "GRUPO" ? ATIVOS : ATIVOS.filter((a) => a.responsavelId === ator.colaboradorId);
    return visiveis.map((a) => ({
      ...a,
      empresa: nomeEmpresa(a.empresaId),
      responsavel: a.responsavelId ? nomeDaPessoa(a.responsavelId) : null,
    }));
  });
}

/** Equipamentos da própria pessoa: sempre filtrados pelo ator, mesmo para a TI. */
export async function listarMeusEquipamentos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "ativo.ver");
    return ATIVOS.filter(
      (a) => a.responsavelId === ator.colaboradorId && (a.situacao === "EM_USO" || a.situacao === "AGUARDANDO_ENTREGA"),
    );
  });
}

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

/* Termos TER/TDV */

export async function listarTermos(ator: Ator, tipo: "TER" | "TDV") {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "termo.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("termo.ver", "ESCOPO_PROPRIO");
    return TERMOS.filter((t) => t.tipo === tipo).map((t) => ({ ...t, colaborador: nomeDaPessoa(t.colaboradorId) }));
  });
}

/** Documentos do colaborador: só termos próprios e disponibilizados pela TI. */
export async function listarMeusDocumentos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "termo.ver");
    return TERMOS.filter((t) => t.colaboradorId === ator.colaboradorId && t.disponibilizado);
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

function contarPor<T>(itens: T[], chave: (i: T) => string) {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(chave(item), (mapa.get(chave(item)) ?? 0) + 1);
  return mapa;
}

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

    const ativosPorSituacao = contarPor(ATIVOS, (a) => a.situacao);
    const chamadosAbertos = CHAMADOS.filter((c) => c.estado !== "RESOLVIDO");
    const chamadosSemResponsavel = chamadosAbertos.filter((c) => !c.responsavelId);
    const termosPendentes = TERMOS.filter((t) => t.estado === "AGUARDANDO_ASSINATURA");
    const equipamentosPorEmpresa = EMPRESAS.map((e) => ({
      sigla: e.sigla,
      nome: e.nome,
      emUso: ATIVOS.filter((a) => a.empresaId === e.id && a.situacao === "EM_USO").length,
      disponiveis: ATIVOS.filter((a) => a.empresaId === e.id && a.situacao === "DISPONIVEL").length,
    }));

    return {
      real: {
        pessoasAtivas,
        empresasAtivas,
        contasPendentes,
        negacoesUltimos7Dias: negacoes,
        eventosRecentes,
        pessoasPorEmpresa: pessoasPorEmpresa.map((e) => ({ nome: e.nome, sigla: e.sigla, total: e._count.colaboradores })),
      },
      ficticio: {
        ativosEmUso: ativosPorSituacao.get("EM_USO") ?? 0,
        ativosDisponiveis: ativosPorSituacao.get("DISPONIVEL") ?? 0,
        ativosEmManutencao: ativosPorSituacao.get("EM_MANUTENCAO") ?? 0,
        aguardandoEntrega: ATIVOS.filter((a) => a.situacao === "AGUARDANDO_ENTREGA").map((a) => ({
          ...a,
          responsavel: nomeDaPessoa(a.responsavelId),
        })),
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
        termosPendentes: termosPendentes.map((t) => ({ ...t, colaborador: nomeDaPessoa(t.colaboradorId) })),
        equipamentosPorEmpresa,
      },
    };
  });
}

export async function obterPainelColaborador(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "portal.acessar");
    const [equipamentos, chamados, documentos, tutoriais] = await Promise.all([
      listarMeusEquipamentos(ator),
      listarMeusChamados(ator),
      listarMeusDocumentos(ator),
      listarTutoriais(ator),
    ]);
    return { equipamentos, chamados, documentos, tutoriais: tutoriais.slice(0, 3) };
  });
}
