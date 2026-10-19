import { FlaskConical, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  trilha,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  trilha?: { rotulo: string; href?: string }[];
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {trilha?.length ? (
          <nav aria-label="Trilha" className="mb-1 text-[13px] text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {trilha.map((t, i) => (
                <li key={t.rotulo} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden>/</span> : null}
                  {t.href ? (
                    <Link href={t.href} className="rounded-sm hover:text-foreground hover:underline">
                      {t.rotulo}
                    </Link>
                  ) : (
                    <span aria-current="page">{t.rotulo}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-xl leading-7 font-semibold sm:text-2xl sm:leading-8">{titulo}</h1>
        {descricao ? <p className="mt-1 max-w-[75ch] text-muted-foreground">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex shrink-0 flex-wrap gap-2">{acoes}</div> : null}
    </header>
  );
}

/** Bloco de conteúdo com título. Agrupa um assunto; não é decoração. */
export function Secao({
  titulo,
  descricao,
  acoes,
  children,
  className,
  id,
  simulado,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  simulado?: boolean;
}) {
  const idTitulo = id ?? `secao-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={idTitulo} className={cn("min-w-0 rounded-2xl border bg-card shadow-nivel-1", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={idTitulo} className="flex flex-wrap items-center gap-2 text-base leading-6 font-semibold">
            {titulo}
            {simulado ? <MarcaSimulado /> : null}
          </h2>
          {descricao ? <p className="text-[13px] leading-[18px] text-muted-foreground">{descricao}</p> : null}
        </div>
        {acoes}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** Distingue dados fictícios de dados reais do banco (Etapa 1). */
export function MarcaSimulado({ texto = "Dados fictícios" }: { texto?: string }) {
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-sm border border-dashed border-faixa/40 bg-faixa-fundo px-1.5 text-xs font-medium text-faixa"
      title="Conteúdo de demonstração. Não representa dados operacionais reais."
    >
      <FlaskConical className="size-3" aria-hidden />
      {texto}
    </span>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <Icone className="mb-3 size-8 text-muted-foreground" aria-hidden strokeWidth={1.5} />
      <p className="font-semibold text-titulo">{titulo}</p>
      <p className="mt-1 max-w-[52ch] text-muted-foreground">{descricao}</p>
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function EmDesenvolvimento({ modulo, previsao }: { modulo: string; previsao: string }) {
  return (
    <div className="rounded-lg border border-dashed border-input bg-card px-5 py-4">
      <p className="font-semibold text-titulo">{modulo}: em desenvolvimento</p>
      <p className="mt-1 max-w-[75ch] text-muted-foreground">{previsao}</p>
    </div>
  );
}

/** Datas sem hora ("2026-03-12") são dias de calendário: não passam por conversão de fuso. */
export function formatarData(valor: string | Date) {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [ano, mes, dia] = valor.split("-");
    return `${dia}/${mes}/${ano}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(valor));
}

export const formatarDataHora = (valor: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(valor));
