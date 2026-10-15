"use client";

import { CheckCircle2, FlaskConical, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertaFormulario, BotaoPendente, Campo, CampoSenha, Selecao, useFormularioAcao } from "@/components/comum/campos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { acaoCadastrarPessoa, type EstadoAcao } from "@/server/acoes/administracao";

type Empresa = { id: string; nome: string };

function gerarSenha(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

export function FormularioCadastro({ empresas, podeProvisionar }: { empresas: Empresa[]; podeProvisionar: boolean }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoCadastrarPessoa, {});
  const [etapa, setEtapa] = useState<"preencher" | "revisar">("preencher");
  const [resumo, setResumo] = useState<Record<string, string>>({});
  const [criarM365, setCriarM365] = useState(false);
  const refForm = useRef<HTMLFormElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);

  // Erro do servidor: volta ao preenchimento para corrigir (ajuste de estado durante a renderização).
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.erro || estado.erros) setEtapa("preencher");
  }

  // A senha de outra pessoa não fica no formulário ao sair da página (DESIGN_SYSTEM.md §9.2).
  useEffect(() => {
    const limpar = () => {
      if (refSenha.current) refSenha.current.value = "";
    };
    window.addEventListener("pagehide", limpar);
    return () => {
      window.removeEventListener("pagehide", limpar);
      limpar();
    };
  }, []);

  function revisar() {
    const form = refForm.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const dados = new FormData(form);
    setResumo({
      nome: String(dados.get("nome")),
      email: String(dados.get("email")).trim().toLowerCase(),
      cargo: String(dados.get("cargo")),
      departamento: String(dados.get("departamento")),
      empresa: empresas.find((e) => e.id === dados.get("empresaId"))?.nome ?? "",
    });
    setEtapa("revisar");
    requestAnimationFrame(() => refTitulo.current?.focus());
  }

  if (estado.ok) {
    return (
      <div className="max-w-[720px] rounded-lg border bg-card p-5 shadow-nivel-1">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sucesso" aria-hidden />
          <div role="status">
            <p className="font-semibold text-titulo">Cadastro concluído</p>
            <p className="mt-1 text-muted-foreground">{estado.mensagem}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/ti/cadastros/pessoas/${estado.colaboradorId}`}>Abrir ficha da pessoa</Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Cadastrar outra pessoa
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={refForm}
      onSubmit={(evento) => {
        // Enviar sempre passa pela revisão: a execução só ocorre no botão "Confirmar e executar".
        if (etapa !== "revisar") {
          evento.preventDefault();
          revisar();
          return;
        }
        aoEnviar(evento);
      }}
      className="max-w-[720px]"
      noValidate
    >
      {estado.erro ? (
        <div className="mb-5">
          <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
        </div>
      ) : null}

      <div className={etapa === "revisar" ? "hidden" : "flex flex-col gap-8"}>
        <fieldset className="rounded-lg border bg-card p-5 shadow-nivel-1">
          <legend className="px-1 text-base font-semibold text-titulo">Dados do colaborador</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome completo" obrigatorio erro={estado.erros?.nome} className="sm:col-span-2">
              {(p) => <Input {...p} name="nome" required minLength={3} autoComplete="off" />}
            </Campo>
            <Campo rotulo="E-mail corporativo" obrigatorio erro={estado.erros?.email} ajuda="Será o login do portal." className="sm:col-span-2">
              {(p) => <Input {...p} name="email" type="email" required autoComplete="off" spellCheck={false} />}
            </Campo>
            <Campo rotulo="Empresa" obrigatorio erro={estado.erros?.empresaId}>
              {(p) => (
                <Selecao {...p} name="empresaId" required defaultValue="">
                  <option value="" disabled>Selecione</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Cargo" obrigatorio erro={estado.erros?.cargo}>
              {(p) => <Input {...p} name="cargo" required minLength={2} autoComplete="off" />}
            </Campo>
            <Campo rotulo="Departamento" obrigatorio erro={estado.erros?.departamento} className="sm:col-span-2">
              {(p) => <Input {...p} name="departamento" required minLength={2} autoComplete="off" />}
            </Campo>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border bg-card p-5 shadow-nivel-1">
          <legend className="px-1 text-base font-semibold text-titulo">Acesso ao portal</legend>
          <Campo
            rotulo="Senha inicial"
            obrigatorio
            erro={estado.erros?.senhaInicial}
            ajuda="Mínimo de 12 caracteres. Ela só abre a tela de ativação: no primeiro acesso o titular define a própria senha. Entregue-a por um canal fora do portal, nunca por planilha."
          >
            {(p) => <CampoSenha {...p} ref={refSenha} name="senhaInicial" required minLength={12} senhaDeOutraPessoa />}
          </Campo>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              if (refSenha.current) refSenha.current.value = gerarSenha();
            }}
          >
            <KeyRound className="size-4" aria-hidden /> Gerar senha aleatória
          </Button>

          {podeProvisionar ? (
            <label className="mt-5 flex items-start gap-3 rounded-md border border-dashed border-input p-3">
              <Checkbox name="criarContaMicrosoft" checked={criarM365} onCheckedChange={(v) => setCriarM365(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium text-titulo">Criar a conta Microsoft 365 com a mesma senha</span>
                <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  <FlaskConical className="size-3.5 text-faixa" aria-hidden />
                  Integração em modo de simulação: nenhuma conta real será criada.
                </span>
              </span>
            </label>
          ) : (
            <p className="mt-5 text-[13px] text-muted-foreground">
              A criação da conta Microsoft 365 exige a permissão de provisionamento. O cadastro fica registrado e
              quem tem a permissão executa o provisionamento depois.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={revisar}>Revisar cadastro</Button>
          <Button asChild variant="ghost">
            <Link href="/ti/cadastros/pessoas">Cancelar</Link>
          </Button>
        </div>
      </div>

      {etapa === "revisar" ? (
        <section aria-labelledby="titulo-revisao" className="rounded-lg border bg-card shadow-nivel-1">
          <div className="border-b px-5 py-4">
            <h2 id="titulo-revisao" ref={refTitulo} tabIndex={-1} className="text-base font-semibold outline-none">
              Revise o que será executado
            </h2>
            <p className="text-[13px] text-muted-foreground">Confirme só se os dados estiverem corretos.</p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
            {[
              ["Nome", resumo.nome],
              ["E-mail corporativo (login)", resumo.email],
              ["Empresa", resumo.empresa],
              ["Cargo e departamento", `${resumo.cargo} · ${resumo.departamento}`],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-[13px] text-muted-foreground">{rotulo}</dt>
                <dd className="font-medium text-titulo">{valor}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-2 border-t px-5 py-4 text-sm">
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sucesso" aria-hidden /> Registrar o colaborador como ativo
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sucesso" aria-hidden /> Criar a conta de acesso ao portal com a senha inicial (pendente de ativação)
            </li>
            {criarM365 ? (
              <li className="flex items-center gap-2">
                <FlaskConical className="size-4 text-faixa" aria-hidden /> Criar a conta Microsoft 365 (simulação)
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2 border-t px-5 py-4">
            <BotaoPendente pendente={pendente} rotuloPendente="Executando…">Confirmar e executar</BotaoPendente>
            <Button type="button" variant="outline" onClick={() => setEtapa("preencher")}>
              Voltar e editar
            </Button>
          </div>
        </section>
      ) : null}
    </form>
  );
}
