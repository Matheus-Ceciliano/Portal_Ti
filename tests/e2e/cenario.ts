/**
 * Cenário E2E fictício no banco de TESTE. Recusa executar se DATABASE_URL não for a de teste.
 * Senhas aleatórias e segredos TOTP vão só para playwright/.auth/cenario.json (ignorado pelo Git).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { criarAuth } from "../../src/server/auth/better-auth";
import { gerarHashSenha } from "../../src/server/auth/senha";
import { prisma } from "../../src/server/db";
import { EMPRESAS, PESSOAS } from "../../src/server/dados-ficticios/cadastros";
import { gerarCodigoAtivacao } from "../../src/server/modulos/ativacao";
import { gerarTotp, segredoDaUri } from "../apoio/totp";

if (process.env.DATABASE_URL !== process.env.DATABASE_URL_TESTE) {
  throw new Error("O cenário E2E só executa no banco de teste.");
}

type Perfil = "ESTAGIARIO_TI" | "SUPERVISOR_TI" | "GESTOR_ADM";
const senha = () => `E2e-${randomBytes(12).toString("base64url")}`;
const auth = criarAuth({ cookiesNext: false });

async function criarConta(
  pessoa: { id: string; nome: string; email: string },
  opcoes: { perfil?: Perfil; ativada: boolean; mfa?: boolean; situacao?: "ATIVA" | "BLOQUEADA" },
) {
  const s = senha();
  const contaId = randomUUID();
  await prisma.contaAcesso.create({
    data: {
      id: contaId,
      name: pessoa.nome,
      email: pessoa.email,
      colaboradorId: pessoa.id,
      situacao: opcoes.situacao ?? "ATIVA",
      senhaPessoalDefinidaEm: opcoes.ativada ? new Date() : null,
      credenciais: { create: { id: randomUUID(), accountId: contaId, providerId: "credential", password: await gerarHashSenha(s) } },
    },
  });
  if (opcoes.perfil) {
    await prisma.perfilAtribuido.create({
      data: { colaboradorId: pessoa.id, perfil: opcoes.perfil, justificativa: "Cenário E2E" },
    });
  }
  let segredoTotp: string | undefined;
  if (opcoes.mfa) {
    const login = await auth.api.signInEmail({ body: { email: pessoa.email, password: s }, headers: new Headers(), returnHeaders: true });
    const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const r = await auth.api.enableTwoFactor({ body: { password: s, method: "totp" }, headers: new Headers({ cookie }) });
    if (r.method !== "totp") throw new Error("TOTP esperado");
    segredoTotp = segredoDaUri(r.totpURI);
    await auth.api.verifyTOTP({ body: { code: gerarTotp(segredoTotp) }, headers: new Headers({ cookie }) });
    await prisma.sessao.deleteMany({ where: { userId: contaId } });
    await prisma.contaAcesso.update({ where: { id: contaId }, data: { ativacaoTiConcluidaEm: new Date() } });
  }
  return { email: pessoa.email, senha: s, contaId, segredoTotp };
}

async function principal() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_auditoria, limite_tentativa, codigo_totp_usado, codigo_ativacao, fator_mfa,
      verificacao, credencial_conta, sessao, conta_acesso, permissao_individual, perfil_atribuido,
      colaborador, empresa, instalacao CASCADE`);
  await prisma.instalacao.create({ data: { id: 1, ambiente: "DESENVOLVIMENTO" } });
  await prisma.empresa.createMany({ data: EMPRESAS });
  for (const p of PESSOAS) {
    await prisma.colaborador.create({
      data: { id: p.id, nome: p.nome, emailCorporativo: p.email, cargo: p.cargo, departamento: p.departamento, empresaId: p.empresaId },
    });
  }
  const extra = { id: randomUUID(), nome: "Pessoa Ativação E2E", email: "ativacao.e2e@vallur.test" };
  await prisma.colaborador.create({
    data: { id: extra.id, nome: extra.nome, emailCorporativo: extra.email, cargo: "Analista de TI", departamento: "TI", empresaId: EMPRESAS[3].id },
  });

  const supervisor = await criarConta(PESSOAS[0], { perfil: "SUPERVISOR_TI", ativada: true, mfa: true });
  const gestor = await criarConta(PESSOAS[1], { perfil: "GESTOR_ADM", ativada: true, mfa: true });
  const estagiario = await criarConta(PESSOAS[2], { perfil: "ESTAGIARIO_TI", ativada: true, mfa: true });
  const colaboradora = await criarConta(PESSOAS[3], { ativada: true });
  const pendente = await criarConta(PESSOAS[4], { ativada: false });
  const bloqueada = await criarConta(PESSOAS[5], { ativada: true, situacao: "BLOQUEADA" });
  const novaTi = await criarConta(extra, { perfil: "SUPERVISOR_TI", ativada: false });
  const { codigo } = await gerarCodigoAtivacao(prisma, novaTi.contaId, null);

  mkdirSync("playwright/.auth", { recursive: true });
  writeFileSync(
    "playwright/.auth/cenario.json",
    JSON.stringify({ supervisor, gestor, estagiario, colaboradora, pendente, bloqueada, novaTi: { ...novaTi, codigo } }, null, 2),
  );
  console.log("Cenário E2E fictício criado no banco de teste.");
}

principal()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
