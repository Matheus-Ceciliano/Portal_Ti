import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Loader2 } from "lucide-react"
import { Slot } from "radix-ui"

/**
 * Sistema de botões do Portal TI Vallur.
 * - default (primário): ação principal da tela — Entrar, Confirmar, Salvar, Cadastrar.
 * - secondary / outline (secundário): ações de apoio.
 * - ghost (fantasma): ações contextuais de baixa ênfase.
 * - destructive: ações com consequência (bloquear, revogar, sair da conta).
 * Estados: hover, pressão, foco de teclado, desabilitado e carregando (prop `carregando`).
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent",
    "text-sm font-semibold whitespace-nowrap select-none outline-none",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
    "active:not-disabled:scale-[0.98] motion-reduce:active:not-disabled:scale-100",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-botao hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "border-input bg-card text-titulo shadow-botao hover:border-foreground/40 hover:bg-muted aria-expanded:bg-muted",
        outline:
          "border-input bg-card text-titulo shadow-botao hover:border-foreground/40 hover:bg-muted aria-expanded:bg-muted",
        ghost:
          "text-foreground hover:bg-muted hover:text-titulo aria-expanded:bg-muted aria-expanded:text-titulo",
        destructive:
          "bg-destructive text-white shadow-botao hover:bg-[color-mix(in_oklab,var(--destructive),black_12%)]",
        link: "h-auto px-0 font-medium text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 lg:h-10",
        sm: "h-10 gap-1.5 rounded-md px-3 text-[13px] lg:h-8",
        xs: "h-8 gap-1 rounded-md px-2 text-xs lg:h-7 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-11 lg:size-10",
        "icon-sm": "size-10 rounded-md lg:size-8",
        "icon-xs": "size-8 rounded-md lg:size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  carregando = false,
  rotuloCarregando,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Mostra o indicador e bloqueia novos cliques (evita envio duplicado). */
    carregando?: boolean
    /** Texto exibido durante o carregamento, por exemplo "Entrando…". */
    rotuloCarregando?: string
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : carregando ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {rotuloCarregando ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
