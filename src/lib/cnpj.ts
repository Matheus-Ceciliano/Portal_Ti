/**
 * CNPJ numérico e alfanumérico (IN RFB nº 2.229/2024, emissão a partir de julho de 2026):
 * 12 posições de base (0-9 e A-Z) + 2 dígitos verificadores numéricos. Cada caractere
 * vale (código ASCII − 48) no cálculo do módulo 11.
 *
 * Validar a estrutura e os dígitos NÃO prova que a empresa existe nem que está ativa.
 */

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Forma canônica de armazenamento: 14 caracteres maiúsculos, sem pontuação. */
export function normalizarCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digito(base: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + (base.charCodeAt(i) - 48) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function calcularDigitosCnpj(base12: string): string {
  const d1 = digito(base12, PESOS_1);
  const d2 = digito(`${base12}${d1}`, PESOS_2);
  return `${d1}${d2}`;
}

export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  return cnpj.slice(12) === calcularDigitosCnpj(cnpj.slice(0, 12));
}

/** CNPJ de dados fictícios do portal ("TESTE" na base): nunca vai para documento oficial. */
export const cnpjFicticio = (valor: string) => normalizarCnpj(valor).includes("TESTE");

/** Mensagem de erro amigável, ou null se o CNPJ é estruturalmente válido. */
export function problemaCnpj(valor: string): string | null {
  const cnpj = normalizarCnpj(valor);
  if (!cnpj) return "Informe o CNPJ.";
  if (cnpj.length !== 14) return "O CNPJ tem 14 caracteres. Confira se faltou algum.";
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return "Os dois últimos caracteres do CNPJ são sempre números.";
  if (!cnpjValido(cnpj)) return "CNPJ inválido: os dígitos verificadores não conferem.";
  return null;
}

/** 00.000.000/0000-00 (aceita letras na base). */
export function formatarCnpj(valor: string): string {
  const c = normalizarCnpj(valor).slice(0, 14);
  const partes = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
  let saida = partes[0];
  if (partes[1]) saida += `.${partes[1]}`;
  if (partes[2]) saida += `.${partes[2]}`;
  if (partes[3]) saida += `/${partes[3]}`;
  if (partes[4]) saida += `-${partes[4]}`;
  return saida;
}
