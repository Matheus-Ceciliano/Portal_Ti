import { PackageSearch, Search } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, EstadoVazio, MarcaSimulado, formatarData } from "@/components/comum/pagina";
import { ESTADOS, Estado } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, texto, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarAtivos } from "@/server/modulos/consultas";

export const metadata = { title: "Inventário" };
const BASE = "/ti/inventario";

export default async function PaginaInventario({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    situacao: texto(sp.situacao),
    ordenar: texto(sp.ordenar) ?? "patrimonio",
    direcao: texto(sp.direcao),
  };
  const busca = parametros.busca?.toLowerCase();
  const ativos = (await listarAtivos(ator))
    .filter((a) => !parametros.situacao || a.situacao === parametros.situacao)
    .filter(
      (a) =>
        !busca ||
        [a.patrimonio, a.modelo, a.tipo, a.numeroSerie, a.responsavel ?? "", a.empresa].some((v) =>
          v.toLowerCase().includes(busca),
        ),
    )
    .sort((x, y) => {
      const campo = parametros.ordenar === "modelo" ? "modelo" : parametros.ordenar === "desde" ? "desde" : "patrimonio";
      const r = x[campo].localeCompare(y[campo], "pt-BR");
      return parametros.direcao === "desc" ? -r : r;
    });

  return (
    <>
      <CabecalhoPagina
        titulo="Inventário"
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            Equipamentos do grupo e quem está com cada um. <MarcaSimulado />
          </span>
        }
      />
      <div className="rounded-lg border bg-card shadow-nivel-1">
        <form method="get" role="search" aria-label="Filtrar inventário" className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_220px_auto] sm:px-5">
          <div className="relative">
            <label htmlFor="busca" className="sr-only">Buscar por patrimônio, modelo, série ou responsável</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="busca" name="busca" type="search" defaultValue={parametros.busca} placeholder="Patrimônio, modelo, série ou responsável" className="pl-9" />
          </div>
          <div>
            <label htmlFor="situacao" className="sr-only">Situação</label>
            <select id="situacao" name="situacao" defaultValue={parametros.situacao ?? ""} className="h-11 w-full rounded-md border border-input bg-card px-3 text-base lg:h-9 md:text-sm">
              <option value="">Todas as situações</option>
              {Object.entries(ESTADOS.ativo).map(([valor, d]) => (
                <option key={valor} value={valor}>{d.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">Filtrar</Button>
            {parametros.busca || parametros.situacao ? (
              <Button asChild variant="ghost"><Link href={BASE}>Limpar</Link></Button>
            ) : null}
          </div>
        </form>
        {ativos.length === 0 ? (
          <EstadoVazio icone={PackageSearch} titulo="Nenhum equipamento encontrado" descricao="Revise a busca ou limpe os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Equipamentos do inventário</caption>
              <thead className="border-b bg-muted/50">
                <tr>
                  <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="patrimonio" className="pl-5">Patrimônio</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="modelo">Equipamento</CabecalhoOrdenavel>
                  <th scope="col" className="h-10 px-4 text-left text-[13px] font-medium text-muted-foreground">Situação</th>
                  <th scope="col" className="h-10 px-4 text-left text-[13px] font-medium text-muted-foreground">Responsável</th>
                  <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="desde">Desde</CabecalhoOrdenavel>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ativos.map((a) => (
                  <tr key={a.id}>
                    <td className="tabular h-11 py-2 pr-4 pl-5 font-medium text-titulo">{a.patrimonio}</td>
                    <td className="px-4 py-2">
                      <span className="text-titulo">{a.modelo}</span>
                      <span className="block text-[13px] text-muted-foreground">{a.tipo} · série {a.numeroSerie}</span>
                    </td>
                    <td className="px-4"><Estado grupo="ativo" valor={a.situacao} /></td>
                    <td className="px-4 py-2">
                      {a.responsavel ?? <span className="text-muted-foreground">—</span>}
                      <span className="block text-[13px] text-muted-foreground">{a.empresa}</span>
                    </td>
                    <td className="tabular px-4 whitespace-nowrap">{formatarData(a.desde)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
          {ativos.length} {ativos.length === 1 ? "equipamento" : "equipamentos"}. Cadastro, alocação e baixa entram com o módulo de inventário.
        </p>
      </div>
    </>
  );
}
