import { GestaoCatalogos } from "@/components/inventario/catalogos/gestao-catalogos";
import { ABAS_CATALOGO } from "@/lib/catalogos";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarCatalogos } from "@/server/modulos/catalogos";
import { listarCategorias } from "@/server/modulos/categorias";

export const metadata = { title: "Catálogos do Inventário" };

/** Categorias, marcas, modelos, processadores, sistemas e memórias (dentro do Inventário, fora do menu lateral). */
export default async function PaginaCatalogos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const { aba } = await searchParams;
  const [categorias, catalogos] = await Promise.all([listarCategorias(ator), listarCatalogos(ator)]);
  return <GestaoCatalogos categorias={categorias} catalogos={catalogos} abaInicial={ABAS_CATALOGO.find((a) => a === aba) ?? "categorias"} />;
}
