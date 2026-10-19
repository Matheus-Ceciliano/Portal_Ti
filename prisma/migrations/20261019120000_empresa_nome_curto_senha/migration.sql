-- Nome curto da empresa usado na senha inicial de ativação (fórmula da planilha). Coluna
-- anulável: nenhuma empresa existente é alterada; sem o nome curto, a senha não é gerada.

-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "nome_curto_senha" TEXT;

