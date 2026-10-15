import {
  AUTOPROVISIONAMENTO,
  MATRIZ,
  PERFIS_ADMINISTRATIVOS,
  PERMISSOES_COLABORADOR,
  RESTRITAS_POR_ALVO,
  RESTRITAS_SEMPRE,
  ehConcedivel,
  type PerfilTi,
  type Permissao,
} from "./catalogo";

/** Estado de acesso da conta: só LIBERADO recebe permissões (ativação segura, Check 3). */
export type EstadoAcesso = "ATIVACAO_PENDENTE" | "ATIVACAO_TI_PENDENTE" | "LIBERADO";

export type AtorAutorizacao = {
  colaboradorId: string;
  estadoAcesso: EstadoAcesso;
  /** Perfis de TI que valem nesta requisição (ativação concluída e MFA verificado na sessão). */
  perfisAtivos: readonly PerfilTi[];
  permissoesIndividuais: readonly { id: string; permissao: string; validaAte: Date | null }[];
};

export type AlvoAutorizacao = {
  colaboradorId: string;
  /** Perfil de TI atribuído e não revogado, independentemente de ativação (visão conservadora). */
  temPerfilTiAtivo: boolean;
};

export type Escopo = "GRUPO" | "PROPRIO";

export type ResultadoAutorizacao =
  | { permitido: true; origem: string; escopo: Escopo }
  | {
      permitido: false;
      origem: "RESTRICAO_OBRIGATORIA" | "SEM_PERMISSAO" | "ATIVACAO_PENDENTE";
    };

export function temPerfilAdministrativo(perfis: readonly PerfilTi[]) {
  return perfis.some((p) => PERFIS_ADMINISTRATIVOS.includes(p));
}

export function restricaoObrigatoria(
  ator: AtorAutorizacao,
  permissao: Permissao,
  alvo?: AlvoAutorizacao,
): boolean {
  const restrito =
    !temPerfilAdministrativo(ator.perfisAtivos) || ator.perfisAtivos.includes("ESTAGIARIO_TI");
  if (!restrito) return false;
  if (RESTRITAS_SEMPRE.has(permissao)) return true;
  if (!RESTRITAS_POR_ALVO.has(permissao)) return false;
  if (!alvo) return true; // falha fechada
  return (
    alvo.temPerfilTiAtivo ||
    (AUTOPROVISIONAMENTO.has(permissao) && alvo.colaboradorId === ator.colaboradorId)
  );
}

/**
 * Permissão efetiva (PERMISSOES_RBAC.md §3.10): restrições obrigatórias primeiro;
 * depois perfil; depois concessões individuais (só com perfil de TI ativo e só das
 * concedíveis); por fim, nega. Contas não ativadas não recebem nenhuma permissão.
 */
export function permissaoEfetiva(
  ator: AtorAutorizacao,
  permissao: Permissao,
  alvo?: AlvoAutorizacao,
  agora: Date = new Date(),
): ResultadoAutorizacao {
  if (ator.estadoAcesso !== "LIBERADO") return { permitido: false, origem: "ATIVACAO_PENDENTE" };

  if (restricaoObrigatoria(ator, permissao, alvo)) {
    return { permitido: false, origem: "RESTRICAO_OBRIGATORIA" };
  }

  const doPerfil = ator.perfisAtivos.find((p) => MATRIZ[p].has(permissao));
  if (doPerfil) return { permitido: true, origem: `PERFIL:${doPerfil}`, escopo: "GRUPO" };

  if (ator.perfisAtivos.length > 0) {
    const individual = ator.permissoesIndividuais.find(
      (pi) =>
        pi.permissao === permissao &&
        ehConcedivel(pi.permissao) &&
        (pi.validaAte === null || pi.validaAte > agora),
    );
    if (individual) {
      return { permitido: true, origem: `INDIVIDUAL:${individual.id}`, escopo: "GRUPO" };
    }
  }

  if (PERMISSOES_COLABORADOR.includes(permissao)) {
    return { permitido: true, origem: "PERFIL:COLABORADOR", escopo: "PROPRIO" };
  }

  return { permitido: false, origem: "SEM_PERMISSAO" };
}
