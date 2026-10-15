import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // CI
}

const PORTA = 3100;
const URL_BASE = `http://localhost:${PORTA}`;

/**
 * E2E contra um servidor Next próprio (porta 3100, distDir .next-e2e) apontado para o
 * banco de TESTE. O cenário fictício é criado em tests/e2e/global-setup.ts.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: URL_BASE,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /autenticar\.setup\.ts/, use: { channel: "chrome" } },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORTA}`,
    url: `${URL_BASE}/entrar`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: process.env.DATABASE_URL_TESTE ?? "",
      BETTER_AUTH_URL: URL_BASE,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
