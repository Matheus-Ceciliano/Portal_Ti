import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Seleção personalizada (Radix/cmdk): abre pelo rótulo e escolhe a opção no menu flutuante. */
async function escolher(page: Page, escopo: Locator, rotulo: string, opcao: string) {
  await escopo.getByLabel(rotulo, { exact: true }).click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
}

test.describe("Empresas (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("tabela com as seis colunas pedidas, sem a coluna Cidade", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    const cabecalhos = page.getByRole("table", { name: "Empresas do grupo" }).getByRole("columnheader");
    await expect(cabecalhos).toHaveText(["Logo", "Nome da empresa", "CNPJ", "Pessoas ativas", "Situação", "Ações"]);
    await expect(page.getByRole("row", { name: /Horizonte Engenharia/ }).getByRole("cell").nth(2)).toHaveText("VL.RTE.STE/0001-60");
  });

  test("cadastro valida o CNPJ, salva e atualiza a tabela; detalhes abrem pela linha", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    await page.getByTestId("cadastrar-empresa").click();
    const dialogo = page.getByTestId("dialogo-empresa");
    await expect(dialogo.getByRole("heading", { name: "Cadastrar empresa" })).toBeVisible();

    await dialogo.getByLabel(/Razão social/).fill("Vale Verde Engenharia Ltda.");
    await dialogo.getByLabel(/Sigla ou nome curto/).fill("VVE");
    await dialogo.getByLabel(/^CNPJ/).fill("11222333000180");
    await dialogo.getByLabel(/^Cidade/).click();
    await expect(dialogo.getByText("CNPJ inválido: os dígitos verificadores não conferem.")).toBeVisible();

    await dialogo.getByLabel(/^CNPJ/).fill("12ABC34501DE35");
    await expect(dialogo.getByLabel(/^CNPJ/)).toHaveValue("12.ABC.345/01DE-35");
    await dialogo.getByLabel(/^Cidade/).fill("Sete Lagoas");
    await dialogo.getByRole("button", { name: "Cadastrar empresa" }).click();
    await expect(page.getByText("Vale Verde Engenharia Ltda. cadastrada.")).toBeVisible();
    await expect(dialogo).toBeHidden();

    const linha = page.getByRole("row", { name: /Vale Verde Engenharia/ });
    await expect(linha).toContainText("12.ABC.345/01DE-35");
    await linha.getByRole("cell").nth(2).click(); // clique na linha (fora dos botões)
    const detalhes = page.getByTestId("dialogo-detalhes-empresa");
    await expect(detalhes.getByRole("heading", { name: "Vale Verde Engenharia Ltda." })).toBeVisible();
    await expect(detalhes.getByTestId("cnpj-completo")).toHaveText("12.ABC.345/01DE-35");
    await detalhes.getByRole("tab", { name: "Anexos" }).click();
    await expect(detalhes.getByText("Anexos ainda não disponíveis")).toBeVisible();
    await detalhes.getByRole("tab", { name: "Colaboradores" }).click();
    await expect(detalhes.getByText("Nenhum colaborador")).toBeVisible();
  });
});

test.describe("Empresas responsivo (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  for (const largura of [375, 390, 768, 1440]) {
    test(`sem rolagem horizontal em ${largura}px, inclusive com os diálogos abertos`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      await page.goto("/ti/cadastros/empresas");
      const semTransbordar = async (seletor?: string) =>
        page.evaluate((s) => {
          const el = s ? document.querySelector(s) : document.documentElement;
          return el ? el.scrollWidth <= el.clientWidth + 1 : false;
        }, seletor);
      expect(await semTransbordar()).toBe(true);

      await page.getByTestId("cadastrar-empresa").click();
      await expect(page.getByTestId("dialogo-empresa")).toBeVisible();
      expect(await semTransbordar("[data-testid=dialogo-empresa]")).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("dialogo-empresa")).toBeHidden();

      await page.getByRole("button", { name: /Horizonte Engenharia/ }).first().click();
      const detalhes = page.getByTestId("dialogo-detalhes-empresa");
      await expect(detalhes.getByRole("tab", { name: "Alocações" })).toBeVisible();
      await detalhes.getByRole("tab", { name: "Alocações" }).click();
      expect(await semTransbordar("[data-testid=dialogo-detalhes-empresa]")).toBe(true);
      expect(await semTransbordar()).toBe(true);
    });
  }
});

test.describe("Detalhes da empresa com tamanho fixo (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
    // Notebooks e janelas com altura reduzida.
    [1440, 640],
    [1366, 600],
    [1024, 560],
    [390, 560],
  ] as const) {
    test(`não muda de tamanho entre as abas em ${largura}×${altura} e só o conteúdo rola`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      for (const empresa of ["Volume Testes E2E", "Horizonte Engenharia"]) {
        await page.goto("/ti/cadastros/empresas");
        await page.getByRole("button", { name: new RegExp(empresa) }).first().click();
        const dialogo = page.getByTestId("dialogo-detalhes-empresa");
        await expect(dialogo.getByRole("tab", { name: "Anexos" })).toBeVisible();
        await page.waitForTimeout(300); // fim da animação de entrada
        const inicial = (await dialogo.boundingBox())!;

        // Área visível sem a barra de rolagem.
        const area = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
        // Com o menu lateral fixo (lg+, 240px), a referência é a área de trabalho à direita dele.
        const menu = area.w >= 1024 ? 240 : 0;
        if (largura >= 640) {
          expect(Math.round(inicial.width)).toBe(Math.min(1000, area.w - menu - 32));
          expect(Math.abs(inicial.height - Math.min(750, area.h * 0.9))).toBeLessThanOrEqual(1);
        } else {
          expect(Math.round(inicial.width)).toBe(area.w - 16);
          expect(Math.round(inicial.height)).toBe(area.h - 16);
        }
        // Centralizado nos dois eixos, com margem visível (não encosta no topo nem invade o menu).
        expect(Math.abs(inicial.x + inicial.width / 2 - (menu + (area.w - menu) / 2))).toBeLessThanOrEqual(1);
        expect(inicial.x).toBeGreaterThanOrEqual(menu + (largura >= 640 ? 15 : 7)); // 8px de margem no celular
        expect(Math.abs(inicial.y + inicial.height / 2 - area.h / 2)).toBeLessThanOrEqual(1);
        expect(inicial.y).toBeGreaterThanOrEqual(7);

        for (const aba of ["Colaboradores", "Equipamentos", "Alocações", "Anexos", "Resumo"]) {
          await dialogo.getByRole("tab", { name: aba }).click();
          await expect(dialogo.getByRole("tab", { name: aba })).toHaveAttribute("data-state", "active");
          const caixa = (await dialogo.boundingBox())!;
          expect([caixa.x, caixa.y, caixa.width, caixa.height].map(Math.round)).toEqual(
            [inicial.x, inicial.y, inicial.width, inicial.height].map(Math.round),
          );
          // Rolar o conteúdo até o fim não tira o cabeçalho, o botão de fechar nem as abas da tela.
          await dialogo.getByTestId("conteudo-aba").evaluate((el) => el.scrollTo(0, el.scrollHeight));
          await expect(dialogo.getByRole("heading", { level: 2 })).toBeInViewport();
          await expect(dialogo.getByRole("button", { name: "Fechar" })).toBeInViewport();
          await expect(dialogo.getByRole("tablist")).toBeInViewport();
          expect(await dialogo.evaluate((el) => el.scrollTop)).toBe(0);
        }

        // Rodapé fixo visível (na aba Resumo, a ação é "Abrir página completa").
        await expect(dialogo.getByRole("link", { name: "Abrir página completa" })).toBeInViewport({ ratio: 1 });
        await expect(dialogo.getByRole("region", { name: "Ir para" })).toHaveCount(0);

        if (empresa.startsWith("Volume")) {
          await dialogo.getByRole("tab", { name: "Colaboradores" }).click();
          const conteudo = dialogo.getByTestId("conteudo-aba");
          expect(await conteudo.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
          await dialogo.getByRole("tab", { name: "Equipamentos" }).click();
          await expect(dialogo.getByText("Nenhum equipamento")).toBeVisible();
          await page.screenshot({ path: `test-results/capturas/detalhes-${largura}x${altura}.png` });
        }
        await page.keyboard.press("Escape");
        await expect(dialogo).toBeHidden();
      }
    });
  }
});

test.describe("Central da empresa: modal e página completa (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  async function abrirModal(page: Page, empresa: RegExp) {
    await page.goto("/ti/cadastros/empresas");
    await page.getByRole("button", { name: empresa }).first().click();
    const dialogo = page.getByTestId("dialogo-detalhes-empresa");
    await expect(dialogo.getByRole("tab", { name: "Anexos" })).toBeVisible();
    return dialogo;
  }

  test("modal: pesquisa e filtros funcionam nas abas de registros", async ({ page }) => {
    const dialogo = await abrirModal(page, /Volume Testes E2E/);
    await dialogo.getByRole("tab", { name: "Colaboradores" }).click();
    await expect(dialogo.getByText("40 colaboradores · mostrando 10")).toBeVisible();
    await dialogo.getByLabel("Pesquisar colaboradores").fill("volume.7@vallur");
    await expect(dialogo.getByText("1 de 40 colaboradores")).toBeVisible();
    await expect(dialogo.getByRole("link", { name: "Pessoa Volume 07" }).first()).toBeVisible();
    await dialogo.getByRole("button", { name: "Limpar filtros" }).click();
    await escolher(page, dialogo, "Situação", "Afastado");
    await expect(dialogo.getByText("Nenhum registro encontrado")).toBeVisible();
    await page.keyboard.press("Escape");

    const horizonte = await abrirModal(page, /Horizonte Engenharia/);
    await horizonte.getByRole("tab", { name: "Equipamentos" }).click();
    await horizonte.getByLabel("Pesquisar equipamentos").fill("SIM-310ZK88");
    await expect(horizonte.getByText("1 de 5 equipamentos")).toBeVisible();
    await expect(horizonte.getByText("VLR-004513").first()).toBeVisible();
    await horizonte.getByRole("button", { name: "Limpar filtros" }).click();
    await escolher(page, horizonte, "Categoria", "Celular");
    await expect(horizonte.getByText("1 de 5 equipamentos")).toBeVisible();

    await horizonte.getByRole("tab", { name: "Alocações" }).click();
    await expect(horizonte.getByText(/^\d+ alocaç(ão|ões)$/)).toBeVisible();
    await escolher(page, horizonte, "Ordenação por data", "Mais antigas");
    await expect(horizonte.getByRole("row").nth(1)).toContainText("VLR-004410");
    await escolher(page, horizonte, "Período", "Últimos 90 dias");
    await expect(horizonte.getByText("Nenhum registro encontrado")).toBeVisible();
  });

  test("modal → página completa: Ver todos com a aba e a pesquisa, trilha de volta", async ({ page }) => {
    const dialogo = await abrirModal(page, /Volume Testes E2E/);
    await dialogo.getByRole("tab", { name: "Colaboradores" }).click();
    await dialogo.getByLabel("Pesquisar colaboradores").fill("Volume 1");
    await expect(dialogo.getByText(/de 40 colaboradores/)).toBeVisible();
    await dialogo.getByRole("link", { name: "Ver todos os colaboradores" }).click();
    await expect(page).toHaveURL(/\/ti\/cadastros\/empresas\/[0-9a-f-]{36}\?tab=colaboradores&busca=Volume\+1/);
    await expect(page.getByRole("heading", { level: 1, name: "Volume Testes E2E Ltda." })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]', { hasText: "Colaboradores" })).toBeVisible();
    await expect(page.getByText("10 de 40 colaboradores")).toBeVisible(); // Pessoa Volume 10 a 19

    await page.getByRole("navigation", { name: "Trilha" }).getByRole("link", { name: "Empresas" }).click();
    await expect(page).toHaveURL(/\/ti\/cadastros\/empresas$/);

    const horizonte = await abrirModal(page, /Horizonte Engenharia/);
    await horizonte.getByRole("tab", { name: "Equipamentos" }).click();
    await horizonte.getByRole("link", { name: "Ver todos os equipamentos" }).click();
    await expect(page).toHaveURL(/tab=equipamentos/);
    await expect(page.locator('a[aria-current="page"]', { hasText: "Equipamentos" })).toBeVisible();

    const outra = await abrirModal(page, /Horizonte Engenharia/);
    await outra.getByRole("tab", { name: "Alocações" }).click();
    await outra.getByRole("link", { name: "Ver todas as alocações" }).click();
    await expect(page).toHaveURL(/tab=alocacoes/);
    await expect(page.locator('a[aria-current="page"]', { hasText: "Alocações" })).toBeVisible();

    const resumo = await abrirModal(page, /Horizonte Engenharia/);
    await resumo.getByRole("link", { name: "Abrir página completa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Horizonte Engenharia Ltda." })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]', { hasText: "Visão geral" })).toBeVisible();
  });

  test("página completa: paginação, ordenação, ficha do colaborador e inventário", async ({ page }) => {
    const dialogo = await abrirModal(page, /Volume Testes E2E/);
    await dialogo.getByRole("link", { name: "Abrir página completa" }).click();
    await page.getByRole("navigation", { name: "Seções da empresa" }).getByRole("link", { name: /Colaboradores/ }).click();
    await expect(page.getByText("Página 1 de 3 · 40 registros")).toBeVisible();
    await page.getByRole("link", { name: "Próxima" }).click();
    await expect(page.getByText("Página 2 de 3 · 40 registros")).toBeVisible();
    await page.getByRole("columnheader", { name: /Colaborador/ }).getByRole("link").click(); // nome decrescente
    await expect(page.getByRole("row").nth(1)).toContainText("Pessoa Volume 40");

    await page.getByRole("row").nth(1).getByRole("link", { name: "Pessoa Volume 40", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pessoa Volume 40" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha" })).toContainText("Volume Testes E2E Ltda.");

    const horizonte = await abrirModal(page, /Horizonte Engenharia/);
    await horizonte.getByRole("tab", { name: "Equipamentos" }).click();
    await horizonte.getByRole("link", { name: "Abrir ficha do equipamento VLR-004512" }).click();
    await expect(page).toHaveURL(/\/ti\/inventario\/c3a9e1b4-0000-4000-8000-000000000001\?empresa=/);
    await expect(page.getByRole("heading", { level: 1, name: "NBI4512" })).toBeVisible();
  });

  test("modal: falha de conexão mostra erro e permite tentar novamente", async ({ page }) => {
    let offline = true;
    // Server Actions são POST com o cabeçalho next-action; abortar simula "Failed to fetch".
    await page.route("**/ti/cadastros/empresas**", (rota) =>
      offline && rota.request().method() === "POST" && rota.request().headers()["next-action"] ? rota.abort("internetdisconnected") : rota.continue(),
    );
    await page.goto("/ti/cadastros/empresas");
    await page.getByRole("button", { name: /Horizonte Engenharia/ }).first().click();
    const dialogo = page.getByTestId("dialogo-detalhes-empresa");
    await expect(dialogo.getByText("Não foi possível falar com o servidor.", { exact: false })).toBeVisible();

    offline = false;
    await dialogo.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(dialogo.getByRole("tab", { name: /Equipamentos/ })).toBeVisible();

    offline = true;
    await dialogo.getByRole("tab", { name: /Equipamentos/ }).click();
    await expect(dialogo.getByText("Não foi possível falar com o servidor.", { exact: false })).toBeVisible();
    offline = false;
    await dialogo.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(dialogo.getByText("5 equipamentos")).toBeVisible();
  });

  test("acesso direto: id inexistente responde 404", async ({ page }) => {
    const resposta = await page.goto("/ti/cadastros/empresas/00000000-0000-4000-8000-000000000000");
    expect(resposta?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  for (const largura of [375, 390, 768, 1440]) {
    test(`página completa sem rolagem horizontal em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      const id = "a1f0c7e2-0000-4000-8000-000000000001"; // Horizonte (fictícia)
      for (const aba of ["visao-geral", "colaboradores", "equipamentos", "alocacoes", "anexos"]) {
        await page.goto(`/ti/cadastros/empresas/${id}?tab=${aba}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), aba).toBe(true);
      }
    });
  }
});

test.describe("Formulário de empresa, indicadores e seleções (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  const corpoRola = (page: Page) =>
    page.getByTestId("corpo-formulario-empresa").evaluate((el) => el.scrollHeight > el.clientHeight + 1);

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1440, 640],
  ] as const) {
    test(`cadastro em ${largura}×${altura}: ações visíveis, nada cortado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/ti/cadastros/empresas");
      await page.getByTestId("cadastrar-empresa").click();
      const dialogo = page.getByTestId("dialogo-empresa");
      await expect(dialogo.getByRole("heading", { name: "Cadastrar empresa" })).toBeVisible();
      await page.waitForTimeout(300); // fim da animação de entrada
      const caixa = (await dialogo.boundingBox())!;
      expect(caixa.width).toBeLessThanOrEqual(largura);
      expect(caixa.height).toBeLessThanOrEqual(altura);
      if (largura === 1440) expect(Math.round(caixa.width)).toBe(1050);
      // Desktop com altura suficiente: o formulário inteiro cabe, sem rolagem.
      if (largura === 1440 && altura === 900) expect(await corpoRola(page)).toBe(false);
      expect(await dialogo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

      // Cabeçalho e ações sempre visíveis; o último campo é alcançável pela rolagem interna.
      await expect(dialogo.getByRole("button", { name: "Cadastrar empresa" })).toBeInViewport({ ratio: 1 });
      await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
      await dialogo.getByLabel("Observações").scrollIntoViewIfNeeded();
      await expect(dialogo.getByLabel("Observações")).toBeInViewport({ ratio: 1 });
      await expect(dialogo.getByRole("heading", { name: "Cadastrar empresa" })).toBeInViewport();
      await expect(dialogo.getByRole("button", { name: "Cadastrar empresa" })).toBeInViewport({ ratio: 1 });
    });
  }

  test("alterações não salvas pedem confirmação antes de descartar", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    const dialogo = page.getByTestId("dialogo-empresa");
    const confirmacao = page.getByTestId("confirmar-descarte");

    // Sem alterações: fecha direto.
    await page.getByTestId("cadastrar-empresa").click();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();

    await page.getByTestId("cadastrar-empresa").click();
    await dialogo.getByLabel(/Razão social/).fill("Empresa Rascunho Ltda.");
    await page.keyboard.press("Escape");
    await expect(confirmacao.getByRole("heading", { name: "Descartar alterações?" })).toBeVisible();
    await confirmacao.getByRole("button", { name: "Continuar editando" }).click();
    await expect(confirmacao).toBeHidden();
    await expect(dialogo.getByLabel(/Razão social/)).toHaveValue("Empresa Rascunho Ltda.");

    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await confirmacao.getByRole("button", { name: "Descartar" }).click();
    await expect(dialogo).toBeHidden();
    await page.getByTestId("cadastrar-empresa").click();
    await expect(dialogo.getByLabel(/Razão social/)).toHaveValue("");
  });

  test("cartões do resumo abrem a aba com o filtro do indicador", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    await page.getByRole("button", { name: /Horizonte Engenharia/ }).first().click();
    const dialogo = page.getByTestId("dialogo-detalhes-empresa");
    await dialogo.getByRole("button", { name: /^Alocados: \d+/ }).click();
    await expect(dialogo.getByRole("tab", { name: /Equipamentos/ })).toHaveAttribute("data-state", "active");
    await expect(dialogo.getByLabel("Situação", { exact: true })).toHaveText("Alocado");
    await expect(dialogo.getByText(/de 5 equipamentos/)).toBeVisible();

    await dialogo.getByRole("tab", { name: /Resumo/ }).click();
    // Outros testes podem cadastrar pessoas na Horizonte: o número vem do próprio cartão.
    const ativos = dialogo.getByRole("button", { name: /^Ativos: \d+/ });
    const qtd = (await ativos.getAttribute("aria-label"))!.match(/^Ativos: (\d+)/)![1];
    await ativos.click();
    await expect(dialogo.getByRole("tab", { name: /Colaboradores/ })).toHaveAttribute("data-state", "active");
    await expect(dialogo.getByLabel("Situação", { exact: true })).toHaveText("Ativo");
    await expect(dialogo.getByText(new RegExp(`^${qtd} colaborador(es)?`))).toBeVisible();

    // Página completa: os cartões são links com o filtro na URL.
    await page.goto("/ti/cadastros/empresas/a1f0c7e2-0000-4000-8000-000000000001");
    await page.getByRole("link", { name: /^Disponíveis: \d+/ }).click();
    await expect(page).toHaveURL(/tab=equipamentos&situacao=DISPONIVEL/);
    await expect(page.getByLabel("Situação", { exact: true })).toHaveText("Disponível");
  });

  test("seleções personalizadas dentro do diálogo: mouse, teclado e busca", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    await page.getByRole("button", { name: /Horizonte Engenharia/ }).first().click();
    const dialogo = page.getByTestId("dialogo-detalhes-empresa");
    await dialogo.getByRole("tab", { name: /Equipamentos/ }).click();

    // Select simples: abre acima do diálogo, sem corte, e navega por teclado.
    const situacao = dialogo.getByLabel("Situação", { exact: true });
    await situacao.focus();
    await page.keyboard.press("Enter");
    const lista = page.getByRole("listbox");
    await expect(lista).toBeVisible();
    await expect(lista).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("option", { name: "Todas as situações" })).toHaveAttribute("data-state", "checked");
    await expect(page.getByRole("option", { name: "Todas as situações" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "Disponível" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(lista).toBeHidden();
    await expect(situacao).toHaveText("Disponível");
    await expect(situacao).toBeFocused();

    // Esc fecha só o menu, não o diálogo.
    await situacao.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(dialogo).toBeVisible();

    // Combobox com busca interna (categorias).
    await dialogo.getByLabel("Categoria", { exact: true }).click();
    await page.getByRole("combobox", { name: "Pesquisar opções" }).fill("cel");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(dialogo.getByLabel("Categoria", { exact: true })).toHaveText("Celular");
    await expect(dialogo.getByText(/de 5 equipamentos/)).toBeVisible();
  });
});

test.describe("Central da empresa: acesso direto sem permissão", () => {
  test.use({ storageState: estado("colaboradora") });

  test("colaborador comum não abre a página completa nem os registros da empresa", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas/a1f0c7e2-0000-4000-8000-000000000001?tab=colaboradores");
    await expect(page).toHaveURL(/\/portal$/);
  });
});

test.describe("Empresas (Estagiário TI)", () => {
  test.use({ storageState: estado("estagiario") });

  test("sem concessão, vê a lista mas não cadastra nem edita", async ({ page }) => {
    await page.goto("/ti/cadastros/empresas");
    await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
    await expect(page.getByTestId("cadastrar-empresa")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
  });
});

test.describe("Sair da conta (último: encerra a sessão salva)", () => {
  test.use({ storageState: estado("colaboradora") });

  test("pede confirmação; cancelar mantém a sessão; confirmar encerra", async ({ page }) => {
    await page.goto("/portal");
    await page.getByTestId("menu-usuario").click();
    await page.getByTestId("sair").click();
    const dialogo = page.getByTestId("dialogo-sair");
    await expect(dialogo.getByRole("heading", { name: "Sair da conta?" })).toBeVisible();
    await expect(dialogo.getByText("Tem certeza de que deseja encerrar sua sessão?")).toBeVisible();

    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByTestId("menu-usuario")).toBeFocused();
    await page.reload();
    await expect(page).toHaveURL(/\/portal$/);

    await page.getByTestId("menu-usuario").click();
    await page.getByTestId("sair").click();
    await page.getByTestId("confirmar-sair").click();
    await expect(page).toHaveURL(/\/entrar\?motivo=encerrada/);
    await expect(page.getByText("Você saiu do portal com segurança.")).toBeVisible();
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/entrar/);
  });
});
