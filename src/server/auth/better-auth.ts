import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { obterConfiguracao } from "@/server/config";
import { prisma } from "@/server/db";
import { SENHA_MAXIMO, SENHA_MINIMO, gerarHashSenha, verificarSenha } from "./senha";

export const DURACAO_ABSOLUTA_SESSAO_S = 12 * 60 * 60;

/**
 * Better Auth 1.7.7 (DA-24): a biblioteca verifica a credencial, emite e valida o
 * token e o segundo fator. Nenhuma rota HTTP da biblioteca é montada: o portal chama
 * auth.api.* somente a partir de Server Actions próprias (superfície mínima, §7.1).
 * Cadastro público desativado; cache de sessão em cookie desativado (revogação imediata).
 */
export function criarAuth({ cookiesNext }: { cookiesNext: boolean }) {
  const config = obterConfiguracao();
  return betterAuth({
    appName: "Portal TI Vallur",
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    logger: { level: "error" },
    rateLimit: { enabled: false }, // rotas da biblioteca não são expostas; limitador próprio (DA-27)
    user: { modelName: "contaAcesso" },
    session: {
      modelName: "sessao",
      expiresIn: DURACAO_ABSOLUTA_SESSAO_S,
      disableSessionRefresh: true, // expiração absoluta: a renovação deslizante não a estende
      cookieCache: { enabled: false },
    },
    account: { modelName: "credencialConta", accountLinking: { enabled: false } },
    verification: { modelName: "verificacao" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: SENHA_MINIMO,
      maxPasswordLength: SENHA_MAXIMO,
      password: {
        hash: gerarHashSenha,
        verify: ({ hash, password }) => verificarSenha(hash, password),
      },
    },
    advanced: {
      cookiePrefix: "vallur",
      useSecureCookies: config.AMBIENTE !== "DESENVOLVIMENTO",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    databaseHooks: {
      session: {
        create: {
          // Conta BLOQUEADA/DESATIVADA ou colaborador fora de ATIVO não recebe sessão.
          // A falha chega ao usuário como a mesma mensagem genérica do login.
          before: async (sessao) => {
            const conta = await prisma.contaAcesso.findUnique({
              where: { id: sessao.userId },
              select: { situacao: true, colaborador: { select: { situacao: true } } },
            });
            if (!conta || conta.situacao !== "ATIVA" || conta.colaborador.situacao !== "ATIVO") {
              return false;
            }
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: "Portal TI Vallur",
        twoFactorTable: "fatorMfa",
        skipVerificationOnEnable: false,
        backupCodeOptions: { amount: 8 },
      }),
      ...(cookiesNext ? [nextCookies()] : []),
    ],
  });
}

type Auth = ReturnType<typeof criarAuth>;
const global = globalThis as unknown as { authVallur?: Auth };

export function obterAuth(): Auth {
  global.authVallur ??= criarAuth({ cookiesNext: true });
  return global.authVallur;
}
