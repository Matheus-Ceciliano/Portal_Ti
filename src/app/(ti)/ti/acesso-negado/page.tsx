import { ShieldX } from "lucide-react";
import Link from "next/link";
import { EstadoVazio } from "@/components/comum/pagina";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso negado" };

export default function AcessoNegado() {
  return (
    <div className="rounded-2xl border bg-card">
      <EstadoVazio
        icone={ShieldX}
        titulo="Você não tem permissão para acessar esta área"
        descricao="Se precisar deste acesso para o seu trabalho, peça a um Supervisor TI ou Gestor ADM. Concessões são individuais, justificadas e registradas na auditoria."
        acao={
          <Button asChild variant="outline">
            <Link href="/ti">Voltar ao dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
