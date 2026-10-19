-- CreateEnum
CREATE TYPE "TipoTransferencia" AS ENUM ('COLABORADOR', 'EMPRESA');

-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('PENDENTE', 'CONCLUIDA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "MotivoEncerramentoItem" ADD VALUE 'TRANSFERENCIA';

-- AlterEnum
ALTER TYPE "TipoMovimentacao" ADD VALUE 'TRANSFERENCIA_COLABORADOR';

-- CreateTable
CREATE TABLE "transferencia" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "tipo" "TipoTransferencia" NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL,
    "pendente" BOOLEAN DEFAULT true,
    "colaborador_origem_id" TEXT,
    "colaborador_origem_nome" TEXT,
    "colaborador_destino_id" TEXT,
    "colaborador_destino_nome" TEXT,
    "alocacao_origem_id" TEXT,
    "alocacao_destino_id" TEXT,
    "empresa_origem_id" TEXT,
    "empresa_origem_nome" TEXT,
    "empresa_destino_id" TEXT,
    "empresa_destino_nome" TEXT,
    "motivo" TEXT,
    "prevista_para" DATE,
    "efetivada_em" TIMESTAMP(3),
    "realizada_por_conta_id" TEXT,
    "realizada_por_nome" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_por_nome" TEXT,
    "cancelada_em" TIMESTAMP(3),
    "cancelada_por_nome" TEXT,
    "motivo_cancelamento" TEXT,
    "chave_requisicao" TEXT,

    CONSTRAINT "transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transferencia_chave_requisicao_key" ON "transferencia"("chave_requisicao");

-- CreateIndex
CREATE INDEX "transferencia_ativo_id_criada_em_idx" ON "transferencia"("ativo_id", "criada_em");

-- CreateIndex
CREATE UNIQUE INDEX "transferencia_ativo_id_pendente_key" ON "transferencia"("ativo_id", "pendente");

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coerência: só a transferência pendente tem "pendente" verdadeiro; depois fica nulo.
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_pendente_coerente" CHECK (
  ("estado" = 'PENDENTE' AND "pendente" IS TRUE) OR ("estado" <> 'PENDENTE' AND "pendente" IS NULL)
);
-- Entre empresas: origem, destino diferentes e motivo preenchido; nunca fica pendente.
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_empresa_completa" CHECK (
  "tipo" <> 'EMPRESA' OR (
    "estado" <> 'PENDENTE'
    AND "empresa_origem_id" IS NOT NULL AND "empresa_destino_id" IS NOT NULL
    AND "empresa_origem_id" <> "empresa_destino_id"
    AND "motivo" IS NOT NULL AND btrim("motivo") <> ''
  )
);
-- Entre colaboradores: destino informado e diferente da origem.
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_colaborador_completa" CHECK (
  "tipo" <> 'COLABORADOR' OR (
    "colaborador_destino_id" IS NOT NULL
    AND "colaborador_origem_id" IS DISTINCT FROM "colaborador_destino_id"
  )
);
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_concluida_efetivada" CHECK ("estado" <> 'CONCLUIDA' OR "efetivada_em" IS NOT NULL);

-- Histórico de transferências: nunca excluído; só a pendente pode mudar (concluir ou cancelar).
CREATE FUNCTION "transferencia_preservada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."estado" <> 'PENDENTE' THEN
    RAISE EXCEPTION 'O histórico de transferências não pode ser alterado nem excluído.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "transferencia_preservada"
  BEFORE UPDATE OR DELETE ON "transferencia"
  FOR EACH ROW EXECUTE FUNCTION "transferencia_preservada"();
