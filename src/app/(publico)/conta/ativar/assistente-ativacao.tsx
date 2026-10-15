"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { AlertaFormulario, BotaoEnvio, Campo, CampoSenha } from "@/components/comum/campos";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  confirmarMfaAtivacao,
  definirSenhaAtivacao,
  gerarChaveMfa,
  type DadosMfa,
  type EstadoAtivacao,
} from "@/server/acoes/autenticacao";
import type { SituacaoAtivacao } from "@/server/modulos/ativacao";
import { sair } from "@/server/acoes/autenticacao";

function Etapas({ atual, total }: { atual: 1 | 2; total: 1 | 2 }) {
  if (total === 1) return null;
  const etapas = ["Senha pessoal", "Autenticador"];
  return (
    <ol className="mb-6 flex gap-2" aria-label="Etapas da ativação">
      {etapas.map((rotulo, i) => {
        const numero = i + 1;
        const concluida = numero < atual;
        const corrente = numero === atual;
        return (
          <li
            key={rotulo}
            aria-current={corrente ? "step" : undefined}
            className={cn(
              "flex flex-1 items-center gap-2 border-t-[3px] pt-2 text-sm",
              concluida && "border-sucesso text-sucesso",
              corrente && "border-primary font-semibold text-titulo",
              !concluida && !corrente && "border-border text-muted-foreground",
            )}
          >
            {concluida ? <Check className="size-4" aria-hidden /> : <span className="tabular">{numero}.</span>}
            {rotulo}
            {concluida ? <span className="sr-only">(concluída)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function AssistenteAtivacao({ situacao, email }: { situacao: SituacaoAtivacao; email: string }) {
  const [estadoSenha, acaoSenha] = useActionState<EstadoAtivacao, FormData>(definirSenhaAtivacao, {});
  const [estadoChave, acaoChave] = useActionState<EstadoAtivacao, FormData>(gerarChaveMfa, {});
  const mfa = estadoSenha.mfa ?? estadoChave.mfa;
  const totalEtapas = situacao.perfilTi ? 2 : 1;

  if (mfa) {
    return (
      <>
        <Etapas atual={2} total={2} />
        <ConfigurarAutenticador mfa={mfa} />
      </>
    );
  }

  if (!situacao.precisaSenhaPessoal && situacao.precisaMfa) {
    return (
      <>
        <Etapas atual={2} total={2} />
        <form action={acaoChave} className="flex flex-col gap-5">
          <p className="text-muted-foreground">
            Sua senha pessoal já foi definida. Confirme-a para gerar a chave do aplicativo autenticador.
          </p>
          {estadoChave.erro ? <AlertaFormulario tom="erro">{estadoChave.erro}</AlertaFormulario> : null}
          <input type="email" name="usuario" autoComplete="username" value={email} readOnly hidden />
          <Campo rotulo="Senha pessoal" erro={estadoChave.erros?.senha}>
            {(p) => <CampoSenha {...p} name="senha" autoComplete="current-password" />}
          </Campo>
          <BotaoEnvio pendente="Gerando chave…" size="lg">
            Gerar chave do autenticador
          </BotaoEnvio>
        </form>
      </>
    );
  }

  return (
    <>
      <Etapas atual={1} total={totalEtapas} />
      <form action={acaoSenha} className="flex flex-col gap-5">
        {estadoSenha.erro ? <AlertaFormulario tom="erro">{estadoSenha.erro}</AlertaFormulario> : null}
        <input type="email" name="usuario" autoComplete="username" value={email} readOnly hidden />
        {situacao.precisaCodigo ? (
          <Campo
            rotulo="Código de ativação"
            obrigatorio
            erro={estadoSenha.erros?.codigo}
            ajuda="Entregue pelo administrador que atribuiu seu perfil de TI. Vale por 48 horas e uma única vez."
          >
            {(p) => (
              <Input
                {...p}
                name="codigo"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX"
                className="tabular tracking-wider uppercase"
              />
            )}
          </Campo>
        ) : null}
        <Campo
          rotulo="Nova senha"
          obrigatorio
          erro={estadoSenha.erros?.novaSenha}
          ajuda="No mínimo 12 caracteres. Uma frase com palavras separadas costuma ser fácil de lembrar e difícil de adivinhar."
        >
          {(p) => <CampoSenha {...p} name="novaSenha" autoComplete="new-password" />}
        </Campo>
        <Campo rotulo="Repita a nova senha" obrigatorio erro={estadoSenha.erros?.confirmacao}>
          {(p) => <CampoSenha {...p} name="confirmacao" autoComplete="new-password" />}
        </Campo>
        <BotaoEnvio pendente="Salvando…" size="lg">
          {situacao.perfilTi ? "Salvar e continuar" : "Salvar senha e entrar"}
        </BotaoEnvio>
      </form>
      <form action={sair} className="mt-6">
        <button type="submit" className="text-sm text-link underline-offset-4 hover:underline">
          Sair e continuar depois
        </button>
      </form>
    </>
  );
}

function ConfigurarAutenticador({ mfa }: { mfa: DadosMfa }) {
  const [estado, acao] = useActionState<EstadoAtivacao, FormData>(confirmarMfaAtivacao, {});
  const [guardou, setGuardou] = useState(false);

  return (
    <form action={acao} className="flex flex-col gap-5">
      {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
      <div>
        <h2 className="text-base font-semibold">1. Adicione a conta no aplicativo autenticador</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use Microsoft Authenticator, Google Authenticator ou outro aplicativo compatível com TOTP.
        </p>
        <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URL gerado no servidor */}
          <img src={mfa.qrCode} alt="QR code para o aplicativo autenticador" width={160} height={160} className="rounded-md border bg-white p-1" />
          <div className="min-w-0 text-sm">
            <p className="text-muted-foreground">Sem câmera? Digite esta chave no aplicativo:</p>
            <p data-testid="chave-totp" className="mt-1 font-mono text-[15px] break-all text-titulo">
              {mfa.chave}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold">2. Guarde os códigos de recuperação</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Eles aparecem só agora. Cada um permite entrar uma vez se você perder o celular.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted px-4 py-3 font-mono text-sm text-titulo">
          {mfa.codigosRecuperacao.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={guardou} onCheckedChange={(v) => setGuardou(v === true)} data-testid="guardei-codigos" />
          Guardei os códigos de recuperação em local seguro.
        </label>
      </div>

      <Campo rotulo="3. Código de 6 dígitos mostrado no aplicativo" erro={estado.erros?.codigoMfa}>
        {(p) => (
          <Input
            {...p}
            name="codigoMfa"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="tabular text-lg tracking-[0.3em]"
          />
        )}
      </Campo>
      <BotaoEnvio pendente="Confirmando…" size="lg" disabled={!guardou}>
        Confirmar e concluir a ativação
      </BotaoEnvio>
    </form>
  );
}
