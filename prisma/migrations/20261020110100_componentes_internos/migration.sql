-- AlterTable
ALTER TABLE "ativo" ADD COLUMN     "capacidade_gb" INTEGER,
ADD COLUMN     "formato" TEXT,
ADD COLUMN     "frequencia_mhz" INTEGER,
ADD COLUMN     "interface_conexao" TEXT,
ADD COLUMN     "tecnologia" TEXT;

-- CreateTable
CREATE TABLE "intervencao_configuracao" (
    "id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "tipo" "TipoIntervencao" NOT NULL,
    "motivo" TEXT,
    "configuracao_anterior" TEXT,
    "configuracao_resultante" TEXT NOT NULL,
    "colaborador_nome" TEXT,
    "alocacao_numero" TEXT,
    "realizada_em" TIMESTAMP(3) NOT NULL,
    "realizada_por_conta_id" TEXT,
    "realizada_por_nome" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chave_requisicao" TEXT,

    CONSTRAINT "intervencao_configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peca_configuracao" (
    "id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "tipo" "TipoComponente" NOT NULL,
    "componente_id" TEXT,
    "original" BOOLEAN NOT NULL DEFAULT false,
    "capacidade_gb" INTEGER NOT NULL,
    "tecnologia" TEXT,
    "interface_conexao" TEXT,
    "formato" TEXT,
    "vigente" BOOLEAN DEFAULT true,
    "instalada_em" TIMESTAMP(3) NOT NULL,
    "instalada_por_nome" TEXT NOT NULL,
    "instalada_na_id" TEXT NOT NULL,
    "removida_em" TIMESTAMP(3),
    "removida_por_nome" TEXT,
    "removida_na_id" TEXT,
    "motivo_remocao" TEXT,
    "destino_remocao" "SituacaoAtivo",

    CONSTRAINT "peca_configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intervencao_configuracao_chave_requisicao_key" ON "intervencao_configuracao"("chave_requisicao");

-- CreateIndex
CREATE INDEX "intervencao_configuracao_equipamento_id_realizada_em_idx" ON "intervencao_configuracao"("equipamento_id", "realizada_em");

-- CreateIndex
CREATE INDEX "peca_configuracao_equipamento_id_vigente_idx" ON "peca_configuracao"("equipamento_id", "vigente");

-- CreateIndex
CREATE UNIQUE INDEX "peca_configuracao_componente_id_vigente_key" ON "peca_configuracao"("componente_id", "vigente");

-- AddForeignKey
ALTER TABLE "intervencao_configuracao" ADD CONSTRAINT "intervencao_configuracao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_componente_id_fkey" FOREIGN KEY ("componente_id") REFERENCES "ativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_instalada_na_id_fkey" FOREIGN KEY ("instalada_na_id") REFERENCES "intervencao_configuracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_removida_na_id_fkey" FOREIGN KEY ("removida_na_id") REFERENCES "intervencao_configuracao"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Componente (RAM, SSD, HD) não tem patrimônio obrigatório: é identificado pela sequência (RAM001...).
ALTER TABLE "ativo" DROP CONSTRAINT "ativo_patrimonio_obrigatorio";
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_patrimonio_obrigatorio" CHECK ("categoria" IN ('CARREGADOR', 'MEMORIA_RAM', 'SSD', 'HD') OR "patrimonio" IS NOT NULL);
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_componente_identificado" CHECK (
  "categoria" NOT IN ('MEMORIA_RAM', 'SSD', 'HD') OR ("nome_dispositivo" IS NOT NULL AND "capacidade_gb" > 0)
);
-- "Instalado" é situação exclusiva de componente.
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_instalado_somente_componente" CHECK ("situacao" <> 'INSTALADO' OR "categoria" IN ('MEMORIA_RAM', 'SSD', 'HD'));
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_capacidade_positiva" CHECK ("capacidade_gb" IS NULL OR "capacidade_gb" > 0);
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_frequencia_positiva" CHECK ("frequencia_mhz" IS NULL OR "frequencia_mhz" > 0);

-- Peça vigente não tem remoção; peça removida tem data e intervenção.
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_vigencia_coerente" CHECK (
  ("vigente" IS TRUE AND "removida_em" IS NULL AND "removida_na_id" IS NULL)
  OR ("vigente" IS NULL AND "removida_em" IS NOT NULL AND "removida_na_id" IS NOT NULL)
);
ALTER TABLE "peca_configuracao" ADD CONSTRAINT "peca_configuracao_capacidade_positiva" CHECK ("capacidade_gb" > 0);

-- RAM, SSD e HD nunca são alocados a pessoas: o colaborador recebe o notebook completo.
CREATE FUNCTION "item_alocacao_sem_componente"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ativo" WHERE "id" = NEW."ativo_id" AND "categoria" IN ('MEMORIA_RAM', 'SSD', 'HD')) THEN
    RAISE EXCEPTION 'Componentes internos (RAM, SSD, HD) não são alocados a pessoas.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "item_alocacao_sem_componente"
  BEFORE INSERT OR UPDATE OF "ativo_id" ON "item_alocacao"
  FOR EACH ROW EXECUTE FUNCTION "item_alocacao_sem_componente"();

-- Histórico de intervenções: somente inserção.
CREATE FUNCTION "intervencao_configuracao_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de configurações não pode ser alterado nem excluído.';
END;
$$;
CREATE TRIGGER "intervencao_configuracao_somente_insercao"
  BEFORE UPDATE OR DELETE ON "intervencao_configuracao"
  FOR EACH ROW EXECUTE FUNCTION "intervencao_configuracao_somente_insercao"();

-- Peças: nunca excluídas; a única mudança é a remoção da peça vigente (e a identificação da
-- peça original que entra no estoque nesse momento).
CREATE FUNCTION "peca_configuracao_preservada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."vigente" IS NULL
     OR NEW."equipamento_id" <> OLD."equipamento_id" OR NEW."tipo" <> OLD."tipo"
     OR NEW."capacidade_gb" <> OLD."capacidade_gb" OR NEW."instalada_em" <> OLD."instalada_em"
     OR NEW."original" <> OLD."original"
     OR (OLD."componente_id" IS NOT NULL AND NEW."componente_id" IS DISTINCT FROM OLD."componente_id") THEN
    RAISE EXCEPTION 'O histórico de peças não pode ser alterado nem excluído.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "peca_configuracao_preservada"
  BEFORE UPDATE OR DELETE ON "peca_configuracao"
  FOR EACH ROW EXECUTE FUNCTION "peca_configuracao_preservada"();
