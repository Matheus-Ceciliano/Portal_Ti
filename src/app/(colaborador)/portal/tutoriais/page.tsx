import { MarcaSimulado } from "@/components/comum/pagina";
import { ListaTutoriais } from "@/components/portal/blocos-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { listarTutoriais } from "@/server/modulos/consultas";

export const metadata = { title: "Tutoriais" };

export default async function Tutoriais() {
  const ator = await exigirPortal();
  const itens = await listarTutoriais(ator);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Tutoriais</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          Guias rápidos da equipe de TI. <MarcaSimulado />
        </p>
      </header>
      <ListaTutoriais itens={itens} />
    </div>
  );
}
