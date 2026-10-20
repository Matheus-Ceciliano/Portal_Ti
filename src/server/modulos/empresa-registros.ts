import { cache } from "react";
import type { Prisma, SituacaoColaborador } from "@/generated/prisma/client";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, podeComEscopoGrupo } from "@/server/authz/exigir";
import type { EstadoTermo } from "@/generated/prisma/client";
import { CATEGORIAS_EQUIPAMENTO, FORA_DE_EQUIPAMENTOS, ROTULO_CATEGORIA, type Categoria, type Situacao } from "@/lib/inventario";
import { prisma } from "@/server/db";
import { rotuloTipo, SELECAO_TIPO } from "./inventario-base";

/**
 * Registros de UMA empresa (colaboradores, equipamentos, alocações e resumo), todos do banco.
 * Toda consulta recebe o id da empresa e filtra por ele; a empresa é validada antes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ABAS_EMPRESA = ["visao-geral", "colaboradores", "equipamentos", "alocacoes", "anexos"] as const;
export type AbaEmpresa = (typeof ABAS_EMPRESA)[number];

export type Paginado<T> = {
  itens: T[];
  /** Registros que atendem aos filtros. */
  total: number;
  /** Registros da empresa, sem filtros (para "x de y"). */
  totalEmpresa: number;
  pagina: number;
  paginas: number;
};

/**
 * Leitura da empresa memorizada só durante UMA renderização no servidor (React cache):
 * layout, cabeçalho e aba da página completa compartilham a consulta. Nada é guardado
 * entre requisições nem entre usuários; a permissão continua verificada a cada chamada.
 */
const buscarEmpresa = cache((empresaId: string) =>
  prisma.empresa.findUnique({
    where: { id: empresaId },
    include: { _count: { select: { colaboradores: { where: { situacao: "ATIVO" } } } } },
  }),
);

/** Empresa existente e visível ao ator; caso contrário, erro (a página responde 404/negado). */
export async function exigirEmpresa(ator: Ator, empresaId: string) {
  exigirPermissao(ator, "empresa.ver");
  if (!UUID.test(empresaId)) throw new ErroNegocio("Empresa não encontrada.");
  const empresa = await buscarEmpresa(empresaId);
  if (!empresa) throw new ErroNegocio("Empresa não encontrada.");
  return empresa;
}

function exigirGrupo(ator: Ator, permissao: "colaborador.ver" | "ativo.ver") {
  if (!podeComEscopoGrupo(ator, permissao)) throw new ErroAutorizacao(permissao, "ESCOPO_PROPRIO");
}

/* Colaboradores (banco) */

export type ColaboradorEmpresa = {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
  situacao: SituacaoColaborador;
};

export type FiltroColaboradores = {
  busca?: string;
  situacao?: SituacaoColaborador;
  departamento?: string;
  ordenar?: "nome" | "cargo" | "departamento" | "situacao";
  direcao?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
};

export async function listarColaboradoresEmpresa(
  ator: Ator,
  empresaId: string,
  f: FiltroColaboradores = {},
): Promise<Paginado<ColaboradorEmpresa> & { departamentos: string[] }> {
  return executarCasoDeUso(ator, async () => {
    await exigirEmpresa(ator, empresaId);
    exigirGrupo(ator, "colaborador.ver");
    const busca = f.busca?.trim();
    const where: Prisma.ColaboradorWhereInput = {
      empresaId,
      ...(f.situacao ? { situacao: f.situacao } : {}),
      ...(f.departamento ? { departamento: f.departamento } : {}),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { emailCorporativo: { contains: busca, mode: "insensitive" } },
              { cargo: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const porPagina = f.porPagina ?? 15;
    const direcao = f.direcao ?? "asc";
    const campo = f.ordenar ?? "nome";
    const [total, totalEmpresa, departamentos] = await Promise.all([
      prisma.colaborador.count({ where }),
      prisma.colaborador.count({ where: { empresaId } }),
      prisma.colaborador.findMany({
        where: { empresaId },
        distinct: ["departamento"],
        orderBy: { departamento: "asc" },
        select: { departamento: true },
      }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const linhas = await prisma.colaborador.findMany({
      where,
      orderBy: campo === "nome" ? { nome: direcao } : [{ [campo]: direcao }, { nome: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: { id: true, nome: true, emailCorporativo: true, cargo: true, departamento: true, situacao: true },
    });
    return {
      itens: linhas.map((c) => ({ ...c, email: c.emailCorporativo })),
      total,
      totalEmpresa,
      pagina,
      paginas,
      departamentos: departamentos.map((d) => d.departamento),
    };
  });
}

/* Equipamentos de que a empresa é proprietária (banco). Carregadores ficam na ficha do notebook. */

export type EquipamentoEmpresa = {
  id: string;
  categoria: Categoria;
  tipo: string;
  nome: string | null;
  patrimonio: string | null;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  situacao: Situacao;
  responsavel: string | null;
  responsavelId: string | null;
  miniatura: string | null;
};

export type FiltroEquipamentos = {
  busca?: string;
  categoria?: string;
  situacao?: Situacao;
  ordenar?: "patrimonio" | "modelo" | "situacao" | "responsavel";
  direcao?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
};

export async function listarEquipamentosEmpresa(
  ator: Ator,
  empresaId: string,
  f: FiltroEquipamentos = {},
): Promise<Paginado<EquipamentoEmpresa> & { categorias: { valor: string; rotulo: string }[] }> {
  return executarCasoDeUso(ator, async () => {
    await exigirEmpresa(ator, empresaId);
    exigirGrupo(ator, "ativo.ver");
    const categoria = CATEGORIAS_EQUIPAMENTO.find((c) => c === f.categoria);
    const busca = f.busca?.trim().slice(0, 80);
    const contem = { contains: busca, mode: "insensitive" as const };
    const daEmpresa: Prisma.AtivoWhereInput = { empresaId, categoria: { notIn: FORA_DE_EQUIPAMENTOS } };
    const where: Prisma.AtivoWhereInput = {
      AND: [
        daEmpresa,
        categoria ? { categoria } : {},
        f.situacao ? { situacao: f.situacao } : {},
        busca
          ? {
              OR: [
                { patrimonio: contem },
                { nomeDispositivo: contem },
                { modelo: contem },
                { marca: contem },
                { numeroSerie: contem },
                { itensAlocacao: { some: { aberto: true, alocacao: { estado: "ATIVA", colaborador: { nome: contem } } } } },
              ],
            }
          : {},
      ],
    };
    const direcao = f.direcao === "desc" ? "desc" : "asc";
    const ordem: Prisma.AtivoOrderByWithRelationInput[] =
      f.ordenar === "modelo"
        ? [{ marca: direcao }, { modelo: direcao }]
        : f.ordenar === "situacao"
          ? [{ situacao: direcao }, { patrimonio: "asc" }]
          : [{ patrimonio: { sort: direcao, nulls: "last" } }];
    const porPagina = f.porPagina ?? 15;
    const [total, totalEmpresa, categorias] = await Promise.all([
      prisma.ativo.count({ where }),
      prisma.ativo.count({ where: daEmpresa }),
      prisma.ativo.findMany({ where: daEmpresa, distinct: ["categoria"], select: { categoria: true } }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const linhas = await prisma.ativo.findMany({
      where,
      orderBy: ordem,
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        categoria: true,
        ...SELECAO_TIPO,
        nomeDispositivo: true,
        patrimonio: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        situacao: true,
        fotos: { where: { contexto: "CADASTRO", removidaEm: null }, orderBy: [{ tipo: "asc" }], take: 1, select: { id: true } },
        itensAlocacao: { where: { aberto: true, alocacao: { estado: "ATIVA" } }, take: 1, select: { alocacao: { select: { colaborador: { select: { id: true, nome: true } } } } } },
      },
    });
    return {
      itens: linhas.map((a) => {
        const responsavel = a.itensAlocacao[0]?.alocacao.colaborador ?? null;
        return {
          id: a.id,
          categoria: a.categoria,
          tipo: rotuloTipo(a),
          nome: a.nomeDispositivo,
          patrimonio: a.patrimonio,
          marca: a.marca,
          modelo: a.modelo,
          numeroSerie: a.numeroSerie,
          situacao: a.situacao,
          responsavel: responsavel?.nome ?? null,
          responsavelId: responsavel?.id ?? null,
          miniatura: a.fotos[0] ? `/api/inventario/fotos/${a.fotos[0].id}` : null,
        };
      }),
      total,
      totalEmpresa,
      pagina,
      paginas,
      categorias: categorias
        .map((c) => ({ valor: c.categoria, rotulo: ROTULO_CATEGORIA[c.categoria] }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
    };
  });
}

/*
 * Alocações ligadas à empresa, por equipamento: a empresa é a proprietária do equipamento
 * ou a do colaborador. Enquanto a TI não definir uma visão consolidada, o filtro "vínculo"
 * separa as duas leituras. A entrega física independe da assinatura do TER (Q-27).
 */

export type SituacaoAlocacao = "ENTREGUE" | "RESERVA" | "ENCERRADA";
export const SITUACOES_ALOCACAO_EMPRESA = ["ENTREGUE", "RESERVA", "ENCERRADA"] as const;
export const VINCULOS_ALOCACAO = ["PROPRIETARIA", "COLABORADOR"] as const;

export type AlocacaoEmpresa = {
  /** Item da alocação (um equipamento). */
  id: string;
  alocacaoId: string;
  numero: string;
  ativoId: string;
  equipamento: string;
  tipo: string;
  patrimonio: string;
  responsavelId: string;
  responsavel: string;
  situacao: SituacaoAlocacao;
  /** Data da entrega física; null enquanto for só reserva. */
  dataEntrega: string | null;
  /** Data de referência para período e ordenação (entrega, data prevista ou criação). */
  dataReferencia: string;
  /** Situação do TER, independente da entrega física. */
  ter: EstadoTermo | null;
  empresaProprietaria: { id: string; sigla: string; nome: string };
  empresaColaborador: { id: string; sigla: string; nome: string };
};

export type FiltroAlocacoes = {
  busca?: string;
  situacao?: SituacaoAlocacao;
  vinculo?: (typeof VINCULOS_ALOCACAO)[number];
  periodo?: "30" | "90" | "365";
  ordem?: "recentes" | "antigas";
  pagina?: number;
  porPagina?: number;
};

const SELECAO_ITEM = {
  id: true,
  aberto: true,
  empresaProprietaria: { select: { id: true, sigla: true, nome: true } },
  ativo: { select: { id: true, categoria: true, ...SELECAO_TIPO, nomeDispositivo: true, patrimonio: true, marca: true, modelo: true } },
  alocacao: {
    select: {
      id: true,
      numero: true,
      estado: true,
      entregueEm: true,
      previstaPara: true,
      criadaEm: true,
      colaborador: { select: { id: true, nome: true } },
      empresaColaborador: { select: { id: true, sigla: true, nome: true } },
      termos: { where: { tipo: "TER", estado: { not: "CANCELADO" } }, orderBy: { criadoEm: "desc" }, take: 1, select: { estado: true } },
    },
  },
} satisfies Prisma.ItemAlocacaoSelect;

type ItemSelecionado = Prisma.ItemAlocacaoGetPayload<{ select: typeof SELECAO_ITEM }>;

function paraAlocacaoEmpresa(i: ItemSelecionado): AlocacaoEmpresa {
  const a = i.alocacao;
  const situacao: SituacaoAlocacao = i.aberto ? (a.estado === "ATIVA" ? "ENTREGUE" : "RESERVA") : "ENCERRADA";
  return {
    id: i.id,
    alocacaoId: a.id,
    numero: a.numero,
    ativoId: i.ativo.id,
    equipamento: `${i.ativo.marca} ${i.ativo.modelo}`,
    tipo: rotuloTipo(i.ativo),
    patrimonio: i.ativo.patrimonio ?? i.ativo.nomeDispositivo ?? "—",
    responsavelId: a.colaborador.id,
    responsavel: a.colaborador.nome,
    situacao,
    dataEntrega: a.entregueEm?.toISOString() ?? null,
    dataReferencia: (a.entregueEm ?? a.previstaPara ?? a.criadaEm).toISOString(),
    ter: a.termos[0]?.estado ?? null,
    empresaProprietaria: i.empresaProprietaria,
    empresaColaborador: a.empresaColaborador,
  };
}

function ondeAlocacoesEmpresa(empresaId: string, f: FiltroAlocacoes, agora: Date): Prisma.ItemAlocacaoWhereInput {
  const busca = f.busca?.trim().slice(0, 80);
  const contem = { contains: busca, mode: "insensitive" as const };
  const limite = f.periodo ? new Date(agora.getTime() - Number(f.periodo) * 86_400_000) : null;
  const vinculo: Prisma.ItemAlocacaoWhereInput =
    f.vinculo === "PROPRIETARIA"
      ? { empresaProprietariaId: empresaId }
      : f.vinculo === "COLABORADOR"
        ? { alocacao: { empresaColaboradorId: empresaId } }
        : { OR: [{ empresaProprietariaId: empresaId }, { alocacao: { empresaColaboradorId: empresaId } }] };
  return {
    AND: [
      vinculo,
      // Reservas canceladas não contam como alocação.
      { alocacao: { estado: { not: "CANCELADA" } } },
      f.situacao === "ENTREGUE" ? { aberto: true, alocacao: { estado: "ATIVA" } } : {},
      f.situacao === "RESERVA" ? { aberto: true, alocacao: { estado: "RESERVADA" } } : {},
      f.situacao === "ENCERRADA" ? { aberto: null } : {},
      limite ? { alocacao: { criadaEm: { gte: limite } } } : {},
      busca
        ? {
            OR: [
              { alocacao: { numero: contem } },
              { alocacao: { colaborador: { nome: contem } } },
              { ativo: { OR: [{ patrimonio: contem }, { nomeDispositivo: contem }, { modelo: contem }, { marca: contem }] } },
            ],
          }
        : {},
    ],
  };
}

export async function listarAlocacoesEmpresa(
  ator: Ator,
  empresaId: string,
  f: FiltroAlocacoes = {},
  agora: Date = new Date(),
): Promise<Paginado<AlocacaoEmpresa>> {
  return executarCasoDeUso(ator, async () => {
    await exigirEmpresa(ator, empresaId);
    exigirGrupo(ator, "ativo.ver");
    const where = ondeAlocacoesEmpresa(empresaId, f, agora);
    const porPagina = f.porPagina ?? 15;
    const [total, totalEmpresa] = await Promise.all([
      prisma.itemAlocacao.count({ where }),
      prisma.itemAlocacao.count({ where: ondeAlocacoesEmpresa(empresaId, {}, agora) }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const itens = await prisma.itemAlocacao.findMany({
      where,
      orderBy: [{ alocacao: { criadaEm: f.ordem === "antigas" ? "asc" : "desc" } }, { alocacao: { numero: "desc" } }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: SELECAO_ITEM,
    });
    return { itens: itens.map(paraAlocacaoEmpresa), total, totalEmpresa, pagina, paginas };
  });
}

/* Resumo */

export async function obterResumoEmpresa(ator: Ator, empresaId: string) {
  return executarCasoDeUso(ator, async () => {
    const empresa = await exigirEmpresa(ator, empresaId);
    const podePessoas = podeComEscopoGrupo(ator, "colaborador.ver");
    const podeAtivos = podeComEscopoGrupo(ator, "ativo.ver");

    const pessoas = podePessoas
      ? await prisma.colaborador.groupBy({ by: ["situacao"], where: { empresaId }, _count: { _all: true } })
      : null;
    const departamentos = podePessoas
      ? (await prisma.colaborador.findMany({ where: { empresaId }, distinct: ["departamento"], select: { departamento: true } })).length
      : null;

    const porSituacao = podeAtivos
      ? await prisma.ativo.groupBy({ by: ["situacao"], where: { empresaId, categoria: { notIn: FORA_DE_EQUIPAMENTOS } }, _count: { _all: true } })
      : null;
    const contar = (s: Situacao) => porSituacao?.find((p) => p.situacao === s)?._count._all ?? 0;
    const recentes = podeAtivos
      ? await prisma.itemAlocacao.findMany({
          where: { aberto: true, alocacao: { estado: "ATIVA" }, OR: [{ empresaProprietariaId: empresaId }, { alocacao: { empresaColaboradorId: empresaId } }] },
          orderBy: { alocacao: { entregueEm: "desc" } },
          take: 4,
          select: SELECAO_ITEM,
        })
      : null;
    const alocacoesAbertas = podeAtivos
      ? await prisma.itemAlocacao.count({ where: { aberto: true, OR: [{ empresaProprietariaId: empresaId }, { alocacao: { empresaColaboradorId: empresaId } }] } })
      : null;

    return {
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        sigla: empresa.sigla,
        cnpj: empresa.cnpj,
        cidade: empresa.cidade,
        ativa: empresa.ativa,
        responsavel: empresa.responsavel,
        nomeCurtoSenha: empresa.nomeCurtoSenha,
        observacoes: empresa.observacoes,
        criadoEm: empresa.criadoEm.toISOString(),
        atualizadoEm: empresa.atualizadoEm.toISOString(),
        pessoasAtivas: empresa._count.colaboradores,
        logoUrl: empresa.logoChave ? `/api/empresas/${empresa.id}/logo?v=${empresa.atualizadoEm.getTime()}` : null,
      },
      colaboradores: pessoas
        ? {
            total: pessoas.reduce((s, p) => s + p._count._all, 0),
            ativos: pessoas.find((p) => p.situacao === "ATIVO")?._count._all ?? 0,
            afastados: pessoas.find((p) => p.situacao === "AFASTADO")?._count._all ?? 0,
            departamentos: departamentos ?? 0,
          }
        : null,
      equipamentos: porSituacao
        ? {
            total: porSituacao.reduce((s, p) => s + p._count._all, 0),
            alocados: contar("ALOCADO"),
            disponiveis: contar("DISPONIVEL"),
            manutencao: contar("MANUTENCAO"),
            reservados: contar("RESERVADO"),
          }
        : null,
      alocacoes: recentes ? { total: alocacoesAbertas ?? 0, recentes: recentes.map(paraAlocacaoEmpresa) } : null,
    };
  });
}

export type ResumoEmpresa = Awaited<ReturnType<typeof obterResumoEmpresa>>;
