import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterSessao } from "@/server/auth/sessao";
import { obterSituacaoAtivacao } from "@/server/modulos/ativacao";
import { CartaoAcesso } from "@/components/layout/cartao-acesso";
import { AssistenteAtivacao } from "./assistente-ativacao";

export const metadata: Metadata = { title: "Ativar conta" };

export default async function PaginaAtivar() {
  const contexto = await obterSessao();
  if (!contexto) redirect("/entrar?motivo=expirada");
  if (contexto.ator.estadoAcesso === "LIBERADO") redirect("/");
  const situacao = await obterSituacaoAtivacao(contexto.ator.contaId);

  return (
    <CartaoAcesso
      titulo="Ative sua conta"
      descricao={
        <>
          Olá, {contexto.ator.nome.split(" ")[0]}. A senha que você recebeu da TI serve só para este primeiro acesso.
          {situacao.perfilTi
            ? " Como sua conta tem perfil da equipe de TI, você também vai configurar a verificação em duas etapas."
            : " Defina agora uma senha que só você conheça."}
        </>
      }
    >
      <AssistenteAtivacao situacao={situacao} email={contexto.ator.email} />
    </CartaoAcesso>
  );
}
