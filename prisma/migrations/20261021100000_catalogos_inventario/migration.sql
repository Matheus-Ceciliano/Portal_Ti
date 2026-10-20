-- CreateEnum
CREATE TYPE "TipoPadraoMemoria" AS ENUM ('TECNOLOGIA', 'FORMATO', 'FREQUENCIA');

-- AlterTable
ALTER TABLE "ativo" ADD COLUMN     "marca_id" TEXT,
ADD COLUMN     "modelo_id" TEXT,
ADD COLUMN     "processador_id" TEXT,
ADD COLUMN     "sistema_operacional_id" TEXT;

-- CreateTable
CREATE TABLE "marca_equipamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marca_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_equipamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "marca_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelo_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processador" (
    "id" TEXT NOT NULL,
    "fabricante" TEXT,
    "familia" TEXT,
    "modelo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "codigo_nomenclatura" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sistema_operacional" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "versao" TEXT,
    "chave" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sistema_operacional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sistema_operacional_categoria" (
    "sistema_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,

    CONSTRAINT "sistema_operacional_categoria_pkey" PRIMARY KEY ("sistema_id","categoria_id")
);

-- CreateTable
CREATE TABLE "padrao_memoria" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPadraoMemoria" NOT NULL,
    "valor" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 100,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT,

    CONSTRAINT "padrao_memoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marca_equipamento_chave_key" ON "marca_equipamento"("chave");

-- CreateIndex
CREATE INDEX "modelo_equipamento_categoria_id_idx" ON "modelo_equipamento"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_equipamento_marca_id_categoria_id_chave_key" ON "modelo_equipamento"("marca_id", "categoria_id", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "processador_chave_key" ON "processador"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "sistema_operacional_chave_key" ON "sistema_operacional"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "padrao_memoria_tipo_chave_key" ON "padrao_memoria"("tipo", "chave");

-- CreateIndex
CREATE INDEX "ativo_marca_id_idx" ON "ativo"("marca_id");

-- CreateIndex
CREATE INDEX "ativo_modelo_id_idx" ON "ativo"("modelo_id");

-- CreateIndex
CREATE INDEX "ativo_processador_id_idx" ON "ativo"("processador_id");

-- CreateIndex
CREATE INDEX "ativo_sistema_operacional_id_idx" ON "ativo"("sistema_operacional_id");

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelo_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_processador_id_fkey" FOREIGN KEY ("processador_id") REFERENCES "processador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ativo" ADD CONSTRAINT "ativo_sistema_operacional_id_fkey" FOREIGN KEY ("sistema_operacional_id") REFERENCES "sistema_operacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_equipamento" ADD CONSTRAINT "modelo_equipamento_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_equipamento" ADD CONSTRAINT "modelo_equipamento_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sistema_operacional_categoria" ADD CONSTRAINT "sistema_operacional_categoria_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema_operacional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sistema_operacional_categoria" ADD CONSTRAINT "sistema_operacional_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras de formato.
ALTER TABLE "processador" ADD CONSTRAINT "processador_codigo_formato" CHECK ("codigo_nomenclatura" IS NULL OR "codigo_nomenclatura" ~ '^[A-Z0-9]{1,3}$');
ALTER TABLE "marca_equipamento" ADD CONSTRAINT "marca_chave_preenchida" CHECK ("chave" <> '');
ALTER TABLE "modelo_equipamento" ADD CONSTRAINT "modelo_chave_preenchida" CHECK ("chave" <> '');
ALTER TABLE "processador" ADD CONSTRAINT "processador_chave_preenchida" CHECK ("chave" <> '');
ALTER TABLE "sistema_operacional" ADD CONSTRAINT "sistema_chave_preenchida" CHECK ("chave" <> '');
ALTER TABLE "padrao_memoria" ADD CONSTRAINT "padrao_chave_preenchida" CHECK ("chave" <> '');
ALTER TABLE "padrao_memoria" ADD CONSTRAINT "padrao_frequencia_numerica" CHECK ("tipo" <> 'FREQUENCIA' OR "valor" ~ '^[0-9]{3,5}$');

-- Chave de comparação dos catálogos (a mesma de src/lib/catalogos.ts): sem acento, minúsculas
-- e espaços simples. "Dell" e "DELL" têm a mesma chave.
CREATE OR REPLACE FUNCTION chave_catalogo(texto TEXT) RETURNS TEXT AS $$
  SELECT lower(btrim(regexp_replace(translate(coalesce(texto, ''),
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'), '\s+', ' ', 'g')))
$$ LANGUAGE sql IMMUTABLE;

-- Texto exibido: espaços simples, sem mudar maiúsculas e minúsculas.
CREATE OR REPLACE FUNCTION texto_catalogo(texto TEXT) RETURNS TEXT AS $$
  SELECT btrim(regexp_replace(coalesce(texto, ''), '\s+', ' ', 'g'))
$$ LANGUAGE sql IMMUTABLE;

/*
 * Migração dos textos já gravados para referências de catálogo (idempotente: só cria o que
 * falta e só preenche referências vazias). O texto original de cada equipamento não muda;
 * grafias equivalentes (Dell e DELL) apontam para o mesmo item, com a grafia mais usada.
 */

-- Marcas: as já usadas e as do catálogo inicial.
INSERT INTO "marca_equipamento" ("id", "nome", "chave")
SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("marca")), chave_catalogo("marca")
FROM "ativo" WHERE chave_catalogo("marca") <> ''
GROUP BY chave_catalogo("marca")
ON CONFLICT ("chave") DO NOTHING;

INSERT INTO "marca_equipamento" ("id", "nome", "chave")
SELECT gen_random_uuid()::text, v.nome, chave_catalogo(v.nome) FROM (VALUES ('Dell'), ('Lenovo'), ('HP'), ('Samsung')) AS v(nome)
ON CONFLICT ("chave") DO NOTHING;

UPDATE "ativo" a SET "marca_id" = m."id"
FROM "marca_equipamento" m
WHERE a."marca_id" IS NULL AND m."chave" = chave_catalogo(a."marca");

-- Modelos por marca e categoria (carregadores criados com o notebook ficam sem modelo de catálogo).
INSERT INTO "modelo_equipamento" ("id", "nome", "chave", "marca_id", "categoria_id")
SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("modelo")), chave_catalogo("modelo"), "marca_id", "categoria_id"
FROM "ativo"
WHERE "marca_id" IS NOT NULL AND "categoria" <> 'CARREGADOR' AND chave_catalogo("modelo") <> ''
GROUP BY "marca_id", "categoria_id", chave_catalogo("modelo")
ON CONFLICT ("marca_id", "categoria_id", "chave") DO NOTHING;

UPDATE "ativo" a SET "modelo_id" = m."id"
FROM "modelo_equipamento" m
WHERE a."modelo_id" IS NULL AND a."categoria" <> 'CARREGADOR'
  AND m."marca_id" = a."marca_id" AND m."categoria_id" = a."categoria_id" AND m."chave" = chave_catalogo(a."modelo");

-- Processadores: cada família usada até aqui vira um item com o mesmo código (Intel Core i5 = 5).
INSERT INTO "processador" ("id", "fabricante", "familia", "modelo", "chave", "codigo_nomenclatura")
SELECT gen_random_uuid()::text,
  CASE WHEN chave_catalogo(f."nome") LIKE 'intel %' THEN 'Intel' WHEN chave_catalogo(f."nome") LIKE 'amd %' THEN 'AMD' END,
  regexp_replace(f."nome", '^(Intel|AMD)\s+', '', 'i'),
  texto_catalogo(f."nome"), chave_catalogo(f."nome"), f."codigo"
FROM "familia_processador" f
ON CONFLICT ("chave") DO NOTHING;

-- Exemplos aprovados: i5 = 5 e i7 = 7; o AMD fica sem código até a TI configurá-lo.
INSERT INTO "processador" ("id", "fabricante", "familia", "modelo", "chave", "codigo_nomenclatura")
SELECT gen_random_uuid()::text, v.fabricante, v.familia, v.modelo, chave_catalogo(v.modelo), v.codigo
FROM (VALUES
  ('Intel', 'Core i5', 'Intel Core i5-1345U', '5'),
  ('Intel', 'Core i7', 'Intel Core i7-1355U', '7'),
  ('AMD', 'Ryzen 5', 'AMD Ryzen 5 7530U', NULL)
) AS v(fabricante, familia, modelo, codigo)
ON CONFLICT ("chave") DO NOTHING;

-- Processadores já escritos nos equipamentos. O código vem da família escolhida no cadastro
-- (quando única) ou da família cujo nome aparece no texto ("Intel Core i3-1215U" = Core i3 = 3).
WITH textos AS (
  SELECT chave_catalogo("processador") AS chave, texto_catalogo("processador") AS modelo, "familia_processador_id" AS familia
  FROM "ativo" WHERE chave_catalogo("processador") <> ''
), agrupados AS (
  SELECT chave, mode() WITHIN GROUP (ORDER BY modelo) AS modelo,
    CASE WHEN count(DISTINCT familia) = 1 THEN min(familia) END AS familia
  FROM textos GROUP BY chave
), resolvidos AS (
  SELECT g.chave, g.modelo,
    coalesce(g.familia, (
      SELECT f."id" FROM "familia_processador" f
      WHERE g.chave LIKE '%' || chave_catalogo(regexp_replace(f."nome", '^(Intel|AMD)\s+', '', 'i')) || '%'
      ORDER BY length(f."nome") DESC LIMIT 1
    )) AS familia
  FROM agrupados g
)
INSERT INTO "processador" ("id", "fabricante", "familia", "modelo", "chave", "codigo_nomenclatura")
SELECT gen_random_uuid()::text,
  CASE WHEN r.chave LIKE 'intel%' THEN 'Intel' WHEN r.chave LIKE 'amd%' THEN 'AMD' END,
  regexp_replace(f."nome", '^(Intel|AMD)\s+', '', 'i'),
  r.modelo, r.chave, f."codigo"
FROM resolvidos r LEFT JOIN "familia_processador" f ON f."id" = r.familia
ON CONFLICT ("chave") DO NOTHING;

UPDATE "ativo" a SET "processador_id" = p."id"
FROM "processador" p
WHERE a."processador_id" IS NULL AND chave_catalogo(a."processador") <> '' AND p."chave" = chave_catalogo(a."processador");

-- Notebook só com a família (sem o texto do processador): o item da família.
UPDATE "ativo" a SET "processador_id" = p."id"
FROM "familia_processador" f JOIN "processador" p ON p."chave" = chave_catalogo(f."nome")
WHERE a."processador_id" IS NULL AND chave_catalogo(a."processador") = '' AND a."familia_processador_id" = f."id";

-- Sistemas operacionais: os exemplos aprovados (nome + edição) e os já escritos nos equipamentos.
INSERT INTO "sistema_operacional" ("id", "nome", "versao", "chave")
SELECT gen_random_uuid()::text, v.nome, v.versao, chave_catalogo(v.nome || ' ' || v.versao)
FROM (VALUES ('Windows 11', 'Pro'), ('Windows 11', 'Home'), ('Ubuntu', '24.04'), ('Android', '14')) AS v(nome, versao)
ON CONFLICT ("chave") DO NOTHING;

INSERT INTO "sistema_operacional" ("id", "nome", "chave")
SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("sistema_operacional")), chave_catalogo("sistema_operacional")
FROM "ativo" WHERE chave_catalogo("sistema_operacional") <> ''
GROUP BY chave_catalogo("sistema_operacional")
ON CONFLICT ("chave") DO NOTHING;

UPDATE "ativo" a SET "sistema_operacional_id" = s."id"
FROM "sistema_operacional" s
WHERE a."sistema_operacional_id" IS NULL AND chave_catalogo(a."sistema_operacional") <> '' AND s."chave" = chave_catalogo(a."sistema_operacional");

-- Padrões de memória: os que o portal já oferecia e os já gravados nas peças.
INSERT INTO "padrao_memoria" ("id", "tipo", "valor", "chave", "ordem")
SELECT gen_random_uuid()::text, v.tipo::"TipoPadraoMemoria", v.valor, chave_catalogo(v.valor), v.ordem
FROM (VALUES
  ('TECNOLOGIA', 'DDR3', 10), ('TECNOLOGIA', 'DDR3L', 20), ('TECNOLOGIA', 'DDR4', 30), ('TECNOLOGIA', 'DDR5', 40),
  ('TECNOLOGIA', 'LPDDR4X', 50), ('TECNOLOGIA', 'LPDDR5', 60), ('TECNOLOGIA', 'LPDDR5X', 70),
  ('FORMATO', 'SO-DIMM', 10), ('FORMATO', 'DIMM', 20),
  ('FREQUENCIA', '1333', 10), ('FREQUENCIA', '1600', 20), ('FREQUENCIA', '2133', 30), ('FREQUENCIA', '2400', 40),
  ('FREQUENCIA', '2666', 50), ('FREQUENCIA', '2933', 60), ('FREQUENCIA', '3200', 70), ('FREQUENCIA', '4800', 80),
  ('FREQUENCIA', '5200', 90), ('FREQUENCIA', '5600', 100)
) AS v(tipo, valor, ordem)
ON CONFLICT ("tipo", "chave") DO NOTHING;

INSERT INTO "padrao_memoria" ("id", "tipo", "valor", "chave")
SELECT DISTINCT ON (t.tipo, chave_catalogo(t.valor)) gen_random_uuid()::text, t.tipo::"TipoPadraoMemoria", t.valor, chave_catalogo(t.valor)
FROM (
  SELECT 'TECNOLOGIA' AS tipo, texto_catalogo("tecnologia") AS valor FROM "ativo" WHERE "categoria" = 'MEMORIA_RAM' AND chave_catalogo("tecnologia") <> ''
  UNION SELECT 'FORMATO', texto_catalogo("formato") FROM "ativo" WHERE "categoria" = 'MEMORIA_RAM' AND chave_catalogo("formato") <> ''
  UNION SELECT 'FREQUENCIA', "frequencia_mhz"::text FROM "ativo" WHERE "categoria" = 'MEMORIA_RAM' AND "frequencia_mhz" BETWEEN 100 AND 99999
  UNION SELECT 'TECNOLOGIA', texto_catalogo("tecnologia") FROM "peca_configuracao" WHERE "tipo" = 'MEMORIA_RAM' AND chave_catalogo("tecnologia") <> ''
) t
ON CONFLICT ("tipo", "chave") DO NOTHING;
