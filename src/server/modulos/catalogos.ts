import {
  chaveCatalogo,
  compararNomes,
  FORMATO_CODIGO_NOMENCLATURA,
  FORMATO_FREQUENCIA,
  ordenarMarcas,
  ordenarProcessadores,
  ordenarSistemas,
  rotuloSistema,
  sistemaServe,
  textoCatalogo,
  TIPOS_PADRAO_MEMORIA,
  type ItemCatalogo,
  type MarcaOpcao,
  type ModeloOpcao,
  type OpcoesCatalogos,
  type PadraoMemoriaOpcao,
  type ProcessadorOpcao,
  type SistemaOpcao,
  type TipoPadraoMemoria,
} from "@/lib/catalogos";
import { normalizarPrefixo } from "@/lib/identificacao";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import { prisma, type ClienteBanco } from "@/server/db";
import { UUID } from "./inventario-base";

/**
 * Catálogos do Inventário: marcas, modelos (por marca e categoria), processadores (com o
 * código de nomenclatura do notebook), sistemas operacionais e padrões técnicos de memória.
 * Duplicidade é conferida pela chave normalizada (Dell = DELL), com índice único no banco.
 * Itens em uso não são excluídos: a inativação só os tira das opções de novos cadastros, e
 * os equipamentos que já os usam continuam com eles. Corrigir o nome atualiza o texto dos
 * equipamentos vinculados (o equipamento mostra o item do catálogo).
 */

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

function exigirGestao(ator: Ator) {
  const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
  exigirGrupo(ator);
  return origem;
}

const auditar = (ator: Ator, origem: string, acao: string, alvo: { tipo: string; id: string; descricao: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo,
  origemPermissao: origem,
  detalhe,
});

function texto(v: string | null | undefined, rotulo: string, max: number, obrigatorio = true) {
  const t = textoCatalogo(v);
  if (!t) {
    if (obrigatorio) throw new ErroNegocio(`Informe ${rotulo}.`);
    return null;
  }
  if (t.length > max) throw new ErroNegocio(`Use no máximo ${max} caracteres em ${rotulo}.`);
  return t;
}

/** Índice único violado em paralelo (a conferência anterior não viu o outro cadastro). */
const duplicado = (erro: unknown, mensagem: string) => ((erro as { code?: string })?.code === "P2002" ? new ErroNegocio(mensagem) : erro);

const id = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);

/* Leitura */

const SELECAO = {
  marca: { id: true, nome: true, ativa: true },
  modelo: { id: true, nome: true, marcaId: true, categoriaId: true, ativa: true },
  processador: { id: true, modelo: true, fabricante: true, familia: true, codigoNomenclatura: true, ativa: true },
  sistema: { id: true, nome: true, versao: true, ativa: true, categorias: { select: { categoriaId: true } } },
  memoria: { id: true, tipo: true, valor: true, ativa: true },
} as const;

const comoProcessador = (p: { id: string; modelo: string; fabricante: string | null; familia: string | null; codigoNomenclatura: string | null; ativa: boolean }): ProcessadorOpcao => ({
  id: p.id,
  modelo: p.modelo,
  fabricante: p.fabricante,
  familia: p.familia,
  codigo: p.codigoNomenclatura,
  ativa: p.ativa,
});
const comoSistema = (s: { id: string; nome: string; versao: string | null; ativa: boolean; categorias: { categoriaId: string }[] }): SistemaOpcao => ({
  id: s.id,
  nome: s.nome,
  versao: s.versao,
  rotulo: rotuloSistema(s),
  categoriaIds: s.categorias.map((c) => c.categoriaId),
  ativa: s.ativa,
});

/** Opções dos selects do cadastro (com as inativas, que o formulário só mostra quando já escolhidas). */
export async function opcoesCatalogos(db: ClienteBanco): Promise<OpcoesCatalogos> {
  const [marcas, modelos, processadores, sistemas, memoria] = await Promise.all([
    db.marcaEquipamento.findMany({ select: SELECAO.marca }),
    db.modeloEquipamento.findMany({ select: SELECAO.modelo, orderBy: { nome: "asc" } }),
    db.processador.findMany({ select: SELECAO.processador }),
    db.sistemaOperacional.findMany({ select: SELECAO.sistema }),
    db.padraoMemoria.findMany({ select: SELECAO.memoria, orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { valor: "asc" }] }),
  ]);
  return {
    marcas: ordenarMarcas(marcas),
    modelos: ordenarMarcas(modelos),
    processadores: ordenarProcessadores(processadores.map(comoProcessador)),
    sistemas: ordenarSistemas(sistemas.map(comoSistema)),
    memoria: memoria as PadraoMemoriaOpcao[],
  };
}

/** Catálogos com a quantidade de equipamentos associados (página Catálogos do Inventário). */
export async function listarCatalogos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const [opcoes, porMarca, porModelo, porProcessador, porSistema, modelosPorMarca, categorias, ram] = await Promise.all([
      opcoesCatalogos(prisma),
      prisma.ativo.groupBy({ by: ["marcaId"], where: { marcaId: { not: null } }, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["modeloId"], where: { modeloId: { not: null } }, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["processadorId"], where: { processadorId: { not: null } }, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["sistemaOperacionalId"], where: { sistemaOperacionalId: { not: null } }, _count: { _all: true } }),
      prisma.modeloEquipamento.groupBy({ by: ["marcaId"], _count: { _all: true } }),
      prisma.categoriaEquipamento.findMany({ select: { id: true, nome: true } }),
      prisma.ativo.findMany({ where: { categoria: "MEMORIA_RAM" }, select: { tecnologia: true, formato: true, frequenciaMhz: true } }),
    ]);
    const conta = <K extends string>(lista: ({ _count: { _all: number } } & Record<K, string | null>)[], chave: K, valor: string) =>
      lista.find((x) => x[chave] === valor)?._count._all ?? 0;
    const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
    const nomeMarca = new Map(opcoes.marcas.map((m) => [m.id, m.nome]));
    // Componentes de memória que usam cada padrão (texto da peça comparado pela chave).
    const usoMemoria = (p: PadraoMemoriaOpcao) =>
      ram.filter((r) => {
        const v = p.tipo === "TECNOLOGIA" ? r.tecnologia : p.tipo === "FORMATO" ? r.formato : r.frequenciaMhz === null ? null : String(r.frequenciaMhz);
        return v !== null && chaveCatalogo(v) === chaveCatalogo(p.valor);
      }).length;
    return {
      marcas: opcoes.marcas.map((m) => ({ ...m, equipamentos: conta(porMarca, "marcaId", m.id), modelos: conta(modelosPorMarca, "marcaId", m.id) })),
      // Marca (A–Z) e, dentro dela, modelo (A–Z), sem diferenciar maiúsculas.
      modelos: opcoes.modelos
        .map((m) => ({
          ...m,
          marca: nomeMarca.get(m.marcaId) ?? "",
          categoria: nomeCategoria.get(m.categoriaId) ?? "",
          equipamentos: conta(porModelo, "modeloId", m.id),
        }))
        .sort((a, b) => compararNomes(a.marca, b.marca) || compararNomes(a.nome, b.nome) || compararNomes(a.categoria, b.categoria)),
      processadores: opcoes.processadores.map((p) => ({ ...p, equipamentos: conta(porProcessador, "processadorId", p.id) })),
      sistemas: opcoes.sistemas.map((s) => ({
        ...s,
        categorias: s.categoriaIds.map((c) => nomeCategoria.get(c) ?? "").filter(Boolean),
        equipamentos: conta(porSistema, "sistemaOperacionalId", s.id),
      })),
      memoria: opcoes.memoria.map((p) => ({ ...p, componentes: usoMemoria(p) })),
      podeGerir: pode(ator, "catalogo.gerenciar"),
    };
  });
}

export type ListaCatalogos = Awaited<ReturnType<typeof listarCatalogos>>;

/** Modelos de uma marca, com a categoria e a quantidade de equipamentos de cada um (A–Z). */
export async function modelosDaMarca(ator: Ator, marcaId: string) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const marca = id(marcaId) ? await prisma.marcaEquipamento.findUnique({ where: { id: marcaId }, select: { id: true, nome: true, ativa: true } }) : null;
    if (!marca) throw new ErroNegocio("Marca não encontrada.");
    const [modelos, semModelo] = await Promise.all([
      prisma.modeloEquipamento.findMany({
        where: { marcaId: marca.id },
        select: { id: true, nome: true, ativa: true, categoria: { select: { nome: true } }, _count: { select: { ativos: true } } },
      }),
      // Equipamentos da marca sem modelo de catálogo (carregadores criados com o notebook).
      prisma.ativo.count({ where: { marcaId: marca.id, modeloId: null } }),
    ]);
    return {
      marca,
      semModelo,
      modelos: modelos
        .map((m) => ({ id: m.id, nome: m.nome, ativa: m.ativa, categoria: m.categoria.nome, equipamentos: m._count.ativos }))
        .sort((a, b) => compararNomes(a.nome, b.nome) || compararNomes(a.categoria, b.categoria)),
    };
  });
}

export type ModelosDaMarca = Awaited<ReturnType<typeof modelosDaMarca>>;

/* Marcas */

export async function criarMarca(ator: Ator, entrada: { nome: string }): Promise<MarcaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const nome = texto(entrada.nome, "o nome da marca", 60)!;
    const chave = chaveCatalogo(nome);
    const igual = await prisma.marcaEquipamento.findUnique({ where: { chave }, select: { nome: true } });
    if (igual) throw new ErroNegocio(`A marca ${igual.nome} já está cadastrada.`);
    try {
      return await prisma.$transaction(async (tx) => {
        const m = await tx.marcaEquipamento.create({ data: { nome, chave, criadaPorNome: ator.nome }, select: SELECAO.marca });
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.marca_criar", { tipo: "marca_equipamento", id: m.id, descricao: nome }, {}));
        return m;
      });
    } catch (erro) {
      throw duplicado(erro, `A marca ${nome} já está cadastrada.`);
    }
  });
}

export async function editarMarca(ator: Ator, entrada: { id: string; nome: string; ativa: boolean }): Promise<MarcaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const atual = id(entrada.id) ? await prisma.marcaEquipamento.findUnique({ where: { id: entrada.id } }) : null;
    if (!atual) throw new ErroNegocio("Marca não encontrada.");
    const nome = texto(entrada.nome, "o nome da marca", 60)!;
    const chave = chaveCatalogo(nome);
    const igual = await prisma.marcaEquipamento.findFirst({ where: { chave, id: { not: atual.id } }, select: { nome: true } });
    if (igual) throw new ErroNegocio(`A marca ${igual.nome} já está cadastrada.`);
    try {
      return await prisma.$transaction(async (tx) => {
        const m = await tx.marcaEquipamento.update({ where: { id: atual.id }, data: { nome, chave, ativa: entrada.ativa }, select: SELECAO.marca });
        const renomeados = nome !== atual.nome ? (await tx.ativo.updateMany({ where: { marcaId: atual.id }, data: { marca: nome } })).count : 0;
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "catalogo.marca_editar", { tipo: "marca_equipamento", id: m.id, descricao: nome }, { nomeAnterior: atual.nome !== nome ? atual.nome : undefined, ativa: m.ativa, equipamentosAtualizados: renomeados }),
        );
        return m;
      });
    } catch (erro) {
      throw duplicado(erro, `A marca ${nome} já está cadastrada.`);
    }
  });
}

/* Modelos */

async function exigirMarcaECategoria(db: ClienteBanco, marcaId: string, categoriaId: string, atual?: { marcaId: string; categoriaId: string }) {
  const [marca, categoria] = await Promise.all([
    id(marcaId) ? db.marcaEquipamento.findUnique({ where: { id: marcaId } }) : null,
    id(categoriaId) ? db.categoriaEquipamento.findUnique({ where: { id: categoriaId } }) : null,
  ]);
  if (!marca) throw new ErroNegocio("Selecione a marca.");
  if (!categoria) throw new ErroNegocio("Selecione a categoria.");
  if (!marca.ativa && marca.id !== atual?.marcaId) throw new ErroNegocio(`A marca ${marca.nome} está inativa.`);
  if (!categoria.ativa && categoria.id !== atual?.categoriaId) throw new ErroNegocio(`A categoria ${categoria.nome} está inativa.`);
  return { marca, categoria };
}

export async function criarModelo(ator: Ator, entrada: { nome: string; marcaId: string; categoriaId: string }): Promise<ModeloOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const nome = texto(entrada.nome, "o nome do modelo", 80)!;
    const chave = chaveCatalogo(nome);
    const { marca, categoria } = await exigirMarcaECategoria(prisma, entrada.marcaId, entrada.categoriaId);
    const mensagem = `O modelo ${nome} já está cadastrado para ${marca.nome} em ${categoria.nome}.`;
    if (await prisma.modeloEquipamento.findUnique({ where: { marcaId_categoriaId_chave: { marcaId: marca.id, categoriaId: categoria.id, chave } } })) throw new ErroNegocio(mensagem);
    try {
      return await prisma.$transaction(async (tx) => {
        const m = await tx.modeloEquipamento.create({ data: { nome, chave, marcaId: marca.id, categoriaId: categoria.id, criadaPorNome: ator.nome }, select: SELECAO.modelo });
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.modelo_criar", { tipo: "modelo_equipamento", id: m.id, descricao: nome }, { marca: marca.nome, categoria: categoria.nome }));
        return m;
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

export async function editarModelo(ator: Ator, entrada: { id: string; nome: string; marcaId: string; categoriaId: string; ativa: boolean }): Promise<ModeloOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const atual = id(entrada.id) ? await prisma.modeloEquipamento.findUnique({ where: { id: entrada.id }, include: { _count: { select: { ativos: true } } } }) : null;
    if (!atual) throw new ErroNegocio("Modelo não encontrado.");
    const nome = texto(entrada.nome, "o nome do modelo", 80)!;
    const chave = chaveCatalogo(nome);
    const { marca, categoria } = await exigirMarcaECategoria(prisma, entrada.marcaId, entrada.categoriaId, atual);
    // Marca e categoria fazem parte do equipamento: com equipamentos vinculados, o modelo não muda de lugar.
    if ((marca.id !== atual.marcaId || categoria.id !== atual.categoriaId) && atual._count.ativos > 0) {
      throw new ErroNegocio("O modelo tem equipamentos vinculados: a marca e a categoria não podem mudar. Cadastre outro modelo.");
    }
    const mensagem = `O modelo ${nome} já está cadastrado para ${marca.nome} em ${categoria.nome}.`;
    const igual = await prisma.modeloEquipamento.findFirst({ where: { marcaId: marca.id, categoriaId: categoria.id, chave, id: { not: atual.id } } });
    if (igual) throw new ErroNegocio(mensagem);
    try {
      return await prisma.$transaction(async (tx) => {
        const m = await tx.modeloEquipamento.update({ where: { id: atual.id }, data: { nome, chave, marcaId: marca.id, categoriaId: categoria.id, ativa: entrada.ativa }, select: SELECAO.modelo });
        const renomeados = nome !== atual.nome ? (await tx.ativo.updateMany({ where: { modeloId: atual.id }, data: { modelo: nome } })).count : 0;
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "catalogo.modelo_editar", { tipo: "modelo_equipamento", id: m.id, descricao: nome }, { nomeAnterior: atual.nome !== nome ? atual.nome : undefined, ativa: m.ativa, equipamentosAtualizados: renomeados }),
        );
        return m;
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

/* Processadores */

/** Código de nomenclatura: 1 a 3 letras ou números, sem ambiguidade com os demais códigos (5 e 51 não convivem). */
async function validarCodigo(db: ClienteBanco, valor: string | null | undefined, idAtual: string | null) {
  const codigo = normalizarPrefixo(valor);
  if (!codigo) return null;
  if (!FORMATO_CODIGO_NOMENCLATURA.test(codigo)) throw new ErroNegocio("Código de nomenclatura: use de 1 a 3 letras ou números.");
  const outros = await db.processador.findMany({
    where: { codigoNomenclatura: { not: null }, ...(idAtual ? { id: { not: idAtual } } : {}) },
    select: { modelo: true, codigoNomenclatura: true },
  });
  const ambiguo = outros.find((o) => {
    const c = o.codigoNomenclatura!;
    if (c === codigo) return false;
    return (c.startsWith(codigo) && /^[0-9]+$/.test(c.slice(codigo.length))) || (codigo.startsWith(c) && /^[0-9]+$/.test(codigo.slice(c.length)));
  });
  if (ambiguo) throw new ErroNegocio(`O código ${codigo} conflita com ${ambiguo.codigoNomenclatura} (${ambiguo.modelo}) na numeração dos notebooks.`);
  return codigo;
}

type EntradaProcessador = { modelo: string; fabricante?: string | null; familia?: string | null; codigo?: string | null };

export async function criarProcessador(ator: Ator, entrada: EntradaProcessador): Promise<ProcessadorOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const modelo = texto(entrada.modelo, "o modelo do processador", 80)!;
    const chave = chaveCatalogo(modelo);
    const fabricante = texto(entrada.fabricante, "o fabricante", 40, false);
    const familia = texto(entrada.familia, "a família", 40, false);
    const mensagem = `O processador ${modelo} já está cadastrado.`;
    if (await prisma.processador.findUnique({ where: { chave } })) throw new ErroNegocio(mensagem);
    try {
      return await prisma.$transaction(async (tx) => {
        // Uma alteração de código por vez: a conferência de ambiguidade não sofre corrida.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(72026122)`;
        const codigo = await validarCodigo(tx, entrada.codigo, null);
        const p = await tx.processador.create({ data: { modelo, chave, fabricante, familia, codigoNomenclatura: codigo, criadaPorNome: ator.nome }, select: SELECAO.processador });
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.processador_criar", { tipo: "processador", id: p.id, descricao: modelo }, { fabricante, familia, codigo }));
        return comoProcessador(p);
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

export async function editarProcessador(ator: Ator, entrada: EntradaProcessador & { id: string; ativa: boolean; confirmacao?: boolean }): Promise<ProcessadorOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const atual = id(entrada.id) ? await prisma.processador.findUnique({ where: { id: entrada.id } }) : null;
    if (!atual) throw new ErroNegocio("Processador não encontrado.");
    const modelo = texto(entrada.modelo, "o modelo do processador", 80)!;
    const chave = chaveCatalogo(modelo);
    const fabricante = texto(entrada.fabricante, "o fabricante", 40, false);
    const familia = texto(entrada.familia, "a família", 40, false);
    const mensagem = `O processador ${modelo} já está cadastrado.`;
    if (await prisma.processador.findFirst({ where: { chave, id: { not: atual.id } } })) throw new ErroNegocio(mensagem);
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(72026122)`;
        const codigo = await validarCodigo(tx, entrada.codigo, atual.id);
        if (codigo !== atual.codigoNomenclatura && entrada.confirmacao !== true) {
          throw new ErroNegocio("Confirme a alteração: o código vale para os próximos notebooks e não muda os identificadores existentes.");
        }
        const p = await tx.processador.update({
          where: { id: atual.id },
          data: { modelo, chave, fabricante, familia, codigoNomenclatura: codigo, ativa: entrada.ativa },
          select: SELECAO.processador,
        });
        const renomeados = modelo !== atual.modelo ? (await tx.ativo.updateMany({ where: { processadorId: atual.id }, data: { processador: modelo } })).count : 0;
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "catalogo.processador_editar", { tipo: "processador", id: p.id, descricao: modelo }, {
            modeloAnterior: atual.modelo !== modelo ? atual.modelo : undefined,
            codigoAnterior: atual.codigoNomenclatura,
            codigo,
            ativa: p.ativa,
            equipamentosAtualizados: renomeados,
          }),
        );
        return comoProcessador(p);
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

/* Sistemas operacionais */

type EntradaSistema = { nome: string; versao?: string | null; categoriaIds?: string[] };

async function lerCategoriasSistema(db: ClienteBanco, ids: string[] | undefined) {
  const lista = [...new Set((ids ?? []).filter((x) => UUID.test(x)))];
  if (!lista.length) return [];
  const existentes = await db.categoriaEquipamento.findMany({ where: { id: { in: lista } }, select: { id: true } });
  if (existentes.length !== lista.length) throw new ErroNegocio("Categoria não encontrada.");
  return lista;
}

export async function criarSistema(ator: Ator, entrada: EntradaSistema): Promise<SistemaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const nome = texto(entrada.nome, "o nome do sistema", 60)!;
    const versao = texto(entrada.versao, "a versão ou edição", 40, false);
    const rotulo = rotuloSistema({ nome, versao });
    const chave = chaveCatalogo(rotulo);
    const mensagem = `O sistema ${rotulo} já está cadastrado.`;
    if (await prisma.sistemaOperacional.findUnique({ where: { chave } })) throw new ErroNegocio(mensagem);
    const categorias = await lerCategoriasSistema(prisma, entrada.categoriaIds);
    try {
      return await prisma.$transaction(async (tx) => {
        const s = await tx.sistemaOperacional.create({
          data: { nome, versao, chave, criadaPorNome: ator.nome, categorias: { create: categorias.map((categoriaId) => ({ categoriaId })) } },
          select: SELECAO.sistema,
        });
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.sistema_criar", { tipo: "sistema_operacional", id: s.id, descricao: rotulo }, { categorias: categorias.length }));
        return comoSistema(s);
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

export async function editarSistema(ator: Ator, entrada: EntradaSistema & { id: string; ativa: boolean }): Promise<SistemaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const atual = id(entrada.id) ? await prisma.sistemaOperacional.findUnique({ where: { id: entrada.id } }) : null;
    if (!atual) throw new ErroNegocio("Sistema operacional não encontrado.");
    const nome = texto(entrada.nome, "o nome do sistema", 60)!;
    const versao = texto(entrada.versao, "a versão ou edição", 40, false);
    const rotulo = rotuloSistema({ nome, versao });
    const chave = chaveCatalogo(rotulo);
    const mensagem = `O sistema ${rotulo} já está cadastrado.`;
    if (await prisma.sistemaOperacional.findFirst({ where: { chave, id: { not: atual.id } } })) throw new ErroNegocio(mensagem);
    const categorias = await lerCategoriasSistema(prisma, entrada.categoriaIds);
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.sistemaOperacionalCategoria.deleteMany({ where: { sistemaId: atual.id } });
        const s = await tx.sistemaOperacional.update({
          where: { id: atual.id },
          data: { nome, versao, chave, ativa: entrada.ativa, categorias: { create: categorias.map((categoriaId) => ({ categoriaId })) } },
          select: SELECAO.sistema,
        });
        const anterior = rotuloSistema(atual);
        const renomeados = rotulo !== anterior ? (await tx.ativo.updateMany({ where: { sistemaOperacionalId: atual.id }, data: { sistemaOperacional: rotulo } })).count : 0;
        await registrarAuditoria(
          tx,
          auditar(ator, origem, "catalogo.sistema_editar", { tipo: "sistema_operacional", id: s.id, descricao: rotulo }, { anterior: anterior !== rotulo ? anterior : undefined, ativa: s.ativa, categorias: categorias.length, equipamentosAtualizados: renomeados }),
        );
        return comoSistema(s);
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

/* Padrões de memória */

function valorPadrao(tipo: TipoPadraoMemoria, v: string | null | undefined) {
  const valor = texto(v, "o valor", 20)!;
  if (tipo === "FREQUENCIA" && !FORMATO_FREQUENCIA.test(valor)) throw new ErroNegocio("Frequência: informe em MHz, só números (ex.: 3200).");
  return tipo === "FREQUENCIA" ? valor : valor.toUpperCase();
}

const JA_CADASTRADO: Record<TipoPadraoMemoria, (v: string) => string> = {
  TECNOLOGIA: (v) => `A tecnologia ${v} já está cadastrada.`,
  FORMATO: (v) => `O formato ${v} já está cadastrado.`,
  FREQUENCIA: (v) => `A frequência ${v} MHz já está cadastrada.`,
};

/** Componentes de memória (RAM001...) que usam o padrão. */
async function componentesComPadrao(db: ClienteBanco, tipo: TipoPadraoMemoria, valor: string) {
  if (tipo === "FREQUENCIA") return db.ativo.count({ where: { categoria: "MEMORIA_RAM", frequenciaMhz: Number(valor) } });
  const campo = tipo === "TECNOLOGIA" ? "tecnologia" : "formato";
  return db.ativo.count({ where: { categoria: "MEMORIA_RAM", [campo]: { equals: valor, mode: "insensitive" } } });
}

export async function criarPadraoMemoria(ator: Ator, entrada: { tipo: string; valor: string }): Promise<PadraoMemoriaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const tipo = TIPOS_PADRAO_MEMORIA.find((t) => t === entrada.tipo);
    if (!tipo) throw new ErroNegocio("Selecione o tipo.");
    const valor = valorPadrao(tipo, entrada.valor);
    const chave = chaveCatalogo(valor);
    const mensagem = JA_CADASTRADO[tipo](valor);
    if (await prisma.padraoMemoria.findUnique({ where: { tipo_chave: { tipo, chave } } })) throw new ErroNegocio(mensagem);
    try {
      return await prisma.$transaction(async (tx) => {
        const ordem = ((await tx.padraoMemoria.aggregate({ where: { tipo }, _max: { ordem: true } }))._max.ordem ?? 0) + 10;
        const p = await tx.padraoMemoria.create({ data: { tipo, valor, chave, ordem, criadaPorNome: ator.nome }, select: SELECAO.memoria });
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.memoria_criar", { tipo: "padrao_memoria", id: p.id, descricao: `${tipo} ${valor}` }, {}));
        return p as PadraoMemoriaOpcao;
      });
    } catch (erro) {
      throw duplicado(erro, mensagem);
    }
  });
}

export async function editarPadraoMemoria(ator: Ator, entrada: { id: string; valor: string; ativa: boolean }): Promise<PadraoMemoriaOpcao> {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    const atual = id(entrada.id) ? await prisma.padraoMemoria.findUnique({ where: { id: entrada.id } }) : null;
    if (!atual) throw new ErroNegocio("Padrão de memória não encontrado.");
    const tipo = atual.tipo as TipoPadraoMemoria;
    const valor = valorPadrao(tipo, entrada.valor);
    const chave = chaveCatalogo(valor);
    // A peça guarda o valor técnico: em uso, o padrão não é renomeado (inative-o e cadastre outro).
    if (chave !== atual.chave && (await componentesComPadrao(prisma, tipo, atual.valor)) > 0) {
      throw new ErroNegocio("Este padrão está em uso por componentes: inative-o e cadastre o valor correto.");
    }
    if (await prisma.padraoMemoria.findFirst({ where: { tipo, chave, id: { not: atual.id } } })) throw new ErroNegocio(JA_CADASTRADO[tipo](valor));
    return prisma.$transaction(async (tx) => {
      const p = await tx.padraoMemoria.update({ where: { id: atual.id }, data: { valor, chave, ativa: entrada.ativa }, select: SELECAO.memoria });
      await registrarAuditoria(tx, auditar(ator, origem, "catalogo.memoria_editar", { tipo: "padrao_memoria", id: p.id, descricao: `${tipo} ${valor}` }, { anterior: atual.valor !== valor ? atual.valor : undefined, ativa: p.ativa }));
      return p as PadraoMemoriaOpcao;
    });
  });
}

/* Situação (ativar e inativar sem abrir o formulário) */


export async function alterarSituacaoCatalogo(ator: Ator, entrada: { item: ItemCatalogo; id: string; ativa: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const origem = exigirGestao(ator);
    if (!id(entrada.id)) throw new ErroNegocio("Item não encontrado.");
    const dados = { where: { id: entrada.id }, data: { ativa: entrada.ativa } };
    return prisma.$transaction(async (tx) => {
      let descricao: string;
      try {
        if (entrada.item === "marca") descricao = (await tx.marcaEquipamento.update(dados)).nome;
        else if (entrada.item === "modelo") descricao = (await tx.modeloEquipamento.update(dados)).nome;
        else if (entrada.item === "processador") descricao = (await tx.processador.update(dados)).modelo;
        else if (entrada.item === "sistema") descricao = rotuloSistema(await tx.sistemaOperacional.update(dados));
        else descricao = (await tx.padraoMemoria.update(dados)).valor;
      } catch (erro) {
        if ((erro as { code?: string })?.code === "P2025") throw new ErroNegocio("Item não encontrado.");
        throw erro;
      }
      await registrarAuditoria(tx, auditar(ator, origem, `catalogo.${entrada.item}_${entrada.ativa ? "ativar" : "inativar"}`, { tipo: entrada.item, id: entrada.id, descricao }, {}));
      return { descricao };
    });
  });
}

/* Referências do cadastro de equipamentos (validadas no servidor) */

type Atual = { marcaId?: string | null; modeloId?: string | null; processadorId?: string | null; sistemaOperacionalId?: string | null } | null;

/**
 * Marca e modelo do equipamento: o modelo pertence à marca e à categoria. Itens inativos só
 * valem quando o equipamento já os usa (edição de cadastro antigo).
 */
export async function resolverFabricante(db: ClienteBanco, entrada: { marcaId?: string | null; modeloId?: string | null }, categoriaId: string, opcoes: { modeloOpcional?: boolean; atual?: Atual } = {}) {
  const atual = opcoes.atual ?? null;
  const marca = id(entrada.marcaId) ? await db.marcaEquipamento.findUnique({ where: { id: entrada.marcaId! } }) : null;
  if (!marca) throw new ErroNegocio("Selecione a marca.");
  if (!marca.ativa && marca.id !== atual?.marcaId) throw new ErroNegocio(`A marca ${marca.nome} está inativa.`);
  const modelo = id(entrada.modeloId) ? await db.modeloEquipamento.findUnique({ where: { id: entrada.modeloId! } }) : null;
  if (!modelo) {
    if (opcoes.modeloOpcional && !entrada.modeloId) return { marcaId: marca.id, marca: marca.nome, modeloId: null, modelo: null };
    throw new ErroNegocio("Selecione o modelo.");
  }
  if (modelo.marcaId !== marca.id || modelo.categoriaId !== categoriaId) throw new ErroNegocio(`O modelo ${modelo.nome} não é da marca e da categoria escolhidas.`);
  if (!modelo.ativa && modelo.id !== atual?.modeloId) throw new ErroNegocio(`O modelo ${modelo.nome} está inativo.`);
  return { marcaId: marca.id, marca: marca.nome, modeloId: modelo.id, modelo: modelo.nome };
}

/** Processador do catálogo (notebook: obrigatório e com código para o identificador). */
export async function resolverProcessador(db: ClienteBanco, processadorId: string | null | undefined, atual: Atual = null) {
  if (!processadorId) return null;
  const p = id(processadorId) ? await db.processador.findUnique({ where: { id: processadorId } }) : null;
  if (!p) throw new ErroNegocio("Selecione o modelo do processador.");
  if (!p.ativa && p.id !== atual?.processadorId) throw new ErroNegocio(`O processador ${p.modelo} está inativo.`);
  return { id: p.id, modelo: p.modelo, codigo: p.codigoNomenclatura };
}

/** Sistema operacional do catálogo, respeitando a restrição de categorias quando configurada. */
export async function resolverSistema(db: ClienteBanco, sistemaId: string | null | undefined, categoriaId: string, atual: Atual = null) {
  if (!sistemaId) return null;
  const s = id(sistemaId) ? await db.sistemaOperacional.findUnique({ where: { id: sistemaId }, include: { categorias: { select: { categoriaId: true } } } }) : null;
  if (!s) throw new ErroNegocio("Selecione o sistema operacional.");
  const mesmo = s.id === atual?.sistemaOperacionalId;
  if (!s.ativa && !mesmo) throw new ErroNegocio(`O sistema ${rotuloSistema(s)} está inativo.`);
  if (!mesmo && !sistemaServe({ categoriaIds: s.categorias.map((c) => c.categoriaId) }, categoriaId)) throw new ErroNegocio(`O sistema ${rotuloSistema(s)} não está disponível para esta categoria.`);
  return { id: s.id, rotulo: rotuloSistema(s) };
}

/** Padrão técnico de memória (valor do catálogo); o valor já gravado na peça continua aceito. */
export async function resolverPadraoMemoria(db: ClienteBanco, tipo: TipoPadraoMemoria, valor: string | number | null | undefined, rotulo: string, atual?: string | number | null) {
  const t = valor === null || valor === undefined ? "" : String(valor).trim();
  if (!t) return null;
  const chave = chaveCatalogo(t);
  const p = await db.padraoMemoria.findUnique({ where: { tipo_chave: { tipo, chave } } });
  const mesmo = atual !== null && atual !== undefined && chaveCatalogo(String(atual)) === chave;
  if (!p) {
    if (mesmo) return String(atual);
    throw new ErroNegocio(`${rotulo}: escolha uma das opções do catálogo.`);
  }
  if (!p.ativa && !mesmo) throw new ErroNegocio(`${rotulo}: ${p.valor} está inativo no catálogo.`);
  return p.valor;
}
