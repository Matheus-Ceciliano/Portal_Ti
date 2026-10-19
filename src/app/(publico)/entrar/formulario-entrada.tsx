"use client";

import { Info, LockKeyhole, Mail } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertaFormulario, BotaoEnvio, Campo, CampoSenha } from "@/components/comum/campos";
import { InputComIcone } from "@/components/ui/input";
import { entrar, type EstadoEntrada } from "@/server/acoes/autenticacao";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormularioEntrada({ aviso }: { aviso?: string }) {
  const [estado, acao] = useActionState<EstadoEntrada, FormData>(entrar, {});
  const [errosLocais, setErrosLocais] = useState<EstadoEntrada["erros"]>();
  const refAlerta = useRef<HTMLDivElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);

  const erros = errosLocais ?? estado.erros;

  // Cada resposta do servidor ganha uma "rodada", para o alerta repetir o tremor discreto.
  const [rodada, setRodada] = useState(0);
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setRodada((r) => r + 1);
  }

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
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-fundo px-3.5 py-3 text-sm leading-5 font-medium text-info">
          <Info className="mt-px size-4 shrink-0" aria-hidden />
          {aviso}
        </div>
      ) : null}
      {estado.erro ? (
        <div key={rodada} ref={refAlerta} tabIndex={-1} className="outline-none motion-safe:animate-tremor">
          <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
        </div>
      ) : null}

      <Campo rotulo="E-mail corporativo" erro={erros?.email}>
        {(p) => (
          <InputComIcone
            {...p}
            ref={refEmail}
            icone={Mail}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            defaultValue={estado.email}
            placeholder="nome@empresa.com.br"
          />
        )}
      </Campo>

      <Campo rotulo="Senha" erro={erros?.senha}>
        {(p) => (
          <CampoSenha {...p} ref={refSenha} icone={LockKeyhole} name="senha" autoComplete="current-password" placeholder="Sua senha do portal" />
        )}
      </Campo>

      <BotaoEnvio pendente="Entrando…" size="lg" className="mt-1 w-full">
        Entrar
      </BotaoEnvio>
    </form>
  );
}
