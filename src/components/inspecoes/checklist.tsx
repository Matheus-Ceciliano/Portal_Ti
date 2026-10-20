"use client";

import { AlertCircle, AlertTriangle, Camera, CheckCircle2, CircleSlash, Info, Loader2, MessageSquarePlus, MinusCircle, ShieldAlert, X, XCircle, type LucideIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { StatusBadge, type Tom } from "@/components/comum/status-badge";
import type { FotoLocal } from "@/components/inventario/campo-fotos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { reduzirImagem } from "@/lib/imagem-cliente";
import {
  dicaDe,
  exigeJustificativa,
  RESPOSTAS,
  resultadoChecklist,
  ROTULO_RESPOSTA,
  ROTULO_RESULTADO,
  TEXTO_RESPOSTA_MAXIMO,
  type Pergunta,
  type Resposta,
  type RespostasFormulario,
  type Resultado,
} from "@/lib/inspecao";
import { cn } from "@/lib/utils";

/**
 * Checklist da inspeção técnica: cada pergunta recebe uma resposta explícita (nada é marcado
 * sozinho), justificativa quando a regra pede, observação opcional e fotos de evidência. A
 * orientação de cada pergunta abre no ícone de informação, sem mexer na resposta.
 */

export type EstadoChecklist = { respostas: RespostasFormulario; observacoes: string; fotos: Record<string, FotoLocal[]> };
export const checklistVazio = (): EstadoChecklist => ({ respostas: {}, observacoes: "", fotos: {} });

const FOTOS_POR_PERGUNTA = 3;

/** Respostas no formato do servidor: justificativa só quando não é "Conforme". */
export function inspecaoParaEnvio(perguntas: readonly Pergunta[], e: EstadoChecklist) {
  return {
    respostas: Object.fromEntries(
      perguntas
        .filter((p) => e.respostas[p.chave]?.resposta)
        .map((p) => {
          const r = e.respostas[p.chave];
          return [
            p.chave,
            {
              resposta: r.resposta as Resposta,
              justificativa: r.resposta !== "CONFORME" ? r.justificativa?.trim() || undefined : undefined,
              observacao: r.observacao?.trim() || undefined,
            },
          ];
        }),
    ),
    observacoes: e.observacoes.trim() || undefined,
  };
}

/** Fotos de evidência nos campos "insp:<alvo>:<pergunta>" que o servidor lê. */
export function anexarFotosInspecao(dados: FormData, alvo: string, perguntas: readonly Pergunta[], e: EstadoChecklist) {
  for (const p of perguntas) for (const f of e.fotos[p.chave] ?? []) dados.append(`insp:${alvo}:${p.chave}`, f.arquivo);
}

export const totalFotosInspecao = (e: EstadoChecklist) => Object.values(e.fotos).reduce((s, l) => s + l.length, 0);

const ESTILO_RESPOSTA: Record<Resposta, { icone: LucideIcon; marcado: string }> = {
  CONFORME: { icone: CheckCircle2, marcado: "border-sucesso/40 bg-sucesso-fundo text-sucesso" },
  NAO_CONFORME: { icone: XCircle, marcado: "border-erro/40 bg-erro-fundo text-erro" },
  NAO_TESTADO: { icone: MinusCircle, marcado: "border-atencao/40 bg-atencao-fundo text-atencao" },
  NAO_SE_APLICA: { icone: CircleSlash, marcado: "border-neutro/35 bg-neutro-fundo text-neutro" },
};

const TOM_RESULTADO: Record<Resultado, { tom: Tom; icone: LucideIcon }> = {
  APTO: { tom: "sucesso", icone: CheckCircle2 },
  APTO_COM_RESSALVAS: { tom: "atencao", icone: AlertTriangle },
  INAPTO: { tom: "erro", icone: XCircle },
};

export function ResultadoInspecaoBadge({ resultado, className }: { resultado: Resultado; className?: string }) {
  const { tom, icone } = TOM_RESULTADO[resultado];
  return (
    <StatusBadge tom={tom} icone={icone} className={className}>
      {ROTULO_RESULTADO[resultado]}
    </StatusBadge>
  );
}

export function RespostaSelo({ resposta }: { resposta: Resposta }) {
  const { icone: Icone, marcado } = ESTILO_RESPOSTA[resposta];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11.5px] font-medium whitespace-nowrap", marcado)}>
      <Icone className="size-3.5" aria-hidden strokeWidth={2.25} />
      {ROTULO_RESPOSTA[resposta]}
    </span>
  );
}

/** Orientação da pergunta: dica curta ao passar o mouse; instruções completas no clique (Esc ou clique fora fecham). */
export function OrientacaoPergunta({ pergunta }: { pergunta: Pergunta }) {
  const [aberta, setAberta] = useState(false);
  const [dica, setDica] = useState(false);
  return (
    <Popover open={aberta} onOpenChange={setAberta}>
      <Tooltip open={dica && !aberta} onOpenChange={setDica}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Como verificar: ${pergunta.texto}`}
              className="-my-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-titulo focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-titulo"
            >
              <Info className="size-4" aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-[12px] leading-4">
          {dicaDe(pergunta)}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(340px,calc(100vw-2rem))] gap-3 p-3.5" data-testid="orientacao-pergunta">
        <p className="text-[13px] leading-5 font-semibold text-titulo">{pergunta.texto}</p>
        <TrechoOrientacao titulo="Como testar" texto={pergunta.orientacao.comoTestar} />
        <TrechoOrientacao titulo="Resultado esperado" texto={pergunta.orientacao.resultadoEsperado} icone={CheckCircle2} classeIcone="text-sucesso" />
        <TrechoOrientacao titulo="Sinais de problema" texto={pergunta.orientacao.sinaisProblema} icone={AlertTriangle} classeIcone="text-erro" />
        {pergunta.bloqueante ? (
          <p className="flex items-start gap-1.5 border-t pt-2.5 text-[12px] leading-4 text-muted-foreground">
            <ShieldAlert className="mt-px size-3.5 shrink-0 text-erro" aria-hidden />
            Item bloqueante: &ldquo;Não conforme&rdquo; impede a entrega e a liberação do equipamento.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TrechoOrientacao({ titulo, texto, icone: Icone, classeIcone }: { titulo: string; texto: string; icone?: LucideIcon; classeIcone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-titulo">
        {Icone ? <Icone className={cn("size-3.5", classeIcone)} aria-hidden /> : null}
        {titulo}
      </p>
      <p className="text-[12.5px] leading-[18px] text-muted-foreground">{texto}</p>
    </div>
  );
}

/** Progresso e prévia do resultado (o definitivo é calculado no servidor). */
export function ProgressoChecklist({ perguntas, valor }: { perguntas: readonly Pergunta[]; valor: EstadoChecklist }) {
  const respondidas = perguntas.filter((p) => valor.respostas[p.chave]?.resposta).length;
  const resultado = resultadoChecklist(perguntas, valor.respostas);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-live="polite">
      <span className="tabular text-[12.5px] font-medium text-muted-foreground">
        {respondidas} de {perguntas.length} respondida{perguntas.length === 1 ? "" : "s"}
      </span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${perguntas.length ? (respondidas / perguntas.length) * 100 : 0}%` }} />
      </span>
      {resultado ? <ResultadoInspecaoBadge resultado={resultado} /> : null}
    </div>
  );
}

export function ChecklistInspecao({
  perguntas,
  valor,
  aoMudar,
  erros = {},
  comFotos = true,
  desabilitado,
}: {
  perguntas: readonly Pergunta[];
  valor: EstadoChecklist;
  aoMudar: (proximo: EstadoChecklist) => void;
  erros?: Record<string, string>;
  /** Permite anexar fotos de evidência por pergunta. */
  comFotos?: boolean;
  desabilitado?: boolean;
}) {
  const grupos = [...new Set(perguntas.map((p) => p.grupo))];
  return (
    <div className="flex flex-col gap-4" data-testid="checklist-inspecao">
      {grupos.map((g) => (
        <fieldset key={g} className="min-w-0">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">{g}</legend>
          <ul className="divide-y rounded-xl border">
            {perguntas
              .filter((p) => p.grupo === g)
              .map((p) => (
                <LinhaPergunta key={p.chave} pergunta={p} valor={valor} aoMudar={aoMudar} erro={erros[p.chave]} comFotos={comFotos} desabilitado={desabilitado} />
              ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

function LinhaPergunta({
  pergunta: p,
  valor,
  aoMudar,
  erro,
  comFotos,
  desabilitado,
}: {
  pergunta: Pergunta;
  valor: EstadoChecklist;
  aoMudar: (proximo: EstadoChecklist) => void;
  erro?: string;
  comFotos: boolean;
  desabilitado?: boolean;
}) {
  const id = useId();
  const arquivo = useRef<HTMLInputElement>(null);
  const [processando, setProcessando] = useState(false);
  const r = valor.respostas[p.chave] ?? {};
  const fotos = valor.fotos[p.chave] ?? [];
  const [comObservacao, setComObservacao] = useState(Boolean(r.observacao));
  const justificar = Boolean(r.resposta) && r.resposta !== "CONFORME";
  const obrigatoria = exigeJustificativa(p, r.resposta);
  const mostrarObservacao = r.resposta === "CONFORME" && (comObservacao || Boolean(r.observacao));
  const mudar = (parcial: Partial<typeof r>) => aoMudar({ ...valor, respostas: { ...valor.respostas, [p.chave]: { ...r, ...parcial } } });

  async function adicionarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    const escolhidos = [...lista].slice(0, Math.max(0, FOTOS_POR_PERGUNTA - fotos.length));
    if (!escolhidos.length) return;
    setProcessando(true);
    const reduzidos = await Promise.all(escolhidos.map(reduzirImagem));
    setProcessando(false);
    const novas = reduzidos.map((a) => ({ id: crypto.randomUUID(), arquivo: a, url: URL.createObjectURL(a) }));
    aoMudar({ ...valor, fotos: { ...valor.fotos, [p.chave]: [...fotos, ...novas] } });
  }

  function removerFoto(fotoId: string) {
    const alvo = fotos.find((f) => f.id === fotoId);
    if (alvo) URL.revokeObjectURL(alvo.url);
    aoMudar({ ...valor, fotos: { ...valor.fotos, [p.chave]: fotos.filter((f) => f.id !== fotoId) } });
  }

  return (
    <li className={cn("flex flex-col gap-2.5 px-3.5 py-3", erro && "bg-erro-fundo/40")} data-pergunta={p.chave}>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-start gap-1.5">
          <p id={`${id}-texto`} className="min-w-0 pt-px text-[13.5px] leading-5 font-medium text-titulo">
            {p.texto}
            {p.obrigatoria ? null : <span className="font-normal text-muted-foreground"> (opcional)</span>}
          </p>
          <OrientacaoPergunta pergunta={p} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <div
            role="radiogroup"
            aria-labelledby={`${id}-texto`}
            aria-describedby={erro ? `${id}-erro` : undefined}
            aria-invalid={erro ? true : undefined}
            className="grid grow grid-cols-2 gap-1.5 sm:flex sm:grow-0 sm:flex-wrap"
          >
            {RESPOSTAS.map((opcao) => {
              const marcado = r.resposta === opcao;
              const { icone: Icone, marcado: estilo } = ESTILO_RESPOSTA[opcao];
              return (
                <label
                  key={opcao}
                  className={cn(
                    "relative flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors select-none sm:h-8",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-card",
                    marcado ? estilo : "border-input bg-card text-muted-foreground hover:border-foreground/35 hover:text-titulo",
                    desabilitado && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-resposta`}
                    value={opcao}
                    checked={marcado}
                    disabled={desabilitado}
                    onChange={() => mudar({ resposta: opcao })}
                    className="sr-only"
                  />
                  <Icone className={cn("size-3.5", marcado ? "" : "opacity-70")} aria-hidden strokeWidth={2.25} />
                  {ROTULO_RESPOSTA[opcao]}
                </label>
              );
            })}
          </div>
          {/* Observação (em "Conforme") e foto de evidência: ícones na mesma linha, sem aumentar a altura. */}
          <div className={cn("flex gap-0.5", !(r.resposta === "CONFORME" && !mostrarObservacao) && !(comFotos && r.resposta && fotos.length < FOTOS_POR_PERGUNTA) && "max-sm:hidden")}>
            <AcaoLinha
              icone={MessageSquarePlus}
              rotulo={`Adicionar observação: ${p.texto}`}
              dica="Adicionar observação"
              visivel={r.resposta === "CONFORME" && !mostrarObservacao}
              desabilitado={desabilitado}
              aoClicar={() => setComObservacao(true)}
            />
            {comFotos ? (
              <AcaoLinha
                icone={processando ? Loader2 : Camera}
                rotulo={`Adicionar foto de evidência: ${p.texto}`}
                dica={fotos.length ? "Mais fotos de evidência" : "Foto de evidência"}
                visivel={Boolean(r.resposta) && fotos.length < FOTOS_POR_PERGUNTA}
                desabilitado={desabilitado || processando}
                aoClicar={() => arquivo.current?.click()}
                girando={processando}
              />
            ) : null}
            <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void adicionarFotos(e.target.files).then(() => (e.target.value = ""))} />
          </div>
        </div>
      </div>

      {r.resposta === "NAO_CONFORME" && p.bloqueante ? (
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-erro">
          <ShieldAlert className="size-3.5" aria-hidden /> Defeito bloqueante: o equipamento não pode ser entregue nem liberado.
        </p>
      ) : null}

      {justificar || mostrarObservacao ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-texto-livre`} className="text-[12.5px] font-semibold text-titulo">
            {justificar ? "Justificativa" : "Observação"}
            {justificar && obrigatoria ? (
              <span className="font-medium text-muted-foreground">
                <span aria-hidden> *</span>
                <span className="sr-only"> (obrigatória)</span>
              </span>
            ) : (
              <span className="font-normal text-muted-foreground"> (opcional)</span>
            )}
          </label>
          <Textarea
            id={`${id}-texto-livre`}
            value={(justificar ? r.justificativa : r.observacao) ?? ""}
            onChange={(e) => mudar(justificar ? { justificativa: e.target.value } : { observacao: e.target.value })}
            maxLength={TEXTO_RESPOSTA_MAXIMO}
            rows={2}
            disabled={desabilitado}
            aria-invalid={erro && obrigatoria ? true : undefined}
            aria-describedby={erro ? `${id}-erro` : undefined}
            placeholder={r.resposta === "NAO_CONFORME" ? "Descreva o problema encontrado" : r.resposta === "NAO_TESTADO" ? "Por que não foi possível testar?" : r.resposta === "NAO_SE_APLICA" ? "Por que não se aplica a este equipamento?" : undefined}
            className="min-h-10 text-[13px]"
          />
        </div>
      ) : null}

      {erro ? (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-erro">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {fotos.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {fotos.map((f, i) => (
            <span key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (object URL) */}
              <img src={f.url} alt={`Foto ${i + 1} de evidência`} className="size-10 rounded-md border object-cover" />
              <button
                type="button"
                onClick={() => removerFoto(f.id)}
                aria-label={`Remover foto ${i + 1}`}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground shadow-nivel-1 hover:text-erro focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function AcaoLinha({
  icone: Icone,
  rotulo,
  dica,
  visivel,
  desabilitado,
  aoClicar,
  girando,
}: {
  icone: LucideIcon;
  rotulo: string;
  dica: string;
  visivel: boolean;
  desabilitado?: boolean;
  aoClicar: () => void;
  girando?: boolean;
}) {
  // Invisível: no desktop reserva o espaço (as opções não pulam); no celular não ocupa linha.
  if (!visivel) return <span className="size-8 shrink-0 max-sm:hidden" aria-hidden />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={rotulo}
          disabled={desabilitado}
          onClick={aoClicar}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-titulo focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          <Icone className={cn("size-4", girando && "animate-spin")} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{dica}</TooltipContent>
    </Tooltip>
  );
}

/** Uma resposta registrada (consulta de inspeção ou instantâneo da entrega). */
export type RespostaExibida = {
  chave: string;
  grupo: string;
  pergunta: string;
  resposta: Resposta;
  justificativa: string | null;
  observacao: string | null;
  bloqueante?: boolean;
  fotos?: { id: string; url: string }[];
};

/** Respostas agrupadas, só leitura. */
export function ListaRespostas({ respostas }: { respostas: readonly RespostaExibida[] }) {
  const grupos = [...new Set(respostas.map((r) => r.grupo))];
  return (
    <div className="flex flex-col gap-3" data-testid="respostas-inspecao">
      {grupos.map((g) => (
        <section key={g} aria-label={g}>
          <h4 className="mb-1 text-[12.5px] font-semibold text-muted-foreground">{g}</h4>
          <ul className="divide-y rounded-xl border">
            {respostas
              .filter((r) => r.grupo === g)
              .map((r) => (
                <li key={r.chave} className="flex flex-col gap-1 px-3.5 py-2.5">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <p className="text-[13px] leading-5 text-titulo">{r.pergunta}</p>
                    <RespostaSelo resposta={r.resposta} />
                  </div>
                  {r.justificativa ? <p className="text-[12.5px] leading-[18px] text-muted-foreground">Justificativa: {r.justificativa}</p> : null}
                  {r.observacao ? <p className="text-[12.5px] leading-[18px] text-muted-foreground">Observação: {r.observacao}</p> : null}
                  {r.fotos?.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {r.fotos.map((f, i) => (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          {/* eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão */}
                          <img src={f.url} alt={`Evidência ${i + 1}: ${r.pergunta}`} className="size-12 rounded-md border object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
