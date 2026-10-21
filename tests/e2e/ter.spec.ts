import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/**
 * TER de ponta a ponta: a entrega física gera o TER; sem CPF fica pendente e é emitido quando o
 * cadastro é completado; a TI registra o envio; a colaboradora baixa e anexa o PDF assinado no
 * Portal do Colaborador; a TI recusa, ela reenvia, a TI confere; tudo fica no histórico.
 */

test.describe.configure({ mode: "serial" });

/** A colaboradora do cenário (sem perfil de TI), que também entra no portal. */
const PESSOA = "Ana Beatriz Souza";
/** CPF fictício de exemplo (dígitos verificadores válidos), usado só no banco de teste. */
const CPF = "529.982.247-25";
const MOTIVO_RECUSA = "O PDF enviado não contém a assinatura eletrônica do documento completo.";

async function escolher(page: Page, escopo: Locator, rotulo: RegExp, opcao: string | RegExp) {
  await escopo.getByLabel(rotulo).click();
  await page.getByRole("option", { name: opcao, exact: typeof opcao === "string" }).first().click();
}

async function responderConforme(checklist: Locator) {
  const opcoes = checklist.locator("label").filter({ hasText: /^Conforme$/ });
  const total = await opcoes.count();
  for (let i = 0; i < total; i++) await opcoes.nth(i).click();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const assinado = (base: Buffer, marca: string) => Buffer.concat([base, Buffer.from(`\n% ${marca}\n%%EOF\n`)]);

let numeroTer = "";
let alocacao = "";

async function abrirTerNaTi(page: Page) {
  await page.goto(`/ti/documentos/ter?busca=${numeroTer}`);
  await page.getByRole("button", { name: `Visualizar ${numeroTer}` }).click();
  return page.getByTestId("dialogo-ter");
}

/** Na aba TER, confere a assinatura do último PDF recebido. */
async function conferir(page: Page, resultado: "Conforme" | "Não conforme") {
  const ter = await abrirTerNaTi(page);
  await ter.getByTestId("acao-ter-conferir").click();
  const conf = page.getByTestId("dialogo-conferencia-ter");
  await expect(conf).toContainText("O portal não valida a assinatura automaticamente");
  await expect(conf.getByTestId("origem-arquivo-conferencia")).toContainText("Enviado pelo colaborador no Portal do Colaborador");
  await conf.locator("label").filter({ hasText: new RegExp(`^${resultado}`) }).click();
  if (resultado === "Conforme") {
    await conf.getByLabel(/^Signatário identificado/).fill(PESSOA);
    await conf.getByText(`O signatário corresponde a ${PESSOA}.`).click();
    await conf.getByText(/^O arquivo assinado é o TER/).click();
  } else {
    await conf.getByLabel(/^Motivo/).fill(MOTIVO_RECUSA);
    await conf.getByLabel(/^Observações internas/).fill("Nota interna: conferido no VALIDAR sem assinatura.");
  }
  await conf.getByRole("button", { name: "Registrar conferência" }).click();
  return ter;
}

/** No portal, anexa o PDF assinado (o emitido com uma marca, como faria o assinador). */
async function enviarPeloPortal(page: Page, marca: string) {
  await page.goto("/portal/termos");
  await page.getByRole("button", { name: `Anexar o ${numeroTer} assinado` }).click();
  const envio = page.getByTestId("dialogo-enviar-assinado");
  await expect(envio).toContainText("Baixe o TER, assine o documento completo pelo GOV.BR e anexe aqui o PDF assinado, sem alterar seu conteúdo.");
  await expect(envio.getByRole("link", { name: "Assinar pelo GOV.BR" })).toHaveAttribute("href", /^https:\/\//);
  const href = await envio.getByRole("link", { name: "Baixar o TER" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  // Arquivo que não é PDF: recusado antes de sair do navegador.
  await envio.getByTestId("arquivo-ter-assinado").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await envio.getByRole("button", { name: "Enviar PDF assinado" }).click();
  await expect(envio.getByText("Envie o termo assinado em PDF.")).toBeVisible();
  await envio.getByTestId("arquivo-ter-assinado").setInputFiles({ name: "TER assinado.pdf", mimeType: "application/pdf", buffer: assinado(await pdf.body(), marca) });
  await envio.getByRole("button", { name: "Enviar PDF assinado" }).click();
  await expect(page.getByText("Documento recebido. Sua assinatura será conferida pela equipe de TI.").first()).toBeVisible();
  await expect(page.getByTestId("dialogo-meu-ter").getByText("Arquivo recebido — aguardando conferência").first()).toBeVisible();
}

test.describe("TI: entrega, emissão e envio", () => {
  test.use({ storageState: estado("supervisor") });

  test("entrega física gera o TER; sem CPF fica pendente e o cadastro completo o emite", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/alocacoes");
    await page.getByRole("button", { name: "Nova alocação" }).click();
    const n = page.getByTestId("dialogo-nova-alocacao");
    await escolher(page, n, /^Colaborador/, new RegExp(`^${PESSOA}`));
    // Um equipamento disponível para a empresa da pessoa (o primeiro da lista).
    const opcao = n.getByRole("option").first();
    await expect(opcao).toBeVisible();
    await opcao.click();
    await n.getByRole("button", { name: "Revisar" }).click();
    const cartoes = n.getByTestId("verificacao-condicoes").getByTestId("cartao-condicao");
    await expect(cartoes.first()).toBeVisible(); // as condições são lidas ao revisar
    const total = await cartoes.count();
    for (let i = 0; i < total; i++) {
      const cartao = cartoes.nth(i);
      if (await cartao.getByText("Sim, continuam iguais").count()) {
        await cartao.getByText("Sim, continuam iguais").click();
      } else {
        await cartao.getByRole("button", { name: "Fazer inspeção" }).click();
        const d = page.getByTestId("dialogo-checklist");
        await expect(d.getByTestId("checklist-inspecao")).toBeVisible(); // o checklist vigente é lido ao abrir
        await responderConforme(d.getByTestId("checklist-inspecao"));
        await d.getByRole("button", { name: "Usar esta inspeção" }).click();
        await expect(d).toBeHidden();
        await expect(cartao).toContainText("Nova inspeção preenchida");
      }
    }
    await n.getByTestId("confirmar-alocacao").click();
    const aviso = page.getByText(/^Entrega AL\d{4} registrada\. TER\d{4,} pendente/);
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    const texto = (await aviso.textContent())!;
    alocacao = texto.match(/AL\d{4}/)![0];
    numeroTer = texto.match(/TER\d{4,}/)![0];

    // Na aba TER: pendente de cadastro, com o caminho para corrigir na origem.
    await page.goto(`/ti/documentos/ter?busca=${numeroTer}`);
    await expect(page.getByTestId("tabela-ter").getByText("Pendente de cadastro")).toBeVisible();
    await page.getByRole("button", { name: `Visualizar ${numeroTer}` }).click();
    const ter = page.getByTestId("dialogo-ter");
    await expect(ter.getByTestId("pendencia-ter")).toContainText("CPF do colaborador");
    await ter.getByRole("link", { name: `Completar o cadastro de ${PESSOA}` }).click();

    // Edição da pessoa aberta direto: CPF informado (mascarado depois de salvo).
    const f = page.getByTestId("dialogo-pessoa");
    await expect(f).toBeVisible({ timeout: 30_000 });
    await f.getByTestId("campo-cpf").fill("529.982.247-24");
    await f.getByRole("button", { name: "Revisar alterações" }).click();
    await expect(f.getByText("CPF inválido: confira os 11 dígitos.")).toBeVisible();
    await f.getByTestId("campo-cpf").fill(CPF);
    await f.getByRole("button", { name: "Revisar alterações" }).click();
    await f.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText(`${PESSOA}: cadastro atualizado. 1 TER pendente foi processado.`)).toBeVisible({ timeout: 30_000 });

    await page.goto(`/ti/documentos/ter?busca=${numeroTer}`);
    await expect(page.getByTestId("tabela-ter").getByText("Aguardando envio")).toBeVisible();
  });

  test("detalhe, PDF emitido e envio para assinatura", async ({ page }) => {
    test.setTimeout(180_000);
    expect(numeroTer).not.toBe("");
    await page.setViewportSize({ width: 1440, height: 900 });
    const ter = await abrirTerNaTi(page);
    await expect(ter.getByText("Aguardando envio").first()).toBeVisible();
    await expect(ter).toContainText("***.***.***-25");
    await expect(ter).not.toContainText("529.982");

    await ter.getByRole("tab", { name: /^Equipamentos e inspeções/ }).click();
    await ter.getByRole("button", { name: "Ver checklist da entrega" }).first().click();
    const checklist = page.getByTestId("dialogo-detalhes-inspecao");
    await expect(checklist).toBeVisible();
    // Esc fecha só o checklist; o detalhe do TER continua aberto.
    await page.keyboard.press("Escape");
    await expect(checklist).toBeHidden();
    await expect(ter).toBeVisible();

    // Documento: o PDF emitido sai pela rota autorizada.
    await ter.getByRole("tab", { name: "Documento" }).click();
    const href = await ter.getByTestId("visualizar-pdf-ter").getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Envio (registro do encaminhamento feito fora do portal).
    await ter.getByTestId("acao-ter-enviar").click();
    const envio = page.getByTestId("dialogo-envio-ter");
    await expect(envio).toContainText("O portal não envia e-mails");
    await envio.getByRole("button", { name: "Registrar envio" }).click();
    await expect(envio.getByText("Confirme que o encaminhamento foi feito fora do portal.")).toBeVisible();
    await envio.getByText("Confirmo que o PDF emitido foi encaminhado por este canal, fora do portal.").click();
    await envio.getByRole("button", { name: "Registrar envio" }).click();
    await expect(page.getByText(`${numeroTer}: envio para assinatura registrado.`)).toBeVisible();
    await expect(ter.getByText("Aguardando assinatura").first()).toBeVisible();
  });
});

test.describe("Portal: a colaboradora anexa o PDF assinado", () => {
  test.use({ storageState: estado("colaboradora") });

  test("pendência no menu e no início; vê só o próprio TER, baixa o PDF e envia o assinado", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/portal");
    await expect(page.getByTestId("indicador-termos-pendentes").first()).toHaveText("1");
    await expect(page.getByTestId("aviso-termos-inicio")).toContainText("1 termo aguarda sua assinatura.");
    // O endereço antigo leva aos termos.
    await page.goto("/portal/documentos");
    await expect(page).toHaveURL(/\/portal\/termos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Meus Termos de Responsabilidade" })).toBeVisible();
    const tabela = page.getByTestId("tabela-meus-termos");
    await expect(tabela.locator("tbody tr")).toHaveCount(1);
    await expect(tabela).toContainText(numeroTer);
    await expect(tabela.getByText("Aguardando sua assinatura")).toBeVisible();
    await expect(page.getByTestId("aviso-termos-pendentes")).toContainText("Você tem 1 termo aguardando sua assinatura.");

    // Detalhe: o PDF original emitido, pela rota protegida.
    await page.getByRole("button", { name: `Visualizar ${numeroTer}` }).click();
    const detalhe = page.getByTestId("dialogo-meu-ter");
    await expect(detalhe.getByText("Equipamentos entregues").first()).toBeVisible();
    const href = await detalhe.getByTestId("visualizar-meu-ter").getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    // Outro TER (id inexistente para ela) não abre.
    const alheio = await page.request.get("/api/termos/00000000-0000-4000-8000-000000000000/pdf?arquivo=emitido");
    expect(alheio.status()).toBe(404);
    await page.keyboard.press("Escape");

    await enviarPeloPortal(page, "primeira assinatura");
    await page.goto("/portal/termos");
    await expect(page.getByTestId("tabela-meus-termos").getByText("Arquivo recebido — aguardando conferência")).toBeVisible();
    await expect(page.getByTestId("indicador-termos-pendentes")).toHaveCount(0);
    // Enquanto a TI não confere, não há novo envio.
    await expect(page.getByRole("button", { name: /^Anexar assinado indisponível: documento já recebido/ })).toBeVisible();
  });
});

test.describe("TI: recusa a assinatura enviada", () => {
  test.use({ storageState: estado("supervisor") });

  test("o arquivo do colaborador aparece aguardando conferência e é recusado com motivo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/documentos/ter?situacao=AGUARDANDO_CONFERENCIA");
    await expect(page.getByTestId("tabela-ter").getByText(numeroTer)).toBeVisible();
    await expect(page.getByTestId("tabela-ter").getByTestId("enviado-pelo-portal")).toBeVisible();
    await conferir(page, "Não conforme");
    await expect(page.getByText(`${numeroTer}: assinatura recusada. Reenvie o termo ao colaborador.`)).toBeVisible();
  });
});

test.describe("Portal: a colaboradora vê a recusa e reenvia", () => {
  test.use({ storageState: estado("colaboradora") });

  test("motivo da TI (sem as notas internas) e novo envio", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/termos");
    const lista = page.getByTestId("lista-meus-termos");
    await expect(lista.getByText("Assinatura recusada")).toBeVisible();
    await expect(page.getByTestId("indicador-termos-pendentes").first()).toHaveText("1");
    await lista.getByRole("button", { name: "Histórico" }).click();
    const detalhe = page.getByTestId("dialogo-meu-ter");
    await expect(detalhe.getByTestId("recusa-meu-ter")).toContainText(MOTIVO_RECUSA);
    await expect(detalhe).not.toContainText("Nota interna");
    await expect(detalhe.getByTestId("linha-tempo-meu-ter")).toContainText("Assinatura recusada");
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
    await enviarPeloPortal(page, "segunda assinatura");
  });
});

test.describe("TI: confere a assinatura", () => {
  test.use({ storageState: estado("supervisor") });

  test("conforme: assinado e conferido, com todo o processo no histórico", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ter = await conferir(page, "Conforme");
    await expect(page.getByText(`${numeroTer}: assinatura conferida. TER assinado e conferido.`)).toBeVisible();
    await expect(ter.getByText("Assinado e conferido").first()).toBeVisible();
    await ter.getByRole("tab", { name: "Documento" }).click();
    await expect(ter.getByText("enviado pelo colaborador no portal").first()).toBeVisible();
    await ter.getByRole("tab", { name: "Histórico" }).click();
    const historico = ter.getByTestId("historico-ter");
    for (const passo of [
      "Entrega física registrada",
      "TER criado",
      "Pendência de cadastro",
      "Emitido",
      "Envio para assinatura registrado",
      "PDF baixado pelo colaborador",
      "PDF assinado recebido",
      "Assinatura recusada",
      "Assinatura conferida",
    ]) {
      await expect(historico).toContainText(passo);
    }
  });

  test("alocação mostra o TER sem alterar a entrega física", async ({ page }) => {
    expect(alocacao).not.toBe("");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ti/alocacoes?busca=${alocacao}`);
    await page.getByRole("button", { name: `Ver detalhes de ${alocacao}` }).click();
    const d = page.getByTestId("dialogo-alocacao");
    await d.getByRole("tab", { name: "Documentos" }).click();
    const termos = d.getByTestId("termos-alocacao");
    await expect(termos).toContainText(numeroTer);
    await expect(termos).toContainText("Assinado e conferido");
    await expect(d.getByText("Alocada").first()).toBeVisible();
  });
});

test.describe("Portal: assinado e conferido", () => {
  test.use({ storageState: estado("colaboradora") });

  test("situação atualizada, PDF assinado conferido disponível e linha do tempo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/portal/termos");
    await expect(page.getByTestId("tabela-meus-termos").getByText("Assinado e conferido")).toBeVisible();
    await page.getByRole("button", { name: `Histórico do ${numeroTer}` }).click();
    const detalhe = page.getByTestId("dialogo-meu-ter");
    const href = await detalhe.getByTestId("baixar-meu-ter-assinado").getAttribute("href");
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-disposition"]).toMatch(/^attachment/);
    const linha = detalhe.getByTestId("linha-tempo-meu-ter");
    for (const passo of ["TER disponibilizado", "TER encaminhado para sua assinatura", "PDF baixado", "Documento assinado enviado", "Assinatura recusada", "Novo documento assinado enviado", "Assinatura conferida"]) {
      await expect(linha).toContainText(passo);
    }
    await expect(detalhe.getByTestId("anexar-meu-ter")).toHaveCount(0);
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`Meus Termos sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/portal/termos");
      await expect(page.getByTestId(largura < 1024 ? "lista-meus-termos" : "tabela-meus-termos")).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      if (process.env.CAPTURAS_TER) await page.screenshot({ path: `${process.env.CAPTURAS_TER}/portal-termos-${largura}.png`, fullPage: true });
      if (largura < 1024) await page.getByTestId("lista-meus-termos").getByRole("button", { name: "Visualizar" }).first().click();
      else await page.getByRole("button", { name: `Visualizar ${numeroTer}` }).click();
      await expect(page.getByTestId("dialogo-meu-ter").getByText("Equipamentos entregues").first()).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      if (process.env.CAPTURAS_TER) await page.screenshot({ path: `${process.env.CAPTURAS_TER}/portal-termo-detalhe-${largura}.png` });
    });
  }
});

test.describe("TI: aba TER responsiva", () => {
  test.use({ storageState: estado("supervisor") });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`aba TER e detalhe sem cortes em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/ti/documentos/ter");
      await expect(page.getByTestId("indicadores-ter")).toBeVisible();
      await expect(page.getByTestId(largura < 768 ? "lista-ter" : "tabela-ter")).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      if (largura >= 768) {
        // Situação e Ações alinhadas em todas as linhas (canceladas e registros anteriores também).
        const tabela = page.getByTestId("tabela-ter");
        const caixas = async (testId: string) => Promise.all((await tabela.getByTestId(testId).all()).map((l) => l.boundingBox()));
        const acoes = await caixas("acoes-ter");
        const situacoes = await caixas("situacao-ter");
        expect(acoes.length).toBeGreaterThan(1);
        for (const b of acoes) expect(Math.abs(b!.x - acoes[0]!.x)).toBeLessThan(1);
        const centro = (b: { x: number; width: number } | null) => b!.x + b!.width / 2;
        const colunaSituacao = await tabela.locator("th", { hasText: "Situação" }).boundingBox();
        for (const b of situacoes) expect(Math.abs(centro(b) - centro(colunaSituacao))).toBeLessThan(1.5);
        // Três posições fixas: Visualizar, Baixar (ativo ou indisponível com motivo), Mais opções.
        for (const grupo of await tabela.getByTestId("acoes-ter").all()) await expect(grupo.getByRole("button").or(grupo.getByRole("link"))).toHaveCount(3);
        await expect(tabela.getByRole("button", { name: /^Baixar PDF indisponível: / }).first()).toBeVisible();
      }
      if (process.env.CAPTURAS_TER) await page.screenshot({ path: `${process.env.CAPTURAS_TER}/ter-lista-${largura}.png`, fullPage: true });
      if (largura < 768) await page.getByTestId("lista-ter").getByRole("button").filter({ hasText: numeroTer }).click();
      else await page.getByRole("button", { name: `Visualizar ${numeroTer}` }).click();
      const ter = page.getByTestId("dialogo-ter");
      await expect(ter.getByRole("tab", { name: "Dados gerais" })).toBeVisible();
      expect(await semRolagemHorizontal(page)).toBe(true);
      if (process.env.CAPTURAS_TER) await page.screenshot({ path: `${process.env.CAPTURAS_TER}/ter-detalhe-${largura}.png` });
    });
  }
});
