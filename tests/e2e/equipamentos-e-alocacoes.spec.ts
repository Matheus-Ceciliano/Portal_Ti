import { expect, test, type Page } from "@playwright/test";
import { estado } from "./apoio";

const HZE = "a1f0c7e2-0000-4000-8000-000000000001"; // Horizonte Engenharia (fictícia)
const NOME_HZE = "Horizonte Engenharia Ltda.";
/** Equipamentos da carga fictícia (mesmos ids do seed). */
const ativo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Ficha do equipamento a partir da empresa (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("nome do equipamento abre a ficha; Voltar restaura aba, pesquisa, filtros e ordenação", async ({ page }) => {
    const origem = `/ti/cadastros/empresas/${HZE}?tab=equipamentos&busca=dell&situacao=ALOCADO&ordenar=modelo&direcao=desc`;
    await page.goto(origem);
    const tabela = page.getByRole("table", { name: "Equipamentos da empresa" });
    await expect(tabela.getByRole("row")).toHaveCount(3); // cabeçalho + 2 notebooks Dell alocados
    await expect(tabela.getByRole("row").nth(1)).toContainText("Dell Latitude 5440"); // modelo decrescente

    // Teclado: o nome é um link focável.
    const link = tabela.getByRole("link", { name: "Dell Latitude 3540", exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`/ti/inventario/${ativo(18)}\\?empresa=`));
    await expect(page.getByRole("heading", { level: 1, name: "NBI4590" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha" })).toContainText(`Empresas/${NOME_HZE}/NBI4590`);
    const dados = page.getByRole("region", { name: "Dados cadastrais" });
    await expect(dados).toContainText("SIM-9H1LN33");
    await expect(dados).toContainText("Notebook");
    await expect(dados.getByText("Não informado")).toHaveCount(2); // aquisição e garantia não cadastradas
    // Custódia e TER ficam em Alocações; a ficha mostra só a referência.
    await expect(page.getByRole("region", { name: "Alocação" })).toContainText("ALO-2026-0006");
    await expect(page.getByRole("region", { name: "Alocação" }).getByRole("link", { name: "Ver em Alocações" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Carregadores" })).toContainText("NBI4590C1");

    await page.getByRole("link", { name: `Voltar para ${NOME_HZE}` }).click();
    await expect(page).toHaveURL(origem);
    await expect(page.getByLabel("Pesquisar equipamentos")).toHaveValue("dell");
    await expect(page.getByLabel("Situação", { exact: true })).toHaveText("Alocado");
    await expect(page.locator('a[aria-current="page"]', { hasText: "Equipamentos" })).toBeVisible();
  });

  test("origem inválida volta ao Inventário; parâmetros inseguros são descartados", async ({ page }) => {
    await page.goto(`/ti/inventario/${ativo(1)}?empresa=https%3A%2F%2Fevil.example&retorno=tab%3Dequipamentos`);
    await expect(page.getByRole("link", { name: "Voltar para o Inventário" })).toHaveAttribute("href", "/ti/inventario");

    await page.goto(`/ti/inventario/${ativo(1)}?empresa=${HZE}&retorno=${encodeURIComponent("tab=//evil.example&next=https://evil.example&situacao=ALOCADO")}`);
    await expect(page.getByRole("link", { name: `Voltar para ${NOME_HZE}` })).toHaveAttribute("href", `/ti/cadastros/empresas/${HZE}?situacao=ALOCADO`);
  });

  test("equipamento inexistente responde 404", async ({ page }) => {
    const resposta = await page.goto(`/ti/inventario/${ativo(99)}`);
    expect(resposta?.status()).toBe(404);
  });
});

test.describe("Alocações da empresa (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("cada linha abre o detalhe da alocação com o equipamento destacado; fechar mantém a aba e os filtros", async ({ page }) => {
    const origem = `/ti/cadastros/empresas/${HZE}?tab=alocacoes&direcao=asc`;
    await page.goto(origem);
    const modal = page.getByTestId("dialogo-alocacao");

    await page.getByRole("button", { name: "Ver detalhes da alocação de VLR-004512 para Ana Beatriz Souza" }).click();
    await expect(modal.getByRole("heading", { name: "ALO-2026-0009" })).toBeVisible();
    await expect(modal).toContainText("TER aguardando");
    await modal.getByRole("tab", { name: /Equipamentos/ }).click();
    const itens = modal.getByTestId("itens-alocacao");
    await expect(itens.getByRole("listitem")).toHaveCount(4); // notebook, carregador, monitor e kit
    await expect(itens).toContainText("NBI4512C1");
    await modal.getByRole("tab", { name: "Documentos" }).click();
    await expect(modal.getByText("TER-2026-0088")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(page).toHaveURL(origem);

    // Entregue sem TER: a entrega física não depende da assinatura.
    await page.getByRole("row", { name: /VLR-004590/ }).getByRole("cell").first().click();
    await expect(modal.getByRole("heading", { name: "ALO-2026-0006" })).toBeVisible();
    await expect(modal).toContainText("Sem TER");
    await page.keyboard.press("Escape");

    // Equipamento de outra empresa entregue a colaboradora da Horizonte (já devolvido).
    await page.getByRole("button", { name: /Ver detalhes da alocação de VLR-004410/ }).click();
    await expect(modal.getByRole("heading", { name: "ALO-2025-0009" })).toBeVisible();
    await modal.getByRole("tab", { name: /Equipamentos/ }).click();
    await expect(modal.getByTestId("itens-alocacao")).toContainText("Proprietária: PBC");
    await expect(modal.getByTestId("itens-alocacao")).toContainText("Devolvido");
  });

  test("do detalhe para as fichas do equipamento e do colaborador", async ({ page }) => {
    await page.goto(`/ti/cadastros/empresas/${HZE}?tab=alocacoes`);
    const modal = page.getByTestId("dialogo-alocacao");
    await page.getByRole("button", { name: /Ver detalhes da alocação de VLR-004512/ }).click();
    await modal.getByRole("tab", { name: /Equipamentos/ }).click();
    await modal.getByRole("link", { name: /^NBI4512 · VLR-004512/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "NBI4512" })).toBeVisible();

    await page.goto(`/ti/cadastros/empresas/${HZE}?tab=alocacoes`);
    await page.getByRole("button", { name: /Ver detalhes da alocação de VLR-004512/ }).click();
    await modal.getByRole("link", { name: "Ficha do colaborador" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ana Beatriz Souza" })).toBeVisible();
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`detalhe da alocação e ficha sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto(`/ti/cadastros/empresas/${HZE}?tab=alocacoes`);
      expect(await semRolagemHorizontal(page)).toBe(true);
      await page.getByRole("button", { name: /Ver detalhes da alocação de VLR-004512/ }).click();
      const modal = page.getByTestId("dialogo-alocacao");
      await expect(modal.getByRole("tab", { name: "Resumo" })).toBeVisible();
      await page.waitForTimeout(300); // fim da animação de entrada
      const caixa = (await modal.boundingBox())!;
      if (largura === 1440) {
        expect(Math.round(caixa.width)).toBe(1000);
        expect(Math.round(caixa.height)).toBe(720);
      } else {
        expect(caixa.width).toBeLessThanOrEqual(largura);
        expect(caixa.height).toBeLessThanOrEqual(altura);
      }
      expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      // Só o conteúdo rola: cabeçalho e ações continuam visíveis.
      await modal.getByRole("tab", { name: "Histórico" }).click();
      await modal.getByTestId("conteudo-alocacao").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(modal.getByRole("heading", { name: "ALO-2026-0009" })).toBeInViewport();
      await expect(modal.getByRole("link", { name: "Ficha do colaborador" })).toBeInViewport();
      await page.keyboard.press("Escape");

      await page.goto(`/ti/inventario/${ativo(1)}?empresa=${HZE}&retorno=tab%3Dequipamentos`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
    });
  }
});

test.describe("Ficha do equipamento sem permissão", () => {
  test.use({ storageState: estado("colaboradora") });

  test("colaborador comum não acessa a ficha, as alocações nem a página da empresa", async ({ page }) => {
    for (const rota of [`/ti/inventario/${ativo(1)}`, "/ti/alocacoes", "/ti/inventario/manutencoes", `/ti/cadastros/empresas/${HZE}?tab=alocacoes`]) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/portal/);
    }
  });
});
