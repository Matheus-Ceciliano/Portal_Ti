/**
 * Regras puras do inventário (sem banco): categorias, situações e transições válidas
 * (MODELO_DE_DADOS.md §8.3), nome dos carregadores e normalização dos identificadores.
 * A tela usa para orientar o preenchimento; o servidor aplica de novo antes de gravar.
 */

export const CATEGORIAS = [
  "NOTEBOOK",
  "DESKTOP",
  "MONITOR",
  "CELULAR",
  "IMPRESSORA",
  "CARREGADOR",
  "TECLADO",
  "MOUSE",
  "KIT_TECLADO_MOUSE",
  "HEADSET",
  "OUTRO",
  "MEMORIA_RAM",
  "SSD",
  "HD",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  NOTEBOOK: "Notebook",
  DESKTOP: "Desktop",
  MONITOR: "Monitor",
  CELULAR: "Celular",
  IMPRESSORA: "Impressora",
  CARREGADOR: "Carregador",
  TECLADO: "Teclado",
  MOUSE: "Mouse",
  KIT_TECLADO_MOUSE: "Kit teclado e mouse",
  HEADSET: "Headset",
  OUTRO: "Outro",
  MEMORIA_RAM: "Memória RAM",
  SSD: "SSD",
  HD: "HD",
};

/** Categorias com processador, memória, armazenamento e sistema operacional. */
export const COM_CONFIGURACAO: readonly Categoria[] = ["NOTEBOOK", "DESKTOP", "CELULAR"];

/** Carregadores nascem do notebook (C1) ou da troca; não são cadastrados avulsos. */
export const CATEGORIAS_CADASTRO = CATEGORIAS.filter((c) => c !== "CARREGADOR");

/** Componentes internos (RAM, SSD, HD): estoque de TI, instalados em notebooks, nunca alocados a pessoas. */
export const CATEGORIAS_COMPONENTE: readonly Categoria[] = ["MEMORIA_RAM", "SSD", "HD"];
/** Equipamentos (o que pode ser alocado); carregadores ficam na ficha do notebook. */
export const CATEGORIAS_EQUIPAMENTO: readonly Categoria[] = CATEGORIAS.filter((c) => c !== "CARREGADOR" && !CATEGORIAS_COMPONENTE.includes(c));
/** Fora da lista de equipamentos: carregadores e componentes. */
export const FORA_DE_EQUIPAMENTOS: Categoria[] = ["CARREGADOR", ...CATEGORIAS_COMPONENTE];

export const SITUACOES = ["DISPONIVEL", "RESERVADO", "ALOCADO", "MANUTENCAO", "DEVOLVIDO_EM_AVALIACAO", "BAIXADO", "INSTALADO"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  DISPONIVEL: "Disponível",
  RESERVADO: "Reservado",
  ALOCADO: "Alocado",
  MANUTENCAO: "Em manutenção",
  DEVOLVIDO_EM_AVALIACAO: "Devolvido em avaliação",
  BAIXADO: "Baixado",
  INSTALADO: "Instalado",
};

/** Situações por grupo (filtros e indicadores). "Instalado" é exclusivo de componente. */
export const SITUACOES_EQUIPAMENTO: readonly Situacao[] = ["DISPONIVEL", "RESERVADO", "ALOCADO", "MANUTENCAO", "DEVOLVIDO_EM_AVALIACAO", "BAIXADO"];
export const SITUACOES_COMPONENTE: readonly Situacao[] = ["DISPONIVEL", "INSTALADO", "DEVOLVIDO_EM_AVALIACAO", "MANUTENCAO", "BAIXADO"];

/** Destino da peça removida de um notebook. */
export const DESTINOS_REMOCAO = ["DISPONIVEL", "DEVOLVIDO_EM_AVALIACAO", "MANUTENCAO", "BAIXADO"] as const;
export type DestinoRemocao = (typeof DESTINOS_REMOCAO)[number];
export const ROTULO_DESTINO_REMOCAO: Record<DestinoRemocao, string> = {
  DISPONIVEL: "Disponível em estoque",
  DEVOLVIDO_EM_AVALIACAO: "Devolvida em avaliação",
  MANUTENCAO: "Em manutenção",
  BAIXADO: "Baixada",
};

/**
 * Transições permitidas. Qualquer outra é recusada. Devolução nunca volta direto para
 * "disponível": passa por avaliação ou manutenção.
 */
export const TRANSICOES: Record<Situacao, readonly Situacao[]> = {
  // Avaliação a partir do estoque: carregador trocado ou com defeito. Instalação: só componente.
  DISPONIVEL: ["RESERVADO", "ALOCADO", "MANUTENCAO", "DEVOLVIDO_EM_AVALIACAO", "BAIXADO", "INSTALADO"],
  RESERVADO: ["DISPONIVEL", "ALOCADO"],
  ALOCADO: ["DEVOLVIDO_EM_AVALIACAO", "MANUTENCAO", "BAIXADO"],
  MANUTENCAO: ["DISPONIVEL", "BAIXADO"],
  DEVOLVIDO_EM_AVALIACAO: ["DISPONIVEL", "MANUTENCAO", "BAIXADO"],
  BAIXADO: [],
  // Componente removido do notebook: estoque, avaliação, manutenção ou baixa.
  INSTALADO: ["DISPONIVEL", "DEVOLVIDO_EM_AVALIACAO", "MANUTENCAO", "BAIXADO"],
};

export const transicaoValida = (de: Situacao, para: Situacao) => TRANSICOES[de].includes(para);

/** Situações a partir das quais o equipamento pode ir para manutenção. */
export const PODE_IR_PARA_MANUTENCAO: readonly Situacao[] = ["DISPONIVEL", "ALOCADO", "DEVOLVIDO_EM_AVALIACAO"];

/**
 * Transferência de colaborador: só a partir de uma alocação ativa (equipamento com alguém).
 * As demais situações explicam o bloqueio; a de empresa só não vale para baixado.
 */
export const BLOQUEIO_TRANSFERENCIA_COLABORADOR: Partial<Record<Situacao, string>> = {
  RESERVADO: "Equipamento reservado: confirme a entrega ou cancele a reserva em Alocações.",
  MANUTENCAO: "Equipamento em manutenção não pode ser transferido. Conclua a manutenção antes.",
  DEVOLVIDO_EM_AVALIACAO: "Equipamento em avaliação não pode ser transferido. Conclua a avaliação antes.",
  BAIXADO: "Equipamento baixado não pode ser transferido.",
};

/* Identificadores */

/** Patrimônio, nome do dispositivo e número de série: maiúsculas, sem espaços nas pontas. */
export function normalizarIdentificador(valor: string | null | undefined): string {
  return (valor ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Letras sem acento, números, hífen, ponto, barra e sublinhado (etiquetas e nomes de rede). */
export const FORMATO_IDENTIFICADOR = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

/**
 * Carregador do notebook: nome do notebook + ".C" + sequência (NBI5001 → NBI5001.C1,
 * NBI5001.C2…), no mesmo padrão das peças de kit (KTM01.T). Carregadores antigos mantêm o nome.
 */
export function nomeCarregador(nomeNotebook: string, sequencia: number): string {
  if (!Number.isInteger(sequencia) || sequencia < 1) throw new Error("Sequência de carregador inválida.");
  return `${normalizarIdentificador(nomeNotebook)}.C${sequencia}`;
}

/** Próxima posição livre na sequência de carregadores (as usadas nunca são reaproveitadas). */
export function proximaSequencia(usadas: readonly number[]): number {
  return usadas.length ? Math.max(...usadas) + 1 : 1;
}

/* Fotos */

export const TIPOS_FOTO = ["FRONTAL", "TELA", "TECLADO", "LATERAIS", "INFERIOR", "ETIQUETA_SERIE", "CARREGADOR", "OUTRA"] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number];

export const ROTULO_FOTO: Record<TipoFoto, string> = {
  FRONTAL: "Visão frontal",
  TELA: "Tela",
  TECLADO: "Teclado",
  LATERAIS: "Laterais",
  INFERIOR: "Parte inferior",
  ETIQUETA_SERIE: "Etiqueta de série",
  CARREGADOR: "Carregador",
  OUTRA: "Outras fotos",
};

/** Limites por envio (cada foto já chega reduzida pelo navegador; o servidor valida de novo). */
export const FOTO_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const FOTOS_POR_ENVIO = 12;

/* Movimentações, devolução e manutenção */

export const ROTULO_MOVIMENTACAO: Record<string, string> = {
  CADASTRO: "Cadastro",
  EDICAO: "Edição do cadastro",
  TRANSFERENCIA_EMPRESA: "Transferência entre empresas",
  TRANSFERENCIA_COLABORADOR: "Transferência entre colaboradores",
  CONFIGURACAO_ORIGINAL: "Configuração original",
  COMPONENTE_INSTALADO: "Componente instalado",
  COMPONENTE_REMOVIDO: "Componente removido",
  COMPONENTE_SUBSTITUIDO: "Componente substituído",
  ALUGUEL_INICIADO: "Aluguel entre empresas",
  ALUGUEL_ENCERRADO: "Fim do aluguel entre empresas",
  RESERVA: "Reserva para entrega",
  CANCELAMENTO_RESERVA: "Reserva cancelada",
  ENTREGA: "Entrega física",
  DEVOLUCAO: "Devolução",
  ENVIO_MANUTENCAO: "Envio para manutenção",
  CONCLUSAO_MANUTENCAO: "Manutenção concluída",
  LIBERACAO_AVALIACAO: "Avaliação concluída",
  CARREGADOR_VINCULADO: "Carregador vinculado",
  CARREGADOR_DESVINCULADO: "Carregador desvinculado",
};

export const ESTADOS_FISICOS = ["EXCELENTE", "BOM", "REGULAR", "DANIFICADO"] as const;
export const ROTULO_ESTADO_FISICO: Record<(typeof ESTADOS_FISICOS)[number], string> = {
  EXCELENTE: "Excelente",
  BOM: "Bom",
  REGULAR: "Regular",
  DANIFICADO: "Danificado",
};

export const ROTULO_DESTINO_DEVOLUCAO = { AVALIACAO: "Avaliação", MANUTENCAO: "Manutenção" } as const;

export const MOTIVOS_CARREGADOR = ["TROCA", "PERDA", "DEFEITO"] as const;
export const ROTULO_MOTIVO_CARREGADOR: Record<(typeof MOTIVOS_CARREGADOR)[number], string> = {
  TROCA: "Troca",
  PERDA: "Perda",
  DEFEITO: "Defeito",
};

/**
 * Situação do carregador desvinculado: perdido vira baixado; trocado ou com defeito vai para
 * avaliação. Nunca volta sozinho para "disponível".
 */
export function situacaoAposDesvinculo(motivo: (typeof MOTIVOS_CARREGADOR)[number]): Situacao {
  return motivo === "PERDA" ? "BAIXADO" : "DEVOLVIDO_EM_AVALIACAO";
}

/** Número da alocação: AL + sequência de pelo menos 4 dígitos (AL0001, AL0032...). */
export const numeroAlocacao = (sequencia: number) => `AL${String(sequencia).padStart(4, "0")}`;

/** Número do TER: TER0001, TER0002... (mesmo padrão das alocações). */
export const numeroTer = (sequencia: number) => `TER${String(sequencia).padStart(4, "0")}`;

/** Número legível de documento: PREFIXO-AAAA-NNNN. */
export function numeroDocumento(prefixo: string, ano: number, sequencia: number): string {
  return `${prefixo}-${ano}-${String(sequencia).padStart(4, "0")}`;
}
