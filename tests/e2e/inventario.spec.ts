import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Equipamentos da carga fictícia (mesmos ids do seed). */
const ativo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");

/** Seleção personalizada (Radix/cmdk): abre pelo rótulo e escolhe a opção no menu flutuante. */
async function escolher(page: Page, escopo: Locator, rotulo: string | RegExp, opcao: string | RegExp) {
  await escopo.getByLabel(rotulo, typeof rotulo === "string" ? { exact: true } : undefined).click();
  await page.getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const tabela = (page: Page) => page.getByRole("table", { name: "Equipamentos do inventário" });

test.describe("Inventário (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("lista: colunas pelo conteúdo, sem TER nem responsável; quatro indicadores do banco que filtram; paginação", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario");
    await expect(page.getByRole("heading", { level: 1, name: "Inventário" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver equipamentos em manutenção" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver visão geral" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("cadastrar-equipamento")).toBeVisible();
    const cabecalhos = tabela(page).getByRole("columnheader");
    await expect(cabecalhos).toHaveText([/Equipamento/, /Tipo/, /Marca \/ modelo/, /^Empresa/, /Situação/, "Ações"]);
    // Larguras pelo conteúdo: Tipo logo depois do equipamento; o espaço sobra para modelo e empresa.
    const largura = async (n: number) => (await cabecalhos.nth(n).boundingBox())!.width;
    expect(await largura(0)).toBeLessThanOrEqual(180);
    expect(await largura(1)).toBeLessThanOrEqual(160);
    expect(await largura(3)).toBeGreaterThan(await largura(1));
    expect(await largura(5)).toBeLessThanOrEqual(110);
    // Cabeçalho alinhado com o conteúdo da coluna.
    const tipoCabecalho = (await cabecalhos.nth(1).getByRole("link").boundingBox())!;
    const tipoCelula = (await tabela(page).getByRole("row").nth(1).getByRole("cell").nth(1).boundingBox())!;
    expect(Math.abs(tipoCabecalho.x - (tipoCelula.x + 12))).toBeLessThanOrEqual(1);
    await expect(page.getByText("Página 1 de 2 · 18 registros")).toBeVisible();
    // O inventário não gerencia TER nem custódia.
    await expect(page.getByLabel("TER", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("main").getByText(/TER (emitido|assinado|aguardando)/)).toHaveCount(0);
    await expect(tabela(page)).not.toContainText("Ana Beatriz Souza");
    await expect(tabela(page)).not.toContainText("VLR-004512"); // patrimônio não é coluna (nem título de quem tem nome)

    const indicadores = page.getByTestId("indicadores-inventario");
    await expect(indicadores.getByRole("link")).toHaveCount(4);
    for (const [rotulo, valor] of [
      ["Total de equipamentos", 18],
      ["Disponíveis", 3],
      ["Alocados", 11],
      ["Em manutenção", 1],
    ] as const) {
      await expect(indicadores.getByRole("link", { name: new RegExp(`^${rotulo}: ${valor}\\.`) })).toBeVisible();
    }
    await indicadores.getByRole("link", { name: /^Disponíveis: 3\./ }).click();
    await expect(page).toHaveURL(/situacao=DISPONIVEL/);
    await expect(tabela(page).getByRole("row")).toHaveCount(4);
    await expect(indicadores.getByRole("link", { name: /^Disponíveis: 3\. Remover filtro/ })).toHaveAttribute("aria-current", "true");
    // O filtro de situação não zera os outros indicadores; o total o remove.
    await expect(indicadores.getByRole("link", { name: /^Alocados: 11\./ })).toBeVisible();
    await indicadores.getByRole("link", { name: /^Total de equipamentos: 18\./ }).click();
    await expect(page).not.toHaveURL(/situacao=/);
    await expect(page.getByText("Página 1 de 2 · 18 registros")).toBeVisible();

    // Pesquisa: patrimônio (oculto na tabela), série e modelo.
    const pesquisa = page.getByLabel("Pesquisar equipamentos");
    await pesquisa.fill("VLR-004513");
    await expect(tabela(page).getByRole("row")).toHaveCount(2);
    await pesquisa.fill("SIM-9H1LN33");
    await expect(tabela(page).getByRole("row").nth(1)).toContainText("NBI4590");
    await pesquisa.fill("Latitude 5440");
    await expect(tabela(page).getByRole("row")).toHaveCount(4);
  });

  test("visão geral: recolhida por padrão; rankings com quantidade e percentual que filtram e seguem os filtros", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/inventario");
    const visao = page.getByTestId("visao-geral-inventario");
    await expect(visao).toBeHidden();
    await page.getByRole("button", { name: "Ver visão geral" }).click();
    await expect(page.getByRole("button", { name: "Ocultar visão geral" })).toHaveAttribute("aria-expanded", "true");
    await expect(page).toHaveURL(/visao=geral/);
    await expect(visao).toBeVisible();

    // Situação: os seis estados, com o mesmo escopo dos cartões.
    const situacao = visao.getByRole("region", { name: "Por situação" });
    for (const nome of [
      "Disponível: 3 (17%). Filtrar",
      "Reservado: 2 (11%). Filtrar",
      "Alocado: 11 (61%). Filtrar",
      "Em manutenção: 1 (6%). Filtrar",
      "Devolvido em avaliação: 0 (0%). Filtrar",
      "Baixado: 1 (6%). Filtrar",
    ]) {
      await expect(situacao.getByRole("link", { name: nome })).toBeVisible();
    }
    await expect(visao.getByRole("region", { name: "Por tipo" }).getByRole("link", { name: "Notebook: 9 (50%). Filtrar" })).toBeVisible();
    const porEmpresa = visao.getByRole("region", { name: "Por empresa" });
    await expect(porEmpresa.getByRole("link")).toHaveCount(4);
    await expect(porEmpresa.getByRole("link").first()).toHaveAccessibleName(/^Atalaia Serviços Administrativos Ltda\.: 5 \(28%\)/); // empate com a HZE: ordem alfabética
    // Mais marcas do que as exibidas: o restante aparece somado, sem filtrar.
    const porMarca = visao.getByRole("region", { name: "Por marca" });
    await expect(porMarca.getByRole("link", { name: "Dell: 8 (44%). Filtrar" })).toBeVisible();
    await expect(porMarca.getByRole("listitem").last()).toHaveText(/Outras marcas\s*1\s*6%/);

    // Filtrar pela empresa: a visão geral continua aberta e os números seguem o filtro.
    await porEmpresa.getByRole("link", { name: /^Rio Claro Infraestrutura Ltda\.: 4/ }).click();
    await expect(page).toHaveURL(/empresa=.*visao=geral|visao=geral.*empresa=/);
    await expect(visao).toBeVisible();
    await expect(page.getByTestId("indicadores-inventario").getByRole("link", { name: /^Total de equipamentos: 4\./ })).toBeVisible();
    await expect(porEmpresa.getByRole("link", { name: "Rio Claro Infraestrutura Ltda.: 4 (100%). Remover filtro" })).toHaveAttribute("aria-current", "true");
    await escolher(page, page.getByRole("search", { name: "Pesquisa e filtros" }), "Tipo", "Celular");
    await expect(tabela(page).getByRole("row")).toHaveCount(2);
    await expect(tabela(page)).toContainText("VLR-004645");
    await expect(page).toHaveURL(/visao=geral/);

    // Voltar da ficha mantém a visão geral aberta.
    await tabela(page).getByRole("row").nth(1).getByRole("cell").first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(visao).toBeVisible();

    await page.getByRole("button", { name: "Ocultar visão geral" }).click();
    await expect(visao).toBeHidden();
    await expect(page).not.toHaveURL(/visao=/);
  });

  test("cadastro de notebook com foto cria o carregador C1; ficha com galeria; carregadores C2 e defeito", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/ti/inventario");
    await page.getByTestId("cadastrar-equipamento").click();
    const d = page.getByTestId("dialogo-equipamento");
    await escolher(page, d, /^Categoria/, "Notebook");
    await d.getByLabel(/^Nome do dispositivo/).fill("nbi5001");
    await expect(d.getByText("Carregador principal: NBI5001C1")).toBeVisible();
    await d.getByLabel(/^Patrimônio/).fill("VLR-905001");
    await escolher(page, d, /^Empresa proprietária/, "Atalaia Serviços Administrativos Ltda.");
    await d.getByLabel(/^Marca/).fill("Dell");
    await d.getByLabel(/^Modelo/).fill("Latitude 5450");
    await d.getByLabel("Número de série").fill("SIM-E2E5001");
    await d.getByLabel("Processador").fill("Intel Core i7");
    await d.getByLabel("Adicionar foto: Visão frontal").setInputFiles({ name: "frontal.png", mimeType: "image/png", buffer: PNG });
    await expect(d.getByRole("img", { name: "Visão frontal, foto 1" })).toBeVisible();
    await d.getByRole("button", { name: "Cadastrar equipamento" }).click();
    await expect(d).toBeHidden();
    await page.getByRole("button", { name: "Abrir ficha" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "NBI5001" })).toBeVisible();
    const carregadores = page.getByTestId("carregadores");
    await expect(carregadores).toContainText("NBI5001C1");
    await expect(carregadores).toContainText("Principal");
    await page.getByRole("button", { name: "Ampliar foto: Visão frontal" }).click();
    await expect(page.getByTestId("foto-ampliada")).toBeVisible();
    await page.keyboard.press("Escape");

    await carregadores.getByRole("button", { name: "Adicionar carregador (NBI5001C2)" }).click();
    await expect(carregadores).toContainText("NBI5001C2");
    await carregadores.getByRole("button", { name: "Registrar troca, perda ou defeito de NBI5001C2" }).click();
    const dc = page.getByTestId("dialogo-carregador");
    await escolher(page, dc, /^Motivo/, "Defeito");
    await expect(dc.getByText(/fica "devolvido em avaliação"/)).toBeVisible();
    await dc.getByLabel(/^O que aconteceu/).fill("Não carrega");
    await dc.getByRole("checkbox").uncheck();
    await dc.getByRole("button", { name: "Registrar" }).click();
    await expect(dc).toBeHidden();
    await carregadores.getByText("Carregadores anteriores (1)").click();
    await expect(carregadores).toContainText("Defeito em");
    await expect(page.getByTestId("historico-movimentacoes")).toContainText("Carregador desvinculado");

    // Patrimônio repetido: erro no campo, dados preservados.
    await page.goto("/ti/inventario");
    await page.getByTestId("cadastrar-equipamento").click();
    await escolher(page, d, /^Categoria/, "Monitor");
    await d.getByLabel(/^Patrimônio/).fill("vlr-905001");
    await escolher(page, d, /^Empresa proprietária/, "Atalaia Serviços Administrativos Ltda.");
    await d.getByLabel(/^Marca/).fill("Dell");
    await d.getByLabel(/^Modelo/).fill("P2422H");
    await d.getByRole("button", { name: "Cadastrar equipamento" }).click();
    await expect(d.getByText("Este patrimônio já está cadastrado.")).toBeVisible();
    await expect(d.getByLabel(/^Patrimônio/)).toHaveAttribute("aria-invalid", "true");
    await expect(d.getByLabel(/^Modelo/)).toHaveValue("P2422H");
  });

  test("manutenção com alocação ativa exige o recolhimento físico; a conclusão devolve ao estoque", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/ti/inventario/${ativo(18)}`);
    await page.getByTestId("enviar-manutencao").click();
    const m = page.getByTestId("dialogo-enviar-manutencao");
    await expect(m.getByTestId("aviso-alocacao-ativa")).toContainText("Patrícia Gomes");
    await expect(m.getByTestId("aviso-alocacao-ativa")).toContainText("ALO-2026-0006");
    // Abrir o formulário não muda nada.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Alocação" })).toContainText("ALO-2026-0006");

    await page.getByTestId("enviar-manutencao").click();
    await m.getByLabel(/^Motivo da manutenção/).fill("Teclado falhando");
    await m.getByLabel(/^Observações/).fill("Teclas sem resposta");
    await m.getByRole("button", { name: "Registrar manutenção" }).click();
    await expect(m.getByText("Confirme o recolhimento físico com Patrícia Gomes.")).toBeVisible();
    await m.getByRole("checkbox").check();
    await m.getByRole("button", { name: "Registrar manutenção" }).click();
    await expect(page.getByText(/alocação ALO-2026-0006 encerrada para este equipamento/)).toBeVisible();
    await expect(m).toBeHidden();
    await expect(page.getByRole("region", { name: "Alocação" })).toContainText("Sem alocação vigente.");
    await expect(page.getByTestId("manutencoes-equipamento")).toContainText("Em andamento");

    await page.goto("/ti/inventario/manutencoes");
    await expect(page.getByRole("heading", { level: 1, name: "Equipamentos em manutenção" })).toBeVisible();
    await page.getByRole("button", { name: "Concluir manutenção de NBI4590" }).click();
    const c = page.getByTestId("dialogo-concluir-manutencao");
    await c.getByRole("radio", { name: /Reparado/ }).click();
    await c.getByLabel(/^Serviço realizado/).fill("Teclado substituído");
    await c.getByRole("button", { name: "Concluir manutenção" }).click();
    await expect(page.getByText("Manutenção concluída: equipamento disponível.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Concluir manutenção de NBI4590" })).toHaveCount(0);
    await page.goto(`/ti/inventario/${ativo(18)}`);
    await expect(page.locator("header").getByText("Disponível")).toBeVisible();
  });
});

test.describe("Alocações (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("entrega de vários equipamentos (carregador junto), devolução parcial e TER assinado em PDF", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/ti/alocacoes");
    await expect(page.getByRole("heading", { level: 1, name: "Alocações" })).toBeVisible();
    await page.getByTestId("nova-alocacao").click();
    const n = page.getByTestId("dialogo-nova-alocacao");
    await escolher(page, n, /^Colaborador/, /^Lucas Andrade/);
    const pesquisa = n.getByPlaceholder(/Pesquisar por nome, patrimônio/);
    await pesquisa.fill("NBI4650");
    await n.getByRole("option", { name: /^NBI4650 · VLR-004650/ }).click();
    await expect(n.getByRole("list", { name: "Equipamentos selecionados" })).toContainText("NBI4650C1"); // carregador junto
    await pesquisa.fill("VLR-004651");
    await n.getByRole("option", { name: /VLR-004651/ }).click();
    await expect(n.getByText("3 selecionados")).toBeVisible();
    await n.getByRole("button", { name: "Revisar" }).click();
    await expect(n.getByRole("region", { name: "Revisão da alocação" })).toContainText("Entrega física agora");
    await n.getByTestId("confirmar-alocacao").click();
    await expect(page.getByText(/Entrega ALO-\d{4}-\d{4} registrada\./)).toBeVisible();

    const detalhe = page.getByTestId("dialogo-alocacao");
    await expect(detalhe.getByRole("heading", { name: /^ALO-\d{4}-\d{4}$/ })).toBeVisible();
    await expect(detalhe).toContainText("Entregue");
    await detalhe.getByRole("button", { name: "Registrar devolução" }).click();
    const dv = page.getByTestId("dialogo-devolucao");
    await dv.getByRole("checkbox", { name: "Devolvido: VLR-004651" }).check();
    await expect(dv).toContainText("devolução parcial (1 de 3)");
    await dv.getByRole("button", { name: "Registrar devolução" }).click();
    await expect(page.getByText(/Devolução DEV-\d{4}-\d{4} registrada\./)).toBeVisible();
    await detalhe.getByRole("tab", { name: /Equipamentos/ }).click();
    await expect(detalhe.getByTestId("itens-alocacao")).toContainText("Devolvido");
    await expect(detalhe.getByTestId("itens-alocacao").getByText("Com o colaborador")).toHaveCount(2);

    await detalhe.getByRole("tab", { name: "Documentos" }).click();
    await expect(detalhe.getByText("Nenhum TER registrado para esta alocação.")).toBeVisible();
    await detalhe.getByLabel("PDF do termo assinado").setInputFiles({ name: "ter.pdf", mimeType: "application/pdf", buffer: PDF });
    await detalhe.getByRole("button", { name: "Registrar PDF" }).click();
    await expect(page.getByText(/TER-\d{4}-\d{4}: PDF assinado registrado\./)).toBeVisible();
    await expect(detalhe.getByRole("link", { name: "Abrir PDF" })).toBeVisible();
    await expect(detalhe).toContainText("TER assinado");
  });

  test("reserva não muda a custódia até a confirmação da entrega física", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/ti/alocacoes");
    await page.getByTestId("nova-alocacao").click();
    const n = page.getByTestId("dialogo-nova-alocacao");
    await escolher(page, n, /^Colaborador/, /^Fernanda Rocha/);
    await n.getByPlaceholder(/Pesquisar por nome, patrimônio/).fill("VLR-004652");
    await n.getByRole("option", { name: /VLR-004652/ }).click();
    await n.getByRole("radio", { name: /Reservar/ }).click();
    await n.getByRole("button", { name: "Revisar" }).click();
    await n.getByTestId("confirmar-alocacao").click();
    await expect(page.getByText(/Reserva ALO-\d{4}-\d{4} registrada\./)).toBeVisible();
    const detalhe = page.getByTestId("dialogo-alocacao");
    await expect(detalhe.getByText("Reserva: ninguém fica responsável")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/ti/inventario?busca=VLR-004652");
    await expect(tabela(page).getByRole("row").nth(1)).toContainText("Reservado");

    await page.goto("/ti/alocacoes?situacao=RESERVADA&busca=VLR-004652");
    await page.getByRole("button", { name: /^Ver detalhes de ALO-/ }).first().click();
    await detalhe.getByRole("button", { name: "Confirmar entrega" }).click();
    await page.getByTestId("dialogo-confirmar-entrega").getByRole("button", { name: "Confirmar entrega" }).click();
    await expect(page.getByText(/Entrega ALO-\d{4}-\d{4} confirmada\./)).toBeVisible();
    await page.goto("/ti/inventario?busca=VLR-004652");
    await expect(tabela(page).getByRole("row").nth(1)).toContainText("Alocado");
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`telas e modais sem cortes em ${largura}px`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: largura, height: altura });
      for (const rota of ["/ti/inventario", "/ti/inventario?visao=geral", "/ti/inventario/manutencoes", "/ti/alocacoes", `/ti/inventario/${ativo(1)}`]) {
        await page.goto(rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await semRolagemHorizontal(page), rota).toBe(true);
      }
      const modais: [string, () => Promise<unknown>, string][] = [
        ["/ti/inventario", () => page.getByTestId("cadastrar-equipamento").click(), "dialogo-equipamento"],
        ["/ti/alocacoes", () => page.getByTestId("nova-alocacao").click(), "dialogo-nova-alocacao"],
        [`/ti/inventario/${ativo(1)}`, () => page.getByTestId("enviar-manutencao").click(), "dialogo-enviar-manutencao"],
      ];
      for (const [rota, abrir, id] of modais) {
        await page.goto(rota);
        await abrir();
        const modal = page.getByTestId(id);
        await expect(modal).toBeVisible();
        await page.waitForTimeout(300);
        const caixa = (await modal.boundingBox())!;
        expect(caixa.width, id).toBeLessThanOrEqual(largura);
        expect(caixa.height, id).toBeLessThanOrEqual(altura);
        expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), id).toBe(true);
        await expect(modal.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Escape");
      }
    });
  }
});

test.describe("Inventário: permissões", () => {
  test.describe("Estagiário TI", () => {
    test.use({ storageState: estado("estagiario") });

    test("opera o inventário e as alocações no dia a dia", async ({ page }) => {
      await page.goto("/ti/inventario");
      await expect(page.getByTestId("cadastrar-equipamento")).toBeVisible();
      await page.goto("/ti/alocacoes");
      await expect(page.getByTestId("nova-alocacao")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Navegação da área de TI" }).getByRole("link", { name: "Alocações" })).toBeVisible();
    });
  });
});
