import { redirect } from "next/navigation";
import { exigirPaginaTi } from "@/server/auth/pagina";

/** Endereço antigo do cadastro: abre a lista de Pessoas com o modal de cadastro. */
export default async function PaginaNovaPessoa() {
  await exigirPaginaTi("colaborador.criar");
  redirect("/ti/cadastros/pessoas?cadastrar=1");
}
