import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoEmpresas() {
  return (
    <div aria-busy="true" aria-label="Carregando empresas">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-8 h-8 w-56" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
            <Skeleton className="size-11 rounded-xl" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-40 md:block" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
