import type { Prisma } from "@/generated/prisma/client";
import { obterConfiguracao } from "@/server/config";
import type { ClienteBanco } from "@/server/db";

export type EventoNovo = {
  acao: string;
  resultado: "SUCESSO" | "NEGADO" | "FALHA";
  ator?: { contaId: string; nome: string } | null;
  alvo?: { tipo: string; id?: string; descricao?: string };
  origemPermissao?: string;
  detalhe?: Record<string, unknown>;
  simulado?: boolean;
};

/** Chaves que nunca entram na auditoria, nem por engano (§11.4: somente metadados). */
const CHAVES_PROIBIDAS = /senha|password|hash|secret|segredo|token|codigo|code|pepper/i;

export function sanitizarDetalhe(detalhe: Record<string, unknown> | undefined) {
  if (!detalhe) return undefined;
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(detalhe)) {
    if (CHAVES_PROIBIDAS.test(chave)) continue;
    limpo[chave] =
      valor && typeof valor === "object" && !Array.isArray(valor) && !(valor instanceof Date)
        ? sanitizarDetalhe(valor as Record<string, unknown>)
        : valor;
  }
  return limpo;
}

export async function registrarAuditoria(db: ClienteBanco, evento: EventoNovo) {
  await db.eventoAuditoria.create({
    data: {
      ambiente: obterConfiguracao().AMBIENTE,
      acao: evento.acao,
      resultado: evento.resultado,
      atorContaId: evento.ator?.contaId,
      atorNome: evento.ator?.nome,
      alvoTipo: evento.alvo?.tipo,
      alvoId: evento.alvo?.id,
      alvoDescricao: evento.alvo?.descricao,
      origemPermissao: evento.origemPermissao,
      detalhe: sanitizarDetalhe(evento.detalhe) as Prisma.InputJsonValue | undefined,
      simulado: evento.simulado ?? false,
    },
  });
}
