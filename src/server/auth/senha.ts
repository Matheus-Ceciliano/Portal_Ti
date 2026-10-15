import { createHmac } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { obterConfiguracao } from "@/server/config";

/**
 * Hash de senha Argon2id (DA-25), parâmetros mínimos recomendados pela OWASP
 * (19 MiB, 2 iterações, 1 via). O pepper fica fora do banco (SENHA_PEPPER) e é
 * aplicado como "secret" do próprio Argon2. Os parâmetros ficam no hash (formato PHC).
 */
const ARGON2ID = 2; // Algorithm.Argon2id (const enum do pacote, inacessível com isolatedModules)

const PARAMETROS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function pepper() {
  return Buffer.from(obterConfiguracao().SENHA_PEPPER, "utf8");
}

export async function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, { ...PARAMETROS, secret: pepper() });
}

export async function verificarSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, { secret: pepper() });
  } catch {
    return false;
  }
}

/** HMAC com o pepper: usado para chaves do limitador e códigos de uso único (nunca em claro no banco). */
export function hmac(valor: string, contexto: string): string {
  return createHmac("sha256", obterConfiguracao().SENHA_PEPPER)
    .update(`${contexto}:${valor}`)
    .digest("base64url");
}

export const SENHA_MINIMO = 12;
export const SENHA_MAXIMO = 128;

const SENHAS_PROIBIDAS = new Set([
  "123456789012",
  "senha1234567",
  "senhasenha12",
  "vallur123456",
  "vallur@12345",
  "qwertyuiop12",
  "password1234",
  "portalti1234",
  "mudar@123456",
]);

/**
 * Política de senha provisória (a TI define a definitiva em Q-39): comprimento entre
 * 12 e 128 caracteres, sem a parte local do e-mail, fora da lista de senhas comuns.
 * Devolve a mensagem do problema ou null. A mensagem nunca repete a senha.
 */
export function validarPoliticaSenha(senha: string, email?: string): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`;
  if (senha.length > SENHA_MAXIMO) return `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`;
  const normalizada = senha.toLowerCase();
  if (SENHAS_PROIBIDAS.has(normalizada)) return "Essa senha é comum demais. Escolha outra.";
  if (/^(.)\1+$/.test(senha)) return "A senha não pode repetir um único caractere.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && normalizada.includes(local)) {
    return "A senha não pode conter o seu e-mail.";
  }
  return null;
}
