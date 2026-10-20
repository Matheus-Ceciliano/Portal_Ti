import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/**
 * Componentes internos: roda depois de inventario.spec.ts (ordem alfabética), que confere os
 * totais da carga fictícia. Os testes deste arquivo dependem um do outro (estoque → instalação).
 */
test.describe.configure({ mode: "serial" });

const ativo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NBI4377 = ativo(6); // Atalaia (ASA), com Helena Prado em ALO-2025-0012; cadastro antigo (só texto)

async function escolher(page: Page, escopo: Locator, rotulo: RegExp, opcao: string | RegExp) {
  await escopo.getByLabel(rotulo).click();
  await page.getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Componentes internos (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("notebook cadastrado só com a especificação: nenhuma peça física criada", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario");
    await page.getByTestId("cadastrar-equipamento").click();
    const d = page.getByTestId("dialogo-equipamento");
    await escolher(page, d, /^Categoria/, "Notebook");
    await d.getByLabel(/^Nome do dispositivo/).fill("NBI5101");
    await d.getByLabel(/^Patrimônio/).fill("VLR-905101");
    await escolher(page, d, /^Empresa proprietária/, /^Atalaia/);
    await d.getByLabel(/^Marca/).fill("Dell");
    await d.getByLabel(/^Modelo/).fill("Latitude 5450");
    await d.getByLabel(/^Processador/).fill("Intel Core i5-1345U");
    await escolher(page, d, /^Memória RAM/, "16 GB");
    await escolher(page, d, /^Tecnologia da memória/, "DDR4");
    await escolher(page, d, /^Armazenamento/, "SSD");
    await escolher(page, d, /^Capacidade do SSD/, "512 GB");
    await escolher(page, d, /^Interface do SSD/, "NVMe/PCIe");
    await d.getByRole("button", { name: "Cadastrar equipamento" }).click();
    await expect(page.getByText("Equipamento cadastrado com o carregador principal.")).toBeVisible();
    await page.getByRole("button", { name: "Abrir ficha" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "NBI5101" })).toBeVisible();
    const secao = page.getByTestId("componentes-internos");
    await expect(secao).toContainText("16 GB DDR4");
    await expect(secao).toContainText("SSD NVMe/PCIe 512 GB");
    await expect(secao.getByRole("list", { name: "Peças instaladas" }).getByText("Original")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Configuração" })).toContainText("16 GB DDR4");
    await expect(page.getByRole("region", { name: "Carregadores" })).toContainText("NBI5101.C1");

    // Nenhum RAM001/SSD001 nasceu do cadastro.
    await page.goto("/ti/inventario?grupo=componentes");
    await expect(page.getByText("Nenhum componente cadastrado")).toBeVisible();
    await expect(page.getByTestId("indicadores-inventario").getByRole("link", { name: /^Total de componentes: 0\./ })).toBeVisible();
  });

  test("estoque: RAM001, SSD001 e HDD001 com identificação automática e indicadores separados", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const pecas: [string, [RegExp, string][], string][] = [
      ["Memória RAM", [[/^Capacidade/, "16 GB"], [/^Tecnologia/, "DDR4"], [/^Formato/, "SO-DIMM"]], "RAM001"],
      ["SSD", [[/^Capacidade/, "1 TB"], [/^Interface/, "NVMe/PCIe"], [/^Formato/, "M.2 2280"]], "SSD001"],
      ["HD", [[/^Capacidade/, "1 TB"], [/^Interface/, "SATA"]], "HDD001"],
    ];
    await page.goto("/ti/inventario?grupo=componentes");
    await expect(page.getByRole("navigation", { name: "Grupos do inventário" }).getByRole("link", { name: "Componentes internos" })).toHaveAttribute("aria-current", "page");
    for (const [tipo, campos, id] of pecas) {
      await page.getByTestId("cadastrar-componente").click();
      const d = page.getByTestId("dialogo-equipamento");
      await expect(d.getByRole("heading", { name: "Cadastrar componente" })).toBeVisible();
      await escolher(page, d, /^Categoria/, tipo);
      await expect(d.getByLabel(/^Patrimônio/)).toHaveCount(0);
      for (const [rotulo, opcao] of campos) await escolher(page, d, rotulo, opcao);
      if (tipo === "Memória RAM") await d.getByLabel(/^Frequência/).fill("3200");
      await escolher(page, d, /^Empresa proprietária/, /^Atalaia/);
      await d.getByLabel(/^Marca/).fill("Kingston");
      await d.getByLabel(/^Modelo/).fill("Fury");
      await d.getByRole("button", { name: "Cadastrar componente" }).click();
      await expect(page.getByText("Componente cadastrado no estoque.").first()).toBeVisible();
      await expect(page.getByRole("table", { name: "Componentes internos do inventário" })).toContainText(id);
    }
    const tabela = page.getByRole("table", { name: "Componentes internos do inventário" });
    await expect(tabela.getByRole("columnheader")).toHaveText([/Componente/, /Tipo/, "Especificação", /Marca \/ modelo/, "Notebook", /Situação/, "Ações"]);
    await expect(tabela.getByRole("row", { name: /RAM001/ })).toContainText("16 GB DDR4 · SO-DIMM");
    await expect(page.getByTestId("indicadores-inventario").getByRole("link", { name: /^Total de componentes: 3\./ })).toBeVisible();
    // Os números dos equipamentos não incluem as peças.
    await page.goto("/ti/inventario?busca=RAM001");
    await expect(page.getByRole("table", { name: "Equipamentos do inventário" })).toHaveCount(0);
    await expect(page.getByText("Nenhum equipamento encontrado")).toBeVisible();
  });

  test("instalar, substituir peça original e remover para manutenção; configuração e histórico", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario?busca=NBI5101");
    await page.getByRole("link", { name: "NBI5101", exact: true }).first().click();
    const secao = page.getByTestId("componentes-internos");

    // Instalação do estoque: a memória soma à original.
    await secao.getByTestId("adicionar-componente").click();
    let d = page.getByTestId("dialogo-intervencao");
    await escolher(page, d, /^Componente do estoque/, /^RAM001/);
    await d.getByRole("button", { name: "Instalar componente" }).click();
    await expect(page.getByText("RAM001 instalado.")).toBeVisible();
    await expect(secao).toContainText("32 GB DDR4");
    await expect(secao.getByRole("link", { name: "RAM001" })).toBeVisible();

    // Substituição do SSD original pelo HDD001; a peça removida entra no estoque como SSD002.
    await secao.getByRole("button", { name: "Substituir SSD NVMe/PCIe 512 GB" }).click();
    d = page.getByTestId("dialogo-intervencao");
    await escolher(page, d, /^Componente do estoque/, /^HDD001/);
    await d.getByRole("button", { name: "Substituir componente" }).click();
    await expect(d.getByText("Informe o motivo da substituição.")).toBeVisible();
    await d.getByLabel(/^Motivo/).fill("Mais espaço para projetos");
    await d.getByLabel("Registrar a peça removida no estoque").check();
    await escolher(page, d, /^Capacidade/, "512 GB");
    await d.getByLabel(/^Marca/).fill("SK Hynix");
    await d.getByLabel(/^Modelo/).fill("PC801");
    await escolher(page, d, /^Destino/, "Disponível em estoque");
    await d.getByRole("button", { name: "Substituir componente" }).click();
    await expect(page.getByText("Componente substituído por HDD001. Peça removida registrada como SSD002.")).toBeVisible();
    await expect(secao).toContainText("HD SATA 1 TB");
    await expect(secao).not.toContainText("SSD NVMe/PCIe 512 GB");

    // Remoção com destino manutenção.
    await secao.getByRole("button", { name: "Remover RAM001" }).click();
    d = page.getByTestId("dialogo-intervencao");
    await d.getByLabel(/^Motivo/).fill("Erro de memória");
    await escolher(page, d, /^Destino/, "Em manutenção");
    await d.getByRole("button", { name: "Remover componente" }).click();
    await expect(page.getByText("Componente removido.")).toBeVisible();
    await expect(secao).toContainText("16 GB DDR4");
    await expect(secao.getByRole("link", { name: "RAM001" })).toHaveCount(0);

    // Histórico: configuração anterior e resultante de cada intervenção.
    await secao.getByRole("button", { name: /^Histórico de intervenções \(4\)/ }).click();
    const historico = secao.getByTestId("historico-intervencoes");
    await expect(historico.getByText("Substituição")).toBeVisible();
    await expect(historico).toContainText("Mais espaço para projetos");
    await expect(historico).toContainText("Antes: RAM 32 GB DDR4 · SSD NVMe/PCIe 512 GB");

    await page.goto("/ti/inventario?grupo=componentes");
    const tabela = page.getByRole("table", { name: "Componentes internos do inventário" });
    await expect(tabela.getByRole("row", { name: /RAM001/ })).toContainText("Em manutenção");
    await expect(tabela.getByRole("row", { name: /HDD001/ })).toContainText("NBI5101");
    await expect(tabela.getByRole("row", { name: /SSD002/ })).toContainText("Disponível");
  });

  test("cadastro antigo: configuração original antes da intervenção; notebook alocado exige confirmação e continua alocado", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ti/inventario/${NBI4377}`);
    const secao = page.getByTestId("componentes-internos");
    await expect(secao.getByRole("note")).toContainText("Informe a configuração original");
    await expect(secao.getByTestId("adicionar-componente")).toHaveCount(0);
    await secao.getByRole("button", { name: "Informar configuração original" }).click();
    const o = page.getByTestId("dialogo-configuracao-original");
    await expect(o.getByLabel(/^Memória RAM/)).toHaveText("8 GB"); // sugerido pelo texto da ficha
    await escolher(page, o, /^Tecnologia da memória/, "DDR4");
    await o.getByRole("button", { name: "Salvar configuração" }).click();
    await expect(page.getByText("Configuração original registrada.")).toBeVisible();
    await expect(secao.getByText("Original")).toHaveCount(2);

    await secao.getByTestId("adicionar-componente").click();
    const d = page.getByTestId("dialogo-intervencao");
    await expect(d.getByRole("note")).toContainText("Helena Prado");
    await d.getByRole("radio", { name: "Cadastrar nova peça" }).click();
    await escolher(page, d, /^Capacidade/, "8 GB");
    await escolher(page, d, /^Tecnologia/, "DDR4");
    await d.getByLabel(/^Marca/).fill("Crucial");
    await d.getByLabel(/^Modelo/).fill("CT8G4");
    await d.getByRole("button", { name: "Instalar componente" }).click();
    await expect(d.getByText("Confirme que o notebook está disponível para a intervenção.")).toBeVisible();
    await d.getByLabel("Confirmo que o notebook está disponível para a intervenção técnica.").check();
    await d.getByRole("button", { name: "Instalar componente" }).click();
    await expect(page.getByText(/^RAM\d{3} instalado\.$/)).toBeVisible();
    await expect(secao).toContainText("16 GB DDR4");
    await expect(page.getByRole("region", { name: "Alocação" })).toContainText("ALO-2025-0012");

    // Peça não é alocada a pessoas: a ficha dela não oferece transferência de colaborador.
    await secao.getByRole("link", { name: /^RAM\d{3}$/ }).click();
    await expect(page.getByRole("region", { name: "Instalação" })).toContainText("Instalado em NBI4377");
    await page.getByTestId("transferir").click();
    await expect(page.getByRole("menuitem", { name: /^Transferir colaborador/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Transferir empresa" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`lista de componentes, ficha e diálogo sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/ti/inventario?grupo=componentes");
      await expect(page.getByRole("heading", { level: 1, name: "Inventário" })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      await page.goto("/ti/inventario?busca=NBI5101");
      await page.getByRole("link", { name: "NBI5101", exact: true }).first().click();
      await expect(page.getByTestId("componentes-internos")).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      await page.getByTestId("adicionar-componente").click();
      const modal = page.getByTestId("dialogo-intervencao");
      await expect(modal).toBeVisible();
      await page.waitForTimeout(300);
      const caixa = (await modal.boundingBox())!;
      expect(caixa.width).toBeLessThanOrEqual(largura);
      expect(caixa.height).toBeLessThanOrEqual(altura);
      expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(modal.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Escape");
    });
  }
});
