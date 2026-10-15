import { createHmac } from "node:crypto";

/** Implementação independente de TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) para os testes. */
function base32Decodificar(texto: string): Buffer {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const limpo = texto.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of limpo) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function segredoDaUri(uri: string): string {
  const segredo = new URL(uri).searchParams.get("secret");
  if (!segredo) throw new Error("URI TOTP sem segredo");
  return segredo;
}

export function gerarTotp(segredoBase32: string, instante = Date.now()): string {
  const contador = Math.floor(instante / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));
  const digest = createHmac("sha1", base32Decodificar(segredoBase32)).update(buffer).digest();
  const deslocamento = digest[digest.length - 1] & 0x0f;
  const valor = (digest.readUInt32BE(deslocamento) & 0x7fffffff) % 1_000_000;
  return valor.toString().padStart(6, "0");
}
