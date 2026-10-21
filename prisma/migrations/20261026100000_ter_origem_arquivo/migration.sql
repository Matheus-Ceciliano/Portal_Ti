-- CreateEnum
CREATE TYPE "OrigemArquivoTer" AS ENUM ('TI', 'PORTAL_COLABORADOR');

-- AlterTable
ALTER TABLE "arquivo_assinado_ter" ADD COLUMN     "origem" "OrigemArquivoTer" NOT NULL DEFAULT 'TI';

