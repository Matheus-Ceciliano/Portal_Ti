"use client";

import { Info } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertaFormulario, BotaoEnvio, Campo, CampoSenha } from "@/components/comum/campos";
import { Input } from "@/components/ui/input";
import { entrar, type EstadoEntrada } from "@/server/acoes/autenticacao";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormularioEntrada({ aviso }: { aviso?: string }) {
  const [estado, acao] = useActionState<EstadoEntrada, FormData>(entrar, {});
  const [errosLocais, setErrosLocais] = useState<EstadoEntrada["erros"]>();
  const refAlerta = useRef<HTMLDivElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);

  const erros = errosLocais ?? estado.erros;

  useEffect(() => {
    if (estado.erro) refAlerta.current?.focus();
    else if (estado.erros?.email) refEmail.current?.focus();
    else if (estado.erros?.senha) refSenha.current?.focus();
  }, [estado]);

  function validarAntes(evento: React.FormEvent<HTMLFormElement>) {
    const dados = new FormData(evento.currentTarget);
    const email = String(dados.get("email") ?? "").trim();
    const senha = String(dados.get("senha") ?? "");
    const novos = {
      email: !email ? "Informe o e-mail corporativo." : !EMAIL.test(email) ? "Informe um e-mail corporativo válido." : undefined,
      senha: !senha ? "Informe a senha." : undefined,
    };
    if (novos.email || novos.senha) {
      evento.preventDefault();
      setErrosLocais(novos);
      (novos.email ? refEmail : refSenha).current?.focus();
    } else {
      setErrosLocais(undefined);
    }
  }

  return (
    <form action={acao} onSubmit={validarAntes} noValidate className="flex flex-col gap-5" aria-label="Entrar no portal">
      {aviso && !estado.erro ? (
        <div role="status" className="flex gap-2 rounded-md border border-info/25 bg-info-fundo px-3 py-2.5 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {aviso}
        </div>
      ) : null}
      {estado.erro ? (
        <div ref={refAlerta} tabIndex={-1} className="outline-none">
          <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
        </div>
      ) : null}

      <Campo rotulo="E-mail corporativo" erro={erros?.email}>
        {(p) => (
          <Input
            {...p}
            ref={refEmail}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            defaultValue={estado.email}
            placeholder="nome.sobrenome@empresa.com.br"
          />
        )}
      </Campo>

      <Campo rotulo="Senha" erro={erros?.senha}>
        {(p) => <CampoSenha {...p} ref={refSenha} name="senha" autoComplete="current-password" />}
      </Campo>

      <BotaoEnvio pendente="Entrando…" size="lg" className="w-full">
        Entrar
      </BotaoEnvio>
    </form>
  );
}
