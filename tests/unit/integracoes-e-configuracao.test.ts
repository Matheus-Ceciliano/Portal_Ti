import { afterAll, describe, expect, it, vi } from "vitest";
import { obterConectores } from "@/integrations/fabrica";
import { criarConectorM365Simulado } from "@/integrations/microsoft-365/simulado";
import { criarConectorTeamsSimulado } from "@/integrations/teams/simulado";
import { sanitizarDetalhe } from "@/server/auditoria";
import { validarPoliticaSenha } from "@/server/auth/senha";
import { validarConfiguracao } from "@/server/config";

const espiaoFetch = vi.spyOn(globalThis, "fetch");
afterAll(() => expect(espiaoFetch).not.toHaveBeenCalled());

const base = {
  AMBIENTE: "DESENVOLVIMENTO",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(40),
  SENHA_PEPPER: "y".repeat(40),
};

describe("configuração (DA-23)", () => {
  it("sem AMBIENTE a aplicação não inicia", () => {
    expect(() => validarConfiguracao({ ...base, AMBIENTE: undefined })).toThrow(/AMBIENTE/);
  });
  it("recusa conectores reais e tenants de escrita", () => {
    expect(() => validarConfiguracao({ ...base, MODO_INTEGRACOES: "ATIVO" })).toThrow(/MODO_INTEGRACOES/);
    expect(() => validarConfiguracao({ ...base, TENANTS_ESCRITA_AUTORIZADOS: "algum-tenant" })).toThrow(
      /TENANTS_ESCRITA_AUTORIZADOS/,
    );
  });
  it("a mensagem de erro nunca contém o valor dos segredos", () => {
    try {
      validarConfiguracao({ ...base, SENHA_PEPPER: "curto-demais" });
    } catch (e) {
      expect(String(e)).toMatch(/SENHA_PEPPER/);
      expect(String(e)).not.toContain("curto-demais");
    }
  });
  it("fora de desenvolvimento exige https", () => {
    expect(() => validarConfiguracao({ ...base, AMBIENTE: "HOMOLOGACAO" })).toThrow(/https/);
  });
});

describe("conectores Microsoft (somente simulação)", () => {
  it("a fábrica recusa qualquer modo diferente de SIMULACAO", () => {
    expect(() => obterConectores({ MODO_INTEGRACOES: "ATIVO" as never })).toThrow(/SIMULACAO/);
    const c = obterConectores({ MODO_INTEGRACOES: "SIMULACAO" });
    expect(c.microsoft365.modo).toBe("SIMULACAO");
    expect(c.teams.modo).toBe("SIMULACAO");
  });

  it("criação de usuário é marcada como simulada, com id fictício, e não devolve a senha", async () => {
    const m365 = criarConectorM365Simulado();
    const r = await m365.criarUsuario({
      nomeExibicao: "Pessoa Fictícia",
      upn: "pessoa@vallur.test",
      senhaInicial: "Senha-Secreta-123",
      marcadorPortal: "abc123",
    });
    expect(r.simulado).toBe(true);
    expect(r.ok && r.dados.objectId.startsWith("sim-")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("Senha-Secreta-123");
    const estado = await m365.verificarEstado("abc123");
    expect(estado.ok && estado.dados).toBe("JA_APLICADO");
  });

  it("simula falhas previsíveis para teste de tratamento de erro", async () => {
    const m365 = criarConectorM365Simulado();
    const falha = await m365.criarUsuario({
      nomeExibicao: "X",
      upn: "simular-falha.x@vallur.test",
      senhaInicial: "s",
      marcadorPortal: "m1",
    });
    expect(falha.ok).toBe(false);
    expect(!falha.ok && falha.erro).toMatchObject({ codigo: "INDISPONIVEL", transitorio: true });

    const teams = criarConectorTeamsSimulado({ cenario: "LIMITE_REQUISICOES" });
    const equipes = await teams.listarEquipes();
    expect(!equipes.ok && equipes.erro.codigo).toBe("LIMITE_REQUISICOES");
    expect((await teams.verificarSaude()).estado).toBe("INDISPONIVEL");
  });
});

describe("política de senha e auditoria", () => {
  it("aplica comprimento, lista de senhas comuns e e-mail", () => {
    expect(validarPoliticaSenha("curta")).toMatch(/12 caracteres/);
    expect(validarPoliticaSenha("vallur123456")).toMatch(/comum/);
    expect(validarPoliticaSenha("maria.silva-2026!", "maria.silva@vallur.test")).toMatch(/e-mail/);
    expect(validarPoliticaSenha("Cavalo-Bateria-Grampo-7")).toBeNull();
  });

  it("detalhe de auditoria descarta chaves sensíveis, inclusive aninhadas", () => {
    const limpo = sanitizarDetalhe({ senha: "x", ok: 1, aninhado: { passwordHash: "y", sistema: "M365" }, token: "t" });
    expect(limpo).toEqual({ ok: 1, aninhado: { sistema: "M365" } });
  });
});
