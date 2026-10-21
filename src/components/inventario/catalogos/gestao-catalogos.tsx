"use client";

import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Layers,
  MemoryStick,
  MonitorCog,
  Package,
  Pencil,
  Plus,
  ShieldAlert,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { CampoBusca } from "@/components/comum/campos";
import { CabecalhoPagina } from "@/components/comum/pagina";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { StatusBadge } from "@/components/comum/status-badge";
import { OrientacaoPergunta } from "@/components/inspecoes/checklist";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { chaveCatalogo, ROTULO_ABA_CATALOGO, ROTULO_PADRAO_MEMORIA, TIPOS_PADRAO_MEMORIA, type AbaCatalogo, type ItemCatalogo } from "@/lib/catalogos";
import { ehComponente } from "@/lib/componentes";
import { DESCRICAO_REGRA, exemploRegra, ROTULO_PARTE } from "@/lib/identificacao";
import { ROTULO_APLICACAO } from "@/lib/inspecao";
import { COM_CONFIGURACAO, nomeCarregador } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoExcluirCategoria } from "@/server/acoes/categorias";
import { acaoSituacaoCatalogo } from "@/server/acoes/catalogos";
import { acaoMoverPergunta, acaoSituacaoPergunta } from "@/server/acoes/checklists";
import type { ListaCatalogos } from "@/server/modulos/catalogos";
import type { ListaChecklists, PerguntaGestao } from "@/server/modulos/checklists";
import type { CategoriaCatalogo, ListaCategorias } from "@/server/modulos/categorias";
import { DialogoCategoria } from "../categorias/dialogos-catalogo";
import { DialogoPerguntaInspecao } from "./checklists-inspecao";
import { DialogoMarca, DialogoModelo, DialogoPadraoMemoria, DialogoProcessador, DialogoSistema } from "./dialogos";
import { DialogoModelosMarca } from "./dialogo-modelos-marca";

type Categoria = ListaCategorias["categorias"][number];
type Marca = ListaCatalogos["marcas"][number];
type Modelo = ListaCatalogos["modelos"][number];
type Processador = ListaCatalogos["processadores"][number];
type Sistema = ListaCatalogos["sistemas"][number];
type Padrao = ListaCatalogos["memoria"][number];

const ICONE_ABA: Record<AbaCatalogo, LucideIcon> = {
  categorias: Layers,
  marcas: Tag,
  modelos: Package,
  processadores: Cpu,
  sistemas: MonitorCog,
  memorias: MemoryStick,
  checklists: ClipboardCheck,
};
const ROTULO_CADASTRAR: Record<AbaCatalogo, string> = {
  categorias: "Criar categoria",
  marcas: "Cadastrar marca",
  modelos: "Cadastrar modelo",
  processadores: "Cadastrar processador",
  sistemas: "Cadastrar sistema",
  memorias: "Cadastrar padrão",
  checklists: "Nova pergunta",
};

const th = "h-10 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
const td = "h-14 px-3 py-2 align-middle first:pl-5 last:pr-5";

type Situacao = "" | "ativas" | "inativas";
const OPCOES_SITUACAO = [
  { valor: "ativas", rotulo: "Ativos" },
  { valor: "inativas", rotulo: "Inativos" },
];

const Situacao = ({ ativa }: { ativa: boolean }) =>
  ativa ? (
    <StatusBadge tom="sucesso" icone={CheckCircle2}>
      Ativo
    </StatusBadge>
  ) : (
    <StatusBadge tom="neutro" icone={Ban}>
      Inativo
    </StatusBadge>
  );

/** Formato do identificador: o próximo da sequência (prévia, sem reservar) ou o padrão da regra. */
function Identificador({ c, prefixoNotebook }: { c: Categoria; prefixoNotebook: string }) {
  if (c.regra === "NENHUMA") return <span className="text-muted-foreground">{DESCRICAO_REGRA.NENHUMA}</span>;
  if (c.regra === "CARREGADOR") return <span className="tabular">{nomeCarregador(`${prefixoNotebook}5001`, 1)}</span>;
  if (c.regra === "PROCESSADOR") return <span className="tabular">{`${c.prefixo}{código}${"0".repeat(c.digitos - 1)}1`}</span>;
  return <span className="tabular">{c.proximo ?? exemploRegra(c.regra, c.prefixo, c.digitos)}</span>;
}

const Quantidade = ({ n, href, rotulo }: { n: number; href?: string; rotulo: string }) =>
  href && n > 0 ? (
    <Link href={href} className="tabular font-semibold text-link underline-offset-4 hover:underline" aria-label={rotulo}>
      {n}
    </Link>
  ) : (
    <span className={cn("tabular", n ? "font-semibold text-titulo" : "text-muted-foreground")}>{n}</span>
  );

type Coluna<T> = { titulo: string; classe?: string; celula: (l: T) => React.ReactNode };

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const POR_PAGINA = 20;
const classePagina = "inline-flex h-11 items-center gap-1 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50 lg:h-9";

/**
 * Tabela compacta dos catálogos (linhas de altura uniforme; inativos em cinza suave). No
 * celular vira lista com o essencial: nome, detalhe, situação e ações. A paginação corta a
 * lista já pesquisada, filtrada e ordenada (a ordem vale para o conjunto inteiro); trocar a
 * aba, a pesquisa ou um filtro remonta a tabela e volta à primeira página.
 */
function TabelaCatalogo<T extends { id: string; ativa: boolean }>({
  rotulo,
  linhas: todas,
  colunas,
  principal,
  detalhe,
  acoes,
  vazio,
  aoAbrir,
}: {
  rotulo: string;
  linhas: T[];
  colunas: Coluna<T>[];
  principal: (l: T) => string;
  detalhe: (l: T) => React.ReactNode;
  acoes: (l: T) => React.ReactNode;
  vazio: string;
  /** Nome clicável no celular (o mesmo que a célula principal faz no desktop). */
  aoAbrir?: (l: T) => void;
}) {
  const [pagina, setPagina] = useState(1);
  if (!todas.length) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{vazio}</p>;
  const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas);
  const linhas = todas.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  return (
    <>
      <div className="hidden @2xl:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{rotulo}</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              {colunas.map((c) => (
                <th key={c.titulo} scope="col" className={cn(th, c.classe)}>
                  {c.titulo}
                </th>
              ))}
              <th scope="col" className={cn(th, "w-28")}>
                Situação
              </th>
              <th scope="col" className={cn(th, "w-24 text-right")}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((l) => (
              <tr key={l.id} className={cn("transition-colors hover:bg-muted/30", !l.ativa && "bg-muted/35 text-muted-foreground")}>
                {colunas.map((c) => (
                  <td key={c.titulo} className={cn(td, c.classe)}>
                    {c.celula(l)}
                  </td>
                ))}
                <td className={td}>
                  <Situacao ativa={l.ativa} />
                </td>
                <td className={td}>{acoes(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y @2xl:hidden">
        {linhas.map((l) => (
          <li key={l.id} className={cn("flex items-center gap-3 px-4 py-3", !l.ativa && "bg-muted/35")}>
            <div className="min-w-0 flex-1">
              {aoAbrir ? (
                <button type="button" onClick={() => aoAbrir(l)} className="block max-w-full truncate text-left font-semibold text-link underline-offset-4 hover:underline">
                  {principal(l)}
                </button>
              ) : (
                <p className="truncate font-semibold text-titulo">{principal(l)}</p>
              )}
              <p className="truncate text-[12.5px] text-muted-foreground">{detalhe(l)}</p>
              <span className="mt-1 flex">
                <Situacao ativa={l.ativa} />
              </span>
            </div>
            {acoes(l)}
          </li>
        ))}
      </ul>
      <nav aria-label={`Paginação de ${rotulo}`} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
        <p className="tabular text-[13px] text-muted-foreground">
          Página {atual} de {paginas} · {todas.length} {todas.length === 1 ? "registro" : "registros"}
        </p>
        <div className="flex gap-2">
          <button type="button" className={classePagina} disabled={atual <= 1} onClick={() => setPagina(atual - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </button>
          <button type="button" className={classePagina} disabled={atual >= paginas} onClick={() => setPagina(atual + 1)}>
            Próxima <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </nav>
    </>
  );
}

function BotaoIcone({ rotulo, dica, icone: Icone, aoClicar, desabilitado }: { rotulo: string; dica: string; icone: LucideIcon; aoClicar: () => void; desabilitado?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={rotulo} onClick={aoClicar} disabled={desabilitado}>
          <Icone aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dica}</TooltipContent>
    </Tooltip>
  );
}

const filtrar = <T,>(linhas: T[], busca: string, texto: (l: T) => string, situacao: Situacao, ativa: (l: T) => boolean) => {
  const b = chaveCatalogo(busca);
  return linhas.filter((l) => (!b || chaveCatalogo(texto(l)).includes(b)) && (situacao === "" || ativa(l) === (situacao === "ativas")));
};

type Edicao =
  | { aba: "categorias"; item: Categoria | null }
  | { aba: "marcas"; item: Marca | null }
  | { aba: "modelos"; item: Modelo | null }
  | { aba: "processadores"; item: Processador | null }
  | { aba: "sistemas"; item: Sistema | null }
  | { aba: "memorias"; item: Padrao | null }
  | { aba: "checklists"; item: PerguntaGestao | null };

/**
 * Catálogos do Inventário: categorias, marcas, modelos, processadores, sistemas operacionais e
 * padrões de memória, e os checklists de inspeção de cada categoria. A aba fica no endereço
 * (?aba=). Cadastrar, editar, reordenar e ativar/inativar exige "Gerenciar catálogos"; itens em
 * uso não são excluídos (perguntas editadas viram nova versão).
 */
export function GestaoCatalogos({
  categorias: lista,
  catalogos,
  checklists,
  abaInicial,
}: {
  categorias: ListaCategorias;
  catalogos: ListaCatalogos;
  checklists: ListaChecklists;
  abaInicial: AbaCatalogo;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<AbaCatalogo>(abaInicial);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("");
  const [filtroMarca, setFiltroMarca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [marcaAberta, setMarcaAberta] = useState<{ id: string; nome: string } | null>(null);
  const [excluir, setExcluir] = useState<Categoria | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const pode = lista.podeGerir && catalogos.podeGerir && checklists.podeGerir;
  const prefixoNotebook = lista.categorias.find((c) => c.regra === "PROCESSADOR")?.prefixo ?? "NBI";
  const categoriasSimples = lista.categorias.map((c) => ({ id: c.id, nome: c.nome, ativa: c.ativa, tipo: c.tipo }));

  function trocarAba(nova: AbaCatalogo) {
    setAba(nova);
    setBusca("");
    setSituacao("");
    setFiltroMarca("");
    setFiltroCategoria("");
    setFiltroTipo("");
    try {
      const url = new URL(window.location.href);
      if (nova === "categorias") url.searchParams.delete("aba");
      else url.searchParams.set("aba", nova);
      window.history.replaceState(null, "", url);
    } catch {
      // Endereço sem a aba: a página continua funcionando.
    }
  }

  const concluir = (mensagem: string) => {
    toast.success(mensagem);
    setEditando(null);
    router.refresh();
  };

  async function alternar(item: ItemCatalogo, id: string, ativa: boolean) {
    setPendente(id);
    const r = await acaoSituacaoCatalogo({ item, id, ativa }).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setPendente(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(r.mensagem ?? "Situação atualizada.");
    router.refresh();
  }

  async function situacaoPergunta(p: PerguntaGestao) {
    setPendente(p.id);
    const r = await acaoSituacaoPergunta(p.id, !p.ativa).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setPendente(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(r.mensagem);
    router.refresh();
  }

  async function moverPergunta(p: PerguntaGestao, direcao: "acima" | "abaixo") {
    setPendente(p.id);
    const r = await acaoMoverPergunta(p.id, direcao).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setPendente(null);
    if (!r.ok) return toast.error(r.erro);
    router.refresh();
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setPendente(excluir.id);
    const r = await acaoExcluirCategoria(excluir.id).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setPendente(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(r.mensagem ?? "Categoria excluída.");
    setExcluir(null);
    router.refresh();
  }

  const acoesItem = (item: ItemCatalogo, l: { id: string; ativa: boolean }, nome: string, aoEditar: () => void) =>
    pode ? (
      <div className="flex justify-end gap-1">
        <BotaoIcone rotulo={`Editar ${nome}`} dica="Editar" icone={Pencil} aoClicar={aoEditar} />
        <BotaoIcone
          rotulo={`${l.ativa ? "Inativar" : "Ativar"} ${nome}`}
          dica={l.ativa ? "Inativar" : "Ativar"}
          icone={l.ativa ? Ban : CheckCircle2}
          aoClicar={() => void alternar(item, l.id, !l.ativa)}
          desabilitado={pendente === l.id}
        />
      </div>
    ) : null;

  const comFiltros = (extra?: React.ReactNode) => (
    <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
      <div className="sm:w-72">
        <CampoBusca value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar" aria-label={`Pesquisar em ${ROTULO_ABA_CATALOGO[aba]}`} />
      </div>
      {extra}
      <div className="sm:w-40">
        <SelecaoPersonalizada valor={situacao} aoMudar={(v) => setSituacao(v as Situacao)} opcoes={OPCOES_SITUACAO} vazio="Todas as situações" aria-label="Situação" destacado={Boolean(situacao)} />
      </div>
    </div>
  );

  /* Conteúdo de cada aba */

  const categoriasFiltradas = filtrar(lista.categorias, busca, (c) => `${c.nome} ${c.prefixo ?? ""}`, situacao, (c) => c.ativa);
  const marcas = filtrar(catalogos.marcas, busca, (m) => m.nome, situacao, (m) => m.ativa);
  const modelos = filtrar(catalogos.modelos, busca, (m) => `${m.nome} ${m.marca}`, situacao, (m) => m.ativa).filter(
    (m) => (!filtroMarca || m.marcaId === filtroMarca) && (!filtroCategoria || m.categoriaId === filtroCategoria),
  );
  const processadores = filtrar(catalogos.processadores, busca, (p) => `${p.modelo} ${p.fabricante ?? ""} ${p.familia ?? ""}`, situacao, (p) => p.ativa);
  const sistemas = filtrar(catalogos.sistemas, busca, (s) => s.rotulo, situacao, (s) => s.ativa);
  const memoria = filtrar(catalogos.memoria, busca, (p) => p.valor, situacao, (p) => p.ativa).filter((p) => !filtroTipo || p.tipo === filtroTipo);
  // Checklist da categoria escolhida (começa pelo notebook).
  const categoriaChecklist = filtroCategoria || lista.categorias.find((c) => c.tipo === "NOTEBOOK")?.id || lista.categorias[0]?.id || "";
  const perguntasCategoria = checklists.perguntas.filter((p) => p.categoriaId === categoriaChecklist).sort((a, b) => a.ordem - b.ordem);
  const perguntas = filtrar(perguntasCategoria, busca, (p) => `${p.atual.texto} ${p.atual.grupo}`, situacao, (p) => p.ativa);
  const totalPorCategoria = new Map<string, number>();
  for (const p of checklists.perguntas) totalPorCategoria.set(p.categoriaId, (totalPorCategoria.get(p.categoriaId) ?? 0) + 1);

  const conteudo: Record<AbaCatalogo, React.ReactNode> = {
    categorias: (
      <>
        {comFiltros()}
        <TabelaCatalogo
          rotulo="Categorias do inventário"
          linhas={categoriasFiltradas}
          vazio="Nenhuma categoria encontrada."
          principal={(c) => c.nome}
          detalhe={(c) => (
            <>
              {c.prefixo ? <span className="tabular font-semibold">{c.prefixo} · </span> : null}
              <Identificador c={c} prefixoNotebook={prefixoNotebook} /> · {c.equipamentos} equipamentos
            </>
          )}
          colunas={[
            {
              titulo: "Categoria",
              celula: (c) => (
                <>
                  <span className="block truncate font-semibold text-titulo">{c.nome}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{DESCRICAO_REGRA[c.regra]}</span>
                </>
              ),
            },
            {
              titulo: "Abreviação",
              classe: "w-28",
              celula: (c) => (
                <>
                  <span className="tabular font-semibold text-titulo">{c.prefixo ?? "—"}</span>
                  {c.prefixosAnteriores.length ? <span className="tabular block truncate text-[12px] text-muted-foreground">antes: {c.prefixosAnteriores.join(", ")}</span> : null}
                </>
              ),
            },
            { titulo: "Próximo identificador", classe: "hidden w-48 truncate @4xl:table-cell", celula: (c) => <Identificador c={c} prefixoNotebook={prefixoNotebook} /> },
            {
              titulo: "Equipamentos",
              classe: "w-28 text-right",
              celula: (c) => (
                <Quantidade
                  n={c.equipamentos}
                  href={`/ti/inventario?${ehComponente(c.tipo) ? "grupo=componentes&" : ""}tipo=${c.id}`}
                  rotulo={`${c.equipamentos} equipamentos de ${c.nome}`}
                />
              ),
            },
          ]}
          acoes={(c) =>
            pode ? (
              <div className="flex justify-end gap-1">
                <BotaoIcone rotulo={`Editar ${c.nome}`} dica="Editar categoria" icone={Pencil} aoClicar={() => setEditando({ aba: "categorias", item: c })} />
                {!c.sistema && c.equipamentos === 0 ? <BotaoIcone rotulo={`Excluir ${c.nome}`} dica="Excluir categoria" icone={Trash2} aoClicar={() => setExcluir(c)} /> : null}
              </div>
            ) : null
          }
        />
      </>
    ),
    marcas: (
      <>
        {comFiltros()}
        <TabelaCatalogo
          rotulo="Marcas"
          linhas={marcas}
          vazio="Nenhuma marca encontrada."
          principal={(m) => m.nome}
          detalhe={(m) => `${qtd(m.modelos, "modelo", "modelos")} · ${qtd(m.equipamentos, "equipamento", "equipamentos")}`}
          aoAbrir={(m) => setMarcaAberta(m)}
          colunas={[
            {
              titulo: "Marca",
              celula: (m) => (
                <button
                  type="button"
                  onClick={() => setMarcaAberta(m)}
                  className="block max-w-full truncate rounded-sm text-left font-semibold text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Ver modelos de ${m.nome}`}
                >
                  {m.nome}
                </button>
              ),
            },
            { titulo: "Modelos", classe: "w-28 text-right", celula: (m) => <Quantidade n={m.modelos} rotulo={`${m.modelos} modelos`} /> },
            { titulo: "Equipamentos", classe: "w-32 text-right", celula: (m) => <Quantidade n={m.equipamentos} href={`/ti/inventario?marca=${m.id}`} rotulo={`${m.equipamentos} equipamentos ${m.nome}`} /> },
          ]}
          acoes={(m) => acoesItem("marca", m, m.nome, () => setEditando({ aba: "marcas", item: m }))}
        />
      </>
    ),
    modelos: (
      <>
        {comFiltros(
          <>
            <div className="sm:w-48">
              <SelecaoPersonalizada
                valor={filtroMarca}
                aoMudar={setFiltroMarca}
                opcoes={catalogos.marcas.map((m) => ({ valor: m.id, rotulo: m.nome }))}
                vazio="Todas as marcas"
                aria-label="Marca"
                pesquisavel
                destacado={Boolean(filtroMarca)}
              />
            </div>
            <div className="sm:w-52">
              <SelecaoPersonalizada
                valor={filtroCategoria}
                aoMudar={setFiltroCategoria}
                opcoes={lista.categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                vazio="Todas as categorias"
                aria-label="Categoria"
                pesquisavel
                destacado={Boolean(filtroCategoria)}
              />
            </div>
          </>,
        )}
        <TabelaCatalogo
          rotulo="Modelos"
          linhas={modelos}
          vazio="Nenhum modelo encontrado."
          principal={(m) => `${m.marca} · ${m.nome}`}
          detalhe={(m) => `${m.categoria} · ${qtd(m.equipamentos, "equipamento", "equipamentos")}`}
          colunas={[
            { titulo: "Marca", classe: "w-36", celula: (m) => <span className="block truncate font-medium text-foreground">{m.marca}</span> },
            { titulo: "Modelo", celula: (m) => <span className="block truncate font-semibold text-titulo">{m.nome}</span> },
            { titulo: "Categoria do equipamento", classe: "hidden w-52 @4xl:table-cell", celula: (m) => <span className="block truncate">{m.categoria}</span> },
            {
              titulo: "Quantidade de equipamentos",
              classe: "w-48 text-right",
              celula: (m) => <Quantidade n={m.equipamentos} href={`/ti/inventario?marca=${m.marcaId}&modelo=${m.id}`} rotulo={`${m.equipamentos} equipamentos ${m.nome}`} />,
            },
          ]}
          acoes={(m) => acoesItem("modelo", m, m.nome, () => setEditando({ aba: "modelos", item: m }))}
        />
      </>
    ),
    processadores: (
      <>
        {comFiltros()}
        <TabelaCatalogo
          rotulo="Processadores"
          linhas={processadores}
          vazio="Nenhum processador encontrado."
          principal={(p) => p.modelo}
          detalhe={(p) => `${p.codigo ? `${prefixoNotebook}${p.codigo}` : "Sem código"} · ${qtd(p.equipamentos, "equipamento", "equipamentos")}`}
          colunas={[
            { titulo: "Modelo completo", celula: (p) => <span className="block truncate font-semibold text-titulo">{p.modelo}</span> },
            { titulo: "Fabricante", classe: "hidden w-32 @4xl:table-cell", celula: (p) => <span className="block truncate">{p.fabricante ?? "—"}</span> },
            { titulo: "Família", classe: "hidden w-32 @4xl:table-cell", celula: (p) => <span className="block truncate">{p.familia ?? "—"}</span> },
            {
              titulo: "Nome do notebook",
              classe: "w-40",
              celula: (p) =>
                p.codigo ? (
                  <span className="tabular font-semibold text-titulo">
                    {prefixoNotebook}
                    {p.codigo}
                    <span className="font-normal text-muted-foreground">001</span>
                  </span>
                ) : (
                  <span className="text-[12.5px] font-medium text-atencao">Sem código</span>
                ),
            },
            { titulo: "Equipamentos", classe: "w-32 text-right", celula: (p) => <Quantidade n={p.equipamentos} rotulo={`${p.equipamentos} equipamentos`} /> },
          ]}
          acoes={(p) => acoesItem("processador", p, p.modelo, () => setEditando({ aba: "processadores", item: p }))}
        />
      </>
    ),
    sistemas: (
      <>
        {comFiltros()}
        <TabelaCatalogo
          rotulo="Sistemas operacionais"
          linhas={sistemas}
          vazio="Nenhum sistema encontrado."
          principal={(s) => s.rotulo}
          detalhe={(s) => `${s.categorias.length ? s.categorias.join(", ") : "Todas as categorias"} · ${qtd(s.equipamentos, "equipamento", "equipamentos")}`}
          colunas={[
            { titulo: "Sistema", celula: (s) => <span className="block truncate font-semibold text-titulo">{s.rotulo}</span> },
            {
              titulo: "Disponível para",
              classe: "hidden w-56 @4xl:table-cell",
              celula: (s) => <span className="block truncate" title={s.categorias.join(", ") || undefined}>{s.categorias.length ? s.categorias.join(", ") : "Todas as categorias"}</span>,
            },
            { titulo: "Equipamentos", classe: "w-32 text-right", celula: (s) => <Quantidade n={s.equipamentos} rotulo={`${s.equipamentos} equipamentos`} /> },
          ]}
          acoes={(s) => acoesItem("sistema", s, s.rotulo, () => setEditando({ aba: "sistemas", item: s }))}
        />
      </>
    ),
    memorias: (
      <>
        {comFiltros(
          <div className="sm:w-44">
            <SelecaoPersonalizada
              valor={filtroTipo}
              aoMudar={setFiltroTipo}
              opcoes={TIPOS_PADRAO_MEMORIA.map((t) => ({ valor: t, rotulo: ROTULO_PADRAO_MEMORIA[t] }))}
              vazio="Todos os tipos"
              aria-label="Tipo"
              destacado={Boolean(filtroTipo)}
            />
          </div>,
        )}
        <TabelaCatalogo
          rotulo="Padrões de memória"
          linhas={memoria}
          vazio="Nenhum padrão encontrado."
          principal={(p) => (p.tipo === "FREQUENCIA" ? `${p.valor} MHz` : p.valor)}
          detalhe={(p) => `${ROTULO_PADRAO_MEMORIA[p.tipo]} · ${p.componentes} componentes`}
          colunas={[
            { titulo: "Valor", celula: (p) => <span className="tabular block truncate font-semibold text-titulo">{p.tipo === "FREQUENCIA" ? `${p.valor} MHz` : p.valor}</span> },
            { titulo: "Tipo", classe: "w-36", celula: (p) => ROTULO_PADRAO_MEMORIA[p.tipo] },
            {
              titulo: "Componentes",
              classe: "w-32 text-right",
              celula: (p) => <Quantidade n={p.componentes} href={p.componentes ? "/ti/inventario?grupo=componentes" : undefined} rotulo={`${p.componentes} componentes`} />,
            },
          ]}
          acoes={(p) => acoesItem("memoria", p, p.valor, () => setEditando({ aba: "memorias", item: p }))}
        />
      </>
    ),
    checklists: (
      <>
        {comFiltros(
          <div className="sm:w-60">
            <SelecaoPersonalizada
              valor={categoriaChecklist}
              aoMudar={setFiltroCategoria}
              opcoes={lista.categorias.map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: qtd(totalPorCategoria.get(c.id) ?? 0, "pergunta", "perguntas") }))}
              aria-label="Categoria do equipamento"
              pesquisavel
            />
          </div>,
        )}
        <TabelaCatalogo
          rotulo="Perguntas do checklist de inspeção"
          linhas={perguntas}
          vazio={
            perguntasCategoria.length
              ? "Nenhuma pergunta encontrada."
              : "Esta categoria ainda não tem perguntas: as inspeções usam o checklist de Outro."
          }
          principal={(p) => p.atual.texto}
          detalhe={(p) => (
            <span className="inline-flex max-w-full items-center gap-1">
              <OrientacaoPergunta pergunta={p.atual} />
              <span className="truncate">
                {p.ordem}. {p.atual.grupo} · {p.atual.obrigatoria ? "obrigatória" : "opcional"}
                {p.atual.bloqueante ? " · bloqueante" : ""} · v{p.atual.versao}
              </span>
            </span>
          )}
          colunas={[
            {
              titulo: "Ordem",
              classe: "w-32",
              celula: (p) => (
                <div className="flex items-center gap-0.5">
                  <span className="tabular w-7 font-semibold text-titulo">{p.ordem}</span>
                  {pode ? (
                    <>
                      <BotaoIcone rotulo={`Subir ${p.atual.texto}`} dica="Subir" icone={ArrowUp} aoClicar={() => void moverPergunta(p, "acima")} desabilitado={pendente === p.id || p.ordem <= 1} />
                      <BotaoIcone
                        rotulo={`Descer ${p.atual.texto}`}
                        dica="Descer"
                        icone={ArrowDown}
                        aoClicar={() => void moverPergunta(p, "abaixo")}
                        desabilitado={pendente === p.id || p.ordem >= perguntasCategoria.length}
                      />
                    </>
                  ) : null}
                </div>
              ),
            },
            {
              titulo: "Pergunta",
              celula: (p) => (
                <div className="flex min-w-0 items-start gap-1">
                  <div className="min-w-0">
                    <span className="block truncate font-semibold text-titulo" title={p.atual.texto}>
                      {p.atual.texto}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {p.atual.grupo} · {ROTULO_APLICACAO[p.atual.aplicacao]}
                      {p.atual.partes.length ? ` · ${p.atual.partes.map((x) => ROTULO_PARTE[x]).join(", ")}` : ""}
                    </span>
                  </div>
                  <OrientacaoPergunta pergunta={p.atual} />
                </div>
              ),
            },
            {
              titulo: "Regras",
              classe: "hidden w-48 @4xl:table-cell",
              celula: (p) => (
                <div className="flex flex-wrap gap-1">
                  <StatusBadge tom="neutro">{p.atual.obrigatoria ? "Obrigatória" : "Opcional"}</StatusBadge>
                  {p.atual.bloqueante ? (
                    <StatusBadge tom="erro" icone={ShieldAlert}>
                      Bloqueante
                    </StatusBadge>
                  ) : null}
                </div>
              ),
            },
            {
              titulo: "Versão",
              classe: "w-28",
              celula: (p) => (
                <>
                  <span className="tabular font-semibold text-titulo">v{p.atual.versao}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{qtd(p.usos, "resposta", "respostas")}</span>
                </>
              ),
            },
          ]}
          acoes={(p) =>
            pode ? (
              <div className="flex justify-end gap-1">
                <BotaoIcone rotulo={`Editar ${p.atual.texto}`} dica="Editar" icone={Pencil} aoClicar={() => setEditando({ aba: "checklists", item: p })} />
                <BotaoIcone
                  rotulo={`${p.ativa ? "Inativar" : "Ativar"} ${p.atual.texto}`}
                  dica={p.ativa ? "Inativar" : "Ativar"}
                  icone={p.ativa ? Ban : CheckCircle2}
                  aoClicar={() => void situacaoPergunta(p)}
                  desabilitado={pendente === p.id}
                />
              </div>
            ) : null
          }
        />
      </>
    ),
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Catálogos do Inventário"
        trilha={[{ rotulo: "Inventário", href: "/ti/inventario" }, { rotulo: "Catálogos" }]}
        acoes={
          pode ? (
            <Button onClick={() => setEditando({ aba, item: null } as Edicao)} data-testid="cadastrar-catalogo">
              <Plus aria-hidden /> {ROTULO_CADASTRAR[aba]}
            </Button>
          ) : null
        }
      />

      <div role="tablist" aria-label="Catálogos" className="mb-3 overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
          {(Object.keys(ROTULO_ABA_CATALOGO) as AbaCatalogo[]).map((a) => {
            const Icone = ICONE_ABA[a];
            const ativa = a === aba;
            return (
              <button
                key={a}
                type="button"
                role="tab"
                id={`aba-${a}`}
                aria-selected={ativa}
                aria-controls="painel-catalogo"
                tabIndex={ativa ? 0 : -1}
                onClick={() => trocarAba(a)}
                onKeyDown={(e) => {
                  const abas = Object.keys(ROTULO_ABA_CATALOGO) as AbaCatalogo[];
                  const i = abas.indexOf(a);
                  const proxima = e.key === "ArrowRight" ? abas[(i + 1) % abas.length] : e.key === "ArrowLeft" ? abas[(i - 1 + abas.length) % abas.length] : null;
                  if (!proxima) return;
                  e.preventDefault();
                  trocarAba(proxima);
                  document.getElementById(`aba-${proxima}`)?.focus();
                }}
                className={cn(
                  "flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors lg:h-9",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  ativa ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {ROTULO_ABA_CATALOGO[a]}
              </button>
            );
          })}
        </div>
      </div>

      <section id="painel-catalogo" role="tabpanel" aria-labelledby={`aba-${aba}`} className="@container overflow-hidden rounded-2xl border bg-card shadow-nivel-1" data-testid={`catalogo-${aba}`}>
        <Fragment key={[aba, busca, situacao, filtroMarca, filtroCategoria, filtroTipo].join("|")}>{conteudo[aba]}</Fragment>
      </section>

      {marcaAberta ? <DialogoModelosMarca marca={marcaAberta} aoFechar={() => setMarcaAberta(null)} /> : null}

      {editando?.aba === "categorias" ? (
        <DialogoCategoria categoria={editando.item as CategoriaCatalogo | null} aoFechar={() => setEditando(null)} aoSalvar={(_c, m) => concluir(m)} />
      ) : null}
      {editando?.aba === "marcas" ? <DialogoMarca marca={editando.item} aoFechar={() => setEditando(null)} aoSalvar={(_m, msg) => concluir(msg)} /> : null}
      {editando?.aba === "modelos" ? (
        <DialogoModelo
          modelo={editando.item}
          marcas={catalogos.marcas}
          categorias={categoriasSimples}
          podeCriarMarca={pode}
          aoNovaMarca={() => router.refresh()}
          aoFechar={() => setEditando(null)}
          aoSalvar={(_m, msg) => concluir(msg)}
        />
      ) : null}
      {editando?.aba === "processadores" ? (
        <DialogoProcessador processador={editando.item} prefixoNotebook={prefixoNotebook} aoFechar={() => setEditando(null)} aoSalvar={(_p, msg) => concluir(msg)} />
      ) : null}
      {editando?.aba === "sistemas" ? (
        <DialogoSistema
          sistema={editando.item}
          categorias={categoriasSimples.filter((c) => COM_CONFIGURACAO.some((t) => t === c.tipo) && (c.ativa || editando.item?.categoriaIds.includes(c.id)))}
          aoFechar={() => setEditando(null)}
          aoSalvar={(_s, msg) => concluir(msg)}
        />
      ) : null}
      {editando?.aba === "checklists" ? (
        <DialogoPerguntaInspecao
          pergunta={editando.item}
          categorias={lista.categorias.map((c) => ({ id: c.id, nome: c.nome, ativa: c.ativa, tipo: c.tipo }))}
          categoriaInicial={categoriaChecklist}
          grupos={[...new Set(perguntasCategoria.map((p) => p.atual.grupo))]}
          aoFechar={() => setEditando(null)}
          aoSalvar={(msg) => concluir(msg)}
        />
      ) : null}
      {editando?.aba === "memorias" ? (
        <DialogoPadraoMemoria padrao={editando.item} tipoInicial={(filtroTipo || undefined) as Padrao["tipo"] | undefined} aoFechar={() => setEditando(null)} aoSalvar={(_p, msg) => concluir(msg)} />
      ) : null}

      <AlertDialog open={Boolean(excluir)} onOpenChange={(v) => !v && !pendente && setExcluir(null)}>
        <AlertDialogContent data-testid="confirmar-exclusao-categoria">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>{excluir?.nome} sai do catálogo. Ela não tem equipamentos vinculados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendente)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" carregando={Boolean(pendente)} rotuloCarregando="Excluindo…" onClick={() => void confirmarExclusao()}>
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
