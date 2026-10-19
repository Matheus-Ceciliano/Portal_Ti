"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { anexarFotos, CampoFotos, type FotosSelecionadas } from "@/components/inventario/campo-fotos";
import { agoraLocal, localParaIso, MiniaturaEquipamento } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_FISICOS, ROTULO_ESTADO_FISICO } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoRegistrarDevolucao } from "@/server/acoes/alocacoes";
import type { DetalheAlocacaoReal } from "@/server/modulos/alocacoes";

type Item = DetalheAlocacaoReal["itens"][number];
type Escolha = { estadoFisico: string; destino: "AVALIACAO" | "MANUTENCAO" | ""; observacoes: string; fotos: FotosSelecionadas };

const DESTINOS = [
  { valor: "AVALIACAO", rotulo: "Avaliação" },
  { valor: "MANUTENCAO", rotulo: "Manutenção" },
];

/**
 * Devolução total ou parcial: marca os equipamentos realmente devolvidos, com estado físico,
 * encaminhamento (avaliação ou manutenção), observações e fotos. Os demais seguem com o
 * colaborador; a alocação e o histórico são preservados.
 */
export function DialogoDevolucao({ dados, aoFechar, aoConcluir }: { dados: DetalheAlocacaoReal; aoFechar: () => void; aoConcluir: () => void }) {
  const abertos = dados.itens.filter((i) => i.aberto);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [recebidaEm, setRecebidaEm] = useState(() => agoraLocal());
  const [observacoes, setObservacoes] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());

  const marcados = abertos.filter((i) => escolhas[i.id]);
  const alternar = (item: Item, sim: boolean) =>
    setEscolhas((e) => {
      const novo = { ...e };
      if (sim) novo[item.id] = { estadoFisico: "BOM", destino: "AVALIACAO", observacoes: "", fotos: {} };
      else delete novo[item.id];
      return novo;
    });
  const mudar = (id: string, parcial: Partial<Escolha>) => {
    setEscolhas((e) => ({ ...e, [id]: { ...e[id], ...parcial } }));
    setErros((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(id))));
  };

  async function registrar() {
    const e: Record<string, string> = {};
    if (!marcados.length) setErroGeral("Marque ao menos um equipamento devolvido.");
    for (const i of marcados) {
      const x = escolhas[i.id];
      if (!x.destino) e[`${i.id}:destino`] = "Escolha o encaminhamento.";
      if (x.destino === "MANUTENCAO" && !x.observacoes.trim()) e[`${i.id}:observacoes`] = "Descreva o problema para a manutenção.";
    }
    setErros(e);
    if (!marcados.length || Object.keys(e).length) return;
    setErroGeral(null);
    setEnviando(true);
    const dadosForm = new FormData();
    dadosForm.set("alocacaoId", dados.id);
    dadosForm.set("recebidaEm", localParaIso(recebidaEm));
    dadosForm.set("observacoes", observacoes);
    dadosForm.set("chaveRequisicao", chave);
    dadosForm.set(
      "itens",
      JSON.stringify(marcados.map((i) => ({ itemId: i.id, estadoFisico: escolhas[i.id].estadoFisico, destino: escolhas[i.id].destino, observacoes: escolhas[i.id].observacoes }))),
    );
    for (const i of marcados) anexarFotos(dadosForm, escolhas[i.id].fotos, () => `foto_${i.id}`);
    const r = await acaoRegistrarDevolucao(dadosForm).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) return setErroGeral(r.erro);
    toast.success(r.mensagem);
    aoFechar();
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent
        className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]")}
        data-testid="dialogo-devolucao"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-5 text-muted-foreground" aria-hidden /> Registrar devolução
          </DialogTitle>
          <DialogDescription>
            {dados.numero} · {dados.colaborador.nome} ·{" "}
            {marcados.length === 0 ? "nenhum equipamento marcado" : marcados.length === abertos.length ? "devolução total" : `devolução parcial (${marcados.length} de ${abertos.length})`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erroGeral ? <AlertaFormulario tom="erro">{erroGeral}</AlertaFormulario> : null}
          <ul className="flex flex-col gap-3">
            {abertos.map((i) => {
              const x = escolhas[i.id];
              const nome = i.ativo.nome ?? i.ativo.patrimonio ?? i.ativo.modelo;
              return (
                <li key={i.id} className={cn("rounded-xl border", x && "border-primary/40")}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                    <Checkbox checked={Boolean(x)} onCheckedChange={(v) => alternar(i, v === true)} aria-label={`Devolvido: ${nome}`} />
                    <MiniaturaEquipamento url={i.ativo.miniatura} categoria={i.ativo.categoria} />
                    <span className="min-w-0">
                      <span className="tabular block truncate font-semibold text-titulo">{nome}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {i.ativo.rotuloCategoria} · {i.ativo.marca} {i.ativo.modelo}
                      </span>
                    </span>
                  </label>
                  {x ? (
                    <div className="grid gap-x-4 gap-y-3 border-t px-4 py-3 sm:grid-cols-2">
                      <Campo rotulo="Estado físico" obrigatorio>
                        {(p) => (
                          <SelecaoPersonalizada
                            id={p.id}
                            valor={x.estadoFisico}
                            aoMudar={(v) => mudar(i.id, { estadoFisico: v })}
                            opcoes={ESTADOS_FISICOS.map((e) => ({ valor: e, rotulo: ROTULO_ESTADO_FISICO[e] }))}
                          />
                        )}
                      </Campo>
                      <Campo rotulo="Encaminhamento" obrigatorio erro={erros[`${i.id}:destino`]}>
                        {(p) => (
                          <SelecaoPersonalizada
                            id={p.id}
                            aria-describedby={p["aria-describedby"]}
                            invalido={p["aria-invalid"]}
                            valor={x.destino}
                            aoMudar={(v) => mudar(i.id, { destino: v as Escolha["destino"] })}
                            opcoes={DESTINOS}
                          />
                        )}
                      </Campo>
                      <Campo rotulo="Observações" obrigatorio={x.destino === "MANUTENCAO"} erro={erros[`${i.id}:observacoes`]} className="sm:col-span-2">
                        {(p) => <Textarea {...p} value={x.observacoes} onChange={(e) => mudar(i.id, { observacoes: e.target.value })} maxLength={1000} rows={2} className="min-h-10" />}
                      </Campo>
                      <div className="sm:col-span-2">
                        <CampoFotos tipos={["OUTRA"]} valor={x.fotos} aoMudar={(f) => mudar(i.id, { fotos: f })} compacto rotulo={`Fotos da devolução: ${nome}`} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[220px_1fr]">
            <Campo rotulo="Data e hora da devolução" obrigatorio>
              {(p) => <Input {...p} type="datetime-local" value={recebidaEm} max={agoraLocal()} onChange={(e) => setRecebidaEm(e.target.value)} />}
            </Campo>
            <Campo rotulo="Observações gerais">
              {(p) => <Textarea {...p} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} rows={2} className="min-h-10" />}
            </Campo>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button variant="secondary" disabled={enviando} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void registrar()}>
            Registrar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
