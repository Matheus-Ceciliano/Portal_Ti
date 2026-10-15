// Executado antes de cada arquivo de teste: aponta para o banco de TESTE, nunca o de desenvolvimento.
try {
  process.loadEnvFile(".env");
} catch {
  // CI: variáveis já presentes no ambiente.
}

if (!process.env.DATABASE_URL_TESTE) {
  throw new Error("DATABASE_URL_TESTE não definida. Execute npm run preparar.");
}
if (process.env.AMBIENTE === "PRODUCAO") {
  throw new Error("Testes recusam executar com AMBIENTE=PRODUCAO.");
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;
