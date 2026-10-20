-- Aluguel de equipamentos entre empresas do grupo (a propriedade não muda) e tipos de
-- movimentação do histórico. Só acrescenta estruturas: nenhum registro existente é alterado.
-- AlterEnum
ALTER TYPE "TipoMovimentacao" ADD VALUE 'ALUGUEL_INICIADO';
ALTER TYPE "TipoMovimentacao" ADD VALUE 'ALUGUEL_ENCERRADO';

-- CreateTable
CREATE TABLE "aluguel_equipamento" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "empresa_proprietaria_id" TEXT NOT NULL,
    "empresa_locataria_id" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "devolucao_prevista" DATE,
    "motivo" TEXT NOT NULL,
    "observacoes" TEXT,
    "vigente" BOOLEAN DEFAULT true,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por_conta_id" TEXT,
    "registrado_por_nome" TEXT NOT NULL,
    "encerrado_em" TIMESTAMP(3),
    "encerrado_por_conta_id" TEXT,
    "encerrado_por_nome" TEXT,
    "motivo_encerramento" TEXT,
    "chave_requisicao" TEXT,

    CONSTRAINT "aluguel_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aluguel_equipamento_chave_requisicao_key" ON "aluguel_equipamento"("chave_requisicao");

-- CreateIndex
CREATE INDEX "aluguel_equipamento_empresa_locataria_id_vigente_idx" ON "aluguel_equipamento"("empresa_locataria_id", "vigente");

-- CreateIndex
CREATE INDEX "aluguel_equipamento_ativo_id_inicio_idx" ON "aluguel_equipamento"("ativo_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "aluguel_equipamento_ativo_id_vigente_key" ON "aluguel_equipamento"("ativo_id", "vigente");

-- AddForeignKey
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_equipamento_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_equipamento_empresa_proprietaria_id_fkey" FOREIGN KEY ("empresa_proprietaria_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_equipamento_empresa_locataria_id_fkey" FOREIGN KEY ("empresa_locataria_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Coerência do aluguel: locatária diferente da proprietária; vigente sem encerramento e
-- encerrado com data e motivo; devolução prevista nunca antes do início.
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_locataria_diferente" CHECK ("empresa_locataria_id" <> "empresa_proprietaria_id");
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_vigente_coerente" CHECK (
  ("vigente" IS TRUE AND "encerrado_em" IS NULL AND "motivo_encerramento" IS NULL)
  OR ("vigente" IS NULL AND "encerrado_em" IS NOT NULL AND "motivo_encerramento" IS NOT NULL)
);
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_devolucao_apos_inicio" CHECK ("devolucao_prevista" IS NULL OR "devolucao_prevista" >= "inicio");
ALTER TABLE "aluguel_equipamento" ADD CONSTRAINT "aluguel_motivo_preenchido" CHECK (btrim("motivo") <> '');

-- A propriedade não muda enquanto houver aluguel vigente, nem por gravação direta no banco.
CREATE FUNCTION "ativo_sem_troca_de_dono_alugado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."empresa_id" <> OLD."empresa_id"
     AND EXISTS (SELECT 1 FROM "aluguel_equipamento" WHERE "ativo_id" = NEW."id" AND "vigente" IS TRUE) THEN
    RAISE EXCEPTION 'Equipamento alugado a outra empresa: encerre o aluguel antes de transferir a propriedade.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ativo_sem_troca_de_dono_alugado"
  BEFORE UPDATE OF "empresa_id" ON "ativo"
  FOR EACH ROW EXECUTE FUNCTION "ativo_sem_troca_de_dono_alugado"();
