/**
 * Catálogos do Inventário (marcas, modelos, processadores, sistemas operacionais e padrões
 * de memória): comparação e rótulos compartilhados entre o servidor e a interface.
 */

/** Chave de comparação (a mesma da função chave_catalogo do banco): "Dell" e "DELL" são iguais. */
export const chaveCatalogo = (texto: string | null | undefined) =>
  (texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Texto exibido: espaços simples, sem mudar maiúsculas e minúsculas. */
export const textoCatalogo = (texto: string | null | undefined) => (texto ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/** Windows 11 + Pro → "Windows 11 Pro". */
export const rotuloSistema = (s: { nome: string; versao: string | null }) => (s.versao ? `${s.nome} ${s.versao}` : s.nome);

/** Código de nomenclatura do processador no identificador do notebook (5 → NBI5001). */
export const FORMATO_CODIGO_NOMENCLATURA = /^[A-Z0-9]{1,3}$/;

export const TIPOS_PADRAO_MEMORIA = ["TECNOLOGIA", "FORMATO", "FREQUENCIA"] as const;
export type TipoPadraoMemoria = (typeof TIPOS_PADRAO_MEMORIA)[number];
export const ROTULO_PADRAO_MEMORIA: Record<TipoPadraoMemoria, string> = { TECNOLOGIA: "Tecnologia", FORMATO: "Formato", FREQUENCIA: "Frequência" };
/** Frequência em MHz (ex.: 3200). */
export const FORMATO_FREQUENCIA = /^[0-9]{3,5}$/;

/** Itens que se ativam e inativam pela lista (as categorias têm formulário próprio). */
export type ItemCatalogo = "marca" | "modelo" | "processador" | "sistema" | "memoria";

export const ABAS_CATALOGO = ["categorias", "marcas", "modelos", "processadores", "sistemas", "memorias", "checklists"] as const;
export type AbaCatalogo = (typeof ABAS_CATALOGO)[number];
export const ROTULO_ABA_CATALOGO: Record<AbaCatalogo, string> = {
  categorias: "Categorias",
  marcas: "Marcas",
  modelos: "Modelos",
  processadores: "Processadores",
  sistemas: "Sistemas operacionais",
  memorias: "Memórias",
  checklists: "Checklists de Inspeção",
};

/* Opções dos selects do cadastro de equipamentos (itens inativos vêm marcados). */

export type MarcaOpcao = { id: string; nome: string; ativa: boolean };
export type ModeloOpcao = { id: string; nome: string; marcaId: string; categoriaId: string; ativa: boolean };
export type ProcessadorOpcao = { id: string; modelo: string; fabricante: string | null; familia: string | null; codigo: string | null; ativa: boolean };
export type SistemaOpcao = { id: string; nome: string; versao: string | null; rotulo: string; categoriaIds: string[]; ativa: boolean };
export type PadraoMemoriaOpcao = { id: string; tipo: TipoPadraoMemoria; valor: string; ativa: boolean };

export type OpcoesCatalogos = {
  marcas: MarcaOpcao[];
  modelos: ModeloOpcao[];
  processadores: ProcessadorOpcao[];
  sistemas: SistemaOpcao[];
  memoria: PadraoMemoriaOpcao[];
};

/** Sistema disponível para a categoria: sem restrição configurada, vale para todas. */
export const sistemaServe = (s: Pick<SistemaOpcao, "categoriaIds">, categoriaId: string | null | undefined) =>
  s.categoriaIds.length === 0 || (categoriaId ? s.categoriaIds.includes(categoriaId) : false);

/** Ordem alfabética sem diferenciar maiúsculas, minúsculas e acentos ("dell" = "Dell"); números em ordem numérica. */
export const compararNomes = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
const porNome = compararNomes;
export const ordenarMarcas = <T extends { nome: string }>(l: T[]) => [...l].sort((a, b) => porNome(a.nome, b.nome));
export const ordenarProcessadores = <T extends { modelo: string }>(l: T[]) => [...l].sort((a, b) => porNome(a.modelo, b.modelo));
export const ordenarSistemas = <T extends { rotulo: string }>(l: T[]) => [...l].sort((a, b) => porNome(a.rotulo, b.rotulo));
