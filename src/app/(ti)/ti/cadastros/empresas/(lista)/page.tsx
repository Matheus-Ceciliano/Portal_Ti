import { CabecalhoPagina } from "@/components/comum/pagina";
import { GestaoEmpresas } from "@/components/empresas/gestao-empresas";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { armazenamentoDisponivel, listarEmpresas } from "@/server/modulos/empresas";

export const metadata = { title: "Empresas" };

export default async function PaginaEmpresas() {
  const ator = await exigirPaginaTi("empresa.ver");
  const empresas = await listarEmpresas(ator);
  return (
    <>
      <CabecalhoPagina titulo="Empresas" trilha={[{ rotulo: "Cadastros" }, { rotulo: "Empresas" }]} />
      <GestaoEmpresas
        empresas={empresas}
        podeGerenciar={pode(ator, "empresa.gerenciar")}
        armazenamentoDisponivel={armazenamentoDisponivel()}
      />
    </>
  );
}
