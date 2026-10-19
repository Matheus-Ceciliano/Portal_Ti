"use client";

import { FlaskConical, KeyRound, Lock, LockOpen, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo, CampoSenha, useFormularioAcao } from "@/components/comum/campos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  acaoAlterarBloqueio,
  acaoProvisionarMicrosoft,
  acaoRedefinirSenha,
  type EstadoAcao,
} from "@/server/acoes/administracao";

type Props = {
  colaboradorId: string;
  nome: string;
  temConta: boolean;
  bloqueada: boolean;
  podeRedefinirSenha: boolean;
  podeBloquear: boolean;
  podeProvisionar: boolean;
};

type Dialogo = "senha" | "bloqueio" | "microsoft" | null;

export function AcoesPessoa(props: Props) {
  const [aberto, setAberto] = useState<Dialogo>(null);
  const algumaAcao = props.podeRedefinirSenha || props.podeBloquear || props.podeProvisionar;
  if (!algumaAcao) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" data-testid="acoes-pessoa">
            <MoreHorizontal className="size-4" aria-hidden /> Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {props.podeRedefinirSenha ? (
            <DropdownMenuItem onSelect={() => setAberto("senha")}>
              <KeyRound className="size-4" aria-hidden /> Redefinir senha do portal
            </DropdownMenuItem>
          ) : null}
          {props.podeProvisionar ? (
            <DropdownMenuItem onSelect={() => setAberto("microsoft")}>
              <FlaskConical className="size-4" aria-hidden /> Criar conta Microsoft 365 (simulado)
            </DropdownMenuItem>
          ) : null}
          {props.podeBloquear ? (
            <DropdownMenuItem
              onSelect={() => setAberto("bloqueio")}
              className={props.bloqueada ? undefined : "text-destructive focus:text-destructive"}
            >
              {props.bloqueada ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              {props.bloqueada ? "Desbloquear conta" : "Bloquear conta"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoSenha {...props} aberto={aberto === "senha"} fechar={() => setAberto(null)} />
      <DialogoMicrosoft {...props} aberto={aberto === "microsoft"} fechar={() => setAberto(null)} />
      <DialogoBloqueio {...props} aberto={aberto === "bloqueio"} fechar={() => setAberto(null)} />
    </>
  );
}

function useConcluir(estado: EstadoAcao, fechar: () => void) {
  const tratado = useRef<EstadoAcao | null>(null);
  useEffect(() => {
    if (estado.ok && tratado.current !== estado) {
      tratado.current = estado;
      toast.success(estado.mensagem);
      fechar();
    }
  }, [estado, fechar]);
}

export function DialogoSenha({ colaboradorId, nome, aberto, fechar }: { colaboradorId: string; nome: string; aberto: boolean; fechar: () => void }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoRedefinirSenha, {});
  useConcluir(estado, fechar);
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Redefinir senha de {nome}</DialogTitle>
            <DialogDescription>
              Todas as sessões da pessoa serão encerradas. No próximo acesso ela define uma senha pessoal.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="colaboradorId" value={colaboradorId} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          <Campo rotulo="Nova senha" obrigatorio erro={estado.erros?.novaSenha} ajuda="Entregue ao titular por um canal fora do portal.">
            {(p) => <CampoSenha {...p} name="novaSenha" senhaDeOutraPessoa />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Redefinindo…">Redefinir senha</BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMicrosoft({ colaboradorId, nome, aberto, fechar }: Props & { aberto: boolean; fechar: () => void }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoProvisionarMicrosoft, {});
  useConcluir(estado, fechar);
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Criar conta Microsoft 365 para {nome}</DialogTitle>
            <DialogDescription>
              Integração em modo de simulação: nenhuma conta real é criada e nenhum dado sai do portal.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="colaboradorId" value={colaboradorId} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          <Campo rotulo="Senha inicial do Microsoft 365" obrigatorio erro={estado.erros?.senhaMicrosoft}>
            {(p) => <CampoSenha {...p} name="senhaMicrosoft" senhaDeOutraPessoa />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Executando…">Confirmar e executar</BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoBloqueio({ colaboradorId, nome, bloqueada, aberto, fechar }: Props & { aberto: boolean; fechar: () => void }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoAlterarBloqueio, {});
  useConcluir(estado, fechar);
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{bloqueada ? `Desbloquear a conta de ${nome}?` : `Bloquear a conta de ${nome}?`}</DialogTitle>
            <DialogDescription>
              {bloqueada
                ? "A pessoa volta a poder entrar no portal com a senha atual."
                : "A pessoa perde o acesso imediatamente e todas as sessões são encerradas."}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="colaboradorId" value={colaboradorId} />
          <input type="hidden" name="bloquear" value={bloqueada ? "nao" : "sim"} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Aplicando…" variant={bloqueada ? "default" : "destructive"}>
              {bloqueada ? "Desbloquear" : "Bloquear conta"}
            </BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
