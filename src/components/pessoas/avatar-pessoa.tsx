import { cn } from "@/lib/utils";

const TAMANHOS = { sm: "size-9 text-[12px]", md: "size-11 text-[13px]", lg: "size-16 text-lg" };

/** Iniciais do primeiro e do último nome (Maria Fernanda Oliveira → MO). */
export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return `${primeira}${ultima}`.toUpperCase();
}

/** Foto da pessoa (rota autorizada) ou iniciais sobre o azul de identidade, sempre do mesmo tamanho. */
export function AvatarPessoa({ url, nome, tamanho = "sm" }: { url: string | null; nome: string; tamanho?: keyof typeof TAMANHOS }) {
  if (url) {
    return (
      <span className={cn("block shrink-0 overflow-hidden rounded-full border bg-muted dark:border-white/10", TAMANHOS[tamanho])}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por rota autorizada */}
        <img src={url} alt={`Foto de ${nome}`} className="size-full object-cover" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent font-bold tracking-wide text-accent-foreground ring-1 ring-inset ring-primary/10",
        TAMANHOS[tamanho],
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
