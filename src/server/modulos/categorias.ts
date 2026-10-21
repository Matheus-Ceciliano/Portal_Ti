import type { Prisma } from "@/generated/prisma/client";
import { COMPONENTES } from "@/lib/componentes";
import {
  DIGITOS_MAXIMO,
  DIGITOS_MINIMO,
  FORMATO_PREFIXO,
  nomeParteKit,
  normalizarPrefixo,
  type ParteKit,
  type Regra,
} from "@/lib/identificacao";
import type { Categoria } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import { prisma, type ClienteBanco } from "@/server/db";
import { opcoesCatalogos } from "./catalogos";
import { previaIdentificador } from "./identificacao-ativos";
import { UUID } from "./inventario-base";

/**
 * Catálogo de categorias do inventário. As do catálogo inicial
 * ("sistema") mantêm tipo e regra; nome, abreviação, dígitos e situação mudam com
 * "catalogo.gerenciar". Mudar a abreviação vale só para os próximos equipamentos: os
 * identificadores existentes nunca são reescritos e o histórico de abreviações é guardado.
 */

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

const auditar = (ator: Ator, origem: string, acao: string, alvo: { tipo: string; id: string; descricao: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo,
  origemPermissao: origem,
  detalhe,
});

const nomeValido = (v: string | null | undefined, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!t) throw new ErroNegocio(`Informe o nome da ${rotulo}.`);
  if (t.length > 60) throw new ErroNegocio(`Nome da ${rotulo}: use no máximo 60 caracteres.`);
  return t;
};

/** Tipos que sempre têm identificador automático (o banco exige o nome). */
const EXIGE_PREFIXO: readonly Categoria[] = ["NOTEBOOK", "KIT_TECLADO_MOUSE", ...COMPONENTES];

export type CategoriaCatalogo = {
  id: string;
  codigo: string | null;
  nome: string;
  tipo: Categoria;
  regra: Regra;
  prefixo: string | null;
  digitos: number;
  ativa: boolean;
  sistema: boolean;
};

const SELECAO_CATEGORIA = { id: true, codigo: true, nome: true, tipo: true, regra: true, prefixo: true, digitos: true, ativa: true, sistema: true } as const;
const comoCategoria = (c: Prisma.CategoriaEquipamentoGetPayload<{ select: typeof SELECAO_CATEGORIA }>): CategoriaCatalogo => ({ ...c, tipo: c.tipo as Categoria, regra: c.regra as Regra });

/** Categoria padrão de um tipo (catálogo inicial): carregadores, peças internas e chamadas por tipo. */
export async function categoriaDoTipo(db: ClienteBanco, tipo: Categoria) {
  const c = await db.categoriaEquipamento.findUnique({ where: { codigo: tipo }, select: SELECAO_CATEGORIA });
  if (!c) throw new ErroNegocio("Categoria não configurada.");
  return comoCategoria(c);
}

/** Catálogos do formulário de cadastro: categorias, marcas, modelos, processadores, sistemas e memórias (com os inativos, marcados). */
export async function catalogoInventario(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const [categorias, opcoes] = await Promise.all([
      prisma.categoriaEquipamento.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: SELECAO_CATEGORIA }),
      opcoesCatalogos(prisma),
    ]);
    return { categorias: categorias.map(comoCategoria), ...opcoes, podeGerir: pode(ator, "catalogo.gerenciar") };
  });
}

export type CatalogoInventario = Awaited<ReturnType<typeof catalogoInventario>>;

/** Prévia do identificador (não reserva o número). Notebook: pelo código do processador; kit: o código e as peças. */
export async function previaCadastro(ator: Ator, entrada: { categoriaId: string; processadorId?: string | null; partes?: ParteKit[] }) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    if (!UUID.test(entrada.categoriaId)) return null;
    const c = await prisma.categoriaEquipamento.findUnique({ where: { id: entrada.categoriaId } });
    if (!c || c.regra === "NENHUMA" || c.regra === "CARREGADOR" || !c.prefixo) return null;
    let codigoProcessador: string | null = null;
    if (c.regra === "PROCESSADOR") {
      const p = entrada.processadorId && UUID.test(entrada.processadorId) ? await prisma.processador.findUnique({ where: { id: entrada.processadorId } }) : null;
      // Sem código configurado no catálogo: não há prévia (o formulário pede a configuração).
      if (!p?.codigoNomenclatura) return null;
      codigoProcessador = p.codigoNomenclatura;
    }
    const nome = await previaIdentificador(prisma, { regra: c.regra as Regra, prefixo: c.prefixo, digitos: c.digitos, codigoProcessador });
    return c.regra === "KIT" ? { nome, partes: (entrada.partes ?? []).map((p) => nomeParteKit(nome, p)) } : { nome, partes: [] };
  });
}

/* Gestão das categorias */

export async function listarCategorias(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const [categorias, contagem, historico] = await Promise.all([
      prisma.categoriaEquipamento.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: SELECAO_CATEGORIA }),
      prisma.ativo.groupBy({ by: ["categoriaId"], _count: { _all: true } }),
      prisma.historicoPrefixoCategoria.findMany({ orderBy: { alteradoEm: "desc" }, take: 200 }),
    ]);
    const previas = await Promise.all(
      categorias.map((c) =>
        c.prefixo && (c.regra === "SEQUENCIAL" || c.regra === "KIT")
          ? previaIdentificador(prisma, { regra: c.regra as Regra, prefixo: c.prefixo, digitos: c.digitos })
          : Promise.resolve(null),
      ),
    );
    return {
      categorias: categorias.map((c, i) => ({
        ...comoCategoria(c),
        equipamentos: contagem.find((x) => x.categoriaId === c.id)?._count._all ?? 0,
        proximo: previas[i],
        prefixosAnteriores: [...new Set(historico.filter((h) => h.categoriaId === c.id && h.prefixoAnterior).map((h) => h.prefixoAnterior!))],
      })),
      podeGerir: pode(ator, "catalogo.gerenciar"),
    };
  });
}

export type ListaCategorias = Awaited<ReturnType<typeof listarCategorias>>;

/** Abreviação usada por equipamentos de outra categoria (inclusive com a abreviação antiga dela). */
async function prefixoEmUso(db: ClienteBanco, prefixo: string, categoriaId: string | null) {
  const padrao = `^${prefixo}[0-9]`;
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "ativo"
    WHERE "nome_dispositivo" ~ ${padrao} AND (${categoriaId}::text IS NULL OR "categoria_id" <> ${categoriaId}::text)`;
  return n > 0;
}

async function validarPrefixo(db: ClienteBanco, valor: string | null | undefined, categoriaId: string | null, obrigatorio: boolean) {
  const prefixo = normalizarPrefixo(valor);
  if (!prefixo) {
    if (obrigatorio) throw new ErroNegocio("Informe a abreviação.");
    return null;
  }
  if (!FORMATO_PREFIXO.test(prefixo)) throw new ErroNegocio("Abreviação: use de 2 a 6 letras, sem números, espaços ou acentos.");
  const outra = await db.categoriaEquipamento.findFirst({ where: { prefixo, ...(categoriaId ? { id: { not: categoriaId } } : {}) }, select: { nome: true } });
  if (outra) throw new ErroNegocio(`A abreviação ${prefixo} já é usada pela categoria ${outra.nome}.`);
  if (await prefixoEmUso(db, prefixo, categoriaId)) throw new ErroNegocio(`Já existem equipamentos de outra categoria identificados com ${prefixo}.`);
  return prefixo;
}

function validarDigitos(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < DIGITOS_MINIMO || n > DIGITOS_MAXIMO) throw new ErroNegocio(`Dígitos da sequência: de ${DIGITOS_MINIMO} a ${DIGITOS_MAXIMO}.`);
  return n;
}

async function nomeLivre(db: ClienteBanco, nome: string, id: string | null) {
  const outra = await db.categoriaEquipamento.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (outra) throw new ErroNegocio("Já existe uma categoria com este nome.");
}

export async function criarCategoria(ator: Ator, entrada: { nome: string; prefixo: string; digitos: number | string; ativa?: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    const nome = nomeValido(entrada.nome, "categoria");
    const digitos = validarDigitos(entrada.digitos);
    return prisma.$transaction(async (tx) => {
      // Uma criação por vez: nome e abreviação conferidos sem corrida.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72026120)`;
      await nomeLivre(tx, nome, null);
      const prefixo = (await validarPrefixo(tx, entrada.prefixo, null, true))!;
      const ordem = ((await tx.categoriaEquipamento.aggregate({ _max: { ordem: true } }))._max.ordem ?? 100) + 10;
      const c = await tx.categoriaEquipamento.create({
        data: { nome, prefixo, digitos, tipo: "OUTRO", regra: "SEQUENCIAL", ativa: entrada.ativa ?? true, ordem, criadaPorNome: ator.nome },
        select: SELECAO_CATEGORIA,
      });
      await registrarAuditoria(tx, auditar(ator, origem, "categoria.criar", { tipo: "categoria_equipamento", id: c.id, descricao: nome }, { prefixo, digitos, ativa: c.ativa }));
      return comoCategoria(c);
    });
  });
}

export type EntradaEdicaoCategoria = {
  id: string;
  nome: string;
  prefixo?: string | null;
  digitos?: number | string;
  ativa: boolean;
  /** Mudança de abreviação ou de dígitos: afeta a geração futura e exige confirmação. */
  confirmacao?: boolean;
};

export async function editarCategoria(ator: Ator, entrada: EntradaEdicaoCategoria) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    if (!UUID.test(entrada.id)) throw new ErroNegocio("Categoria não encontrada.");
    const nome = nomeValido(entrada.nome, "categoria");
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72026120)`;
      const atual = await tx.categoriaEquipamento.findUnique({ where: { id: entrada.id } });
      if (!atual) throw new ErroNegocio("Categoria não encontrada.");
      await nomeLivre(tx, nome, atual.id);
      const fixa = atual.regra === "CARREGADOR";
      if (fixa && !entrada.ativa) throw new ErroNegocio("O carregador nasce com o notebook: a categoria não pode ser inativada.");
      let prefixo = atual.prefixo;
      let digitos = atual.digitos;
      let regra = atual.regra;
      if (!fixa) {
        const obrigatorio = EXIGE_PREFIXO.includes(atual.tipo as Categoria) || !atual.sistema;
        prefixo = await validarPrefixo(tx, entrada.prefixo, atual.id, obrigatorio);
        digitos = entrada.digitos === undefined ? atual.digitos : validarDigitos(entrada.digitos);
        // Categoria sem identificação passa a ter sequência ao ganhar abreviação (e volta ao perdê-la).
        if (atual.regra === "SEQUENCIAL" || atual.regra === "NENHUMA") regra = prefixo ? "SEQUENCIAL" : "NENHUMA";
      }
      const mudaGeracao = prefixo !== atual.prefixo || digitos !== atual.digitos;
      if (mudaGeracao && entrada.confirmacao !== true) {
        throw new ErroNegocio("Confirme a alteração: ela vale para os próximos equipamentos e não muda os identificadores existentes.");
      }
      const c = await tx.categoriaEquipamento.update({
        where: { id: atual.id },
        data: { nome, prefixo, digitos, regra, ativa: entrada.ativa },
        select: SELECAO_CATEGORIA,
      });
      if (mudaGeracao) {
        await tx.historicoPrefixoCategoria.create({
          data: { categoriaId: atual.id, prefixoAnterior: atual.prefixo, prefixoNovo: prefixo, digitosAnterior: atual.digitos, digitosNovo: digitos, alteradoPorNome: ator.nome },
        });
      }
      await registrarAuditoria(
        tx,
        auditar(ator, origem, "categoria.editar", { tipo: "categoria_equipamento", id: atual.id, descricao: nome }, {
          nomeAnterior: atual.nome !== nome ? atual.nome : undefined,
          prefixoAnterior: atual.prefixo,
          prefixo,
          digitosAnterior: atual.digitos,
          digitos,
          ativa: entrada.ativa,
        }),
      );
      return comoCategoria(c);
    });
  });
}

/** Só categoria criada pela TI, sem equipamentos nem histórico. */
export async function excluirCategoria(ator: Ator, entrada: { id: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    if (!UUID.test(entrada.id)) throw new ErroNegocio("Categoria não encontrada.");
    return prisma.$transaction(async (tx) => {
      const c = await tx.categoriaEquipamento.findUnique({
        where: { id: entrada.id },
        include: { _count: { select: { ativos: true, kits: true, prefixos: true } } },
      });
      if (!c) throw new ErroNegocio("Categoria não encontrada.");
      if (c.sistema) throw new ErroNegocio("Categorias do catálogo inicial não são excluídas; inative-a se não for mais usada.");
      if (c._count.ativos || c._count.kits) throw new ErroNegocio("A categoria tem equipamentos vinculados: inative-a em vez de excluir.");
      if (c._count.prefixos) throw new ErroNegocio("A categoria tem histórico de abreviações: inative-a em vez de excluir.");
      // Sem equipamentos, nenhuma inspeção respondeu ao checklist da categoria: ele sai junto.
      const perguntas = (await tx.perguntaInspecao.findMany({ where: { categoriaId: c.id }, select: { id: true } })).map((p) => p.id);
      if (perguntas.length) {
        await tx.versaoPerguntaInspecao.deleteMany({ where: { perguntaId: { in: perguntas } } });
        await tx.perguntaInspecao.deleteMany({ where: { id: { in: perguntas } } });
      }
      await tx.categoriaEquipamento.delete({ where: { id: c.id } });
      await registrarAuditoria(tx, auditar(ator, origem, "categoria.excluir", { tipo: "categoria_equipamento", id: c.id, descricao: c.nome }, { prefixo: c.prefixo }));
      return { nome: c.nome };
    });
  });
}
