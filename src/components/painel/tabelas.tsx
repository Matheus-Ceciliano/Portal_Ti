import { formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import type { EventoAuditoria } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Tabela compacta para listas curtas de painel; rola horizontalmente só dentro do bloco. */
export function TabelaSimples({ children, legenda }: { children: React.ReactNode; legenda: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = "h-10 px-4 text-left align-middle text-[13px] font-medium whitespace-nowrap text-muted-foreground first:pl-4 sm:first:pl-5";
export const td = "h-11 px-4 align-middle first:pl-4 sm:first:pl-5";

export function ListaEventos({ eventos }: { eventos: EventoAuditoria[] }) {
  if (eventos.length === 0) {
    return <p className="px-5 py-6 text-muted-foreground">Nenhum evento registrado ainda.</p>;
  }
  return (
    <ul className="divide-y">
      {eventos.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
          <Estado grupo="auditoria" valor={e.resultado} />
          <span className="min-w-0 flex-1">
            <span className="font-mono text-[13px] break-all text-titulo">{e.acao}</span>
            <span className={cn("block text-[13px] text-muted-foreground")}>
              {e.atorNome ?? "Sistema"}
              {e.alvoDescricao ? ` → ${e.alvoDescricao}` : ""}
              {e.simulado ? " (simulado)" : ""}
            </span>
          </span>
          <time className="tabular w-full text-[13px] text-muted-foreground sm:w-auto" dateTime={e.criadoEm.toISOString()}>
            {formatarDataHora(e.criadoEm)}
          </time>
        </li>
      ))}
    </ul>
  );
}
