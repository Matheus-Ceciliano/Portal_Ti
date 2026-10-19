/**
 * Componentes internos dos notebooks (sem banco): memória RAM, SSD e HD. A configuração do
 * notebook é formada por peças — originais (só a especificação, sem identificação individual)
 * ou componentes físicos do estoque (RAM001, SSD001, HDD001...). A configuração atual é a soma
 * das peças vigentes: a peça que substitui a original entra no lugar dela, nunca se soma a ela.
 */

export const COMPONENTES = ["MEMORIA_RAM", "SSD", "HD"] as const;
export type TipoComponente = (typeof COMPONENTES)[number];
export type TipoArmazenamento = Exclude<TipoComponente, "MEMORIA_RAM">;

export const ehComponente = (categoria: string): categoria is TipoComponente => (COMPONENTES as readonly string[]).includes(categoria);

export const ROTULO_COMPONENTE: Record<TipoComponente, string> = { MEMORIA_RAM: "Memória RAM", SSD: "SSD", HD: "HD" };

/** Identificação automática: RAM001, SSD001, HDD001 (a sequência nunca reaproveita números). */
export const PREFIXO_COMPONENTE: Record<TipoComponente, string> = { MEMORIA_RAM: "RAM", SSD: "SSD", HD: "HDD" };
export const identificadorComponente = (tipo: TipoComponente, sequencia: number) => `${PREFIXO_COMPONENTE[tipo]}${String(sequencia).padStart(3, "0")}`;

export const TECNOLOGIAS_RAM = ["DDR3", "DDR3L", "DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X"] as const;
export const INTERFACES: Record<TipoArmazenamento, readonly string[]> = { SSD: ["SATA", "NVMe/PCIe"], HD: ["SATA", "IDE"] };
export const FORMATOS: Record<TipoComponente, readonly string[]> = {
  MEMORIA_RAM: ["SO-DIMM", "DIMM"],
  SSD: ['2,5"', "M.2 2280", "M.2 2242", "M.2 2230", "mSATA"],
  HD: ['2,5"', '3,5"'],
};
export const CAPACIDADES: Record<TipoComponente, readonly number[]> = {
  MEMORIA_RAM: [2, 4, 8, 12, 16, 24, 32, 48, 64],
  SSD: [120, 128, 240, 256, 480, 500, 512, 960, 1000, 2000, 4000],
  HD: [250, 320, 500, 1000, 2000, 4000],
};
/** Limites de validação (GB). */
export const CAPACIDADE_MAXIMA: Record<TipoComponente, number> = { MEMORIA_RAM: 512, SSD: 32000, HD: 32000 };

export const formatarCapacidade = (gb: number) => (gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : `${gb} GB`);

export type EspecPeca = {
  tipo: TipoComponente;
  capacidadeGb: number;
  tecnologia?: string | null;
  interfaceConexao?: string | null;
  formato?: string | null;
};

/** "16 GB DDR4", "SSD NVMe/PCIe 512 GB", "HD SATA 1 TB". */
export function descreverPeca(p: EspecPeca): string {
  if (p.tipo === "MEMORIA_RAM") return [formatarCapacidade(p.capacidadeGb), p.tecnologia].filter(Boolean).join(" ");
  return [p.tipo, p.interfaceConexao, formatarCapacidade(p.capacidadeGb)].filter(Boolean).join(" ");
}

/** Configuração a partir das peças vigentes: RAM total e lista de armazenamento, sem contagem duplicada. */
export function resumirConfiguracao(pecas: EspecPeca[]) {
  const memorias = pecas.filter((p) => p.tipo === "MEMORIA_RAM");
  const ramTotalGb = memorias.reduce((s, p) => s + p.capacidadeGb, 0);
  const tecnologias = [...new Set(memorias.map((p) => p.tecnologia).filter((t): t is string => Boolean(t)))];
  const memoria = memorias.length ? [formatarCapacidade(ramTotalGb), tecnologias.join("/")].filter(Boolean).join(" ") : null;
  const discos = pecas.filter((p) => p.tipo !== "MEMORIA_RAM");
  const armazenamento = discos.length ? discos.map(descreverPeca).join(" + ") : null;
  const texto = [memoria ? `RAM ${memoria}` : null, armazenamento].filter(Boolean).join(" · ") || "Sem peças registradas";
  return { ramTotalGb, memoria, armazenamento, texto };
}

/** Configuração original informada no cadastro do notebook (sem peças individuais). */
export type ConfiguracaoOriginal = {
  memoria: { capacidadeGb: number; tecnologia: string | null } | null;
  armazenamento: { tipo: TipoArmazenamento; capacidadeGb: number; interfaceConexao: string | null }[];
};

export const pecasDaConfiguracao = (c: ConfiguracaoOriginal): EspecPeca[] => [
  ...(c.memoria ? [{ tipo: "MEMORIA_RAM" as const, capacidadeGb: c.memoria.capacidadeGb, tecnologia: c.memoria.tecnologia }] : []),
  ...c.armazenamento.map((a) => ({ tipo: a.tipo, capacidadeGb: a.capacidadeGb, interfaceConexao: a.interfaceConexao })),
];

/** Substituição: memória só por memória; SSD e HD entre si (ex.: HD trocado por SSD). */
export const compativeis = (a: TipoComponente, b: TipoComponente) => (a === "MEMORIA_RAM") === (b === "MEMORIA_RAM");

/**
 * Sugestão para preencher o formulário a partir do texto antigo ("16 GB", "SSD 512 GB"). Só
 * preenche a tela; nada é gravado sem a confirmação da TI.
 */
export function sugerirConfiguracao(memoriaRam: string | null, armazenamento: string | null) {
  const gb = (texto: string) => {
    const m = texto.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return Math.round(m[2].toUpperCase() === "TB" ? n * 1000 : n);
  };
  const memoria = memoriaRam ? gb(memoriaRam) : null;
  const tecnologia = memoriaRam ? (TECNOLOGIAS_RAM.find((t) => new RegExp(`\\b${t}\\b`, "i").test(memoriaRam)) ?? null) : null;
  const disco = armazenamento ? gb(armazenamento) : null;
  const tipo: TipoArmazenamento | null = armazenamento ? (/\bHD/i.test(armazenamento) && !/SSD/i.test(armazenamento) ? "HD" : "SSD") : null;
  const interfaceConexao = armazenamento && /nvme|pcie/i.test(armazenamento) ? "NVMe/PCIe" : armazenamento && /sata/i.test(armazenamento) ? "SATA" : null;
  return { memoria, tecnologia, armazenamento: disco && tipo ? { tipo, capacidadeGb: disco, interfaceConexao } : null };
}

export const ROTULO_INTERVENCAO = {
  CONFIGURACAO_ORIGINAL: "Configuração original",
  INSTALACAO: "Instalação",
  REMOCAO: "Remoção",
  SUBSTITUICAO: "Substituição",
} as const;
