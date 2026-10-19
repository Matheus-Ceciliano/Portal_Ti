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

/**
 * Nova alocação: colaborador, um ou vários equipamentos disponíveis e o modo — entrega física
 * agora (a custódia muda já) ou reserva de entrega futura (ninguém fica responsável). A empresa
 * proprietária de cada equipamento é mantida; a do colaborador vem do cadastro dele.
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
  const porId = useMemo(() => new Map((dados?.equipamentos ?? []).map((e) => [e.id, e])), [dados]);
  const escolhidos = selecionados.map((id) => porId.get(id)).filter((e): e is Equipamento => Boolean(e));
  const deOutraEmpresa = colaborador ? escolhidos.filter((e) => e.empresa.id !== colaborador.empresa.id) : [];
  const alterado = Boolean(colaboradorId || selecionados.length || observacoes);

  /** Notebook leva junto os carregadores disponíveis (podem ser retirados da seleção). */
  function alternar(e: Equipamento) {
    setErros((x) => ({ ...x, equipamentos: "" }));
    setSelecionados((atual) => {
      if (atual.includes(e.id)) return atual.filter((id) => id !== e.id);
      const carregadores = e.categoria === "NOTEBOOK" ? (dados?.equipamentos ?? []).filter((c) => c.notebookId === e.id && !atual.includes(c.id)).map((c) => c.id) : [];
      return [...atual, e.id, ...carregadores];
    });
  }

  function revisar() {
    const e: Record<string, string> = {};
    if (!colaboradorId) e.colaborador = "Selecione o colaborador.";
    if (!selecionados.length) e.equipamentos = "Selecione ao menos um equipamento disponível.";
    if (modo === "ENTREGAR" && !entrega) e.data = "Informe a data da entrega.";
    if (modo === "RESERVAR" && prevista && prevista < hoje()) e.data = "A data prevista não pode estar no passado.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEtapa("revisar");
  }

  async function confirmar() {
    setEnviando(true);
    setErroGeral(null);
    const r = await acaoCriarAlocacao({
      colaboradorId,
      ativoIds: selecionados,
      modo,
      data: modo === "ENTREGAR" ? localParaIso(entrega) : prevista || undefined,
      observacoes: observacoes || undefined,
      chaveRequisicao: chave,
    }).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) {
      setErroGeral(r.erro);
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
            <DialogDescription className={etapa === "revisar" ? undefined : "sr-only"}>
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
                escolhidos={escolhidos}
                modo={modo}
                quando={modo === "ENTREGAR" ? entrega.replace("T", " ") : prevista}
                observacoes={observacoes}
                outraEmpresa={deOutraEmpresa.length}
              />
            ) : (
              <div className="flex flex-col gap-5">
                <fieldset className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">
                  <legend className="mb-3 text-sm font-bold text-titulo">Colaborador</legend>
                  <Campo rotulo="Empresa do colaborador" className="lg:col-span-5">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        valor={empresaFiltro}
                        aoMudar={(v) => {
                          setEmpresaFiltro(v);
                          if (v && colaborador && colaborador.empresa.id !== v) setColaboradorId("");
                        }}
                        vazio="Todas as empresas"
                        opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                        pesquisavel
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Colaborador" obrigatorio erro={erros.colaborador || undefined} className="lg:col-span-7">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        invalido={p["aria-invalid"]}
                        valor={colaboradorId}
                        aoMudar={(v) => {
                          setColaboradorId(v);
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
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="mb-3 flex w-full items-center justify-between gap-2 text-sm font-bold text-titulo">
                    Equipamentos
                    <span className="text-[12.5px] font-medium text-muted-foreground">
                      {selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"}
                    </span>
                  </legend>
                  <SeletorEquipamentos
                    equipamentos={dados.equipamentos}
                    selecionados={selecionados}
                    aoAlternar={alternar}
                    empresaColaborador={colaborador?.empresa.id ?? null}
                    erro={erros.equipamentos || undefined}
                  />
                </fieldset>

                <fieldset className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">
                  <legend className="mb-3 text-sm font-bold text-titulo">Entrega</legend>
                  <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-6" role="radiogroup" aria-label="Tipo de operação">
                    <span className="text-[13px] font-semibold text-titulo">Operação</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          ["ENTREGAR", "Entregar agora", "Entrega física: a custódia muda já.", Truck, !podeEntregar],
                          ["RESERVAR", "Reservar", "Entrega futura; ninguém fica responsável.", CalendarClock, false],
                        ] as const
                      ).map(([valor, titulo, texto, Icone, bloqueado]) => (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={modo === valor}
                          disabled={bloqueado}
                          onClick={() => setModo(valor)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                            modo === valor && "border-primary bg-accent/70 dark:border-link",
                          )}
                        >
                          <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span>
                            <span className="block font-semibold text-titulo">{titulo}</span>
                            <span className="block text-[12.5px] text-muted-foreground">{texto}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Campo rotulo={modo === "ENTREGAR" ? "Data e hora da entrega" : "Data prevista"} obrigatorio={modo === "ENTREGAR"} erro={erros.data || undefined} className="lg:col-span-3">
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
                <Button carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()} data-testid="confirmar-alocacao">
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
  selecionados,
  aoAlternar,
  empresaColaborador,
  erro,
}: {
  equipamentos: Equipamento[];
  selecionados: string[];
  aoAlternar: (e: Equipamento) => void;
  empresaColaborador: string | null;
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
                {empresaColaborador && e.empresa.id !== empresaColaborador ? <span className="text-[11px] text-info">· {e.empresa.sigla}</span> : null}
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
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nenhum equipamento disponível encontrado.</Command.Empty>
          {equipamentos.map((e) => {
            const Icone = ICONE_CATEGORIA[e.categoria];
            const marcado = selecionados.includes(e.id);
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
                <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="tabular block truncate font-medium text-titulo">
                    {e.rotulo}
                    {e.nomeDispositivo && e.patrimonio ? <span className="font-normal text-muted-foreground"> · {e.patrimonio}</span> : null}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {e.rotuloCategoria} · {e.marca} {e.modelo}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-medium text-muted-foreground" title={e.empresa.nome}>
                  {e.empresa.sigla}
                </span>
                <span className="sr-only">{marcado ? "(selecionado)" : ""}</span>
              </Command.Item>
            );
          })}
        </Command.List>
      </Command>
      {erro ? <p className="text-[13px] font-medium text-erro">{erro}</p> : null}
      <p className="text-[12.5px] text-muted-foreground">Só aparecem equipamentos disponíveis. Notebook selecionado leva junto o carregador.</p>
    </div>
  );
}

function Revisao({
  colaborador,
  escolhidos,
  modo,
  quando,
  observacoes,
  outraEmpresa,
}: {
  colaborador: OpcoesNovaAlocacao["colaboradores"][number];
  escolhidos: Equipamento[];
  modo: "ENTREGAR" | "RESERVAR";
  quando: string;
  observacoes: string;
  outraEmpresa: number;
}) {
  return (
    <section aria-label="Revisão da alocação" className="flex flex-col gap-4">
      {outraEmpresa ? (
        <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info-fundo p-3 text-[13px]" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <span>
            {outraEmpresa} equipamento(s) de empresa diferente da do colaborador ({colaborador.empresa.nome}). A empresa proprietária de cada patrimônio não muda.
          </span>
        </div>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Colaborador</dt>
          <dd className="font-semibold text-titulo">{colaborador.nome}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Empresa do colaborador</dt>
          <dd className="font-semibold text-titulo">{colaborador.empresa.nome}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">Operação</dt>
          <dd className="font-semibold text-titulo">{modo === "ENTREGAR" ? "Entrega física agora" : "Reserva"}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted-foreground">{modo === "ENTREGAR" ? "Entrega" : "Prevista para"}</dt>
          <dd className="tabular font-semibold text-titulo">{quando ? quando.split(" ")[0].split("-").reverse().join("/") + (quando.includes(" ") ? ` ${quando.split(" ")[1]}` : "") : "Sem data"}</dd>
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
                <span className="tabular block truncate font-medium text-titulo">{e.rotulo}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {e.rotuloCategoria} · {e.marca} {e.modelo}
                </span>
              </span>
              <StatusBadge tom={e.empresa.id === colaborador.empresa.id ? "neutro" : "info"} className="text-[11px]">
                {e.empresa.sigla}
              </StatusBadge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
