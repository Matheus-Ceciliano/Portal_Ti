"use client";

import { AlertTriangle, Handshake, Info, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { acaoAlugarEquipamento, acaoEncerrarAluguel } from "@/server/acoes/alugueis";
import type { Resultado } from "@/server/acoes/transferencias";
import type { EmpresaOpcaoInventario } from "../dialogo-equipamento";
import { agoraLocal } from "../visual";
import type { EquipamentoTransferencia } from "./dialogos-transferencia";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]");
const SEM_CONEXAO = { ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." };
const hoje = () => agoraLocal().slice(0, 10);
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

function useConcluir(aoMudar: (v: boolean) => void) {
  const router = useRouter();
  return (r: Resultado, setErro: (e: string | null) => void) => {
    if (!r.ok) {
      setErro(r.erro);
      return false;
    }
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
    return true;
  };
}

function Cabecalho({ icone: Icone, titulo, equipamento }: { icone: typeof Handshake; titulo: string; equipamento: EquipamentoTransferencia }) {
  return (
    <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
      <DialogTitle className="flex items-center gap-2">
        <Icone className="size-5 text-muted-foreground" aria-hidden /> {titulo}
      </DialogTitle>
      <DialogDescription>
        <span className="tabular font-semibold text-titulo">{equipamento.rotulo}</span> · {equipamento.descricao}
      </DialogDescription>
    </DialogHeader>
  );
}

function Resumo({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 px-4 py-3 sm:grid-cols-2">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
          <dd className="font-semibold break-words text-titulo">{valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Aluguel para outra empresa do grupo: a propriedade não muda e nada é entregue a ninguém —
 * a entrega física continua sendo uma alocação, só para colaboradores da locatária.
 */
export function DialogoAlugarEquipamento({
  aberto,
  aoMudar,
  equipamento,
  empresas,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoTransferencia;
  empresas: EmpresaOpcaoInventario[];
}) {
  const concluir = useConcluir(aoMudar);
  const [locatariaId, setLocatariaId] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [devolucao, setDevolucao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [etapa, setEtapa] = useState<"preencher" | "confirmar">("preencher");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());
  const locataria = empresas.find((e) => e.id === locatariaId) ?? null;
  const r = equipamento.responsavel;
  // Quem está com o equipamento só continua com ele se for da locatária (o servidor confere de novo).
  const conflito = r && locataria && r.empresa?.id !== locataria.id;

  function continuar() {
    const e: Record<string, string> = {};
    if (!locatariaId) e.locataria = "Selecione a empresa que vai usar o equipamento.";
    if (!inicio) e.inicio = "Informe a data de início.";
    if (devolucao && inicio && devolucao < inicio) e.devolucao = "A devolução prevista não pode ser anterior ao início.";
    if (!motivo.trim()) e.motivo = "Informe o motivo do aluguel.";
    setErros(e);
    if (Object.keys(e).length) return;
    setErro(null);
    setEtapa("confirmar");
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const res = await acaoAlugarEquipamento({
      ativoId: equipamento.id,
      empresaLocatariaId: locatariaId,
      inicio,
      devolucaoPrevista: devolucao || null,
      motivo,
      observacoes: observacoes || null,
      confirmacao: true,
      empresaAtualId: equipamento.empresa.id,
      chaveRequisicao: chave,
    }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    if (!concluir(res, setErro)) setEtapa("preencher");
  }

  const acompanham = equipamento.carregadores;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-alugar" onInteractOutside={(e) => e.preventDefault()}>
        <Cabecalho icone={Handshake} titulo="Alugar para outra empresa" equipamento={equipamento} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          {etapa === "preencher" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Empresa proprietária">
                  {(p) => (
                    <p id={p.id} className="flex h-10 items-center truncate font-semibold text-titulo">
                      {equipamento.empresa.nome}
                    </p>
                  )}
                </Campo>
                <Campo rotulo="Empresa locatária" obrigatorio erro={erros.locataria || undefined}>
                  {(p) => (
                    <SelecaoPersonalizada
                      id={p.id}
                      aria-describedby={p["aria-describedby"]}
                      invalido={p["aria-invalid"]}
                      valor={locatariaId}
                      aoMudar={(v) => {
                        setLocatariaId(v);
                        setErros((x) => ({ ...x, locataria: "" }));
                      }}
                      opcoes={empresas.filter((e) => e.ativa && e.id !== equipamento.empresa.id).map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.sigla }))}
                      placeholder="Selecione a empresa"
                      pesquisavel
                    />
                  )}
                </Campo>
                <Campo rotulo="Início" obrigatorio erro={erros.inicio || undefined}>
                  {(p) => <Input {...p} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
                </Campo>
                <Campo rotulo="Devolução prevista" erro={erros.devolucao || undefined}>
                  {(p) => <Input {...p} type="date" value={devolucao} min={inicio || undefined} onChange={(e) => setDevolucao(e.target.value)} />}
                </Campo>
              </div>
              {r ? (
                <p
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] text-foreground",
                    conflito ? "border-atencao/30 bg-atencao-fundo" : "border-info/25 bg-info-fundo",
                  )}
                  role="note"
                >
                  {conflito ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />}
                  <span>
                    Está com <strong>{r.nome}</strong>
                    {r.empresa ? ` (${r.empresa.sigla})` : ""}, {r.alocacao}.
                    {conflito ? " Registre a devolução antes: a pessoa não é da empresa locatária." : null}
                  </span>
                </p>
              ) : null}
              <Campo rotulo="Motivo" obrigatorio erro={erros.motivo || undefined}>
                {(p) => (
                  <Textarea
                    {...p}
                    value={motivo}
                    onChange={(e) => {
                      setMotivo(e.target.value);
                      setErros((x) => ({ ...x, motivo: "" }));
                    }}
                    maxLength={500}
                    rows={2}
                  />
                )}
              </Campo>
              <Campo rotulo="Observações">
                {(p) => <Textarea {...p} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} rows={2} />}
              </Campo>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note" data-testid="confirmacao-aluguel">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden />
                <p className="text-[13.5px] text-titulo">
                  <strong className="tabular">{equipamento.rotulo}</strong> continua sendo da <strong>{equipamento.empresa.sigla}</strong>. Enquanto o aluguel valer, só colaboradores da{" "}
                  <strong>{locataria?.sigla}</strong> poderão recebê-lo, por uma alocação.
                </p>
              </div>
              <Resumo
                itens={[
                  ["Proprietária", equipamento.empresa.nome],
                  ["Locatária", locataria?.nome ?? ""],
                  ["Início", dataBr(inicio)],
                  ["Devolução prevista", devolucao ? dataBr(devolucao) : "Sem data"],
                  ["Carregadores que acompanham", acompanham.map((c) => c.nome).join(", ") || "Nenhum"],
                ]}
              />
              <div>
                <p className="text-[12.5px] text-muted-foreground">Motivo</p>
                <p className="text-[13.5px] whitespace-pre-line text-titulo">{motivo.trim()}</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          {etapa === "preencher" ? (
            <>
              <Button type="button" variant="secondary" onClick={() => aoMudar(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={continuar}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" disabled={enviando} onClick={() => setEtapa("preencher")}>
                Voltar
              </Button>
              <Button type="button" carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()}>
                Confirmar aluguel
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Encerramento do aluguel: exige os equipamentos devolvidos; a situação física não muda. */
export function DialogoEncerrarAluguel({
  aberto,
  aoMudar,
  equipamento,
  aluguel,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoTransferencia;
  aluguel: { id: string; empresa: { nome: string; sigla: string }; inicio: string; devolucaoPrevista: string | null };
}) {
  const concluir = useConcluir(aoMudar);
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) {
      setErroMotivo("Informe o motivo do encerramento.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const res = await acaoEncerrarAluguel({ aluguelId: aluguel.id, motivo, ativoId: equipamento.id }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(res, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-encerrar-aluguel" onInteractOutside={(e) => e.preventDefault()}>
        <Cabecalho icone={Undo2} titulo="Encerrar aluguel" equipamento={equipamento} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <Resumo
            itens={[
              ["Proprietária", equipamento.empresa.nome],
              ["Locatária", aluguel.empresa.nome],
              ["Desde", dataBr(aluguel.inicio)],
              ["Devolução prevista", aluguel.devolucaoPrevista ? dataBr(aluguel.devolucaoPrevista) : "Sem data"],
            ]}
          />
          <Campo rotulo="Motivo do encerramento" obrigatorio erro={erroMotivo ?? undefined}>
            {(p) => (
              <Textarea
                {...p}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setErroMotivo(null);
                }}
                maxLength={500}
                rows={3}
              />
            )}
          </Campo>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button type="button" carregando={enviando} rotuloCarregando="Encerrando…" onClick={() => void confirmar()}>
            Encerrar aluguel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
