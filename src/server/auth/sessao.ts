import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { pode } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { DURACAO_ABSOLUTA_SESSAO_S, obterAuth } from "./better-auth";

const MIN = 60_000;
/** Inatividade (Q-15, proposta): 30 min para quem tem perfil de TI; 8 h para o colaborador. */
export const INATIVIDADE_TI_MS = 30 * MIN;
export const INATIVIDADE_PORTAL_MS = 8 * 60 * MIN;

export type ContextoSessao = { ator: Ator; sessaoId: string; token: string };

/**
 * Lê a sessão uma vez por requisição. A biblioteca valida o token assinado; o portal
 * aplica a política própria (expiração absoluta, inatividade, situação da conta) e
 * monta o ator a partir do banco.
 */
export const obterSessao = cache(async (): Promise<ContextoSessao | null> => {
  const resultado = await obterAuth().api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!resultado) return null;

  const sessao = await prisma.sessao.findUnique({ where: { token: resultado.session.token } });
  if (!sessao) return null;

  const agora = Date.now();
  const ator = await carregarAtor(prisma, sessao.userId, { mfaVerificado: Boolean(sessao.mfaVerificadoEm) });
  const limiteInatividade = ator && ator.perfisAtribuidos.length > 0 ? INATIVIDADE_TI_MS : INATIVIDADE_PORTAL_MS;
  const ultimoUso = (sessao.ultimoUsoEm ?? sessao.createdAt).getTime();
  const expirouAbsoluta = agora - sessao.createdAt.getTime() > DURACAO_ABSOLUTA_SESSAO_S * 1000;
  const expirouInatividade = agora - ultimoUso > limiteInatividade;

  if (!ator || expirouAbsoluta || expirouInatividade) {
    await prisma.sessao.deleteMany({ where: { id: sessao.id } });
    return null;
  }
  if (agora - ultimoUso > MIN) {
    await prisma.sessao.update({ where: { id: sessao.id }, data: { ultimoUsoEm: new Date(agora) } });
  }
  return { ator, sessaoId: sessao.id, token: sessao.token };
});

/** Página da área de TI: sessão, ativação concluída, segundo fator e ti.acessar. */
export async function exigirAreaTi(): Promise<Ator> {
  const contexto = await obterSessao();
  if (!contexto) redirect("/entrar");
  const { ator } = contexto;
  if (ator.estadoAcesso !== "LIBERADO") redirect("/conta/ativar");
  if (!pode(ator, "ti.acessar")) redirect("/portal");
  return ator;
}

/** Página do portal do colaborador. */
export async function exigirPortal(): Promise<Ator> {
  const contexto = await obterSessao();
  if (!contexto) redirect("/entrar");
  if (contexto.ator.estadoAcesso !== "LIBERADO") redirect("/conta/ativar");
  if (!pode(contexto.ator, "portal.acessar")) redirect("/entrar");
  return contexto.ator;
}

/** Destino após entrar: a raiz decide pela situação da conta. */
export async function destinoInicial(): Promise<string> {
  const contexto = await obterSessao();
  if (!contexto) return "/entrar";
  if (contexto.ator.estadoAcesso !== "LIBERADO") return "/conta/ativar";
  return pode(contexto.ator, "ti.acessar") ? "/ti" : "/portal";
}
