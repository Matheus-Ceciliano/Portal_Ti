import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Equipamentos da carga fictícia (mesmos ids do seed). */
const ativo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NBI4390 = ativo(8); // Atalaia (ASA), com Ricardo Moura (ASA) em ALO-2026-0003; não usado por outros specs
const MONITOR_ASA = ativo(13); // VLR-004651, Atalaia, sem carregador
const EM_MANUTENCAO = ativo(11);
const BAIXADO = ativo(15);

async function escolher(page: Page, escopo: Locator, rotulo: RegExp, opcao: RegExp) {
  await escopo.getByLabel(rotulo).click();
  await page.getByRole("option", { name: opcao }).click();
}

/** Detalhe da alocação pela lista de Alocações. */
async function abrirAlocacao(page: Page, numero: string) {
  await page.goto(`/ti/alocacoes?busca=${encodeURIComponent(numero)}`);
  await page.getByRole("button", { name: `Ver detalhes de ${numero}` }).click();
  const modal = page.getByTestId("dialogo-alocacao");
  await expect(modal.getByTestId("itens-alocacao").or(modal.getByRole("tab", { name: "Resumo" }))).toBeVisible();
  return modal;
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Transferências (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("entre colaboradores no detalhe da alocação ativa: confirmação física, empresa conferida, reserva e cancelamento", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const modal = await abrirAlocacao(page, "ALO-2026-0003");

    // O atual não aparece, nem colaboradores de outra empresa; sem a confirmação física, nada é gravado.
    await modal.getByTestId("transferir-colaborador").click();
    const c = page.getByTestId("dialogo-transferir-colaborador");
    await expect(c.getByText("Ricardo Moura · ALO-2026-0003")).toBeVisible();
    await c.getByLabel(/^Novo colaborador/).click();
    await expect(page.getByRole("option", { name: /^Ricardo Moura/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /^Fernanda Rocha/ })).toHaveCount(0); // HZE: equipamento da ASA
    await page.getByRole("option", { name: /^Tatiane Freitas/ }).click();
    await c.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(c.getByText("Confirme a devolução e a entrega física do equipamento.")).toBeVisible();
    await c.getByLabel(/^Confirmo que Ricardo Moura devolveu o equipamento e que ele foi entregue fisicamente a Tatiane Freitas/).check();
    await c.getByLabel(/^Observação ou motivo/).fill("Mudança de equipe");
    await c.getByRole("button", { name: "Confirmar transferência" }).click();
    const sucesso = page.getByText(/^Transferido para Tatiane Freitas \(AL\d{4}\)\.$/);
    await expect(sucesso).toBeVisible();
    const numeroNovo = (await sucesso.textContent())!.match(/AL\d{4}/)![0];
    await expect(c).toBeHidden();
    // A alocação anterior fica encerrada (só consulta): sem a opção de transferir.
    await expect(modal.getByTestId("transferir-colaborador")).toHaveCount(0);

    // Na nova alocação (ativa): reserva para outra pessoa da mesma empresa; a custódia continua.
    const nova = await abrirAlocacao(page, numeroNovo);
    await nova.getByTestId("transferir-colaborador").click();
    await escolher(page, c, /^Novo colaborador/, /^Ricardo Moura/);
    await c.getByRole("radio", { name: /^Reservar transferência/ }).click();
    await c.getByRole("button", { name: "Reservar transferência" }).click();
    await expect(page.getByText(/^Transferência para Ricardo Moura reservada/)).toBeVisible();
    await nova.getByRole("tab", { name: /^Equipamentos/ }).click();
    const reservada = nova.getByTestId("transferencia-reservada");
    await expect(reservada).toContainText("Transferência reservada para Ricardo Moura");
    await reservada.getByRole("button", { name: "Cancelar" }).click();
    const x = page.getByTestId("dialogo-cancelar-transferencia");
    await x.getByRole("button", { name: "Cancelar transferência" }).click();
    await expect(x.getByText("Informe o motivo do cancelamento.")).toBeVisible();
    await x.getByLabel(/^Motivo do cancelamento/).fill("Ricardo mudou de área");
    await x.getByRole("button", { name: "Cancelar transferência" }).click();
    await expect(page.getByText("Transferência cancelada.")).toBeVisible();
    await expect(reservada).toBeHidden();

    // Na ficha do equipamento não há transferência entre colaboradores; o histórico registra tudo.
    await page.goto(`/ti/inventario/${NBI4390}`);
    await page.getByTestId("transferir").click();
    await expect(page.getByRole("menuitem", { name: /^Transferir colaborador/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^Transferir empresa/ })).toBeVisible();
    await page.keyboard.press("Escape");
    const historico = page.getByTestId("historico-movimentacoes");
    await expect(historico).toContainText("De Ricardo Moura (ALO-2026-0003) para Tatiane Freitas");
    await expect(historico).toContainText("Transferência para Ricardo Moura cancelada: Ricardo mudou de área");
  });

  test("entre empresas na ficha: destino e motivo obrigatórios, confirmação explícita e edição sem a empresa", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ti/inventario/${MONITOR_ASA}`);
    await page.getByTestId("transferir").click();
    await page.getByRole("menuitem", { name: /^Transferir empresa/ }).click();
    const e = page.getByTestId("dialogo-transferir-empresa");
    await e.getByLabel(/^Motivo da transferência/).fill("   ");
    await e.getByRole("button", { name: "Continuar" }).click();
    await expect(e.getByText("Selecione a empresa de destino.")).toBeVisible();
    await expect(e.getByText("Informe o motivo da transferência.")).toBeVisible();
    await e.getByLabel(/^Empresa de destino/).click();
    await expect(page.getByRole("option", { name: /^Atalaia/ })).toHaveCount(0); // a atual não aparece
    await page.getByRole("option", { name: /^Horizonte Engenharia Ltda\./ }).click();
    await e.getByLabel(/^Motivo da transferência/).fill("Rateio de custos do contrato");
    await e.getByRole("button", { name: "Continuar" }).click();
    await expect(e.getByTestId("confirmacao-transferencia-empresa")).toContainText("da empresa ASA para a empresa HZE");
    await e.getByRole("button", { name: "Voltar" }).click();
    await expect(e.getByLabel(/^Motivo da transferência/)).toHaveValue("Rateio de custos do contrato");
    await e.getByRole("button", { name: "Continuar" }).click();
    await e.getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(page.getByText("Equipamento transferido para Horizonte Engenharia Ltda.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Dados cadastrais" })).toContainText("Horizonte Engenharia Ltda.");
    await expect(page.getByTestId("historico-movimentacoes")).toContainText("Motivo: Rateio de custos do contrato");

    // Edição normal: a empresa proprietária é só leitura.
    await page.getByRole("button", { name: "Editar" }).click();
    const d = page.getByTestId("dialogo-equipamento");
    await expect(d.getByText("Muda por Transferir empresa, na ficha.")).toBeVisible();
    await expect(d.getByRole("combobox", { name: /^Empresa proprietária/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("em manutenção, a ficha só oferece as operações entre empresas; baixado não tem transferência", async ({ page }) => {
    await page.goto(`/ti/inventario/${EM_MANUTENCAO}`);
    await page.getByTestId("transferir").click();
    await expect(page.getByRole("menuitem", { name: /^Transferir colaborador/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^Transferir empresa/ })).toBeEnabled();
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
      const conferir = async (id: string) => {
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
      };

      // Entre colaboradores: a partir de uma alocação ativa.
      await page.goto("/ti/alocacoes?situacao=ATIVA");
      // Tabela (botão "Ver detalhes de …") ou cartões no celular (o cartão inteiro é o botão).
      await page.getByRole("button", { name: /^(Ver detalhes de )?(AL\d{4}|ALO-\d{4}-\d{4})/ }).first().click();
      await page.getByTestId("dialogo-alocacao").getByTestId("transferir-colaborador").click();
      const escolha = page.getByTestId("dialogo-escolher-transferencia");
      if (await escolha.getByRole("radio").first().isVisible().catch(() => false)) {
        await escolha.getByRole("radio").first().click();
        await escolha.getByRole("button", { name: "Continuar" }).click();
      }
      await conferir("dialogo-transferir-colaborador");

      // Entre empresas: na ficha.
      await page.goto(`/ti/inventario/${MONITOR_ASA}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      await page.getByTestId("transferir").click();
      await page.getByRole("menuitem", { name: /^Transferir empresa/ }).click();
      await conferir("dialogo-transferir-empresa");
    });
  }
});
