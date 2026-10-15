"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { startTransition, useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PropsCampo = {
  rotulo: string;
  ajuda?: React.ReactNode;
  erro?: string;
  obrigatorio?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
};

/** Rótulo sempre visível; ajuda e erro abaixo, ligados por aria-describedby. */
export function Campo({ rotulo, ajuda, erro, obrigatorio, className, children }: PropsCampo) {
  const id = useId();
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descritores = [idErro, idAjuda].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm leading-5 font-medium text-titulo">
        {rotulo}
        {obrigatorio ? <span className="font-normal text-muted-foreground"> (obrigatório)</span> : null}
      </label>
      {children({ id, "aria-describedby": descritores, "aria-invalid": erro ? true : undefined })}
      {erro ? (
        <p id={idErro} className="text-[13px] leading-[18px] font-medium text-erro">
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
  ...props
}: React.ComponentProps<"input"> & { senhaDeOutraPessoa?: boolean }) {
  const [visivel, setVisivel] = useState(false);
  const extras = senhaDeOutraPessoa
    ? { "data-1p-ignore": "true", "data-lpignore": "true", "data-bwignore": "true" }
    : {};
  return (
    <div className="relative">
      <Input
        {...props}
        {...extras}
        type={visivel ? "text" : "password"}
        autoComplete={senhaDeOutraPessoa ? "new-password" : autoComplete}
        spellCheck={false}
        autoCapitalize="off"
        className={cn("pr-12", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground"
      >
        {visivel ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}

/** Botão de envio com estado de carregamento; mantém o rótulo descritivo. */
export function BotaoEnvio({
  children,
  pendente,
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendente: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || disabled} aria-busy={pending} className={className}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendente}
        </>
      ) : (
        children
      )}
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
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  };
  return { estado, pendente, aoEnviar };
}

export function BotaoPendente({
  pendente,
  rotuloPendente,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendente: boolean; rotuloPendente: string }) {
  return (
    <Button type="submit" {...props} disabled={pendente || disabled} aria-busy={pendente}>
      {pendente ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {rotuloPendente}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function Selecao({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground lg:h-9 md:text-sm",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "aria-invalid:border-destructive",
        className,
      )}
    />
  );
}

export function AlertaFormulario({ tom, children }: { tom: "erro" | "sucesso"; children: React.ReactNode }) {
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        tom === "erro" ? "border-erro/30 bg-erro-fundo text-erro" : "border-sucesso/30 bg-sucesso-fundo text-sucesso",
      )}
    >
      {children}
    </div>
  );
}
