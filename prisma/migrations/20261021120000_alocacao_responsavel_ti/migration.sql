-- Responsável TI escolhido na alocação e conta de quem registrou a operação. Alocações
-- anteriores ficam com os campos vazios (nada é preenchido por suposição).
-- AlterTable
ALTER TABLE "alocacao" ADD COLUMN     "criada_por_conta_id" TEXT,
ADD COLUMN     "responsavel_ti_conta_id" TEXT,
ADD COLUMN     "responsavel_ti_nome" TEXT;

-- AddForeignKey
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_responsavel_ti_conta_id_fkey" FOREIGN KEY ("responsavel_ti_conta_id") REFERENCES "conta_acesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

