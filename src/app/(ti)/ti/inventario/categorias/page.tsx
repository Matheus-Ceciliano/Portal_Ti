import { redirect } from "next/navigation";

/** Endereço antigo: as categorias ficam na primeira aba de Catálogos do Inventário. */
export default function PaginaCategorias() {
  redirect("/ti/inventario/catalogos");
}
