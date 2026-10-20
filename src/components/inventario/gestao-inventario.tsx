"use client";

import { ChartNoAxesColumn, ChevronRight, Laptop, MemoryStick, PackageSearch, Pencil, Plus, Tags, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import type { DefFiltro } from "@/components/empresas/registros/barra-filtros";
import { CabecalhoPagina, EstadoVazio } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, Paginacao, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ehComponente, formatarCapacidade } from "@/lib/componentes";
import { ROTULO_SITUACAO, SITUACOES_COMPONENTE, SITUACOES_EQUIPAMENTO } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoEquipamento } from "@/server/acoes/inventario";
import type { FichaEquipamento, ResultadoInventario } from "@/server/modulos/inventario";
import { DialogoEquipamento, type CatalogoCadastro, type EmpresaOpcaoInventario } from "./dialogo-equipamento";
import { CartoesInventario, VisaoGeralInventario, type GrupoInventario } from "./indicadores-inventario";
import { identificacao, MiniaturaEquipamento } from "./visual";

type Linha = ResultadoInventario["linhas"][number];

const BASE = "/ti/inventario";
const ID_VISAO_GERAL = "visao-geral-inventario";
const th = "h-10 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
const td = "px-3 py-2 align-middle first:pl-5 last:pr-5";

/** Equipamentos e componentes internos (RAM, SSD, HD) em listas e números separados. */
function AbasGrupo({ grupo, visao }: { grupo: GrupoInventario; visao?: string }) {
  const abas = [
    { id: "equipamentos" as const, rotulo: "Equipamentos", icone: Laptop, href: visao ? `${BASE}?visao=${visao}` : BASE },
    { id: "componentes" as const, rotulo: "Componentes internos", icone: MemoryStick, href: `${BASE}?grupo=componentes${visao ? `&visao=${visao}` : ""}` },
  ];
  return (
    <nav aria-label="Grupos do inventário" className="mb-3 overflow-x-auto">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {abas.map((a) => {
          const ativa = a.id === grupo;
          return (
            <li key={a.id} className="flex-1 sm:flex-none">
              <Link
                href={a.href}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors lg:h-9",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  ativa ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
                )}
              >
                <a.icone className="size-4" aria-hidden />
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function GestaoInventario({
  resultado,
  parametros: parametrosServidor,
  filtrando,
  empresas,
  podeCadastrar,
  podeEditar,
  grupo = "equipamentos",
  catalogo,
}: {
  resultado: ResultadoInventario;
  parametros: Parametros;
  filtrando: boolean;
  empresas: EmpresaOpcaoInventario[];
  podeCadastrar: boolean;
  podeEditar: boolean;
  grupo?: GrupoInventario;
  catalogo: CatalogoCadastro;
}) {
  const componentes = grupo === "componentes";
  // Filtro "Tipo": categorias do catálogo deste grupo (inativas aparecem marcadas).
  const opcoesTipo = catalogo.categorias
    .filter((c) => ehComponente(c.tipo) === componentes)
    .map((c) => ({ valor: c.id, rotulo: c.ativa ? c.nome : `${c.nome} (inativa)` }));
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const [formulario, setFormulario] = useState<{ aberto: boolean; equipamento: FichaEquipamento | null; chave: number }>({
    aberto: podeCadastrar && busca.get("cadastrar") === "1",
    equipamento: null,
    chave: 0,
  });
  const [carregandoEdicao, setCarregandoEdicao] = useState<string | null>(null);

  // Visão geral recolhida por padrão. O estado fica na URL (sem ida ao servidor) e segue nos
  // links de filtro, ordenação e paginação, e na volta da ficha.
  const visaoAberta = busca.get("visao") === "geral";
  const parametros: Parametros = { ...parametrosServidor, visao: visaoAberta ? "geral" : undefined };
  function alternarVisao() {
    const p = new URLSearchParams(busca.toString());
    if (visaoAberta) p.delete("visao");
    else p.set("visao", "geral");
    window.history.replaceState(null, "", p.size ? `${caminho}?${p}` : caminho);
  }

  const abrirCadastro = () => setFormulario((f) => ({ aberto: true, equipamento: null, chave: f.chave + 1 }));
  async function editar(id: string) {
    setCarregandoEdicao(id);
    const r = await acaoEquipamento(id).catch(() => null);
    setCarregandoEdicao(null);
    if (!r?.ok) {
      toast.error(r?.erro ?? "Não foi possível carregar o equipamento. Tente novamente.");
      return;
    }
    setFormulario((f) => ({ aberto: true, equipamento: r.dados, chave: f.chave + 1 }));
  }
  const mudarFormulario = (aberto: boolean) => {
    setFormulario((f) => ({ ...f, aberto, chave: aberto ? f.chave : f.chave + 1 }));
    if (!aberto && busca.get("cadastrar")) {
      const p = new URLSearchParams(busca.toString());
      p.delete("cadastrar");
      router.replace(p.size ? `${caminho}?${p}` : caminho, { scroll: false });
    }
  };

  const { total, totalGeral } = resultado;
  const [singular, plural] = componentes ? ["componente", "componentes"] : ["equipamento", "equipamentos"];
  // Marca e modelo pelos catálogos; o modelo depende da marca (trocar a marca limpa o modelo).
  const filtroMarca: DefFiltro = {
    chave: "marca",
    rotulo: "Marca",
    todos: "Todas as marcas",
    opcoes: resultado.marcas.map((m) => ({ valor: m.id, rotulo: m.nome })),
    valor: parametros.marca ?? "",
    pesquisavel: true,
    limpa: ["modelo"],
  };
  const filtroModelo: DefFiltro = {
    chave: "modelo",
    rotulo: "Modelo",
    todos: "Todos os modelos",
    opcoes: resultado.modelos.map((m) => ({ valor: m.id, rotulo: m.nome })),
    valor: parametros.modelo ?? "",
    pesquisavel: true,
  };
  const resumo = filtrando ? `${total} de ${totalGeral} ${totalGeral === 1 ? singular : plural}` : `${total} ${total === 1 ? singular : plural}`;
  const rotuloCadastrar = componentes ? "Cadastrar componente" : "Cadastrar equipamento";

  // Rótulos curtos abaixo de 1280 px, onde os três botões não cabem ao lado do título.
  const acoes = (
    <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
      <Button variant="secondary" aria-expanded={visaoAberta} aria-controls={ID_VISAO_GERAL} onClick={alternarVisao}>
        <ChartNoAxesColumn aria-hidden />
        <span className="xl:hidden">Visão geral</span>
        <span className="hidden xl:inline">{visaoAberta ? "Ocultar visão geral" : "Ver visão geral"}</span>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/ti/inventario/categorias">
          <Tags aria-hidden /> Categorias
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/ti/inventario/manutencoes" aria-label="Ver equipamentos em manutenção">
          <Wrench aria-hidden />
          <span className="xl:hidden">Manutenção</span>
          <span className="hidden xl:inline">Ver equipamentos em manutenção</span>
        </Link>
      </Button>
      {podeCadastrar ? (
        <Button onClick={abrirCadastro} data-testid={componentes ? "cadastrar-componente" : "cadastrar-equipamento"} className="col-span-3">
          <Plus aria-hidden /> {rotuloCadastrar}
        </Button>
      ) : null}
    </div>
  );

  const acoesLinha = (l: Linha, semFicha?: boolean) => (
    <div className="flex justify-end gap-1">
      {podeEditar ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${identificacao(l)}`} carregando={carregandoEdicao === l.id} onClick={() => void editar(l.id)}>
              <Pencil aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{componentes ? "Editar componente" : "Editar equipamento"}</TooltipContent>
        </Tooltip>
      ) : null}
      {semFicha ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/ti/inventario/${l.id}`} aria-label={`Abrir ficha de ${identificacao(l)}`}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir ficha</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <>
      <CabecalhoPagina titulo="Inventário" acoes={acoes} />
      <AbasGrupo grupo={grupo} visao={parametros.visao} />
      <CartoesInventario indicadores={resultado.indicadores} base={BASE} parametros={parametros} grupo={grupo} />
      <VisaoGeralInventario id={ID_VISAO_GERAL} aberta={visaoAberta} indicadores={resultado.indicadores} totalLista={total} base={BASE} parametros={parametros} grupo={grupo} />

      {/* As colunas respondem à largura do próprio cartão (container), não à da janela. */}
      <div className="@container overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b px-4 py-3 sm:px-5">
          {componentes ? (
            <FiltrosUrl
              compacta
              busca={parametros.busca ?? ""}
              placeholder="Pesquisar por identificação, série, modelo ou marca"
              rotuloBusca="Pesquisar componentes"
              chavesFiltro={["tipo", "marca", "modelo", "capacidade", "situacao", "notebook"]}
              resumo={resumo}
              filtros={[
                { chave: "tipo", rotulo: "Tipo", todos: "Todos os tipos", opcoes: opcoesTipo, valor: parametros.tipo ?? "" },
                filtroMarca,
                filtroModelo,
                {
                  chave: "capacidade",
                  rotulo: "Capacidade",
                  todos: "Todas as capacidades",
                  opcoes: resultado.capacidades.map((c) => ({ valor: String(c), rotulo: formatarCapacidade(c) })),
                  valor: parametros.capacidade ?? "",
                },
                { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: SITUACOES_COMPONENTE.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })), valor: parametros.situacao ?? "" },
                {
                  chave: "notebook",
                  rotulo: "Notebook",
                  todos: "Todos os notebooks",
                  opcoes: resultado.notebooks.map((n) => ({ valor: n.id, rotulo: n.nome })),
                  valor: parametros.notebook ?? "",
                  pesquisavel: true,
                },
              ]}
            />
          ) : (
          <FiltrosUrl
            compacta
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por nome, patrimônio, série, modelo ou marca"
            rotuloBusca="Pesquisar equipamentos"
            chavesFiltro={["empresa", "tipo", "marca", "modelo", "situacao"]}
            resumo={resumo}
            filtros={[
              {
                chave: "empresa",
                rotulo: "Empresa",
                todos: "Todas as empresas",
                opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome })),
                valor: parametros.empresa ?? "",
                pesquisavel: true,
              },
              { chave: "tipo", rotulo: "Tipo", todos: "Todos os tipos", opcoes: opcoesTipo, valor: parametros.tipo ?? "", pesquisavel: true },
              filtroMarca,
              filtroModelo,
              { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })), valor: parametros.situacao ?? "" },
            ]}
          />
          )}
        </div>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={componentes ? MemoryStick : PackageSearch}
            titulo={filtrando ? `Nenhum ${singular} encontrado` : `Nenhum ${singular} cadastrado`}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : componentes ? "Cadastre memórias, SSDs e HDs para controlá-los no estoque." : "Cadastre o primeiro equipamento para começar."}
            acao={!filtrando && podeCadastrar ? <Button onClick={abrirCadastro}>{rotuloCadastrar}</Button> : undefined}
          />
        ) : componentes ? (
          <TabelaComponentes resultado={resultado} parametros={parametros} acoesLinha={acoesLinha} total={total} />
        ) : (
          <>
            {/*
              Larguras pelo conteúdo: Tipo, Situação e Ações têm a medida do maior valor possível
              ("Kit teclado e mouse", "Devolvido em avaliação", dois botões); o espaço que sobra
              vai para os textos longos (modelo e empresa). Cartão estreito: o tipo e o modelo
              passam para a segunda linha do equipamento e a empresa vira sigla.
            */}
            <div className="hidden @2xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Equipamentos do inventário</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="nome" className={cn(th, "@5xl:w-44")}>Equipamento</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="tipo" className={cn(th, "hidden w-38 @4xl:table-cell")}>Tipo</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="marca" className={cn(th, "hidden w-36 @5xl:table-cell")}>Marca</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="empresa" className={cn(th, "w-24 @4xl:w-auto")}>Empresa</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="situacao" className={cn(th, "w-50")}>Situação</CabecalhoOrdenavel>
                    <th scope="col" className={cn(th, "w-30 text-right lg:w-26")}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((l) => (
                    <tr key={l.id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={(e) => !(e.target as HTMLElement).closest("a,button") && router.push(`/ti/inventario/${l.id}`)}>
                      <td className={td}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <MiniaturaEquipamento url={l.miniatura} categoria={l.categoria} className="size-8 rounded-md" />
                          <span className="min-w-0">
                            {/* Sem nome de dispositivo, o patrimônio identifica o item (não é coluna da tabela). */}
                            <Link
                              href={`/ti/inventario/${l.id}`}
                              className="tabular block truncate rounded-sm font-semibold text-titulo underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {identificacao(l)}
                            </Link>
                            <span className="block truncate text-[12.5px] text-muted-foreground @5xl:hidden" title={`${l.tipo} · ${l.marca}`}>
                              <span className="@4xl:hidden">{l.tipo} · </span>
                              {l.marca}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className={cn(td, "hidden truncate @4xl:table-cell")} title={l.tipo}>{l.tipo}</td>
                      <td className={cn(td, "hidden @5xl:table-cell")}>
                        <span className="block truncate" title={l.marca}>
                          {l.marca}
                        </span>
                      </td>
                      <td className={td} title={l.empresa.nome}>
                        <span className="hidden truncate @4xl:block">{l.empresa.nome}</span>
                        <span className="block truncate @4xl:hidden">{l.empresa.sigla}</span>
                      </td>
                      <td className={td}>
                        <Estado grupo="ativo" valor={l.situacao} />
                      </td>
                      <td className={td}>{acoesLinha(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y @2xl:hidden">
              {resultado.linhas.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <MiniaturaEquipamento url={l.miniatura} categoria={l.categoria} tamanho="md" />
                  <Link href={`/ti/inventario/${l.id}`} className="min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="tabular block truncate font-semibold text-titulo">{identificacao(l)}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {l.tipo} · {l.marca} · {l.empresa.sigla}
                    </span>
                    <span className="mt-1 flex">
                      <Estado grupo="ativo" valor={l.situacao} />
                    </span>
                  </Link>
                  {acoesLinha(l, true)}
                </li>
              ))}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={total} rotulo="equipamentos" />
          </>
        )}
      </div>

      <DialogoEquipamento
        key={formulario.chave}
        aberto={formulario.aberto}
        aoMudar={mudarFormulario}
        equipamento={formulario.equipamento}
        empresas={empresas}
        grupo={grupo}
        catalogo={catalogo}
      />
    </>
  );
}

/**
 * Componentes internos: identificação, tipo, especificação, fabricante, notebook em que está
 * instalado e situação. Mesmas regras de largura da tabela de equipamentos (pelo conteúdo).
 */
function TabelaComponentes({
  resultado,
  parametros,
  acoesLinha,
  total,
}: {
  resultado: ResultadoInventario;
  parametros: Parametros;
  acoesLinha: (l: Linha, semFicha?: boolean) => React.ReactNode;
  total: number;
}) {
  const router = useRouter();
  const notebook = (l: Linha) =>
    l.instaladoEm ? (
      <Link href={`/ti/inventario/${l.instaladoEm.id}`} className="tabular rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {l.instaladoEm.nome}
      </Link>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  const especificacao = (l: Linha) => [l.especificacao, l.formato].filter(Boolean).join(" · ");
  return (
    <>
      <div className="hidden @2xl:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Componentes internos do inventário</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="nome" className={cn(th, "@5xl:w-36")}>Componente</CabecalhoOrdenavel>
              <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="tipo" className={cn(th, "hidden w-32 @4xl:table-cell")}>Tipo</CabecalhoOrdenavel>
              <th scope="col" className={cn(th, "hidden @4xl:table-cell")}>Especificação</th>
              <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="marca" className={cn(th, "hidden w-36 @5xl:table-cell")}>Marca</CabecalhoOrdenavel>
              <th scope="col" className={cn(th, "w-28")}>Notebook</th>
              <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="situacao" className={cn(th, "w-50")}>Situação</CabecalhoOrdenavel>
              <th scope="col" className={cn(th, "w-30 text-right lg:w-26")}>Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {resultado.linhas.map((l) => (
              <tr key={l.id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={(e) => !(e.target as HTMLElement).closest("a,button") && router.push(`/ti/inventario/${l.id}`)}>
                <td className={td}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MiniaturaEquipamento url={l.miniatura} categoria={l.categoria} className="size-8 rounded-md" />
                    <span className="min-w-0">
                      <Link
                        href={`/ti/inventario/${l.id}`}
                        className="tabular block truncate rounded-sm font-semibold text-titulo underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {identificacao(l)}
                      </Link>
                      <span className="block truncate text-[12.5px] text-muted-foreground @4xl:hidden">
                        {l.tipo} · {l.especificacao}
                      </span>
                    </span>
                  </span>
                </td>
                <td className={cn(td, "hidden truncate @4xl:table-cell")} title={l.tipo}>{l.tipo}</td>
                <td className={cn(td, "hidden truncate @4xl:table-cell")} title={especificacao(l)}>
                  {especificacao(l)}
                </td>
                <td className={cn(td, "hidden @5xl:table-cell")}>
                  <span className="block truncate" title={l.marca}>
                    {l.marca}
                  </span>
                </td>
                <td className={cn(td, "truncate")}>{notebook(l)}</td>
                <td className={td}>
                  <Estado grupo="ativo" valor={l.situacao} />
                </td>
                <td className={td}>{acoesLinha(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y @2xl:hidden">
        {resultado.linhas.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <MiniaturaEquipamento url={l.miniatura} categoria={l.categoria} tamanho="md" />
            <Link href={`/ti/inventario/${l.id}`} className="min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="tabular block truncate font-semibold text-titulo">{identificacao(l)}</span>
              <span className="block truncate text-[13px] text-muted-foreground">
                {l.tipo} · {l.especificacao} · {l.marca}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Estado grupo="ativo" valor={l.situacao} />
                {l.instaladoEm ? <span className="tabular text-[12.5px] text-muted-foreground">em {l.instaladoEm.nome}</span> : null}
              </span>
            </Link>
            {acoesLinha(l, true)}
          </li>
        ))}
      </ul>
      <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={total} rotulo="componentes" />
    </>
  );
}
