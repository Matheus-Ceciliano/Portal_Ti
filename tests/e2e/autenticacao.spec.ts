import { expect, test } from "@playwright/test";
import { gerarTotp } from "../apoio/totp";
import { cenario } from "./apoio";

test.describe("entrada e ativação", () => {
  test("a aplicação inicia e a tela de login renderiza com campos acessíveis", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page).toHaveTitle(/Entrar · Portal TI Vallur/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no portal" })).toBeVisible();
    await expect(page.getByLabel("E-mail corporativo")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "text");
    await expect(page.getByTestId("faixa-ambiente")).toContainText("integrações Microsoft simuladas");
  });

  test("validação no cliente e erro genérico no servidor", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe o e-mail corporativo.")).toBeVisible();

    await page.getByLabel("E-mail corporativo").fill("ninguem@vallur.test");
    await page.getByLabel("Senha", { exact: true }).fill("qualquer-coisa-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha inválidos." })).toBeVisible();
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("conta bloqueada falha com a mesma mensagem genérica", async ({ page }) => {
    const { bloqueada } = cenario();
    await page.goto("/entrar");
    await page.getByLabel("E-mail corporativo").fill(bloqueada.email);
    await page.getByLabel("Senha", { exact: true }).fill(bloqueada.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha inválidos." })).toBeVisible();
  });

  test("sem sessão, rotas protegidas redirecionam; cookie forjado não passa do servidor", async ({ page, context }) => {
    for (const rota of ["/ti", "/ti/configuracoes", "/portal", "/conta/ativar"]) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/entrar/);
    }
    await context.addCookies([{ name: "vallur.session_token", value: "forjado.assinatura", url: "http://localhost:3100" }]);
    await page.goto("/ti");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("senha inicial só abre a ativação, sem acesso privilegiado", async ({ page }) => {
    const { pendente } = cenario();
    await page.goto("/entrar");
    await page.getByLabel("E-mail corporativo").fill(pendente.email);
    await page.getByLabel("Senha", { exact: true }).fill(pendente.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/conta\/ativar/);
    for (const rota of ["/ti", "/portal"]) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/conta\/ativar/);
    }
    // Colaborador sem perfil de TI: só define a senha pessoal (sem código).
    await expect(page.getByLabel(/Código de ativação/)).toHaveCount(0);
    await page.getByLabel(/^Nova senha/).fill(pendente.senha);
    await page.getByLabel(/Repita a nova senha/).fill(pendente.senha);
    await page.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(page.getByText("A nova senha precisa ser diferente da senha recebida da TI.")).toBeVisible();

    await page.getByLabel(/^Nova senha/).fill("Carlos-Trilha-Serra-2026");
    await page.getByLabel(/Repita a nova senha/).fill("Carlos-Trilha-Serra-2026");
    await page.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("perfil de TI: código de uso único + autenticador antes de liberar a área de TI", async ({ page }) => {
    const { novaTi } = cenario();
    await page.goto("/entrar");
    await page.getByLabel("E-mail corporativo").fill(novaTi.email);
    await page.getByLabel("Senha", { exact: true }).fill(novaTi.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/conta\/ativar/);

    await page.getByLabel(/Código de ativação/).fill("ZZZZ-ZZZZ-ZZZZ");
    await page.getByLabel(/^Nova senha/).fill("Nova-Senha-Pessoal-2026");
    await page.getByLabel(/Repita a nova senha/).fill("Nova-Senha-Pessoal-2026");
    await page.getByRole("button", { name: "Salvar e continuar" }).click();
    await expect(page.getByText("Código de ativação inválido, expirado ou já utilizado.")).toBeVisible();

    await page.getByLabel(/Código de ativação/).fill(novaTi.codigo!);
    await page.getByLabel(/^Nova senha/).fill("Nova-Senha-Pessoal-2026");
    await page.getByLabel(/Repita a nova senha/).fill("Nova-Senha-Pessoal-2026");
    await page.getByRole("button", { name: "Salvar e continuar" }).click();
    await expect(page.getByRole("heading", { name: /Guarde os códigos de recuperação/ })).toBeVisible();

    // Ainda sem MFA confirmado: a área de TI continua bloqueada.
    const chave = (await page.getByTestId("chave-totp").textContent())!.replace(/\s/g, "");
    await expect(page.getByRole("button", { name: "Confirmar e concluir a ativação" })).toBeDisabled();
    await page.getByTestId("guardei-codigos").click();
    await page.getByLabel(/Código de 6 dígitos/).fill(gerarTotp(chave));
    await page.getByRole("button", { name: "Confirmar e concluir a ativação" }).click();
    await expect(page).toHaveURL(/\/ti$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard operacional");
  });
});
