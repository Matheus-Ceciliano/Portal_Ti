import * as React from "react"
import { cn } from "cn"
import type { LucideIcon } from "lucide-react"

/**
 * Linguagem visual comum a todos os controles de formulário (campo, busca, seleção,
 * área de texto): mesma altura, raio, borda, foco e estados de erro e desabilitado.
 * A borda (cinza-450) mantém contraste ≥ 3:1; no foco, a borda vira azul de ação
 * (≥ 4.5:1) com um halo suave.
 */
export const classeControle = cn(
  "w-full min-w-0 rounded-lg border border-input bg-card text-base text-titulo md:text-sm",
  "shadow-[inset_0_1px_1px_rgb(16_24_40/0.04)] outline-none",
  "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
  "placeholder:text-muted-foreground/80",
  "hover:border-foreground/45",
  "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 dark:focus-visible:border-link dark:focus-visible:ring-link/25",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "aria-invalid:border-erro aria-invalid:ring-4 aria-invalid:ring-erro/12 aria-invalid:focus-visible:border-erro"
)

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        classeControle,
        "h-11 px-3.5 lg:h-10",
        "file:mr-3 file:inline-flex file:h-7 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:text-[13px] file:font-semibold file:text-titulo",
        className
      )}
      {...props}
    />
  )
}

/**
 * Campo com ícone à esquerda (decorativo, sem capturar cliques). O ícone acompanha o
 * foco do campo. `acessorio` ocupa a direita (ex.: botão de mostrar senha).
 */
function InputComIcone({
  icone: Icone,
  acessorio,
  className,
  ...props
}: React.ComponentProps<"input"> & { icone: LucideIcon; acessorio?: React.ReactNode }) {
  return (
    <div className="group/campo relative">
      <Icone
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within/campo:text-primary dark:group-focus-within/campo:text-link"
        strokeWidth={1.75}
      />
      <Input {...props} className={cn("pl-11", acessorio && "pr-12", className)} />
      {acessorio ? <div className="absolute inset-y-0 right-0 flex items-center pr-1">{acessorio}</div> : null}
    </div>
  )
}

export { Input, InputComIcone }
