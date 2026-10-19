"use client";

import { CheckCircle2, ChevronRight, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import { CabecalhoPagina, EstadoVazio } from "@/components/comum/pagina";
import { StatusBadge } from "@/components/comum/status-badge";
import { Paginacao, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { CATEGORIAS, ROTULO_CATEGORIA } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import type { ResultadoManutencoes } from "@/server/modulos/manutencoes";
import { DialogoConcluirManutencao, type ManutencaoAberta } from "./dialogos-manutencao";
import { formatarDataHora, MiniaturaEquipamento } from "./visual";

type Linha = ResultadoManutencoes["linhas"][number];

const BASE = "/ti/inventario/manutencoes";
const th = "h-11 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5";
const td = "px-3 py-2.5 align-middle first:pl-5";

function Situacao({ l }: { l: Linha }) {
  if (l.aberta) return <StatusBadge tom="manual" icone={Wrench}>Em andamento · {l.dias} {l.dias === 1 ? "dia" : "dias"}</StatusBadge>;
  return l.resultado === "REPARADO" ? (
    <StatusBadge tom="sucesso" icone={CheckCircle2}>Reparado</StatusBadge>
  ) : (
    <StatusBadge tom="neutro">Sem reparo</StatusBadge>
  );
}

export function GestaoManutencoes({
  resultado,
  parametros,
  filtrando,
  empresas,
  marcas,
  podeConcluir,
}: {
  resultado: ResultadoManutencoes;
  parametros: Parametros;
  filtrando: boolean;
  empresas: { id: string; nome: string }[];
  marcas: string[];
  podeConcluir: boolean;
}) {
  const [concluir, setConcluir] = useState<ManutencaoAberta | null>(null);
  const concluidas = parametros.situacao === "CONCLUIDA";
  const resumo = `${resultado.total} ${resultado.total === 1 ? "manutenção" : "manutenções"}`;
  const botaoConcluir = (l: Linha) =>
    podeConcluir && l.aberta ? (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setConcluir({ id: l.id, ativoId: l.ativo.id, rotulo: l.ativo.rotulo, motivo: l.motivo, abertaEm: l.abertaEm })}
        aria-label={`Concluir manutenção de ${l.ativo.rotulo}`}
      >
        <CheckCircle2 aria-hidden /> Concluir
      </Button>
    ) : null;

  return (
    <>
      <CabecalhoPagina
        titulo="Equipamentos em manutenção"
        trilha={[{ rotulo: "Inventário", href: "/ti/inventario" }, { rotulo: "Manutenções" }]}
        acoes={
          <span className="flex gap-2 text-[13px] text-muted-foreground" data-testid="resumo-manutencoes">
            <span className="tabular rounded-md border bg-card px-2.5 py-1.5">
              <strong className="text-titulo">{resultado.indicadores.abertas}</strong> em andamento
            </span>
            <span className="tabular rounded-md border bg-card px-2.5 py-1.5">
              <strong className="text-titulo">{resultado.indicadores.concluidas30}</strong> concluídas em 30 dias
            </span>
          </span>
        }
      />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b p-4 sm:px-5">
          <FiltrosUrl
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por equipamento, patrimônio, série ou motivo"
            rotuloBusca="Pesquisar manutenções"
            chavesFiltro={["empresa", "tipo", "marca", "periodo", "situacao"]}
            resumo={resumo}
            filtros={[
              { chave: "empresa", rotulo: "Empresa", todos: "Todas as empresas", opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome })), valor: parametros.empresa ?? "", pesquisavel: true },
              { chave: "tipo", rotulo: "Categoria", todos: "Todas as categorias", opcoes: CATEGORIAS.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] })), valor: parametros.tipo ?? "", pesquisavel: true },
              { chave: "marca", rotulo: "Marca", todos: "Todas as marcas", opcoes: marcas.map((m) => ({ valor: m, rotulo: m })), valor: parametros.marca ?? "", pesquisavel: true },
              {
                chave: "periodo",
                rotulo: "Período",
                todos: "Qualquer data de entrada",
                opcoes: [
                  { valor: "30", rotulo: "Últimos 30 dias" },
                  { valor: "90", rotulo: "Últimos 90 dias" },
                  { valor: "365", rotulo: "Últimos 12 meses" },
                ],
                valor: parametros.periodo ?? "",
              },
              { chave: "situacao", rotulo: "Situação", todos: "Em andamento", opcoes: [{ valor: "CONCLUIDA", rotulo: "Concluídas" }], valor: parametros.situacao ?? "" },
            ]}
          />
        </div>
        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={Wrench}
            titulo={filtrando ? "Nenhuma manutenção encontrada" : concluidas ? "Nenhuma manutenção concluída" : "Nenhum equipamento em manutenção"}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : "Os envios para manutenção são feitos na ficha do equipamento."}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Manutenções</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th scope="col" className={cn(th, "w-[64px]")}><span className="sr-only">Foto</span></th>
                    <th scope="col" className={cn(th, "w-[22%] lg:w-[18%]")}>Equipamento</th>
                    <th scope="col" className={cn(th, "w-[24%] lg:w-[22%]")}>Motivo</th>
                    <th scope="col" className={cn(th, "w-[16%] lg:w-[13%]")}>Entrada</th>
                    <th scope="col" className={cn(th, "hidden lg:table-cell lg:w-[12%]")}>Registrado por</th>
                    <th scope="col" className={cn(th, "w-[22%] lg:w-[18%]")}>Situação</th>
                    <th scope="col" className={cn(th, "w-[150px] pr-5 text-right")}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((l) => (
                    <tr key={l.id} className="transition-colors hover:bg-accent/40">
                      <td className={td}>
                        <MiniaturaEquipamento url={l.ativo.miniatura} categoria={l.ativo.categoria} />
                      </td>
                      <td className={td}>
                        <Link href={`/ti/inventario/${l.ativo.id}`} className="tabular block truncate font-semibold text-titulo underline-offset-4 hover:underline">
                          {l.ativo.rotulo}
                        </Link>
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {l.ativo.marca} {l.ativo.modelo} · {l.ativo.empresa.sigla}
                        </span>
                      </td>
                      <td className={td}>
                        <span className="block truncate font-medium text-titulo" title={l.motivo}>{l.motivo}</span>
                        <span className="block truncate text-[12.5px] text-muted-foreground" title={l.observacoes}>
                          {l.recolhidoDeNome ? `Recolhido de ${l.recolhidoDeNome} · ` : ""}
                          {l.observacoes}
                        </span>
                      </td>
                      <td className={cn(td, "tabular text-[13px]")}>{formatarDataHora(l.abertaEm)}</td>
                      <td className={cn(td, "hidden truncate lg:table-cell")}>{l.abertaPorNome}</td>
                      <td className={td}>
                        <Situacao l={l} />
                      </td>
                      <td className={cn(td, "pr-5")}>
                        <div className="flex justify-end gap-1">
                          {botaoConcluir(l)}
                          <Button asChild variant="ghost" size="icon-sm">
                            <Link href={`/ti/inventario/${l.ativo.id}`} aria-label={`Abrir ficha de ${l.ativo.rotulo}`}>
                              <ChevronRight aria-hidden />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {resultado.linhas.map((l) => (
                <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                  <Link href={`/ti/inventario/${l.ativo.id}`} className="flex items-center gap-3">
                    <MiniaturaEquipamento url={l.ativo.miniatura} categoria={l.ativo.categoria} tamanho="md" />
                    <span className="min-w-0 flex-1">
                      <span className="tabular block truncate font-semibold text-titulo">{l.ativo.rotulo}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{l.motivo}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{formatarDataHora(l.abertaEm)}</span>
                    </span>
                  </Link>
                  <div className="flex items-center justify-between gap-2">
                    <Situacao l={l} />
                    {botaoConcluir(l)}
                  </div>
                </li>
              ))}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} rotulo="manutenções" />
          </>
        )}
      </div>
      {concluir ? <DialogoConcluirManutencao key={concluir.id} aberto aoMudar={(v) => !v && setConcluir(null)} manutencao={concluir} /> : null}
    </>
  );
}
