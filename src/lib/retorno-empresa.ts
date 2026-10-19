/**
 * Contexto de retorno da ficha do equipamento para a página da empresa.
 * O destino nunca vem pronto da URL: é remontado aqui com caminho fixo
 * (/ti/cadastros/empresas/<uuid>) e só com parâmetros conhecidos e valores curtos,
 * o que impede redirecionamento para outro site ou rota.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABAS = ["visao-geral", "colaboradores", "equipamentos", "alocacoes", "anexos"];
const CHAVES = ["tab", "busca", "situacao", "departamento", "categoria", "periodo", "ordenar", "direcao", "pagina"] as const;
/** Letras (com acento), números, espaço e pontuação simples; até 80 caracteres. */
const VALOR_SEGURO = /^[\p{L}\p{N} ._@'"-]{1,80}$/u;

export const idAtivoValido = (id: string) => UUID.test(id);

/** Parâmetros atuais da página da empresa → texto de retorno (somente chaves conhecidas). */
export function codificarRetorno(parametros: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const chave of CHAVES) {
    const v = parametros[chave];
    if (v === undefined || v === "") continue;
    q.set(chave, String(v));
  }
  return q.toString();
}

/** Link para a ficha do equipamento; com empresa, a ficha oferece "Voltar para <empresa>". */
export function hrefFichaEquipamento(ativoId: string, origem?: { empresaId: string; retorno: string }) {
  const base = `/ti/inventario/${encodeURIComponent(ativoId)}`;
  if (!origem) return base;
  const q = new URLSearchParams({ empresa: origem.empresaId, retorno: origem.retorno });
  return `${base}?${q}`;
}

/** Link para a ficha aberta a partir de uma pessoa: a ficha oferece "Voltar para <pessoa>". */
export function hrefFichaEquipamentoDaPessoa(ativoId: string, pessoaId: string) {
  return `/ti/inventario/${encodeURIComponent(ativoId)}?${new URLSearchParams({ pessoa: pessoaId })}`;
}

/** Pessoa de origem válida (só o id; o nome e a permissão são conferidos na página). */
export const lerPessoaOrigem = (pessoaId: string | undefined) => (pessoaId && UUID.test(pessoaId) ? pessoaId : null);

/** Valida o contexto recebido; null quando ausente ou inválido (a ficha volta ao Inventário). */
export function lerRetorno(empresaId: string | undefined, retorno: string | undefined): { empresaId: string; href: string } | null {
  if (!empresaId || !UUID.test(empresaId)) return null;
  const entrada = new URLSearchParams(retorno && retorno.length <= 500 ? retorno : "");
  const saida = new URLSearchParams();
  for (const chave of CHAVES) {
    const v = entrada.get(chave);
    if (!v || !VALOR_SEGURO.test(v)) continue;
    if (chave === "tab" && !ABAS.includes(v)) continue;
    if (chave === "pagina" && !/^\d{1,4}$/.test(v)) continue;
    saida.set(chave, v);
  }
  const q = saida.toString();
  return { empresaId, href: `/ti/cadastros/empresas/${empresaId}${q ? `?${q}` : ""}` };
}
