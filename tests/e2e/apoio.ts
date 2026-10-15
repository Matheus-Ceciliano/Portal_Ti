import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { gerarTotp } from "../apoio/totp";

export type Conta = { email: string; senha: string; contaId: string; segredoTotp?: string; codigo?: string };
export type Cenario = Record<
  "supervisor" | "gestor" | "estagiario" | "colaboradora" | "pendente" | "bloqueada" | "novaTi",
  Conta
>;

export const cenario = (): Cenario => JSON.parse(readFileSync("playwright/.auth/cenario.json", "utf8"));
export const estado = (papel: string) => `playwright/.auth/${papel}.json`;

export async function entrar(page: Page, conta: Conta) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail corporativo").fill(conta.email);
  await page.getByLabel("Senha", { exact: true }).fill(conta.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (conta.segredoTotp) {
    await expect(page).toHaveURL(/\/entrar\/segundo-fator/);
    await page.getByLabel("Código do aplicativo autenticador").fill(gerarTotp(conta.segredoTotp));
    await page.getByRole("button", { name: "Verificar e entrar" }).click();
  }
}
