-- CreateEnum
CREATE TYPE "CategoriaAtivo" AS ENUM ('NOTEBOOK', 'DESKTOP', 'MONITOR', 'CELULAR', 'IMPRESSORA', 'CARREGADOR', 'TECLADO', 'MOUSE', 'KIT_TECLADO_MOUSE', 'HEADSET', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoAtivo" AS ENUM ('DISPONIVEL', 'RESERVADO', 'ALOCADO', 'MANUTENCAO', 'DEVOLVIDO_EM_AVALIACAO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "MotivoDesvinculoCarregador" AS ENUM ('TROCA', 'PERDA', 'DEFEITO');

-- CreateEnum
CREATE TYPE "TipoFoto" AS ENUM ('FRONTAL', 'TELA', 'TECLADO', 'LATERAIS', 'INFERIOR', 'ETIQUETA_SERIE', 'CARREGADOR', 'OUTRA');

-- CreateEnum
CREATE TYPE "ContextoFoto" AS ENUM ('CADASTRO', 'MANUTENCAO', 'CONCLUSAO_MANUTENCAO', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('CADASTRO', 'EDICAO', 'TRANSFERENCIA_EMPRESA', 'RESERVA', 'CANCELAMENTO_RESERVA', 'ENTREGA', 'DEVOLUCAO', 'ENVIO_MANUTENCAO', 'CONCLUSAO_MANUTENCAO', 'LIBERACAO_AVALIACAO', 'CARREGADOR_VINCULADO', 'CARREGADOR_DESVINCULADO');

-- CreateEnum
CREATE TYPE "EstadoAlocacao" AS ENUM ('RESERVADA', 'ATIVA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MotivoEncerramentoItem" AS ENUM ('DEVOLUCAO', 'MANUTENCAO', 'CANCELAMENTO', 'SUBSTITUICAO');

-- CreateEnum
CREATE TYPE "AbrangenciaDevolucao" AS ENUM ('TOTAL', 'PARCIAL');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('EXCELENTE', 'BOM', 'REGULAR', 'DANIFICADO');

-- CreateEnum
CREATE TYPE "DestinoDevolucao" AS ENUM ('AVALIACAO', 'MANUTENCAO');

-- CreateEnum
CREATE TYPE "ResultadoManutencao" AS ENUM ('REPARADO', 'SEM_REPARO');

-- CreateEnum
CREATE TYPE "TipoTermo" AS ENUM ('TER', 'TDV');

-- CreateEnum
CREATE TYPE "EstadoTermo" AS ENUM ('RASCUNHO', 'EMITIDO', 'AGUARDANDO_ASSINATURA', 'ASSINADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "ativo" (
    "id" TEXT NOT NULL,
    "categoria" "CategoriaAtivo" NOT NULL,
    "nome_dispositivo" TEXT,
    "patrimonio" TEXT,
    "empresa_id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "numero_serie" TEXT,
    "processador" TEXT,
    "memoria_ram" TEXT,
    "armazenamento" TEXT,
    "sistema_operacional" TEXT,
    "data_aquisicao" DATE,
    "garantia_ate" DATE,
    "observacoes" TEXT,
    "situacao" "SituacaoAtivo" NOT NULL DEFAULT 'DISPONIVEL',
    "situacao_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notebook_id" TEXT,
    "sequencia_carregador" INTEGER,
    "desvinculado_em" TIMESTAMP(3),
    "motivo_desvinculo" "MotivoDesvinculoCarregador",
    "chave_requisicao" TEXT,
    "criado_por_nome" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foto_ativo" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "contexto" "ContextoFoto" NOT NULL,
    "tipo" "TipoFoto" NOT NULL,
    "chave" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "manutencao_id" TEXT,
    "item_devolucao_id" TEXT,
    "enviada_por_nome" TEXT NOT NULL,
    "enviada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacao_ativo" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "situacao_anterior" "SituacaoAtivo",
    "situacao_nova" "SituacaoAtivo",
    "colaborador_id" TEXT,
    "colaborador_nome" TEXT,
    "alocacao_id" TEXT,
    "manutencao_id" TEXT,
    "devolucao_id" TEXT,
    "realizado_por_conta_id" TEXT,
    "realizado_por_nome" TEXT NOT NULL,
    "realizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "movimentacao_ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alocacao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "empresa_colaborador_id" TEXT NOT NULL,
    "estado" "EstadoAlocacao" NOT NULL,
    "prevista_para" DATE,
    "entregue_em" TIMESTAMP(3),
    "entregue_por_nome" TEXT,
    "observacoes" TEXT,
    "chave_requisicao" TEXT,
    "criada_por_nome" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelada_em" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,

    CONSTRAINT "alocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_alocacao" (
    "id" TEXT NOT NULL,
    "alocacao_id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "empresa_proprietaria_id" TEXT NOT NULL,
    "aberto" BOOLEAN DEFAULT true,
    "encerrado_em" TIMESTAMP(3),
    "motivo_encerramento" "MotivoEncerramentoItem",
    "encerrado_por_nome" TEXT,
    "manutencao_id" TEXT,

    CONSTRAINT "item_alocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "alocacao_id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "abrangencia" "AbrangenciaDevolucao" NOT NULL,
    "recebida_em" TIMESTAMP(3) NOT NULL,
    "recebida_por_nome" TEXT NOT NULL,
    "observacoes" TEXT,
    "chave_requisicao" TEXT,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_devolucao" (
    "id" TEXT NOT NULL,
    "devolucao_id" TEXT NOT NULL,
    "item_alocacao_id" TEXT NOT NULL,
    "estado_fisico" "EstadoFisico" NOT NULL,
    "destino" "DestinoDevolucao" NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "item_devolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manutencao" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "aberta" BOOLEAN DEFAULT true,
    "motivo" TEXT NOT NULL,
    "observacoes" TEXT NOT NULL,
    "aberta_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aberta_por_nome" TEXT NOT NULL,
    "recolhido_de_id" TEXT,
    "recolhido_de_nome" TEXT,
    "recolhimento_confirmado_em" TIMESTAMP(3),
    "devolucao_id" TEXT,
    "concluida_em" TIMESTAMP(3),
    "concluida_por_nome" TEXT,
    "servico_realizado" TEXT,
    "resultado" "ResultadoManutencao",

    CONSTRAINT "manutencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termo" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoTermo" NOT NULL,
    "alocacao_id" TEXT,
    "devolucao_id" TEXT,
    "colaborador_id" TEXT NOT NULL,
    "estado" "EstadoTermo" NOT NULL,
    "versao_modelo" TEXT,
    "emitido_em" TIMESTAMP(3),
    "arquivo_assinado_chave" TEXT,
    "sha256_assinado" TEXT,
    "assinado_registrado_em" TIMESTAMP(3),
    "assinado_registrado_por_nome" TEXT,
    "disponivel_ao_colaborador" BOOLEAN NOT NULL DEFAULT false,
    "cancelado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_documento" (
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,

    CONSTRAINT "contador_documento_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "ativo_nome_dispositivo_key" ON "ativo"("nome_dispositivo");

-- CreateIndex
CREATE UNIQUE INDEX "ativo_patrimonio_key" ON "ativo"("patrimonio");

-- CreateIndex
CREATE UNIQUE INDEX "ativo_numero_serie_key" ON "ativo"("numero_serie");

-- CreateIndex
CREATE UNIQUE INDEX "ativo_chave_requisicao_key" ON "ativo"("chave_requisicao");

-- CreateIndex
CREATE INDEX "ativo_empresa_id_idx" ON "ativo"("empresa_id");

-- CreateIndex
CREATE INDEX "ativo_situacao_idx" ON "ativo"("situacao");

-- CreateIndex
CREATE INDEX "ativo_categoria_idx" ON "ativo"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ativo_notebook_id_sequencia_carregador_key" ON "ativo"("notebook_id", "sequencia_carregador");

-- CreateIndex
CREATE UNIQUE INDEX "foto_ativo_chave_key" ON "foto_ativo"("chave");

-- CreateIndex
CREATE INDEX "foto_ativo_ativo_id_idx" ON "foto_ativo"("ativo_id");

-- CreateIndex
CREATE INDEX "movimentacao_ativo_ativo_id_realizado_em_idx" ON "movimentacao_ativo"("ativo_id", "realizado_em");

-- CreateIndex
CREATE UNIQUE INDEX "alocacao_numero_key" ON "alocacao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "alocacao_chave_requisicao_key" ON "alocacao"("chave_requisicao");

-- CreateIndex
CREATE INDEX "alocacao_colaborador_id_idx" ON "alocacao"("colaborador_id");

-- CreateIndex
CREATE INDEX "alocacao_estado_idx" ON "alocacao"("estado");

-- CreateIndex
CREATE INDEX "alocacao_empresa_colaborador_id_idx" ON "alocacao"("empresa_colaborador_id");

-- CreateIndex
CREATE INDEX "item_alocacao_alocacao_id_idx" ON "item_alocacao"("alocacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_alocacao_ativo_id_aberto_key" ON "item_alocacao"("ativo_id", "aberto");

-- CreateIndex
CREATE UNIQUE INDEX "devolucao_numero_key" ON "devolucao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "devolucao_chave_requisicao_key" ON "devolucao"("chave_requisicao");

-- CreateIndex
CREATE INDEX "devolucao_alocacao_id_idx" ON "devolucao"("alocacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_devolucao_item_alocacao_id_key" ON "item_devolucao"("item_alocacao_id");

-- CreateIndex
CREATE INDEX "manutencao_aberta_em_idx" ON "manutencao"("aberta_em");

-- CreateIndex
CREATE UNIQUE INDEX "manutencao_ativo_id_aberta_key" ON "manutencao"("ativo_id", "aberta");

-- CreateIndex
CREATE UNIQUE INDEX "termo_numero_key" ON "termo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "termo_arquivo_assinado_chave_key" ON "termo"("arquivo_assinado_chave");

-- CreateIndex
CREATE INDEX "termo_alocacao_id_idx" ON "termo"("alocacao_id");

-- CreateIndex
CREATE INDEX "termo_devolucao_id_idx" ON "termo"("devolucao_id");

-- CreateIndex
CREATE INDEX "termo_colaborador_id_idx" ON "termo"("colaborador_id");

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "ativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_ativo" ADD CONSTRAINT "foto_ativo_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_ativo" ADD CONSTRAINT "foto_ativo_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_ativo" ADD CONSTRAINT "foto_ativo_item_devolucao_id_fkey" FOREIGN KEY ("item_devolucao_id") REFERENCES "item_devolucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_ativo" ADD CONSTRAINT "movimentacao_ativo_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_empresa_colaborador_id_fkey" FOREIGN KEY ("empresa_colaborador_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_alocacao" ADD CONSTRAINT "item_alocacao_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_alocacao" ADD CONSTRAINT "item_alocacao_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_alocacao" ADD CONSTRAINT "item_alocacao_empresa_proprietaria_id_fkey" FOREIGN KEY ("empresa_proprietaria_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucao" ADD CONSTRAINT "devolucao_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucao" ADD CONSTRAINT "devolucao_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_devolucao" ADD CONSTRAINT "item_devolucao_devolucao_id_fkey" FOREIGN KEY ("devolucao_id") REFERENCES "devolucao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_devolucao" ADD CONSTRAINT "item_devolucao_item_alocacao_id_fkey" FOREIGN KEY ("item_alocacao_id") REFERENCES "item_alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_ativo_id_fkey" FOREIGN KEY ("ativo_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_devolucao_id_fkey" FOREIGN KEY ("devolucao_id") REFERENCES "devolucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras que o Prisma não expressa: verificadas pelo próprio banco.
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_patrimonio_obrigatorio" CHECK ("categoria" = 'CARREGADOR' OR "patrimonio" IS NOT NULL);
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_notebook_com_nome" CHECK ("categoria" <> 'NOTEBOOK' OR "nome_dispositivo" IS NOT NULL);
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_carregador_vinculo" CHECK (
  ("notebook_id" IS NULL) = ("sequencia_carregador" IS NULL)
  AND ("notebook_id" IS NULL OR ("categoria" = 'CARREGADOR' AND "sequencia_carregador" >= 1))
);
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_identificadores_maiusculos" CHECK (
  "patrimonio" = upper("patrimonio") AND "nome_dispositivo" = upper("nome_dispositivo") AND "numero_serie" = upper("numero_serie")
);
ALTER TABLE "item_alocacao" ADD CONSTRAINT "item_alocacao_aberto_coerente" CHECK (
  ("aberto" IS TRUE AND "encerrado_em" IS NULL AND "motivo_encerramento" IS NULL)
  OR ("aberto" IS NULL AND "encerrado_em" IS NOT NULL AND "motivo_encerramento" IS NOT NULL)
);
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_aberta_coerente" CHECK (
  ("aberta" IS TRUE AND "concluida_em" IS NULL)
  OR ("aberta" IS NULL AND "concluida_em" IS NOT NULL AND "resultado" IS NOT NULL)
);
ALTER TABLE "alocacao" ADD CONSTRAINT "alocacao_entrega_registrada" CHECK ("estado" IN ('RESERVADA', 'CANCELADA') OR "entregue_em" IS NOT NULL);
-- Documento só fica "assinado" com o PDF assinado guardado.
ALTER TABLE "termo" ADD CONSTRAINT "termo_assinado_com_pdf" CHECK ("estado" <> 'ASSINADO' OR ("arquivo_assinado_chave" IS NOT NULL AND "sha256_assinado" IS NOT NULL));
ALTER TABLE "termo" ADD CONSTRAINT "termo_vinculo_por_tipo" CHECK (
  ("tipo" = 'TER' AND "alocacao_id" IS NOT NULL AND "devolucao_id" IS NULL) OR ("tipo" = 'TDV' AND "devolucao_id" IS NOT NULL)
);
ALTER TABLE "contador_documento" ADD CONSTRAINT "contador_documento_valor_positivo" CHECK ("valor" >= 0);

-- Histórico de movimentações: somente inserção.
CREATE FUNCTION "movimentacao_ativo_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de movimentações não pode ser alterado nem excluído.';
END;
$$;
CREATE TRIGGER "movimentacao_ativo_somente_insercao"
  BEFORE UPDATE OR DELETE ON "movimentacao_ativo"
  FOR EACH ROW EXECUTE FUNCTION "movimentacao_ativo_somente_insercao"();
