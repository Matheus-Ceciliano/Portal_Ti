import { randomBytes, randomUUID } from "node:crypto";
import type { Perfil } from "@/generated/prisma/client";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";

export async function limparBanco() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_auditoria, limite_tentativa, codigo_totp_usado, codigo_ativacao,
      fator_mfa, verificacao, credencial_conta, sessao, conta_acesso, permissao_individual,
      perfil_atribuido, colaborador, empresa, instalacao CASCADE`);
}

export const senhaAleatoria = () => `Teste-${randomBytes(12).toString("base64url")}`;

export async function criarEmpresa() {
  const sufixo = randomBytes(3).toString("hex");
  return prisma.empresa.create({
    data: {
      nome: `Empresa Fictícia ${sufixo}`,
      sigla: `EF${sufixo}`.toUpperCase(),
      cnpj: `00.000.${sufixo}/0001-00`,
      cidade: "Cidade Fictícia",
    },
  });
}

type OpcoesPessoa = {
  id?: string;
  perfis?: Perfil[];
  senha?: string;
  ativada?: boolean;
  situacaoConta?: "ATIVA" | "BLOQUEADA" | "DESATIVADA";
};

/** Cria colaborador + conta com credencial. "ativada" simula senha pessoal e ativação de TI concluídas. */
export async function criarPessoa(opcoes: OpcoesPessoa = {}) {
  const empresa = await criarEmpresa();
  const id = opcoes.id ?? randomUUID();
  const email = `pessoa.${id.slice(0, 8)}@vallur.test`;
  const senha = opcoes.senha ?? senhaAleatoria();
  const agora = new Date();
  const colaborador = await prisma.colaborador.create({
    data: {
      id,
      nome: `Pessoa Teste ${id.slice(0, 4)}`,
      emailCorporativo: email,
      cargo: "Analista",
      departamento: "TI",
      empresaId: empresa.id,
    },
  });
  const contaId = randomUUID();
  await prisma.contaAcesso.create({
    data: {
      id: contaId,
      name: colaborador.nome,
      email,
      colaboradorId: id,
      situacao: opcoes.situacaoConta ?? "ATIVA",
      senhaPessoalDefinidaEm: opcoes.ativada ? agora : null,
      ativacaoTiConcluidaEm: opcoes.ativada && opcoes.perfis?.length ? agora : null,
      credenciais: {
        create: {
          id: randomUUID(),
          accountId: contaId,
          providerId: "credential",
          password: await gerarHashSenha(senha),
        },
      },
    },
  });
  for (const perfil of opcoes.perfis ?? []) {
    await prisma.perfilAtribuido.create({
      data: { colaboradorId: id, perfil, justificativa: "Teste automatizado" },
    });
  }
  return { colaboradorId: id, contaId, email, senha, empresaId: empresa.id };
}
