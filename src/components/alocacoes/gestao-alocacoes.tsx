"use client";

import { CalendarClock, CheckCircle2, Eye, FileClock, PackageCheck, Plus, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import { CabecalhoPagina, EstadoVazio, formatarData } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { hrefCom, Paginacao, type Parametros } from "@/components/comum/tabela";
import { BadgeTer, formatarDataHora } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LinhaAlocacao, ResultadoAlocacoes } from "@/server/modulos/alocacoes";
import { DialogoDetalhesAlocacao, type AlocacaoCabecalho, type PermissoesAlocacao } from "./dialogo-detalhes-alocacao";
import { DialogoNovaAlocacao } from "./dialogo-nova-alocacao";

const BASE = "/ti/alocacoes";
const th = "h-11 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5";
const td = "px-3 py-2.5 align-middle first:pl-5";

const ESTADOS = [
  { valor: "ATIVA", rotulo: "Entregue" },
  { valor: "RESERVADA", rotulo: "Reserva" },
  { valor: "ENCERRADA", rotulo: "Encerrada" },
  { valor: "CANCELADA", rotulo: "Cancelada" },
];

function Equipamentos({ l }: { l: LinhaAlocacao }) {
  const principais = l.itens.filter((i) => i.categoria !== "CARREGADOR");
  const lista = principais.length ? principais : l.itens;
  const extras = l.itens.length - Math.min(2, lista.length);
  return (
    <span className="block min-w-0">
      <span className="tabular block truncate font-medium text-titulo" title={l.itens.map((i) => i.rotulo).join(", ")}>
        {lista
          .slice(0, 2)
          .map((i) => i.rotulo)
          .join(", ")}
      </span>
      <span className="block text-[12.5px] text-muted-foreground">
        {l.itens.length} {l.itens.length === 1 ? "item" : "itens"}
        {extras > 0 ? ` · +${extras}` : ""}
      </span>
    </span>
  );
}

const data = (l: LinhaAlocacao) =>
  l.entregueEm ? (
    <span className="tabular">{formatarDataHora(l.entregueEm)}</span>
  ) : (
    <span className="text-muted-foreground">{l.previstaPara ? `Prevista ${formatarData(l.previstaPara)}` : "Sem data"}</span>
  );

export function GestaoAlocacoes({
  resultado,
  parametros,
  filtrando,
  empresas,
  colaboradores,
  podeCriar,
  podeEntregar,
  pode,
}: {
  resultado: ResultadoAlocacoes;
  parametros: Parametros;
  filtrando: boolean;
  empresas: { id: string; nome: string }[];
  colaboradores: { id: string; nome: string }[];
  podeCriar: boolean;
  podeEntregar: boolean;
  pode: PermissoesAlocacao;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const [nova, setNova] = useState({ aberto: podeCriar && busca.get("nova") === "1", chave: 0 });
  const inicialUrl = busca.get("alocacao");
  const [detalhe, setDetalhe] = useState<AlocacaoCabecalho | null>(() => {
    if (!inicialUrl) return null;
    const l = resultado.linhas.find((x) => x.id === inicialUrl);
    return { id: inicialUrl, numero: l?.numero ?? "Alocação", colaborador: l?.colaborador.nome ?? "", estado: l?.estado ?? "ATIVA" };
  });

  /** Fechar remove os parâmetros de abertura direta da URL. */
  const limparUrl = (chave: string) => {
    if (!busca.get(chave)) return;
    const p = new URLSearchParams(busca.toString());
    p.delete(chave);
    router.replace(p.size ? `${caminho}?${p}` : caminho, { scroll: false });
  };
  const ver = (l: LinhaAlocacao) => setDetalhe({ id: l.id, numero: l.numero, colaborador: l.colaborador.nome, estado: l.estado });
  const i = resultado.indicadores;
  const indicadores: { titulo: string; valor: number; icone: LucideIcon; tom: string; filtro: Parametros }[] = [
    { titulo: "Entregas ativas", valor: i.ativas, icone: CheckCircle2, tom: "text-sucesso", filtro: { situacao: "ATIVA" } },
    { titulo: "Reservas", valor: i.reservas, icone: CalendarClock, tom: "text-atencao", filtro: { situacao: "RESERVADA" } },
    { titulo: "Equipamentos entregues", valor: i.equipamentosEntregues, icone: Truck, tom: "text-info", filtro: { situacao: "ATIVA" } },
    { titulo: "Entregas sem TER assinado", valor: i.terPendente, icone: FileClock, tom: "text-atencao", filtro: { situacao: "ATIVA" } },
  ];
  const resumo = filtrando ? `${resultado.total} de ${resultado.totalGeral} alocações` : `${resultado.total} ${resultado.total === 1 ? "alocação" : "alocações"}`;

  return (
    <>
      <CabecalhoPagina
        titulo="Alocações"
        trilha={[{ rotulo: "Inventário", href: "/ti/inventario" }, { rotulo: "Alocações" }]}
        acoes={
          podeCriar ? (
            <Button onClick={() => setNova((n) => ({ aberto: true, chave: n.chave + 1 }))} data-testid="nova-alocacao">
              <Plus aria-hidden /> Nova alocação
            </Button>
          ) : null
        }
      />

      <ul className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="indicadores-alocacoes">
        {indicadores.map((c) => {
          const ativo = parametros.situacao === c.filtro.situacao && c.titulo !== "Equipamentos entregues" && c.titulo !== "Entregas sem TER assinado";
          return (
            <li key={c.titulo} className="flex">
              <Link
                href={hrefCom(BASE, { ...parametros, pagina: undefined }, ativo ? { situacao: undefined } : c.filtro)}
                aria-label={`${c.titulo}: ${c.valor}. Filtrar a lista`}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-foreground/25 hover:bg-muted/60",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
                  ativo && "border-primary bg-accent/70 dark:border-link",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 font-semibold text-muted-foreground">
                  <c.icone className={cn("size-4 shrink-0", c.tom)} aria-hidden />
                  <span className="truncate">{c.titulo}</span>
                </span>
                <span className="tabular text-lg leading-6 font-bold text-titulo">{c.valor}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b p-4 sm:px-5">
          <FiltrosUrl
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por número, colaborador, patrimônio ou equipamento"
            rotuloBusca="Pesquisar alocações"
            chavesFiltro={["colaborador", "empresaColaborador", "empresaProprietaria", "periodo", "situacao"]}
            resumo={resumo}
            filtros={[
              { chave: "colaborador", rotulo: "Colaborador", todos: "Todos os colaboradores", opcoes: colaboradores.map((c) => ({ valor: c.id, rotulo: c.nome })), valor: parametros.colaborador ?? "", pesquisavel: true },
              { chave: "empresaColaborador", rotulo: "Empresa do colaborador", todos: "Empresa do colaborador: todas", opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome })), valor: parametros.empresaColaborador ?? "", pesquisavel: true },
              { chave: "empresaProprietaria", rotulo: "Empresa proprietária", todos: "Empresa proprietária: todas", opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome })), valor: parametros.empresaProprietaria ?? "", pesquisavel: true },
              {
                chave: "periodo",
                rotulo: "Período",
                todos: "Qualquer período",
                opcoes: [
                  { valor: "30", rotulo: "Últimos 30 dias" },
                  { valor: "90", rotulo: "Últimos 90 dias" },
                  { valor: "365", rotulo: "Últimos 12 meses" },
                ],
                valor: parametros.periodo ?? "",
              },
              { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: ESTADOS, valor: parametros.situacao ?? "" },
            ]}
          />
        </div>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={PackageCheck}
            titulo={filtrando ? "Nenhuma alocação encontrada" : "Nenhuma alocação registrada"}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : "Registre a primeira entrega de equipamentos."}
            acao={!filtrando && podeCriar ? <Button onClick={() => setNova((n) => ({ aberto: true, chave: n.chave + 1 }))}>Nova alocação</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Alocações de equipamentos</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th scope="col" className={cn(th, "w-[18%] lg:w-[13%]")}>Número</th>
                    <th scope="col" className={cn(th, "w-[25%] lg:w-[20%]")}>Colaborador</th>
                    <th scope="col" className={cn(th, "w-[25%] lg:w-[21%]")}>Equipamentos</th>
                    <th scope="col" className={cn(th, "hidden lg:table-cell lg:w-[10%]")}>Proprietária</th>
                    <th scope="col" className={cn(th, "hidden lg:table-cell lg:w-[14%]")}>Entrega</th>
                    <th scope="col" className={cn(th, "w-[20%] lg:w-[14%]")}>Situação</th>
                    <th scope="col" className={cn(th, "w-[88px] pr-5 text-right")}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((l) => (
                    <tr key={l.id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={(e) => !(e.target as HTMLElement).closest("a,button") && ver(l)}>
                      <td className={cn(td, "tabular font-semibold whitespace-nowrap text-titulo")}>{l.numero}</td>
                      <td className={td}>
                        <Link href={`/ti/cadastros/pessoas/${l.colaborador.id}`} className="block truncate font-medium text-titulo underline-offset-4 hover:underline">
                          {l.colaborador.nome}
                        </Link>
                        <span className="block truncate text-[12.5px] text-muted-foreground" title={l.empresaColaborador.nome}>
                          {l.empresaColaborador.sigla}
                        </span>
                      </td>
                      <td className={td}>
                        <Equipamentos l={l} />
                      </td>
                      <td className={cn(td, "hidden lg:table-cell")}>
                        <span className="flex flex-wrap gap-1">
                          {l.proprietarias.map((p) => (
                            <StatusBadge key={p.id} tom={p.id === l.empresaColaborador.id ? "neutro" : "info"} className="text-[11px]">
                              <span title={p.nome}>{p.sigla}</span>
                            </StatusBadge>
                          ))}
                        </span>
                      </td>
                      <td className={cn(td, "hidden text-[13px] lg:table-cell")}>{data(l)}</td>
                      <td className={td}>
                        <span className="flex flex-col items-start gap-1">
                          <Estado grupo="alocacao" valor={l.estado} />
                          {l.estado === "ATIVA" || l.estado === "ENCERRADA" ? <BadgeTer estado={l.ter?.estado ?? null} /> : null}
                        </span>
                      </td>
                      <td className={cn(td, "pr-5 text-right")}>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ver detalhes de ${l.numero}`} onClick={() => ver(l)}>
                          <Eye aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {resultado.linhas.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => ver(l)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none">
                    <span className="flex items-center justify-between gap-2">
                      <span className="tabular font-semibold text-titulo">{l.numero}</span>
                      <Estado grupo="alocacao" valor={l.estado} />
                    </span>
                    <span className="truncate text-[13.5px] text-titulo">
                      {l.colaborador.nome} <span className="text-muted-foreground">· {l.empresaColaborador.sigla}</span>
                    </span>
                    <span className="truncate text-[12.5px] text-muted-foreground">
                      {l.itens.map((x) => x.rotulo).join(", ")}
                    </span>
                    <span className="text-[12.5px]">{data(l)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} rotulo="alocações" />
          </>
        )}
      </div>

      <DialogoDetalhesAlocacao
        inicial={detalhe}
        aoFechar={() => {
          setDetalhe(null);
          limparUrl("alocacao");
        }}
        pode={pode}
      />
      {podeCriar ? (
        <DialogoNovaAlocacao
          key={nova.chave}
          aberto={nova.aberto}
          aoMudar={(v) => {
            setNova((n) => ({ aberto: v, chave: v ? n.chave : n.chave + 1 }));
            if (!v) limparUrl("nova");
          }}
          podeEntregar={podeEntregar}
          aoCriar={(id) => setDetalhe({ id, numero: "Alocação", colaborador: "", estado: podeEntregar ? "ATIVA" : "RESERVADA" })}
        />
      ) : null}
    </>
  );
}
