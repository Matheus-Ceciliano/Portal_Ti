"use client";

import { ArrowLeftRight, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { DialogoTransferirColaborador } from "@/components/inventario/ficha/dialogos-transferencia";
import { paraTransferencia } from "@/components/inventario/ficha/transferencia";
import { MiniaturaEquipamento } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { acaoEquipamento } from "@/server/acoes/inventario";
import type { DetalheAlocacaoReal } from "@/server/modulos/alocacoes";
import type { FichaEquipamento } from "@/server/modulos/inventario";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]");

/** Equipamentos da alocação que podem ser transferidos: os entregues, menos os carregadores (seguem o notebook). */
export const transferiveis = (d: DetalheAlocacaoReal) => d.itens.filter((i) => i.aberto && !i.ativo.carregadorDe);

/**
 * Transferência para outro colaborador a partir de uma alocação ativa: escolhe-se o
 * equipamento (o carregador entregue com o notebook acompanha) e segue o fluxo de
 * transferência — entrega física agora ou reserva —, com a empresa conferida no servidor.
 */
export function DialogoTransferirDaAlocacao({
  dados,
  podeEntregar,
  aoFechar,
  aoConcluir,
}: {
  dados: DetalheAlocacaoReal;
  podeEntregar: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const itens = transferiveis(dados);
  const livres = itens.filter((i) => !i.transferenciaPendente);
  const [escolhido, setEscolhido] = useState<string>(livres.length === 1 ? livres[0].ativo.id : "");
  // Um só equipamento livre: vai direto para a transferência dele.
  const [automatico] = useState(() => (livres.length === 1 && itens.length === 1 ? livres[0].ativo.id : null));
  const [carregando, setCarregando] = useState(Boolean(automatico));
  const [ficha, setFicha] = useState<FichaEquipamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function continuar(id: string) {
    setCarregando(true);
    setErro(null);
    const r = await acaoEquipamento(id).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    setFicha(r.dados);
  }

  useEffect(() => {
    if (!automatico) return;
    let vivo = true;
    acaoEquipamento(automatico)
      .then((r) => {
        if (!vivo) return;
        setCarregando(false);
        if (r.ok) setFicha(r.dados);
        else setErro(r.erro);
      })
      .catch(() => {
        if (!vivo) return;
        setCarregando(false);
        setErro("Não foi possível falar com o servidor. Tente novamente.");
      });
    return () => {
      vivo = false;
    };
  }, [automatico]);

  if (ficha) {
    return (
      <DialogoTransferirColaborador
        aberto
        aoMudar={(v) => !v && aoFechar()}
        equipamento={paraTransferencia(ficha)}
        podeEntregar={podeEntregar}
        aoConcluir={aoConcluir}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !carregando && aoFechar()}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-escolher-transferencia">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-muted-foreground" aria-hidden /> Transferir colaborador
          </DialogTitle>
          <DialogDescription>
            <span className="tabular font-semibold text-titulo">{dados.numero}</span> · {dados.colaborador.nome}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          {automatico && !erro ? (
            <Skeleton className="h-16 rounded-xl" aria-label="Carregando o equipamento" />
          ) : (
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-titulo">Equipamento</legend>
              <ul className="divide-y rounded-xl border" role="radiogroup" aria-label="Equipamento a transferir">
                {itens.map((i) => {
                  const pendente = i.transferenciaPendente;
                  const marcado = escolhido === i.ativo.id;
                  const carregadores = dados.itens.filter((c) => c.aberto && c.ativo.carregadorDe === i.ativo.id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={marcado}
                        disabled={Boolean(pendente) || carregando}
                        onClick={() => setEscolhido(i.ativo.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                          marcado && "bg-accent/60",
                        )}
                      >
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", marcado ? "border-primary" : "border-input")} aria-hidden>
                          {marcado ? <span className="size-2 rounded-full bg-primary" /> : null}
                        </span>
                        <MiniaturaEquipamento url={i.ativo.miniatura} categoria={i.ativo.categoria} />
                        <span className="min-w-0 flex-1">
                          <span className="tabular block truncate font-semibold text-titulo">{i.ativo.nome ?? i.ativo.patrimonio ?? i.ativo.modelo}</span>
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            {pendente ? (
                              `Transferência reservada para ${pendente.colaborador.nome}`
                            ) : (
                              <>
                                {i.ativo.rotuloCategoria} · {i.ativo.marca} {i.ativo.modelo}
                                {carregadores.length ? (
                                  <>
                                    {" "}
                                    · <PlugZap className="inline size-3 align-[-1px]" aria-hidden /> leva {carregadores.map((c) => c.ativo.nome).join(", ")}
                                  </>
                                ) : null}
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" disabled={carregando} onClick={aoFechar}>
            Cancelar
          </Button>
          {automatico && !erro ? null : (
            <Button type="button" disabled={!escolhido} carregando={carregando} rotuloCarregando="Carregando…" onClick={() => void continuar(escolhido)}>
              Continuar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
