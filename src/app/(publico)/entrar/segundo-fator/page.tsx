import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CartaoAcesso } from "@/components/layout/cartao-acesso";
import { FormularioSegundoFator } from "./formulario-segundo-fator";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function PaginaSegundoFator() {
  const loja = await cookies();
  // Sem desafio pendente, volta para a entrada.
  const desafio = loja.get("vallur.two_factor") ?? loja.get("__Secure-vallur.two_factor");
  if (!desafio) redirect("/entrar");
  return (
    <CartaoAcesso
      titulo="Verificação em duas etapas"
      descricao="Abra o aplicativo autenticador e informe o código de 6 dígitos do Portal TI Vallur."
    >
      <FormularioSegundoFator />
    </CartaoAcesso>
  );
}
