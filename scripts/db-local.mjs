// PostgreSQL 17 local, sem Docker, a partir dos binários do pacote embedded-postgres.
// Dados em .data/postgres (ignorado pelo Git). Mantém o servidor em primeiro plano
// até Ctrl+C. Uso: npm run db
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {
  console.error("Arquivo .env não encontrado. Execute antes: npm run preparar");
  process.exit(1);
}

const { PG_PORTA, PG_USUARIO, PG_SENHA, AMBIENTE } = process.env;
if (AMBIENTE !== "DESENVOLVIMENTO") {
  console.error("O banco local só pode ser usado com AMBIENTE=DESENVOLVIMENTO.");
  process.exit(1);
}

const diretorio = ".data/postgres";
const pg = new EmbeddedPostgres({
  databaseDir: diretorio,
  user: PG_USUARIO,
  password: PG_SENHA,
  port: Number(PG_PORTA),
  persistent: true,
  onLog: () => {},
});

if (!existsSync(`${diretorio}/PG_VERSION`)) {
  console.log("Inicializando o cluster PostgreSQL local…");
  await pg.initialise();
}

await pg.start();
for (const banco of ["vallur_portal", "vallur_portal_teste"]) {
  try {
    await pg.createDatabase(banco);
    console.log(`Banco ${banco} criado.`);
  } catch {
    // já existe
  }
}
console.log(`PostgreSQL local em localhost:${PG_PORTA}. Ctrl+C para parar.`);

const parar = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
setInterval(() => {}, 1 << 30);
