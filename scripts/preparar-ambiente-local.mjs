// Gera o arquivo .env de DESENVOLVIMENTO com segredos aleatórios locais.
// Nunca sobrescreve um .env existente. O .env é ignorado pelo Git.
// Uso: npm run preparar
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const destino = ".env";
if (existsSync(destino)) {
  console.log(".env já existe; nada foi alterado.");
  process.exit(0);
}

const segredo = (bytes = 32) => randomBytes(bytes).toString("base64url");
const senhaBanco = segredo(18);
const porta = 54329;

const conteudo = `# Gerado por scripts/preparar-ambiente-local.mjs. Somente DESENVOLVIMENTO local.
# Segredos aleatórios desta máquina: não copie para outros ambientes.
AMBIENTE=DESENVOLVIMENTO
TENANTS_ESCRITA_AUTORIZADOS=
MODO_INTEGRACOES=SIMULACAO
NEXT_TELEMETRY_DISABLED=1

PG_PORTA=${porta}
PG_USUARIO=vallur_dev
PG_SENHA=${senhaBanco}
DATABASE_URL=postgresql://vallur_dev:${senhaBanco}@localhost:${porta}/vallur_portal
DATABASE_URL_TESTE=postgresql://vallur_dev:${senhaBanco}@localhost:${porta}/vallur_portal_teste

BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=${segredo(32)}
SENHA_PEPPER=${segredo(32)}

CPF_CHAVE_CIFRA=${segredo(32)}
CPF_CHAVE_HMAC=${segredo(32)}
`;

writeFileSync(destino, conteudo, { encoding: "utf8", flag: "wx" });
console.log(".env criado com segredos aleatórios locais.");
