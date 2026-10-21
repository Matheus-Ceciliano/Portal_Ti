/**
 * CPF: só formato e dígitos verificadores (sem efeito colateral; vale no navegador e no
 * servidor). A cifra, o HMAC e a revelação ficam em src/server/cpf.ts.
 */

export const somenteDigitos = (valor: string | null | undefined) => (valor ?? "").replace(/\D/g, "");

/** 11 dígitos com os dois verificadores corretos; sequências repetidas (111.111.111-11) não valem. */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** 000.000.000-00 (aceita o valor incompleto, para a digitação). */
export function formatarCpf(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Exibição mascarada a partir dos dois últimos dígitos (PERMISSOES_RBAC.md: ***.***.***-12). */
export const mascararCpf = (final: string | null | undefined) => (final ? `***.***.***-${final}` : null);
