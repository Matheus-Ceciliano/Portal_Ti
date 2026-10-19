"use client";

import { ChevronLeft, ChevronRight, ImageOff, ZoomIn } from "lucide-react";
import { useState } from "react";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ROTULO_FOTO, type TipoFoto } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { formatarDataHora } from "../visual";

export type FotoGaleria = { id: string; tipo: string; url: string; enviadaEm: string; enviadaPorNome: string };

/** Galeria de fotos do equipamento: miniaturas e ampliação com navegação por teclado. */
export function GaleriaFotos({ fotos, titulo = "Fotos do equipamento", compacta }: { fotos: FotoGaleria[]; titulo?: string; compacta?: boolean }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!fotos.length) {
    return (
      <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
        <ImageOff className="size-4" aria-hidden /> Nenhuma foto registrada.
      </p>
    );
  }
  const atual = aberta === null ? null : fotos[aberta];
  const ir = (passo: number) => setAberta((i) => (i === null ? i : (i + passo + fotos.length) % fotos.length));
  const rotulo = (f: FotoGaleria) => ROTULO_FOTO[f.tipo as TipoFoto] ?? "Foto";

  return (
    <>
      <ul className={cn("grid gap-2", compacta ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5")} aria-label={titulo}>
        {fotos.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => setAberta(i)}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Ampliar foto: ${rotulo(f)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão */}
              <img src={f.url} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-0.5 text-left text-[11.5px] font-medium text-white">
                {rotulo(f)}
              </span>
              <ZoomIn className="absolute top-1.5 right-1.5 size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={atual !== null} onOpenChange={(v) => !v && setAberta(null)}>
        <DialogContent
          className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-3 p-3 sm:w-[min(1100px,calc(100%-2rem))] sm:max-w-none sm:p-4 lg:w-[min(1100px,calc(100%-17rem))]")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") ir(1);
            if (e.key === "ArrowLeft") ir(-1);
          }}
          data-testid="foto-ampliada"
        >
          {atual ? (
            <>
              <div className="flex items-start justify-between gap-3 pr-10">
                <div className="min-w-0">
                  <DialogTitle className="text-base">{rotulo(atual)}</DialogTitle>
                  <DialogDescription className="text-[12.5px]">
                    {formatarDataHora(atual.enviadaEm)} · {atual.enviadaPorNome} · {aberta! + 1} de {fotos.length}
                  </DialogDescription>
                </div>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/90">
                {/* eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão */}
                <img src={atual.url} alt={rotulo(atual)} className="max-h-[calc(100dvh-9rem)] max-w-full object-contain" />
                {fotos.length > 1 ? (
                  <>
                    <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 left-2 -translate-y-1/2 opacity-90" onClick={() => ir(-1)} aria-label="Foto anterior">
                      <ChevronLeft aria-hidden />
                    </Button>
                    <Button type="button" variant="secondary" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 opacity-90" onClick={() => ir(1)} aria-label="Próxima foto">
                      <ChevronRight aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
