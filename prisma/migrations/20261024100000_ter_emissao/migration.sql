-- CreateEnum
CREATE TYPE "TipoEventoEntrega" AS ENUM ('NOVA_ALOCACAO', 'CONFIRMACAO_RESERVA', 'TRANSFERENCIA', 'ENTREGA_ADICIONAL');

-- CreateEnum
CREATE TYPE "EstadoDocumentoTer" AS ENUM ('GERANDO', 'ERRO_GERACAO', 'EMITIDO', 'CANCELADO', 'SUBSTITUIDO');

-- CreateEnum
CREATE TYPE "EstadoAssinaturaTer" AS ENUM ('AGUARDANDO_ENVIO', 'AGUARDANDO_ASSINATURA', 'ARQUIVO_RECEBIDO', 'ASSINADO_CONFERIDO', 'ASSINATURA_RECUSADA', 'VALIDACAO_INDETERMINADA');

-- CreateEnum
CREATE TYPE "ResultadoConferencia" AS ENUM ('CONFORME', 'NAO_CONFORME', 'INDETERMINADO');

-- AlterTable
ALTER TABLE "colaborador" ADD COLUMN     "cpf_cifrado" BYTEA,
ADD COLUMN     "cpf_final" TEXT,
ADD COLUMN     "cpf_hmac" TEXT;

-- AlterTable
ALTER TABLE "inspecao_tecnica" ADD COLUMN     "perguntas_sem_resposta" JSONB;

-- AlterTable
ALTER TABLE "termo" ADD COLUMN     "cancelado_por_nome" TEXT,
ADD COLUMN     "empresa_id" TEXT,
ADD COLUMN     "estado_assinatura" "EstadoAssinaturaTer",
ADD COLUMN     "estado_documento" "EstadoDocumentoTer",
ADD COLUMN     "evento_entrega_id" TEXT,
ADD COLUMN     "motivo_cancelamento" TEXT,
ADD COLUMN     "versao_vigente" INTEGER;

-- AlterTable
ALTER TABLE "verificacao_entrega" ADD COLUMN     "evento_entrega_id" TEXT;

-- CreateTable
CREATE TABLE "evento_entrega" (
    "id" TEXT NOT NULL,
    "alocacao_id" TEXT NOT NULL,
    "tipo" "TipoEventoEntrega" NOT NULL,
    "entregue_em" TIMESTAMP(3) NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "empresa_colaborador_id" TEXT NOT NULL,
    "responsavel_ti_nome" TEXT NOT NULL,
    "registrado_por_conta_id" TEXT,
    "registrado_por_nome" TEXT NOT NULL,
    "itens" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versao_ter" (
    "id" TEXT NOT NULL,
    "termo_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "estado" "EstadoDocumentoTer" NOT NULL,
    "motivo" TEXT NOT NULL,
    "dados" JSONB,
    "modelo_codigo" TEXT NOT NULL,
    "modelo_revisao" TEXT NOT NULL,
    "arquivo_chave" TEXT,
    "sha256" TEXT,
    "tamanho" INTEGER,
    "paginas" INTEGER,
    "nome_arquivo" TEXT,
    "erro" TEXT,
    "pendencias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT NOT NULL,
    "emitida_em" TIMESTAMP(3),
    "emitida_por_nome" TEXT,

    CONSTRAINT "versao_ter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio_ter" (
    "id" TEXT NOT NULL,
    "termo_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "reenvio" BOOLEAN NOT NULL,
    "canal" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "observacao" TEXT,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por_conta_id" TEXT,
    "registrado_por_nome" TEXT NOT NULL,

    CONSTRAINT "envio_ter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_assinado_ter" (
    "id" TEXT NOT NULL,
    "termo_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_por_conta_id" TEXT,
    "enviado_por_nome" TEXT NOT NULL,

    CONSTRAINT "arquivo_assinado_ter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conferencia_ter" (
    "id" TEXT NOT NULL,
    "termo_id" TEXT NOT NULL,
    "arquivo_id" TEXT NOT NULL,
    "resultado" "ResultadoConferencia" NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "signatario" TEXT,
    "confere_colaborador" BOOLEAN NOT NULL,
    "confere_documento" BOOLEAN NOT NULL,
    "assinatura_ti_verificada" BOOLEAN,
    "relatorio_chave" TEXT,
    "observacoes" TEXT,
    "motivo" TEXT,
    "conferida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conferida_por_conta_id" TEXT,
    "conferida_por_nome" TEXT NOT NULL,

    CONSTRAINT "conferencia_ter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_ter" (
    "id" TEXT NOT NULL,
    "termo_id" TEXT NOT NULL,
    "versao" INTEGER,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "responsavel_conta_id" TEXT,
    "responsavel_nome" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_ter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_documento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTermo" NOT NULL,
    "codigo" TEXT NOT NULL,
    "revisao" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "declaracoes" JSONB NOT NULL,
    "exige_assinatura_ti" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelo_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_entrega_alocacao_id_idx" ON "evento_entrega"("alocacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "versao_ter_arquivo_chave_key" ON "versao_ter"("arquivo_chave");

-- CreateIndex
CREATE UNIQUE INDEX "versao_ter_termo_id_versao_key" ON "versao_ter"("termo_id", "versao");

-- CreateIndex
CREATE INDEX "envio_ter_termo_id_idx" ON "envio_ter"("termo_id");

-- CreateIndex
CREATE UNIQUE INDEX "arquivo_assinado_ter_chave_key" ON "arquivo_assinado_ter"("chave");

-- CreateIndex
CREATE INDEX "arquivo_assinado_ter_termo_id_idx" ON "arquivo_assinado_ter"("termo_id");

-- CreateIndex
CREATE UNIQUE INDEX "conferencia_ter_relatorio_chave_key" ON "conferencia_ter"("relatorio_chave");

-- CreateIndex
CREATE INDEX "conferencia_ter_termo_id_idx" ON "conferencia_ter"("termo_id");

-- CreateIndex
CREATE INDEX "historico_ter_termo_id_em_idx" ON "historico_ter"("termo_id", "em");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_documento_tipo_codigo_revisao_key" ON "modelo_documento"("tipo", "codigo", "revisao");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_cpf_hmac_key" ON "colaborador"("cpf_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "termo_evento_entrega_id_key" ON "termo"("evento_entrega_id");

-- CreateIndex
CREATE INDEX "termo_empresa_id_idx" ON "termo"("empresa_id");

-- CreateIndex
CREATE INDEX "verificacao_entrega_evento_entrega_id_idx" ON "verificacao_entrega"("evento_entrega_id");

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_evento_entrega_id_fkey" FOREIGN KEY ("evento_entrega_id") REFERENCES "evento_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacao_entrega" ADD CONSTRAINT "verificacao_entrega_evento_entrega_id_fkey" FOREIGN KEY ("evento_entrega_id") REFERENCES "evento_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_entrega" ADD CONSTRAINT "evento_entrega_alocacao_id_fkey" FOREIGN KEY ("alocacao_id") REFERENCES "alocacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versao_ter" ADD CONSTRAINT "versao_ter_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_ter" ADD CONSTRAINT "envio_ter_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivo_assinado_ter" ADD CONSTRAINT "arquivo_assinado_ter_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conferencia_ter" ADD CONSTRAINT "conferencia_ter_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conferencia_ter" ADD CONSTRAINT "conferencia_ter_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "arquivo_assinado_ter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_ter" ADD CONSTRAINT "historico_ter_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TER emitido: versao emitida tem arquivo, hash e data; conferencia "conforme" exige as
-- verificacoes marcadas; "nao conforme" e "indeterminado" exigem motivo; cancelamento exige motivo e data.
ALTER TABLE "versao_ter" ADD CONSTRAINT "versao_ter_emitida_com_arquivo" CHECK (
  "estado" NOT IN ('EMITIDO', 'SUBSTITUIDO') OR ("arquivo_chave" IS NOT NULL AND "sha256" IS NOT NULL AND "emitida_em" IS NOT NULL)
);
ALTER TABLE "versao_ter" ADD CONSTRAINT "versao_ter_numero_positivo" CHECK ("versao" > 0);
ALTER TABLE "conferencia_ter" ADD CONSTRAINT "conferencia_ter_coerente" CHECK (
  ("resultado" <> 'CONFORME' OR ("confere_colaborador" AND "confere_documento" AND "assinatura_ti_verificada" IS NOT FALSE))
  AND ("resultado" = 'CONFORME' OR length(btrim(coalesce("motivo", ''))) > 0)
);
ALTER TABLE "termo" ADD CONSTRAINT "termo_cancelado_com_motivo" CHECK (
  coalesce("estado_documento"::text, '') <> 'CANCELADO' OR ("cancelado_em" IS NOT NULL AND length(btrim(coalesce("motivo_cancelamento", ''))) > 0)
);

-- Evento de entrega: registro historico, nunca alterado nem excluido.
CREATE FUNCTION "evento_entrega_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O evento de entrega registrado nao pode ser alterado nem excluido.';
END;
$$;
CREATE TRIGGER "evento_entrega_imutavel"
  BEFORE UPDATE OR DELETE ON "evento_entrega"
  FOR EACH ROW EXECUTE FUNCTION "evento_entrega_imutavel"();

-- Versao do TER: nunca excluida. Enquanto gera (ou falhou) pode ser concluida; emitida, so
-- muda a situacao para substituida ou cancelada, sem tocar no conteudo nem no arquivo.
CREATE FUNCTION "versao_ter_preservada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A versao de um TER nao pode ser excluida.';
  END IF;
  IF OLD."estado" IN ('GERANDO', 'ERRO_GERACAO') THEN
    RETURN NEW;
  END IF;
  IF OLD."estado" = 'EMITIDO' AND NEW."estado" IN ('SUBSTITUIDO', 'CANCELADO')
    AND (NEW."termo_id", NEW."versao", NEW."motivo", NEW."dados", NEW."modelo_codigo", NEW."modelo_revisao", NEW."arquivo_chave",
         NEW."sha256", NEW."tamanho", NEW."paginas", NEW."nome_arquivo", NEW."emitida_em", NEW."emitida_por_nome", NEW."criada_em")
      IS NOT DISTINCT FROM
        (OLD."termo_id", OLD."versao", OLD."motivo", OLD."dados", OLD."modelo_codigo", OLD."modelo_revisao", OLD."arquivo_chave",
         OLD."sha256", OLD."tamanho", OLD."paginas", OLD."nome_arquivo", OLD."emitida_em", OLD."emitida_por_nome", OLD."criada_em") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A versao emitida de um TER nao pode ser alterada.';
END;
$$;
CREATE TRIGGER "versao_ter_preservada"
  BEFORE UPDATE OR DELETE ON "versao_ter"
  FOR EACH ROW EXECUTE FUNCTION "versao_ter_preservada"();

-- Encaminhamentos, arquivos assinados, conferencias e historico: somente insercao.
CREATE FUNCTION "registro_ter_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Os registros do TER (envios, arquivos assinados, conferencias e historico) nao podem ser alterados nem excluidos.';
END;
$$;
CREATE TRIGGER "envio_ter_somente_insercao"
  BEFORE UPDATE OR DELETE ON "envio_ter"
  FOR EACH ROW EXECUTE FUNCTION "registro_ter_somente_insercao"();
CREATE TRIGGER "arquivo_assinado_ter_somente_insercao"
  BEFORE UPDATE OR DELETE ON "arquivo_assinado_ter"
  FOR EACH ROW EXECUTE FUNCTION "registro_ter_somente_insercao"();
CREATE TRIGGER "conferencia_ter_somente_insercao"
  BEFORE UPDATE OR DELETE ON "conferencia_ter"
  FOR EACH ROW EXECUTE FUNCTION "registro_ter_somente_insercao"();
CREATE TRIGGER "historico_ter_somente_insercao"
  BEFORE UPDATE OR DELETE ON "historico_ter"
  FOR EACH ROW EXECUTE FUNCTION "registro_ter_somente_insercao"();

-- TER emitido pelo portal nunca e excluido (o cancelamento o preserva).
CREATE FUNCTION "termo_emitido_preservado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."evento_entrega_id" IS NOT NULL THEN
    RAISE EXCEPTION 'O TER nao pode ser excluido; cancele-o com justificativa.';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "termo_emitido_preservado"
  BEFORE DELETE ON "termo"
  FOR EACH ROW EXECUTE FUNCTION "termo_emitido_preservado"();

-- Modelo documental aprovado: FORM-TI-TR-001, revisao 22 (texto juridico do modelo vigente).
INSERT INTO "modelo_documento" ("id", "tipo", "codigo", "revisao", "titulo", "declaracoes", "exige_assinatura_ti", "ativo")
VALUES (gen_random_uuid()::text, 'TER', 'FORM-TI-TR-001', '22', 'TERMO DE ENTREGA, GUARDA E RESPONSABILIDADE', '["Declaro ter recebido, na data indicada neste documento, os bens relacionados no quadro-resumo e individualizados em seus anexos, juntamente com os acessórios registrados, nas condições de funcionamento e conservação descritas no checklist e nas evidências fotográficas.", "Comprometo-me a utilizar os bens exclusivamente para as atividades profissionais e finalidades autorizadas pela empresa; zelar por sua guarda, conservação e uso adequado; não os ceder, emprestar, transferir ou permitir sua utilização por terceiros sem autorização; e observar as políticas internas de tecnologia, segurança da informação, confidencialidade, proteção de dados e uso aceitável dos recursos corporativos.", "Comprometo-me a comunicar imediatamente à empresa qualquer perda, extravio, furto, roubo, dano, defeito, falha, acesso indevido ou incidente que possa comprometer o equipamento, seus acessórios ou as informações nele armazenadas, bem como a devolvê-los sempre que solicitado, inclusive em caso de substituição, afastamento, mudança de função ou local de trabalho ou encerramento do vínculo, mediante Termo de Devolução e Vistoria próprio.", "Eventuais danos, perdas, extravios ou faltas de acessórios serão objeto de registro, análise técnica e apuração específica, com oportunidade para apresentação de esclarecimentos pelo colaborador, considerando-se o estado inicial documentado, o desgaste natural, a vida útil, os defeitos ou avarias preexistentes, os vícios ocultos, as falhas técnicas não provocadas pelo usuário, o caso fortuito, a força maior e as demais circunstâncias aplicáveis.", "Fica preservado o direito da empresa de buscar, pelas vias próprias, o ressarcimento dos prejuízos comprovadamente decorrentes de ação ou omissão dolosa ou culposa do colaborador na guarda, conservação ou utilização dos bens, desde que demonstrados o dano efetivo e o nexo causal. Eventual desconto em folha somente será realizado nas hipóteses e condições admitidas pelo artigo 462, § 1º, da Consolidação das Leis do Trabalho, não decorrendo automaticamente da assinatura deste termo.", "Este termo não constitui, por si só, confissão de dívida nem autoriza cobrança ou desconto automático. O colaborador compromete-se, ainda, a preservar credenciais de acesso, não compartilhar senhas, não desabilitar controles de segurança e não instalar programas ou realizar alterações não autorizadas.", "As partes reconhecem como válido o uso de assinatura eletrônica, desde que o método adotado permita verificar a autoria, a integridade, a data e a hora da assinatura."]'::jsonb, false, true);
