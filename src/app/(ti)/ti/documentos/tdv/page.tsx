import { PaginaTermos } from "@/components/painel/pagina-termos";
import { exigirPaginaTi } from "@/server/auth/pagina";

export const metadata = { title: "TDV" };

export default async function PaginaTdv() {
  const ator = await exigirPaginaTi("termo.ver", { escopoGrupo: true });
  return <PaginaTermos ator={ator} tipo="TDV" />;
}
