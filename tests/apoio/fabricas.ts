import { randomBytes, randomUUID } from "node:crypto";
import type { Perfil } from "@/generated/prisma/client";
import { gerarHashSenha } from "@/server/auth/senha";
import { EMPRESAS, PESSOAS } from "@/server/dados-ficticios/cadastros";
import { semearInventario } from "@/server/dados-ficticios/inventario";
import { prisma } from "@/server/db";

export async function limparBanco() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_auditoria, limite_tentativa, codigo_totp_usado, codigo_ativacao,
      fator_mfa, verificacao, credencial_conta, sessao, conta_acesso, permissao_individual,
      perfil_atribuido, colaborador, empresa, instalacao, contador_documento CASCADE`);
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
  /** O colaborador `id` já existe (ex.: pessoa do cenário fictício): cria só a conta. */
  colaboradorExistente?: boolean;
};

/** Cria colaborador + conta com credencial. "ativada" simula senha pessoal e ativação de TI concluídas. */
export async function criarPessoa(opcoes: OpcoesPessoa = {}) {
  const id = opcoes.id ?? randomUUID();
  const senha = opcoes.senha ?? senhaAleatoria();
  const agora = new Date();
  const colaborador = opcoes.colaboradorExistente
    ? await prisma.colaborador.findUniqueOrThrow({ where: { id } })
    : await prisma.colaborador.create({
        data: {
          id,
          nome: `Pessoa Teste ${id.slice(0, 4)}`,
          emailCorporativo: `pessoa.${id.slice(0, 8)}@vallur.test`,
          cargo: "Analista",
          departamento: "TI",
          empresaId: (await criarEmpresa()).id,
        },
      });
  const email = colaborador.emailCorporativo;
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
  return { colaboradorId: id, contaId, email, senha, empresaId: colaborador.empresaId };
}

/** Empresas, pessoas e o inventário fictício (equipamentos, alocações, manutenções e termos) no banco de teste. */
export async function semearInventarioTeste() {
  await prisma.empresa.createMany({ data: EMPRESAS, skipDuplicates: true });
  await prisma.colaborador.createMany({
    data: PESSOAS.map((p) => ({ id: p.id, nome: p.nome, emailCorporativo: p.email, cargo: p.cargo, departamento: p.departamento, empresaId: p.empresaId })),
    skipDuplicates: true,
  });
  await semearInventario(prisma);
}
