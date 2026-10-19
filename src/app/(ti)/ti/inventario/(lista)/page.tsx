import { texto, type Parametros } from "@/components/comum/tabela";
import { GestaoInventario } from "@/components/inventario/gestao-inventario";
import { CATEGORIAS, SITUACOES } from "@/lib/inventario";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { listarEmpresas } from "@/server/modulos/empresas";
import { listarInventario, type FiltroInventario } from "@/server/modulos/inventario";

export const metadata = { title: "Inventário" };

const ORDENACOES = ["nome", "tipo", "marca", "empresa", "situacao"] as const;

export default async function PaginaInventario({
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
    situacao: texto(sp.situacao),
    ordenar: texto(sp.ordenar),
    direcao: texto(sp.direcao),
    pagina: texto(sp.pagina),
    visao: texto(sp.visao),
  };
  const filtro: FiltroInventario = {
    busca: parametros.busca,
    empresaId: parametros.empresa,
    categoria: CATEGORIAS.find((c) => c === parametros.tipo),
    marca: parametros.marca,
    situacao: SITUACOES.find((s) => s === parametros.situacao),
    ordenar: ORDENACOES.find((o) => o === parametros.ordenar),
    direcao: parametros.direcao === "desc" ? "desc" : "asc",
    pagina: Number(parametros.pagina) || 1,
  };
  const [resultado, empresas] = await Promise.all([listarInventario(ator, filtro), listarEmpresas(ator)]);

  return (
    <GestaoInventario
      resultado={resultado}
      parametros={parametros}
      filtrando={Boolean(parametros.busca || parametros.empresa || parametros.tipo || parametros.marca || parametros.situacao)}
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome, sigla: e.sigla, ativa: e.ativa }))}
      podeCadastrar={pode(ator, "ativo.criar")}
      podeEditar={pode(ator, "ativo.editar")}
    />
  );
}
