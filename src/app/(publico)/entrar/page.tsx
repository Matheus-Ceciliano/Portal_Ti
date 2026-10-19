import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CartaoAcesso } from "@/components/layout/cartao-acesso";
import { obterSessao } from "@/server/auth/sessao";
import { FormularioEntrada } from "./formulario-entrada";

export const metadata: Metadata = { title: "Entrar" };

const MOTIVOS: Record<string, string> = {
  expirada: "Sua sessão expirou. Entre novamente para continuar.",
  encerrada: "Você saiu do portal com segurança.",
};

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  if (await obterSessao()) redirect("/");
  const { motivo } = await searchParams;
  return (
    <CartaoAcesso
      titulo="Entrar no portal"
      descricao="Use seu e-mail corporativo e a senha do portal."
      rodape="Esqueceu a senha ou recebeu uma senha nova? Procure a equipe de TI. A recuperação pelo e-mail ainda não está disponível."
    >
      <FormularioEntrada aviso={motivo ? MOTIVOS[motivo] : undefined} />
    </CartaoAcesso>
  );
}
