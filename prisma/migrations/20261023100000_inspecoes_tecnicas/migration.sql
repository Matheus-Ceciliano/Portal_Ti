-- Inspecoes tecnicas: questionarios versionados, inspecoes de entrada, devolucao e
-- pre-alocacao e a verificacao de cada item na entrega fisica (instantaneo para o TER).

-- CreateEnum
CREATE TYPE "CondicaoEntrada" AS ENUM ('NOVO', 'USADO');

-- CreateEnum
CREATE TYPE "TipoInspecao" AS ENUM ('ENTRADA', 'DEVOLUCAO', 'PRE_ALOCACAO');

-- CreateEnum
CREATE TYPE "EstadoInspecao" AS ENUM ('PENDENTE', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ResultadoInspecao" AS ENUM ('APTO', 'APTO_COM_RESSALVAS', 'INAPTO');

-- CreateEnum
CREATE TYPE "RespostaChecklist" AS ENUM ('CONFORME', 'NAO_CONFORME', 'NAO_TESTADO', 'NAO_SE_APLICA');

-- CreateEnum
CREATE TYPE "ModoVerificacaoEntrega" AS ENUM ('CONFIRMOU_ULTIMA', 'NOVA_INSPECAO');

-- AlterEnum
ALTER TYPE "ContextoFoto" ADD VALUE 'INSPECAO';

-- AlterTable
ALTER TABLE "ativo" ADD COLUMN     "condicao_entrada" "CondicaoEntrada";

-- AlterTable
ALTER TABLE "foto_ativo" ADD COLUMN     "inspecao_id" TEXT,
ADD COLUMN     "resposta_id" TEXT;

-- CreateTable
CREATE TABLE "questionario_inspecao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "perguntas" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionario_inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspecao_tecnica" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "ativo_id" TEXT NOT NULL,
    "tipo" "TipoInspecao" NOT NULL,
    "estado" "EstadoInspecao" NOT NULL,
    "pendente" BOOLEAN DEFAULT true,
    "categoria" "CategoriaAtivo",
    "categoria_nome" TEXT,
    "questionario_id" TEXT,
    "condicao_entrada" "CondicaoEntrada",
    "resultado" "ResultadoInspecao",
    "observacoes" TEXT,
    "devolucao_id" TEXT,
    "alocacao_id" TEXT,
    "aberta_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aberta_por_nome" TEXT NOT NULL,
    "motivo_abertura" TEXT,
    "concluida_em" TIMESTAMP(3),
    "responsavel_conta_id" TEXT,
    "responsavel_nome" TEXT,
    "cancelada_em" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,

    CONSTRAINT "inspecao_tecnica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta_inspecao" (
    "id" TEXT NOT NULL,
    "inspecao_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "bloqueante" BOOLEAN NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL,
    "resposta" "RespostaChecklist" NOT NULL,
    "justificativa" TEXT,
    "observacao" TEXT,

    CONSTRAINT "resposta_inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacao_entrega" (
    "id" TEXT NOT NULL,
    "item_alocacao_id" TEXT NOT NULL,
    "alocacao_id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "inspecao_id" TEXT NOT NULL,
    "modo" "ModoVerificacaoEntrega" NOT NULL,
    "instantaneo" JSONB NOT NULL,
    "verificada_em" TIMESTAMP(3) NOT NULL,
    "responsavel_conta_id" TEXT NOT NULL,
    "responsavel_nome" TEXT NOT NULL,

    CONSTRAINT "verificacao_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questionario_inspecao_codigo_versao_key" ON "questionario_inspecao"("codigo", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "inspecao_tecnica_numero_key" ON "inspecao_tecnica"("numero");

-- CreateIndex
CREATE INDEX "inspecao_tecnica_ativo_id_concluida_em_idx" ON "inspecao_tecnica"("ativo_id", "concluida_em");

-- CreateIndex
CREATE UNIQUE INDEX "inspecao_tecnica_ativo_id_pendente_key" ON "inspecao_tecnica"("ativo_id", "pendente");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_inspecao_inspecao_id_chave_key" ON "resposta_inspecao"("inspecao_id", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "verificacao_entrega_item_alocacao_id_key" ON "verificacao_entrega"("item_alocacao_id");

-- CreateIndex
CREATE INDEX "verificacao_entrega_alocacao_id_idx" ON "verificacao_entrega"("alocacao_id");

-- CreateIndex
CREATE INDEX "verificacao_entrega_inspecao_id_idx" ON "verificacao_entrega"("inspecao_id");

-- CreateIndex
CREATE INDEX "foto_ativo_inspecao_id_idx" ON "foto_ativo"("inspecao_id");

-- AddForeignKey
ALTER TABLE "foto_ativo" ADD CONSTRAINT "foto_ativo_inspecao_id_fkey" FOREIGN KEY ("inspecao_id") REFERENCES "inspecao_tecnica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_ativo" ADD CONSTRAINT "foto_ativo_resposta_id_fkey" FOREIGN KEY ("resposta_id") REFERENCES "resposta_inspecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_questionario_id_fkey" FOREIGN KEY ("questionario_id") REFERENCES "questionario_inspecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_devolucao_id_fkey" FOREIGN KEY ("devolucao_id") REFERENCES "devolucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_inspecao" ADD CONSTRAINT "resposta_inspecao_inspecao_id_fkey" FOREIGN KEY ("inspecao_id") REFERENCES "inspecao_tecnica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacao_entrega" ADD CONSTRAINT "verificacao_entrega_item_alocacao_id_fkey" FOREIGN KEY ("item_alocacao_id") REFERENCES "item_alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacao_entrega" ADD CONSTRAINT "verificacao_entrega_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacao_entrega" ADD CONSTRAINT "verificacao_entrega_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacao_entrega" ADD CONSTRAINT "verificacao_entrega_inspecao_id_fkey" FOREIGN KEY ("inspecao_id") REFERENCES "inspecao_tecnica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Coerencia da inspecao: pendente aguarda a TI; concluida tem questionario, resultado e responsavel.
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_estado_coerente" CHECK (
  ("estado" = 'PENDENTE' AND "pendente" IS TRUE AND "concluida_em" IS NULL AND "cancelada_em" IS NULL)
  OR ("estado" = 'CONCLUIDA' AND "pendente" IS NULL AND "concluida_em" IS NOT NULL AND "numero" IS NOT NULL
      AND "questionario_id" IS NOT NULL AND "resultado" IS NOT NULL AND "categoria" IS NOT NULL
      AND "responsavel_nome" IS NOT NULL AND length(btrim("responsavel_nome")) > 0)
  OR ("estado" = 'CANCELADA' AND "pendente" IS NULL AND "cancelada_em" IS NOT NULL
      AND "motivo_cancelamento" IS NOT NULL AND length(btrim("motivo_cancelamento")) > 0)
);
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_entrada_com_condicao" CHECK (
  "estado" <> 'CONCLUIDA' OR "tipo" <> 'ENTRADA' OR "condicao_entrada" IS NOT NULL
);

-- Justificativa obrigatoria: nao conforme, nao testado e "nao se aplica" de verificacao obrigatoria.
ALTER TABLE "resposta_inspecao" ADD CONSTRAINT "resposta_inspecao_justificada" CHECK (
  ("resposta" NOT IN ('NAO_CONFORME', 'NAO_TESTADO') OR length(btrim(coalesce("justificativa", ''))) > 0)
  AND ("resposta" <> 'NAO_SE_APLICA' OR NOT "obrigatoria" OR length(btrim(coalesce("justificativa", ''))) > 0)
);

-- Questionario: cada versao e somente insercao.
CREATE FUNCTION "questionario_inspecao_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A versao de um questionario de inspecao nao pode ser alterada nem excluida.';
END;
$$;
CREATE TRIGGER "questionario_inspecao_imutavel"
  BEFORE UPDATE OR DELETE ON "questionario_inspecao"
  FOR EACH ROW EXECUTE FUNCTION "questionario_inspecao_imutavel"();

-- Inspecao: nunca excluida; so a pendente muda (concluir ou cancelar).
CREATE FUNCTION "inspecao_tecnica_preservada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."estado" <> 'PENDENTE' THEN
    RAISE EXCEPTION 'O historico de inspecoes nao pode ser alterado nem excluido.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "inspecao_tecnica_preservada"
  BEFORE UPDATE OR DELETE ON "inspecao_tecnica"
  FOR EACH ROW EXECUTE FUNCTION "inspecao_tecnica_preservada"();

-- Respostas: somente insercao.
CREATE FUNCTION "resposta_inspecao_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'As respostas de uma inspecao nao podem ser alteradas nem excluidas.';
END;
$$;
CREATE TRIGGER "resposta_inspecao_somente_insercao"
  BEFORE UPDATE OR DELETE ON "resposta_inspecao"
  FOR EACH ROW EXECUTE FUNCTION "resposta_inspecao_somente_insercao"();

-- Verificacao da entrega (instantaneo do TER): somente insercao.
CREATE FUNCTION "verificacao_entrega_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A verificacao registrada na entrega nao pode ser alterada nem excluida.';
END;
$$;
CREATE TRIGGER "verificacao_entrega_imutavel"
  BEFORE UPDATE OR DELETE ON "verificacao_entrega"
  FOR EACH ROW EXECUTE FUNCTION "verificacao_entrega_imutavel"();
