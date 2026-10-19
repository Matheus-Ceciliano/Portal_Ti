import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoPessoas() {
  return (
    <div aria-busy="true" aria-label="Carregando pessoas">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-8 h-8 w-48" />
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:px-5 lg:flex-row">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg lg:w-52" />
          <Skeleton className="h-10 w-full rounded-lg lg:w-52" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-32 md:block" />
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
