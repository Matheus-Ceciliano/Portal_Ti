"use client";

import { Plus, PlugZap, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { Estado } from "@/components/comum/status-badge";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVOS_CARREGADOR, nomeCarregador, ROTULO_MOTIVO_CARREGADOR, situacaoAposDesvinculo, ROTULO_SITUACAO } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoAdicionarCarregador, acaoDesvincularCarregador } from "@/server/acoes/inventario";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { formatarDataHora } from "../visual";

type Carregador = FichaEquipamento["carregadores"][number];

/**
 * Carregadores do notebook: o principal nasce com o notebook (C1); os adicionais seguem a
 * sequência (C2, C3...). Troca, perda ou defeito encerram o vínculo e ficam no histórico.
 */
export function CarregadoresFicha({ ficha, podeEditar }: { ficha: FichaEquipamento; podeEditar: boolean }) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState(false);
  const [alvo, setAlvo] = useState<Carregador | null>(null);
  const vinculados = ficha.carregadores.filter((c) => !c.desvinculadoEm);
  const antigos = ficha.carregadores.filter((c) => c.desvinculadoEm);
  const proximo = ficha.nome ? nomeCarregador(ficha.nome, Math.max(0, ...ficha.carregadores.map((c) => c.sequencia)) + 1) : null;

  async function adicionar() {
    setAdicionando(true);
    const r = await acaoAdicionarCarregador(ficha.id).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setAdicionando(false);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(r.mensagem);
    router.refresh();
  }

  const linha = (c: Carregador) => (
    <li key={c.id} className="flex items-center gap-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground" aria-hidden>
        <PlugZap className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <Link href={`/ti/inventario/${c.id}`} className="tabular block truncate font-semibold text-titulo underline-offset-4 hover:underline">
          {c.nome}
        </Link>
        <span className="block truncate text-[12.5px] text-muted-foreground">
          {c.desvinculadoEm
            ? `${ROTULO_MOTIVO_CARREGADOR[c.motivoDesvinculo!]} em ${formatarDataHora(c.desvinculadoEm)}`
            : c.sequencia === Math.min(...vinculados.map((v) => v.sequencia))
              ? "Principal"
              : "Adicional"}
        </span>
      </span>
      <Estado grupo="ativo" valor={c.situacao} />
      {podeEditar && !c.desvinculadoEm && c.situacao !== "RESERVADO" && c.situacao !== "MANUTENCAO" && c.situacao !== "BAIXADO" ? (
        <Button variant="ghost" size="icon-sm" aria-label={`Registrar troca, perda ou defeito de ${c.nome}`} onClick={() => setAlvo(c)}>
          <RefreshCw aria-hidden />
        </Button>
      ) : null}
    </li>
  );

  return (
    <div data-testid="carregadores">
      {vinculados.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum carregador vinculado.</p>
      ) : (
        <ul className="divide-y">{vinculados.map(linha)}</ul>
      )}
      {antigos.length ? (
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Carregadores anteriores ({antigos.length})</summary>
          <ul className="divide-y">{antigos.map(linha)}</ul>
        </details>
      ) : null}
      {podeEditar && ficha.situacao !== "BAIXADO" && proximo ? (
        <Button variant="secondary" size="sm" className="mt-3" carregando={adicionando} rotuloCarregando="Vinculando…" onClick={() => void adicionar()}>
          <Plus aria-hidden /> {vinculados.length ? `Adicionar carregador (${proximo})` : `Criar carregador principal (${proximo})`}
        </Button>
      ) : null}
      {alvo ? (
        <DialogoDesvinculo
          key={alvo.id}
          carregador={alvo}
          notebookId={ficha.id}
          ultimo={vinculados.length === 1}
          proximo={proximo}
          entregueA={ficha.responsavel?.nome ?? null}
          aoFechar={() => setAlvo(null)}
        />
      ) : null}
    </div>
  );
}

function DialogoDesvinculo({
  carregador,
  notebookId,
  ultimo,
  proximo,
  entregueA,
  aoFechar,
}: {
  carregador: Carregador;
  notebookId: string;
  /** Último carregador vinculado: o substituto é obrigatório. */
  ultimo: boolean;
  proximo: string | null;
  entregueA: string | null;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [substituir, setSubstituir] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const destino = motivo ? ROTULO_SITUACAO[situacaoAposDesvinculo(motivo as (typeof MOTIVOS_CARREGADOR)[number])] : null;

  async function confirmar() {
    if (!motivo) return setErro("Selecione o motivo.");
    if (!observacao.trim()) return setErro("Descreva o que aconteceu com o carregador.");
    setEnviando(true);
    const r = await acaoDesvincularCarregador(
      { carregadorId: carregador.id, motivo: motivo as "TROCA", observacao, substituir: ultimo || substituir },
      notebookId,
    ).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(r.mensagem);
    router.refresh();
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[560px]")} data-testid="dialogo-carregador">
        <DialogHeader>
          <DialogTitle>Troca, perda ou defeito</DialogTitle>
          <DialogDescription>
            {carregador.nome}
            {entregueA && carregador.situacao === "ALOCADO" ? ` · com ${entregueA}` : ""}
          </DialogDescription>
        </DialogHeader>
        {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
        <Campo rotulo="Motivo" obrigatorio ajuda={destino ? `O carregador ${carregador.nome} fica "${destino.toLowerCase()}" e o vínculo é encerrado.` : undefined}>
          {(p) => (
            <SelecaoPersonalizada
              id={p.id}
              aria-describedby={p["aria-describedby"]}
              valor={motivo}
              aoMudar={setMotivo}
              opcoes={MOTIVOS_CARREGADOR.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_CARREGADOR[m] }))}
              placeholder="Selecione"
            />
          )}
        </Campo>
        <Campo rotulo="O que aconteceu" obrigatorio>
          {(p) => <Textarea {...p} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} rows={3} />}
        </Campo>
        <label className={cn("flex items-start gap-2.5 text-[13.5px]", ultimo && "opacity-80")}>
          <Checkbox checked={ultimo || substituir} disabled={ultimo} onCheckedChange={(v) => setSubstituir(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium text-titulo">Vincular substituto{proximo ? ` (${proximo})` : ""}</span>
            <span className="block text-[12.5px] text-muted-foreground">
              {ultimo ? "Obrigatório: o notebook precisa de um carregador principal." : "O novo carregador entra no lugar deste."}
              {entregueA && carregador.situacao === "ALOCADO" ? ` Fica com ${entregueA}, na mesma alocação.` : ""}
            </span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
