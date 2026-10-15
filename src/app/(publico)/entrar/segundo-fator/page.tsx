import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FormularioSegundoFator } from "./formulario-segundo-fator";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function PaginaSegundoFator() {
  const loja = await cookies();
  // Sem desafio pendente, volta para a entrada.
  const desafio = loja.get("vallur.two_factor") ?? loja.get("__Secure-vallur.two_factor");
  if (!desafio) redirect("/entrar");
  return (
    <>
      <h1 className="text-2xl leading-8 font-semibold">Verificação em duas etapas</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Abra o aplicativo autenticador e informe o código de 6 dígitos do Portal TI Vallur.
      </p>
      <FormularioSegundoFator />
    </>
  );
}
