import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { obterConfiguracao } from "@/server/config";

const global = globalThis as unknown as { prismaVallur?: PrismaClient };

function criarCliente() {
  const adapter = new PrismaPg({ connectionString: obterConfiguracao().DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Em desenvolvimento o cliente fica em cache entre recargas. Depois de `prisma generate`
// (migração nova) a classe muda: o cliente antigo não conhece os campos novos, então um
// novo é criado. O antigo não é desconectado: módulos ainda não recarregados podem usá-lo.
const anterior = global.prismaVallur;
export const prisma = anterior instanceof PrismaClient ? anterior : criarCliente();

if (process.env.NODE_ENV !== "production") global.prismaVallur = prisma;

export type Transacao = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type ClienteBanco = typeof prisma | Transacao;
