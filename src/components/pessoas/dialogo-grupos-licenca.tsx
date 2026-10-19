"use client";

import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo, useFormularioAcao } from "@/components/comum/campos";
import { StatusBadge } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { acaoSalvarGrupoLicenca, type EstadoPessoa } from "@/server/acoes/pessoas";
import type { GrupoLicencaItem } from "@/server/modulos/grupos-licenca";

/**
 * Catálogo local de grupos de licença (domínios de login e de e-mail). Mudar um domínio não
 * renomeia logins já atribuídos; grupo em uso é inativado, nunca excluído.
 */
export function DialogoGruposLicenca({ aberto, aoMudar, grupos }: { aberto: boolean; aoMudar: (v: boolean) => void; grupos: GrupoLicencaItem[] }) {
  const [editando, setEditando] = useState<GrupoLicencaItem | "novo" | null>(null);
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        aoMudar(v);
        if (!v) setEditando(null);
      }}
    >
      <DialogContent className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-16px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none", LARGURA_MODAL[900])} data-testid="dialogo-grupos-licenca">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle>{editando === "novo" ? "Novo grupo de licença" : editando ? `Editar ${editando.nome}` : "Grupos de licença"}</DialogTitle>
          <DialogDescription>
            Configuração local usada no cálculo do login Microsoft e do e-mail. Não comprova licença atribuída nem domínio verificado no tenant.
          </DialogDescription>
        </DialogHeader>
        {editando ? (
          <FormularioGrupo key={editando === "novo" ? "novo" : editando.id} grupo={editando === "novo" ? null : editando} aoVoltar={() => setEditando(null)} />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="overflow-hidden rounded-xl border">
                <table className="hidden w-full text-sm sm:table">
                  <caption className="sr-only">Grupos de licença</caption>
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left text-[12.5px] text-muted-foreground">
                      <th scope="col" className="h-10 px-4 font-semibold">Grupo</th>
                      <th scope="col" className="h-10 px-3 font-semibold">Domínio de login</th>
                      <th scope="col" className="h-10 px-3 font-semibold">Domínio de e-mail</th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">Pessoas</th>
                      <th scope="col" className="h-10 px-3 font-semibold">Situação</th>
                      <th scope="col" className="h-10 pr-4 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grupos.map((g) => (
                      <tr key={g.id}>
                        <td className="px-4 py-2.5 font-semibold text-titulo">{g.nome}</td>
                        <td className="tabular px-3 py-2.5 break-all">{g.dominioLogin}</td>
                        <td className="tabular px-3 py-2.5 break-all">{g.dominioEmail}</td>
                        <td className="tabular px-3 py-2.5 text-right">{g.pessoas}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge tom={g.ativo ? "sucesso" : "neutro"}>{g.ativo ? "Ativo" : "Inativo"}</StatusBadge>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${g.nome}`} onClick={() => setEditando(g)}>
                            <Pencil aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y sm:hidden">
                  {grupos.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-semibold text-titulo">{g.nome}</span>
                        <span className="tabular block truncate text-[12.5px] text-muted-foreground">Login: {g.dominioLogin}</span>
                        <span className="tabular block truncate text-[12.5px] text-muted-foreground">E-mail: {g.dominioEmail}</span>
                      </span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${g.nome}`} onClick={() => setEditando(g)}>
                        <Pencil aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0">
              <Button type="button" onClick={() => setEditando("novo")}>
                <Plus aria-hidden /> Novo grupo
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioGrupo({ grupo, aoVoltar }: { grupo: GrupoLicencaItem | null; aoVoltar: () => void }) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoPessoa>(acaoSalvarGrupoLicenca, {});
  const [ativo, setAtivo] = useState(grupo?.ativo ?? true);
  const tratado = useRef<EstadoPessoa | null>(null);

  useEffect(() => {
    if (estado.ok && tratado.current !== estado) {
      tratado.current = estado;
      toast.success(estado.mensagem);
      router.refresh();
      aoVoltar();
    }
  }, [estado, router, aoVoltar]);

  return (
    <form onSubmit={aoEnviar} noValidate className="flex min-h-0 flex-1 flex-col">
      {grupo ? <input type="hidden" name="id" value={grupo.id} /> : null}
      <input type="hidden" name="ativo" value={ativo ? "sim" : "nao"} />
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
        {estado.erro ? (
          <div className="sm:col-span-2">
            <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
          </div>
        ) : null}
        <Campo rotulo="Nome do grupo" obrigatorio erro={estado.erros?.nome} ajuda="Ex.: VIRTA - F1" className="sm:col-span-2">
          {(p) => <Input {...p} name="nome" defaultValue={grupo?.nome} autoComplete="off" className="uppercase" autoFocus />}
        </Campo>
        <Campo rotulo="Domínio de login" obrigatorio erro={estado.erros?.dominioLogin} ajuda="Usado no login Microsoft.">
          {(p) => <Input {...p} name="dominioLogin" defaultValue={grupo?.dominioLogin} autoComplete="off" spellCheck={false} placeholder="empresa.onmicrosoft.com" />}
        </Campo>
        <Campo rotulo="Domínio de e-mail" obrigatorio erro={estado.erros?.dominioEmail} ajuda="Usado no e-mail corporativo.">
          {(p) => <Input {...p} name="dominioEmail" defaultValue={grupo?.dominioEmail} autoComplete="off" spellCheck={false} placeholder="empresa.com.br" />}
        </Campo>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-[13px] font-semibold text-titulo">Situação</span>
          <div role="radiogroup" aria-label="Situação do grupo" className="inline-grid w-fit grid-cols-2 rounded-xl bg-muted p-1">
            {[
              { v: true, rotulo: "Ativo" },
              { v: false, rotulo: "Inativo" },
            ].map((o) => (
              <button
                key={o.rotulo}
                type="button"
                role="radio"
                aria-checked={ativo === o.v}
                onClick={() => setAtivo(o.v)}
                className={cn(
                  "h-9 rounded-lg px-5 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  ativo === o.v ? "bg-card text-titulo shadow-nivel-1" : "text-muted-foreground hover:text-titulo",
                )}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
          {grupo && grupo.pessoas > 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              {grupo.pessoas} {grupo.pessoas === 1 ? "pessoa usa" : "pessoas usam"} este grupo. Mudar domínios não altera logins já atribuídos.
            </p>
          ) : null}
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 shrink-0">
        <Button type="button" variant="secondary" onClick={aoVoltar} disabled={pendente}>
          <ArrowLeft aria-hidden /> Voltar
        </Button>
        <BotaoPendente pendente={pendente} rotuloPendente="Salvando…">
          {grupo ? "Salvar grupo" : "Incluir grupo"}
        </BotaoPendente>
      </DialogFooter>
    </form>
  );
}
