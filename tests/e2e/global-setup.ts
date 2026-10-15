import { execSync } from "node:child_process";

/** Migra o banco de TESTE e cria o cenário fictício (credenciais só em playwright/.auth, ignorado pelo Git). */
export default function prepararE2e() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // CI
  }
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) throw new Error("DATABASE_URL_TESTE não definida.");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx tests/e2e/cenario.ts", { stdio: "inherit", env });
}
