-- Fotos do cadastro retiradas na edição: saem das galerias, mas o registro e o arquivo ficam.
-- AlterTable
ALTER TABLE "foto_ativo" ADD COLUMN     "removida_em" TIMESTAMP(3),
ADD COLUMN     "removida_por_nome" TEXT;

