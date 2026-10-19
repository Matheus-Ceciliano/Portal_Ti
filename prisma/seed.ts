/**
 * Seed de DESENVOLVIMENTO com dados fictícios. Recusa executar fora de
 * AMBIENTE=DESENVOLVIMENTO e confere o ambiente gravado no banco (DA-23).
 *
 * As senhas iniciais são aleatórias e exibidas UMA vez neste terminal. Elas só abrem
 * a tela de ativação: o titular define a própria senha e, nas contas de TI, informa o
 * código de ativação e configura o autenticador. Nada é gravado em arquivo.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { obterConfiguracao } from "../src/server/config";
import { prisma } from "../src/server/db";
import { gerarHashSenha } from "../src/server/auth/senha";
import { gerarCodigoAtivacao } from "../src/server/modulos/ativacao";
import { registrarAuditoria } from "../src/server/auditoria";
import { EMPRESAS, PESSOAS } from "../src/server/dados-ficticios/cadastros";
import { semearInventario } from "../src/server/dados-ficticios/inventario";
import { ROTULO_PERFIL } from "../src/server/authz/catalogo";

async function principal() {
  const config = obterConfiguracao();
  if (config.AMBIENTE !== "DESENVOLVIMENTO") {
    throw new Error("O seed só executa com AMBIENTE=DESENVOLVIMENTO.");
  }
  const instalacao = await prisma.instalacao.findUnique({ where: { id: 1 } });
  if (instalacao && instalacao.ambiente !== config.AMBIENTE) {
    throw new Error(`Banco gravado como ${instalacao.ambiente}; AMBIENTE atual é ${config.AMBIENTE}.`);
  }
  if (!instalacao) await prisma.instalacao.create({ data: { id: 1, ambiente: config.AMBIENTE } });

  if ((await prisma.empresa.count()) > 0) {
    // Só acrescenta o que ainda não existe: o inventário fictício entra se não houver equipamentos.
    if (await semearInventario(prisma)) console.log("Inventário fictício gravado (equipamentos, alocações, manutenções e termos).");
    console.log("Banco já populado. Para recomeçar: npm run db:reset");
    return;
  }

  await prisma.empresa.createMany({ data: EMPRESAS });
  const credenciais: { nome: string; email: string; perfil: string; senha: string; codigo?: string }[] = [];

  for (const p of PESSOAS) {
    await prisma.colaborador.create({
      data: {
        id: p.id,
        nome: p.nome,
        emailCorporativo: p.email,
        cargo: p.cargo,
        departamento: p.departamento,
        empresaId: p.empresaId,
      },
    });
    if (!p.comConta) continue;

    const senha = `Ini-${randomBytes(9).toString("base64url")}`;
    const contaId = randomUUID();
    await prisma.contaAcesso.create({
      data: {
        id: contaId,
        name: p.nome,
        email: p.email,
        colaboradorId: p.id,
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
    let codigo: string | undefined;
    if (p.perfil) {
      await prisma.perfilAtribuido.create({
        data: { colaboradorId: p.id, perfil: p.perfil, justificativa: "Carga inicial de desenvolvimento (fictícia)" },
      });
      codigo = (await gerarCodigoAtivacao(prisma, contaId, null)).codigo;
    }
    credenciais.push({
      nome: p.nome,
      email: p.email,
      perfil: ROTULO_PERFIL[p.perfil ?? "COLABORADOR"],
      senha,
      codigo,
    });
  }

  await semearInventario(prisma);
  await registrarAuditoria(prisma, {
    acao: "sistema.seed_desenvolvimento",
    resultado: "SUCESSO",
    detalhe: { empresas: EMPRESAS.length, pessoas: PESSOAS.length, contas: credenciais.length },
  });

  console.log("\nContas FICTÍCIAS de desenvolvimento (exibidas uma única vez):\n");
  for (const c of credenciais) {
    console.log(`  ${c.perfil.padEnd(14)} ${c.email}`);
    console.log(`  ${"".padEnd(14)} senha inicial: ${c.senha}`);
    if (c.codigo) console.log(`  ${"".padEnd(14)} código de ativação (48 h): ${c.codigo}`);
    console.log("");
  }
  console.log("No primeiro acesso cada conta define a própria senha em /conta/ativar.");
  console.log("Contas de TI também informam o código de ativação e configuram um aplicativo autenticador (TOTP).\n");
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
