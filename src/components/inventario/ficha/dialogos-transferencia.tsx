"use client";

import { AlertTriangle, ArrowLeftRight, Building2, CalendarClock, Info, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { errosVerificacao, montarVerificacoes, useCondicoesEntrega, VerificacaoCondicoes, type Decisoes } from "@/components/inspecoes/verificacao-entrega";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  acaoCancelarTransferencia,
  acaoColaboradoresTransferencia,
  acaoConfirmarTransferencia,
  acaoTransferirColaborador,
  acaoTransferirEmpresa,
  type Resultado,
} from "@/server/acoes/transferencias";
import type { ColaboradorTransferencia } from "@/server/modulos/transferencias";
import type { EmpresaOpcaoInventario } from "../dialogo-equipamento";
import { agoraLocal, formatarDataHora, localParaIso } from "../visual";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]");
const SEM_CONEXAO = { ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." };
const hoje = () => agoraLocal().slice(0, 10);
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

export type EquipamentoTransferencia = {
  id: string;
  rotulo: string;
  descricao: string;
  empresa: { id: string; nome: string; sigla: string };
  /** Quem está com o equipamento (alocação ativa); nulo: em estoque. */
  responsavel: { id: string; nome: string; alocacao: string; alocacaoId: string; empresa?: { id: string; nome: string; sigla: string } } | null;
  /** Empresa que pode receber o equipamento: a locatária (aluguel vigente) ou a proprietária. */
  empresaAutorizada: { id: string; nome: string; sigla: string };
  /** Carregadores vinculados (não desvinculados). */
  carregadores: { id: string; nome: string | null; patrimonio: string | null; situacao: string }[];
};

/** Resposta da ação: aviso, atualização da tela e fechamento (e `aoConcluir`, de quem abriu o diálogo). */
function useConcluir(aoMudar: (v: boolean) => void, aoConcluir?: () => void) {
  const router = useRouter();
  return (r: Resultado, setErro: (e: string | null) => void) => {
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
    aoConcluir?.();
  };
}

function Cabecalho({ icone: Icone, titulo, equipamento }: { icone: typeof Building2; titulo: string; equipamento: EquipamentoTransferencia }) {
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
          <dd className="font-semibold break-words text-titulo">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Confirmação explícita (caixa de seleção) com a mensagem de erro logo abaixo. */
function Confirmacao({ marcado, aoMudar, erro, children }: { marcado: boolean; aoMudar: (v: boolean) => void; erro?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-atencao/30 bg-atencao-fundo p-4">
      <label className="flex items-start gap-2.5 text-[13.5px] font-medium text-titulo">
        <Checkbox checked={marcado} onCheckedChange={(v) => aoMudar(v === true)} aria-invalid={erro ? true : undefined} className="mt-0.5" />
        <span>{children}</span>
      </label>
      {erro ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erro}</p> : null}
    </div>
  );
}

/* Entre colaboradores */

/**
 * Transferência de colaborador. Com entrega física: encerra a alocação anterior e cria a nova
 * na mesma operação, com a mesma verificação técnica de uma nova alocação (cada item entregue
 * confirma a última inspeção ou passa por uma nova). Sem entrega: só a reserva, e a custódia
 * atual continua (Q-27). Em estoque, é a entrega ou a reserva de uma nova alocação.
 */
export function DialogoTransferirColaborador({
  aberto,
  aoMudar,
  equipamento,
  podeEntregar,
  aoConcluir,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoTransferencia;
  podeEntregar: boolean;
  aoConcluir?: () => void;
}) {
  const concluir = useConcluir(aoMudar, aoConcluir);
  const r = equipamento.responsavel;
  const [colaboradores, setColaboradores] = useState<ColaboradorTransferencia[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [colaboradorId, setColaboradorId] = useState("");
  const [modo, setModo] = useState<"ENTREGAR" | "RESERVAR">(podeEntregar ? "ENTREGAR" : "RESERVAR");
  const [quando, setQuando] = useState(() => agoraLocal());
  const [prevista, setPrevista] = useState(() => hoje());
  const [observacoes, setObservacoes] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());
  const [decisoes, setDecisoes] = useState<Decisoes>({});
  const [errosCondicao, setErrosCondicao] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    acaoColaboradoresTransferencia()
      .then((x) => {
        if (!vivo) return;
        if (x.ok) setColaboradores(x.dados);
        else setErroCarga(x.erro);
      })
      .catch(() => vivo && setErroCarga(SEM_CONEXAO.erro));
    return () => {
      vivo = false;
    };
  }, [aberto, tentativa]);

  const novo = colaboradores?.find((c) => c.id === colaboradorId) ?? null;
  const entregar = modo === "ENTREGAR";
  // Carregadores entregues com o notebook (ou disponíveis, saindo do estoque) acompanham a transferência.
  const acompanham = equipamento.carregadores.filter((c) => c.situacao === (r ? "ALOCADO" : "DISPONIVEL"));
  // Entrega física: cada item entregue (o equipamento e os carregadores) passa pela verificação técnica.
  const verificar = entregar && Boolean(r);
  const { condicoes, erro: erroCondicoes, recarregar } = useCondicoesEntrega([equipamento.id, ...acompanham.map((c) => c.id)], aberto && verificar);

  async function confirmar() {
    const e: Record<string, string> = {};
    if (!colaboradorId) e.colaborador = "Selecione o novo colaborador.";
    if (entregar && !quando) e.data = "Informe a data da transferência.";
    if (!entregar && prevista && prevista < hoje()) e.data = "A data prevista não pode estar no passado.";
    if (entregar && r && !confirmado) e.confirmacao = "Confirme a devolução e a entrega física do equipamento.";
    const condicao = verificar && condicoes ? errosVerificacao(condicoes, decisoes) : {};
    setErrosCondicao(condicao);
    if (Object.keys(condicao).length) e.verificacao = "Confirme a condição de cada equipamento antes da entrega.";
    setErros(e);
    setErro(e.verificacao ?? null);
    if (Object.keys(e).length || (verificar && !condicoes)) return;
    const envio = verificar && condicoes ? montarVerificacoes(condicoes, decisoes) : null;
    setEnviando(true);
    setErro(null);
    const res = await acaoTransferirColaborador(
      {
        ativoId: equipamento.id,
        colaboradorId,
        modo,
        data: entregar ? localParaIso(quando) : prevista || null,
        observacoes: observacoes || null,
        confirmacaoFisica: entregar && Boolean(r) ? confirmado : undefined,
        alocacaoAtualId: r?.alocacaoId ?? null,
        chaveRequisicao: chave,
        verificacoes: envio?.verificacoes,
      },
      envio?.anexos,
    ).catch(() => SEM_CONEXAO);
    setEnviando(false);
    if (!res.ok && /inspeç|condição/i.test(res.erro)) recarregar();
    concluir(res, setErro);
  }

  const opcoesModo = [
    {
      valor: "ENTREGAR" as const,
      titulo: r ? "Entrega física agora" : "Entregar agora",
      texto: r ? "Encerra a alocação atual e cria a nova." : "O colaborador passa a ser responsável.",
      icone: PackageCheck,
      desabilitado: !podeEntregar,
    },
    {
      valor: "RESERVAR" as const,
      titulo: r ? "Reservar transferência" : "Reservar",
      texto: r ? `A custódia continua com ${r.nome} até a entrega.` : "Ninguém fica responsável até a entrega.",
      icone: CalendarClock,
      desabilitado: false,
    },
  ];

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-transferir-colaborador" onInteractOutside={(e) => e.preventDefault()}>
        <Cabecalho icone={ArrowLeftRight} titulo="Transferir colaborador" equipamento={equipamento} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <Resumo
            itens={[
              ["Equipamento", <span key="e" className="tabular">{equipamento.rotulo}</span>],
              ["Colaborador atual", r ? `${r.nome} · ${r.alocacao}` : "Nenhum (em estoque)"],
            ]}
          />
          {acompanham.length ? (
            <p className="-mt-1 text-[13px] text-muted-foreground">
              Acompanha{acompanham.length > 1 ? "m" : ""}: <span className="tabular font-medium text-foreground">{acompanham.map((c) => c.nome).join(", ")}</span>
            </p>
          ) : null}

          <Campo rotulo="Novo colaborador" obrigatorio erro={erros.colaborador || erroCarga || undefined}>
            {(p) =>
              colaboradores ? (
                <SelecaoPersonalizada
                  id={p.id}
                  aria-describedby={p["aria-describedby"]}
                  invalido={p["aria-invalid"]}
                  valor={colaboradorId}
                  aoMudar={(v) => {
                    setColaboradorId(v);
                    setErros((x) => ({ ...x, colaborador: "" }));
                  }}
                  // Só colaboradores da empresa que pode usar o equipamento (proprietária ou locatária);
                  // o atual não aparece: transferir para ele mesmo não é permitido.
                  opcoes={colaboradores
                    .filter((c) => c.id !== r?.id && c.empresa.id === equipamento.empresaAutorizada.id)
                    .map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: c.empresa.sigla }))}
                  placeholder="Selecione o colaborador"
                  pesquisavel
                />
              ) : erroCarga ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setErroCarga(null);
                    setTentativa((t) => t + 1);
                  }}
                  className="w-full justify-start"
                  id={p.id}
                >
                  Tentar novamente
                </Button>
              ) : (
                <Skeleton className="h-11 rounded-lg lg:h-10" aria-label="Carregando colaboradores" />
              )
            }
          </Campo>

          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-titulo">Entrega</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Entrega">
              {opcoesModo.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={modo === o.valor}
                  disabled={o.desabilitado}
                  onClick={() => {
                    setModo(o.valor);
                    setErros((x) => ({ ...x, data: "", confirmacao: "" }));
                  }}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    modo === o.valor && "border-primary bg-accent/70 dark:border-link",
                  )}
                >
                  <o.icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block font-semibold text-titulo">{o.titulo}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{o.texto}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {entregar ? (
              <Campo rotulo="Data e hora da transferência" obrigatorio erro={erros.data || undefined}>
                {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
              </Campo>
            ) : (
              <Campo rotulo="Data prevista" erro={erros.data || undefined}>
                {(p) => <Input {...p} type="date" value={prevista} min={hoje()} onChange={(e) => setPrevista(e.target.value)} />}
              </Campo>
            )}
          </div>

          {verificar ? (
            <VerificacaoCondicoes
              condicoes={condicoes}
              erro={erroCondicoes}
              aoTentarDeNovo={recarregar}
              decisoes={decisoes}
              aoMudar={(id, d) => {
                setDecisoes((x) => ({ ...x, [id]: d }));
                setErrosCondicao((x) => ({ ...x, [id]: "" }));
              }}
              erros={errosCondicao}
            />
          ) : null}

          <Campo rotulo="Observação ou motivo">
            {(p) => <Textarea {...p} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} rows={2} />}
          </Campo>

          {entregar && r ? (
            <Confirmacao
              marcado={confirmado}
              aoMudar={(v) => {
                setConfirmado(v);
                setErros((x) => ({ ...x, confirmacao: "" }));
              }}
              erro={erros.confirmacao || undefined}
            >
              Confirmo que {r.nome} devolveu o equipamento e que ele foi entregue fisicamente a {novo?.nome ?? "o novo colaborador"}.
            </Confirmacao>
          ) : null}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button type="button" carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()} disabled={!colaboradores || (verificar && !condicoes)}>
            {entregar ? "Confirmar transferência" : "Reservar transferência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Transferência reservada: confirmar a entrega física ou cancelar */

export type TransferenciaReservada = { id: string; colaborador: { id: string; nome: string }; previstaPara: string | null };

export function DialogoConfirmarTransferencia({
  aberto,
  aoMudar,
  equipamento,
  transferencia,
  aoConcluir,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoTransferencia;
  transferencia: TransferenciaReservada;
  aoConcluir?: () => void;
}) {
  const concluir = useConcluir(aoMudar, aoConcluir);
  const r = equipamento.responsavel;
  const [quando, setQuando] = useState(() => agoraLocal());
  const [confirmado, setConfirmado] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [decisoes, setDecisoes] = useState<Decisoes>({});
  const [errosCondicao, setErrosCondicao] = useState<Record<string, string>>({});
  // A entrega física da reserva tem a mesma verificação técnica de uma nova alocação.
  const entregues = [equipamento.id, ...equipamento.carregadores.filter((c) => c.situacao === "ALOCADO").map((c) => c.id)];
  const { condicoes, erro: erroCondicoes, recarregar } = useCondicoesEntrega(entregues, aberto);

  async function confirmar() {
    if (!condicoes) return;
    const condicao = errosVerificacao(condicoes, decisoes);
    setErrosCondicao(condicao);
    setErro(Object.keys(condicao).length ? "Confirme a condição de cada equipamento antes da entrega." : null);
    if (!confirmado) setErroConfirmacao("Confirme a devolução e a entrega física do equipamento.");
    if (!confirmado || Object.keys(condicao).length) return;
    const { verificacoes, anexos } = montarVerificacoes(condicoes, decisoes);
    setEnviando(true);
    setErro(null);
    const res = await acaoConfirmarTransferencia(
      { ativoId: equipamento.id, transferenciaId: transferencia.id, data: localParaIso(quando), confirmacaoFisica: true, verificacoes },
      anexos,
    ).catch(() => SEM_CONEXAO);
    setEnviando(false);
    if (!res.ok && /inspeç|condição/i.test(res.erro)) recarregar();
    concluir(res, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-confirmar-transferencia" onInteractOutside={(e) => e.preventDefault()}>
        <Cabecalho icone={PackageCheck} titulo="Confirmar transferência" equipamento={equipamento} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <Resumo
            itens={[
              ["Colaborador atual", r ? `${r.nome} · ${r.alocacao}` : "Nenhum"],
              ["Novo colaborador", transferencia.colaborador.nome],
            ]}
          />
          <div className="max-w-60">
            <Campo rotulo="Data e hora da transferência" obrigatorio>
              {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
            </Campo>
          </div>
          <VerificacaoCondicoes
            condicoes={condicoes}
            erro={erroCondicoes}
            aoTentarDeNovo={recarregar}
            decisoes={decisoes}
            aoMudar={(id, d) => {
              setDecisoes((x) => ({ ...x, [id]: d }));
              setErrosCondicao((x) => ({ ...x, [id]: "" }));
            }}
            erros={errosCondicao}
          />
          <Confirmacao
            marcado={confirmado}
            aoMudar={(v) => {
              setConfirmado(v);
              setErroConfirmacao(null);
            }}
            erro={erroConfirmacao ?? undefined}
          >
            Confirmo que {r?.nome ?? "o colaborador atual"} devolveu o equipamento e que ele foi entregue fisicamente a {transferencia.colaborador.nome}.
          </Confirmacao>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button type="button" carregando={enviando} rotuloCarregando="Registrando…" disabled={!condicoes} onClick={() => void confirmar()}>
            Confirmar transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoCancelarTransferencia({
  aberto,
  aoMudar,
  equipamento,
  transferencia,
  aoConcluir,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  equipamento: EquipamentoTransferencia;
  transferencia: TransferenciaReservada;
  aoConcluir?: () => void;
}) {
  const concluir = useConcluir(aoMudar, aoConcluir);
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) {
      setErroMotivo("Informe o motivo do cancelamento.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const res = await acaoCancelarTransferencia({ ativoId: equipamento.id, transferenciaId: transferencia.id, motivo }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(res, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]")} data-testid="dialogo-cancelar-transferencia">
        <DialogHeader>
          <DialogTitle>Cancelar transferência</DialogTitle>
          <DialogDescription>
            {equipamento.rotulo} continua com {equipamento.responsavel?.nome ?? "o colaborador atual"}; a reserva para {transferencia.colaborador.nome} é encerrada.
          </DialogDescription>
        </DialogHeader>
        {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
        <Campo rotulo="Motivo do cancelamento" obrigatorio erro={erroMotivo ?? undefined}>
          {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} />}
        </Campo>
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button variant="destructive" carregando={enviando} rotuloCarregando="Cancelando…" onClick={() => void confirmar()}>
            Cancelar transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Entre empresas */

/**
 * Transferência entre empresas em duas etapas: dados e confirmação explícita. Muda só a
 * proprietária; quem está com o equipamento continua o mesmo. Carregadores sem patrimônio
 * acompanham o notebook; os com patrimônio próprio só mudam se marcados.
 */
export function DialogoTransferirEmpresa({
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
  const r = equipamento.responsavel;
  const [destinoId, setDestinoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [quando, setQuando] = useState(() => agoraLocal());
  const [comPatrimonio, setComPatrimonio] = useState<string[]>([]);
  const [etapa, setEtapa] = useState<"preencher" | "confirmar">("preencher");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());

  const destino = empresas.find((e) => e.id === destinoId) ?? null;
  const acompanham = equipamento.carregadores.filter((c) => !c.patrimonio);
  const proprios = equipamento.carregadores.filter((c) => c.patrimonio);

  function continuar() {
    const e: Record<string, string> = {};
    if (!destinoId) e.destino = "Selecione a empresa de destino.";
    if (!motivo.trim()) e.motivo = "Informe o motivo da transferência.";
    if (!quando) e.data = "Informe a data da transferência.";
    setErros(e);
    if (Object.keys(e).length) return;
    setErro(null);
    setEtapa("confirmar");
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const res = await acaoTransferirEmpresa({
      ativoId: equipamento.id,
      empresaDestinoId: destinoId,
      motivo,
      data: localParaIso(quando),
      confirmacao: true,
      empresaAtualId: equipamento.empresa.id,
      carregadoresComPatrimonio: comPatrimonio,
      chaveRequisicao: chave,
    }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    if (!res.ok) setEtapa("preencher");
    concluir(res, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-transferir-empresa" onInteractOutside={(e) => e.preventDefault()}>
        <Cabecalho icone={Building2} titulo="Transferir empresa" equipamento={equipamento} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          {etapa === "preencher" ? (
            <>
              <Resumo
                itens={[
                  ["Equipamento", <span key="e" className="tabular">{equipamento.rotulo}</span>],
                  ["Empresa proprietária atual", equipamento.empresa.nome],
                ]}
              />
              {r ? (
                <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-fundo px-3.5 py-2.5 text-[13px] text-foreground" role="note">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                  <span>
                    Está com <strong>{r.nome}</strong>
                    {r.empresa ? ` (${r.empresa.sigla})` : ""}, {r.alocacao}. A propriedade só pode passar para a empresa dessa pessoa; para outra, registre a devolução antes.
                  </span>
                </p>
              ) : null}
              <Campo rotulo="Empresa de destino" obrigatorio erro={erros.destino || undefined}>
                {(p) => (
                  <SelecaoPersonalizada
                    id={p.id}
                    aria-describedby={p["aria-describedby"]}
                    invalido={p["aria-invalid"]}
                    valor={destinoId}
                    aoMudar={(v) => {
                      setDestinoId(v);
                      setErros((x) => ({ ...x, destino: "" }));
                    }}
                    opcoes={empresas.filter((e) => e.ativa && e.id !== equipamento.empresa.id).map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.sigla }))}
                    placeholder="Selecione a empresa"
                    pesquisavel
                  />
                )}
              </Campo>
              <Campo rotulo="Motivo da transferência" obrigatorio erro={erros.motivo || undefined}>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Data e hora da transferência" obrigatorio erro={erros.data || undefined}>
                  {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
                </Campo>
              </div>
              {equipamento.carregadores.length ? (
                <fieldset className="rounded-xl border px-4 py-3">
                  <legend className="px-1 text-[13px] font-semibold text-titulo">Carregadores vinculados</legend>
                  <ul className="flex flex-col divide-y">
                    {acompanham.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                        <span className="tabular font-medium text-titulo">{c.nome}</span>
                        <span className="text-[12.5px] text-muted-foreground">Acompanha o notebook</span>
                      </li>
                    ))}
                    {proprios.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                        <span className="min-w-0">
                          <span className="tabular block font-medium text-titulo">{c.nome}</span>
                          <span className="tabular block text-[12.5px] text-muted-foreground">Patrimônio {c.patrimonio}</span>
                        </span>
                        <label className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-titulo">
                          <Checkbox
                            checked={comPatrimonio.includes(c.id)}
                            onCheckedChange={(v) => setComPatrimonio((x) => (v === true ? [...x, c.id] : x.filter((i) => i !== c.id)))}
                          />
                          Transferir também
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note" data-testid="confirmacao-transferencia-empresa">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden />
                <p className="text-[13.5px] text-titulo">
                  Você está transferindo o equipamento <strong className="tabular">{equipamento.rotulo}</strong> da empresa <strong>{equipamento.empresa.sigla}</strong> para a
                  empresa <strong>{destino?.sigla}</strong>. Essa alteração ficará registrada no histórico.
                </p>
              </div>
              <Resumo
                itens={[
                  ["De", equipamento.empresa.nome],
                  ["Para", destino?.nome ?? ""],
                  ["Data", formatarDataHora(localParaIso(quando))],
                  ["Carregadores que mudam", [...acompanham, ...proprios.filter((c) => comPatrimonio.includes(c.id))].map((c) => c.nome).join(", ") || "Nenhum"],
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
              <Button type="button" carregando={enviando} rotuloCarregando="Transferindo…" onClick={() => void confirmar()}>
                Confirmar transferência
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso da transferência reservada (no detalhe da alocação), com as ações de confirmar e cancelar. */
export function AvisoTransferenciaReservada({
  equipamento,
  transferencia,
  pode,
  aoConcluir,
}: {
  equipamento: EquipamentoTransferencia;
  transferencia: TransferenciaReservada & { registradaEm: string; registradaPorNome: string };
  pode: { confirmar: boolean; cancelar: boolean };
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState<"confirmar" | "cancelar" | null>(null);
  const [chave, setChave] = useState(0);
  const mudar = (qual: typeof aberto) => (v: boolean) => {
    setAberto(v ? qual : null);
    if (!v) setChave((c) => c + 1);
  };
  return (
    <div className="mt-3 rounded-lg border border-atencao/30 bg-atencao-fundo p-3" data-testid="transferencia-reservada">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-titulo">
        <ArrowLeftRight className="size-4 text-atencao" aria-hidden /> Transferência reservada para {transferencia.colaborador.nome}
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        {transferencia.previstaPara ? `Prevista para ${dataBr(transferencia.previstaPara)} · ` : ""}
        {formatarDataHora(transferencia.registradaEm)} · {transferencia.registradaPorNome}
      </p>
      {pode.confirmar || pode.cancelar ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {pode.confirmar ? (
            <Button size="sm" onClick={() => setAberto("confirmar")}>
              Confirmar entrega
            </Button>
          ) : null}
          {pode.cancelar ? (
            <Button size="sm" variant="secondary" onClick={() => setAberto("cancelar")}>
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : null}
      <DialogoConfirmarTransferencia
        key={`c${chave}`}
        aberto={aberto === "confirmar"}
        aoMudar={mudar("confirmar")}
        equipamento={equipamento}
        transferencia={transferencia}
        aoConcluir={aoConcluir}
      />
      <DialogoCancelarTransferencia
        key={`x${chave}`}
        aberto={aberto === "cancelar"}
        aoMudar={mudar("cancelar")}
        equipamento={equipamento}
        transferencia={transferencia}
        aoConcluir={aoConcluir}
      />
    </div>
  );
}
