import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { cpfValido, somenteDigitos } from "@/lib/cpf";
import { ErroNegocio } from "@/server/authz/exigir";

/**
 * CPF cifrado na aplicação (DA-11): AES-256-GCM (IV aleatório de 12 bytes + etiqueta de 16
 * bytes, guardados junto) e HMAC-SHA-256 com chave separada para unicidade. O número nunca
 * vai para listas, logs ou auditoria; só `revelarCpf` o devolve, e quem chama audita.
 */

const VERSAO = 1;

/**
 * Lidas a cada uso (e não do cache da configuração): chaves incluídas no .env passam a valer
 * assim que o servidor recarrega o ambiente. O formato é validado também na inicialização.
 */
function lerChaves() {
  const cifra = process.env.CPF_CHAVE_CIFRA?.trim();
  const hmac = process.env.CPF_CHAVE_HMAC?.trim();
  if (!cifra || !hmac) return null;
  return { cifra: Buffer.from(cifra, "base64url"), hmac: Buffer.from(hmac, "base64url") };
}

function chaves() {
  const c = lerChaves();
  if (!c) throw new ErroNegocio("O cadastro de CPF ainda não está configurado neste ambiente.");
  if (c.cifra.length !== 32) throw new Error("CPF_CHAVE_CIFRA precisa ter 32 bytes.");
  if (c.hmac.length < 32) throw new Error("CPF_CHAVE_HMAC precisa ter ao menos 32 bytes.");
  return c;
}

export const cpfConfigurado = () => lerChaves() !== null;

/** Valida e prepara as três colunas do colaborador. */
export function protegerCpf(valor: string) {
  const digitos = somenteDigitos(valor);
  if (!cpfValido(digitos)) throw new ErroNegocio("CPF inválido: confira os 11 dígitos.");
  const { cifra, hmac } = chaves();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cifra, iv);
  const corpo = Buffer.concat([c.update(digitos, "utf8"), c.final()]);
  return {
    cpfCifrado: Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo]),
    cpfHmac: createHmac("sha256", hmac).update(digitos).digest("hex"),
    cpfFinal: digitos.slice(-2),
  };
}

/** Só para um caso de uso autorizado e auditado pelo chamador (montagem do PDF do TER). */
export function revelarCpf(cifrado: Uint8Array): string {
  const dados = Buffer.from(cifrado);
  if (dados[0] !== VERSAO) throw new Error("Versão de cifra do CPF desconhecida.");
  const d = createDecipheriv("aes-256-gcm", chaves().cifra, dados.subarray(1, 13));
  d.setAuthTag(dados.subarray(13, 29));
  return Buffer.concat([d.update(dados.subarray(29)), d.final()]).toString("utf8");
}
