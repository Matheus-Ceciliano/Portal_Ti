"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertaFormulario, BotaoEnvio, Campo } from "@/components/comum/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verificarSegundoFator, type EstadoSegundoFator } from "@/server/acoes/autenticacao";

export function FormularioSegundoFator() {
  const [estado, acao] = useActionState<EstadoSegundoFator, FormData>(verificarSegundoFator, {});
  const [recuperacao, setRecuperacao] = useState(false);

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="modo" value={recuperacao ? "recuperacao" : "totp"} />
      {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
      {recuperacao ? (
        <Campo rotulo="Código de recuperação" ajuda="Cada código de recuperação só pode ser usado uma vez.">
          {(p) => <Input {...p} key="rec" name="codigo" autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus />}
        </Campo>
      ) : (
        <Campo rotulo="Código do aplicativo autenticador">
          {(p) => (
            <Input
              {...p}
              key="totp"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              className="tabular text-lg tracking-[0.3em]"
              autoFocus
            />
          )}
        </Campo>
      )}
      <BotaoEnvio pendente="Verificando…" size="lg" className="w-full">
        Verificar e entrar
      </BotaoEnvio>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="link" className="h-auto px-0" onClick={() => setRecuperacao((r) => !r)}>
          {recuperacao ? "Usar o aplicativo autenticador" : "Usar um código de recuperação"}
        </Button>
        <Link href="/entrar" className="text-link underline-offset-4 hover:underline">
          Voltar
        </Link>
      </div>
    </form>
  );
}
