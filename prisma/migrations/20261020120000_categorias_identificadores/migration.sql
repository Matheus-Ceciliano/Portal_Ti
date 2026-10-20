-- CreateEnum
CREATE TYPE "RegraIdentificador" AS ENUM ('PROCESSADOR', 'CARREGADOR', 'KIT', 'SEQUENCIAL', 'NENHUMA');

-- CreateEnum
CREATE TYPE "ParteKit" AS ENUM ('TECLADO', 'MOUSE', 'RECEPTOR');

-- AlterTable
ALTER TABLE "ativo" ADD COLUMN     "categoria_id" TEXT,
ADD COLUMN     "familia_processador_id" TEXT,
ADD COLUMN     "kit_id" TEXT,
ADD COLUMN     "parte_kit" "ParteKit";

-- CreateTable
CREATE TABLE "categoria_equipamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" "CategoriaAtivo" NOT NULL,
    "regra" "RegraIdentificador" NOT NULL,
    "prefixo" TEXT,
    "digitos" INTEGER NOT NULL DEFAULT 3,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 100,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_prefixo_categoria" (
    "id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "prefixo_anterior" TEXT,
    "prefixo_novo" TEXT,
    "digitos_anterior" INTEGER NOT NULL,
    "digitos_novo" INTEGER NOT NULL,
    "alterado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por_nome" TEXT NOT NULL,

    CONSTRAINT "historico_prefixo_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "familia_processador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,

    CONSTRAINT "familia_processador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_equipamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por_nome" TEXT NOT NULL,
    "chave_requisicao" TEXT,

    CONSTRAINT "kit_equipamento_pkey" PRIMARY KEY ("id")
);


-- Catálogo inicial. As categorias que já existiam continuam com o mesmo tipo; as novas
-- (hub, suporte, cabo HDMI, microfone) usam o tipo genérico. "MSC" (mouse com fio) segue a
-- tabela aprovada; "MF" não vira uma segunda categoria equivalente.
INSERT INTO "categoria_equipamento" ("id", "codigo", "nome", "tipo", "regra", "prefixo", "digitos", "sistema", "ordem") VALUES
  (gen_random_uuid()::text, 'NOTEBOOK', 'Notebook', 'NOTEBOOK', 'PROCESSADOR', 'NBI', 3, true, 10),
  (gen_random_uuid()::text, 'CARREGADOR', 'Carregador de notebook', 'CARREGADOR', 'CARREGADOR', NULL, 1, true, 20),
  (gen_random_uuid()::text, 'DESKTOP', 'Desktop', 'DESKTOP', 'NENHUMA', NULL, 3, true, 30),
  (gen_random_uuid()::text, 'MONITOR', 'Monitor', 'MONITOR', 'SEQUENCIAL', 'MNT', 3, true, 40),
  (gen_random_uuid()::text, 'SUPORTE_MONITOR', 'Suporte para monitor', 'OUTRO', 'SEQUENCIAL', 'SMN', 3, true, 50),
  (gen_random_uuid()::text, 'KIT_TECLADO_MOUSE', 'Kit teclado e mouse', 'KIT_TECLADO_MOUSE', 'KIT', 'KTM', 2, true, 60),
  (gen_random_uuid()::text, 'TECLADO', 'Teclado com fio', 'TECLADO', 'SEQUENCIAL', 'TCL', 3, true, 70),
  (gen_random_uuid()::text, 'MOUSE', 'Mouse com fio', 'MOUSE', 'SEQUENCIAL', 'MSC', 3, true, 80),
  (gen_random_uuid()::text, 'HUB', 'Hub', 'OUTRO', 'SEQUENCIAL', 'HUB', 3, true, 90),
  (gen_random_uuid()::text, 'CABO_HDMI', 'Cabo HDMI', 'OUTRO', 'SEQUENCIAL', 'CHD', 3, true, 100),
  (gen_random_uuid()::text, 'MICROFONE', 'Microfone', 'OUTRO', 'SEQUENCIAL', 'MCP', 3, true, 110),
  (gen_random_uuid()::text, 'HEADSET', 'Headset', 'HEADSET', 'NENHUMA', NULL, 3, true, 120),
  (gen_random_uuid()::text, 'CELULAR', 'Celular', 'CELULAR', 'NENHUMA', NULL, 3, true, 130),
  (gen_random_uuid()::text, 'IMPRESSORA', 'Impressora', 'IMPRESSORA', 'NENHUMA', NULL, 3, true, 140),
  (gen_random_uuid()::text, 'MEMORIA_RAM', 'Memória RAM', 'MEMORIA_RAM', 'SEQUENCIAL', 'RAM', 3, true, 150),
  (gen_random_uuid()::text, 'SSD', 'SSD', 'SSD', 'SEQUENCIAL', 'SSD', 3, true, 160),
  (gen_random_uuid()::text, 'HD', 'HD', 'HD', 'SEQUENCIAL', 'HDD', 3, true, 170),
  (gen_random_uuid()::text, 'OUTRO', 'Outro', 'OUTRO', 'NENHUMA', NULL, 3, true, 180);

-- Famílias com código aprovado (i3, i5, i7). Outras famílias só depois que a TI cadastrar o código.
INSERT INTO "familia_processador" ("id", "nome", "codigo") VALUES
  (gen_random_uuid()::text, 'Intel Core i3', '3'),
  (gen_random_uuid()::text, 'Intel Core i5', '5'),
  (gen_random_uuid()::text, 'Intel Core i7', '7');

-- Equipamentos existentes: categoria pelo tipo; identificadores não mudam.
UPDATE "ativo" a SET "categoria_id" = c."id" FROM "categoria_equipamento" c WHERE c."codigo" = a."categoria"::text;
ALTER TABLE "ativo" ALTER COLUMN "categoria_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categoria_equipamento_codigo_key" ON "categoria_equipamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_equipamento_nome_key" ON "categoria_equipamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_equipamento_prefixo_key" ON "categoria_equipamento"("prefixo");

-- CreateIndex
CREATE INDEX "historico_prefixo_categoria_categoria_id_alterado_em_idx" ON "historico_prefixo_categoria"("categoria_id", "alterado_em");

-- CreateIndex
CREATE UNIQUE INDEX "familia_processador_nome_key" ON "familia_processador"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "familia_processador_codigo_key" ON "familia_processador"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "kit_equipamento_codigo_key" ON "kit_equipamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "kit_equipamento_chave_requisicao_key" ON "kit_equipamento"("chave_requisicao");

-- CreateIndex
CREATE INDEX "ativo_categoria_id_idx" ON "ativo"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "ativo_kit_id_parte_kit_key" ON "ativo"("kit_id", "parte_kit");

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_familia_processador_id_fkey" FOREIGN KEY ("familia_processador_id") REFERENCES "familia_processador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "kit_equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_prefixo_categoria" ADD CONSTRAINT "historico_prefixo_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_equipamento" ADD CONSTRAINT "kit_equipamento_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Abreviação só com letras (2 a 6): o limite letra/número separa o prefixo da sequência e
-- impede colisão entre abreviações diferentes. Código de família: letras e números (1 a 3).
ALTER TABLE "categoria_equipamento" ADD CONSTRAINT "categoria_prefixo_valido" CHECK ("prefixo" IS NULL OR "prefixo" ~ '^[A-Z]{2,6}$');
ALTER TABLE "categoria_equipamento" ADD CONSTRAINT "categoria_digitos_validos" CHECK ("digitos" BETWEEN 1 AND 6);
ALTER TABLE "categoria_equipamento" ADD CONSTRAINT "categoria_regra_coerente" CHECK (
  ("regra" IN ('PROCESSADOR', 'KIT', 'SEQUENCIAL') AND "prefixo" IS NOT NULL)
  OR ("regra" IN ('CARREGADOR', 'NENHUMA') AND "prefixo" IS NULL)
);
ALTER TABLE "familia_processador" ADD CONSTRAINT "familia_codigo_valido" CHECK ("codigo" ~ '^[A-Z0-9]{1,3}$');

-- Patrimônio opcional quando há identificador; sem nenhum dos dois, o equipamento fica sem identificação.
ALTER TABLE "ativo" DROP CONSTRAINT "ativo_patrimonio_obrigatorio";
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_identificado" CHECK ("nome_dispositivo" IS NOT NULL OR "patrimonio" IS NOT NULL OR "categoria" = 'CARREGADOR');
-- Peça de kit: kit e parte juntos.
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_parte_kit_coerente" CHECK (("kit_id" IS NULL) = ("parte_kit" IS NULL));

-- Histórico de abreviações: somente inserção.
CREATE FUNCTION "historico_prefixo_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de abreviações não pode ser alterado nem excluído.';
END;
$$;
CREATE TRIGGER "historico_prefixo_somente_insercao"
  BEFORE UPDATE OR DELETE ON "historico_prefixo_categoria"
  FOR EACH ROW EXECUTE FUNCTION "historico_prefixo_somente_insercao"();
