"use client";

import { Command } from "cmdk";
import { AlertTriangle, CalendarClock, Check, PackageCheck, PlugZap, RotateCw, Search, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { StatusBadge } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { errosVerificacao, montarVerificacoes, useCondicoesEntrega, VerificacaoCondicoes, type Decisoes } from "@/components/inspecoes/verificacao-entrega";
import { agoraLocal, ICONE_CATEGORIA, localParaIso } from "@/components/inventario/visual";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { acaoCriarAlocacao, acaoOpcoesNovaAlocacao } from "@/server/acoes/alocacoes";
import type { OpcoesNovaAlocacao } from "@/server/modulos/alocacoes";

type Equipamento = OpcoesNovaAlocacao["equipamentos"][number];
const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const hoje = () => agoraLocal().slice(0, 10);

/** Carregador principal disponível do notebook: o vinculado de menor sequência (C1, depois C2...). */
const carregadorPrincipal = (lista: Equipamento[], notebookId: string) =>
  lista.filter((c) => c.notebookId === notebookId).sort((a, b) => (a.sequenciaCarregador ?? 99) - (b.sequenciaCarregador ?? 99))[0] ?? null;

/**
 * Nova alocação: colaborador, Responsável TI, um ou vários equipamentos disponíveis e o modo —
 * entrega física agora (a custódia muda já) ou reserva de entrega futura (ninguém fica
 * responsável). O notebook leva o carregador principal. A empresa proprietária de cada
 * equipamento é mantida; a do colaborador vem do cadastro dele. O número (AL0001...) é gerado
 * só ao confirmar, sem consumir a sequência na revisão. Na entrega física, a revisão pede a
 * verificação técnica de cada equipamento (última inspeção confirmada ou inspeção nova); a
 * reserva deixa essa verificação para a confirmação da entrega.
 */
export function DialogoNovaAlocacao({
  aberto,
  aoMudar,
  podeEntregar,
  aoCriar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  podeEntregar: boolean;
  aoCriar?: (id: string) => void;
}) {
  const router = useRouter();
  const [opcoes, setOpcoes] = useState<{ ok: true; dados: OpcoesNovaAlocacao } | { ok: false; erro: string } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [empresaFiltro, setEmpresaFiltro] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  // Nulo = o padrão do servidor (quem está registrando, se elegível).
  const [responsavelEscolhido, setResponsavelEscolhido] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [modo, setModo] = useState<"ENTREGAR" | "RESERVAR">(podeEntregar ? "ENTREGAR" : "RESERVAR");
  const [entrega, setEntrega] = useState(() => agoraLocal());
  const [prevista, setPrevista] = useState(() => hoje());
  const [observacoes, setObservacoes] = useState("");
  const [etapa, setEtapa] = useState<"preencher" | "revisar">("preencher");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [decisoes, setDecisoes] = useState<Decisoes>({});
  const [errosCondicao, setErrosCondicao] = useState<Record<string, string>>({});
  const verificar = etapa === "revisar" && modo === "ENTREGAR";
  const { condicoes, erro: erroCondicoes, recarregar: recarregarCondicoes } = useCondicoesEntrega(selecionados, verificar);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    acaoOpcoesNovaAlocacao()
      .then((r) => ativo && setOpcoes(r))
      .catch(() => ativo && setOpcoes({ ok: false, erro: "Não foi possível carregar as opções. Tente novamente." }));
    return () => {
      ativo = false;
    };
  }, [aberto, tentativa]);

  const dados = opcoes?.ok ? opcoes.dados : null;
  const empresas = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; sigla: string }>();
    for (const c of dados?.colaboradores ?? []) mapa.set(c.empresa.id, c.empresa);
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados]);
  const colaborador = dados?.colaboradores.find((c) => c.id === colaboradorId) ?? null;
  const responsavelId = responsavelEscolhido ?? dados?.responsavelPadrao ?? "";
  const responsavel = dados?.responsaveis.find((r) => r.contaId === responsavelId) ?? null;
  const porId = useMemo(() => new Map((dados?.equipamentos ?? []).map((e) => [e.id, e])), [dados]);
  const escolhidos = selecionados.map((id) => porId.get(id)).filter((e): e is Equipamento => Boolean(e));
  // Só equipamentos da empresa do colaborador ou alugados a ela (no dia do uso); o servidor confere de novo.
  const diaUso = modo === "ENTREGAR" ? entrega.slice(0, 10) : prevista || hoje();
  const elegivel = (e: Equipamento, empresaId: string) => (e.aluguel ? e.aluguel.empresa.id === empresaId && e.aluguel.inicio <= diaUso : e.empresa.id === empresaId);
  // A empresa escolhida (ou a do colaborador) já mostra o que ela pode receber.
  const empresaAlvo = colaborador?.empresa.id ?? (empresaFiltro || null);
  const disponiveisParaEmpresa = empresaAlvo ? (dados?.equipamentos ?? []).filter((e) => elegivel(e, empresaAlvo)) : [];
  /** Tira da seleção o que a empresa não pode receber (sem empresa, nada fica selecionado). */
  const manterElegiveis = (empresaId: string) =>
    setSelecionados((atual) => (empresaId ? atual.filter((id) => { const e = porId.get(id); return e ? elegivel(e, empresaId) : false; }) : []));
  const alugados = escolhidos.filter((e) => e.aluguel);
  const alterado = Boolean(colaboradorId || selecionados.length || observacoes || responsavelEscolhido);

  /** Notebook leva junto o carregador principal (pode ser retirado da seleção); retirar o notebook retira os carregadores dele. */
  function alternar(e: Equipamento) {
    setErros((x) => ({ ...x, equipamentos: "" }));
    setSelecionados((atual) => {
      if (atual.includes(e.id)) return atual.filter((id) => id !== e.id && porId.get(id)?.notebookId !== e.id);
      const principal = e.categoria === "NOTEBOOK" ? carregadorPrincipal(dados?.equipamentos ?? [], e.id) : null;
      // O mesmo carregador nunca entra duas vezes.
      return [...new Set([...atual, e.id, ...(principal ? [principal.id] : [])])];
    });
  }

  function revisar() {
    const e: Record<string, string> = {};
    if (!colaboradorId) e.colaborador = "Selecione o colaborador.";
    if (!responsavelId) e.responsavel = "Selecione o responsável TI.";
    if (!selecionados.length) e.equipamentos = "Selecione ao menos um equipamento disponível.";
    if (modo === "ENTREGAR" && !entrega) e.data = "Informe a data da entrega.";
    if (modo === "RESERVAR" && prevista && prevista < hoje()) e.data = "A data prevista não pode estar no passado.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEtapa("revisar");
  }

  async function confirmar() {
    // Entrega física: cada equipamento com a própria verificação técnica.
    let envio: ReturnType<typeof montarVerificacoes> | null = null;
    if (modo === "ENTREGAR") {
      if (!condicoes) return;
      const e = errosVerificacao(condicoes, decisoes);
      setErrosCondicao(e);
      if (Object.keys(e).length) {
        setErroGeral("Confirme a condição de cada equipamento antes da entrega.");
        document.querySelector('[data-testid="verificacao-condicoes"]')?.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      envio = montarVerificacoes(condicoes, decisoes);
    }
    setEnviando(true);
    setErroGeral(null);
    const r = await acaoCriarAlocacao(
      {
        colaboradorId,
        ativoIds: selecionados,
        modo,
        responsavelTiContaId: responsavelId,
        data: modo === "ENTREGAR" ? localParaIso(entrega) : prevista || undefined,
        observacoes: observacoes || undefined,
        chaveRequisicao: chave,
        verificacoes: envio?.verificacoes,
      },
      envio?.anexos,
    ).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) {
      setErroGeral(r.erro);
      // Problema na verificação técnica: continua na revisão (com a condição recarregada).
      if (/inspeç|condição/i.test(r.erro)) {
        recarregarCondicoes();
        return;
      }
      setEtapa("preencher");
      setTentativa((t) => t + 1); // a disponibilidade pode ter mudado
      return;
    }
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
    if (r.id) aoCriar?.(r.id);
  }

  const solicitarFechar = () => {
    if (enviando) return;
    if (alterado) setConfirmarDescarte(true);
    else aoMudar(false);
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : solicitarFechar())}>
        <DialogContent
          className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", LARGURA_MODAL[1050])}
          data-testid="dialogo-nova-alocacao"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>{etapa === "revisar" ? "Revisar alocação" : "Nova alocação"}</DialogTitle>
            <DialogDescription className="sr-only">
              {modo === "ENTREGAR" ? "Os equipamentos passam a ficar com o colaborador ao confirmar." : "Reserva: ninguém fica responsável até a confirmação da entrega."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {erroGeral ? (
              <div className="mb-4">
                <AlertaFormulario tom="erro">{erroGeral}</AlertaFormulario>
              </div>
            ) : null}
            {opcoes && !opcoes.ok ? (
              <div className="flex flex-col items-start gap-3">
                <AlertaFormulario tom="erro">{opcoes.erro}</AlertaFormulario>
                <Button variant="secondary" size="sm" onClick={() => (setOpcoes(null), setTentativa((t) => t + 1))}>
                  <RotateCw aria-hidden /> Tentar novamente
                </Button>
              </div>
            ) : !dados ? (
              <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando colaboradores e equipamentos">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-64 rounded-xl lg:col-span-2" />
              </div>
            ) : etapa === "revisar" ? (
              <Revisao
                colaborador={colaborador!}
                responsavel={responsavel?.nome ?? ""}
                escolhidos={escolhidos}
                modo={modo}
                quando={modo === "ENTREGAR" ? entrega.replace("T", " ") : prevista}
                observacoes={observacoes}
                alugados={alugados.length}
                verificacao={
                  modo === "ENTREGAR" ? (
                    <VerificacaoCondicoes
                      condicoes={condicoes}
                      erro={erroCondicoes}
                      aoTentarDeNovo={recarregarCondicoes}
                      decisoes={decisoes}
                      aoMudar={(id, d) => {
                        setDecisoes((x) => ({ ...x, [id]: d }));
                        setErrosCondicao((x) => ({ ...x, [id]: "" }));
                      }}
                      erros={errosCondicao}
                    />
                  ) : null
                }
              />
            ) : (
              <div className="flex flex-col gap-5">
                <fieldset className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">
                  <legend className="mb-3 text-sm font-bold text-titulo">Colaborador</legend>
                  <Campo rotulo="Empresa do colaborador" className="lg:col-span-4">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        valor={empresaFiltro}
                        aoMudar={(v) => {
                          setEmpresaFiltro(v);
                          const mantem = colaborador && (!v || colaborador.empresa.id === v);
                          if (v && colaborador && colaborador.empresa.id !== v) setColaboradorId("");
                          manterElegiveis(v || (mantem ? colaborador.empresa.id : ""));
                        }}
                        vazio="Todas as empresas"
                        opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                        pesquisavel
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Colaborador" obrigatorio erro={erros.colaborador || undefined} className="lg:col-span-4">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        invalido={p["aria-invalid"]}
                        valor={colaboradorId}
                        aoMudar={(v) => {
                          setColaboradorId(v);
                          // Outra empresa: sai da seleção o que ela não pode receber.
                          manterElegiveis(dados.colaboradores.find((x) => x.id === v)?.empresa.id ?? "");
                          setErros((x) => ({ ...x, colaborador: "" }));
                          const c = dados.colaboradores.find((x) => x.id === v);
                          if (c) setEmpresaFiltro(c.empresa.id);
                        }}
                        opcoes={dados.colaboradores
                          .filter((c) => !empresaFiltro || c.empresa.id === empresaFiltro)
                          .map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: c.empresa.sigla }))}
                        placeholder="Selecione o colaborador"
                        pesquisavel
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Responsável TI" obrigatorio erro={erros.responsavel || undefined} className="sm:col-span-2 lg:col-span-4">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        invalido={p["aria-invalid"]}
                        valor={responsavelId}
                        aoMudar={(v) => {
                          setResponsavelEscolhido(v);
                          setErros((x) => ({ ...x, responsavel: "" }));
                        }}
                        opcoes={dados.responsaveis.map((r) => ({ valor: r.contaId, rotulo: r.nome, detalhe: r.contaId === dados.responsavelPadrao ? "Você" : undefined }))}
                        placeholder={dados.responsaveis.length ? "Selecione" : "Nenhum membro da TI elegível"}
                        pesquisavel
                      />
                    )}
                  </Campo>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="mb-3 flex w-full items-center justify-between gap-2 text-sm font-bold text-titulo">
                    Equipamentos
                    <span className="text-[12.5px] font-medium text-muted-foreground">
                      {selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"}
                    </span>
                  </legend>
                  <SeletorEquipamentos
                    equipamentos={disponiveisParaEmpresa}
                    semEmpresa={!empresaAlvo}
                    selecionados={selecionados}
                    aoAlternar={alternar}
                    erro={erros.equipamentos || undefined}
                  />
                </fieldset>

                <fieldset className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">
                  <legend className="mb-3 text-sm font-bold text-titulo">Entrega</legend>
                  <div className="flex flex-col gap-2 lg:col-span-5" role="radiogroup" aria-label="Operação">
                    <span className="text-[13px] leading-5 font-semibold text-titulo">Operação</span>
                    <div className="grid h-11 grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:h-10">
                      {(
                        [
                          ["ENTREGAR", "Entregar agora", Truck, !podeEntregar],
                          ["RESERVAR", "Reservar", CalendarClock, false],
                        ] as const
                      ).map(([valor, titulo, Icone, bloqueado]) => (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={modo === valor}
                          disabled={bloqueado}
                          onClick={() => setModo(valor)}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md px-2 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                            modo === valor ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
                          )}
                        >
                          <Icone className="size-4 shrink-0" aria-hidden />
                          {titulo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Campo rotulo={modo === "ENTREGAR" ? "Data e hora da entrega" : "Data prevista"} obrigatorio={modo === "ENTREGAR"} erro={erros.data || undefined} className="lg:col-span-4">
                    {(p) =>
                      modo === "ENTREGAR" ? (
                        <Input {...p} type="datetime-local" value={entrega} max={agoraLocal()} onChange={(e) => setEntrega(e.target.value)} />
                      ) : (
                        <Input {...p} type="date" value={prevista} min={hoje()} onChange={(e) => setPrevista(e.target.value)} />
                      )
                    }
                  </Campo>
                  <Campo rotulo="Observações" className="sm:col-span-2 lg:col-span-12">
                    {(p) => <Textarea {...p} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} rows={2} className="min-h-10" />}
                  </Campo>
                </fieldset>
              </div>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0">
            {etapa === "revisar" ? (
              <>
                <Button variant="secondary" disabled={enviando} onClick={() => setEtapa("preencher")}>
                  Voltar e editar
                </Button>
                <Button carregando={enviando} rotuloCarregando="Registrando…" disabled={modo === "ENTREGAR" && !condicoes} onClick={() => void confirmar()} data-testid="confirmar-alocacao">
                  <PackageCheck aria-hidden /> {modo === "ENTREGAR" ? "Confirmar entrega" : "Registrar reserva"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={solicitarFechar}>
                  Cancelar
                </Button>
                <Button disabled={!dados} onClick={revisar}>
                  Revisar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a alocação?</AlertDialogTitle>
            <AlertDialogDescription>Nada foi registrado ainda; as escolhas serão perdidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmarDescarte(false);
                aoMudar(false);
              }}
            >
              Descartar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SeletorEquipamentos({
  equipamentos,
  semEmpresa,
  selecionados,
  aoAlternar,
  erro,
}: {
  equipamentos: Equipamento[];
  selecionados: string[];
  aoAlternar: (e: Equipamento) => void;
  /** Sem empresa escolhida (nem colaborador), a lista espera: a empresa define o que pode ser entregue. */
  semEmpresa?: boolean;
  erro?: string;
}) {
  const [busca, setBusca] = useState("");
  const escolhidos = equipamentos.filter((e) => selecionados.includes(e.id));
  const texto = (e: Equipamento) => `${e.rotulo} ${e.patrimonio ?? ""} ${e.marca} ${e.modelo} ${e.rotuloCategoria} ${e.empresa.sigla} ${e.empresa.nome}`;
  return (
    <div className="flex flex-col gap-2.5">
      {escolhidos.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Equipamentos selecionados">
          {escolhidos.map((e) => (
            <li key={e.id}>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-accent/60 pr-1 pl-2 text-[12.5px] font-medium text-titulo">
                {e.notebookId ? <PlugZap className="size-3.5 text-muted-foreground" aria-hidden /> : null}
                <span className="tabular">{e.rotulo}</span>
                {e.aluguel ? <span className="text-[11px] text-info">· alugado de {e.empresa.sigla}</span> : null}
                <button
                  type="button"
                  onClick={() => aoAlternar(e)}
                  aria-label={`Retirar ${e.rotulo}`}
                  className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-erro focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {semEmpresa ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground" data-testid="selecione-empresa">
          Selecione a empresa para ver os equipamentos que ela pode receber.
        </p>
      ) : (
        <Command
          label="Equipamentos disponíveis"
          className={cn("overflow-hidden rounded-xl border", erro && "border-erro")}
          filter={(valor, termo) => (normalizar(valor).includes(normalizar(termo)) ? 1 : 0)}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={busca}
              onValueChange={setBusca}
              placeholder="Pesquisar por nome, patrimônio, modelo, marca ou empresa"
              className="h-11 w-full min-w-0 bg-transparent text-base text-titulo outline-none placeholder:text-muted-foreground/80 md:text-sm lg:h-10"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nenhum equipamento disponível para a empresa do colaborador.</Command.Empty>
            {equipamentos.map((e) => {
              const Icone = ICONE_CATEGORIA[e.categoria];
              const marcado = selecionados.includes(e.id);
              const principal = e.categoria === "NOTEBOOK" ? carregadorPrincipal(equipamentos, e.id) : null;
              return (
                <Command.Item
                  key={e.id}
                  value={`${texto(e)} ${e.id}`}
                  onSelect={() => aoAlternar(e)}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded border", marcado ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")} aria-hidden>
                    {marcado ? <Check className="size-3.5" /> : null}
                  </span>
                  {e.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão
                    <img src={e.miniatura} alt="" className="size-8 shrink-0 rounded-md border object-cover" loading="lazy" />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground" aria-hidden>
                      <Icone className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="tabular block truncate font-semibold text-titulo">
                      {e.rotulo}
                      {e.nomeDispositivo && e.patrimonio ? <span className="font-normal text-muted-foreground"> · {e.patrimonio}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {e.rotuloCategoria} · {e.marca} {e.modelo}
                      {principal ? (
                        <span className="text-foreground/80">
                          {" "}
                          · <PlugZap className="inline size-3 align-[-1px]" aria-hidden /> leva {principal.rotulo}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {e.aluguel ? (
                    <span className="shrink-0 rounded-sm border border-info/25 bg-info-fundo px-1.5 text-[11px] leading-5 font-medium text-info" title={`Propriedade de ${e.empresa.nome}; alugado à empresa do colaborador`}>
                      Alugado · {e.empresa.sigla}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12px] font-medium text-muted-foreground" title={e.empresa.nome}>
                      {e.empresa.sigla}
                    </span>
                  )}
                  <span className="sr-only">{marcado ? "(selecionado)" : ""}</span>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      )}
      {erro ? <p className="text-[13px] font-medium text-erro">{erro}</p> : null}
    </div>
  );
}

function Revisao({
  colaborador,
  responsavel,
  escolhidos,
  modo,
  quando,
  observacoes,
  alugados,
  verificacao,
}: {
  colaborador: OpcoesNovaAlocacao["colaboradores"][number];
  responsavel: string;
  escolhidos: Equipamento[];
  modo: "ENTREGAR" | "RESERVAR";
  quando: string;
  observacoes: string;
  alugados: number;
  /** Entrega física: verificação técnica de cada equipamento. */
  verificacao?: React.ReactNode;
}) {
  return (
    <section aria-label="Revisão da alocação" className="flex flex-col gap-4">
      {alugados ? (
        <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info-fundo p-3 text-[13px]" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <span>
            {alugados === 1 ? "1 equipamento alugado" : `${alugados} equipamentos alugados`} de outra empresa para a {colaborador.empresa.nome}. A propriedade não muda.
          </span>
        </div>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="revisao-alocacao">
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Número</dt>
          <dd className="font-semibold text-muted-foreground">Gerado ao confirmar</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Colaborador</dt>
          <dd className="font-semibold text-titulo">{colaborador.nome}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Empresa do colaborador</dt>
          <dd className="font-semibold text-titulo">{colaborador.empresa.nome}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Responsável TI</dt>
          <dd className="font-semibold text-titulo">{responsavel}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Operação</dt>
          <dd className="font-semibold text-titulo">{modo === "ENTREGAR" ? "Entregar agora" : "Reservar"}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">{modo === "ENTREGAR" ? "Entrega" : "Prevista para"}</dt>
          <dd className="tabular font-semibold text-titulo">{quando ? quando.split(" ")[0].split("-").reverse().join("/") + (quando.includes(" ") ? ` ${quando.split(" ")[1]}` : "") : "Sem data"}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Equipamentos</dt>
          <dd className="tabular font-semibold text-titulo">
            {escolhidos.filter((e) => !e.notebookId).length}
            {escolhidos.some((e) => e.notebookId) ? ` + ${escolhidos.filter((e) => e.notebookId).length} carregador(es)` : ""}
          </dd>
        </div>
        {observacoes ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-[12.5px] text-muted-foreground">Observações</dt>
            <dd className="whitespace-pre-line">{observacoes}</dd>
          </div>
        ) : null}
      </dl>
      <ul className="divide-y rounded-xl border">
        {escolhidos.map((e) => {
          const Icone = ICONE_CATEGORIA[e.categoria];
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="tabular block truncate font-semibold text-titulo">{e.rotulo}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {e.notebookId ? `Carregador · acompanha ${escolhidos.find((n) => n.id === e.notebookId)?.rotulo ?? "o notebook"}` : `${e.rotuloCategoria} · ${e.marca} ${e.modelo}`}
                </span>
              </span>
              <StatusBadge tom={e.empresa.id === colaborador.empresa.id ? "neutro" : "info"} className="text-[11px]">
                {e.empresa.sigla}
              </StatusBadge>
            </li>
          );
        })}
      </ul>
      {verificacao ?? (
        <p className="text-[12.5px] text-muted-foreground">A verificação técnica de cada equipamento é feita na confirmação da entrega.</p>
      )}
    </section>
  );
}
