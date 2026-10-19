"use client";

import { Building2, MapPin, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo, useFormularioAcao } from "@/components/comum/campos";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, InputComIcone } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { acaoSalvarEmpresa, type EstadoEmpresa } from "@/server/acoes/empresas";
import { CampoCnpj, CampoLogo } from "./campos-empresa";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "./posicao-modal";

export type EmpresaEditavel = {
  id: string;
  nome: string;
  sigla: string;
  cnpj: string;
  cidade: string;
  ativa: boolean;
  responsavel: string | null;
  nomeCurtoSenha: string | null;
  observacoes: string | null;
  logoUrl: string | null;
};

/** Situação como controle segmentado sobre rádios nativos (teclado e leitor de tela funcionam). */
function ControleSituacao({ ativa }: { ativa: boolean }) {
  const [valor, setValor] = useState(ativa ? "ATIVA" : "INATIVA");
  return (
    <div role="radiogroup" aria-label="Situação da empresa" className="inline-grid w-fit grid-cols-2 self-start rounded-xl bg-muted p-1">
      {[
        { v: "ATIVA", rotulo: "Ativa" },
        { v: "INATIVA", rotulo: "Inativa" },
      ].map((o) => (
        <label
          key={o.v}
          className={cn(
            "relative flex h-10 cursor-pointer items-center justify-center rounded-lg px-5 text-[13px] font-semibold transition-colors lg:h-9",
            "has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-muted",
            valor === o.v ? "bg-card text-titulo shadow-nivel-1" : "text-muted-foreground hover:text-titulo",
          )}
        >
          <input
            type="radio"
            name="ativa"
            value={o.v}
            checked={valor === o.v}
            onChange={() => setValor(o.v)}
            className="sr-only"
          />
          {o.rotulo}
        </label>
      ))}
    </div>
  );
}

export function DialogoFormularioEmpresa({
  aberto,
  aoMudar,
  empresa,
  armazenamentoDisponivel,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** Ausente = cadastro; presente = edição. */
  empresa?: EmpresaEditavel | null;
  armazenamentoDisponivel: boolean;
}) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoEmpresa>(acaoSalvarEmpresa, {});
  const [sigla, setSigla] = useState(empresa?.sigla ?? "");
  const tratado = useRef<EstadoEmpresa | null>(null);
  const edicao = Boolean(empresa);

  useEffect(() => {
    if (estado.ok && tratado.current !== estado) {
      tratado.current = estado;
      toast.success(estado.mensagem);
      aoMudar(false);
      router.refresh();
    }
  }, [estado, aoMudar, router]);

  // Alterações não salvas: fechar pede confirmação (Cancelar, X, Esc). O clique fora já não fecha.
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const marcarAlterado = () => setAlterado(true);
  const solicitarFechar = () => {
    if (pendente) return;
    if (alterado) setConfirmarDescarte(true);
    else aoMudar(false);
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : solicitarFechar())}>
        <DialogContent
          className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", LARGURA_MODAL[1050])}
          data-testid="dialogo-empresa"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>{edicao ? `Editar ${empresa!.nome}` : "Cadastrar empresa"}</DialogTitle>
            <DialogDescription>
              Campos com * são obrigatórios. O CNPJ é conferido pelos dígitos verificadores, o que não comprova que a
              empresa existe na Receita Federal.
            </DialogDescription>
          </DialogHeader>

          {/* Só o corpo rola, e apenas quando a altura disponível não comporta o formulário. */}
          <form
            id="form-empresa"
            onSubmit={aoEnviar}
            onChange={marcarAlterado}
            noValidate
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5"
            data-testid="corpo-formulario-empresa"
          >
            {empresa ? <input type="hidden" name="id" value={empresa.id} /> : null}
            {estado.erro ? (
              <div className="mb-4">
                <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
              </div>
            ) : null}

            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">
              <div className="sm:col-span-2 lg:col-span-4 lg:row-span-2">
                <CampoLogo
                  urlAtual={empresa?.logoUrl ?? null}
                  sigla={sigla}
                  erroServidor={estado.erros?.logo}
                  disponivel={armazenamentoDisponivel}
                  aoAlterar={marcarAlterado}
                />
              </div>
              <Campo rotulo="Razão social" obrigatorio erro={estado.erros?.nome} className="sm:col-span-2 lg:col-span-8">
                {(p) => (
                  <InputComIcone
                    {...p}
                    icone={Building2}
                    name="nome"
                    defaultValue={empresa?.nome}
                    autoComplete="organization"
                    placeholder="Ex.: Horizonte Engenharia Ltda."
                    autoFocus={!edicao}
                  />
                )}
              </Campo>
              <Campo rotulo="Sigla ou nome curto" obrigatorio erro={estado.erros?.sigla} className="lg:col-span-3">
                {(p) => (
                  <Input
                    {...p}
                    name="sigla"
                    defaultValue={empresa?.sigla}
                    maxLength={12}
                    autoComplete="off"
                    className="uppercase"
                    placeholder="HZE"
                    onChange={(e) => setSigla(e.target.value.toUpperCase())}
                  />
                )}
              </Campo>
              <Campo rotulo="CNPJ" obrigatorio ajuda="Aceita o formato numérico e o alfanumérico (a partir de 2026)." className="lg:col-span-5">
                {(p) => <CampoCnpj {...p} valorInicial={empresa?.cnpj} erroServidor={estado.erros?.cnpj} />}
              </Campo>

              <Campo rotulo="Cidade" obrigatorio erro={estado.erros?.cidade} className="lg:col-span-3">
                {(p) => <InputComIcone {...p} icone={MapPin} name="cidade" defaultValue={empresa?.cidade} autoComplete="address-level2" />}
              </Campo>
              <Campo rotulo="Responsável" erro={estado.erros?.responsavel} ajuda="Pessoa de referência da empresa." className="lg:col-span-3">
                {(p) => (
                  <InputComIcone {...p} icone={UserRound} name="responsavel" defaultValue={empresa?.responsavel ?? ""} autoComplete="off" />
                )}
              </Campo>
              <Campo rotulo="Nome curto para senha" erro={estado.erros?.nomeCurtoSenha} ajuda="Usado na senha inicial (ex.: Virta)." className="lg:col-span-3">
                {(p) => <Input {...p} name="nomeCurtoSenha" defaultValue={empresa?.nomeCurtoSenha ?? ""} maxLength={30} autoComplete="off" spellCheck={false} />}
              </Campo>
              <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
                <span className="text-[13px] leading-5 font-semibold text-titulo">Situação</span>
                <ControleSituacao ativa={empresa?.ativa ?? true} />
              </div>

              <Campo
                rotulo="Observações"
                erro={estado.erros?.observacoes}
                ajuda="Até 1.000 caracteres. Não registre senhas nem dados pessoais."
                className="sm:col-span-2 lg:col-span-12"
              >
                {(p) => (
                  <Textarea {...p} name="observacoes" defaultValue={empresa?.observacoes ?? ""} maxLength={1000} rows={2} className="min-h-16" />
                )}
              </Campo>
            </div>

            <p className="mt-4 text-[13px] text-muted-foreground">
              Anexos de empresa ainda não estão disponíveis: o módulo de documentos será liberado em uma próxima etapa.
            </p>
          </form>

          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="secondary" disabled={pendente} onClick={solicitarFechar}>
              Cancelar
            </Button>
            <BotaoPendente form="form-empresa" pendente={pendente} rotuloPendente={edicao ? "Salvando…" : "Cadastrando…"}>
              {edicao ? "Salvar alterações" : "Cadastrar empresa"}
            </BotaoPendente>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent data-testid="confirmar-descarte">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              {edicao ? "As alterações feitas nesta empresa" : "Os dados preenchidos"} ainda não foram salvos e serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmarDescarte(false);
                aoMudar(false);
              }}
            >
              Descartar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
