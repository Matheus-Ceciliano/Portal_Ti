"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PARTES_KIT, ROTULO_PARTE, type ParteKit } from "@/lib/identificacao";
import { APLICACOES, DETALHE_APLICACAO, ROTULO_APLICACAO, type Aplicacao } from "@/lib/inspecao";
import { cn } from "@/lib/utils";
import { acaoSalvarPergunta } from "@/server/acoes/checklists";
import type { PerguntaGestao } from "@/server/modulos/checklists";

const CONTEUDO = cn(
  MODAL_CENTRALIZADO,
  "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0",
  "sm:max-w-[min(720px,calc(100%-2rem))] lg:max-w-[min(720px,calc(100%_-_var(--largura-sidebar,15rem)_-_2rem))]",
);

export type CategoriaChecklist = { id: string; nome: string; ativa: boolean; tipo: string };

/** Sim/Não em controle segmentado (o mesmo padrão de "Entregar agora / Reservar"). */
function SimNao({ id, valor, aoMudar, rotulo, rotulos = ["Sim", "Não"] }: { id: string; valor: boolean; aoMudar: (v: boolean) => void; rotulo: string; rotulos?: [string, string] }) {
  return (
    <div id={id} role="radiogroup" aria-label={rotulo} className="grid h-11 grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:h-10">
      {([true, false] as const).map((v, i) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => aoMudar(v)}
          className={cn(
            "rounded-md px-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            valor === v ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
          )}
        >
          {rotulos[i]}
        </button>
      ))}
    </div>
  );
}

/**
 * Cadastro e edição de uma pergunta do checklist. A categoria não muda depois de criada;
 * mudar o conteúdo de uma pergunta já usada cria a próxima versão (as inspeções feitas
 * continuam com a versão delas).
 */
export function DialogoPerguntaInspecao({
  pergunta,
  categorias,
  categoriaInicial,
  grupos,
  aoFechar,
  aoSalvar,
}: {
  pergunta: PerguntaGestao | null;
  categorias: CategoriaChecklist[];
  categoriaInicial?: string;
  /** Grupos já usados na categoria (sugestões). */
  grupos: string[];
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const a = pergunta?.atual;
  const [f, setF] = useState({
    categoriaId: pergunta?.categoriaId ?? categoriaInicial ?? "",
    grupo: a?.grupo ?? "",
    texto: a?.texto ?? "",
    comoTestar: a?.orientacao.comoTestar ?? "",
    resultadoEsperado: a?.orientacao.resultadoEsperado ?? "",
    sinaisProblema: a?.orientacao.sinaisProblema ?? "",
    obrigatoria: a?.obrigatoria ?? true,
    bloqueante: a?.bloqueante ?? false,
    aplicacao: (a?.aplicacao ?? "SEMPRE") as Aplicacao,
    partes: [...(a?.partes ?? [])] as ParteKit[],
    ordem: pergunta ? String(pergunta.ordem) : "",
    ativa: pergunta?.ativa ?? true,
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const categoria = categorias.find((c) => c.id === f.categoriaId);
  const kit = categoria?.tipo === "KIT_TECLADO_MOUSE";
  const mudar = (parcial: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...parcial }));
    setErros((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in parcial))));
  };

  async function salvar() {
    const e: Record<string, string> = {};
    if (!f.categoriaId) e.categoriaId = "Selecione a categoria do equipamento.";
    if (!f.grupo.trim()) e.grupo = "Informe o grupo (ex.: Tela, Energia).";
    if (!f.texto.trim()) e.texto = "Informe a pergunta.";
    if (!f.comoTestar.trim()) e.comoTestar = "Descreva como testar.";
    if (!f.resultadoEsperado.trim()) e.resultadoEsperado = "Descreva o resultado esperado.";
    if (!f.sinaisProblema.trim()) e.sinaisProblema = "Descreva os sinais de não conformidade.";
    if (f.ordem && (!/^\d+$/.test(f.ordem) || Number(f.ordem) < 1)) e.ordem = "Use um número inteiro a partir de 1.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    const r = await acaoSalvarPergunta({
      id: pergunta?.id,
      categoriaId: f.categoriaId,
      grupo: f.grupo,
      texto: f.texto,
      comoTestar: f.comoTestar,
      resultadoEsperado: f.resultadoEsperado,
      sinaisProblema: f.sinaisProblema,
      obrigatoria: f.obrigatoria,
      bloqueante: f.bloqueante,
      aplicacao: f.aplicacao,
      partes: kit ? f.partes : [],
      ordem: f.ordem ? Number(f.ordem) : null,
      ativa: f.ativa,
    }).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    aoSalvar(r.mensagem);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent
        className={CONTEUDO}
        data-testid="dialogo-pergunta-inspecao"
        onInteractOutside={(e) => e.preventDefault()}
        // Edição: o foco fica no modal, sem selecionar o primeiro campo (digitar não apaga o valor por engano).
        onOpenAutoFocus={(e) => {
          if (!pergunta) return;
          e.preventDefault();
          (e.target as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle>{pergunta ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
          <DialogDescription className={pergunta?.usos ? undefined : "sr-only"}>
            {pergunta?.usos
              ? `Usada em ${pergunta.usos} ${pergunta.usos === 1 ? "resposta" : "respostas"}: mudar o conteúdo cria a versão ${pergunta.atual.versao + 1}; as inspeções feitas mantêm a versão delas.`
              : "Pergunta do checklist de inspeção da categoria."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-x-5 gap-y-4 overflow-y-auto overscroll-contain px-6 py-5 sm:grid-cols-2">
          {erro ? (
            <div className="sm:col-span-2">
              <AlertaFormulario tom="erro">{erro}</AlertaFormulario>
            </div>
          ) : null}
          <Campo rotulo="Categoria do equipamento" obrigatorio={!pergunta} erro={erros.categoriaId} ajuda={pergunta ? "A categoria não muda depois de criada." : undefined}>
            {(p) => (
              <SelecaoPersonalizada
                id={p.id}
                aria-describedby={p["aria-describedby"]}
                invalido={p["aria-invalid"]}
                valor={f.categoriaId}
                aoMudar={(v) => mudar({ categoriaId: v, partes: [] })}
                opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: c.ativa ? undefined : "Inativa" }))}
                placeholder="Selecione"
                pesquisavel
                desabilitado={Boolean(pergunta)}
              />
            )}
          </Campo>
          <Campo rotulo="Grupo" obrigatorio erro={erros.grupo} ajuda="Agrupa as perguntas no checklist (ex.: Tela, Energia).">
            {(p) => (
              <>
                <Input {...p} value={f.grupo} onChange={(e) => mudar({ grupo: e.target.value })} maxLength={60} list="grupos-checklist" autoComplete="off" />
                <datalist id="grupos-checklist">
                  {grupos.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </>
            )}
          </Campo>
          <Campo rotulo="Pergunta" obrigatorio erro={erros.texto} className="sm:col-span-2">
            {(p) => <Input {...p} value={f.texto} onChange={(e) => mudar({ texto: e.target.value })} maxLength={200} autoComplete="off" placeholder="Ex.: Tela sem pixels mortos, manchas ou linhas" />}
          </Campo>
          <Campo rotulo="Como testar" obrigatorio erro={erros.comoTestar} className="sm:col-span-2">
            {(p) => <Textarea {...p} value={f.comoTestar} onChange={(e) => mudar({ comoTestar: e.target.value })} maxLength={800} rows={3} placeholder="Passos objetivos, sem abrir fontes nem mexer em circuito energizado." />}
          </Campo>
          <Campo rotulo="Resultado esperado" obrigatorio erro={erros.resultadoEsperado}>
            {(p) => <Textarea {...p} value={f.resultadoEsperado} onChange={(e) => mudar({ resultadoEsperado: e.target.value })} maxLength={600} rows={3} placeholder="Quando marcar Conforme." />}
          </Campo>
          <Campo rotulo="Sinais de não conformidade" obrigatorio erro={erros.sinaisProblema}>
            {(p) => <Textarea {...p} value={f.sinaisProblema} onChange={(e) => mudar({ sinaisProblema: e.target.value })} maxLength={600} rows={3} placeholder="Quando marcar Não conforme." />}
          </Campo>
          <Campo rotulo="Pergunta obrigatória" ajuda={f.obrigatoria ? "Precisa de resposta; Não se aplica pede justificativa." : "Pode ficar sem resposta."}>
            {(p) => <SimNao id={p.id} rotulo="Pergunta obrigatória" valor={f.obrigatoria} aoMudar={(v) => mudar({ obrigatoria: v })} />}
          </Campo>
          <Campo rotulo="Bloqueia a aprovação" ajuda="Não conforme impede liberar e entregar o equipamento.">
            {(p) => <SimNao id={p.id} rotulo="Bloqueia a aprovação" valor={f.bloqueante} aoMudar={(v) => mudar({ bloqueante: v })} />}
          </Campo>
          <Campo rotulo="Quando aplicar" ajuda={DETALHE_APLICACAO[f.aplicacao]}>
            {(p) => (
              <SelecaoPersonalizada
                id={p.id}
                aria-describedby={p["aria-describedby"]}
                valor={f.aplicacao}
                aoMudar={(v) => mudar({ aplicacao: v as Aplicacao })}
                opcoes={APLICACOES.map((x) => ({ valor: x, rotulo: ROTULO_APLICACAO[x] }))}
              />
            )}
          </Campo>
          <div className="grid grid-cols-2 gap-x-5">
            <Campo rotulo="Ordem" erro={erros.ordem} ajuda={pergunta ? undefined : "Vazio: no fim da lista."}>
              {(p) => <Input {...p} value={f.ordem} onChange={(e) => mudar({ ordem: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" autoComplete="off" className="tabular" />}
            </Campo>
            <Campo rotulo="Situação">
              {(p) => <SimNao id={p.id} rotulo="Situação" valor={f.ativa} aoMudar={(v) => mudar({ ativa: v })} rotulos={["Ativa", "Inativa"]} />}
            </Campo>
          </div>
          {kit ? (
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-[13px] leading-5 font-semibold text-titulo">Peças do kit</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {PARTES_KIT.map((parte) => (
                  <label key={parte} className="flex items-center gap-2 text-[13.5px] font-medium text-titulo">
                    <Checkbox
                      checked={f.partes.includes(parte)}
                      onCheckedChange={(v) => mudar({ partes: v === true ? [...f.partes, parte] : f.partes.filter((x) => x !== parte) })}
                    />
                    {ROTULO_PARTE[parte]}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Nenhuma marcada: vale para todas as peças.</p>
            </fieldset>
          ) : null}
          <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground sm:col-span-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Como testar, resultado esperado e sinais de problema aparecem no ícone de informação ao lado da pergunta, no cadastro, na devolução e na entrega.
          </p>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button variant="secondary" disabled={enviando} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Salvando…" onClick={() => void salvar()} data-testid="salvar-pergunta">
            {pergunta ? "Salvar alterações" : "Cadastrar pergunta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
