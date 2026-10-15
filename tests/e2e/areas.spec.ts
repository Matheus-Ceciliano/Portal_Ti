import { expect, test, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Registra os hosts de todas as requisições: nada pode sair de localhost (Microsoft simulado). */
function vigiarRede(page: Page) {
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  return hosts;
}

test.describe("Supervisor TI", () => {
  test.use({ storageState: estado("supervisor") });

  test("dashboard operacional com dados reais e fictícios identificados", async ({ page }) => {
    const hosts = vigiarRede(page);
    await page.goto("/ti");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard operacional");
    await expect(page.getByText("Banco do portal").first()).toBeVisible();
    await expect(page.getByText("Dado fictício").first()).toBeVisible();
    await expect(page.getByText("Notebook não conecta à rede da obra")).toBeVisible();
    await expect(page.getByText("Operacional (simulado)").first()).toBeVisible();
    for (const rota of ["/ti/cadastros/pessoas", "/ti/inventario", "/ti/integracoes", "/ti/auditoria", "/ti/configuracoes", "/ti/documentos/ter", "/ti/documentos/tdv", "/ti/chamados", "/ti/tutoriais", "/ti/cadastros/empresas"]) {
      const resposta = await page.goto(rota);
      expect(resposta?.status(), rota).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    // Falha simulada do conector: estado de erro tratado na tela.
    await page.goto("/ti/integracoes?cenario=INDISPONIVEL");
    await expect(page.getByText("Não foi possível consultar o conector").first()).toBeVisible();
    expect([...hosts].filter((h) => h !== "localhost")).toEqual([]);
  });

  test("navegação mostra a administração completa", async ({ page }) => {
    await page.goto("/ti");
    const nav = page.getByRole("navigation", { name: "Navegação da área de TI" }).first();
    for (const item of ["Dashboard", "Empresas", "Pessoas", "Inventário", "TER", "TDV", "Chamados", "Tutoriais", "Integrações", "Auditoria", "Configurações"]) {
      await expect(nav.getByRole("link", { name: new RegExp(`^${item}`) })).toBeVisible();
    }
    await page.goto("/ti/configuracoes");
    await expect(page.getByRole("heading", { name: "Atribuir perfil de TI" })).toBeVisible();
  });

  test("tema escuro aplica e persiste após recarregar", async ({ page }) => {
    await page.goto("/ti");
    await page.getByTestId("alternar-tema").click();
    await page.getByTestId("tema-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fundo).toBe("rgb(15, 23, 38)");
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByTestId("alternar-tema").click();
    await page.getByTestId("tema-light").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  for (const largura of [375, 390, 768]) {
    test(`navegação responsiva em ${largura}px usa gaveta e não rola na horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto("/ti/cadastros/pessoas");
      const largurasDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largurasDocumento).toBeLessThanOrEqual(largura);
      await page.getByTestId("abrir-menu").click();
      const gaveta = page.getByRole("dialog", { name: "Menu de navegação" });
      await expect(gaveta).toBeVisible();
      await gaveta.getByRole("link", { name: /^Inventário/ }).click();
      await expect(page).toHaveURL(/\/ti\/inventario/);
      await expect(gaveta).toBeHidden();
    });
  }
});

test.describe("Gestor ADM", () => {
  test.use({ storageState: estado("gestor") });

  test("vê o dashboard gerencial por padrão, com a mesma administração", async ({ page }) => {
    await page.goto("/ti");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard gerencial");
    await expect(page.getByRole("heading", { name: "Pessoas ativas por empresa" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Pessoas ativas por empresa" })).toBeVisible();
    await page.goto("/ti/configuracoes");
    await expect(page.getByRole("heading", { name: "Atribuir perfil de TI" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conceder permissão individual" })).toBeVisible();
  });
});

test.describe("Estagiário TI", () => {
  test.use({ storageState: estado("estagiario") });

  test("não vê gestão de perfis nem a opção de provisionar sem concessão", async ({ page }) => {
    await page.goto("/ti/configuracoes");
    await expect(page.getByText("Somente Supervisor TI e Gestor ADM alteram perfis e permissões.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atribuir perfil de TI" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ações para/ })).toHaveCount(0);

    await page.goto("/ti/cadastros/pessoas/nova");
    await expect(page.getByText("A criação da conta Microsoft 365 exige a permissão de provisionamento.")).toBeVisible();
    await expect(page.getByText("Criar a conta Microsoft 365 com a mesma senha")).toHaveCount(0);
  });
});

test.describe("Colaborador", () => {
  test.use({ storageState: estado("colaboradora") });

  test("vê só os próprios equipamentos e não acessa a área de TI", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Olá, Ana");
    await expect(page.getByText("Notebook · patrimônio VLR-004512")).toBeVisible();
    await expect(page.getByText("Emitido em 12/03/2026", { exact: false })).toBeVisible();
    await expect(page.getByText("VLR-004601")).toHaveCount(0); // equipamento de outra pessoa
    const navInferior = page.getByRole("navigation", { name: "Navegação do portal" }).last();
    await navInferior.getByRole("link", { name: "Meus documentos" }).click();
    await expect(page).toHaveURL(/\/portal\/documentos/);
    await expect(page.getByText("TER-2026-0088")).toBeVisible();

    await page.goto("/ti");
    await expect(page).toHaveURL(/\/portal$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
