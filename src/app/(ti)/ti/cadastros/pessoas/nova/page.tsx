import { CabecalhoPagina } from "@/components/comum/pagina";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { listarEmpresas } from "@/server/modulos/pessoas";
import { FormularioCadastro } from "./formulario-cadastro";

export const metadata = { title: "Cadastrar pessoa" };

export default async function PaginaNovaPessoa() {
  const ator = await exigirPaginaTi("colaborador.criar");
  const empresas = (await listarEmpresas(ator)).filter((e) => e.ativa);
  // Pessoa nova não tem perfil de TI nem é o próprio ator: a restrição dependente do alvo não se aplica.
  const alvoNovo = { colaboradorId: "nova-pessoa", temPerfilTiAtivo: false };
  const podeCriarConta = pode(ator, "conta_acesso.criar", alvoNovo);
  const podeProvisionar = pode(ator, "provisionamento.executar", alvoNovo);

  return (
    <>
      <CabecalhoPagina
        titulo="Cadastrar pessoa"
        descricao="Registra o colaborador e cria a conta de acesso ao portal com a senha inicial. Não há etapa de aprovação: a confirmação e o registro do executor substituem a fila."
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Pessoas", href: "/ti/cadastros/pessoas" }, { rotulo: "Cadastrar pessoa" }]}
      />
      {podeCriarConta ? (
        <FormularioCadastro
          empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
          podeProvisionar={podeProvisionar}
        />
      ) : (
        <p className="text-muted-foreground">Você não tem permissão para criar contas de acesso.</p>
      )}
    </>
  );
}
