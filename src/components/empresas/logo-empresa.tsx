import { cn } from "@/lib/utils";

const TAMANHOS = { sm: "size-9 rounded-lg text-[11px]", md: "size-11 rounded-xl text-xs", lg: "size-16 rounded-2xl text-base" };

/**
 * Logotipo da empresa sem distorção (object-contain sobre fundo neutro). Sem logotipo, mostra a
 * sigla sobre o azul de identidade, sempre com o mesmo tamanho para manter as linhas alinhadas.
 */
export function LogoEmpresa({
  url,
  sigla,
  nome,
  tamanho = "md",
}: {
  url: string | null;
  sigla: string;
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
}) {
  if (url) {
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden border bg-white p-1 dark:border-white/10", TAMANHOS[tamanho])}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por rota autorizada */}
        <img src={url} alt={`Logotipo de ${nome}`} className="size-full object-contain" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`Sem logotipo: ${nome}`}
      className={cn(
        "grid shrink-0 place-items-center bg-accent font-bold tracking-wide text-accent-foreground ring-1 ring-inset ring-primary/10",
        TAMANHOS[tamanho],
      )}
    >
      {sigla.slice(0, 4)}
    </span>
  );
}
