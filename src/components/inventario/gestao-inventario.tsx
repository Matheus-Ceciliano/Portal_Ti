"use client";

import { ChartNoAxesColumn, ChevronRight, PackageSearch, Pencil, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import { CabecalhoPagina, EstadoVazio } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, Paginacao, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORIAS, ROTULO_CATEGORIA, ROTULO_SITUACAO, SITUACOES } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoEquipamento } from "@/server/acoes/inventario";
import type { FichaEquipamento, ResultadoInventario } from "@/server/modulos/inventario";
import { DialogoEquipamento, type EmpresaOpcaoInventario } from "./dialogo-equipamento";
import { CartoesInventario, VisaoGeralInventario } from "./indicadores-inventario";
import { identificacao, MiniaturaEquipamento } from "./visual";

type Linha = ResultadoInventario["linhas"][number];

const BASE = "/ti/inventario";
const ID_VISAO_GERAL = "visao-geral-inventario";
const th = "h-10 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
const td = "px-3 py-2 align-middle first:pl-5 last:pr-5";

export function GestaoInventario({
  resultado,
  parametros: parametrosServidor,
  filtrando,
  empresas,
  podeCadastrar,
  podeEditar,
}: {
  resultado: ResultadoInventario;
  parametros: Parametros;
  filtrando: boolean;
  empresas: EmpresaOpcaoInventario[];
  podeCadastrar: boolean;
  podeEditar: boolean;
}) {
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
  const resumo = filtrando ? `${total} de ${totalGeral} ${totalGeral === 1 ? "equipamento" : "equipamentos"}` : `${total} ${total === 1 ? "equipamento" : "equipamentos"}`;

  // Rótulos curtos abaixo de 1280 px, onde os três botões não cabem ao lado do título.
  const acoes = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
      <Button variant="secondary" aria-expanded={visaoAberta} aria-controls={ID_VISAO_GERAL} onClick={alternarVisao}>
        <ChartNoAxesColumn aria-hidden />
        <span className="xl:hidden">Visão geral</span>
        <span className="hidden xl:inline">{visaoAberta ? "Ocultar visão geral" : "Ver visão geral"}</span>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/ti/inventario/manutencoes" aria-label="Ver equipamentos em manutenção">
          <Wrench aria-hidden />
          <span className="xl:hidden">Manutenção</span>
          <span className="hidden xl:inline">Ver equipamentos em manutenção</span>
        </Link>
      </Button>
      {podeCadastrar ? (
        <Button onClick={abrirCadastro} data-testid="cadastrar-equipamento" className="col-span-2">
          <Plus aria-hidden /> Cadastrar equipamento
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
          <TooltipContent>Editar equipamento</TooltipContent>
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
      <CartoesInventario indicadores={resultado.indicadores} base={BASE} parametros={parametros} />
      <VisaoGeralInventario id={ID_VISAO_GERAL} aberta={visaoAberta} indicadores={resultado.indicadores} totalLista={total} base={BASE} parametros={parametros} />

      {/* As colunas respondem à largura do próprio cartão (container), não à da janela. */}
      <div className="@container overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b px-4 py-3 sm:px-5">
          <FiltrosUrl
            compacta
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por nome, patrimônio, série, modelo ou marca"
            rotuloBusca="Pesquisar equipamentos"
            chavesFiltro={["empresa", "tipo", "marca", "situacao"]}
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
              { chave: "tipo", rotulo: "Tipo", todos: "Todos os tipos", opcoes: CATEGORIAS.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] })), valor: parametros.tipo ?? "", pesquisavel: true },
              { chave: "marca", rotulo: "Marca", todos: "Todas as marcas", opcoes: resultado.marcas.map((m) => ({ valor: m, rotulo: m })), valor: parametros.marca ?? "", pesquisavel: true },
              { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })), valor: parametros.situacao ?? "" },
            ]}
          />
        </div>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={PackageSearch}
            titulo={filtrando ? "Nenhum equipamento encontrado" : "Nenhum equipamento cadastrado"}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : "Cadastre o primeiro equipamento para começar."}
            acao={!filtrando && podeCadastrar ? <Button onClick={abrirCadastro}>Cadastrar equipamento</Button> : undefined}
          />
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
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="marca" className={cn(th, "hidden @5xl:table-cell")}>Marca / modelo</CabecalhoOrdenavel>
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
                            <span className="block truncate text-[12.5px] text-muted-foreground @5xl:hidden" title={`${ROTULO_CATEGORIA[l.categoria]} · ${l.marca} ${l.modelo}`}>
                              <span className="@4xl:hidden">{ROTULO_CATEGORIA[l.categoria]} · </span>
                              {l.marca} {l.modelo}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className={cn(td, "hidden truncate @4xl:table-cell")}>{ROTULO_CATEGORIA[l.categoria]}</td>
                      <td className={cn(td, "hidden @5xl:table-cell")}>
                        <span className="block truncate" title={`${l.marca} ${l.modelo}`}>
                          <span className="font-medium text-titulo">{l.marca}</span> {l.modelo}
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
                      {ROTULO_CATEGORIA[l.categoria]} · {l.marca} {l.modelo} · {l.empresa.sigla}
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
        marcas={resultado.marcas}
      />
    </>
  );
}
