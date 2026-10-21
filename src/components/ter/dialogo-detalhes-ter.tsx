"use client";

import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus2,
  FileSignature,
  FileUp,
  FlaskConical,
  History,
  ListChecks,
  RotateCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario } from "@/components/comum/campos";
import { formatarDataHora } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { ResultadoInspecaoBadge } from "@/components/inspecoes/checklist";
import { DialogoDetalhesInspecao, exibirInstantaneo, type InspecaoExibida } from "@/components/inspecoes/dialogos-inspecao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  acoesDoTer,
  ROTULO_ACAO_TER,
  ROTULO_CANAL,
  ROTULO_ESTADO_ASSINATURA,
  ROTULO_ESTADO_DOCUMENTO,
  ROTULO_RESULTADO_CONFERENCIA,
  type AcaoTer,
  type CanalEnvio,
  type ResultadoConferencia,
  type SituacaoTer,
} from "@/lib/ter";
import { cn } from "@/lib/utils";
import { acaoDetalheTer, acaoGerarNovamente } from "@/server/acoes/ter";
import { DialogoAnexarAssinado, DialogoCancelarTer, DialogoConferenciaTer, DialogoEnvioTer, DialogoSubstituirTer } from "./dialogos-acoes-ter";

type Resposta = Awaited<ReturnType<typeof acaoDetalheTer>>;
const FALHA = "Não foi possível carregar o TER. Tente novamente.";

/** O que a lista já sabe: o cabeçalho aparece antes da resposta do servidor. */
export type AbaTer = "dados" | "equipamentos" | "documento" | "historico";
export type TerCabecalho = { id: string; numero: string; colaborador: string; situacao: SituacaoTer; acao?: AcaoTer | null; aba?: AbaTer };

const ROTULO_ACAO: Record<AcaoTer, { rotulo: string; icone: typeof Send }> = {
  gerar: { rotulo: "Gerar novamente", icone: RotateCw },
  enviar: { rotulo: "Enviar para assinatura", icone: Send },
  reenviar: { rotulo: "Reenviar para assinatura", icone: Send },
  anexar: { rotulo: "Anexar PDF assinado", icone: FileUp },
  conferir: { rotulo: "Conferir assinatura", icone: ShieldCheck },
  substituir: { rotulo: "Nova versão (substituir)", icone: FilePlus2 },
  cancelar: { rotulo: "Cancelar TER", icone: Ban },
};

/** Próximo passo do fluxo: o botão principal do rodapé. */
const PROXIMO: AcaoTer[] = ["gerar", "enviar", "conferir", "anexar", "reenviar"];

function Dado({ rotulo, valor, className }: { rotulo: string; valor?: React.ReactNode; className?: string }) {
  const vazio = valor === null || valor === undefined || valor === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
      <dd className={cn("break-words", vazio ? "text-muted-foreground" : "font-semibold text-titulo")}>{vazio ? "Não informado" : valor}</dd>
    </div>
  );
}

export function DialogoDetalhesTer({ inicial, aoFechar }: { inicial: TerCabecalho | null; aoFechar: () => void }) {
  return (
    <Dialog open={Boolean(inicial)} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        className={cn(
          MODAL_CENTRALIZADO,
          "flex flex-col gap-0 overflow-hidden p-0",
          "h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none sm:max-w-none",
          "sm:h-[min(780px,92dvh)] sm:max-h-[92dvh]",
          LARGURA_MODAL[1000],
        )}
        data-testid="dialogo-ter"
      >
        {inicial ? <Conteudo key={inicial.id} inicial={inicial} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ inicial }: { inicial: TerCabecalho }) {
  const router = useRouter();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [acao, setAcao] = useState<AcaoTer | null>(null);
  const [inspecao, setInspecao] = useState<InspecaoExibida | null>(null);
  const [gerando, setGerando] = useState(false);
  // A ação pedida na lista abre depois que o detalhe chega (uma vez).
  const [pedida, setPedida] = useState<AcaoTer | null>(inicial.acao ?? null);
  const pedido = useRef<{ chave: string; promessa: Promise<Resposta> } | null>(null);

  useEffect(() => {
    let ativo = true;
    const chave = `${inicial.id}:${tentativa}`;
    if (pedido.current?.chave !== chave) pedido.current = { chave, promessa: acaoDetalheTer(inicial.id) };
    pedido.current.promessa.then((r) => ativo && setResposta(r)).catch(() => ativo && setResposta({ ok: false, erro: FALHA }));
    return () => {
      ativo = false;
    };
  }, [inicial.id, tentativa]);

  const d = resposta?.ok ? resposta.dados : null;
  const disponiveis = d ? acoesDoTer(d, d.acoes) : null;
  // Ajuste durante a renderização: abre a ação pedida na lista, se ainda couber.
  if (d && disponiveis && pedida) {
    setPedida(null);
    if (disponiveis[pedida]) setAcao(pedida);
  }

  const recarregar = () => {
    setTentativa((t) => t + 1);
    router.refresh();
  };

  async function gerar() {
    if (!d) return;
    setGerando(true);
    const r = await acaoGerarNovamente(d.id).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setGerando(false);
    if (r.ok) toast.success(r.mensagem);
    else toast.error(r.erro);
    recarregar();
  }

  const executar = (a: AcaoTer) => (a === "gerar" ? void gerar() : setAcao(a));
  const lista = disponiveis ? (Object.keys(ROTULO_ACAO) as AcaoTer[]).filter((a) => disponiveis[a]) : [];
  const principal = PROXIMO.find((a) => lista.includes(a)) ?? null;
  const secundarias = lista.filter((a) => a !== principal);
  const situacao = d?.situacao ?? inicial.situacao;
  const vigente = d?.versoes.find((v) => v.versao === d.versao) ?? null;

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b py-4 pr-14 pl-5 sm:gap-4 sm:pl-6">
        <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground sm:grid" aria-hidden>
          <FileSignature className="size-5" />
        </span>
        <DialogHeader className="min-w-0 flex-1 gap-1">
          <DialogTitle className="tabular leading-7">
            {d?.numero ?? inicial.numero}
            {d?.versao ? <span className="text-[14px] font-medium text-muted-foreground"> · versão {d.versao}</span> : null}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-semibold text-titulo">{d?.colaborador.nome ?? inicial.colaborador}</span>
              {d?.empresa ? <span>{d.empresa.nome}</span> : null}
              <Estado grupo="ter" valor={situacao} />
              {vigente?.documentoTeste ? (
                <StatusBadge tom="atencao" icone={FlaskConical}>
                  Documento de teste
                </StatusBadge>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="conteudo-ter">
        {resposta && !resposta.ok ? (
          <div className="flex flex-col items-start gap-3">
            <AlertaFormulario tom="erro">{resposta.erro}</AlertaFormulario>
            <Button type="button" variant="secondary" size="sm" onClick={() => (setResposta(null), setTentativa((t) => t + 1))}>
              <RotateCw aria-hidden /> Tentar novamente
            </Button>
          </div>
        ) : !d ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando o TER">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue={inicial.aba ?? "dados"} className="gap-4">
            <TabsList aria-label="Seções do TER" className="h-auto w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="dados" className="flex-none">
                Dados gerais
              </TabsTrigger>
              <TabsTrigger value="equipamentos" className="flex-none">
                Equipamentos e inspeções <span className="tabular rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">{d.equipamentos.length}</span>
              </TabsTrigger>
              <TabsTrigger value="documento" className="flex-none">
                Documento
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex-none">
                Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="flex flex-col gap-4">
              {d.erro ? (
                <div className="flex flex-col gap-2 rounded-xl border border-atencao/30 bg-atencao-fundo px-4 py-3 text-[13px] text-atencao" data-testid="pendencia-ter">
                  <p className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {d.pendencias.length ? "Pendência de cadastro" : "Erro na geração do PDF"}
                  </p>
                  <p>{d.erro}</p>
                  <div className="flex flex-wrap gap-2">
                    {d.pendencias.length ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/ti/cadastros/pessoas?editar=${d.colaborador.id}`}>Completar o cadastro de {d.colaborador.nome}</Link>
                      </Button>
                    ) : null}
                    {disponiveis?.gerar ? (
                      <Button variant="secondary" size="sm" carregando={gerando} rotuloCarregando="Gerando…" onClick={() => void gerar()}>
                        <RotateCw aria-hidden /> Gerar novamente
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {d.canceladoEm ? (
                <div className="rounded-xl border bg-muted px-4 py-3 text-[13px]" data-testid="cancelamento-ter">
                  <p className="font-semibold text-titulo">
                    Cancelado em {formatarDataHora(d.canceladoEm)} por {d.canceladoPorNome}
                  </p>
                  <p className="text-muted-foreground">Motivo: {d.motivoCancelamento}</p>
                  {d.procedimentoCancelamento ? <p className="text-muted-foreground">Procedimento administrativo: {d.procedimentoCancelamento}</p> : null}
                  <p className="text-muted-foreground">A alocação e a entrega física não foram alteradas.</p>
                </div>
              ) : null}
              <section aria-label="Dados gerais" className="rounded-xl border p-4">
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Dado rotulo="Número do TER" valor={<span className="tabular">{d.numero}</span>} />
                  <Dado rotulo="Versão vigente" valor={d.versao ? `Versão ${d.versao}` : "Ainda não emitida"} />
                  <Dado
                    rotulo="Alocação"
                    valor={
                      d.alocacao ? (
                        <Link href={`/ti/alocacoes?alocacao=${d.alocacao.id}`} className="tabular text-link underline-offset-4 hover:underline">
                          {d.alocacao.numero}
                        </Link>
                      ) : null
                    }
                  />
                  <Dado rotulo="Evento de entrega" valor={d.evento?.tipo} />
                  <Dado
                    rotulo="Colaborador"
                    valor={
                      <Link href={`/ti/cadastros/pessoas/${d.colaborador.id}`} className="text-link underline-offset-4 hover:underline">
                        {d.colaborador.nome}
                      </Link>
                    }
                  />
                  <Dado rotulo="CPF" valor={d.colaborador.cpf ? <span className="tabular">{d.colaborador.cpf}</span> : null} />
                  <Dado rotulo="Empresa responsável" valor={d.empresa?.nome} />
                  <Dado rotulo="Data da entrega" valor={d.evento ? formatarDataHora(d.evento.entregueEm) : null} />
                  <Dado rotulo="Data da emissão" valor={d.emitidoEm ? formatarDataHora(d.emitidoEm) : "Ainda não emitido"} />
                  <Dado rotulo="Responsável TI" valor={d.evento?.responsavelTi} />
                  <Dado rotulo="Situação documental" valor={d.estadoDocumento ? ROTULO_ESTADO_DOCUMENTO[d.estadoDocumento] : "Registro anterior"} />
                  <Dado rotulo="Situação da assinatura" valor={d.estadoAssinatura ? ROTULO_ESTADO_ASSINATURA[d.estadoAssinatura] : "—"} />
                </dl>
              </section>
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Assinatura externa (GOV.BR). O TER só fica assinado depois da conferência manual do PDF recebido; a entrega física não depende da assinatura.
              </p>
            </TabsContent>

            <TabsContent value="equipamentos">
              <ul className="flex flex-col gap-3" data-testid="equipamentos-ter">
                {d.equipamentos.map((e, n) => (
                  <li key={e.ativoId} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-muted-foreground">Anexo {n + 1}</p>
                        <Link href={`/ti/inventario/${e.ativoId}`} className="tabular font-semibold text-titulo underline-offset-4 hover:underline">
                          {e.identificador}
                        </Link>
                        <p className="text-[13px] text-muted-foreground">
                          {e.categoria} · {e.marca} {e.modelo}
                          {e.numeroSerie ? ` · série ${e.numeroSerie}` : ""}
                          {e.patrimonio && e.patrimonio !== e.identificador ? ` · patrimônio ${e.patrimonio}` : ""}
                        </p>
                      </div>
                      {e.verificacao ? <ResultadoInspecaoBadge resultado={e.verificacao.resultado} /> : <StatusBadge tom="neutro">Sem verificação</StatusBadge>}
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                      <Dado rotulo="Empresa proprietária" valor={e.proprietaria.nome} />
                      <Dado rotulo="Aluguel na entrega" valor={e.aluguel ? `${e.aluguel.locataria.nome}, desde ${e.aluguel.inicio.split("-").reverse().join("/")}` : "Sem aluguel"} />
                      {e.acompanha ? <Dado rotulo="Acompanha" valor={e.acompanha} /> : null}
                      <Dado rotulo="Acessórios entregues" valor={e.acessorios.length ? e.acessorios.join(", ") : "Nenhum"} />
                      {e.verificacao ? (
                        <>
                          <Dado
                            rotulo="Inspeção usada"
                            valor={`${e.verificacao.instantaneo.inspecao.numero ?? "—"}${e.verificacao.instantaneo.inspecao.concluidaEm ? ` · ${formatarDataHora(e.verificacao.instantaneo.inspecao.concluidaEm)}` : ""}`}
                          />
                          <Dado rotulo="Condição confirmada" valor={`${formatarDataHora(e.verificacao.verificadaEm)} · ${e.verificacao.responsavel}`} />
                        </>
                      ) : null}
                    </dl>
                    {e.verificacao ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInspecao(exibirInstantaneo({ modo: e.verificacao!.modo, verificadaEm: e.verificacao!.verificadaEm, responsavel: e.verificacao!.responsavel, instantaneo: e.verificacao!.instantaneo }))}
                        >
                          <ListChecks aria-hidden /> Ver checklist da entrega
                        </Button>
                        <span className="text-[12.5px] text-muted-foreground">
                          {e.verificacao.instantaneo.respostas.length} resposta(s)
                          {e.verificacao.semResposta.length ? ` · ${e.verificacao.semResposta.length} opcional(is) sem resposta` : ""}
                        </span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-muted-foreground">Respostas registradas na entrega física (somente leitura): inspeções posteriores e mudanças no checklist não alteram o TER.</p>
            </TabsContent>

            <TabsContent value="documento" className="flex flex-col gap-4">
              <section aria-label="Documento vigente" className="rounded-xl border p-4">
                <h3 className="text-[13px] font-bold text-titulo">PDF emitido</h3>
                {vigente?.temArquivo ? (
                  <>
                    <p className="mt-1 font-semibold break-words text-titulo">{vigente.nomeArquivo}</p>
                    <p className="tabular mt-0.5 text-[12.5px] break-all text-muted-foreground">
                      Versão {vigente.versao} · {vigente.paginas} página(s) · {Math.ceil((vigente.tamanho ?? 0) / 1024)} KB · emitido em {vigente.emitidaEm ? formatarDataHora(vigente.emitidaEm) : "—"}
                      {vigente.modelo ? ` · ${vigente.modelo}` : ""}
                    </p>
                    <p className="tabular mt-0.5 text-[12px] break-all text-muted-foreground">SHA-256 {vigente.sha256}</p>
                    {disponiveis?.pdf ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <a href={`/api/termos/${d.id}/pdf?arquivo=emitido&versao=${vigente.versao}`} target="_blank" rel="noopener" data-testid="visualizar-pdf-ter">
                            <ExternalLink aria-hidden /> Visualizar PDF
                          </a>
                        </Button>
                        <Button asChild variant="secondary" size="sm">
                          <a href={`/api/termos/${d.id}/pdf?arquivo=emitido&versao=${vigente.versao}&baixar=1`}>
                            <Download aria-hidden /> Baixar PDF
                          </a>
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-[13px] text-muted-foreground">{d.estadoDocumento ? "O PDF ainda não foi emitido." : "Registro anterior à emissão pelo portal: não há PDF emitido pelo portal."}</p>
                    {!d.estadoDocumento && d.hrefPdf && disponiveis?.pdf ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <a href={d.hrefPdf} target="_blank" rel="noopener">
                            <ExternalLink aria-hidden /> Visualizar PDF assinado (registro anterior)
                          </a>
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>

              {d.versoes.length > 1 ? (
                <section aria-label="Versões" className="rounded-xl border">
                  <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">Versões</h3>
                  <ul className="divide-y">
                    {d.versoes.map((v) => (
                      <li key={v.versao} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                        <span className="tabular font-semibold text-titulo">Versão {v.versao}</span>
                        <StatusBadge tom={v.estado === "EMITIDO" ? "sucesso" : v.estado === "ERRO_GERACAO" ? "erro" : "neutro"} className="text-[11px]">
                          {ROTULO_ESTADO_DOCUMENTO[v.estado]}
                        </StatusBadge>
                        <span className="min-w-0 flex-1 text-muted-foreground">{v.motivo}</span>
                        {v.temArquivo && disponiveis?.pdf ? (
                          <a href={`/api/termos/${d.id}/pdf?arquivo=emitido&versao=${v.versao}`} target="_blank" rel="noopener" className="font-semibold text-link underline-offset-4 hover:underline">
                            Abrir PDF
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-label="Encaminhamentos" className="rounded-xl border">
                <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">Encaminhamentos para assinatura</h3>
                {d.envios.length ? (
                  <ul className="divide-y">
                    {d.envios.map((e) => (
                      <li key={e.id} className="px-4 py-2.5 text-[13px]">
                        <p className="font-semibold text-titulo">
                          {e.reenvio ? "Reenvio" : "Envio"} · {ROTULO_CANAL[e.canal as CanalEnvio] ?? e.canal}
                        </p>
                        <p className="break-words text-muted-foreground">
                          Para {e.destinatario} · {formatarDataHora(e.enviadoEm)} · versão {e.versao} · registrado por {e.registradoPorNome}
                        </p>
                        {e.observacao ? <p className="text-muted-foreground">{e.observacao}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhum encaminhamento registrado.</p>
                )}
              </section>

              <section aria-label="PDFs assinados" className="rounded-xl border">
                <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">PDFs assinados recebidos</h3>
                {d.arquivosAssinados.length ? (
                  <ul className="divide-y">
                    {d.arquivosAssinados.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold break-words text-titulo">{a.nomeOriginal}</span>
                          <span className="block text-muted-foreground">
                            Versão {a.versao} · {a.origem === "PORTAL_COLABORADOR" ? "enviado pelo colaborador no portal" : `recebido pela TI (${a.enviadoPorNome})`} em {formatarDataHora(a.recebidoEm)} ·{" "}
                            {a.conferido ? "conferido" : "aguardando conferência"}
                          </span>
                          <span className="tabular block text-[12px] break-all text-muted-foreground">SHA-256 {a.sha256}</span>
                        </span>
                        {d.acoes.baixar ? (
                          <a href={`/api/termos/${d.id}/pdf?arquivo=assinado&id=${a.id}`} target="_blank" rel="noopener" className="font-semibold text-link underline-offset-4 hover:underline">
                            Abrir
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhum PDF assinado recebido.</p>
                )}
              </section>

              {d.conferencias.length ? (
                <section aria-label="Conferências" className="rounded-xl border">
                  <h3 className="border-b px-4 py-2.5 text-[13px] font-bold text-titulo">Conferências da assinatura</h3>
                  <ul className="divide-y">
                    {d.conferencias.map((c) => (
                      <li key={c.id} className="px-4 py-2.5 text-[13px]">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-titulo">
                          <StatusBadge tom={c.resultado === "CONFORME" ? "sucesso" : c.resultado === "NAO_CONFORME" ? "erro" : "atencao"} className="text-[11px]">
                            {ROTULO_RESULTADO_CONFERENCIA[c.resultado as ResultadoConferencia]}
                          </StatusBadge>
                          {formatarDataHora(c.conferidaEm)} · {c.conferidaPorNome}
                        </p>
                        <p className="break-words text-muted-foreground">
                          {c.ferramenta}
                          {c.signatario ? ` · signatário: ${c.signatario}` : ""}
                          {c.confereColaborador ? " · confere com o colaborador" : ""}
                          {c.confereDocumento ? " · confere com o documento emitido" : ""}
                          {c.assinaturaTiVerificada ? " · assinatura da TI verificada" : ""}
                        </p>
                        {c.motivo ? <p className="text-muted-foreground">Motivo: {c.motivo}</p> : null}
                        {c.observacoes ? <p className="text-muted-foreground">{c.observacoes}</p> : null}
                        {c.temRelatorio && d.acoes.baixar ? (
                          <a href={`/api/termos/${d.id}/pdf?arquivo=relatorio&id=${c.id}`} target="_blank" rel="noopener" className="font-semibold text-link underline-offset-4 hover:underline">
                            Relatório de validação
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="historico">
              {d.historico.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <History className="size-4" aria-hidden /> Sem histórico registrado.
                </p>
              ) : (
                <ol className="relative flex flex-col gap-3.5 border-l pl-5" data-testid="historico-ter">
                  {d.historico.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary dark:bg-link" aria-hidden />
                      <p className="text-[13.5px]">
                        <span className="font-semibold text-titulo">{ROTULO_ACAO_TER[h.acao] ?? h.acao}</span>
                        {h.versao ? <span className="text-muted-foreground"> · versão {h.versao}</span> : null}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {formatarDataHora(h.em)} · {h.responsavel}
                      </p>
                      {h.detalhe ? <p className="text-[13px] break-words">{h.detalhe}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 px-5 py-3 sm:px-6">
        {d && disponiveis?.pdf && vigente?.temArquivo ? (
          <Button asChild variant="secondary">
            <a href={`/api/termos/${d.id}/pdf?arquivo=emitido&versao=${vigente.versao}&baixar=1`}>
              <Download aria-hidden /> Baixar PDF
            </a>
          </Button>
        ) : null}
        {secundarias.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" data-testid="mais-acoes-ter">
                Mais ações <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {secundarias.map((a, i) => {
                const { rotulo, icone: Icone } = ROTULO_ACAO[a];
                return (
                  <span key={a}>
                    {a === "cancelar" && i > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem onSelect={() => executar(a)} className={a === "cancelar" ? "text-destructive focus:text-destructive" : undefined}>
                      <Icone className="size-4" aria-hidden /> {rotulo}
                    </DropdownMenuItem>
                  </span>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {principal ? (
          <Button onClick={() => executar(principal)} carregando={principal === "gerar" && gerando} rotuloCarregando="Gerando…" data-testid={`acao-ter-${principal}`}>
            {(() => {
              const Icone = ROTULO_ACAO[principal].icone;
              return <Icone aria-hidden />;
            })()}
            {ROTULO_ACAO[principal].rotulo}
          </Button>
        ) : null}
      </DialogFooter>

      {d && acao === "enviar" ? <DialogoEnvioTer ter={d} reenvio={false} aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "reenviar" ? <DialogoEnvioTer ter={d} reenvio aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "anexar" ? <DialogoAnexarAssinado ter={d} aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "conferir" ? <DialogoConferenciaTer ter={d} aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "cancelar" ? <DialogoCancelarTer ter={d} aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      {d && acao === "substituir" ? <DialogoSubstituirTer ter={d} aberto aoMudar={(v) => !v && setAcao(null)} aoConcluir={recarregar} /> : null}
      <DialogoDetalhesInspecao dados={inspecao} aberto={Boolean(inspecao)} aoMudar={(v) => !v && setInspecao(null)} />
    </>
  );
}
