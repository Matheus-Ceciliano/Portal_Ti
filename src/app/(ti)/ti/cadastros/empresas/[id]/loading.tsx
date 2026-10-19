import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoEmpresa() {
  return (
    <div aria-busy="true" aria-label="Carregando empresa">
      <Skeleton className="mb-4 h-4 w-56" />
      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <Skeleton className="mb-5 h-11 w-full max-w-xl rounded-xl" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-40 md:block" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
