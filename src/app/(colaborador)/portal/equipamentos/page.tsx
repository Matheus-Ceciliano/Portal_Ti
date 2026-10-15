import { MarcaSimulado } from "@/components/comum/pagina";
import { ListaEquipamentos } from "@/components/portal/blocos-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { listarMeusEquipamentos } from "@/server/modulos/consultas";

export const metadata = { title: "Meus equipamentos" };

export default async function MeusEquipamentos() {
  const ator = await exigirPortal();
  const itens = await listarMeusEquipamentos(ator);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Meus equipamentos</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          Equipamentos entregues a você e sob sua responsabilidade. <MarcaSimulado />
        </p>
      </header>
      <ListaEquipamentos itens={itens} />
    </div>
  );
}
