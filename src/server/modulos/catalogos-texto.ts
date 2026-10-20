/**
 * Vínculo de textos antigos aos Catálogos do Inventário, sem dependências de autorização
 * (usado pela carga de dados fictícios, que grava direto no banco).
 */
type Banco = { $executeRawUnsafe: (sql: string) => Promise<unknown> };

/**
 * Cadastros gravados direto no banco (carga de dados fictícios): cria os itens de catálogo
 * que faltam a partir do texto e preenche as referências vazias (a mesma regra da migração).
 */
export async function vincularCatalogosPorTexto(tx: Banco) {
  await tx.$executeRawUnsafe(`
    INSERT INTO "marca_equipamento" ("id", "nome", "chave")
    SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("marca")), chave_catalogo("marca")
    FROM "ativo" WHERE "marca_id" IS NULL AND chave_catalogo("marca") <> '' GROUP BY chave_catalogo("marca")
    ON CONFLICT ("chave") DO NOTHING`);
  await tx.$executeRawUnsafe(`
    UPDATE "ativo" a SET "marca_id" = m."id" FROM "marca_equipamento" m
    WHERE a."marca_id" IS NULL AND m."chave" = chave_catalogo(a."marca")`);
  await tx.$executeRawUnsafe(`
    INSERT INTO "modelo_equipamento" ("id", "nome", "chave", "marca_id", "categoria_id")
    SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("modelo")), chave_catalogo("modelo"), "marca_id", "categoria_id"
    FROM "ativo" WHERE "modelo_id" IS NULL AND "marca_id" IS NOT NULL AND "categoria" <> 'CARREGADOR' AND chave_catalogo("modelo") <> ''
    GROUP BY "marca_id", "categoria_id", chave_catalogo("modelo")
    ON CONFLICT ("marca_id", "categoria_id", "chave") DO NOTHING`);
  await tx.$executeRawUnsafe(`
    UPDATE "ativo" a SET "modelo_id" = m."id" FROM "modelo_equipamento" m
    WHERE a."modelo_id" IS NULL AND a."categoria" <> 'CARREGADOR' AND m."marca_id" = a."marca_id" AND m."categoria_id" = a."categoria_id" AND m."chave" = chave_catalogo(a."modelo")`);
  // Código de nomenclatura pela família cujo nome aparece no texto ("Intel Core i3-1215U" = Core i3 = 3).
  await tx.$executeRawUnsafe(`
    WITH textos AS (
      SELECT chave_catalogo("processador") AS chave, mode() WITHIN GROUP (ORDER BY texto_catalogo("processador")) AS modelo
      FROM "ativo" WHERE "processador_id" IS NULL AND chave_catalogo("processador") <> '' GROUP BY chave_catalogo("processador")
    )
    INSERT INTO "processador" ("id", "fabricante", "familia", "modelo", "chave", "codigo_nomenclatura")
    SELECT gen_random_uuid()::text,
      CASE WHEN t.chave LIKE 'intel%' THEN 'Intel' WHEN t.chave LIKE 'amd%' THEN 'AMD' END,
      regexp_replace(f."nome", '^(Intel|AMD)\\s+', '', 'i'), t.modelo, t.chave, f."codigo"
    FROM textos t
    LEFT JOIN LATERAL (
      SELECT f."nome", f."codigo" FROM "familia_processador" f
      WHERE t.chave LIKE '%' || chave_catalogo(regexp_replace(f."nome", '^(Intel|AMD)\\s+', '', 'i')) || '%'
      ORDER BY length(f."nome") DESC LIMIT 1
    ) f ON true
    ON CONFLICT ("chave") DO NOTHING`);
  await tx.$executeRawUnsafe(`
    UPDATE "ativo" a SET "processador_id" = p."id" FROM "processador" p
    WHERE a."processador_id" IS NULL AND chave_catalogo(a."processador") <> '' AND p."chave" = chave_catalogo(a."processador")`);
  await tx.$executeRawUnsafe(`
    INSERT INTO "sistema_operacional" ("id", "nome", "chave")
    SELECT gen_random_uuid()::text, mode() WITHIN GROUP (ORDER BY texto_catalogo("sistema_operacional")), chave_catalogo("sistema_operacional")
    FROM "ativo" WHERE "sistema_operacional_id" IS NULL AND chave_catalogo("sistema_operacional") <> '' GROUP BY chave_catalogo("sistema_operacional")
    ON CONFLICT ("chave") DO NOTHING`);
  await tx.$executeRawUnsafe(`
    UPDATE "ativo" a SET "sistema_operacional_id" = s."id" FROM "sistema_operacional" s
    WHERE a."sistema_operacional_id" IS NULL AND chave_catalogo(a."sistema_operacional") <> '' AND s."chave" = chave_catalogo(a."sistema_operacional")`);
}
