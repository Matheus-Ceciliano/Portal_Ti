import { escopoSequencia, montarIdentificador, padraoExistentes, type Regra } from "@/lib/identificacao";
import { ErroNegocio } from "@/server/authz/exigir";
import type { ClienteBanco } from "@/server/db";

/**
 * Numeração dos identificadores no PostgreSQL. Cada escopo (abreviação; no notebook,
 * abreviação + código do processador) tem um contador em "contador_documento", incrementado de forma
 * atômica na transação do cadastro. O contador parte sempre do maior número já usado com
 * aquele padrão (cadastros antigos, troca de abreviação e volta), então nada colide e nenhum
 * número é reaproveitado — nem de equipamento baixado ou transferido.
 */

export type Gerador = { regra: Regra; prefixo: string | null; digitos: number; codigoProcessador?: string | null };

function exigirAutomatico(g: Gerador): asserts g is Gerador & { prefixo: string } {
  if (!g.prefixo || g.regra === "NENHUMA" || g.regra === "CARREGADOR") throw new ErroNegocio("Esta categoria não tem identificação automática.");
  if (g.regra === "PROCESSADOR" && !g.codigoProcessador) throw new ErroNegocio("Selecione o modelo do processador.");
}

/** Maior número já usado no escopo (nomes de equipamentos e, no kit, os códigos dos kits). */
async function maiorUsado(db: ClienteBanco, g: Gerador & { prefixo: string }) {
  const padrao = padraoExistentes(g.regra, g.prefixo, g.codigoProcessador);
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(MAX((substring("nome_dispositivo" from ${padrao}))::bigint), 0)::int AS n
    FROM "ativo" WHERE "nome_dispositivo" ~ ${padrao}`;
  if (g.regra !== "KIT") return n;
  const kits = `^${g.prefixo}([0-9]+)$`;
  const [{ k }] = await db.$queryRaw<{ k: number }[]>`
    SELECT COALESCE(MAX((substring("codigo" from ${kits}))::bigint), 0)::int AS k
    FROM "kit_equipamento" WHERE "codigo" ~ ${kits}`;
  return Math.max(n, k);
}

/** Próximo identificador, confirmado na transação do cadastro. */
export async function gerarIdentificador(tx: ClienteBanco, g: Gerador) {
  exigirAutomatico(g);
  const chave = escopoSequencia(g.regra, g.prefixo, g.codigoProcessador);
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const usado = await maiorUsado(tx, g);
    const [{ valor }] = await tx.$queryRaw<{ valor: number }[]>`
      INSERT INTO "contador_documento" (chave, valor) VALUES (${chave}, ${usado + 1})
      ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("contador_documento".valor + 1, ${usado + 1})
      RETURNING valor`;
    const nome = montarIdentificador(g.regra, g.prefixo, g.digitos, Number(valor), g.codigoProcessador);
    // Defesa extra (nome igual com outro número de dígitos): segue para o próximo número.
    const existe =
      g.regra === "KIT"
        ? await tx.kitEquipamento.findUnique({ where: { codigo: nome }, select: { id: true } })
        : await tx.ativo.findUnique({ where: { nomeDispositivo: nome }, select: { id: true } });
    if (!existe) return nome;
  }
  throw new ErroNegocio("Não foi possível gerar o identificador. Tente novamente.");
}

/** Prévia do próximo identificador. Não reserva o número: o definitivo sai ao salvar. */
export async function previaIdentificador(db: ClienteBanco, g: Gerador) {
  exigirAutomatico(g);
  const chave = escopoSequencia(g.regra, g.prefixo, g.codigoProcessador);
  const [usado, contador] = await Promise.all([maiorUsado(db, g), db.contadorDocumento.findUnique({ where: { chave }, select: { valor: true } })]);
  return montarIdentificador(g.regra, g.prefixo, g.digitos, Math.max(usado, contador?.valor ?? 0) + 1, g.codigoProcessador);
}
