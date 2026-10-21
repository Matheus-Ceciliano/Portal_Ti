"use client";

import { AlertTriangle, Download, ExternalLink, FileSignature, FileUp, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { SituacaoColaborador } from "@/lib/ter";
import { cn } from "@/lib/utils";
import { acaoMeuTer } from "@/server/acoes/ter-colaborador";
import { DialogoEnviarAssinado } from "./dialogo-enviar-assinado";

type Resposta = Awaited<ReturnType<typeof acaoMeuTer>>;
const FALHA = "Não foi possível carregar o termo. Tente novamente.";

export type MeuTerCabecalho = { id: string; numero: string; situacao: SituacaoColaborador; enviar?: boolean; historico?: boolean };

const COR_EVENTO = { info: "bg-info", sucesso: "bg-sucesso", erro: "bg-erro", atencao: "bg-atencao", neutro: "bg-muted-foreground" } as const;

export function DialogoMeuTer({ inicial, aoFechar }: { inicial: MeuTerCabecalho | null; aoFechar: () => void }) {
  return (
    <Dialog open={Boolean(inicial)} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-none", LARGURA_MODAL[900])}
        data-testid="dialogo-meu-ter"
      >
        {inicial ? <Conteudo key={inicial.id} inicial={inicial} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ inicial }: { inicial: MeuTerCabecalho }) {
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [enviar, setEnviar] = useState(false);
  // "Anexar" na lista: o envio abre assim que o termo chega (uma vez).
  const [pedido, setPedido] = useState(Boolean(inicial.enviar));
  const linhaTempo = useRef<HTMLElement>(null);
  const consulta = useRef<{ chave: string; promessa: Promise<Resposta> } | null>(null);

  useEffect(() => {
    let ativo = true;
    const chave = `${inicial.id}:${tentativa}`;
    if (consulta.current?.chave !== chave) consulta.current = { chave, promessa: acaoMeuTer(inicial.id) };
    consulta.current.promessa
      .then((r) => {
        if (!ativo) return;
        setResposta(r);
        if (r.ok && inicial.historico) requestAnimationFrame(() => linhaTempo.current?.scrollIntoView({ block: "start" }));
      })
      .catch(() => ativo && setResposta({ ok: false, erro: FALHA }));
    return () => {
      ativo = false;
    };
  }, [inicial.id, inicial.historico, tentativa]);

  const d = resposta?.ok ? resposta.dados : null;
  if (d && pedido) {
    setPedido(false);
    if (d.podeEnviar) setEnviar(true);
  }

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b py-4 pr-14 pl-5 sm:gap-4 sm:pl-6">
        <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground sm:grid" aria-hidden>
          <FileSignature className="size-5" />
        </span>
        <DialogHeader className="min-w-0 flex-1 gap-1">
          <DialogTitle className="tabular leading-7">
            {d?.numero ?? inicial.numero}
            {d ? <span className="text-[14px] font-medium text-muted-foreground"> · versão {d.versao}</span> : null}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <span>Termo de Entrega, Guarda e Responsabilidade</span>
              <Estado grupo="terColaborador" valor={d?.situacao ?? inicial.situacao} />
            </div>
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="conteudo-meu-ter">
        {resposta && !resposta.ok ? (
          <div className="flex flex-col items-start gap-3">
            <AlertaFormulario tom="erro">{resposta.erro}</AlertaFormulario>
            <Button variant="secondary" size="sm" onClick={() => (setResposta(null), setTentativa((t) => t + 1))}>
              <RotateCw aria-hidden /> Tentar novamente
            </Button>
          </div>
        ) : !d ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando o termo">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : (
          <>
            {d.recusa ? (
              <div className="flex flex-col gap-1 rounded-xl border border-erro/30 bg-erro-fundo px-4 py-3 text-[13.5px] text-erro" data-testid="recusa-meu-ter">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {d.recusa.mensagem}
                </p>
                {d.recusa.motivo ? <p className="pl-6">Motivo informado pela TI: {d.recusa.motivo}</p> : null}
              </div>
            ) : null}
            {d.situacao === "AGUARDANDO_CONFERENCIA" ? (
              <p className="rounded-xl border border-manual/30 bg-manual-fundo px-4 py-3 text-[13.5px] text-manual">Documento recebido. Sua assinatura será conferida pela equipe de TI.</p>
            ) : null}
            {d.situacao === "CANCELADO" ? (
              <p className="rounded-xl border bg-muted px-4 py-3 text-[13.5px] text-muted-foreground">Termo cancelado pela TI: disponível só para consulta, sem envio de assinatura.</p>
            ) : null}

            <section aria-label="Documento" className="rounded-xl border p-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["Data da entrega", formatarData(d.entregueEm)],
                    ["Data de emissão", d.emitidoEm ? formatarData(d.emitidoEm) : "—"],
                    ["Versão vigente", `Versão ${d.versao}`],
                    ["Empresa", d.empresa ?? "—"],
                  ] as const
                ).map(([rotulo, valor]) => (
                  <div key={rotulo} className="min-w-0">
                    <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
                    <dd className="font-semibold break-words text-titulo">{valor}</dd>
                  </div>
                ))}
              </dl>
              {d.nomeArquivo ? <p className="mt-3 text-[13px] break-words text-muted-foreground">Arquivo: {d.nomeArquivo}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {d.pdf ? (
                  <>
                    <Button asChild variant="secondary" size="sm">
                      <a href={d.pdf} target="_blank" rel="noopener" data-testid="visualizar-meu-ter">
                        <ExternalLink aria-hidden /> Visualizar PDF
                      </a>
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <a href={`${d.pdf}&baixar=1`}>
                        <Download aria-hidden /> Baixar PDF
                      </a>
                    </Button>
                  </>
                ) : null}
                {d.pdfAssinado ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href={`${d.pdfAssinado}&baixar=1`} data-testid="baixar-meu-ter-assinado">
                      <Download aria-hidden /> Baixar PDF assinado
                    </a>
                  </Button>
                ) : null}
                {d.podeEnviar ? (
                  <Button size="sm" onClick={() => setEnviar(true)} data-testid="anexar-meu-ter">
                    <FileUp aria-hidden /> Anexar TER assinado
                  </Button>
                ) : null}
              </div>
            </section>

            <section aria-label="Equipamentos" className="rounded-xl border">
              <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">Equipamentos entregues</h3>
              <ul className="divide-y">
                {d.equipamentos.map((e) => (
                  <li key={e.identificador} className="flex flex-col gap-0.5 px-4 py-2.5 text-[13.5px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span className="min-w-0">
                      <span className="tabular font-semibold text-titulo">{e.identificador}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.descricao}
                        {e.patrimonio ? ` · patrimônio ${e.patrimonio}` : ""}
                        {e.numeroSerie ? ` · série ${e.numeroSerie}` : ""}
                      </span>
                    </span>
                    {e.condicao ? <span className="shrink-0 text-[12.5px] text-muted-foreground">Condição na entrega: {e.condicao}</span> : null}
                  </li>
                ))}
              </ul>
            </section>

            {d.versoesAnteriores.length ? (
              <section aria-label="Versões anteriores" className="rounded-xl border">
                <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">Versões anteriores (só consulta)</h3>
                <ul className="divide-y">
                  {d.versoesAnteriores.map((v) => (
                    <li key={v.versao} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
                      <span>
                        Versão {v.versao} · {v.estado === "SUBSTITUIDO" ? "substituída" : "histórica"}
                        {v.emitidaEm ? ` · emitida em ${formatarData(v.emitidaEm)}` : ""}
                      </span>
                      <a href={v.pdf} target="_blank" rel="noopener" className="font-semibold text-link underline-offset-4 hover:underline">
                        Visualizar
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section ref={linhaTempo} aria-label="Histórico" className="scroll-mt-4" data-testid="linha-tempo-meu-ter">
              <h3 className="mb-2 text-[13px] font-bold text-titulo">Histórico</h3>
              <ol className="relative flex flex-col gap-3 border-l pl-5">
                {d.eventos.map((e, i) => (
                  <li key={`${e.em}-${i}`} className="relative">
                    <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card", COR_EVENTO[e.tom])} aria-hidden />
                    <p className="text-[13.5px] font-semibold text-titulo">{e.titulo}</p>
                    <p className="text-[12.5px] text-muted-foreground">{formatarDataHora(e.em)}</p>
                    {e.detalhe ? <p className="text-[13px] break-words">{e.detalhe}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>

      {d?.podeEnviar ? (
        <DialogFooter className="mx-0 mb-0 shrink-0 px-5 py-3 sm:px-6">
          <Button onClick={() => setEnviar(true)}>
            <FileUp aria-hidden /> Anexar TER assinado
          </Button>
        </DialogFooter>
      ) : null}

      {d && enviar ? <DialogoEnviarAssinado ter={d} aberto aoMudar={(v) => !v && setEnviar(false)} aoConcluir={() => setTentativa((t) => t + 1)} /> : null}
    </>
  );
}
