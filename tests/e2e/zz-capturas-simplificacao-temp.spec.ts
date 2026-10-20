// TEMPORÁRIO: capturas para revisão visual do Inventário e dos componentes internos; será removido.
import { expect, test, type Page } from "@playwright/test";
import { estado } from "./apoio";

test.use({ storageState: estado("supervisor") });
test.setTimeout(120_000);

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [largura, altura] of [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const) {
  test(`capturas inventário ${largura}`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/ti/inventario");
    await expect(page.getByRole("heading", { level: 1, name: "Inventário" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.screenshot({ path: `test-results/capturas/r-lista-${largura}.png`, fullPage: true });

    await page.goto("/ti/inventario?visao=geral&situacao=DISPONIVEL");
    await expect(page.getByTestId("visao-geral-inventario")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.screenshot({ path: `test-results/capturas/r-visao-${largura}.png`, fullPage: true });

    await page.goto("/ti/inventario?grupo=componentes");
    await page.waitForTimeout(400);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.screenshot({ path: `test-results/capturas/c-lista-${largura}.png`, fullPage: true });

    await page.goto("/ti/inventario?busca=NBI5101");
    await page.getByRole("link", { name: "NBI5101", exact: true }).first().click();
    await expect(page.getByTestId("componentes-internos")).toBeVisible();
    await page.getByRole("button", { name: /^Histórico de intervenções/ }).click();
    await page.waitForTimeout(400);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.screenshot({ path: `test-results/capturas/c-ficha-${largura}.png`, fullPage: true });
    await page.getByTestId("adicionar-componente").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/capturas/c-dialogo-${largura}.png` });
    await page.keyboard.press("Escape");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ti/inventario?grupo=componentes&visao=geral");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/capturas/c-escuro-${largura}.png`, fullPage: true });
  });
}
