import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Equipamentos da carga fictícia (mesmos ids do seed). */
const ativo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NBI4390 = ativo(8); // Atalaia (ASA), com Ricardo Moura em ALO-2026-0003; não usado por outros specs
const EM_MANUTENCAO = ativo(11);
const BAIXADO = ativo(15);

async function escolher(page: Page, escopo: Locator, rotulo: RegExp, opcao: RegExp) {
  await escopo.getByLabel(rotulo).click();
  await page.getByRole("option", { name: opcao }).click();
}

async function abrirMenu(page: Page, item: string) {
  await page.getByTestId("transferir").click();
  await page.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Transferências na ficha do equipamento (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("colaborador, empresa e reserva: confirmação explícita, histórico e edição sem a empresa", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ti/inventario/${NBI4390}`);
    const alocacao = page.getByRole("region", { name: "Alocação" });
    await expect(alocacao).toContainText("ALO-2026-0003");

    // Entre colaboradores: o atual aparece e não pode ser escolhido; sem a confirmação física, nada é gravado.
    await abrirMenu(page, "Transferir colaborador");
    const c = page.getByTestId("dialogo-transferir-colaborador");
    await expect(c.getByText("Ricardo Moura · ALO-2026-0003")).toBeVisible();
    await c.getByLabel(/^Novo colaborador/).click();
    await expect(page.getByRole("option", { name: /^Ricardo Moura/ })).toHaveCount(0);
    await page.getByRole("option", { name: /^Tatiane Freitas/ }).click();
    await c.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(c.getByText("Confirme a devolução e a entrega física do equipamento.")).toBeVisible();
    await c.getByLabel(/^Confirmo que Ricardo Moura devolveu o equipamento e que ele foi entregue fisicamente a Tatiane Freitas/).check();
    await c.getByLabel(/^Observação ou motivo/).fill("Mudança de equipe");
    await c.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(page.getByText(/^Transferido para Tatiane Freitas \(ALO-2026-\d{4}\)\.$/)).toBeVisible();
    await expect(c).toBeHidden();
    await expect(alocacao).not.toContainText("ALO-2026-0003");
    const historico = page.getByTestId("historico-movimentacoes");
    await expect(historico.getByText("Transferência entre colaboradores").first()).toBeVisible();
    await expect(historico).toContainText("De Ricardo Moura (ALO-2026-0003) para Tatiane Freitas");

    // Entre empresas: destino e motivo obrigatórios; confirmação explícita antes de salvar.
    const numeroAtual = (await alocacao.locator(".tabular").first().textContent())!;
    await abrirMenu(page, "Transferir empresa");
    const e = page.getByTestId("dialogo-transferir-empresa");
    await expect(e.getByRole("note")).toContainText("não modifica quem está com o equipamento: continua com Tatiane Freitas");
    await expect(e).toContainText("NBI4390.C1");
    await e.getByLabel(/^Motivo da transferência/).fill("   ");
    await e.getByRole("button", { name: "Continuar" }).click();
    await expect(e.getByText("Selecione a empresa de destino.")).toBeVisible();
    await expect(e.getByText("Informe o motivo da transferência.")).toBeVisible();
    await e.getByLabel(/^Empresa de destino/).click();
    await expect(page.getByRole("option", { name: /^Atalaia/ })).toHaveCount(0); // a atual não aparece
    await page.getByRole("option", { name: /^Horizonte Engenharia Ltda\./ }).click();
    await e.getByLabel(/^Motivo da transferência/).fill("Rateio de custos do contrato");
    await e.getByRole("button", { name: "Continuar" }).click();
    await expect(e.getByTestId("confirmacao-transferencia-empresa")).toHaveText(
      "Você está transferindo o equipamento NBI4390 da empresa ASA para a empresa HZE. Essa alteração ficará registrada no histórico.",
    );
    await e.getByRole("button", { name: "Voltar" }).click();
    await expect(e.getByLabel(/^Motivo da transferência/)).toHaveValue("Rateio de custos do contrato");
    await e.getByRole("button", { name: "Continuar" }).click();
    await e.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(page.getByText("Equipamento transferido para Horizonte Engenharia Ltda.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Dados cadastrais" })).toContainText("Horizonte Engenharia Ltda.");
    await expect(alocacao).toContainText(numeroAtual); // quem está com o equipamento não muda
    await expect(historico.getByText("Transferência entre empresas").first()).toBeVisible();
    await expect(historico).toContainText("Motivo: Rateio de custos do contrato");

    // Edição normal: a empresa proprietária é só leitura.
    await page.getByRole("button", { name: "Editar" }).click();
    const d = page.getByTestId("dialogo-equipamento");
    await expect(d.getByText("Alterada por Transferir empresa, na ficha.")).toBeVisible();
    await expect(d.getByRole("combobox", { name: /^Empresa proprietária/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Reserva: a custódia continua até a entrega física; enquanto pendente, nova transferência fica bloqueada.
    await abrirMenu(page, "Transferir colaborador");
    await escolher(page, c, /^Novo colaborador/, /^Fernanda Rocha/);
    await c.getByRole("radio", { name: /^Reservar transferência/ }).click();
    await c.getByRole("button", { name: "Reservar transferência" }).click();
    await expect(page.getByText(/^Transferência para Fernanda Rocha reservada/)).toBeVisible();
    const reservada = page.getByTestId("transferencia-reservada");
    await expect(reservada).toContainText("Transferência reservada para Fernanda Rocha");
    await expect(alocacao).toContainText(numeroAtual);
    await page.getByTestId("transferir").click();
    await expect(page.getByRole("menuitem", { name: /^Transferir colaborador/ })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await reservada.getByRole("button", { name: "Cancelar" }).click();
    const x = page.getByTestId("dialogo-cancelar-transferencia");
    await x.getByRole("button", { name: "Cancelar transferência" }).click();
    await expect(x.getByText("Informe o motivo do cancelamento.")).toBeVisible();
    await x.getByLabel(/^Motivo do cancelamento/).fill("Fernanda mudou de área");
    await x.getByRole("button", { name: "Cancelar transferência" }).click();
    await expect(page.getByText("Transferência cancelada.")).toBeVisible();
    await expect(reservada).toBeHidden();
    await expect(historico).toContainText("Transferência para Fernanda Rocha cancelada: Fernanda mudou de área");
  });

  test("em manutenção não transfere de colaborador; baixado não tem transferência", async ({ page }) => {
    await page.goto(`/ti/inventario/${EM_MANUTENCAO}`);
    await page.getByTestId("transferir").click();
    const item = page.getByRole("menuitem", { name: /^Transferir colaborador/ });
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toContainText("Em manutenção");
    await expect(page.getByRole("menuitem", { name: "Transferir empresa" })).toBeEnabled();
    await page.keyboard.press("Escape");

    await page.goto(`/ti/inventario/${BAIXADO}`);
    await expect(page.getByRole("heading", { level: 1, name: "NBI4199" })).toBeVisible();
    await expect(page.getByTestId("transferir")).toHaveCount(0);
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`modais de transferência sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto(`/ti/inventario/${NBI4390}`); // alocado e sem pendência, antes ou depois do primeiro teste
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      for (const [item, id] of [
        ["Transferir colaborador", "dialogo-transferir-colaborador"],
        ["Transferir empresa", "dialogo-transferir-empresa"],
      ] as const) {
        await abrirMenu(page, item);
        const modal = page.getByTestId(id);
        await expect(modal).toBeVisible();
        await page.waitForTimeout(300);
        const caixa = (await modal.boundingBox())!;
        expect(caixa.width, id).toBeLessThanOrEqual(largura);
        expect(caixa.height, id).toBeLessThanOrEqual(altura);
        expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), id).toBe(true);
        await expect(modal.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Escape");
        await expect(modal).toBeHidden();
      }
    });
  }
});
