"use client";

import { ClipboardCheck, PackageCheck, RotateCw, Wrench, Hourglass, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { formatarDataHora } from "@/components/inventario/visual";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errosChecklist, resultadoChecklist, ROTULO_CONDICAO, ROTULO_TIPO_INSPECAO, type CondicaoEntrada, type Pergunta, type Resultado, type TipoInspecao } from "@/lib/inspecao";
import { cn } from "@/lib/utils";
import { acaoChecklistParaAvaliacao, acaoConcluirAvaliacao } from "@/server/acoes/inspecoes";
import type { InstantaneoEntrega, ResumoInspecao } from "@/server/modulos/inspecoes";
import {
  anexarFotosInspecao,
  ChecklistInspecao,
  checklistVazio,
  inspecaoParaEnvio,
  ListaRespostas,
  ProgressoChecklist,
  ResultadoInspecaoBadge,
  type EstadoChecklist,
  type RespostaExibida,
} from "./checklist";

const CONTEUDO = cn(
  MODAL_CENTRALIZADO,
  "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0",
  "sm:max-w-[min(880px,calc(100%-2rem))] lg:max-w-[min(880px,calc(100%_-_var(--largura-sidebar,15rem)_-_2rem))]",
);

/** Leva ao primeiro item com erro (rolagem e foco na resposta ou na justificativa). */
export function focarErroChecklist(raiz: HTMLElement | null) {
  requestAnimationFrame(() => {
    const linha = raiz?.querySelector<HTMLElement>('[role="radiogroup"][aria-invalid="true"]')?.closest("li");
    const alvo = linha?.querySelector<HTMLElement>('textarea[aria-invalid="true"]') ?? linha?.querySelector<HTMLElement>("input:checked, input");
    linha?.scrollIntoView({ block: "center", behavior: "smooth" });
    alvo?.focus({ preventScroll: true });
  });
}

/**
 * Nova inspeção em um diálogo próprio: checklist, observações gerais e (no rodapé do corpo)
 * o que o fluxo precisar decidir. `aoConfirmar` devolve uma mensagem de erro ou nada.
 */
export function DialogoChecklist({
  aberto,
  aoMudar,
  titulo,
  descricao,
  perguntas,
  inicial,
  aoConfirmar,
  rotuloConfirmar = "Salvar inspeção",
  validarExtra,
  children,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  titulo: string;
  descricao: React.ReactNode;
  perguntas: readonly Pergunta[];
  inicial?: EstadoChecklist;
  aoConfirmar: (estado: EstadoChecklist) => Promise<string | null | void> | string | null | void;
  rotuloConfirmar?: string;
  /** Erro do que vem em `children` (ex.: encaminhamento), ou nada. */
  validarExtra?: (estado: EstadoChecklist) => string | null;
  children?: (estado: EstadoChecklist) => React.ReactNode;
}) {
  const [valor, setValor] = useState<EstadoChecklist>(() => inicial ?? checklistVazio());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);

  function mudar(proximo: EstadoChecklist) {
    setValor(proximo);
    setAlterado(true);
    // O erro some quando o item é corrigido.
    if (Object.keys(erros).length) setErros(errosChecklist(perguntas, proximo.respostas));
  }

  async function confirmar() {
    const e = errosChecklist(perguntas, valor.respostas);
    const extra = validarExtra?.(valor) ?? null;
    setErros(e);
    setErroGeral(extra);
    if (Object.keys(e).length) {
      setErroGeral(`Responda todos os itens e justifique os que pedem justificativa (${Object.keys(e).length} pendente${Object.keys(e).length === 1 ? "" : "s"}).`);
      focarErroChecklist(corpo.current);
      return;
    }
    if (extra) return;
    setEnviando(true);
    const r = await Promise.resolve(aoConfirmar(valor)).catch(() => "Não foi possível falar com o servidor. Tente novamente.");
    setEnviando(false);
    if (r) {
      setErroGeral(r);
      corpo.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const fechar = () => {
    if (enviando) return;
    if (alterado) setConfirmarDescarte(true);
    else aoMudar(false);
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : fechar())}>
        <DialogContent
          className={CONTEUDO}
          data-testid="dialogo-checklist"
          onInteractOutside={(e) => e.preventDefault()}
          // O foco fica no diálogo: no primeiro ícone de orientação, a dica abriria sozinha.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.target as HTMLElement | null)?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-muted-foreground" aria-hidden /> {titulo}
            </DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div ref={corpo} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
            {erroGeral ? <AlertaFormulario tom="erro">{erroGeral}</AlertaFormulario> : null}
            <ProgressoChecklist perguntas={perguntas} valor={valor} />
            <ChecklistInspecao perguntas={perguntas} valor={valor} aoMudar={mudar} erros={erros} desabilitado={enviando} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="observacoes-inspecao" className="text-[13px] font-semibold text-titulo">
                Observações gerais <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Textarea
                id="observacoes-inspecao"
                value={valor.observacoes}
                onChange={(e) => mudar({ ...valor, observacoes: e.target.value })}
                maxLength={1000}
                rows={2}
                disabled={enviando}
                className="min-h-10"
              />
            </div>
            {children?.(valor)}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="secondary" disabled={enviando} onClick={fechar}>
              Cancelar
            </Button>
            <Button type="button" carregando={enviando} rotuloCarregando="Salvando…" onClick={() => void confirmar()} data-testid="salvar-inspecao">
              {rotuloConfirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar as respostas?</AlertDialogTitle>
            <AlertDialogDescription>A inspeção ainda não foi registrada; as respostas e fotos serão perdidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar inspeção</AlertDialogCancel>
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

/* Consulta */

export type InspecaoExibida = {
  titulo: string;
  resultado: Resultado | null;
  campos: [string, React.ReactNode][];
  observacoes: string | null;
  respostas: RespostaExibida[];
};

export function exibirResumo(i: ResumoInspecao): InspecaoExibida {
  return {
    titulo: `Inspeção ${i.numero ?? ""}`.trim(),
    resultado: i.resultado,
    campos: [
      ["Tipo", ROTULO_TIPO_INSPECAO[i.tipo as TipoInspecao]],
      ["Data", i.concluidaEm ? formatarDataHora(i.concluidaEm) : "—"],
      ["Responsável TI", i.responsavel ?? "—"],
      ["Checklist", i.questionario ? `${i.questionario.titulo} · versão ${i.questionario.versao}` : (i.categoria ?? "—")],
      ...(i.condicaoEntrada ? ([["Condição de entrada", ROTULO_CONDICAO[i.condicaoEntrada as CondicaoEntrada]]] as [string, string][]) : []),
    ],
    observacoes: i.observacoes,
    respostas: i.respostas,
  };
}

/** Condição registrada na entrega física (instantâneo do TER). */
export function exibirInstantaneo(v: { modo: string; verificadaEm: string; responsavel: string; instantaneo: InstantaneoEntrega }): InspecaoExibida {
  const s = v.instantaneo;
  return {
    titulo: `Condição na entrega · ${s.equipamento.nome ?? s.equipamento.patrimonio ?? s.equipamento.modelo}`,
    resultado: s.inspecao.resultado,
    campos: [
      ["Verificação", v.modo === "CONFIRMOU_ULTIMA" ? "Confirmou a última inspeção" : "Nova inspeção na entrega"],
      ["Verificada em", formatarDataHora(v.verificadaEm)],
      ["Responsável TI", v.responsavel],
      ["Inspeção", `${s.inspecao.numero} · ${s.inspecao.concluidaEm ? formatarDataHora(s.inspecao.concluidaEm) : ""}${s.inspecao.responsavel ? ` · ${s.inspecao.responsavel}` : ""}`],
      ["Checklist", s.questionario ? `${s.questionario.titulo} · versão ${s.questionario.versao}` : s.equipamento.categoria],
    ],
    observacoes: s.inspecao.observacoes,
    respostas: s.respostas.map((r) => ({ ...r, fotos: r.fotos.map((id) => ({ id, url: `/api/inventario/fotos/${id}` })) })),
  };
}

export function DialogoDetalhesInspecao({ dados, aberto, aoMudar }: { dados: InspecaoExibida | null; aberto: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <Dialog open={aberto && Boolean(dados)} onOpenChange={aoMudar}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-detalhes-inspecao">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {dados?.titulo}
            {dados?.resultado ? <ResultadoInspecaoBadge resultado={dados.resultado} /> : null}
          </DialogTitle>
          <DialogDescription className="sr-only">Respostas registradas na inspeção técnica.</DialogDescription>
        </DialogHeader>
        {dados ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
            <dl className="grid gap-x-6 gap-y-2.5 rounded-xl border bg-muted/30 px-4 py-3 sm:grid-cols-2">
              {dados.campos.map(([rotulo, valor]) => (
                <div key={rotulo} className="min-w-0">
                  <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
                  <dd className="font-semibold break-words text-titulo">{valor}</dd>
                </div>
              ))}
              {dados.observacoes ? (
                <div className="sm:col-span-2">
                  <dt className="text-[12.5px] text-muted-foreground">Observações</dt>
                  <dd className="whitespace-pre-line text-titulo">{dados.observacoes}</dd>
                </div>
              ) : null}
            </dl>
            <ListaRespostas respostas={dados.respostas} />
          </div>
        ) : null}
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" onClick={() => aoMudar(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Avaliação técnica do equipamento devolvido */

const ENCAMINHAMENTOS: { valor: "DISPONIVEL" | "MANUTENCAO" | "AVALIACAO"; titulo: string; detalhe: string; icone: LucideIcon }[] = [
  { valor: "DISPONIVEL", titulo: "Liberar para uso", detalhe: "Fica disponível para nova alocação.", icone: PackageCheck },
  { valor: "MANUTENCAO", titulo: "Enviar para manutenção", detalhe: "Abre a manutenção com os itens não conformes.", icone: Wrench },
  { valor: "AVALIACAO", titulo: "Manter em avaliação", detalhe: "A inspeção fica registrada; a decisão fica para depois.", icone: Hourglass },
];

export type EquipamentoAvaliacao = { id: string; rotulo: string };
type ChecklistAvaliacao = { rotulo: string; categoria: string; herdado: boolean; perguntas: Pergunta[] };

/**
 * Inspeção do equipamento em avaliação (conclui a pendente) e o encaminhamento decidido pela
 * TI. Com defeito bloqueante, "Liberar para uso" não fica disponível.
 */
export function DialogoAvaliacaoTecnica({
  aberto,
  aoMudar,
  equipamento,
  aoConcluir,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoAvaliacao;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const [encaminhamento, setEncaminhamento] = useState<(typeof ENCAMINHAMENTOS)[number]["valor"] | "">("");
  // Checklist vigente da categoria, lido ao abrir (a TI pode ter mudado as perguntas).
  const [checklist, setChecklist] = useState<ChecklistAvaliacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    acaoChecklistParaAvaliacao(equipamento.id)
      .then((r) => vivo && (r.ok ? setChecklist(r.dados) : setErro(r.erro)))
      .catch(() => vivo && setErro("Não foi possível carregar o checklist. Tente novamente."));
    return () => {
      vivo = false;
    };
  }, [aberto, equipamento.id, tentativa]);
  const perguntas = checklist?.perguntas ?? [];

  async function enviar(estado: EstadoChecklist) {
    const dados = new FormData();
    dados.set("ativoId", equipamento.id);
    dados.set("encaminhamento", encaminhamento);
    dados.set("inspecao", JSON.stringify(inspecaoParaEnvio(perguntas, estado)));
    anexarFotosInspecao(dados, "avaliacao", perguntas, estado);
    const r = await acaoConcluirAvaliacao(dados);
    if (!r.ok) return r.erro;
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
    aoConcluir?.();
    return null;
  }

  if (!checklist) {
    return (
      <Dialog open={aberto} onOpenChange={aoMudar}>
        <DialogContent className={CONTEUDO} data-testid="dialogo-checklist">
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>Avaliação técnica</DialogTitle>
            <DialogDescription>{equipamento.rotulo}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-6 py-5">
            {erro ? (
              <>
                <AlertaFormulario tom="erro">{erro}</AlertaFormulario>
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setErro(null);
                    setTentativa((t) => t + 1);
                  }}
                >
                  <RotateCw aria-hidden /> Tentar novamente
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando o checklist">
                <Skeleton className="h-6 w-48 rounded-md" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DialogoChecklist
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Avaliação técnica"
      descricao={
        <>
          <span className="tabular font-semibold text-titulo">{equipamento.rotulo}</span> · checklist de {checklist.herdado ? "Outro (a categoria não tem perguntas próprias)" : checklist.categoria}
        </>
      }
      perguntas={perguntas}
      aoConfirmar={enviar}
      rotuloConfirmar="Registrar inspeção"
      validarExtra={(estado) => {
        if (!encaminhamento) return "Escolha o encaminhamento do equipamento.";
        if (encaminhamento === "DISPONIVEL" && resultadoChecklist(perguntas, estado.respostas) === "INAPTO") {
          return "Com defeito bloqueante, o equipamento não pode ser liberado. Envie para manutenção ou mantenha em avaliação.";
        }
        return null;
      }}
    >
      {(estado) => {
        const inapto = resultadoChecklist(perguntas, estado.respostas) === "INAPTO";
        return (
          <fieldset className="min-w-0">
            <legend className="mb-2 text-[13px] font-semibold text-titulo">
              Encaminhamento<span className="font-medium text-muted-foreground"> *</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Encaminhamento">
              {ENCAMINHAMENTOS.map(({ valor, titulo, detalhe, icone: Icone }) => {
                const bloqueado = valor === "DISPONIVEL" && inapto;
                const marcado = encaminhamento === valor && !bloqueado;
                return (
                  <label
                    key={valor}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      marcado ? "border-primary bg-accent/60" : "hover:bg-muted/50",
                      bloqueado && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <input type="radio" name="encaminhamento" value={valor} checked={marcado} disabled={bloqueado} onChange={() => setEncaminhamento(valor)} className="sr-only" />
                    <Icone className={cn("mt-0.5 size-4 shrink-0", marcado ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-titulo">{titulo}</span>
                      <span className="block text-[12px] leading-4 text-muted-foreground">{bloqueado ? "Indisponível: há defeito bloqueante." : detalhe}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      }}
    </DialogoChecklist>
  );
}
