import { Skeleton } from "@/components/ui/skeleton";

/** Esqueletos com a mesma geometria das páginas (evitam salto de layout no carregamento). */

export function CarregandoLista({ rotulo, indicadores = 0, trilha = true }: { rotulo: string; indicadores?: number; trilha?: boolean }) {
  return (
    <div aria-busy="true" aria-label={rotulo}>
      {trilha ? <Skeleton className="mb-2 h-4 w-40" /> : null}
      <Skeleton className="mb-6 h-8 w-48" />
      {indicadores ? (
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: indicadores }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:px-5 lg:flex-row">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg lg:w-44" />
          <Skeleton className="h-10 w-full rounded-lg lg:w-44" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-32 md:block" />
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CarregandoFicha() {
  return (
    <div aria-busy="true" aria-label="Carregando o equipamento">
      <Skeleton className="mb-3 h-4 w-56" />
      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
