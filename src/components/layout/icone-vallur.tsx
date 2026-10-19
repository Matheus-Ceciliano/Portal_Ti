/**
 * Ícone oficial do Grupo Vallur, vetorizado a partir de
 * LOGOS/Grupo Vallur/"VALLUR - Ícone - Fundo Branco.png" (coordenadas medidas no arquivo).
 * Usa currentColor: branco sobre o azul institucional, azul-900 sobre fundo claro.
 */
export function IconeVallur({ className, titulo }: { className?: string; titulo?: string }) {
  return (
    <svg
      viewBox="38 97 661 534"
      className={className}
      fill="currentColor"
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
    >
      <path d="M38 97H262L150 377Z" />
      <path d="M475 97H699L486 631H262Z" />
    </svg>
  );
}
