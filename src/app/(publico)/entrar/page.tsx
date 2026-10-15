import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterSessao } from "@/server/auth/sessao";
import { FormularioEntrada } from "./formulario-entrada";

export const metadata: Metadata = { title: "Entrar" };

const MOTIVOS: Record<string, string> = {
  expirada: "Sua sessão expirou. Entre novamente para continuar.",
  encerrada: "Você saiu do portal.",
};

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  if (await obterSessao()) redirect("/");
  const { motivo } = await searchParams;
  return (
    <>
      <h1 className="text-2xl leading-8 font-semibold">Entrar no portal</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Use seu e-mail corporativo e a senha do portal.</p>
      <FormularioEntrada aviso={motivo ? MOTIVOS[motivo] : undefined} />
      <p className="mt-8 text-sm text-muted-foreground">
        Esqueceu a senha ou recebeu uma senha nova da TI? Procure a equipe de TI. A recuperação pelo e-mail ainda
        não está disponível.
      </p>
    </>
  );
}
