import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type Parametros = Record<string, string | undefined>;

export function hrefCom(base: string, atuais: Parametros, mudancas: Parametros) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...atuais, ...mudancas })) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

/** Cabeçalho ordenável: estado na URL e aria-sort. */
export function CabecalhoOrdenavel({
  base,
  parametros,
  campo,
  children,
  className,
}: {
  base: string;
  parametros: Parametros;
  campo: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ativo = parametros.ordenar === campo || (!parametros.ordenar && campo === "nome");
  const direcao = ativo ? (parametros.direcao === "desc" ? "desc" : "asc") : undefined;
  const proxima = ativo && direcao === "asc" ? "desc" : "asc";
  const Icone = direcao === "asc" ? ArrowUp : direcao === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={direcao === "asc" ? "ascending" : direcao === "desc" ? "descending" : "none"}
      className={cn("h-10 px-4 text-left text-[13px] font-medium whitespace-nowrap text-muted-foreground", className)}
    >
      <Link
        href={hrefCom(base, parametros, { ordenar: campo, direcao: proxima, pagina: undefined })}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
      >
        {children}
        <Icone className="size-3.5" aria-hidden />
        <span className="sr-only">
          {direcao ? `, ordenado ${direcao === "asc" ? "crescente" : "decrescente"}` : ", ordenar"}
        </span>
      </Link>
    </th>
  );
}

export function Paginacao({
  base,
  parametros,
  pagina,
  paginas,
  total,
  rotulo,
}: {
  base: string;
  parametros: Parametros;
  pagina: number;
  paginas: number;
  total: number;
  rotulo: string;
}) {
  const link = (p: number) => hrefCom(base, parametros, { pagina: p > 1 ? String(p) : undefined });
  const classe =
    "inline-flex h-11 items-center gap-1 rounded-md border border-input bg-card px-3 text-sm lg:h-9 hover:bg-muted";
  return (
    <nav aria-label={`Paginação de ${rotulo}`} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="tabular text-[13px] text-muted-foreground">
        Página {pagina} de {paginas} · {total} {total === 1 ? "registro" : "registros"}
      </p>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <Link href={link(pagina - 1)} className={classe} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Link>
        ) : (
          <span className={cn(classe, "pointer-events-none opacity-50")} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </span>
        )}
        {pagina < paginas ? (
          <Link href={link(pagina + 1)} className={classe} rel="next">
            Próxima <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(classe, "pointer-events-none opacity-50")} aria-disabled="true">
            Próxima <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

export function texto(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v?.trim() ? v.trim() : undefined;
}
