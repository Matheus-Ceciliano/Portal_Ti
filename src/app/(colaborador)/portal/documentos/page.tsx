import { MarcaSimulado } from "@/components/comum/pagina";
import { ListaDocumentos } from "@/components/portal/blocos-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { listarMeusDocumentos } from "@/server/modulos/consultas";

export const metadata = { title: "Meus documentos" };

export default async function MeusDocumentos() {
  const ator = await exigirPortal();
  const itens = await listarMeusDocumentos(ator);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Meus documentos</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          Termos de entrega e devolução disponibilizados pela TI. <MarcaSimulado />
        </p>
      </header>
      <ListaDocumentos itens={itens} />
    </div>
  );
}
