import { notFound } from "next/navigation";
import { CabecalhoPagina, Secao, formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { carregarAlvo } from "@/server/authz/ator";
import { CATALOGO, ROTULO_PERFIL, type Permissao } from "@/server/authz/catalogo";
import { pode } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { obterPessoa } from "@/server/modulos/pessoas";
import { AcoesPessoa } from "./acoes-pessoa";

export const metadata = { title: "Ficha da pessoa" };

export default async function PaginaPessoa({ params }: { params: Promise<{ id: string }> }) {
  const ator = await exigirPaginaTi("colaborador.ver", { escopoGrupo: true });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const pessoa = await obterPessoa(ator, id);
  if (!pessoa) notFound();
  const alvo = (await carregarAlvo(prisma, id, { bloquear: false }))!;
  const conta = pessoa.conta;
  const situacaoConta = !conta
    ? "SEM_CONTA"
    : conta.situacao === "ATIVA" && !conta.senhaPessoalDefinidaEm
      ? "PENDENTE"
      : conta.situacao;

  const linhas: [string, React.ReactNode][] = [
    ["E-mail corporativo", pessoa.email],
    ["Empresa", pessoa.empresa],
    ["Cargo", pessoa.cargo],
    ["Departamento", pessoa.departamento],
    ["Cadastrada em", formatarData(pessoa.criadoEm)],
    ["Identidade Microsoft", pessoa.identidadeMicrosoftVinculada ? "Vinculada" : "Não vinculada"],
  ];

  return (
    <>
      <CabecalhoPagina
        titulo={pessoa.nome}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Estado grupo="colaborador" valor={pessoa.situacao} />
            {pessoa.perfis.map((p) => (
              <StatusBadge key={p} tom="info">{ROTULO_PERFIL[p]}</StatusBadge>
            ))}
          </span>
        }
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Pessoas", href: "/ti/cadastros/pessoas" }, { rotulo: pessoa.nome }]}
        acoes={
          <AcoesPessoa
            colaboradorId={pessoa.id}
            nome={pessoa.nome}
            temConta={Boolean(conta)}
            bloqueada={conta?.situacao === "BLOQUEADA"}
            podeRedefinirSenha={Boolean(conta) && pode(ator, "conta_acesso.redefinir_senha", alvo)}
            podeBloquear={Boolean(conta) && pode(ator, conta?.situacao === "BLOQUEADA" ? "conta_acesso.desbloquear" : "conta_acesso.bloquear", alvo)}
            podeProvisionar={!pessoa.identidadeMicrosoftVinculada && pode(ator, "provisionamento.executar", alvo)}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Secao titulo="Dados cadastrais" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
            {linhas.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-[13px] text-muted-foreground">{rotulo}</dt>
                <dd className="font-medium break-words text-titulo">{valor}</dd>
              </div>
            ))}
          </dl>
        </Secao>

        <Secao titulo="Conta de acesso ao portal" descricao="Senha, hash e segredos nunca são exibidos.">
          <dl className="flex flex-col gap-3 px-5 py-4">
            <div>
              <dt className="text-[13px] text-muted-foreground">Situação</dt>
              <dd className="mt-1"><Estado grupo="conta" valor={situacaoConta} /></dd>
            </div>
            {conta ? (
              <>
                <div>
                  <dt className="text-[13px] text-muted-foreground">Senha pessoal</dt>
                  <dd className="font-medium text-titulo">
                    {conta.senhaPessoalDefinidaEm ? `Definida em ${formatarData(conta.senhaPessoalDefinidaEm)}` : "Ainda vale a senha inicial da TI"}
                  </dd>
                </div>
                {pessoa.temPerfilTi ? (
                  <div>
                    <dt className="text-[13px] text-muted-foreground">Ativação do perfil de TI</dt>
                    <dd className="font-medium text-titulo">
                      {conta.ativacaoTiConcluidaEm ? `Concluída, com autenticador (MFA)` : "Pendente: código de ativação e autenticador"}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[13px] text-muted-foreground">Último acesso</dt>
                  <dd className="tabular font-medium text-titulo">
                    {conta.ultimoAcessoEm ? formatarDataHora(conta.ultimoAcessoEm) : "Nunca acessou"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </Secao>

        {pessoa.permissoes.length ? (
          <Secao titulo="Permissões individuais" className="lg:col-span-3">
            <ul className="divide-y">
              {pessoa.permissoes.map((p) => (
                <li key={p.permissao} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span>
                    <span className="font-medium text-titulo">{CATALOGO[p.permissao as Permissao]?.descricao ?? p.permissao}</span>
                    <span className="block font-mono text-[13px] text-muted-foreground">{p.permissao}</span>
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {p.validaAte ? `Válida até ${formatarData(p.validaAte)}` : "Sem data de validade"}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        ) : null}
      </div>
    </>
  );
}
