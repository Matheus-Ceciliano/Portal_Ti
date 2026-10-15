import { createHash, randomUUID } from "node:crypto";
import type { CenarioSimulacao, ErroConector, ResultadoConector } from "./tipos";

const ERROS: Record<Exclude<CenarioSimulacao, "NORMAL">, ErroConector> = {
  INDISPONIVEL: {
    codigo: "INDISPONIVEL",
    mensagem: "Serviço simulado indisponível (cenário de teste).",
    transitorio: true,
  },
  LIMITE_REQUISICOES: {
    codigo: "LIMITE_REQUISICOES",
    mensagem: "Limite de requisições simulado (HTTP 429).",
    transitorio: true,
  },
  CONFLITO: {
    codigo: "CONFLITO",
    mensagem: "Conflito simulado: já existe um objeto com esse identificador.",
    transitorio: false,
  },
};

export async function responderSimulado<T>(
  cenario: CenarioSimulacao,
  produzir: () => T,
): Promise<ResultadoConector<T>> {
  const inicio = Date.now();
  const base = { simulado: true as const, correlacaoId: randomUUID() };
  if (cenario !== "NORMAL") {
    return { ...base, duracaoMs: Date.now() - inicio, ok: false, erro: ERROS[cenario] };
  }
  return { ...base, duracaoMs: Date.now() - inicio, ok: true, dados: produzir() };
}

/** Identificador determinístico e claramente fictício (prefixo "sim-"). */
export function idSimulado(semente: string): string {
  const h = createHash("sha256").update(semente).digest("hex");
  return `sim-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 28)}`;
}
