"use client";

import { PlugZap, RotateCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { anexarFotosInspecao, ChecklistInspecao, checklistVazio, inspecaoParaEnvio, ProgressoChecklist, type EstadoChecklist } from "@/components/inspecoes/checklist";
import { focarErroChecklist } from "@/components/inspecoes/dialogos-inspecao";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { sistemaServe, type MarcaOpcao, type ModeloOpcao, type ProcessadorOpcao, type SistemaOpcao } from "@/lib/catalogos";
import { descreverPeca, ehComponente, resumirConfiguracao, pecasDaConfiguracao, type ConfiguracaoOriginal, type TipoComponente } from "@/lib/componentes";
import { PARTES_KIT, ROTULO_PARTE, type ParteKit } from "@/lib/identificacao";
import {
  alvosDaInspecaoEntrada,
  CONDICOES_ENTRADA,
  errosChecklist,
  perguntasAplicaveis,
  resultadoChecklist,
  ROTULO_CONDICAO,
  type CondicaoEntrada,
  type Pergunta,
} from "@/lib/inspecao";
import { COM_CONFIGURACAO, nomeCarregador, normalizarIdentificador, TIPOS_FOTO, type TipoFoto } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoPreviaIdentificador } from "@/server/acoes/categorias";
import { acaoChecklistsDoCadastro } from "@/server/acoes/inspecoes";
import { acaoSalvarEquipamento, type EstadoInventario } from "@/server/acoes/inventario";
import type { CatalogoInventario } from "@/server/modulos/categorias";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { anexarFotos, CampoFotos, totalFotos, type FotosSelecionadas } from "./campo-fotos";
import {
  CamposConfiguracao,
  CamposEspecificacao,
  configDasPecas,
  configVazia,
  errosConfiguracao,
  especVazia,
  paraConfiguracao,
  type ConfigFormulario,
  type EspecFormulario,
} from "./campos-componente";
import { CamposFabricante, modeloCompativel, opcoesAtivas } from "./catalogos/campos-fabricante";
import { DialogoProcessador, DialogoSistema } from "./catalogos/dialogos";
import { DialogoCategoria } from "./categorias/dialogos-catalogo";

/** Peças, componentes e itens de kit: fotos da peça e da etiqueta bastam. */
const FOTOS_SIMPLES: readonly TipoFoto[] = ["FRONTAL", "ETIQUETA_SERIE", "OUTRA"];
const FOTO_PECA_KIT: readonly TipoFoto[] = ["FRONTAL"];
const CRIAR = "__criar__";

export type EmpresaOpcaoInventario = { id: string; nome: string; sigla: string; ativa: boolean };
/** Categorias e Catálogos do Inventário (marcas, modelos, processadores, sistemas e memórias). */
export type CatalogoCadastro = CatalogoInventario;

function Secao({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-t pt-4 first:border-t-0 first:pt-0", className)}>
      <legend className="float-left mb-3 w-full text-sm font-bold text-titulo">{titulo}</legend>
      <div className="clear-both grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">{children}</div>
    </fieldset>
  );
}

/** Valor só de leitura (edição) com a altura e o contorno dos campos ao lado, em fundo neutro. */
function Leitura({ id, children, extra, titulo }: { id: string; children: React.ReactNode; extra?: React.ReactNode; titulo?: string }) {
  return (
    <p
      id={id}
      title={titulo}
      className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-input bg-muted/60 px-3.5 text-base font-semibold text-titulo md:text-sm lg:h-10"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra ? <span className="shrink-0 text-[12px] font-medium text-muted-foreground">{extra}</span> : null}
    </p>
  );
}

/** Leva ao primeiro campo com erro: as seções podem estar fora da área visível. */
function focarPrimeiroErro(corpo: React.RefObject<HTMLDivElement | null>) {
  requestAnimationFrame(() => {
    const campo = corpo.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    // Grupo de opções (ex.: condição de entrada): o foco vai para a primeira opção.
    (campo?.matches("input, textarea, button, [tabindex]") ? campo : (campo?.querySelector<HTMLElement>("button, input") ?? campo))?.focus();
  });
}

type Partes = Record<ParteKit, { marcada: boolean; serie: string }>;
const partesIniciais = (): Partes => ({ TECLADO: { marcada: true, serie: "" }, MOUSE: { marcada: true, serie: "" }, RECEPTOR: { marcada: false, serie: "" } });

const vazio = (e?: FichaEquipamento | null) => ({
  categoriaId: e?.categoriaCatalogo.id ?? "",
  nomeDispositivo: e?.nome ?? "",
  patrimonio: e?.patrimonio ?? "",
  empresaId: e?.empresa.id ?? "",
  marcaId: e?.marcaId ?? "",
  modeloId: e?.modeloId ?? "",
  numeroSerie: e?.numeroSerie ?? "",
  processadorId: e?.processadorId ?? "",
  sistemaId: e?.sistemaOperacionalId ?? "",
  memoriaRam: e?.memoriaRam ?? "",
  armazenamento: e?.armazenamento ?? "",
  dataAquisicao: e?.dataAquisicao ?? "",
  garantiaAte: e?.garantiaAte ?? "",
  observacoes: e?.observacoes ?? "",
  espec: especVazia(e?.componente ?? undefined) as EspecFormulario,
  // Configuração original: editável até a primeira intervenção nos componentes.
  config: (e?.componentesInternos?.estruturada ? configDasPecas(e.componentesInternos.pecas) : configVazia()) as ConfigFormulario,
  partes: partesIniciais(),
});

/** Inclui (ou atualiza) o item criado no catálogo local, sem recarregar a página. */
const incluir = <T extends { id: string }>(lista: T[], item: T) => [...lista.filter((x) => x.id !== item.id), item];

/**
 * Cadastro e edição pelos Catálogos do Inventário. Marca, modelo (da marca e da categoria),
 * modelo do processador e sistema operacional são selects pesquisáveis com "+ Criar novo".
 * O identificador é automático (NBI5001, MNT001, KTM01.T...): o formulário mostra uma
 * prévia, que não reserva número. No notebook, o código do processador (i5 → 5) entra no
 * nome e o carregador C1 nasce junto. Cadastro e edição usam as mesmas seções; só o
 * cadastro passa por revisão, com a inspeção de entrada de cada equipamento criado (novo ou
 * usado define os testes; nenhuma resposta é marcada sozinha).
 */
export function DialogoEquipamento({
  aberto,
  aoMudar,
  equipamento,
  empresas,
  aoSalvar,
  grupo = "equipamentos",
  catalogo,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** Ausente = cadastro; presente = edição. */
  equipamento?: FichaEquipamento | null;
  empresas: EmpresaOpcaoInventario[];
  aoSalvar?: (id: string) => void;
  /** Cadastro aberto pela aba de componentes internos: começa pelas peças. */
  grupo?: "equipamentos" | "componentes";
  catalogo: CatalogoCadastro;
}) {
  const router = useRouter();
  const edicao = Boolean(equipamento);
  const [estado, despachar, pendente] = useActionState<EstadoInventario, FormData>(acaoSalvarEquipamento, {});
  const [f, setF] = useState(() => vazio(equipamento));
  const [categorias, setCategorias] = useState(catalogo.categorias);
  const [marcas, setMarcas] = useState<MarcaOpcao[]>(catalogo.marcas);
  const [modelos, setModelos] = useState<ModeloOpcao[]>(catalogo.modelos);
  const [processadores, setProcessadores] = useState<ProcessadorOpcao[]>(catalogo.processadores);
  const [sistemas, setSistemas] = useState<SistemaOpcao[]>(catalogo.sistemas);
  const [criando, setCriando] = useState<"categoria" | "processador" | "sistema" | { processador: ProcessadorOpcao } | null>(null);
  const [fotos, setFotos] = useState<FotosSelecionadas>({});
  const [fotosRemovidas, setFotosRemovidas] = useState<string[]>([]);
  const [fotosPartes, setFotosPartes] = useState<Partial<Record<ParteKit, FotosSelecionadas>>>({});
  const [previa, setPrevia] = useState<{ chave: string; nome: string; partes: string[] } | null>(null);
  const [etapa, setEtapa] = useState<"preencher" | "revisar">("preencher");
  const [chave] = useState(() => crypto.randomUUID());
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [errosLocais, setErrosLocais] = useState<Record<string, string>>({});
  const [condicao, setCondicao] = useState<CondicaoEntrada | "">("");
  const [inspecoes, setInspecoes] = useState<Record<string, EstadoChecklist>>({});
  const [errosInspecao, setErrosInspecao] = useState<Record<string, Record<string, string>>>({});
  const [checklists, setChecklists] = useState<{ chave: string; dados: { principal: Pergunta[]; herdado: boolean; carregador: Pergunta[] | null } | null; erro: string | null }>({
    chave: "",
    dados: null,
    erro: null,
  });
  const [tentativaChecklist, setTentativaChecklist] = useState(0);
  const tratado = useRef<EstadoInventario | null>(null);
  const corpo = useRef<HTMLDivElement>(null);

  const limparErros = (campos: string[]) => setErrosLocais((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !campos.includes(k))));
  const mudar = (parcial: Partial<typeof f>) => {
    setF((a) => ({ ...a, ...parcial }));
    limparErros(Object.keys(parcial).map((k) => (k === "sistemaId" ? "sistemaOperacionalId" : k)));
    setAlterado(true);
  };
  const mudarEspec = (parcial: Partial<EspecFormulario>) => {
    setF((a) => ({ ...a, espec: { ...a.espec, ...parcial } }));
    limparErros(Object.keys(parcial));
    setAlterado(true);
  };
  const mudarConfig = (parcial: Partial<ConfigFormulario>) => {
    setF((a) => ({ ...a, config: { ...a.config, ...parcial } }));
    limparErros(["memoriaRam", "armazenamento", "ssdGb", "hdGb"]);
    setAlterado(true);
  };
  const mudarParte = (parte: ParteKit, parcial: Partial<Partes[ParteKit]>) => {
    setF((a) => ({ ...a, partes: { ...a.partes, [parte]: { ...a.partes[parte], ...parcial } } }));
    limparErros(["partesKit"]);
    setAlterado(true);
  };

  const categoria = categorias.find((c) => c.id === f.categoriaId) ?? null;
  const tipo = categoria?.tipo ?? equipamento?.categoria ?? null;
  const regra = equipamento ? equipamento.categoriaCatalogo.regra : (categoria?.regra ?? null);
  const notebook = tipo === "NOTEBOOK";
  const carregador = tipo === "CARREGADOR";
  const kit = regra === "KIT" && !edicao;
  const parteDeKit = Boolean(equipamento?.kit);
  const componente = tipo ? ehComponente(tipo) : false;
  const automatico = regra !== null && regra !== "NENHUMA";
  const configuracao = tipo ? COM_CONFIGURACAO.includes(tipo) : false;
  const configEditavel = notebook && equipamento?.componentesInternos?.podeAjustarOriginal !== false;
  const partesMarcadas = PARTES_KIT.filter((p) => f.partes[p].marcada);
  const processador = processadores.find((p) => p.id === f.processadorId) ?? null;
  const prefixoNotebook = categorias.find((c) => c.regra === "PROCESSADOR")?.prefixo ?? "NBI";
  const semCodigo = notebook && Boolean(processador) && !processador?.codigo;
  // Checklists vigentes da inspeção de entrada, lidos na revisão (a TI pode ter mudado as perguntas).
  const chaveChecklist = !edicao && etapa === "revisar" && f.categoriaId ? `${f.categoriaId}:${tentativaChecklist}` : "";
  useEffect(() => {
    if (!chaveChecklist) return;
    let vivo = true;
    acaoChecklistsDoCadastro(chaveChecklist.split(":")[0])
      .then((r) => vivo && setChecklists({ chave: chaveChecklist, dados: r.ok ? r.dados : null, erro: r.ok ? null : r.erro }))
      .catch(() => vivo && setChecklists({ chave: chaveChecklist, dados: null, erro: "Não foi possível carregar o checklist. Tente novamente." }));
    return () => {
      vivo = false;
    };
  }, [chaveChecklist]);
  const checklistAtual = checklists.chave === chaveChecklist ? checklists : null;
  // Inspeção de entrada: um checklist por equipamento criado (notebook + C1; kit: cada peça).
  const alvos =
    !edicao && tipo && checklistAtual?.dados
      ? alvosDaInspecaoEntrada(tipo, categoria?.nome ?? "", partesMarcadas).map((a) => ({
          ...a,
          perguntas: perguntasAplicaveis((a.fonte === "carregador" ? checklistAtual.dados!.carregador : checklistAtual.dados!.principal) ?? [], {
            tipo: "ENTRADA",
            condicao: condicao || null,
            parte: a.parte,
          }),
        }))
      : [];

  // Prévia do identificador (cadastro). Guardada com a chave da consulta: muda de categoria,
  // processador (ou o código dele) ou peças → só aparece a prévia da combinação atual.
  const chavePrevia = automatico && !edicao ? `${f.categoriaId}|${f.processadorId}|${processador?.codigo ?? ""}|${partesMarcadas.join(",")}` : null;
  useEffect(() => {
    if (!chavePrevia || !aberto) return;
    let vivo = true;
    acaoPreviaIdentificador({ categoriaId: f.categoriaId, processadorId: f.processadorId || null, partes: partesMarcadas })
      .then((r) => {
        if (vivo && r.ok && r.dados) setPrevia({ chave: chavePrevia, ...r.dados });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave resume categoria, processador e peças
  }, [chavePrevia, aberto]);
  const previaAtual = previa && previa.chave === chavePrevia ? previa : null;

  useEffect(() => {
    if (!estado.ok || !estado.id || tratado.current === estado) return;
    tratado.current = estado;
    const id = estado.id;
    toast.success(estado.mensagem, edicao ? undefined : { action: { label: "Abrir ficha", onClick: () => router.push(`/ti/inventario/${id}`) } });
    router.refresh();
    aoMudar(false);
    aoSalvar?.(id);
  }, [estado, edicao, aoMudar, aoSalvar, router]);
  // Erro do servidor: volta da revisão ao formulário, no primeiro campo com erro.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    // Erro da inspeção fica na revisão, junto do checklist.
    if ((estado.erro || estado.erros) && etapa === "revisar" && !estado.erros?.inspecao) setEtapa("preencher");
  }
  useEffect(() => {
    if (estado.erros) focarPrimeiroErro(corpo);
  }, [estado]);

  function validar() {
    const erros: Record<string, string> = {};
    if (!f.categoriaId && !edicao) erros.categoria = "Selecione a categoria.";
    if (regra === "NENHUMA" && !normalizarIdentificador(f.patrimonio) && !normalizarIdentificador(f.nomeDispositivo)) {
      erros.patrimonio = "Informe o patrimônio ou o nome do dispositivo.";
    }
    if (!f.empresaId) erros.empresaId = "Selecione a empresa proprietária.";
    if (!edicao && !condicao) erros.condicaoEntrada = "Informe se o equipamento entra novo ou usado.";
    if (!f.marcaId) erros.marcaId = "Selecione a marca.";
    if (!f.modeloId && !carregador) erros.modeloId = "Selecione o modelo.";
    // Notebook: o processador define o identificador; edição de cadastro antigo sem processador continua possível.
    if (notebook && !f.processadorId && (!edicao || equipamento?.processadorId)) erros.processadorId = "Selecione o modelo do processador.";
    if (notebook && !edicao && semCodigo) erros.processadorId = "Configure o código de nomenclatura deste processador.";
    if (componente && !f.espec.capacidadeGb) erros.capacidadeGb = "Informe a capacidade.";
    if (kit && !partesMarcadas.length) erros.partesKit = "Selecione ao menos uma peça do kit.";
    if (f.dataAquisicao && f.garantiaAte && f.garantiaAte < f.dataAquisicao) erros.garantiaAte = "A garantia termina antes da aquisição.";
    if (configEditavel) Object.assign(erros, errosConfiguracao(f.config));
    setErrosLocais(erros);
    return !Object.keys(erros).length;
  }

  /** O envio é montado do estado (a revisão esconde os campos). */
  function montarEnvio() {
    const dados = new FormData();
    if (equipamento) dados.set("id", equipamento.id);
    else dados.set("chaveRequisicao", chave);
    if (!edicao) dados.set("categoriaId", f.categoriaId);
    if (regra === "NENHUMA") dados.set("nomeDispositivo", f.nomeDispositivo);
    if (!componente && !kit && !parteDeKit) dados.set("patrimonio", f.patrimonio);
    for (const k of ["empresaId", "marcaId", "modeloId", "dataAquisicao", "garantiaAte", "observacoes"] as const) dados.set(k, f[k]);
    if (!kit) dados.set("numeroSerie", f.numeroSerie);
    if (configuracao) {
      dados.set("processadorId", f.processadorId);
      dados.set("sistemaOperacionalId", f.sistemaId);
      if (!notebook) {
        dados.set("memoriaRam", f.memoriaRam);
        dados.set("armazenamento", f.armazenamento);
      }
    }
    if (componente) for (const [k, v] of Object.entries(f.espec)) dados.set(k, v);
    const config = configEditavel ? paraConfiguracao(f.config) : null;
    if (config) dados.set("configuracao", JSON.stringify(config));
    if (kit) {
      for (const p of partesMarcadas) {
        dados.set(`parte_${p}`, "sim");
        dados.set(`serie_${p}`, f.partes[p].serie);
        anexarFotos(dados, fotosPartes[p] ?? {}, (t) => `${p}_foto_${t}`);
      }
    } else {
      anexarFotos(dados, fotos);
    }
    for (const id of fotosRemovidas) dados.append("removerFoto", id);
    if (!edicao) {
      dados.set("condicaoEntrada", condicao);
      dados.set("inspecoes", JSON.stringify(Object.fromEntries(alvos.map((a) => [a.alvo, inspecaoParaEnvio(a.perguntas, inspecoes[a.alvo] ?? checklistVazio())]))));
      for (const a of alvos) anexarFotosInspecao(dados, a.alvo, a.perguntas, inspecoes[a.alvo] ?? checklistVazio());
    }
    return dados;
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendente) return;
    if (!validar()) {
      focarPrimeiroErro(corpo);
      return;
    }
    // Cadastro: revisar antes de confirmar.
    if (!edicao && etapa === "preencher") {
      setEtapa("revisar");
      return;
    }
    // Na revisão, a inspeção de entrada completa de cada equipamento criado.
    if (!edicao) {
      if (!checklistAtual?.dados) return;
      const e = Object.fromEntries(
        alvos.map((a) => [a.alvo, errosChecklist(a.perguntas, (inspecoes[a.alvo] ?? checklistVazio()).respostas)] as const).filter(([, x]) => Object.keys(x).length),
      );
      setErrosInspecao(e);
      if (Object.keys(e).length) {
        focarErroChecklist(corpo.current);
        return;
      }
    }
    const dados = montarEnvio();
    startTransition(() => despachar(dados));
  }

  const totalFotosEnvio = kit ? partesMarcadas.reduce((s, p) => s + totalFotos(fotosPartes[p] ?? {}), 0) : totalFotos(fotos);
  const solicitarFechar = () => {
    if (pendente) return;
    if (alterado || totalFotosEnvio || fotosRemovidas.length) setConfirmarDescarte(true);
    else aoMudar(false);
  };
  const erro = (campo: string) => errosLocais[campo] ?? estado.erros?.[campo];
  const opcoesEmpresas = empresas.filter((e) => e.ativa || e.id === f.empresaId).map((e) => ({ valor: e.id, rotulo: e.nome }));
  // Todas as categorias ativas (equipamentos, peças internas e kits) no mesmo select; carregador nasce do notebook.
  const disponiveis = categorias.filter((c) => (c.ativa && c.regra !== "CARREGADOR") || c.id === f.categoriaId);
  const ordenadas = grupo === "componentes" ? [...disponiveis.filter((c) => ehComponente(c.tipo)), ...disponiveis.filter((c) => !ehComponente(c.tipo))] : disponiveis;
  const opcoesCategorias = [
    ...ordenadas.map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: c.prefixo ?? undefined })),
    ...(catalogo.podeGerir ? [{ valor: CRIAR, rotulo: "+ Criar categoria" }] : []),
  ];
  const opcoesProcessadores = opcoesAtivas(processadores, f.processadorId, (p) => p.modelo, (p) => (p.codigo ? `${prefixoNotebook}${p.codigo}` : notebook ? "Sem código" : undefined));
  const opcoesSistemas = opcoesAtivas(
    sistemas.filter((s) => sistemaServe(s, f.categoriaId) || s.id === f.sistemaId),
    f.sistemaId,
    (s) => s.rotulo,
  );
  const categoriasSimples = categorias.map((c) => ({ id: c.id, nome: c.nome, ativa: c.ativa, tipo: c.tipo }));
  const titulo = edicao
    ? `Editar ${equipamento!.nome ?? equipamento!.patrimonio ?? "equipamento"}`
    : componente || (!categoria && grupo === "componentes")
      ? "Cadastrar componente"
      : "Cadastrar equipamento";
  const identificacao = edicao ? equipamento!.nome : previaAtual?.nome;
  const configTexto = (() => {
    const c = paraConfiguracao(f.config);
    return c ? resumirConfiguracao(pecasDaConfiguracao({ memoria: c.memoria && { capacidadeGb: Number(c.memoria.capacidadeGb), tecnologia: c.memoria.tecnologia }, armazenamento: c.armazenamento.map((a) => ({ ...a, capacidadeGb: Number(a.capacidadeGb) })) } as ConfiguracaoOriginal)).texto : null;
  })();

  /* Blocos de campos (as mesmas seções no cadastro e na edição) */

  function trocarCategoria(v: string) {
    if (v === CRIAR) return setCriando("categoria");
    const nova = categorias.find((c) => c.id === v);
    const comConfig = nova ? COM_CONFIGURACAO.includes(nova.tipo) : false;
    const sistema = sistemas.find((s) => s.id === f.sistemaId);
    mudar({
      categoriaId: v,
      // Revalida o que depende da categoria: limpa só o que deixou de ser compatível.
      modeloId: modeloCompativel(modelos, f.modeloId, f.marcaId, v) ? f.modeloId : "",
      processadorId: comConfig ? f.processadorId : "",
      sistemaId: comConfig && sistema && sistemaServe(sistema, v) ? f.sistemaId : "",
    });
  }

  const campoCategoria = (
    <Campo rotulo="Categoria" obrigatorio={!edicao} erro={erro("categoria")} className="lg:col-span-3">
      {(p) =>
        edicao ? (
          <Leitura id={p.id} titulo={equipamento!.rotuloTipo}>
            {equipamento!.rotuloTipo}
          </Leitura>
        ) : (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={f.categoriaId}
            aoMudar={trocarCategoria}
            opcoes={opcoesCategorias}
            placeholder="Selecione"
            pesquisavel
          />
        )
      }
    </Campo>
  );

  const campoIdentificacao =
    regra === "NENHUMA" && !parteDeKit ? (
      <Campo rotulo="Nome do dispositivo" erro={erro("nomeDispositivo")} className="lg:col-span-3">
        {(p) => (
          <Input
            {...p}
            value={f.nomeDispositivo}
            onChange={(e) => mudar({ nomeDispositivo: e.target.value.toUpperCase() })}
            autoComplete="off"
            spellCheck={false}
            className="tabular uppercase placeholder:normal-case"
          />
        )}
      </Campo>
    ) : (
      <Campo
        rotulo={kit ? "Kit" : edicao ? "Nome do dispositivo" : "Identificação"}
        ajuda={
          notebook && identificacao ? (
            <span className="inline-flex items-center gap-1">
              <PlugZap className="size-3.5" aria-hidden /> Carregador: {edicao ? `${identificacao}.C…` : nomeCarregador(identificacao, 1)}
            </span>
          ) : undefined
        }
        className="lg:col-span-3"
      >
        {(p) =>
          edicao ? (
            <Leitura id={p.id} extra={identificacao ? "Automático" : undefined}>
              <span className="tabular" data-testid="identificacao-automatica">
                {identificacao ?? <span className="font-normal text-muted-foreground">Sem identificação automática</span>}
              </span>
            </Leitura>
          ) : (
            <p id={p.id} className="tabular flex h-10 items-center gap-2 font-semibold text-titulo" data-testid="identificacao-automatica">
              {identificacao ?? (
                <span className="font-normal text-muted-foreground">{categoria ? (notebook ? (semCodigo ? "Processador sem código" : "Selecione o processador") : "Gerada ao salvar") : "—"}</span>
              )}
              {identificacao ? <span className="text-[12px] font-medium text-muted-foreground">prévia</span> : null}
            </p>
          )
        }
      </Campo>
    );

  const campoPatrimonio =
    !componente && !kit && !parteDeKit ? (
      <Campo rotulo="Patrimônio" obrigatorio={regra === "NENHUMA" && !f.nomeDispositivo} erro={erro("patrimonio")} className="lg:col-span-3">
        {(p) => (
          <Input
            {...p}
            value={f.patrimonio}
            onChange={(e) => mudar({ patrimonio: e.target.value.toUpperCase() })}
            placeholder="Opcional"
            autoComplete="off"
            spellCheck={false}
            className="tabular uppercase placeholder:normal-case"
          />
        )}
      </Campo>
    ) : null;

  // Na edição, a empresa só muda pela transferência entre empresas (ficha do equipamento).
  const campoEmpresa = (
    <Campo
      rotulo="Empresa proprietária"
      obrigatorio={!equipamento}
      erro={erro("empresaId")}
      ajuda={equipamento ? "Muda por Transferir empresa, na ficha." : undefined}
      className="lg:col-span-3"
    >
      {(p) =>
        equipamento ? (
          <Leitura id={p.id} titulo={equipamento.empresa.nome}>
            {equipamento.empresa.nome}
          </Leitura>
        ) : (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={f.empresaId}
            aoMudar={(v) => mudar({ empresaId: v })}
            opcoes={opcoesEmpresas}
            placeholder="Selecione a empresa"
            pesquisavel
          />
        )
      }
    </Campo>
  );

  const campoCondicao = (
    <Campo
      rotulo="Condição de entrada"
      obrigatorio={!edicao}
      erro={erro("condicaoEntrada")}
      ajuda={!edicao && condicao === "NOVO" ? "Novo: a inspeção não inclui os testes de equipamento usado." : undefined}
      className="lg:col-span-3"
    >
      {(p) =>
        edicao ? (
          <Leitura id={p.id}>{equipamento!.condicaoEntrada ? ROTULO_CONDICAO[equipamento!.condicaoEntrada] : "Não registrada"}</Leitura>
        ) : (
          <div
            id={p.id}
            role="radiogroup"
            aria-label="Condição de entrada"
            aria-describedby={p["aria-describedby"]}
            aria-invalid={p["aria-invalid"]}
            className={cn("grid h-11 grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:h-10", p["aria-invalid"] && "ring-2 ring-erro/40")}
            data-testid="condicao-entrada"
          >
            {CONDICOES_ENTRADA.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={condicao === c}
                onClick={() => {
                  setCondicao(c);
                  setAlterado(true);
                  limparErros(["condicaoEntrada"]);
                }}
                className={cn(
                  "rounded-md px-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  condicao === c ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
                )}
              >
                {ROTULO_CONDICAO[c]}
              </button>
            ))}
          </div>
        )
      }
    </Campo>
  );

  const camposFabricante = (
    <>
      <CamposFabricante
        categoriaId={f.categoriaId}
        categoria={categoria?.nome}
        marcaId={f.marcaId}
        modeloId={f.modeloId}
        marcas={marcas}
        modelos={modelos}
        categorias={categoriasSimples}
        aoMudar={(v) => mudar(v)}
        aoNovaMarca={(m) => setMarcas((l) => incluir(l, m))}
        aoNovoModelo={(m) => setModelos((l) => incluir(l, m))}
        podeCriar={catalogo.podeGerir}
        erro={erro}
        modeloOpcional={carregador}
        classeCampo="lg:col-span-4"
      />
      {kit ? null : (
        <Campo rotulo="Número de série" erro={erro("numeroSerie")} className="sm:col-span-2 lg:col-span-4">
          {(p) => (
            <Input
              {...p}
              value={f.numeroSerie}
              onChange={(e) => mudar({ numeroSerie: e.target.value.toUpperCase() })}
              autoComplete="off"
              spellCheck={false}
              className="tabular uppercase placeholder:normal-case"
            />
          )}
        </Campo>
      )}
    </>
  );

  const campoProcessador = (
    <Campo
      rotulo="Modelo do processador"
      obrigatorio={notebook && (!edicao || Boolean(equipamento?.processadorId))}
      erro={erro("processadorId")}
      ajuda={
        semCodigo ? (
          <span className="flex flex-wrap items-center gap-x-2">
            Sem código de nomenclatura no catálogo.
            {catalogo.podeGerir && processador ? (
              <button type="button" className="font-semibold text-link underline-offset-4 hover:underline" onClick={() => setCriando({ processador })}>
                Configurar código
              </button>
            ) : null}
          </span>
        ) : undefined
      }
      className="lg:col-span-4"
    >
      {(p) => (
        <SelecaoPersonalizada
          id={p.id}
          aria-describedby={p["aria-describedby"]}
          invalido={p["aria-invalid"] || semCodigo}
          valor={f.processadorId}
          aoMudar={(v) => mudar({ processadorId: v })}
          opcoes={opcoesProcessadores}
          placeholder="Selecione"
          vazio={notebook ? undefined : "Não informado"}
          pesquisavel
          criar={catalogo.podeGerir ? { aoCriar: () => setCriando("processador") } : undefined}
        />
      )}
    </Campo>
  );

  const campoSistema = (
    <Campo rotulo="Sistema operacional" erro={erro("sistemaOperacionalId")} className="lg:col-span-4">
      {(p) => (
        <SelecaoPersonalizada
          id={p.id}
          aria-describedby={p["aria-describedby"]}
          invalido={p["aria-invalid"]}
          valor={f.sistemaId}
          aoMudar={(v) => mudar({ sistemaId: v })}
          opcoes={opcoesSistemas}
          vazio="Não informado"
          pesquisavel
          criar={catalogo.podeGerir ? { aoCriar: () => setCriando("sistema") } : undefined}
        />
      )}
    </Campo>
  );

  const camposConfiguracao = componente ? (
    <CamposEspecificacao tipo={tipo as TipoComponente} valor={f.espec} aoMudar={mudarEspec} erro={erro} classeCampo="lg:col-span-3" padroes={catalogo.memoria} />
  ) : notebook ? (
    <>
      {campoProcessador}
      {campoSistema}
      {configEditavel ? (
        <CamposConfiguracao valor={f.config} aoMudar={mudarConfig} erro={erro} classeCampo="lg:col-span-3" padroes={catalogo.memoria} />
      ) : (
        <Campo rotulo="Memória e armazenamento" ajuda="Atualizados pelos componentes internos, na ficha." className="sm:col-span-2 lg:col-span-6">
          {(p) => (
            <Leitura id={p.id} titulo={equipamento?.componentesInternos?.resumo.texto}>
              {equipamento?.componentesInternos?.resumo.texto}
            </Leitura>
          )}
        </Campo>
      )}
    </>
  ) : configuracao ? (
    <>
      {campoProcessador}
      {campoSistema}
      <Campo rotulo="Memória RAM" erro={erro("memoriaRam")} className="lg:col-span-4">
        {(p) => <Input {...p} value={f.memoriaRam} onChange={(e) => mudar({ memoriaRam: e.target.value })} autoComplete="off" placeholder="Ex.: 16 GB" />}
      </Campo>
      <Campo rotulo="Armazenamento" erro={erro("armazenamento")} className="lg:col-span-4">
        {(p) => <Input {...p} value={f.armazenamento} onChange={(e) => mudar({ armazenamento: e.target.value })} autoComplete="off" placeholder="Ex.: SSD 512 GB" />}
      </Campo>
    </>
  ) : null;

  const camposAdicionais =
    componente || kit || parteDeKit ? (
      <Campo rotulo="Observações" erro={erro("observacoes")} className="sm:col-span-2 lg:col-span-12">
        {(p) => <Textarea {...p} value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={3} className="min-h-10" />}
      </Campo>
    ) : (
      <>
        <Campo rotulo="Data de aquisição" erro={erro("dataAquisicao")} className="lg:col-span-3">
          {(p) => <Input {...p} type="date" value={f.dataAquisicao} onChange={(e) => mudar({ dataAquisicao: e.target.value })} />}
        </Campo>
        <Campo rotulo="Garantia até" erro={erro("garantiaAte")} className="lg:col-span-3">
          {(p) => <Input {...p} type="date" value={f.garantiaAte} onChange={(e) => mudar({ garantiaAte: e.target.value })} />}
        </Campo>
        <Campo rotulo="Observações" erro={erro("observacoes")} className="sm:col-span-2 lg:col-span-6">
          {(p) => <Textarea {...p} value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={2} className="min-h-10" />}
        </Campo>
      </>
    );

  const campoFotos = (
    <div className="sm:col-span-2 lg:col-span-12">
      <CampoFotos
        tipos={componente || parteDeKit || carregador ? FOTOS_SIMPLES : TIPOS_FOTO}
        valor={fotos}
        aoMudar={(v) => {
          setFotos(v);
          setAlterado(true);
        }}
        existentes={equipamento?.fotos.filter((x) => x.contexto === "CADASTRO")}
        erro={erro("fotos")}
        removidas={fotosRemovidas}
        aoRemoverExistente={edicao ? (id) => setFotosRemovidas((l) => [...l, id]) : undefined}
        aoDesfazerRemocoes={() => setFotosRemovidas([])}
      />
    </div>
  );

  const pecasKit = (
    <div className="sm:col-span-2 lg:col-span-12" role="group" aria-label="Peças do kit" data-testid="pecas-kit">
      {erro("partesKit") ? <p className="mb-2 text-[13px] font-medium text-erro">{erro("partesKit")}</p> : null}
      <ul className="divide-y rounded-xl border">
        {PARTES_KIT.map((parte) => {
          const marcada = f.partes[parte].marcada;
          const nome = previaAtual?.partes.find((x) => x.endsWith(`.${parte === "TECLADO" ? "T" : parte === "MOUSE" ? "M" : "H"}`));
          return (
            <li key={parte} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 text-[13.5px] font-semibold text-titulo">
                  <Checkbox checked={marcada} onCheckedChange={(v) => mudarParte(parte, { marcada: v === true })} />
                  Possui {ROTULO_PARTE[parte].toLowerCase()}?
                </label>
                {marcada && nome ? <span className="tabular text-[13px] font-semibold text-muted-foreground">{nome}</span> : null}
              </div>
              {marcada ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
                  <Campo rotulo={`Número de série do ${ROTULO_PARTE[parte].toLowerCase()}`}>
                    {(p) => (
                      <Input
                        {...p}
                        value={f.partes[parte].serie}
                        onChange={(e) => mudarParte(parte, { serie: e.target.value.toUpperCase() })}
                        autoComplete="off"
                        spellCheck={false}
                        className="tabular uppercase"
                      />
                    )}
                  </Campo>
                  {/* Um só campo de fotos por peça (os tipos repetiriam o mesmo rótulo no modo compacto). */}
                  <CampoFotos
                    tipos={FOTO_PECA_KIT}
                    valor={fotosPartes[parte] ?? {}}
                    aoMudar={(v) => {
                      setFotosPartes((x) => ({ ...x, [parte]: v }));
                      setAlterado(true);
                    }}
                    compacto
                    rotulo={`Fotos do ${ROTULO_PARTE[parte].toLowerCase()}`}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const nomeDe = <T extends { id: string }>(lista: T[], id: string, rotulo: (x: T) => string) => {
    const x = lista.find((i) => i.id === id);
    return x ? rotulo(x) : "";
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : solicitarFechar())}>
        <DialogContent
          className={cn(
            MODAL_CENTRALIZADO,
            "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
            LARGURA_MODAL[1050],
          )}
          data-testid="dialogo-equipamento"
          onInteractOutside={(e) => e.preventDefault()}
          // Edição: o foco fica no modal, sem selecionar o primeiro campo (digitar não apaga o valor por engano).
          onOpenAutoFocus={(e) => {
            if (!edicao) return;
            e.preventDefault();
            (e.target as HTMLElement | null)?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>{etapa === "revisar" ? "Revisar cadastro" : titulo}</DialogTitle>
            <DialogDescription className="sr-only">Dados do equipamento e fotos.</DialogDescription>
          </DialogHeader>

          <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
            <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5" data-testid="corpo-formulario-equipamento">
              {estado.erro ? (
                <div className="mb-4">
                  <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
                </div>
              ) : null}

              {etapa === "revisar" ? (
                <div className="flex flex-col gap-6">
                  <Revisao
                    itens={[
                      ["Categoria", categoria?.nome ?? ""],
                      [kit ? "Kit" : "Identificação", identificacao ? `${identificacao} (prévia)` : f.nomeDispositivo || "Sem identificação automática"],
                      ...(kit ? ([["Peças", (previaAtual?.partes.length ? previaAtual.partes : partesMarcadas.map((p) => ROTULO_PARTE[p])).join(", ")]] as [string, string][]) : []),
                      ...(notebook
                        ? ([
                            ["Processador", processador?.modelo ?? ""],
                            ["Carregador", identificacao ? nomeCarregador(identificacao, 1) : "C1"],
                          ] as [string, string][])
                        : []),
                      ["Empresa proprietária", empresas.find((e) => e.id === f.empresaId)?.nome ?? ""],
                      ["Condição de entrada", condicao ? ROTULO_CONDICAO[condicao] : ""],
                      ["Marca / modelo", `${nomeDe(marcas, f.marcaId, (m) => m.nome)} ${nomeDe(modelos, f.modeloId, (m) => m.nome)}`],
                      ...(!kit && f.numeroSerie ? ([["Número de série", f.numeroSerie.toUpperCase()]] as [string, string][]) : []),
                      ...(f.patrimonio && !componente && !kit ? ([["Patrimônio", f.patrimonio.toUpperCase()]] as [string, string][]) : []),
                      ...(componente && f.espec.capacidadeGb
                        ? ([
                            [
                              "Especificação",
                              [
                                descreverPeca({ tipo: tipo as TipoComponente, capacidadeGb: Number(f.espec.capacidadeGb), tecnologia: f.espec.tecnologia, interfaceConexao: f.espec.interfaceConexao }),
                                f.espec.formato,
                              ]
                                .filter(Boolean)
                                .join(" · "),
                            ],
                          ] as [string, string][])
                        : []),
                      ...(configuracao && f.sistemaId ? ([["Sistema operacional", nomeDe(sistemas, f.sistemaId, (s) => s.rotulo)]] as [string, string][]) : []),
                      ...(notebook && configTexto ? ([["Configuração", configTexto]] as [string, string][]) : []),
                      ["Fotos", String(totalFotosEnvio)],
                    ]}
                  />
                  <section aria-labelledby="titulo-inspecao-entrada" className="flex flex-col gap-4" data-testid="inspecao-entrada">
                    <div className="flex flex-col gap-0.5">
                      <h3 id="titulo-inspecao-entrada" className="text-sm font-bold text-titulo">
                        Inspeção de entrada
                      </h3>
                      <p className="text-[12.5px] text-muted-foreground">
                        {condicao === "NOVO"
                          ? "Equipamento novo: verificação inicial, sem os testes que só valem para equipamento usado."
                          : "Equipamento usado: inspeção técnica completa antes de concluir o cadastro."}{" "}
                        Responda cada item; nenhuma resposta é marcada automaticamente.
                      </p>
                    </div>
                    {estado.erros?.inspecao ? <AlertaFormulario tom="erro">{estado.erros.inspecao}</AlertaFormulario> : null}
                    {checklistAtual?.erro ? (
                      <div className="flex flex-col items-start gap-2">
                        <AlertaFormulario tom="erro">{checklistAtual.erro}</AlertaFormulario>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setTentativaChecklist((t) => t + 1)}>
                          <RotateCw aria-hidden /> Tentar novamente
                        </Button>
                      </div>
                    ) : !checklistAtual?.dados ? (
                      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando o checklist">
                        <Skeleton className="h-6 w-48 rounded-md" />
                        <Skeleton className="h-16 rounded-xl" />
                        <Skeleton className="h-16 rounded-xl" />
                      </div>
                    ) : checklistAtual.dados.herdado ? (
                      <p className="text-[12.5px] text-muted-foreground">Esta categoria ainda não tem checklist próprio: vale o checklist de Outro.</p>
                    ) : null}
                    {alvos.map((a) => {
                      const valor = inspecoes[a.alvo] ?? checklistVazio();
                      return (
                        <div key={a.alvo} className="flex flex-col gap-3" data-alvo={a.alvo}>
                          {alvos.length > 1 ? <h4 className="text-[13.5px] font-semibold text-titulo">{a.titulo}</h4> : null}
                          <ProgressoChecklist perguntas={a.perguntas} valor={valor} />
                          {resultadoChecklist(a.perguntas, valor.respostas) === "INAPTO" ? (
                            <p className="flex items-start gap-1.5 rounded-lg bg-erro-fundo px-3 py-2 text-[12.5px] font-medium text-erro">
                              <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                              Defeito bloqueante: o equipamento será cadastrado e entrará em manutenção, sem ficar disponível.
                            </p>
                          ) : null}
                          <ChecklistInspecao
                            perguntas={a.perguntas}
                            valor={valor}
                            aoMudar={(v) => {
                              setInspecoes((x) => ({ ...x, [a.alvo]: v }));
                              setAlterado(true);
                              if (errosInspecao[a.alvo]) setErrosInspecao((x) => ({ ...x, [a.alvo]: errosChecklist(a.perguntas, v.respostas) }));
                            }}
                            erros={errosInspecao[a.alvo]}
                            desabilitado={pendente}
                          />
                          <Campo rotulo="Observações da inspeção">
                            {(p) => (
                              <Textarea
                                {...p}
                                value={valor.observacoes}
                                onChange={(e) => setInspecoes((x) => ({ ...x, [a.alvo]: { ...valor, observacoes: e.target.value } }))}
                                maxLength={1000}
                                rows={2}
                                className="min-h-10"
                              />
                            )}
                          </Campo>
                        </div>
                      );
                    })}
                  </section>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <Secao titulo="Identificação">
                    {campoCategoria}
                    {campoIdentificacao}
                    {campoPatrimonio}
                    {campoEmpresa}
                    {campoCondicao}
                  </Secao>
                  <Secao titulo="Fabricante">{camposFabricante}</Secao>
                  {kit ? <Secao titulo="Peças do kit">{pecasKit}</Secao> : null}
                  {camposConfiguracao ? <Secao titulo={componente ? "Especificação" : "Configuração"}>{camposConfiguracao}</Secao> : null}
                  <Secao titulo={componente || kit || parteDeKit ? "Observações" : "Aquisição e observações"}>{camposAdicionais}</Secao>
                  {kit ? null : <Secao titulo="Fotos">{campoFotos}</Secao>}
                </div>
              )}
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0">
              {etapa === "revisar" ? (
                <Button type="button" variant="secondary" disabled={pendente} onClick={() => setEtapa("preencher")}>
                  Voltar
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled={pendente} onClick={solicitarFechar}>
                  Cancelar
                </Button>
              )}
              <BotaoPendente pendente={pendente} rotuloPendente="Salvando…">
                {edicao ? "Salvar alterações" : etapa === "revisar" ? "Confirmar cadastro" : "Revisar"}
              </BotaoPendente>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {criando === "categoria" ? (
        <DialogoCategoria
          aoFechar={() => setCriando(null)}
          aoSalvar={(c, mensagem) => {
            // A categoria nova entra no select na hora, sem recarregar a página.
            setCategorias((x) => [...x, c]);
            trocarCategoria(c.id);
            setCriando(null);
            toast.success(mensagem);
          }}
        />
      ) : null}
      {criando === "processador" || (criando && typeof criando === "object") ? (
        <DialogoProcessador
          processador={typeof criando === "object" ? criando.processador : null}
          prefixoNotebook={prefixoNotebook}
          aoFechar={() => setCriando(null)}
          aoSalvar={(p, mensagem) => {
            setProcessadores((l) => incluir(l, p));
            mudar({ processadorId: p.id });
            setCriando(null);
            toast.success(mensagem);
          }}
        />
      ) : null}
      {criando === "sistema" ? (
        <DialogoSistema
          categorias={categoriasSimples.filter((c) => c.ativa && COM_CONFIGURACAO.includes(c.tipo))}
          aoFechar={() => setCriando(null)}
          aoSalvar={(s, mensagem) => {
            setSistemas((l) => incluir(l, s));
            mudar({ sistemaId: s.id });
            setCriando(null);
            toast.success(mensagem);
          }}
        />
      ) : null}

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent data-testid="confirmar-descarte-equipamento">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>Os dados e as fotos ainda não foram salvos e serão perdidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
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

/** Revisão do cadastro antes da confirmação; o identificador definitivo sai do banco ao salvar. */
function Revisao({ itens }: { itens: [string, string][] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="revisao-cadastro">
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 px-4 py-3 sm:grid-cols-2">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
            <dd className="font-semibold break-words text-titulo">{valor || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12.5px] text-muted-foreground">O número definitivo é confirmado ao salvar.</p>
    </div>
  );
}
