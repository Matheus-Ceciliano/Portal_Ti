import { GestaoCatalogos } from "@/components/inventario/catalogos/gestao-catalogos";
import { ABAS_CATALOGO } from "@/lib/catalogos";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarCatalogos } from "@/server/modulos/catalogos";
import { listarChecklists } from "@/server/modulos/checklists";
import { listarCategorias } from "@/server/modulos/categorias";

export const metadata = { title: "Catálogos do Inventário" };

/** Categorias, marcas, modelos, processadores, sistemas, memórias e checklists de inspeção (dentro do Inventário, fora do menu lateral). */
export default async function PaginaCatalogos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const { aba } = await searchParams;
  const [categorias, catalogos, checklists] = await Promise.all([listarCategorias(ator), listarCatalogos(ator), listarChecklists(ator)]);
  return <GestaoCatalogos categorias={categorias} catalogos={catalogos} checklists={checklists} abaInicial={ABAS_CATALOGO.find((a) => a === aba) ?? "categorias"} />;
}
