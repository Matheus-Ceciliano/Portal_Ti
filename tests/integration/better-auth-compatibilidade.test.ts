/**
 * Validação técnica da biblioteca de autenticação (Check 2 / R-27): Better Auth 1.7.7
 * com Prisma 7.10 (adaptador pg), PostgreSQL 17 real, Argon2id com pepper e TOTP.
 */
import { verify as argon2Verify } from "@node-rs/argon2";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarAuth } from "@/server/auth/better-auth";
import { prisma } from "@/server/db";
import { criarPessoa, limparBanco } from "../apoio/fabricas";
import { gerarTotp, segredoDaUri } from "../apoio/totp";

const auth = criarAuth({ cookiesNext: false });
const espiaoFetch = vi.spyOn(globalThis, "fetch");

function cookies(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (e) {
    const erro = e as { status?: string; statusCode?: number; body?: { code?: string; message?: string } };
    return { status: erro.statusCode, codigo: erro.body?.code, mensagem: erro.body?.message };
  }
  throw new Error("era esperado um erro");
}

beforeEach(limparBanco);
afterAll(() => {
  // Nenhuma chamada de rede (telemetria desativada; nada sai da máquina).
  expect(espiaoFetch).not.toHaveBeenCalled();
});

describe("Better Auth 1.7.7 no ambiente real do projeto", () => {
  it("login válido cria sessão opaca no PostgreSQL com cookie HttpOnly e SameSite=Lax", async () => {
    const p = await criarPessoa({ ativada: true });
    const { headers } = await auth.api.signInEmail({
      body: { email: p.email, password: p.senha },
      headers: new Headers(),
      returnHeaders: true,
    });
    const setCookie = headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/vallur\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(1);

    const sessao = await auth.api.getSession({ headers: new Headers({ cookie: cookies(headers) }) });
    expect(sessao?.user.id).toBe(p.contaId);
  });

  it("senha errada e e-mail inexistente devolvem exatamente o mesmo erro (sem enumeração)", async () => {
    const p = await criarPessoa({ ativada: true });
    const senhaErrada = await erroDe(
      auth.api.signInEmail({ body: { email: p.email, password: "Senha-Errada-123" }, headers: new Headers() }),
    );
    const inexistente = await erroDe(
      auth.api.signInEmail({
        body: { email: "ninguem@vallur.test", password: "Senha-Errada-123" },
        headers: new Headers(),
      }),
    );
    expect(senhaErrada).toEqual(inexistente);
    expect(senhaErrada.status).toBe(401);
  });

  it("conta bloqueada não recebe sessão, mesmo com a senha correta", async () => {
    const p = await criarPessoa({ ativada: true, situacaoConta: "BLOQUEADA" });
    await erroDe(auth.api.signInEmail({ body: { email: p.email, password: p.senha }, headers: new Headers() }));
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(0);
  });

  it("guarda somente hash Argon2id, que não verifica sem o pepper", async () => {
    const p = await criarPessoa();
    const credencial = await prisma.credencialConta.findFirstOrThrow({ where: { userId: p.contaId } });
    expect(credencial.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(credencial.password).not.toContain(p.senha);
    expect(await argon2Verify(credencial.password!, p.senha)).toBe(false);
  });

  it("cadastro público está desativado", async () => {
    const erro = await erroDe(
      auth.api.signUpEmail({
        body: { email: "novo@vallur.test", password: "Senha-Longa-12345", name: "Novo" },
        headers: new Headers(),
      }),
    );
    expect(erro.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.contaAcesso.count()).toBe(0);
  });

  it("TOTP: ativação, login com desafio e sessão criada só após o código correto", async () => {
    const p = await criarPessoa({ ativada: true });
    const login = await auth.api.signInEmail({
      body: { email: p.email, password: p.senha },
      headers: new Headers(),
      returnHeaders: true,
    });
    const cookieSessao = cookies(login.headers);

    const ativacao = await auth.api.enableTwoFactor({
      body: { password: p.senha, method: "totp" },
      headers: new Headers({ cookie: cookieSessao }),
    });
    if (ativacao.method !== "totp") throw new Error("esperado TOTP");
    const segredo = segredoDaUri(ativacao.totpURI);
    const confirmacao = await auth.api.verifyTOTP({
      body: { code: gerarTotp(segredo) },
      headers: new Headers({ cookie: cookieSessao }),
      returnHeaders: true,
    });
    expect(confirmacao.headers.getSetCookie().join()).toMatch(/vallur\.session_token=/);
    const conta = await prisma.contaAcesso.findUniqueOrThrow({ where: { id: p.contaId } });
    expect(conta.twoFactorEnabled).toBe(true);

    await prisma.sessao.deleteMany({ where: { userId: p.contaId } });
    const novoLogin = await auth.api.signInEmail({
      body: { email: p.email, password: p.senha },
      headers: new Headers(),
      returnHeaders: true,
    });
    expect(novoLogin.response).toMatchObject({ twoFactorRedirect: true });
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(0);
    const cookieDesafio = cookies(novoLogin.headers);

    const errado = await erroDe(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: new Headers({ cookie: cookieDesafio }) }),
    );
    expect(errado.status).toBe(401);
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(0);

    const certo = await auth.api.verifyTOTP({
      body: { code: gerarTotp(segredo) },
      headers: new Headers({ cookie: cookieDesafio }),
    });
    expect(certo.token).toBeTruthy();
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(1);
  });

  it("saída exclui a sessão do banco (revogação imediata)", async () => {
    const p = await criarPessoa({ ativada: true });
    const { headers } = await auth.api.signInEmail({
      body: { email: p.email, password: p.senha },
      headers: new Headers(),
      returnHeaders: true,
    });
    const cookie = cookies(headers);
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect(await prisma.sessao.count({ where: { userId: p.contaId } })).toBe(0);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("sessão excluída no banco deixa de valer na hora (sem cache em cookie)", async () => {
    const p = await criarPessoa({ ativada: true });
    const { headers } = await auth.api.signInEmail({
      body: { email: p.email, password: p.senha },
      headers: new Headers(),
      returnHeaders: true,
    });
    const cookie = cookies(headers);
    await prisma.sessao.deleteMany({ where: { userId: p.contaId } });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
});
