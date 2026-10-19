import { CarregandoLista } from "@/components/inventario/carregando";

export default function CarregandoInventario() {
  return <CarregandoLista rotulo="Carregando o inventário" indicadores={4} trilha={false} />;
}
