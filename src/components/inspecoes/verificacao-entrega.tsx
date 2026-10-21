"use client";

import { AlertCircle, ClipboardCheck, ClipboardList, PencilLine, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { formatarDataHora } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resultadoChecklist, ROTULO_TIPO_INSPECAO, type TipoInspecao } from "@/lib/inspecao";
import { cn } from "@/lib/utils";
import { acaoCondicoesParaEntrega } from "@/server/acoes/inspecoes";
import type { CondicaoParaEntrega } from "@/server/modulos/inspecoes";
import { anexarFotosInspecao, inspecaoParaEnvio, RespostaSelo, ResultadoInspecaoBadge, totalFotosInspecao, type EstadoChecklist } from "./checklist";
import { DialogoChecklist, DialogoDetalhesInspecao, exibirResumo, type InspecaoExibida } from "./dialogos-inspecao";

/**
 * Verificação técnica de cada equipamento antes da entrega física: mostra a última inspeção
 * válida e pede uma decisão explícita — as condições continuam iguais (confirma aquela
 * inspeção) ou mudaram (nova inspeção). Sem inspeção anterior, só a nova é possível.
 */

export type DecisaoItem = { modo: "CONFIRMAR"; inspecaoId: string } | { modo: "NOVA"; estado: EstadoChecklist };
export type Decisoes = Record<string, DecisaoItem | undefined>;

/** Checklist vigente do item, já filtrado pelo servidor (pré-alocação e peça do kit). */
const perguntasDoItem = (c: CondicaoParaEntrega) => c.perguntas;

/** Condições (última inspeção e questionário) dos equipamentos, carregadas quando `ativo`. */
export function useCondicoesEntrega(ids: string[], ativo: boolean) {
  const chave = ativo ? [...ids].sort().join(",") : "";
  const [estado, setEstado] = useState<{ chave: string; dados: CondicaoParaEntrega[] | null; erro: string | null }>({ chave: "", dados: null, erro: null });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    acaoCondicoesParaEntrega(chave.split(","))
      .then((r) => vivo && setEstado({ chave, dados: r.ok ? r.dados : null, erro: r.ok ? null : r.erro }))
      .catch(() => vivo && setEstado({ chave, dados: null, erro: "Não foi possível carregar as inspeções. Tente novamente." }));
    return () => {
      vivo = false;
    };
  }, [chave, tentativa]);
  const atual = estado.chave === chave ? estado : null;
  return {
    condicoes: atual?.dados ?? null,
    erro: atual?.erro ?? null,
    recarregar: () => {
      setEstado({ chave: "", dados: null, erro: null });
      setTentativa((t) => t + 1);
    },
  };
}

/** Itens sem decisão (cada equipamento precisa da própria verificação). */
export function errosVerificacao(condicoes: CondicaoParaEntrega[], decisoes: Decisoes) {
  return Object.fromEntries(
    condicoes
      .filter((c) => {
        const d = decisoes[c.ativoId];
        return !d || (d.modo === "CONFIRMAR" && (!c.ultima || c.ultima.id !== d.inspecaoId || c.ultima.resultado === "INAPTO"));
      })
      .map((c) => [c.ativoId, c.ultima ? "Responda se as condições continuam iguais às da última inspeção." : "Faça a inspeção deste equipamento antes da entrega."]),
  );
}

/** Verificações no formato do servidor e as fotos das inspeções novas. */
export function montarVerificacoes(condicoes: CondicaoParaEntrega[], decisoes: Decisoes) {
  const anexos = new FormData();
  const verificacoes = condicoes.map((c) => {
    const d = decisoes[c.ativoId]!;
    if (d.modo === "CONFIRMAR") return { ativoId: c.ativoId, modo: "CONFIRMAR" as const, inspecaoId: d.inspecaoId };
    const perguntas = perguntasDoItem(c);
    anexarFotosInspecao(anexos, c.ativoId, perguntas, d.estado);
    return { ativoId: c.ativoId, modo: "NOVA" as const, inspecao: inspecaoParaEnvio(perguntas, d.estado) };
  });
  return { verificacoes, anexos };
}

export function VerificacaoCondicoes({
  condicoes,
  erro,
  aoTentarDeNovo,
  decisoes,
  aoMudar,
  erros = {},
}: {
  condicoes: CondicaoParaEntrega[] | null;
  erro: string | null;
  aoTentarDeNovo: () => void;
  decisoes: Decisoes;
  aoMudar: (ativoId: string, d: DecisaoItem | undefined) => void;
  erros?: Record<string, string>;
}) {
  const [inspecionando, setInspecionando] = useState<CondicaoParaEntrega | null>(null);
  const [consulta, setConsulta] = useState<InspecaoExibida | null>(null);

  if (erro) {
    return (
      <div className="flex flex-col items-start gap-3">
        <AlertaFormulario tom="erro">{erro}</AlertaFormulario>
        <Button variant="secondary" size="sm" onClick={aoTentarDeNovo}>
          <RotateCw aria-hidden /> Tentar novamente
        </Button>
      </div>
    );
  }
  if (!condicoes) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando as inspeções">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }

  const nova = inspecionando ? decisoes[inspecionando.ativoId] : undefined;
  return (
    <section aria-labelledby="titulo-verificacao" className="flex flex-col gap-2.5" data-testid="verificacao-condicoes">
      <div className="flex flex-col gap-0.5">
        <h3 id="titulo-verificacao" className="text-sm font-bold text-titulo">
          Condição dos equipamentos
        </h3>
        <p className="text-[12.5px] text-muted-foreground">Cada equipamento precisa da própria verificação técnica antes da entrega física.</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {condicoes.map((c) => (
          <CartaoCondicao
            key={c.ativoId}
            condicao={c}
            decisao={decisoes[c.ativoId]}
            erro={erros[c.ativoId]}
            aoConfirmar={() => c.ultima && aoMudar(c.ativoId, { modo: "CONFIRMAR", inspecaoId: c.ultima.id })}
            aoInspecionar={() => setInspecionando(c)}
            aoConsultar={() => c.ultima && setConsulta(exibirResumo(c.ultima))}
          />
        ))}
      </ul>

      {inspecionando ? (
        <DialogoChecklist
          key={inspecionando.ativoId}
          aberto
          aoMudar={(v) => !v && setInspecionando(null)}
          titulo="Inspeção antes da entrega"
          descricao={
            <>
              <span className="tabular font-semibold text-titulo">{inspecionando.rotulo}</span> · {inspecionando.rotuloCategoria}
            </>
          }
          perguntas={perguntasDoItem(inspecionando)}
          inicial={nova?.modo === "NOVA" ? nova.estado : undefined}
          rotuloConfirmar="Usar esta inspeção"
          validarExtra={(estado) =>
            resultadoChecklist(perguntasDoItem(inspecionando), estado.respostas) === "INAPTO"
              ? "Defeito bloqueante: este equipamento não pode ser entregue. Retire-o da alocação e encaminhe para manutenção."
              : null
          }
          aoConfirmar={(estado) => {
            aoMudar(inspecionando.ativoId, { modo: "NOVA", estado });
            setInspecionando(null);
          }}
        />
      ) : null}
      <DialogoDetalhesInspecao dados={consulta} aberto={Boolean(consulta)} aoMudar={(v) => !v && setConsulta(null)} />
    </section>
  );
}

function CartaoCondicao({
  condicao: c,
  decisao,
  erro,
  aoConfirmar,
  aoInspecionar,
  aoConsultar,
}: {
  condicao: CondicaoParaEntrega;
  decisao: DecisaoItem | undefined;
  erro?: string;
  aoConfirmar: () => void;
  aoInspecionar: () => void;
  aoConsultar: () => void;
}) {
  const u = c.ultima;
  const podeConfirmar = Boolean(u && u.resultado !== "INAPTO");
  const ressalvas = u?.respostas.filter((r) => r.resposta === "NAO_CONFORME" || r.resposta === "NAO_TESTADO") ?? [];
  const perguntas = perguntasDoItem(c);
  const nova = decisao?.modo === "NOVA" ? decisao.estado : null;
  const resultadoNova = nova ? resultadoChecklist(perguntas, nova.respostas) : null;
  const nome = `condicao-${c.ativoId}`;
  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border p-3.5", erro && "border-erro/60")} data-testid="cartao-condicao" data-ativo={c.rotulo}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular font-semibold text-titulo">{c.rotulo}</p>
          <p className="text-[12.5px] text-muted-foreground">{c.rotuloCategoria}</p>
        </div>
        {u?.resultado ? <ResultadoInspecaoBadge resultado={u.resultado} /> : null}
      </div>

      {u ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px]">
          <p className="text-titulo">
            <span className="font-semibold">Última inspeção {u.numero}</span>
            <span className="text-muted-foreground">
              {" "}
              · {ROTULO_TIPO_INSPECAO[u.tipo as TipoInspecao]} · {u.concluidaEm ? formatarDataHora(u.concluidaEm) : ""} · {u.responsavel}
            </span>
          </p>
          {ressalvas.length ? (
            <ul className="flex flex-col gap-1">
              {ressalvas.map((r) => (
                <li key={r.chave} className="flex flex-wrap items-center gap-1.5">
                  <RespostaSelo resposta={r.resposta} />
                  <span className="text-titulo">{r.pergunta}</span>
                  {r.justificativa ? <span className="text-muted-foreground">— {r.justificativa}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              {u.respostas.filter((r) => r.resposta === "CONFORME").length} itens conformes
              {u.respostas.some((r) => r.resposta === "NAO_SE_APLICA") ? `, ${u.respostas.filter((r) => r.resposta === "NAO_SE_APLICA").length} sem aplicação` : ""}.
            </p>
          )}
          {u.observacoes ? <p className="text-muted-foreground">Observações: {u.observacoes}</p> : null}
          <button type="button" onClick={aoConsultar} className="self-start text-[12.5px] font-semibold text-link underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
            Ver todas as respostas
          </button>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-lg bg-atencao-fundo px-3 py-2.5 text-[12.5px] text-atencao">
          <ClipboardList className="mt-px size-3.5 shrink-0" aria-hidden />
          Sem inspeção registrada. Faça a inspeção antes da entrega.
        </p>
      )}

      {u ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-[13px] font-semibold text-titulo">
            As condições deste equipamento continuam iguais às da última inspeção?<span className="font-medium text-muted-foreground"> *</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                decisao?.modo === "CONFIRMAR" ? "border-primary bg-accent/60 text-titulo" : "text-muted-foreground hover:bg-muted/50 hover:text-titulo",
                !podeConfirmar && "cursor-not-allowed opacity-55",
              )}
            >
              <input type="radio" name={nome} checked={decisao?.modo === "CONFIRMAR"} disabled={!podeConfirmar} onChange={aoConfirmar} className="size-4 accent-primary" />
              {podeConfirmar ? "Sim, continuam iguais" : "Indisponível: a última inspeção tem defeito bloqueante"}
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                decisao?.modo === "NOVA" ? "border-primary bg-accent/60 text-titulo" : "text-muted-foreground hover:bg-muted/50 hover:text-titulo",
              )}
            >
              <input type="radio" name={nome} checked={decisao?.modo === "NOVA"} onChange={aoInspecionar} onClick={() => decisao?.modo === "NOVA" && aoInspecionar()} className="size-4 accent-primary" />
              Não, fazer nova inspeção
            </label>
          </div>
        </fieldset>
      ) : null}

      {nova ? (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-semibold text-titulo">Nova inspeção preenchida</span>
          {resultadoNova ? <ResultadoInspecaoBadge resultado={resultadoNova} /> : null}
          {totalFotosInspecao(nova) ? <span className="text-muted-foreground">· {totalFotosInspecao(nova)} foto(s)</span> : null}
          <Button type="button" variant="ghost" size="sm" onClick={aoInspecionar}>
            <PencilLine aria-hidden /> Revisar respostas
          </Button>
        </div>
      ) : !u ? (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={aoInspecionar}>
          <ClipboardCheck aria-hidden /> Fazer inspeção
        </Button>
      ) : null}

      {erro ? (
        <p className="flex items-start gap-1.5 text-[13px] font-medium text-erro">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}
    </li>
  );
}
