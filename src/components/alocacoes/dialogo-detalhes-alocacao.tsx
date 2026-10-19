"use client";

import { CheckCircle2, FileCheck2, FileText, FileUp, Info, PackageCheck, RotateCw, Undo2, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { formatarData } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { BadgeTer, formatarDataHora, agoraLocal, localParaIso, MiniaturaEquipamento } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ROTULO_DESTINO_DEVOLUCAO, ROTULO_ESTADO_FISICO, ROTULO_MOVIMENTACAO, ROTULO_SITUACAO, type Situacao } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoCancelarReserva, acaoConfirmarEntrega, acaoDetalheAlocacao, acaoRegistrarTerAssinado } from "@/server/acoes/alocacoes";
import type { DetalheAlocacaoReal } from "@/server/modulos/alocacoes";
import { DialogoDevolucao } from "./dialogo-devolucao";

type Resposta = Awaited<ReturnType<typeof acaoDetalheAlocacao>>;
export type PermissoesAlocacao = { confirmar: boolean; cancelar: boolean; devolver: boolean; anexarTer: boolean };

/** Cabeçalho mostrado na hora (linha clicada); o restante vem do servidor. */
export type AlocacaoCabecalho = { id: string; numero: string; colaborador: string; estado: DetalheAlocacaoReal["estado"] };

const FALHA = "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.";
const MOTIVO_ITEM = { DEVOLUCAO: "Devolvido", MANUTENCAO: "Recolhido para manutenção", CANCELAMENTO: "Reserva cancelada", SUBSTITUICAO: "Substituído", TRANSFERENCIA: "Transferido a outro colaborador" } as const;

function Dado({ rotulo, valor, className }: { rotulo: string; valor?: React.ReactNode; className?: string }) {
  const vazio = valor === undefined || valor === null || valor === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
      <dd className={cn("break-words", vazio ? "text-muted-foreground" : "font-semibold text-titulo")}>{vazio ? "—" : valor}</dd>
    </div>
  );
}

/**
 * Detalhes de uma alocação: colaborador e entrega, equipamentos (com a empresa proprietária de
 * cada um), TER, devoluções e histórico. Reserva: confirmar entrega física ou cancelar.
 * Entrega ativa: registrar devolução total ou parcial.
 */
export function DialogoDetalhesAlocacao({
  inicial,
  aoFechar,
  pode,
  destacarAtivo,
}: {
  inicial: AlocacaoCabecalho | null;
  aoFechar: () => void;
  pode: PermissoesAlocacao;
  /** Equipamento da linha de origem (aba Alocações da empresa), destacado na lista. */
  destacarAtivo?: string;
}) {
  return (
    <Dialog open={Boolean(inicial)} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        className={cn(
          MODAL_CENTRALIZADO,
          "flex flex-col gap-0 overflow-hidden p-0",
          "h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none sm:max-w-none",
          "sm:h-[min(720px,92dvh)] sm:max-h-[92dvh]",
          LARGURA_MODAL[1000],
        )}
        data-testid="dialogo-alocacao"
      >
        {inicial ? <Conteudo key={inicial.id} inicial={inicial} pode={pode} destacarAtivo={destacarAtivo} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ inicial, pode, destacarAtivo }: { inicial: AlocacaoCabecalho; pode: PermissoesAlocacao; destacarAtivo?: string }) {
  const router = useRouter();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [acao, setAcao] = useState<"confirmar" | "cancelar" | "devolver" | null>(null);
  // Uma consulta por abertura, mesmo com o efeito executado duas vezes no StrictMode (dev).
  const pedido = useRef<{ chave: string; promessa: Promise<Resposta> } | null>(null);

  useEffect(() => {
    let ativo = true;
    const chave = `${inicial.id}:${tentativa}`;
    if (pedido.current?.chave !== chave) pedido.current = { chave, promessa: acaoDetalheAlocacao(inicial.id) };
    pedido.current.promessa.then((r) => ativo && setResposta(r)).catch(() => ativo && setResposta({ ok: false, erro: FALHA }));
    return () => {
      ativo = false;
    };
  }, [inicial.id, tentativa]);

  const recarregar = () => {
    setTentativa((t) => t + 1);
    router.refresh();
  };
  const d = resposta?.ok ? resposta.dados : null;
  const estado = d?.estado ?? inicial.estado;
  const ter = d?.termos.find((t) => t.tipo === "TER" && t.estado !== "CANCELADO") ?? null;
  const abertos = d?.itens.filter((i) => i.aberto) ?? [];

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b py-4 pr-14 pl-5 sm:gap-4 sm:pl-6">
        <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground sm:grid" aria-hidden>
          <PackageCheck className="size-5" />
        </span>
        <DialogHeader className="min-w-0 flex-1 gap-1">
          <DialogTitle className="tabular leading-7">{d?.numero ?? inicial.numero}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-semibold text-titulo">{d?.colaborador.nome ?? inicial.colaborador}</span>
              {d ? <span>{d.empresaColaborador.nome}</span> : null}
              <Estado grupo="alocacao" valor={estado} />
              {d && estado !== "RESERVADA" && estado !== "CANCELADA" ? <BadgeTer estado={ter?.estado ?? null} /> : null}
            </div>
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="conteudo-alocacao">
        {resposta && !resposta.ok ? (
          <div className="flex flex-col items-start gap-3">
            <AlertaFormulario tom="erro">{resposta.erro}</AlertaFormulario>
            <Button type="button" variant="secondary" size="sm" onClick={() => (setResposta(null), setTentativa((t) => t + 1))}>
              <RotateCw aria-hidden /> Tentar novamente
            </Button>
          </div>
        ) : !d ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando a alocação">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="resumo" className="gap-4">
            <TabsList aria-label="Seções da alocação" className="h-auto w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="resumo" className="flex-none">Resumo</TabsTrigger>
              <TabsTrigger value="equipamentos" className="flex-none">
                Equipamentos <span className="tabular rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">{d.itens.length}</span>
              </TabsTrigger>
              <TabsTrigger value="documentos" className="flex-none">Documentos</TabsTrigger>
              <TabsTrigger value="historico" className="flex-none">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="flex flex-col gap-4">
              <section aria-label="Colaborador e entrega" className="rounded-xl border p-4">
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Dado
                    rotulo="Colaborador"
                    valor={
                      <Link href={`/ti/cadastros/pessoas/${d.colaborador.id}`} className="text-link underline-offset-4 hover:underline">
                        {d.colaborador.nome}
                      </Link>
                    }
                  />
                  <Dado rotulo="Empresa do colaborador" valor={d.empresaColaborador.nome} />
                  <Dado rotulo="Cargo" valor={d.colaborador.cargo} />
                  {d.entregueEm ? (
                    <Dado rotulo="Entrega física" valor={`${formatarDataHora(d.entregueEm)} · ${d.entreguePorNome}`} />
                  ) : (
                    <Dado rotulo="Entrega prevista" valor={d.previstaPara ? formatarData(d.previstaPara) : "Sem data"} />
                  )}
                  <Dado rotulo="Registrada" valor={`${formatarDataHora(d.criadaEm)} · ${d.criadaPorNome}`} />
                  <Dado rotulo="Equipamentos com o colaborador" valor={String(estado === "ATIVA" ? abertos.length : 0)} />
                  {d.observacoes ? <Dado rotulo="Observações" valor={<span className="font-normal whitespace-pre-line">{d.observacoes}</span>} className="sm:col-span-2 lg:col-span-3" /> : null}
                  {d.canceladaEm ? <Dado rotulo="Cancelada" valor={`${formatarDataHora(d.canceladaEm)} · ${d.motivoCancelamento}`} className="sm:col-span-2 lg:col-span-3" /> : null}
                </dl>
              </section>
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {estado === "RESERVADA"
                  ? "Reserva: ninguém fica responsável pelos equipamentos até a confirmação da entrega física."
                  : "O equipamento fica com o colaborador desde a entrega física; a assinatura do TER é acompanhada à parte."}
              </p>
            </TabsContent>

            <TabsContent value="equipamentos">
              <ul className="divide-y rounded-xl border" data-testid="itens-alocacao">
                {d.itens.map((i) => {
                  const outra = i.empresaProprietaria.id !== d.empresaColaborador.id;
                  return (
                    <li key={i.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", destacarAtivo === i.ativo.id && "bg-accent/50")}>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <MiniaturaEquipamento url={i.ativo.miniatura} categoria={i.ativo.categoria} />
                        <span className="min-w-0">
                          <Link href={`/ti/inventario/${i.ativo.id}`} className="tabular block truncate font-semibold text-titulo underline-offset-4 hover:underline">
                            {i.ativo.nome ?? i.ativo.patrimonio ?? i.ativo.modelo}
                            {i.ativo.nome && i.ativo.patrimonio ? <span className="font-normal text-muted-foreground"> · {i.ativo.patrimonio}</span> : null}
                          </Link>
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            {i.ativo.rotuloCategoria} · {i.ativo.marca} {i.ativo.modelo} · {i.empresaProprietaria.sigla}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {outra ? (
                          <StatusBadge tom="info" className="text-[11px]">
                            Proprietária: {i.empresaProprietaria.sigla}
                          </StatusBadge>
                        ) : null}
                        {i.aberto ? (
                          <StatusBadge tom={estado === "ATIVA" ? "sucesso" : "atencao"} className="text-[11px]">
                            {estado === "ATIVA" ? "Com o colaborador" : "Reservado"}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tom="neutro" className="text-[11px]">
                            {MOTIVO_ITEM[i.motivoEncerramento!]} · {formatarData(i.encerradoEm!)}
                          </StatusBadge>
                        )}
                      </div>
                      {i.devolucao ? (
                        <p className="text-[12.5px] text-muted-foreground sm:basis-full">
                          {i.devolucao.numero}: {ROTULO_ESTADO_FISICO[i.devolucao.estadoFisico]} → {ROTULO_DESTINO_DEVOLUCAO[i.devolucao.destino]}
                          {i.devolucao.observacoes ? ` · ${i.devolucao.observacoes}` : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </TabsContent>

            <TabsContent value="documentos" className="flex flex-col gap-4">
              <Documentos dados={d} podeAnexar={pode.anexarTer} aoMudar={recarregar} />
            </TabsContent>

            <TabsContent value="historico">
              {d.historico.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Sem movimentações.</p>
              ) : (
                <ol className="relative flex flex-col gap-3.5 border-l pl-5">
                  {d.historico.map((m) => (
                    <li key={m.id} className="relative">
                      <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary dark:bg-link" aria-hidden />
                      <p className="text-[13.5px]">
                        <span className="font-semibold text-titulo">{ROTULO_MOVIMENTACAO[m.tipo] ?? m.tipo}</span>
                        <span className="text-muted-foreground"> · </span>
                        <Link href={`/ti/inventario/${m.ativoId}`} className="tabular underline-offset-4 hover:underline">
                          {m.equipamento}
                        </Link>
                        {m.situacaoNova && m.situacaoNova !== m.situacaoAnterior ? (
                          <span className="text-[12.5px] text-muted-foreground"> → {ROTULO_SITUACAO[m.situacaoNova as Situacao]}</span>
                        ) : null}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {formatarDataHora(m.realizadoEm)} · {m.realizadoPorNome}
                      </p>
                      {m.observacao ? <p className="text-[13px]">{m.observacao}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 px-5 py-3 sm:px-6">
        <Button asChild variant="secondary">
          <Link href={`/ti/cadastros/pessoas/${d?.colaborador.id ?? ""}`} aria-disabled={!d}>
            <UserRound aria-hidden /> Ficha do colaborador
          </Link>
        </Button>
        {d && estado === "RESERVADA" && pode.cancelar ? (
          <Button variant="secondary" onClick={() => setAcao("cancelar")}>
            <XCircle aria-hidden /> Cancelar reserva
          </Button>
        ) : null}
        {d && estado === "RESERVADA" && pode.confirmar ? (
          <Button onClick={() => setAcao("confirmar")}>
            <CheckCircle2 aria-hidden /> Confirmar entrega
          </Button>
        ) : null}
        {d && estado === "ATIVA" && pode.devolver && abertos.length ? (
          <Button onClick={() => setAcao("devolver")}>
            <Undo2 aria-hidden /> Registrar devolução
          </Button>
        ) : null}
      </DialogFooter>

      {d && acao === "confirmar" ? <DialogoConfirmarEntrega dados={d} aoFechar={() => setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "cancelar" ? <DialogoCancelarReserva dados={d} aoFechar={() => setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "devolver" ? <DialogoDevolucao dados={d} aoFechar={() => setAcao(null)} aoConcluir={recarregar} /> : null}
    </>
  );
}

function Documentos({ dados, podeAnexar, aoMudar }: { dados: DetalheAlocacaoReal; podeAnexar: boolean; aoMudar: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entregue = dados.estado === "ATIVA" || dados.estado === "ENCERRADA";
  const assinado = dados.termos.some((t) => t.tipo === "TER" && t.estado === "ASSINADO");

  async function enviar() {
    if (!arquivo) return setErro("Selecione o PDF do termo assinado.");
    if (arquivo.size > 10 * 1024 * 1024) return setErro("O PDF pode ter no máximo 10 MB.");
    setEnviando(true);
    const dadosForm = new FormData();
    dadosForm.set("alocacaoId", dados.id);
    dadosForm.set("pdf", arquivo);
    const r = await acaoRegistrarTerAssinado(dadosForm).catch(() => ({ ok: false as const, erro: FALHA }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(r.mensagem);
    setArquivo(null);
    setErro(null);
    aoMudar();
  }

  return (
    <>
      {dados.termos.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <FileText className="size-4" aria-hidden /> Nenhum TER registrado para esta alocação.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {dados.termos.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="tabular block font-semibold text-titulo">{t.numero}</span>
                <span className="block text-[12.5px] text-muted-foreground">
                  {t.emitidoEm ? `Emitido em ${formatarData(t.emitidoEm)}` : "Recebido assinado"}
                  {t.assinadoEm ? ` · PDF assinado registrado em ${formatarDataHora(t.assinadoEm)} por ${t.assinadoPorNome}` : ""}
                </span>
              </span>
              <Estado grupo="termo" valor={t.estado} />
              {t.temPdf ? (
                <Button asChild variant="secondary" size="sm">
                  <a href={`/api/termos/${t.id}/pdf`} target="_blank" rel="noopener">
                    <FileCheck2 aria-hidden /> Abrir PDF
                  </a>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {podeAnexar && entregue && !assinado ? (
        <section aria-label="Registrar TER assinado" className="rounded-xl border p-4">
          <h3 className="text-[13px] font-bold text-titulo">Registrar TER assinado</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">PDF assinado fora do portal (GOV.BR). O documento só fica como assinado com o PDF guardado.</p>
          {erro ? (
            <div className="mt-2">
              <AlertaFormulario tom="erro">{erro}</AlertaFormulario>
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="file"
              accept="application/pdf"
              aria-label="PDF do termo assinado"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setErro(null);
              }}
              className="sm:max-w-sm"
            />
            <Button variant="secondary" carregando={enviando} rotuloCarregando="Enviando…" onClick={() => void enviar()}>
              <FileUp aria-hidden /> Registrar PDF
            </Button>
          </div>
        </section>
      ) : null}
      {!entregue ? <p className="text-[12.5px] text-muted-foreground">O TER assinado é registrado depois da entrega física.</p> : null}
    </>
  );
}

function DialogoConfirmarEntrega({ dados, aoFechar, aoConcluir }: { dados: DetalheAlocacaoReal; aoFechar: () => void; aoConcluir: () => void }) {
  const [quando, setQuando] = useState(() => agoraLocal());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar() {
    setEnviando(true);
    const r = await acaoConfirmarEntrega(dados.id, localParaIso(quando)).catch(() => ({ ok: false as const, erro: FALHA }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(r.mensagem);
    aoFechar();
    aoConcluir();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]")} data-testid="dialogo-confirmar-entrega">
        <DialogHeader>
          <DialogTitle>Confirmar entrega física</DialogTitle>
          <DialogDescription>
            {dados.itens.filter((i) => i.aberto).length} equipamento(s) passam a ficar com {dados.colaborador.nome}. O TER segue o próprio ciclo.
          </DialogDescription>
        </DialogHeader>
        {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
        <Campo rotulo="Data e hora da entrega" obrigatorio>
          {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
        </Campo>
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={aoFechar}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Confirmando…" onClick={() => void confirmar()}>
            Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelarReserva({ dados, aoFechar, aoConcluir }: { dados: DetalheAlocacaoReal; aoFechar: () => void; aoConcluir: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar() {
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    setEnviando(true);
    const r = await acaoCancelarReserva(dados.id, motivo).catch(() => ({ ok: false as const, erro: FALHA }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(r.mensagem);
    aoFechar();
    aoConcluir();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]")} data-testid="dialogo-cancelar-reserva">
        <DialogHeader>
          <DialogTitle>Cancelar reserva {dados.numero}</DialogTitle>
          <DialogDescription>Os equipamentos voltam a ficar disponíveis. O registro da reserva é mantido.</DialogDescription>
        </DialogHeader>
        <Campo rotulo="Motivo" obrigatorio erro={erro ?? undefined}>
          {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} />}
        </Campo>
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={aoFechar}>
            Voltar
          </Button>
          <Button variant="destructive" carregando={enviando} rotuloCarregando="Cancelando…" onClick={() => void confirmar()}>
            Cancelar reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

