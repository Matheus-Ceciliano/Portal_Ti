import { prisma } from "@/server/db";
import { hmac } from "./senha";

/**
 * Limitador de tentativas persistido no PostgreSQL (DA-27). Consultado antes de
 * qualquer verificação de senha. Chaves de e-mail são HMAC: o e-mail não fica em claro.
 */
export type Regra = { maximo: number; janelaMs: number; bloqueioMs: number };

const MIN = 60_000;
export const REGRAS = {
  entrarEmail: { maximo: 5, janelaMs: 15 * MIN, bloqueioMs: 15 * MIN },
  entrarIp: { maximo: 30, janelaMs: 15 * MIN, bloqueioMs: 15 * MIN },
  segundoFator: { maximo: 5, janelaMs: 10 * MIN, bloqueioMs: 15 * MIN },
  ativacao: { maximo: 5, janelaMs: 30 * MIN, bloqueioMs: 30 * MIN },
} satisfies Record<string, Regra>;

export const chaveEmail = (email: string) => `email:${hmac(email.trim().toLowerCase(), "limite")}`;
export const chaveIp = (ip: string) => `ip:${hmac(ip, "limite")}`;

export async function estaBloqueado(chaves: string[], agora = new Date()): Promise<boolean> {
  const registros = await prisma.limiteTentativa.findMany({ where: { chave: { in: chaves } } });
  return registros.some((r) => r.bloqueadoAte !== null && r.bloqueadoAte > agora);
}

/** Registra uma falha; devolve true quando esta falha disparou o bloqueio temporário. */
export async function registrarFalha(chave: string, regra: Regra, agora = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.limiteTentativa.findUnique({ where: { chave } });
    const janelaVencida = !atual || agora.getTime() - atual.janelaInicio.getTime() > regra.janelaMs;
    const falhas = janelaVencida ? 1 : atual.falhas + 1;
    const bloqueia = falhas >= regra.maximo;
    await tx.limiteTentativa.upsert({
      where: { chave },
      create: {
        chave,
        falhas,
        janelaInicio: agora,
        bloqueadoAte: bloqueia ? new Date(agora.getTime() + regra.bloqueioMs) : null,
      },
      update: {
        falhas: bloqueia ? 0 : falhas,
        janelaInicio: janelaVencida || bloqueia ? agora : atual.janelaInicio,
        bloqueadoAte: bloqueia ? new Date(agora.getTime() + regra.bloqueioMs) : atual?.bloqueadoAte,
      },
    });
    return bloqueia;
  });
}

export async function limparFalhas(chave: string) {
  await prisma.limiteTentativa.deleteMany({ where: { chave } });
}
