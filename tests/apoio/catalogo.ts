/**
 * Catálogo inicial (o mesmo das migrações), restaurado entre testes: categorias criadas nos
 * testes saem; nome, abreviação, dígitos e situação voltam ao padrão. As famílias padrão
 * mantêm o id. Marcas, modelos, processadores, sistemas e padrões de memória voltam ao
 * catálogo inicial (com ids novos: os testes procuram pelo nome).
 */
type Banco = { $executeRawUnsafe: (sql: string) => Promise<unknown> };

const CATEGORIAS: [codigo: string, nome: string, prefixo: string | null, digitos: number, regra: string][] = [
  ["NOTEBOOK", "Notebook", "NBI", 3, "PROCESSADOR"],
  ["CARREGADOR", "Carregador de notebook", null, 1, "CARREGADOR"],
  ["DESKTOP", "Desktop", null, 3, "NENHUMA"],
  ["MONITOR", "Monitor", "MNT", 3, "SEQUENCIAL"],
  ["SUPORTE_MONITOR", "Suporte para monitor", "SMN", 3, "SEQUENCIAL"],
  ["KIT_TECLADO_MOUSE", "Kit teclado e mouse", "KTM", 2, "KIT"],
  ["TECLADO", "Teclado com fio", "TCL", 3, "SEQUENCIAL"],
  ["MOUSE", "Mouse com fio", "MSC", 3, "SEQUENCIAL"],
  ["HUB", "Hub", "HUB", 3, "SEQUENCIAL"],
  ["CABO_HDMI", "Cabo HDMI", "CHD", 3, "SEQUENCIAL"],
  ["MICROFONE", "Microfone", "MCP", 3, "SEQUENCIAL"],
  ["HEADSET", "Headset", null, 3, "NENHUMA"],
  ["CELULAR", "Celular", null, 3, "NENHUMA"],
  ["IMPRESSORA", "Impressora", null, 3, "NENHUMA"],
  ["MEMORIA_RAM", "Memória RAM", "RAM", 3, "SEQUENCIAL"],
  ["SSD", "SSD", "SSD", 3, "SEQUENCIAL"],
  ["HD", "HD", "HDD", 3, "SEQUENCIAL"],
  ["OUTRO", "Outro", null, 3, "NENHUMA"],
];

const FAMILIAS: [nome: string, codigo: string][] = [
  ["Intel Core i3", "3"],
  ["Intel Core i5", "5"],
  ["Intel Core i7", "7"],
];

const texto = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

/** Depois do TRUNCATE (equipamentos, kits e histórico de abreviações já limpos). */
export async function restaurarCatalogo(db: Banco) {
  for (const tabela of ["sistema_operacional_categoria", "modelo_equipamento", "marca_equipamento", "processador", "sistema_operacional", "padrao_memoria"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${tabela}"`);
  }
  // Checklists de categorias criadas nos testes (as respostas já saíram com os equipamentos).
  await db.$executeRawUnsafe(
    `DELETE FROM "versao_pergunta_inspecao" WHERE "pergunta_id" IN (SELECT p."id" FROM "pergunta_inspecao" p JOIN "categoria_equipamento" c ON c."id" = p."categoria_id" WHERE NOT c."sistema" OR p."codigo" IS NULL)`,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM "pergunta_inspecao" WHERE "categoria_id" IN (SELECT "id" FROM "categoria_equipamento" WHERE NOT "sistema") OR "codigo" IS NULL`,
  );
  // Checklist inicial: versões e situação criadas por testes voltam ao estado da migração.
  await db.$executeRawUnsafe(`DELETE FROM "versao_pergunta_inspecao" WHERE "versao" > 1 AND "pergunta_id" IN (SELECT "id" FROM "pergunta_inspecao" WHERE "codigo" IS NOT NULL)`);
  await db.$executeRawUnsafe(`UPDATE "pergunta_inspecao" SET "ativa" = true WHERE "codigo" IS NOT NULL AND NOT "ativa"`);
  await db.$executeRawUnsafe(`DELETE FROM "categoria_equipamento" WHERE NOT "sistema"`);
  // Libera nomes e abreviações antes de reaplicar (evita colisão ao trocar entre categorias).
  await db.$executeRawUnsafe(`UPDATE "categoria_equipamento" SET "nome" = 'tmp-' || "id", "prefixo" = NULL, "regra" = 'NENHUMA'`);
  for (const [codigo, nome, prefixo, digitos, regra] of CATEGORIAS) {
    await db.$executeRawUnsafe(
      `UPDATE "categoria_equipamento" SET "nome" = ${texto(nome)}, "prefixo" = ${texto(prefixo)}, "digitos" = ${digitos}, "regra" = '${regra}', "ativa" = true WHERE "codigo" = '${codigo}'`,
    );
  }
  await db.$executeRawUnsafe(`DELETE FROM "familia_processador" WHERE "nome" NOT IN (${FAMILIAS.map(([n]) => texto(n)).join(", ")})`);
  // Códigos temporários válidos (Z1, Z2...) antes de reaplicar os padrões.
  await db.$executeRawUnsafe(
    `UPDATE "familia_processador" f SET "codigo" = t."novo" FROM (SELECT "id", 'Z' || row_number() OVER (ORDER BY "id") AS "novo" FROM "familia_processador") t WHERE f."id" = t."id"`,
  );
  for (const [nome, codigo] of FAMILIAS) {
    await db.$executeRawUnsafe(`UPDATE "familia_processador" SET "codigo" = ${texto(codigo)}, "ativa" = true WHERE "nome" = ${texto(nome)}`);
  }
  await restaurarCatalogosInventario(db);
}

/** Ids fixos: os testes guardam os ids entre restaurações do catálogo. */
const uuid = (n: number) => `c47a1000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Marcas do catálogo inicial (Dell, Lenovo, HP, Samsung) e as usadas pelos testes. */
export const MARCA = { Dell: uuid(1), Lenovo: uuid(2), HP: uuid(3), Samsung: uuid(4), LG: uuid(5), Kingston: uuid(6), "SK Hynix": uuid(7) } as const;
const INICIAIS: (keyof typeof MARCA)[] = ["Dell", "Lenovo", "HP", "Samsung"];

/** Processadores iniciais: as famílias de antes (i3/i5/i7) e os exemplos aprovados. */
export const PROCESSADOR = { i3: uuid(21), i5: uuid(22), i7: uuid(23), i5_1345U: uuid(24), i7_1355U: uuid(25), ryzen5: uuid(26) } as const;
const PROCESSADORES: [id: string, fabricante: string, familia: string, modelo: string, codigo: string | null][] = [
  [PROCESSADOR.i3, "Intel", "Core i3", "Intel Core i3", "3"],
  [PROCESSADOR.i5, "Intel", "Core i5", "Intel Core i5", "5"],
  [PROCESSADOR.i7, "Intel", "Core i7", "Intel Core i7", "7"],
  [PROCESSADOR.i5_1345U, "Intel", "Core i5", "Intel Core i5-1345U", "5"],
  [PROCESSADOR.i7_1355U, "Intel", "Core i7", "Intel Core i7-1355U", "7"],
  [PROCESSADOR.ryzen5, "AMD", "Ryzen 5", "AMD Ryzen 5 7530U", null],
];

export const SISTEMA = { win11Pro: uuid(41), win11Home: uuid(42), ubuntu: uuid(43), android14: uuid(44) } as const;
const SISTEMAS: [id: string, nome: string, versao: string][] = [
  [SISTEMA.win11Pro, "Windows 11", "Pro"],
  [SISTEMA.win11Home, "Windows 11", "Home"],
  [SISTEMA.ubuntu, "Ubuntu", "24.04"],
  [SISTEMA.android14, "Android", "14"],
];

/** Modelos usados pelos testes (marca + categoria). */
export const MODELO = {
  latitude5440: uuid(61),
  latitude3540: uuid(62),
  thinkpadE14: uuid(63),
  optiplex: uuid(64),
  lg24: uuid(65),
  furyRam: uuid(66),
  furyBeast: uuid(67),
  furySsd: uuid(68),
  furyHd: uuid(69),
  samsung990: uuid(70),
  hynixPc801: uuid(71),
} as const;
const MODELOS: [id: string, marca: keyof typeof MARCA, categoria: string, nome: string][] = [
  [MODELO.latitude5440, "Dell", "NOTEBOOK", "Latitude 5440"],
  [MODELO.latitude3540, "Dell", "NOTEBOOK", "Latitude 3540"],
  [MODELO.thinkpadE14, "Lenovo", "NOTEBOOK", "ThinkPad E14"],
  [MODELO.optiplex, "Dell", "DESKTOP", "OptiPlex 7010"],
  [MODELO.lg24, "LG", "MONITOR", "24MP400"],
  [MODELO.furyRam, "Kingston", "MEMORIA_RAM", "Fury"],
  [MODELO.furyBeast, "Kingston", "MEMORIA_RAM", "Fury Beast"],
  [MODELO.furySsd, "Kingston", "SSD", "Fury"],
  [MODELO.furyHd, "Kingston", "HD", "Fury"],
  [MODELO.samsung990, "Samsung", "SSD", "990 Pro"],
  [MODELO.hynixPc801, "SK Hynix", "SSD", "PC801"],
];

const MEMORIA: [tipo: string, valores: string[]][] = [
  ["TECNOLOGIA", ["DDR3", "DDR3L", "DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X"]],
  ["FORMATO", ["SO-DIMM", "DIMM"]],
  ["FREQUENCIA", ["1333", "1600", "2133", "2400", "2666", "2933", "3200", "4800", "5200", "5600"]],
];

/** Catálogo inicial de marcas, processadores, sistemas e padrões de memória, mais os modelos dos testes. */
async function restaurarCatalogosInventario(db: Banco) {
  const linhas = (l: string[]) => l.join(", ");
  const marcas = [...INICIAIS, ...(Object.keys(MARCA) as (keyof typeof MARCA)[]).filter((m) => !INICIAIS.includes(m))];
  await db.$executeRawUnsafe(`INSERT INTO "marca_equipamento" ("id", "nome", "chave") VALUES ${linhas(marcas.map((m) => `(${texto(MARCA[m])}, ${texto(m)}, chave_catalogo(${texto(m)}))`))}`);
  await db.$executeRawUnsafe(
    `INSERT INTO "processador" ("id", "fabricante", "familia", "modelo", "chave", "codigo_nomenclatura") VALUES ${linhas(
      PROCESSADORES.map(([id, f, fam, m, c]) => `(${texto(id)}, ${texto(f)}, ${texto(fam)}, ${texto(m)}, chave_catalogo(${texto(m)}), ${texto(c)})`),
    )}`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "sistema_operacional" ("id", "nome", "versao", "chave") VALUES ${linhas(SISTEMAS.map(([id, n, v]) => `(${texto(id)}, ${texto(n)}, ${texto(v)}, chave_catalogo(${texto(`${n} ${v}`)}))`))}`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "modelo_equipamento" ("id", "nome", "chave", "marca_id", "categoria_id") VALUES ${linhas(
      MODELOS.map(([id, marca, categoria, nome]) => `(${texto(id)}, ${texto(nome)}, chave_catalogo(${texto(nome)}), ${texto(MARCA[marca])}, (SELECT "id" FROM "categoria_equipamento" WHERE "codigo" = '${categoria}'))`),
    )}`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "padrao_memoria" ("id", "tipo", "valor", "chave", "ordem") VALUES ${linhas(
      MEMORIA.flatMap(([tipo, valores]) => valores.map((v, i) => `(gen_random_uuid()::text, '${tipo}', ${texto(v)}, chave_catalogo(${texto(v)}), ${(i + 1) * 10})`)),
    )}`,
  );
}
