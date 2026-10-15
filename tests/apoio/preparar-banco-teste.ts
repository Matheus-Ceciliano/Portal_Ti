import { execSync } from "node:child_process";

/** Aplica as migrações no banco de TESTE antes da suíte. */
export default function prepararBancoTeste() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // CI
  }
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) throw new Error("DATABASE_URL_TESTE não definida.");
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
