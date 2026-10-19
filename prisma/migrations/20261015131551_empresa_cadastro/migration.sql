-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "logo_chave" TEXT,
ADD COLUMN     "logo_tipo" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "responsavel" TEXT;

-- CNPJ passa a ser guardado na forma canônica (14 caracteres, sem pontuação).
UPDATE "empresa" SET "cnpj" = upper(regexp_replace("cnpj", '[^0-9A-Za-z]', '', 'g'));
