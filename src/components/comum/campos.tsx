"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Eye, EyeOff, Search, type LucideIcon } from "lucide-react";
import { startTransition, useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, InputComIcone, classeControle } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PropsCampo = {
  rotulo: string;
  ajuda?: React.ReactNode;
  erro?: string;
  obrigatorio?: boolean;
  className?: string;
  /** Rótulo visualmente oculto (ex.: busca com placeholder descritivo). Continua acessível. */
  rotuloOculto?: boolean;
  /** Indicador curto alinhado à direita do rótulo (ex.: "Calculado"). */
  etiqueta?: React.ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
};

/** Rótulo sempre presente; ajuda e erro abaixo, ligados por aria-describedby. */
export function Campo({ rotulo, ajuda, erro, obrigatorio, className, rotuloOculto, etiqueta, children }: PropsCampo) {
  const id = useId();
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descritores = [idErro, idAjuda].filter(Boolean).join(" ") || undefined;
  const rotuloCampo = (
    <label htmlFor={id} className={cn("text-[13px] leading-5 font-semibold text-titulo", rotuloOculto && "sr-only")}>
      {rotulo}
      {obrigatorio ? (
        <span className="font-medium text-muted-foreground">
          <span aria-hidden> *</span>
          <span className="sr-only"> (obrigatório)</span>
        </span>
      ) : null}
    </label>
  );
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {etiqueta ? (
        <div className="flex items-center justify-between gap-2">
          {rotuloCampo}
          {etiqueta}
        </div>
      ) : (
        rotuloCampo
      )}
      {children({ id, "aria-describedby": descritores, "aria-invalid": erro ? true : undefined })}
      {erro ? (
        <p id={idErro} className="flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-erro motion-safe:animate-entrada">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}
      {ajuda ? (
        <p id={idAjuda} className="text-[13px] leading-[18px] text-muted-foreground">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Campo de senha com mostrar/ocultar. "senhaDeOutraPessoa" aplica os atributos do
 * DESIGN_SYSTEM.md §9.2 (sem oferta de salvar no gerenciador do operador).
 */
export function CampoSenha({
  senhaDeOutraPessoa,
  autoComplete,
  className,
  icone,
  ...props
}: React.ComponentProps<"input"> & { senhaDeOutraPessoa?: boolean; icone?: LucideIcon }) {
  const [visivel, setVisivel] = useState(false);
  const extras = senhaDeOutraPessoa
    ? { "data-1p-ignore": "true", "data-lpignore": "true", "data-bwignore": "true" }
    : {};
  const alternar = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setVisivel((v) => !v)}
      aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={visivel}
      className="text-muted-foreground hover:bg-muted hover:text-titulo"
    >
      {visivel ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
    </Button>
  );
  const comuns = {
    ...props,
    ...extras,
    type: visivel ? "text" : "password",
    autoComplete: senhaDeOutraPessoa ? "new-password" : autoComplete,
    spellCheck: false,
    autoCapitalize: "off",
  };
  if (icone) return <InputComIcone {...comuns} icone={icone} acessorio={alternar} className={className} />;
  return (
    <div className="relative">
      <Input {...comuns} className={cn("pr-12", className)} />
      <div className="absolute inset-y-0 right-0 flex items-center pr-1">{alternar}</div>
    </div>
  );
}

/** Busca com ícone; usada nos filtros das tabelas administrativas. */
export function CampoBusca({ className, ...props }: React.ComponentProps<"input">) {
  return <InputComIcone icone={Search} type="search" autoComplete="off" {...props} className={className} />;
}

/** Botão de envio para formulários com `action`: estado de carregamento via useFormStatus. */
export function BotaoEnvio({
  children,
  pendente,
  ...props
}: React.ComponentProps<typeof Button> & { pendente: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} carregando={pending} rotuloCarregando={pendente}>
      {children}
    </Button>
  );
}

/**
 * Envia o formulário a uma Server Action sem o reset automático do React 19, para não
 * apagar o que foi preenchido quando o servidor devolve erro de validação.
 */
export function useFormularioAcao<E>(acao: (estado: E, dados: FormData) => Promise<E>, inicial: E) {
  const [estado, despachar, pendente] = useActionState<E, FormData>(
    acao as (estado: Awaited<E>, dados: FormData) => Promise<E>,
    inicial as Awaited<E>,
  );
  const aoEnviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (pendente) return; // evita envio duplicado
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  };
  return { estado, pendente, aoEnviar };
}

export function BotaoPendente({
  pendente,
  rotuloPendente,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pendente: boolean; rotuloPendente: string }) {
  return (
    <Button type="submit" {...props} carregando={pendente} rotuloCarregando={rotuloPendente}>
      {children}
    </Button>
  );
}

/** Seleção nativa (acessível em teclado, leitor de tela e celular) com o visual dos demais campos. */
export function Selecao({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(classeControle, "h-11 cursor-pointer appearance-none pr-10 pl-3.5 lg:h-10", className)}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export function AlertaFormulario({ tom, children }: { tom: "erro" | "sucesso"; children: React.ReactNode }) {
  const Icone = tom === "erro" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5 font-medium",
        "motion-safe:animate-entrada",
        tom === "erro" ? "border-erro/25 bg-erro-fundo text-erro" : "border-sucesso/25 bg-sucesso-fundo text-sucesso",
      )}
    >
      <Icone className="mt-px size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
