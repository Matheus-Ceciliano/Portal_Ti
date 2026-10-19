import { texto, type Parametros } from "@/components/comum/tabela";
import { GestaoManutencoes } from "@/components/inventario/gestao-manutencoes";
import { CATEGORIAS } from "@/lib/inventario";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { listarEmpresas } from "@/server/modulos/empresas";
import { opcoesInventario } from "@/server/modulos/inventario";
import { listarManutencoes } from "@/server/modulos/manutencoes";

export const metadata = { title: "Manutenções" };

/** Fora do menu lateral: aberta pelo link "Ver equipamentos em manutenção" do Inventário. */
export default async function PaginaManutencoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    empresa: texto(sp.empresa),
    tipo: texto(sp.tipo),
    marca: texto(sp.marca),
    periodo: texto(sp.periodo),
    situacao: texto(sp.situacao),
    pagina: texto(sp.pagina),
  };
  const periodo = (["30", "90", "365"] as const).find((p) => p === parametros.periodo);
  const [resultado, empresas, opcoes] = await Promise.all([
    listarManutencoes(ator, {
      busca: parametros.busca,
      empresaId: parametros.empresa,
      categoria: CATEGORIAS.find((c) => c === parametros.tipo),
      marca: parametros.marca,
      periodo,
      situacao: parametros.situacao === "CONCLUIDA" ? "CONCLUIDA" : "ABERTA",
      pagina: Number(parametros.pagina) || 1,
    }),
    listarEmpresas(ator),
    opcoesInventario(ator),
  ]);
  return (
    <GestaoManutencoes
      resultado={resultado}
      parametros={parametros}
      filtrando={Boolean(parametros.busca || parametros.empresa || parametros.tipo || parametros.marca || parametros.periodo)}
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      marcas={opcoes.marcas}
      podeConcluir={pode(ator, "ativo.transicionar")}
    />
  );
}
