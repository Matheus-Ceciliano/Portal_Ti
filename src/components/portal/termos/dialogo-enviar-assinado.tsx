"use client";

import { Download, ExternalLink, FileUp, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { formatarData } from "@/components/comum/pagina";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SERVICO_ASSINATURA_GOVBR } from "@/lib/ter";
import { cn } from "@/lib/utils";
import { acaoEnviarMeuTerAssinado } from "@/server/acoes/ter-colaborador";
import type { DetalheMeuTer } from "@/server/modulos/ter-colaborador";

const PDF_MAXIMO = 10 * 1024 * 1024;

/**
 * Envio do PDF assinado pelo próprio colaborador. O arquivo vai como foi assinado (sem
 * conversão); o servidor confere tipo real, tamanho, titularidade e versão vigente.
 */
export function DialogoEnviarAssinado({ ter, aberto, aoMudar, aoConcluir }: { ter: DetalheMeuTer; aberto: boolean; aoMudar: (v: boolean) => void; aoConcluir: () => void }) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!arquivo) return setErroArquivo("Selecione o PDF assinado.");
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf") return setErroArquivo("Envie o termo assinado em PDF.");
    if (arquivo.size > PDF_MAXIMO) return setErroArquivo("O PDF pode ter no máximo 10 MB.");
    const dados = new FormData();
    dados.set("termoId", ter.id);
    dados.set("versao", String(ter.versao));
    dados.set("pdf", arquivo);
    setEnviando(true);
    setErro(null);
    const r = await acaoEnviarMeuTerAssinado(dados).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(r.mensagem);
    aoMudar(false);
    aoConcluir();
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]")} data-testid="dialogo-enviar-assinado">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle>Enviar TER assinado</DialogTitle>
          <DialogDescription className="sr-only">Envio do PDF do termo assinado pelo GOV.BR.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <dl className="grid gap-x-5 gap-y-2 rounded-xl border bg-muted/30 px-4 py-3 sm:grid-cols-2">
            {(
              [
                ["Número do TER", ter.numero],
                ["Versão do documento", `Versão ${ter.versao}`],
                ["Data de emissão", ter.emitidoEm ? formatarData(ter.emitidoEm) : "—"],
                ["Colaborador", ter.colaborador],
                ["Arquivo emitido", ter.nomeArquivo ?? "—"],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className={cn("min-w-0", rotulo === "Arquivo emitido" && "sm:col-span-2")}>
                <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
                <dd className="font-semibold break-words text-titulo">{valor}</dd>
              </div>
            ))}
          </dl>
          <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-fundo px-3 py-2 text-[13.5px] text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Baixe o TER, assine o documento completo pelo GOV.BR e anexe aqui o PDF assinado, sem alterar seu conteúdo.
          </p>
          <div className="flex flex-wrap gap-2">
            {ter.pdf ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`${ter.pdf}&baixar=1`}>
                  <Download aria-hidden /> Baixar o TER
                </a>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <a href={SERVICO_ASSINATURA_GOVBR} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Assinar pelo GOV.BR
              </a>
            </Button>
          </div>
          <Campo rotulo="PDF assinado (até 10 MB)" obrigatorio erro={erroArquivo ?? undefined}>
            {(p) => (
              <Input
                {...p}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  setErroArquivo(null);
                }}
                data-testid="arquivo-ter-assinado"
              />
            )}
          </Campo>
          <p className="text-[12.5px] text-muted-foreground">O envio não conclui a assinatura: a equipe de TI confere o arquivo antes de marcar o termo como assinado.</p>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Enviando…" onClick={() => void enviar()}>
            <FileUp aria-hidden /> Enviar PDF assinado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
