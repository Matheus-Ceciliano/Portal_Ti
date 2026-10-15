import { MarcaSimulado } from "@/components/comum/pagina";
import { ListaChamados } from "@/components/portal/blocos-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { listarMeusChamados } from "@/server/modulos/consultas";

export const metadata = { title: "Meus chamados" };

export default async function MeusChamados() {
  const ator = await exigirPortal();
  const itens = await listarMeusChamados(ator);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Meus chamados</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          Acompanhe os pedidos de suporte que você abriu. <MarcaSimulado />
        </p>
      </header>
      <ListaChamados itens={itens} />
    </div>
  );
}
