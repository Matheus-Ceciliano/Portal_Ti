import { prisma } from "@/server/db";
import { hmac } from "./senha";

const RETENCAO_MS = 5 * 60_000;

/**
 * Impede reutilização de um código TOTP já aceito (a biblioteca não faz esse controle).
 * Devolve false quando o código já foi usado pela conta dentro da retenção.
 */
export async function registrarUsoTotp(contaId: string, codigo: string): Promise<boolean> {
  await prisma.codigoTotpUsado.deleteMany({
    where: { contaId, usadoEm: { lt: new Date(Date.now() - RETENCAO_MS) } },
  });
  try {
    await prisma.codigoTotpUsado.create({ data: { contaId, hashCodigo: hmac(codigo, "totp") } });
    return true;
  } catch {
    return false;
  }
}
