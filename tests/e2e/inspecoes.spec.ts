import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Inspeções técnicas: checklist configurável, cadastro com inspeção de entrada e entrega com verificação. */

async function escolher(page: Page, escopo: Locator, rotulo: RegExp, opcao: string | RegExp) {
  await escopo.getByLabel(rotulo).click();
  await page.getByRole("option", { name: opcao, exact: typeof opcao === "string" }).first().click();
}

/** Marca "Conforme" em todas as perguntas do checklist (clique explícito em cada uma). */
async function responderConforme(checklist: Locator) {
  const opcoes = checklist.locator("label").filter({ hasText: /^Conforme$/ });
  const total = await opcoes.count();
  for (let i = 0; i < total; i++) await opcoes.nth(i).click();
  return total;
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

let monitor = "";

test.describe("Inspeções técnicas (Supervisor TI)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: estado("supervisor") });

  test("checklist da categoria: orientação no ícone, nova pergunta, nova versão, ordem e inativação", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario/catalogos?aba=checklists");
    const painel = page.getByTestId("catalogo-checklists");
    const tela = "Tela sem pixels mortos, manchas, linhas ou falhas de brilho";
    await expect(painel.getByText(tela).filter({ visible: true })).toBeVisible();

    // Dica curta ao passar o mouse; instruções completas no clique; Esc fecha.
    const info = painel.getByRole("button", { name: `Como verificar: ${tela}` });
    // O hover só conta depois da hidratação: repete o movimento até a dica aparecer.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await info.hover();
      await expect(page.getByRole("tooltip")).toContainText("Exiba em tela cheia", { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await info.click();
    const orientacao = page.getByTestId("orientacao-pergunta");
    for (const trecho of ["Como testar", "Resultado esperado", "Sinais de problema", "Item bloqueante"]) await expect(orientacao).toContainText(trecho);
    await expect(orientacao).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(orientacao).toBeHidden();

    await escolher(page, painel, /^Categoria do equipamento/, /^Hub/);
    await page.getByTestId("cadastrar-catalogo").click();
    const d = page.getByTestId("dialogo-pergunta-inspecao");
    await d.getByRole("button", { name: "Cadastrar pergunta" }).click();
    await expect(d.getByText("Informe a pergunta.")).toBeVisible();
    await d.getByLabel(/^Grupo/).fill("Funcionamento");
    await d.getByLabel(/^Pergunta \*/).fill("Indicador de energia acende");
    await d.getByLabel(/^Como testar/).fill("Conecte o hub ao computador e observe o LED de energia.");
    await d.getByLabel(/^Resultado esperado/).fill("O LED acende e fica estável.");
    await d.getByLabel(/^Sinais de não conformidade/).fill("LED apagado ou piscando sem parar.");
    await d.getByRole("button", { name: "Cadastrar pergunta" }).click();
    await expect(page.getByText("Pergunta cadastrada.")).toBeVisible();
    await expect(painel.getByText("Indicador de energia acende").filter({ visible: true })).toBeVisible();

    // Mudar o conteúdo cria a próxima versão.
    await painel.getByRole("button", { name: "Editar Indicador de energia acende" }).click();
    await d.getByLabel(/^Pergunta \*/).fill("LED de energia acende ao conectar");
    await d.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText(/versão 2 vale para as próximas inspeções/)).toBeVisible();
    const linha = painel.getByRole("row").filter({ hasText: "LED de energia acende ao conectar" });
    await expect(linha).toContainText("v2");
    await expect(linha).toContainText("7");
    await linha.getByRole("button", { name: "Subir LED de energia acende ao conectar" }).click();
    await expect(linha.getByRole("cell").first()).toContainText("6");
    await linha.getByRole("button", { name: "Inativar LED de energia acende ao conectar" }).click();
    await expect(linha).toContainText("Inativo");
  });

  test("cadastro: condição de entrada e inspeção na revisão, sem resposta presumida", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario");
    await page.getByTestId("cadastrar-equipamento").click();
    const d = page.getByTestId("dialogo-equipamento");
    await escolher(page, d, /^Categoria/, /^Monitor/);
    await d.getByLabel(/^Patrimônio/).fill("VLR-E2EINSP1");
    await escolher(page, d, /^Empresa proprietária/, "Atalaia Serviços Administrativos Ltda.");
    await escolher(page, d, /^Marca/, "LG");
    await escolher(page, d, /^Modelo/, /^24MP400/);
    await d.getByRole("button", { name: "Revisar" }).click();
    await expect(d.getByText("Informe se o equipamento entra novo ou usado.")).toBeVisible();
    await d.getByTestId("condicao-entrada").getByRole("radio", { name: "Novo" }).click();
    await d.getByRole("button", { name: "Revisar" }).click();

    const inspecao = d.getByTestId("inspecao-entrada");
    const checklist = inspecao.getByTestId("checklist-inspecao");
    await expect(checklist).toBeVisible();
    await d.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(checklist.getByText("Responda este item.").first()).toBeVisible();

    // A orientação abre por cima do diálogo, sem cortes, e não mexe na resposta.
    const primeira = checklist.getByRole("button", { name: /^Como verificar:/ }).first();
    await primeira.click();
    await expect(page.getByTestId("orientacao-pergunta")).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(d).toBeVisible();

    expect(await responderConforme(checklist)).toBeGreaterThan(3);
    const carcaca = checklist.locator("[data-pergunta]").filter({ hasText: "Moldura, traseira e base sem trincas" });
    await carcaca.locator("label").filter({ hasText: /^Não conforme$/ }).click();
    await d.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(carcaca.getByText("Descreva o problema encontrado.")).toBeVisible();
    await carcaca.getByLabel(/^Justificativa/).fill("Risco leve na moldura");
    await expect(inspecao.getByText("Apto com ressalvas")).toBeVisible();
    await d.getByRole("button", { name: "Confirmar cadastro" }).click();
    const aviso = page.getByText(/^MNT\d{3} cadastrado/);
    await expect(aviso).toBeVisible();
    monitor = (await aviso.textContent())!.match(/MNT\d{3}/)![0];
    await page.getByRole("button", { name: "Abrir ficha" }).click();

    await expect(page.getByRole("heading", { level: 1, name: monitor })).toBeVisible();
    const inspecoes = page.getByTestId("inspecoes-ficha");
    await expect(inspecoes).toContainText("Entrada");
    await expect(inspecoes).toContainText("Apto com ressalvas");
    await inspecoes.getByRole("button", { name: /^Ver respostas da inspeção INS-/ }).click();
    await expect(page.getByTestId("dialogo-detalhes-inspecao")).toContainText("Risco leve na moldura");
  });

  test("entrega: confirma a última inspeção ou faz uma nova; a condição fica registrada na alocação", async ({ page }) => {
    test.setTimeout(150_000);
    expect(monitor).not.toBe("");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/alocacoes");
    await page.getByRole("button", { name: "Nova alocação" }).click();
    const n = page.getByTestId("dialogo-nova-alocacao");
    await escolher(page, n, /^Colaborador/, /^Ricardo Moura/);
    const busca = n.getByPlaceholder(/^Pesquisar por nome/);
    for (const item of [monitor, "VLR-004651"]) {
      await busca.fill(item);
      await page.getByRole("option", { name: new RegExp(item) }).first().click();
    }
    await n.getByRole("button", { name: "Revisar" }).click();

    const verificacao = n.getByTestId("verificacao-condicoes");
    const doMonitor = verificacao.getByTestId("cartao-condicao").filter({ hasText: monitor });
    const legado = verificacao.getByTestId("cartao-condicao").filter({ hasText: "VLR-004651" });
    await expect(doMonitor).toContainText(/Última inspeção INS-/);
    await expect(legado).toContainText("Sem inspeção registrada");
    await n.getByTestId("confirmar-alocacao").click();
    await expect(n.getByText("Confirme a condição de cada equipamento antes da entrega.")).toBeVisible();

    await doMonitor.getByText("Sim, continuam iguais").click();
    await legado.getByRole("button", { name: "Fazer inspeção" }).click();
    const nova = page.getByTestId("dialogo-checklist");
    await responderConforme(nova.getByTestId("checklist-inspecao"));
    await nova.getByRole("button", { name: "Usar esta inspeção" }).click();
    await expect(nova).toBeHidden();
    await expect(legado).toContainText("Nova inspeção preenchida");

    await n.getByTestId("confirmar-alocacao").click();
    const sucesso = page.getByText(/^Entrega AL\d{4} registrada\.$/);
    await expect(sucesso).toBeVisible();
    const numero = (await sucesso.textContent())!.match(/AL\d{4}/)![0];

    await page.goto(`/ti/alocacoes?busca=${numero}`);
    await page.getByRole("button", { name: `Ver detalhes de ${numero}` }).click();
    const detalhe = page.getByTestId("dialogo-alocacao");
    await detalhe.getByRole("tab", { name: /^Equipamentos/ }).click();
    await expect(detalhe.getByTestId("condicao-entrega")).toHaveCount(2);
    await detalhe.getByTestId("condicao-entrega").filter({ hasText: "última inspeção confirmada" }).getByRole("button", { name: "Ver checklist" }).click();
    const instantaneo = page.getByTestId("dialogo-detalhes-inspecao");
    await expect(instantaneo).toContainText("Confirmou a última inspeção");
    await expect(instantaneo).toContainText("Risco leve na moldura");
  });

  for (const [largura, altura] of [
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`checklists e diálogo da pergunta sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/ti/inventario/catalogos?aba=checklists");
      const painel = page.getByTestId("catalogo-checklists");
      await expect(painel.getByText("Tela sem pixels mortos, manchas, linhas ou falhas de brilho").filter({ visible: true })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      await painel.getByRole("button", { name: /^Como verificar:/ }).first().click();
      await expect(page.getByTestId("orientacao-pergunta")).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Escape");
      await page.getByTestId("cadastrar-catalogo").click();
      const d = page.getByTestId("dialogo-pergunta-inspecao");
      await expect(d).toBeVisible();
      const caixa = (await d.boundingBox())!;
      expect(caixa.width).toBeLessThanOrEqual(largura);
      expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(d.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: `test-results/checklists-${largura}.png` });
    });
  }
});
