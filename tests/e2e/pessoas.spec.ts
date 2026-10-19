import { expect, test, type Locator, type Page } from "@playwright/test";
import { estado } from "./apoio";

/** Seleção personalizada (Radix/cmdk): abre pelo rótulo e escolhe a opção no menu flutuante. */
async function escolher(page: Page, escopo: Locator, rotulo: string | RegExp, opcao: string) {
  await escopo.getByLabel(rotulo, typeof rotulo === "string" ? { exact: true } : undefined).click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
}

const linha = (page: Page, nome: string | RegExp) => page.getByRole("table", { name: "Pessoas cadastradas" }).getByRole("row", { name: nome });

test.describe("Pessoas: lista (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  test("cabeçalho enxuto e só as colunas pedidas (sem conta de acesso e sem notebook)", async ({ page }) => {
    await page.goto("/ti/cadastros/pessoas");
    await expect(page.getByRole("heading", { level: 1, name: "Pessoas" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha" })).toHaveText(/Cadastros\s*\/\s*Pessoas/);
    await expect(page.getByText("Colaboradores do grupo, com a situação da conta")).toHaveCount(0);
    await expect(page.getByTestId("cadastrar-pessoa")).toBeVisible();
    await expect(page.getByText(/^\d+ pessoas$/)).toBeVisible();

    const cabecalhos = page.getByRole("table", { name: "Pessoas cadastradas" }).getByRole("columnheader");
    await expect(cabecalhos).toHaveText([/Colaborador/, /Empresa/, /Cargo/, /Situação/, "Ações"]);
    for (const removida of [/Perfil de TI/, /Conta de acesso/, /Notebook/]) {
      await expect(page.getByRole("columnheader", { name: removida })).toHaveCount(0);
    }
    await page.getByLabel("Pesquisar pessoas").fill("Ana Beatriz");
    await expect(linha(page, /Ana Beatriz Souza/)).toContainText("Horizonte Engenharia Ltda.");
    await expect(linha(page, /Ana Beatriz Souza/)).not.toContainText("VLR-004512");
    await expect(linha(page, /Ana Beatriz Souza/).getByText("AS", { exact: true })).toBeVisible(); // avatar com iniciais
  });

  test("pesquisa por empresa, filtros, ordenação e paginação", async ({ page }) => {
    await page.goto("/ti/cadastros/pessoas");
    await page.getByLabel("Pesquisar pessoas").fill("Horizonte");
    await expect(page).toHaveURL(/busca=Horizonte/);
    await expect(page.getByText(/\d+ de \d+ pessoas/)).toBeVisible();
    for (const nome of await page.getByRole("table", { name: "Pessoas cadastradas" }).getByRole("row").allInnerTexts()) {
      if (!nome.includes("Colaborador")) expect(nome).toContain("Horizonte");
    }
    await page.getByRole("button", { name: "Limpar filtros" }).click();

    await escolher(page, page.getByRole("search", { name: "Pesquisa e filtros" }), "Empresa", "Volume Testes E2E Ltda.");
    await expect(page.getByText(/40 de \d+ pessoas/)).toBeVisible();
    await expect(page.getByText("Página 1 de 4 · 40 registros")).toBeVisible();
    await page.getByRole("link", { name: "Próxima" }).click();
    await expect(page.getByText("Página 2 de 4 · 40 registros")).toBeVisible();
    await expect(page).toHaveURL(/empresa=.*pagina=2|pagina=2.*empresa=/);

    await page.getByRole("columnheader", { name: /Colaborador/ }).getByRole("link").click();
    await expect(page).toHaveURL(/direcao=desc/);
    await expect(page).not.toHaveURL(/pagina=/); // ordenar volta à primeira página
    await expect(page.getByRole("table", { name: "Pessoas cadastradas" }).getByRole("row").nth(1)).toContainText("Pessoa Volume 40");

    await escolher(page, page.getByRole("search", { name: "Pesquisa e filtros" }), "Situação", "Afastado");
    await expect(page.getByText("Nenhuma pessoa encontrada")).toBeVisible();
  });
});

test.describe("Pessoas: cadastro, duplicidade, detalhes e edição (Supervisor TI)", () => {
  test.use({ storageState: estado("supervisor") });

  const LOGIN_EM_USO = "Este login já está em uso. Selecione outro sobrenome do colaborador.";
  const campo = (d: Locator, nome: string | RegExp) => d.getByRole("textbox", { name: nome });
  const segundoNome = (d: Locator) => campo(d, /^Segundo nome/);
  /** Bloco do campo Segundo nome (rótulo, etiqueta Calculado/Alterado, campo e avisos). */
  const blocoSegundoNome = (d: Locator) => segundoNome(d).locator("xpath=ancestor::div[contains(concat(' ', @class, ' '), ' flex-col ')][1]");

  async function abrirCadastro(page: Page) {
    await page.goto("/ti/cadastros/pessoas");
    await page.getByTestId("cadastrar-pessoa").click();
    return page.getByTestId("dialogo-pessoa");
  }

  async function preencher(page: Page, nome: string, sobrenome?: string) {
    const d = await abrirCadastro(page);
    await d.getByLabel(/Nome completo/).fill(nome);
    await escolher(page, d, /^Empresa/, "Horizonte Engenharia Ltda.");
    await escolher(page, d, "Grupo de licença", "VIRTA - F1");
    if (sobrenome) await escolher(page, d, /^Sobrenome utilizado/, sobrenome);
    return d;
  }

  test("segundo nome automático, sobrenome escolhido, senha pela fórmula, mensagem de boas-vindas e ativação", async ({ page, browser }) => {
    test.setTimeout(180_000); // cadastro completo + ativação em outro navegador
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const d = await preencher(page, "Maria Fernanda Oliveira");
    // Sem foto e sem os textos explicativos retirados.
    await expect(d.locator('input[type="file"]')).toHaveCount(0);
    for (const texto of ["Os identificadores de acesso são calculados a partir do nome", "Usados no cálculo dos identificadores", "Opcional"]) {
      await expect(d.getByText(texto, { exact: false })).toHaveCount(0);
    }
    // Segundo nome pela fórmula da planilha, já preenchido; sobrenome ainda por escolher.
    await expect(segundoNome(d)).toHaveValue("Fernanda");
    await expect(blocoSegundoNome(d)).toContainText("Calculado");
    await expect(campo(d, "Nome do servidor/PC")).toHaveValue("");

    await d.getByLabel(/^Sobrenome utilizado/).click();
    await expect(page.getByRole("option")).toHaveText(["Fernanda", "Oliveira", "Fernanda Oliveira"]);
    await page.getByRole("option", { name: "Oliveira", exact: true }).click();
    await expect(campo(d, "Nome do servidor/PC")).toHaveValue("Maria Oliveira");
    await expect(campo(d, "Login UAU")).toHaveValue("MFOLIVEI");
    await expect(campo(d, "Login Microsoft")).toHaveValue("maria.oliveira@virtaeng.onmicrosoft.com");
    await expect(campo(d, /^E-mail corporativo/)).toHaveValue("maria.oliveira@virta.eng.br");
    await expect(d.getByText("Disponível", { exact: true })).toHaveCount(4);
    // Horizonte (nome curto) @ M=77 . F=70
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("Horizonte@77.70");
    await expect(d.getByText("Senha inicial de ativação.")).toBeVisible();

    // Trocar só o sobrenome recalcula os logins e mantém o segundo nome e a senha.
    await escolher(page, d, /^Sobrenome utilizado/, "Fernanda Oliveira");
    await expect(campo(d, "Nome do servidor/PC")).toHaveValue("Maria Fernanda Oliveira");
    await expect(campo(d, "Login UAU")).toHaveValue("MFFERNAN");
    await expect(campo(d, /^E-mail corporativo/)).toHaveValue("maria.fernanda.oliveira@virta.eng.br");
    await expect(segundoNome(d)).toHaveValue("Fernanda");
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("Horizonte@77.70");
    await escolher(page, d, /^Sobrenome utilizado/, "Oliveira");

    // Sem grupo de licença, nenhum domínio é presumido.
    await escolher(page, d, "Grupo de licença", "Sem grupo de licença");
    await expect(campo(d, "Login Microsoft")).toHaveValue("");
    await escolher(page, d, "Grupo de licença", "VIRTA - F1");

    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    const mensagem = d.getByTestId("mensagem-boas-vindas");
    await expect(mensagem).toContainText("Olá, Maria Fernanda Oliveira!");
    await expect(mensagem).toContainText("Computador/Servidor: Maria Oliveira");
    await expect(mensagem).toContainText("UAU: MFOLIVEI");
    await expect(mensagem).toContainText("Portal TI Vallur: maria.oliveira@virta.eng.br");
    await expect(mensagem).toContainText("Senha inicial: Horizonte@77.70");
    await expect(page).not.toHaveURL(/Horizonte@|senha/i); // nada de credencial na URL

    await d.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(d.getByRole("heading", { name: "Cadastro concluído" })).toBeVisible();
    await d.getByRole("button", { name: "Copiar mensagem" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Senha inicial: Horizonte@77.70");
    await d.getByRole("button", { name: "Concluir" }).click();
    await expect(d).toBeHidden();
    await page.getByLabel("Pesquisar pessoas").fill("Maria Fernanda");
    await expect(linha(page, /Maria Fernanda Oliveira/)).toBeVisible();

    // Reabrir o cadastro não traz nada do anterior (a senha não fica no estado).
    await page.getByTestId("cadastrar-pessoa").click();
    await expect(d.getByLabel(/Nome completo/)).toHaveValue("");
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("");
    await page.keyboard.press("Escape");

    // A senha inicial calculada só abre a ativação; a pessoa cria a senha pessoal.
    // O contexto novo herda o `use` do arquivo (sessão do Supervisor): começa sem cookies.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const nova = await contexto.newPage();
    await nova.goto("/entrar");
    await nova.getByLabel("E-mail corporativo").fill("maria.oliveira@virta.eng.br");
    await nova.getByLabel("Senha", { exact: true }).fill("Horizonte@77.70");
    await nova.getByRole("button", { name: "Entrar" }).click();
    await expect(nova).toHaveURL(/\/conta\/ativar/);
    await nova.goto("/portal");
    await expect(nova).toHaveURL(/\/conta\/ativar/); // nada antes da ativação
    await nova.getByLabel(/^Nova senha/).fill("Horizonte@77.70");
    await nova.getByLabel(/Repita a nova senha/).fill("Horizonte@77.70");
    await nova.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(nova.getByText(/diferente da senha recebida|padrão da planilha|pelo menos 12/)).toBeVisible();
    await nova.getByLabel(/^Nova senha/).fill("Maria-Trilha-Serra-2026");
    await nova.getByLabel(/Repita a nova senha/).fill("Maria-Trilha-Serra-2026");
    await nova.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(nova).toHaveURL(/\/portal$/);
    await contexto.close();
  });

  test("segundo nome editável: atualiza UAU e senha; mudança do nome pede confirmação só quando a edição deixa de valer", async ({ page }) => {
    const d = await preencher(page, "Maria Fernanda Oliveira", "Oliveira");
    await segundoNome(d).fill("Cristina");
    await expect(blocoSegundoNome(d)).toContainText("Alterado");
    await expect(campo(d, "Login UAU")).toHaveValue("MCOLIVEI");
    await expect(campo(d, "Nome do servidor/PC")).toHaveValue("Maria Oliveira");
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("Horizonte@77.67"); // C = 67

    // A edição manual ainda faz parte do novo nome: continua, sem perguntar.
    await d.getByLabel(/Nome completo/).fill("Maria Fernanda Cristina Oliveira");
    await expect(segundoNome(d)).toHaveValue("Cristina");
    await expect(d.getByTestId("confirmar-segundo-nome")).toHaveCount(0);

    // Deixou de fazer parte: pergunta antes de substituir.
    await d.getByLabel(/Nome completo/).fill("Mariana Luiza Oliveira");
    const confirmar = d.getByTestId("confirmar-segundo-nome");
    await expect(confirmar).toContainText("Usar Luiza?");
    await expect(segundoNome(d)).toHaveValue("Cristina");
    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    await expect(d.getByText("Confirme o segundo nome: use o calculado ou mantenha o informado.")).toBeVisible();
    await confirmar.getByRole("button", { name: "Usar Luiza" }).click();
    await expect(segundoNome(d)).toHaveValue("Luiza");
    await expect(blocoSegundoNome(d)).toContainText("Calculado");
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("Horizonte@77.76"); // L = 76

    await segundoNome(d).fill("Clara");
    await d.getByLabel(/Nome completo/).fill("Mariana Beatriz Oliveira");
    await d.getByTestId("confirmar-segundo-nome").getByRole("button", { name: "Manter Clara" }).click();
    await expect(segundoNome(d)).toHaveValue("Clara");
    await expect(d.getByTestId("confirmar-segundo-nome")).toHaveCount(0);
    await d.getByRole("button", { name: "Voltar ao segundo nome calculado (Beatriz)" }).click();
    await expect(segundoNome(d)).toHaveValue("Beatriz");

    // Partículas: "da" não é segundo nome nem sobrenome sozinho.
    await d.getByLabel(/Nome completo/).fill("Ana da Silva Prado");
    await expect(segundoNome(d)).toHaveValue("Silva");
    await d.getByLabel(/^Sobrenome utilizado/).click();
    await expect(page.getByRole("option")).toHaveText(["Silva", "da Silva", "Prado", "Silva Prado"]);
    await page.keyboard.press("Escape");

    // Sem segunda parte no nome: validação clara, nada inventado.
    await d.getByLabel(/Nome completo/).fill("Joana");
    await expect(segundoNome(d)).toHaveValue("");
    await expect(d.getByText("Não foi possível determinar pelo nome completo. Informe o segundo nome.")).toBeVisible();
    await expect(d.getByLabel(/^Sobrenome utilizado/)).toBeDisabled();
  });

  test("empresa sem nome curto configurado: a senha não é gerada e o cadastro não avança", async ({ page }) => {
    const d = await abrirCadastro(page);
    await d.getByLabel(/Nome completo/).fill("Joana Lima");
    await escolher(page, d, /^Empresa/, "Volume Testes E2E Ltda.");
    await expect(segundoNome(d)).toHaveValue("Lima");
    await expect(d.getByLabel(/^Sobrenome utilizado/)).toHaveText("Lima"); // única opção: já escolhida
    await expect(d.getByText("Configure o nome curto da empresa em Cadastros → Empresas.")).toBeVisible();
    await expect(d.getByLabel("Senha inicial", { exact: true })).toHaveValue("");
    await campo(d, /^E-mail corporativo/).fill("joana.lima@exemplo.test");
    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    await expect(d.getByRole("region", { name: "Revisão do cadastro" })).toHaveCount(0);
    await expect(d.getByRole("alert").filter({ hasText: "nome curto" })).toBeVisible();
  });

  // Dependem do primeiro teste (Maria Oliveira já cadastrada); a suíte roda em série.
  test("duplicidade: destaca os logins em uso, bloqueia e libera com outro sobrenome (sem sufixos)", async ({ page }) => {
    const d = await preencher(page, "Maria Fernanda Oliveira Santos", "Oliveira");
    await expect(d.getByText("Em uso", { exact: true })).toHaveCount(4);
    for (const nome of ["Nome do servidor/PC", "Login UAU", "Login Microsoft", /^E-mail corporativo/]) {
      await expect(campo(d, nome)).toHaveAttribute("aria-invalid", "true");
    }
    await expect(d.getByText(LOGIN_EM_USO)).toBeVisible();
    await expect(d.getByLabel(/^Sobrenome utilizado/)).toHaveAttribute("aria-invalid", "true");

    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    await expect(d.getByRole("region", { name: "Revisão do cadastro" })).toHaveCount(0);

    // O select mostra quais sobrenomes geram login em uso ("Oliveira Santos" colide no UAU de 8 letras).
    await d.getByLabel(/^Sobrenome utilizado/).click();
    await expect(page.getByRole("option", { name: /^Oliveira \(Em uso\)/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Oliveira Santos \(Em uso\)/ })).toBeVisible();
    await expect(page.getByRole("option", { name: "Santos", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Santos", exact: true }).click();
    await expect(campo(d, "Login UAU")).toHaveValue("MFSANTOS");
    await expect(d.getByText("Disponível", { exact: true })).toHaveCount(4);
    await expect(d.getByText(LOGIN_EM_USO)).toHaveCount(0);

    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    const mensagem = d.getByTestId("mensagem-boas-vindas");
    await expect(mensagem).toContainText("Computador/Servidor: Maria Santos");
    await expect(mensagem).toContainText("Portal TI Vallur: maria.santos@virta.eng.br");
    await expect(d.getByText(/MFOLIVE\d|oliveira\d/)).toHaveCount(0);
    await d.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(d.getByRole("heading", { name: "Cadastro concluído" })).toBeVisible();
  });

  test("todos os sobrenomes em uso: cadastro bloqueado para resolução pela TI", async ({ page }) => {
    const d = await preencher(page, "Maria Oliveira");
    await expect(d.getByLabel(/^Sobrenome utilizado/)).toHaveText("Oliveira");
    await expect(d.getByText("Todos os sobrenomes do nome completo geram logins já em uso. Será necessária uma resolução específica pela TI.")).toBeVisible();
    await d.getByRole("button", { name: "Revisar cadastro" }).click();
    await expect(d.getByRole("region", { name: "Revisão do cadastro" })).toHaveCount(0);
  });

  test("edição do próprio colaborador: os logins dele não contam como duplicidade", async ({ page }) => {
    await page.goto("/ti/cadastros/pessoas?busca=Maria+Fernanda+Oliveira");
    await page.getByRole("button", { name: "Editar Maria Fernanda Oliveira", exact: true }).click();
    const f = page.getByTestId("dialogo-pessoa");
    await expect(segundoNome(f)).toHaveValue("Fernanda");
    await expect(f.getByLabel(/^Sobrenome utilizado/)).toHaveText("Oliveira");
    await expect(campo(f, "Login UAU")).toHaveValue("MFOLIVEI");
    await f.getByLabel("Cargo").fill("Analista de Planejamento Sênior");
    await f.getByRole("button", { name: "Revisar alterações" }).click();
    await f.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Maria Fernanda Oliveira: cadastro atualizado.")).toBeVisible();
  });

  test("detalhes: cinco abas, tamanho estável, TER separado da entrega e edição", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ti/cadastros/pessoas?busca=Ana+Beatriz");
    await linha(page, /Ana Beatriz Souza/).getByRole("button", { name: "Ana Beatriz Souza", exact: true }).click();
    const d = page.getByTestId("dialogo-detalhes-pessoa");
    await expect(d.getByRole("region", { name: "Dados cadastrais" })).toBeVisible();
    await page.waitForTimeout(300);
    const caixa = (await d.boundingBox())!;
    expect([Math.round(caixa.width), Math.round(caixa.height)]).toEqual([1000, 750]);

    await d.getByRole("tab", { name: /Acessos/ }).click();
    await expect(d.getByText("Senhas nunca são exibidas nem recuperáveis.")).toBeVisible();
    await expect(d.getByRole("button", { name: "Redefinir senha do portal" })).toBeVisible();
    await d.getByRole("tab", { name: /Equipamentos/ }).click();
    await expect(d.getByRole("region", { name: "Notebook entregue" })).toContainText("Dell Latitude 5440");
    await d.getByRole("tab", { name: /Alocações/ }).click();
    await expect(d.getByRole("region", { name: "Entregas e reservas" })).toContainText("TER aguardando");
    await d.getByRole("tab", { name: /Documentos/ }).click();
    await expect(d.getByText("TER-2026-0088")).toBeVisible();
    expect(await d.boundingBox()).toMatchObject({ width: caixa.width, height: caixa.height });

    await d.getByRole("button", { name: "Editar" }).click();
    const f = page.getByTestId("dialogo-pessoa");
    await expect(f.getByRole("heading", { name: "Editar Ana Beatriz Souza" })).toBeVisible();
    await f.getByLabel("Cargo").fill("Coordenadora de Planejamento");
    await f.getByRole("button", { name: "Revisar alterações" }).click();
    await f.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Ana Beatriz Souza: cadastro atualizado.")).toBeVisible();
    await expect(linha(page, /Ana Beatriz Souza/)).toContainText("Coordenadora de Planejamento");
  });

  test("endereço antigo /nova abre o cadastro e fechar sem alterações não pede confirmação", async ({ page }) => {
    await page.goto("/ti/cadastros/pessoas/nova");
    await expect(page).toHaveURL(/\/ti\/cadastros\/pessoas\?cadastrar=1/);
    const d = page.getByTestId("dialogo-pessoa");
    await expect(d.getByRole("heading", { name: "Cadastrar pessoa" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(page).not.toHaveURL(/cadastrar=1/);
  });

  for (const [largura, altura] of [
    [375, 812],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`responsivo em ${largura}px: lista e modais sem cortes`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/ti/cadastros/pessoas");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.getByTestId("cadastrar-pessoa").click();
      const f = page.getByTestId("dialogo-pessoa");
      await expect(f.getByRole("heading", { name: "Cadastrar pessoa" })).toBeVisible();
      await page.waitForTimeout(300);
      const caixa = (await f.boundingBox())!;
      expect(caixa.width).toBeLessThanOrEqual(largura);
      expect(caixa.height).toBeLessThanOrEqual(altura);
      await expect(f.getByRole("button", { name: "Revisar cadastro" })).toBeInViewport({ ratio: 1 });
      expect(await f.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.keyboard.press("Escape");

      await page.getByLabel("Pesquisar pessoas").fill("Ana Beatriz");
      await page.getByRole("button", { name: largura < 768 ? /Ana Beatriz Souza/ : "Ana Beatriz Souza" }).first().click();
      const d = page.getByTestId("dialogo-detalhes-pessoa");
      await expect(d.getByRole("region", { name: "Dados cadastrais" })).toBeVisible();
      const c = (await d.boundingBox())!;
      expect(c.width).toBeLessThanOrEqual(largura);
      expect(c.height).toBeLessThanOrEqual(altura);
      expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    });
  }
});

test.describe("Pessoas: permissões", () => {
  test.describe("Estagiário TI", () => {
    test.use({ storageState: estado("estagiario") });

    test("edita pessoa comum, mas não membros da equipe de TI", async ({ page }) => {
      await page.goto("/ti/cadastros/pessoas?busca=Souza");
      await expect(linha(page, /Ana Beatriz Souza/).getByRole("button", { name: "Editar Ana Beatriz Souza" })).toBeVisible();
      await page.goto("/ti/cadastros/pessoas?busca=Helena");
      await expect(linha(page, /Helena Prado/)).toBeVisible();
      await expect(linha(page, /Helena Prado/).getByRole("button", { name: "Editar Helena Prado" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Grupos de licença" })).toHaveCount(0);
    });
  });

  test.describe("Colaborador", () => {
    test.use({ storageState: estado("colaboradora") });

    test("não acessa a lista de pessoas", async ({ page }) => {
      await page.goto("/ti/cadastros/pessoas");
      await expect(page).toHaveURL(/\/portal/);
    });
  });
});
