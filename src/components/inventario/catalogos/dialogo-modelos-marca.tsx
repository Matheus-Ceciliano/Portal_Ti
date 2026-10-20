"use client";

import { Package, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { acaoModelosDaMarca } from "@/server/acoes/catalogos";
import type { ModelosDaMarca } from "@/server/modulos/catalogos";

type Estado = { ok: true; dados: ModelosDaMarca } | { ok: false; erro: string } | null;

const th = "h-9 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4";
const td = "h-11 px-3 align-middle first:pl-4 last:pr-4";

/**
 * Detalhes da marca: os modelos cadastrados (A–Z), a categoria de cada um e quantos
 * equipamentos usam o modelo — lidos do banco ao abrir. Fecha pelo X, por Esc ou clicando fora.
 */
export function DialogoModelosMarca({ marca, aoFechar }: { marca: { id: string; nome: string }; aoFechar: () => void }) {
  const [estado, setEstado] = useState<Estado>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    acaoModelosDaMarca(marca.id)
      .then((r) => vivo && setEstado(r))
      .catch(() => vivo && setEstado({ ok: false, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    return () => {
      vivo = false;
    };
  }, [marca.id, tentativa]);

  const modelos = estado?.ok ? estado.dados.modelos : null;
  const total = modelos?.reduce((s, m) => s + m.equipamentos, 0) ?? 0;

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]")} data-testid="dialogo-modelos-marca">
        <DialogHeader className="shrink-0 border-b px-5 pt-5 pr-14 pb-4">
          <DialogTitle>{estado?.ok ? estado.dados.marca.nome : marca.nome}</DialogTitle>
          <DialogDescription className="tabular">
            {modelos ? `${modelos.length} ${modelos.length === 1 ? "modelo" : "modelos"} · ${total} ${total === 1 ? "equipamento" : "equipamentos"}` : "Modelos cadastrados"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {estado && !estado.ok ? (
            <div className="flex flex-col items-start gap-3 p-5">
              <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
              <Button variant="secondary" size="sm" onClick={() => (setEstado(null), setTentativa((t) => t + 1))}>
                <RotateCw aria-hidden /> Tentar novamente
              </Button>
            </div>
          ) : !modelos ? (
            <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Carregando modelos">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : modelos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center" data-testid="marca-sem-modelos">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                <Package className="size-5" />
              </span>
              <p className="font-semibold text-titulo">Nenhum modelo cadastrado</p>
              <p className="text-[13px] text-muted-foreground">Os modelos desta marca aparecem aqui ao serem cadastrados.</p>
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Modelos da marca {marca.nome}</caption>
              <thead className="sticky top-0 border-b bg-muted/60 backdrop-blur-sm">
                <tr>
                  <th scope="col" className={th}>
                    Modelo
                  </th>
                  <th scope="col" className={cn(th, "w-[38%]")}>
                    Equipamento
                  </th>
                  <th scope="col" className={cn(th, "w-24 text-right")}>
                    Quantidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelos.map((m) => (
                  <tr key={m.id} className={cn(!m.ativa && "bg-muted/35")}>
                    <td className={td}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate font-semibold", m.ativa ? "text-titulo" : "text-muted-foreground")}>{m.nome}</span>
                        {m.ativa ? null : <span className="shrink-0 rounded-sm bg-neutro-fundo px-1.5 text-[11px] leading-5 font-medium text-neutro">Inativo</span>}
                      </span>
                    </td>
                    <td className={cn(td, "truncate text-foreground/90")}>{m.categoria}</td>
                    <td className={cn(td, "text-right")}>
                      {m.equipamentos > 0 ? (
                        <Link
                          href={`/ti/inventario?marca=${marca.id}&modelo=${m.id}`}
                          className="tabular font-semibold text-link underline-offset-4 hover:underline"
                          aria-label={`${m.equipamentos} equipamentos ${m.nome}`}
                        >
                          {m.equipamentos}
                        </Link>
                      ) : (
                        <span className="tabular text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {estado?.ok && estado.dados.semModelo > 0 ? (
            <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground" data-testid="marca-sem-modelo">
              + {estado.dados.semModelo} {estado.dados.semModelo === 1 ? "equipamento" : "equipamentos"} da marca sem modelo cadastrado (ex.: carregadores)
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
