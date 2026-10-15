import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { obterConfiguracao } from "@/server/config";

const global = globalThis as unknown as { prismaVallur?: PrismaClient };

function criarCliente() {
  const adapter = new PrismaPg({ connectionString: obterConfiguracao().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = global.prismaVallur ?? criarCliente();

if (process.env.NODE_ENV !== "production") global.prismaVallur = prisma;

export type Transacao = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type ClienteBanco = typeof prisma | Transacao;
