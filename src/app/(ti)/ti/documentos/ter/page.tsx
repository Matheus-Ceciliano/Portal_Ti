import { PaginaTermos } from "@/components/painel/pagina-termos";
import { exigirPaginaTi } from "@/server/auth/pagina";

export const metadata = { title: "TER" };

export default async function PaginaTer() {
  const ator = await exigirPaginaTi("termo.ver", { escopoGrupo: true });
  return <PaginaTermos ator={ator} tipo="TER" />;
}
