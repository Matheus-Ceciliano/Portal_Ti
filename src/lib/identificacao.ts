/**
 * Identificação automática dos equipamentos (regras puras; a numeração é do PostgreSQL).
 * - Notebook: prefixo + código de nomenclatura do processador + sequência por código (NBI5001).
 * - Carregador: nome do notebook + .C + sequência por notebook (NBI5001.C1).
 * - Kit: prefixo + sequência do kit (KTM01); cada peça recebe .T, .M ou .H (KTM01.T).
 * - Demais: prefixo + sequência (MNT001).
 * A sequência começa nos dígitos da categoria e cresce sem cortar números (999 → 1000).
 */

export const REGRAS = ["PROCESSADOR", "CARREGADOR", "KIT", "SEQUENCIAL", "NENHUMA"] as const;
export type Regra = (typeof REGRAS)[number];

export const PARTES_KIT = ["TECLADO", "MOUSE", "RECEPTOR"] as const;
export type ParteKit = (typeof PARTES_KIT)[number];
export const SUFIXO_PARTE: Record<ParteKit, string> = { TECLADO: "T", MOUSE: "M", RECEPTOR: "H" };
export const ROTULO_PARTE: Record<ParteKit, string> = { TECLADO: "Teclado", MOUSE: "Mouse", RECEPTOR: "Hub/receptor" };

/** Abreviação: só letras (2 a 6). O limite letra/número separa prefixo e sequência sem ambiguidade. */
export const FORMATO_PREFIXO = /^[A-Z]{2,6}$/;
export const DIGITOS_MINIMO = 2;
export const DIGITOS_MAXIMO = 6;

export const normalizarPrefixo = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

export const formatarSequencia = (sequencia: number, digitos: number) => String(sequencia).padStart(digitos, "0");

export function montarIdentificador(regra: Regra, prefixo: string, digitos: number, sequencia: number, codigoProcessador?: string | null): string {
  if (regra === "PROCESSADOR") {
    if (!codigoProcessador) throw new Error("Processador sem código de nomenclatura.");
    return `${prefixo}${codigoProcessador}${formatarSequencia(sequencia, digitos)}`;
  }
  return `${prefixo}${formatarSequencia(sequencia, digitos)}`;
}

export const nomeParteKit = (codigoKit: string, parte: ParteKit) => `${codigoKit}.${SUFIXO_PARTE[parte]}`;

/** Escopo da sequência: uma por abreviação; no notebook, uma por código do processador (NBI3, NBI5...). */
export const escopoSequencia = (regra: Regra, prefixo: string, codigoProcessador?: string | null) => (regra === "PROCESSADOR" ? `ID:${prefixo}${codigoProcessador}` : `ID:${prefixo}`);

/** Padrão (POSIX) dos nomes já existentes do escopo, para continuar depois do maior número. */
export const padraoExistentes = (regra: Regra, prefixo: string, codigoProcessador?: string | null) =>
  regra === "PROCESSADOR" ? `^${prefixo}${codigoProcessador}([0-9]+)$` : regra === "KIT" ? `^${prefixo}([0-9]+)(\\.[A-Z])?$` : `^${prefixo}([0-9]+)$`;

export const DESCRICAO_REGRA: Record<Regra, string> = {
  PROCESSADOR: "Processador + sequência",
  CARREGADOR: "Notebook + .C + sequência",
  KIT: "Sequência do kit",
  SEQUENCIAL: "Sequência",
  NENHUMA: "Sem identificação automática",
};

/** Exemplo do formato da regra (tabela de categorias e prévia). */
export function exemploRegra(regra: Regra, prefixo: string | null, digitos: number) {
  const n = formatarSequencia(1, digitos);
  if (regra === "PROCESSADOR") return `${prefixo}5${n}`;
  if (regra === "CARREGADOR") return "NBI5001.C1";
  if (regra === "KIT") return `${prefixo}${n}.T`;
  if (regra === "SEQUENCIAL") return `${prefixo}${n}`;
  return null;
}
