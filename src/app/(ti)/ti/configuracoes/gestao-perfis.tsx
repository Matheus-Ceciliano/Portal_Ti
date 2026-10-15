"use client";

import { Copy, KeyRound, MoreHorizontal, ShieldMinus, UserMinus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo, Selecao, useFormularioAcao } from "@/components/comum/campos";
import { formatarDataHora } from "@/components/comum/pagina";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  acaoAtribuirPerfil,
  acaoConcederPermissao,
  acaoGerarCodigoAtivacao,
  acaoRevogarPerfil,
  acaoRevogarPermissao,
  type EstadoAcao,
} from "@/server/acoes/administracao";

type Opcao = { id: string; rotulo: string };

/** Exibe o código de ativação uma única vez, com orientação de entrega fora do portal. */
function CodigoAtivacao({ dados }: { dados: NonNullable<EstadoAcao["codigoAtivacao"]> }) {
  return (
    <div role="status" className="rounded-md border border-sucesso/30 bg-sucesso-fundo p-4 text-sm">
      <p className="font-semibold text-titulo">Código de ativação de {dados.nome}</p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <span data-testid="codigo-ativacao" className="tabular rounded-sm bg-card px-2 py-1 font-mono text-lg tracking-wider text-titulo">
          {dados.codigo}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard.writeText(dados.codigo).then(() => toast.success("Código copiado."))}
        >
          <Copy className="size-4" aria-hidden /> Copiar
        </Button>
      </p>
      <p className="mt-2 text-muted-foreground">
        Válido até {formatarDataHora(dados.expiraEm)}, uma única vez. Entregue pessoalmente ou por outro canal fora do portal.
        Ele não será exibido de novo.
      </p>
    </div>
  );
}

export function FormularioAtribuirPerfil({ pessoas }: { pessoas: Opcao[] }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoAtribuirPerfil, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) ref.current?.reset();
  }, [estado]);
  return (
    <form ref={ref} onSubmit={aoEnviar} className="flex flex-col gap-4 px-5 py-4">
      {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
      {estado.codigoAtivacao ? <CodigoAtivacao dados={estado.codigoAtivacao} /> : null}
      <Campo rotulo="Pessoa" obrigatorio erro={estado.erros?.colaboradorId}>
        {(p) => (
          <Selecao {...p} name="colaboradorId" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            {pessoas.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Perfil" obrigatorio erro={estado.erros?.perfil}>
        {(p) => (
          <Selecao {...p} name="perfil" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            <option value="ESTAGIARIO_TI">Estagiário TI</option>
            <option value="SUPERVISOR_TI">Supervisor TI</option>
            <option value="GESTOR_ADM">Gestor ADM</option>
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Justificativa" obrigatorio erro={estado.erros?.justificativa}>
        {(p) => <Textarea {...p} name="justificativa" rows={2} required minLength={10} />}
      </Campo>
      <BotaoPendente pendente={pendente} rotuloPendente="Atribuindo…" className="self-start">
        Atribuir perfil
      </BotaoPendente>
    </form>
  );
}

export function FormularioConceder({
  pessoas,
  permissoes,
  dataMinima,
}: {
  pessoas: Opcao[];
  permissoes: { valor: string; rotulo: string }[];
  dataMinima: string;
}) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoConcederPermissao, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem);
      ref.current?.reset();
    }
  }, [estado]);
  return (
    <form ref={ref} onSubmit={aoEnviar} className="flex flex-col gap-4 px-5 py-4">
      {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
      <Campo rotulo="Membro da equipe de TI" obrigatorio erro={estado.erros?.colaboradorId}>
        {(p) => (
          <Selecao {...p} name="colaboradorId" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            {pessoas.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Permissão" obrigatorio erro={estado.erros?.permissao}>
        {(p) => (
          <Selecao {...p} name="permissao" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            {permissoes.map((o) => (
              <option key={o.valor} value={o.valor}>{o.rotulo}</option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Válida até" erro={estado.erros?.validaAte} ajuda="Obrigatória para provisionamento.">
        {(p) => <Input {...p} name="validaAte" type="date" min={dataMinima} />}
      </Campo>
      <Campo rotulo="Justificativa" obrigatorio erro={estado.erros?.justificativa}>
        {(p) => <Textarea {...p} name="justificativa" rows={2} required minLength={10} />}
      </Campo>
      <BotaoPendente pendente={pendente} rotuloPendente="Concedendo…" className="self-start">
        Conceder permissão
      </BotaoPendente>
    </form>
  );
}

type Dialogo =
  | { tipo: "revogarPerfil" | "revogarPermissao"; id: string; rotulo: string }
  | { tipo: "codigo" }
  | null;

export function AcoesMembro({
  colaboradorId,
  nome,
  perfis,
  permissoes,
  ativacaoPendente,
}: {
  colaboradorId: string;
  nome: string;
  perfis: Opcao[];
  permissoes: Opcao[];
  ativacaoPendente: boolean;
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Ações para ${nome}`} className="self-start">
            <MoreHorizontal className="size-4" aria-hidden /> Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {ativacaoPendente ? (
            <DropdownMenuItem onSelect={() => setDialogo({ tipo: "codigo" })}>
              <KeyRound className="size-4" aria-hidden /> Gerar novo código de ativação
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Revogar perfil</DropdownMenuLabel>
          {perfis.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => setDialogo({ tipo: "revogarPerfil", id: p.id, rotulo: p.rotulo })}
              className="text-destructive focus:text-destructive"
            >
              <UserMinus className="size-4" aria-hidden /> {p.rotulo}
            </DropdownMenuItem>
          ))}
          {permissoes.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Revogar permissão individual</DropdownMenuLabel>
              {permissoes.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDialogo({ tipo: "revogarPermissao", id: p.id, rotulo: p.rotulo })}
                >
                  <ShieldMinus className="size-4" aria-hidden /> {p.rotulo}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialogo?.tipo === "revogarPerfil" ? (
        <DialogoRevogarPerfil nome={nome} perfil={dialogo} fechar={() => setDialogo(null)} />
      ) : null}
      {dialogo?.tipo === "revogarPermissao" ? (
        <DialogoRevogarPermissao nome={nome} concessao={dialogo} fechar={() => setDialogo(null)} />
      ) : null}
      {dialogo?.tipo === "codigo" ? (
        <DialogoNovoCodigo colaboradorId={colaboradorId} nome={nome} fechar={() => setDialogo(null)} />
      ) : null}
    </>
  );
}

function DialogoRevogarPerfil({ nome, perfil, fechar }: { nome: string; perfil: { id: string; rotulo: string }; fechar: () => void }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoRevogarPerfil, {});
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem);
      fechar();
    }
  }, [estado, fechar]);
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Revogar o perfil {perfil.rotulo} de {nome}?</DialogTitle>
            <DialogDescription>As sessões da pessoa são encerradas na hora. A operação fica registrada na auditoria.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="perfilAtribuidoId" value={perfil.id} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          <Campo rotulo="Justificativa" obrigatorio erro={estado.erros?.justificativa}>
            {(p) => <Textarea {...p} name="justificativa" rows={2} />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Revogando…" variant="destructive">Revogar perfil</BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoRevogarPermissao({
  nome,
  concessao,
  fechar,
}: {
  nome: string;
  concessao: { id: string; rotulo: string };
  fechar: () => void;
}) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoRevogarPermissao, {});
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem);
      fechar();
    }
  }, [estado, fechar]);
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Revogar a permissão de {nome}?</DialogTitle>
            <DialogDescription>
              {concessao.rotulo}. O efeito vale a partir da próxima requisição da pessoa.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="concessaoId" value={concessao.id} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Revogando…" variant="destructive">Revogar permissão</BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoNovoCodigo({ colaboradorId, nome, fechar }: { colaboradorId: string; nome: string; fechar: () => void }) {
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoAcao>(acaoGerarCodigoAtivacao, {});
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Gerar novo código de ativação para {nome}?</DialogTitle>
            <DialogDescription>
              Os códigos anteriores deixam de valer, o autenticador configurado é descartado e as sessões da pessoa são encerradas.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="colaboradorId" value={colaboradorId} />
          {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
          {estado.codigoAtivacao ? <CodigoAtivacao dados={estado.codigoAtivacao} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>{estado.ok ? "Fechar" : "Cancelar"}</Button>
            {!estado.ok ? (
              <BotaoPendente pendente={pendente} rotuloPendente="Gerando…">Gerar código</BotaoPendente>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
