/**
 * Contrato comum dos conectores (INTEGRACOES.md). Nesta etapa só existe o modo
 * SIMULACAO: não há implementação real de nenhum conector no código, portanto não
 * há caminho de fallback para endpoints de produção.
 */
export type ModoConector = "SIMULACAO";

export type CodigoErroConector =
  | "INDISPONIVEL"
  | "LIMITE_REQUISICOES"
  | "CONFLITO"
  | "NAO_ENCONTRADO"
  | "SENHA_RECUSADA"
  | "NAO_AUTORIZADO";

export type ErroConector = {
  codigo: CodigoErroConector;
  mensagem: string;
  /** Falha transitória: pode ser repetida depois de reconciliação. */
  transitorio: boolean;
};

export type ResultadoConector<T> = {
  simulado: true;
  correlacaoId: string;
  duracaoMs: number;
} & ({ ok: true; dados: T } | { ok: false; erro: ErroConector });

export type SaudeConector = {
  sistema: string;
  modo: ModoConector;
  estado: "OPERACIONAL" | "DEGRADADO" | "INDISPONIVEL";
  verificadoEm: string;
  detalhe: string;
};

/** Cenário de teste para simular falhas de forma previsível. */
export type CenarioSimulacao = "NORMAL" | "INDISPONIVEL" | "LIMITE_REQUISICOES" | "CONFLITO";
