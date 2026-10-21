"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { acaoDefinirAssinaturaTi, acaoModeloTer } from "@/server/acoes/ter";

type Resposta = Awaited<ReturnType<typeof acaoModeloTer>>;

/**
 * Modelo documental aprovado (código, revisão e declarações). O texto jurídico não é editado pelo
 * portal; quem gerencia modelos só define se a conferência exige também a assinatura da TI.
 */
export function DialogoModeloTer({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    acaoModeloTer()
      .then((r) => ativo && setResposta(r))
      .catch(() => ativo && setResposta({ ok: false, erro: "Não foi possível carregar o modelo. Tente novamente." }));
    return () => {
      ativo = false;
    };
  }, [aberto, tentativa]);

  const m = resposta?.ok ? resposta.dados : null;

  async function alternar(exige: boolean) {
    if (!m) return;
    setSalvando(true);
    const r = await acaoDefinirAssinaturaTi(m.id, exige).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setSalvando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(r.mensagem);
    setTentativa((t) => t + 1);
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]")} data-testid="dialogo-modelo-ter">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle>Modelo do documento</DialogTitle>
          <DialogDescription>{m ? `${m.codigo} · revisão ${m.revisao}` : "Modelo documental do TER"}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {resposta && !resposta.ok ? (
            <div className="flex flex-col items-start gap-3">
              <AlertaFormulario tom="erro">{resposta.erro}</AlertaFormulario>
              <Button variant="secondary" size="sm" onClick={() => (setResposta(null), setTentativa((t) => t + 1))}>
                <RotateCw aria-hidden /> Tentar novamente
              </Button>
            </div>
          ) : !resposta ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando o modelo">
              <Skeleton className="h-6 w-56 rounded-md" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : !m ? (
            <AlertaFormulario tom="erro">Nenhum modelo ativo do TER está configurado.</AlertaFormulario>
          ) : (
            <>
              <section className="rounded-xl border p-4">
                <h3 className="text-[13px] font-bold text-titulo">{m.titulo}</h3>
                <p className="text-[12.5px] text-muted-foreground">Declarações impressas no termo (texto jurídico aprovado; não editável pelo portal).</p>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-5 text-titulo">
                  {m.declaracoes.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="text-[13px] font-bold text-titulo">Signatários exigidos na conferência</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">A assinatura do colaborador é sempre exigida. O login da TI não substitui uma assinatura eletrônica.</p>
                <label className={cn("mt-3 flex items-start gap-2.5 text-[13.5px] font-medium text-titulo", !m.podeGerir && "opacity-70")}>
                  <Checkbox checked={m.exigeAssinaturaTi} disabled={!m.podeGerir || salvando} onCheckedChange={(v) => void alternar(v === true)} className="mt-0.5" />
                  <span>Exigir também a assinatura do responsável da TI</span>
                </label>
                {!m.podeGerir ? <p className="mt-1.5 text-[12.5px] text-muted-foreground">Só quem gerencia modelos documentais altera esta configuração.</p> : null}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
