"use client";

import { AlertTriangle, CheckCircle2, Wrench, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { acaoConcluirManutencao, acaoEnviarManutencao, type EstadoInventario } from "@/server/acoes/inventario";
import { anexarFotos, CampoFotos, type FotosSelecionadas } from "./campo-fotos";
import { agoraLocal, formatarDataHora, localParaIso } from "./visual";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]");

/** Resposta da ação: aviso, atualização da tela e fechamento (uma vez por resposta). */
function useSucesso(estado: EstadoInventario, aoConcluir: () => void) {
  const router = useRouter();
  const tratado = useRef<EstadoInventario | null>(null);
  useEffect(() => {
    if (!estado.ok || tratado.current === estado) return;
    tratado.current = estado;
    toast.success(estado.mensagem);
    router.refresh();
    aoConcluir();
  }, [estado, router, aoConcluir]);
}

export type EquipamentoManutencao = {
  id: string;
  rotulo: string;
  /** Colaborador com o equipamento (alocação ativa), se houver. */
  responsavel: { nome: string; alocacao: string } | null;
};

/**
 * Envio para manutenção. Abrir o formulário não muda nada. Com alocação ativa, a baixa da
 * alocação só acontece com o recolhimento físico confirmado; data, operador e motivo vão
 * para o histórico. O TER já assinado não é alterado.
 */
export function DialogoEnviarManutencao({ aberto, aoMudar, equipamento }: { aberto: boolean; aoMudar: (v: boolean) => void; equipamento: EquipamentoManutencao }) {
  const [estado, despachar, pendente] = useActionState<EstadoInventario, FormData>(acaoEnviarManutencao, {});
  const [fotos, setFotos] = useState<FotosSelecionadas>({});
  const [recolhido, setRecolhido] = useState(false);
  const [recolhidoEm, setRecolhidoEm] = useState(() => agoraLocal());
  const [erros, setErros] = useState<Record<string, string>>({});
  useSucesso(estado, () => aoMudar(false));
  const r = equipamento.responsavel;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendente) return;
    const dados = new FormData(evento.currentTarget);
    const e: Record<string, string> = {};
    if (!String(dados.get("motivo") ?? "").trim()) e.motivo = "Informe o motivo da manutenção.";
    if (!String(dados.get("observacoes") ?? "").trim()) e.observacoes = "Informe as observações.";
    if (r && !recolhido) e.confirmarRecolhimento = `Confirme o recolhimento físico com ${r.nome}.`;
    setErros(e);
    if (Object.keys(e).length) return;
    if (r) {
      dados.set("confirmarRecolhimento", "sim");
      dados.set("recolhidoEm", localParaIso(recolhidoEm));
    }
    anexarFotos(dados, fotos);
    startTransition(() => despachar(dados));
  }
  const erro = (c: string) => erros[c] ?? estado.erros?.[c];

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-enviar-manutencao" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-manual" aria-hidden /> Enviar para manutenção
          </DialogTitle>
          <DialogDescription>{equipamento.rotulo}</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="ativoId" value={equipamento.id} />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
            {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
            {r ? (
              <div className="rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note" data-testid="aviso-alocacao-ativa">
                <p className="flex items-center gap-2 font-semibold text-titulo">
                  <AlertTriangle className="size-4 text-atencao" aria-hidden /> Alocação ativa
                </p>
                <p className="mt-1 text-[13px] text-foreground">
                  Este equipamento está com <strong>{r.nome}</strong> ({r.alocacao}). A alocação só é encerrada depois da confirmação do recolhimento físico.
                </p>
                <label className="mt-3 flex items-start gap-2.5 text-[13.5px] font-medium text-titulo">
                  <Checkbox checked={recolhido} onCheckedChange={(v) => setRecolhido(v === true)} aria-invalid={erro("confirmarRecolhimento") ? true : undefined} className="mt-0.5" />
                  Confirmo que o equipamento foi recolhido fisicamente de {r.nome}.
                </label>
                {erro("confirmarRecolhimento") ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erro("confirmarRecolhimento")}</p> : null}
                <div className="mt-3 max-w-60">
                  <Campo rotulo="Data e hora do recolhimento">
                    {(p) => <Input {...p} type="datetime-local" value={recolhidoEm} max={agoraLocal()} onChange={(e) => setRecolhidoEm(e.target.value)} />}
                  </Campo>
                </div>
              </div>
            ) : null}
            <Campo rotulo="Motivo da manutenção" obrigatorio erro={erro("motivo")}>
              {(p) => <Input {...p} name="motivo" maxLength={200} autoComplete="off" placeholder="Ex.: tela trincada" />}
            </Campo>
            <Campo rotulo="Observações" obrigatorio erro={erro("observacoes")}>
              {(p) => <Textarea {...p} name="observacoes" maxLength={1000} rows={3} />}
            </Campo>
            <CampoFotos tipos={["OUTRA"]} valor={fotos} aoMudar={setFotos} erro={erro("fotos")} compacto rotulo="Fotos da manutenção" />
            <p className="text-[12.5px] text-muted-foreground">Abertura registrada agora, em seu nome.</p>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="secondary" disabled={pendente} onClick={() => aoMudar(false)}>
              Cancelar
            </Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Registrando…">
              Registrar manutenção
            </BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ManutencaoAberta = { id: string; ativoId: string; rotulo: string; motivo: string; abertaEm: string };

/** Conclusão: reparado volta a ficar disponível; sem reparo é baixado. Nenhuma alocação é criada. */
export function DialogoConcluirManutencao({ aberto, aoMudar, manutencao }: { aberto: boolean; aoMudar: (v: boolean) => void; manutencao: ManutencaoAberta }) {
  const [estado, despachar, pendente] = useActionState<EstadoInventario, FormData>(acaoConcluirManutencao, {});
  const [resultado, setResultado] = useState<"REPARADO" | "SEM_REPARO" | "">("");
  const [fotos, setFotos] = useState<FotosSelecionadas>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  useSucesso(estado, () => aoMudar(false));

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendente) return;
    const dados = new FormData(evento.currentTarget);
    const e: Record<string, string> = {};
    if (!resultado) e.resultado = "Informe o resultado da manutenção.";
    if (!String(dados.get("servicoRealizado") ?? "").trim()) e.servicoRealizado = "Descreva o serviço realizado.";
    setErros(e);
    if (Object.keys(e).length) return;
    anexarFotos(dados, fotos);
    startTransition(() => despachar(dados));
  }
  const erro = (c: string) => erros[c] ?? estado.erros?.[c];
  const opcoes = [
    { valor: "REPARADO" as const, titulo: "Reparado", texto: "Volta a ficar disponível.", icone: CheckCircle2, tom: "text-sucesso" },
    { valor: "SEM_REPARO" as const, titulo: "Sem reparo", texto: "O equipamento é baixado.", icone: XCircle, tom: "text-erro" },
  ];

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-concluir-manutencao" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle>Concluir manutenção</DialogTitle>
          <DialogDescription>
            {manutencao.rotulo} · aberta em {formatarDataHora(manutencao.abertaEm)} · {manutencao.motivo}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="manutencaoId" value={manutencao.id} />
          <input type="hidden" name="ativoId" value={manutencao.ativoId} />
          <input type="hidden" name="resultado" value={resultado} />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
            {estado.erro ? <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario> : null}
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-titulo">
                Resultado<span className="font-medium text-muted-foreground" aria-hidden> *</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-invalid={erro("resultado") ? true : undefined}>
                {opcoes.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={resultado === o.valor}
                    onClick={() => setResultado(o.valor)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      resultado === o.valor && "border-primary bg-accent/70 dark:border-link",
                    )}
                  >
                    <o.icone className={cn("mt-0.5 size-4 shrink-0", o.tom)} aria-hidden />
                    <span>
                      <span className="block font-semibold text-titulo">{o.titulo}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{o.texto}</span>
                    </span>
                  </button>
                ))}
              </div>
              {erro("resultado") ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erro("resultado")}</p> : null}
            </fieldset>
            <Campo rotulo="Serviço realizado" obrigatorio erro={erro("servicoRealizado")}>
              {(p) => <Textarea {...p} name="servicoRealizado" maxLength={1000} rows={3} />}
            </Campo>
            <CampoFotos tipos={["OUTRA"]} valor={fotos} aoMudar={setFotos} erro={erro("fotos")} compacto rotulo="Fotos da conclusão" />
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="secondary" disabled={pendente} onClick={() => aoMudar(false)}>
              Cancelar
            </Button>
            <BotaoPendente pendente={pendente} rotuloPendente="Concluindo…">
              Concluir manutenção
            </BotaoPendente>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
