import { expect, test as setup } from "@playwright/test";
import { cenario, entrar, estado } from "./apoio";

// Uma entrada por papel (com TOTP real); as sessões ficam salvas para os demais testes.
for (const papel of ["supervisor", "gestor", "estagiario", "colaboradora"] as const) {
  setup(`entrar como ${papel}`, async ({ page }) => {
    await entrar(page, cenario()[papel]);
    await expect(page).toHaveURL(papel === "colaboradora" ? /\/portal$/ : /\/ti$/);
    await page.context().storageState({ path: estado(papel) });
  });
}
