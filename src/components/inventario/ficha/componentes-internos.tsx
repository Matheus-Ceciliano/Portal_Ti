"use client";

import { AlertTriangle, HardDrive, History, Link2, MemoryStick, PackageMinus, Replace } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COMPONENTES, compativeis, ROTULO_COMPONENTE, ROTULO_INTERVENCAO, type TipoComponente } from "@/lib/componentes";
import { DESTINOS_REMOCAO, ROTULO_DESTINO_REMOCAO, type DestinoRemocao } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoComponentesDisponiveis, acaoIntervencaoComponente, type Resultado } from "@/server/acoes/componentes";
import type { CatalogoInventario } from "@/server/modulos/categorias";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import type { ComponenteDisponivel } from "@/server/modulos/componentes";
import { CamposEspecificacao, especVazia, type EspecFormulario } from "../campos-componente";
import { CamposFabricante } from "../catalogos/campos-fabricante";
import { agoraLocal, formatarDataHora, localParaIso } from "../visual";

type Componentes = NonNullable<FichaEquipamento["componentesInternos"]>;
type Peca = Componentes["pecas"][number];
type Modo = "INSTALAR" | "REMOVER" | "SUBSTITUIR";

export type NotebookComponentes = {
  id: string;
  rotulo: string;
  /** Quem está com o notebook (alocação ativa): a intervenção exige confirmação, a alocação continua. */
  alocado: { colaborador: string; alocacao: string } | null;
  memoriaRam: string | null;
  armazenamento: string | null;
  componentes: Componentes;
};

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]");
const SEM_CONEXAO = { ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." };
const ICONE: Record<TipoComponente, typeof MemoryStick> = { MEMORIA_RAM: MemoryStick, SSD: HardDrive, HD: HardDrive };

function useConcluir(aoMudar: (v: boolean) => void) {
  const router = useRouter();
  return (r: Resultado, setErro: (e: string | null) => void) => {
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
  };
}

/**
 * Componentes internos do notebook: vincula peças do estoque (RAM, SSD, HD), substitui e
 * remove, com histórico. A configuração mostrada é a do cadastro do notebook somada às peças
 * vinculadas; nenhuma peça fictícia.
 */
export function ComponentesInternos({
  notebook,
  pode,
  catalogo,
}: {
  notebook: NotebookComponentes;
  pode: { intervir: boolean; criar: boolean; baixar: boolean };
  /** Catálogos (marca, modelo e padrões de memória) para cadastrar peça nova ou registrar a removida. */
  catalogo: CatalogoInventario;
}) {
  const c = notebook.componentes;
  const [aberto, setAberto] = useState<{ modo: Modo; peca: Peca | null } | null>(null);
  const [chave, setChave] = useState(0);
  const [historico, setHistorico] = useState(false);
  const fechar = (v: boolean) => {
    if (!v) {
      setAberto(null);
      setChave((k) => k + 1);
    }
  };
  const podeIntervir = pode.intervir;
  // Soma da configuração original (cadastro ou ficha antiga) com as peças vinculadas.
  const memoria = c.resumo.memoria ?? notebook.memoriaRam;
  const armazenamento = c.resumo.armazenamento ?? notebook.armazenamento;

  return (
    <div className="flex flex-col gap-4" data-testid="componentes-internos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-1">
          <div className="min-w-0">
            <dt className="text-[12.5px] text-muted-foreground">Memória RAM</dt>
            <dd className={cn("font-semibold", memoria ? "text-titulo" : "font-normal text-muted-foreground")}>{memoria ?? "Não informada"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12.5px] text-muted-foreground">Armazenamento</dt>
            <dd className={cn("font-semibold break-words", armazenamento ? "text-titulo" : "font-normal text-muted-foreground")}>{armazenamento ?? "Não informado"}</dd>
          </div>
        </dl>
        {podeIntervir ? (
          <Button size="sm" onClick={() => setAberto({ modo: "INSTALAR", peca: null })} data-testid="vincular-componente">
            <Link2 aria-hidden /> Vincular componente
          </Button>
        ) : null}
      </div>

      {c.pecas.length ? (
        <ul className="divide-y rounded-xl border" aria-label="Peças instaladas">
          {c.pecas.map((p) => {
            const Icone = ICONE[p.tipo];
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
                    <span className="font-semibold text-titulo">{p.descricao}</span>
                    <span className="text-muted-foreground">{ROTULO_COMPONENTE[p.tipo]}</span>
                    {p.componente ? (
                      <Link href={`/ti/inventario/${p.componente.id}`} className="tabular font-semibold text-link underline-offset-4 hover:underline">
                        {p.componente.nome}
                      </Link>
                    ) : (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground">Original</span>
                    )}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {p.componente ? `${p.componente.fabricante} · ` : ""}desde {formatarDataHora(p.instaladaEm)}
                  </p>
                </div>
                {podeIntervir ? (
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Substituir ${p.componente?.nome ?? p.descricao}`} onClick={() => setAberto({ modo: "SUBSTITUIR", peca: p })}>
                          <Replace aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Substituir</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remover ${p.componente?.nome ?? p.descricao}`} onClick={() => setAberto({ modo: "REMOVER", peca: p })}>
                          <PackageMinus aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remover</TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nenhum componente vinculado.</p>
      )}

      {c.intervencoes.length ? (
        <div>
          <Button variant="ghost" size="sm" aria-expanded={historico} aria-controls="historico-intervencoes" onClick={() => setHistorico((h) => !h)} className="-ml-2">
            <History aria-hidden /> Histórico de intervenções ({c.intervencoes.length})
          </Button>
          <ol id="historico-intervencoes" hidden={!historico} className="mt-2 flex flex-col gap-3 border-l pl-4" data-testid="historico-intervencoes">
            {c.intervencoes.map((i) => (
              <li key={i.id} className="text-[13px]">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold text-titulo">{ROTULO_INTERVENCAO[i.tipo]}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {formatarDataHora(i.realizadaEm)} · {i.realizadaPorNome}
                  </span>
                </p>
                {i.motivo ? <p className="text-foreground">{i.motivo}</p> : null}
                <p className="text-muted-foreground">
                  {i.anterior ? (
                    <>
                      Antes: <span className="text-foreground">{i.anterior}</span> ·{" "}
                    </>
                  ) : null}
                  {i.anterior ? "Depois" : "Configuração"}: <span className="text-foreground">{i.resultante}</span>
                </p>
                {i.colaboradorNome ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    Com {i.colaboradorNome} ({i.alocacaoNumero})
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {aberto ? <DialogoIntervencao key={`i${chave}`} aoMudar={fechar} notebook={notebook} modo={aberto.modo} peca={aberto.peca} pode={pode} catalogo={catalogo} /> : null}
    </div>
  );
}

/* Instalação, remoção e substituição */

const TITULO: Record<Modo, { titulo: string; botao: string; icone: typeof Link2 }> = {
  INSTALAR: { titulo: "Vincular componente interno", botao: "Vincular componente", icone: Link2 },
  REMOVER: { titulo: "Remover componente", botao: "Remover componente", icone: PackageMinus },
  SUBSTITUIR: { titulo: "Substituir componente", botao: "Substituir componente", icone: Replace },
};

type Fabricante = { marcaId: string; modeloId: string; numeroSerie: string };
const fabricanteVazio = (): Fabricante => ({ marcaId: "", modeloId: "", numeroSerie: "" });

/** Marca e modelo pelos catálogos (o modelo é da categoria da peça) e o número de série. */
function Fabricante({
  tipo,
  valor,
  aoMudar,
  erro,
  catalogo,
  aoNovo,
}: {
  tipo: TipoComponente;
  valor: Fabricante;
  aoMudar: (p: Partial<Fabricante>) => void;
  erro: (k: string) => string | undefined;
  catalogo: Pick<CatalogoInventario, "marcas" | "modelos" | "categorias" | "podeGerir">;
  aoNovo: (item: { marca?: CatalogoInventario["marcas"][number]; modelo?: CatalogoInventario["modelos"][number] }) => void;
}) {
  const categoria = catalogo.categorias.find((c) => c.codigo === tipo);
  return (
    <>
      <CamposFabricante
        categoriaId={categoria?.id ?? ""}
        categoria={categoria?.nome}
        marcaId={valor.marcaId}
        modeloId={valor.modeloId}
        marcas={catalogo.marcas}
        modelos={catalogo.modelos}
        categorias={catalogo.categorias.map((c) => ({ id: c.id, nome: c.nome, ativa: c.ativa }))}
        aoMudar={aoMudar}
        aoNovaMarca={(marca) => aoNovo({ marca })}
        aoNovoModelo={(modelo) => aoNovo({ modelo })}
        podeCriar={catalogo.podeGerir}
        erro={erro}
      />
      <Campo rotulo="Número de série" className="sm:col-span-2">
        {(p) => (
          <Input {...p} value={valor.numeroSerie} onChange={(e) => aoMudar({ numeroSerie: e.target.value.toUpperCase() })} autoComplete="off" spellCheck={false} className="tabular uppercase" />
        )}
      </Campo>
    </>
  );
}

const paraDados = (tipo: TipoComponente, espec: EspecFormulario, fab: Fabricante) => ({
  categoria: tipo,
  capacidadeGb: espec.capacidadeGb,
  tecnologia: espec.tecnologia || null,
  interfaceConexao: espec.interfaceConexao || null,
  formato: espec.formato || null,
  frequenciaMhz: espec.frequenciaMhz || null,
  marcaId: fab.marcaId,
  modeloId: fab.modeloId,
  numeroSerie: fab.numeroSerie || null,
});

/** A peça original removida já tem o tipo dela: só especificação e fabricante vão ao servidor. */
function semCategoria<T extends { categoria: string }>(d: T): Omit<T, "categoria"> {
  const { categoria: _categoria, ...resto } = d;
  void _categoria;
  return resto;
}

function DialogoIntervencao({
  aoMudar,
  notebook,
  modo,
  peca,
  pode,
  catalogo: catalogoInicial,
}: {
  aoMudar: (v: boolean) => void;
  notebook: NotebookComponentes;
  modo: Modo;
  peca: Peca | null;
  pode: { criar: boolean; baixar: boolean };
  catalogo: CatalogoInventario;
}) {
  // Marcas e modelos criados aqui entram nas opções sem recarregar.
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const novoNoCatalogo = ({ marca, modelo }: { marca?: CatalogoInventario["marcas"][number]; modelo?: CatalogoInventario["modelos"][number] }) =>
    setCatalogo((c) => ({ ...c, marcas: marca ? [...c.marcas, marca] : c.marcas, modelos: modelo ? [...c.modelos, modelo] : c.modelos }));
  const concluir = useConcluir(aoMudar);
  const instala = modo !== "REMOVER";
  const remove = modo !== "INSTALAR";
  const tiposPermitidos = COMPONENTES.filter((t) => !peca || compativeis(peca.tipo, t));
  const [disponiveis, setDisponiveis] = useState<ComponenteDisponivel[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [origem, setOrigem] = useState<"ESTOQUE" | "NOVA">("ESTOQUE");
  const [componenteId, setComponenteId] = useState("");
  const [tipoNovo, setTipoNovo] = useState<TipoComponente>(peca?.tipo ?? "MEMORIA_RAM");
  const [espec, setEspec] = useState<EspecFormulario>(() => especVazia());
  const [fab, setFab] = useState<Fabricante>(fabricanteVazio);
  const [destino, setDestino] = useState<DestinoRemocao | "">("");
  const [registrar, setRegistrar] = useState(false);
  const [especRemovida, setEspecRemovida] = useState<EspecFormulario>(() => especVazia(peca ?? undefined));
  const [fabRemovida, setFabRemovida] = useState<Fabricante>(fabricanteVazio);
  const [motivo, setMotivo] = useState("");
  const [quando, setQuando] = useState(() => agoraLocal());
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [chave] = useState(() => crypto.randomUUID());
  const t = TITULO[modo];
  const identificada = Boolean(peca?.componente);
  const pedeDestino = remove && (identificada || registrar);

  useEffect(() => {
    if (!instala) return;
    let vivo = true;
    acaoComponentesDisponiveis()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setDisponiveis(r.dados);
        else setErroCarga(r.erro);
      })
      .catch(() => vivo && setErroCarga(SEM_CONEXAO.erro));
    return () => {
      vivo = false;
    };
  }, [instala]);

  const limpar = (...k: string[]) => setErros((e) => Object.fromEntries(Object.entries(e).filter(([x]) => !k.includes(x))));

  async function confirmar() {
    const e: Record<string, string> = {};
    if (instala && origem === "ESTOQUE" && !componenteId) e.componente = "Escolha o componente do estoque.";
    if (instala && origem === "NOVA") {
      if (!espec.capacidadeGb) e.capacidadeGb = "Informe a capacidade.";
      if (!fab.marcaId) e.marcaId = "Selecione a marca.";
      if (!fab.modeloId) e.modeloId = "Selecione o modelo.";
    }
    if (remove && !motivo.trim()) e.motivo = modo === "SUBSTITUIR" ? "Informe o motivo da substituição." : "Informe o motivo da remoção.";
    if (pedeDestino && !destino) e.destino = "Escolha o destino da peça removida.";
    if (remove && registrar) {
      if (!especRemovida.capacidadeGb) e.r_capacidadeGb = "Informe a capacidade.";
      if (!fabRemovida.marcaId) e.r_marcaId = "Selecione a marca.";
      if (!fabRemovida.modeloId) e.r_modeloId = "Selecione o modelo.";
    }
    if (notebook.alocado && !confirmado) e.confirmacao = "Confirme que o notebook está disponível para a intervenção.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    const r = await acaoIntervencaoComponente({
      modo,
      notebookId: notebook.id,
      pecaId: peca?.id ?? null,
      componenteId: instala && origem === "ESTOQUE" ? componenteId : null,
      novoComponente: instala && origem === "NOVA" ? paraDados(tipoNovo, espec, fab) : null,
      destino: pedeDestino ? destino : null,
      registrarRemovida: remove && registrar && peca ? semCategoria(paraDados(peca.tipo, especRemovida, fabRemovida)) : null,
      motivo: motivo || null,
      data: localParaIso(quando),
      confirmacaoIntervencao: notebook.alocado ? confirmado : undefined,
      chaveRequisicao: chave,
    }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, setErro);
  }

  const opcoesEstoque = (disponiveis ?? []).filter((d) => tiposPermitidos.includes(d.tipo)).map((d) => ({ valor: d.id, rotulo: `${d.nome} · ${d.descricao}`, detalhe: d.fabricante }));
  const destinos = DESTINOS_REMOCAO.filter((d) => d !== "BAIXADO" || pode.baixar).map((d) => ({ valor: d, rotulo: ROTULO_DESTINO_REMOCAO[d] }));

  return (
    <Dialog open onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-intervencao" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <t.icone className="size-5 text-muted-foreground" aria-hidden /> {t.titulo}
          </DialogTitle>
          <DialogDescription>
            <span className="tabular font-semibold text-titulo">{notebook.rotulo}</span>
            {peca ? ` · ${peca.descricao} (${peca.componente?.nome ?? "original"})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}

          {instala ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-[13px] font-semibold text-titulo">{modo === "SUBSTITUIR" ? "Nova peça" : "Componente"}</legend>
              {pode.criar ? (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Origem da peça">
                  {(
                    [
                      ["ESTOQUE", "Do estoque"],
                      ["NOVA", "Cadastrar nova peça"],
                    ] as const
                  ).map(([v, r]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={origem === v}
                      onClick={() => {
                        setOrigem(v);
                        setErros({});
                      }}
                      className={cn(
                        "h-9 rounded-md px-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        origem === v ? "bg-card text-titulo shadow-nivel-1" : "text-muted-foreground hover:text-titulo",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              ) : null}
              {origem === "ESTOQUE" ? (
                <Campo rotulo="Componente do estoque" obrigatorio erro={erros.componente || erroCarga || undefined}>
                  {(p) =>
                    disponiveis ? (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        invalido={p["aria-invalid"]}
                        valor={componenteId}
                        aoMudar={(v) => {
                          setComponenteId(v);
                          limpar("componente");
                        }}
                        opcoes={opcoesEstoque}
                        placeholder={opcoesEstoque.length ? "Selecione" : "Nenhuma peça disponível"}
                        pesquisavel
                      />
                    ) : (
                      <Skeleton className="h-11 rounded-lg lg:h-10" aria-label="Carregando componentes" />
                    )
                  }
                </Campo>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Tipo" obrigatorio>
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        valor={tipoNovo}
                        aoMudar={(v) => {
                          setTipoNovo(v as TipoComponente);
                          setEspec(especVazia());
                          // O modelo é da categoria da peça: outro tipo pede outro modelo.
                          setFab((x) => ({ ...x, modeloId: "" }));
                        }}
                        opcoes={tiposPermitidos.map((x) => ({ valor: x, rotulo: ROTULO_COMPONENTE[x] }))}
                      />
                    )}
                  </Campo>
                  <CamposEspecificacao
                    tipo={tipoNovo}
                    valor={espec}
                    aoMudar={(p) => {
                      setEspec((x) => ({ ...x, ...p }));
                      limpar(...Object.keys(p));
                    }}
                    erro={(k) => erros[k]}
                    padroes={catalogo.memoria}
                  />
                  <Fabricante
                    tipo={tipoNovo}
                    valor={fab}
                    aoMudar={(p) => {
                      setFab((x) => ({ ...x, ...p }));
                      limpar(...Object.keys(p));
                    }}
                    erro={(k) => erros[k]}
                    catalogo={catalogo}
                    aoNovo={novoNoCatalogo}
                  />
                </div>
              )}
            </fieldset>
          ) : null}

          {remove && peca ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-[13px] font-semibold text-titulo">Peça removida</legend>
              {!identificada ? (
                pode.criar ? (
                  <label className="flex items-start gap-2.5 text-[13.5px] font-medium text-titulo">
                    <Checkbox checked={registrar} onCheckedChange={(v) => setRegistrar(v === true)} className="mt-0.5" />
                    Registrar a peça removida no estoque
                  </label>
                ) : null
              ) : null}
              {!identificada && registrar ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <CamposEspecificacao
                    tipo={peca.tipo}
                    valor={especRemovida}
                    aoMudar={(p) => {
                      setEspecRemovida((x) => ({ ...x, ...p }));
                      limpar(...Object.keys(p).map((k) => `r_${k}`));
                    }}
                    erro={(k) => erros[`r_${k}`]}
                    padroes={catalogo.memoria}
                  />
                  <Fabricante
                    tipo={peca.tipo}
                    valor={fabRemovida}
                    aoMudar={(p) => {
                      setFabRemovida((x) => ({ ...x, ...p }));
                      limpar(...Object.keys(p).map((k) => `r_${k}`));
                    }}
                    erro={(k) => erros[`r_${k}`]}
                    catalogo={catalogo}
                    aoNovo={novoNoCatalogo}
                  />
                </div>
              ) : null}
              {pedeDestino ? (
                <Campo rotulo="Destino" obrigatorio erro={erros.destino}>
                  {(p) => (
                    <SelecaoPersonalizada
                      id={p.id}
                      aria-describedby={p["aria-describedby"]}
                      invalido={p["aria-invalid"]}
                      valor={destino}
                      aoMudar={(v) => {
                        setDestino(v as DestinoRemocao);
                        limpar("destino");
                      }}
                      opcoes={destinos}
                      placeholder="Selecione"
                    />
                  )}
                </Campo>
              ) : null}
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data e hora" obrigatorio>
              {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
            </Campo>
          </div>
          <Campo rotulo="Motivo" obrigatorio={remove} erro={erros.motivo}>
            {(p) => (
              <Textarea
                {...p}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  limpar("motivo");
                }}
                maxLength={500}
                rows={2}
              />
            )}
          </Campo>

          {notebook.alocado ? (
            <div className="rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note">
              <p className="flex items-center gap-2 font-semibold text-titulo">
                <AlertTriangle className="size-4 text-atencao" aria-hidden /> Notebook alocado
              </p>
              <p className="mt-1 text-[13px]">
                Com <strong>{notebook.alocado.colaborador}</strong> ({notebook.alocado.alocacao}). A alocação continua; para recolher o notebook, use Enviar para manutenção.
              </p>
              <label className="mt-3 flex items-start gap-2.5 text-[13.5px] font-medium text-titulo">
                <Checkbox
                  checked={confirmado}
                  onCheckedChange={(v) => {
                    setConfirmado(v === true);
                    limpar("confirmacao");
                  }}
                  aria-invalid={erros.confirmacao ? true : undefined}
                  className="mt-0.5"
                />
                Confirmo que o notebook está disponível para a intervenção técnica.
              </label>
              {erros.confirmacao ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erros.confirmacao}</p> : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button type="button" carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()}>
            {t.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
