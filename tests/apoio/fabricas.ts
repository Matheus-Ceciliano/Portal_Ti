import { randomBytes, randomUUID } from "node:crypto";
import type { Perfil } from "@/generated/prisma/client";
import { gerarHashSenha } from "@/server/auth/senha";
import { protegerCpf } from "@/server/cpf";
import { EMPRESAS, PESSOAS } from "@/server/dados-ficticios/cadastros";
import { semearInventario } from "@/server/dados-ficticios/inventario";
import { prisma } from "@/server/db";
import { restaurarCatalogo } from "./catalogo";

export async function limparBanco() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_auditoria, limite_tentativa, codigo_totp_usado, codigo_ativacao,
      fator_mfa, verificacao, credencial_conta, sessao, conta_acesso, permissao_individual,
      perfil_atribuido, colaborador, empresa, instalacao, contador_documento, kit_equipamento,
      historico_prefixo_categoria CASCADE`);
  await restaurarCatalogo(prisma);
}

/** Id de uma família de processador do catálogo inicial (Intel Core i3/i5/i7). */
export async function familiaId(codigo: "3" | "5" | "7") {
  return (await prisma.familiaProcessador.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
}

export const senhaAleatoria = () => `Teste-${randomBytes(12).toString("base64url")}`;

/** CPF fictício gerado para o teste (dígitos verificadores corretos; nenhum dado real). */
export function cpfFicticio() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (new Set(base).size === 1) base[0] = (base[0] + 1) % 10;
  const dv = (nums: number[]) => {
    const peso = nums.length + 1;
    const r = (nums.reduce((s, d, i) => s + d * (peso - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join("");
}

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
  /** Empresa do colaborador (padrão: uma empresa nova só dele). */
  empresaId?: string;
  /** CPF (cifrado como no cadastro); `true` gera um fictício. */
  cpf?: string | true;
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
          empresaId: opcoes.empresaId ?? (await criarEmpresa()).id,
          ...(opcoes.cpf ? protegerCpf(opcoes.cpf === true ? cpfFicticio() : opcoes.cpf) : {}),
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
