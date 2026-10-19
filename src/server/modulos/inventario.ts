import type { MotivoDesvinculoCarregador, Prisma } from "@/generated/prisma/client";
import {
  CATEGORIAS,
  CATEGORIAS_CADASTRO,
  CATEGORIAS_COMPONENTE,
  COM_CONFIGURACAO,
  FORA_DE_EQUIPAMENTOS,
  FORMATO_IDENTIFICADOR,
  MOTIVOS_CARREGADOR,
  nomeCarregador,
  normalizarIdentificador,
  proximaSequencia,
  ROTULO_CATEGORIA,
  ROTULO_MOTIVO_CARREGADOR,
  situacaoAposDesvinculo,
  SITUACOES,
  type Categoria,
  type Situacao,
} from "@/lib/inventario";
import { descreverPeca, ehComponente, resumirConfiguracao, type EspecPeca, type TipoComponente } from "@/lib/componentes";
import { obterArmazenamento } from "@/server/armazenamento";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type ClienteBanco, type Transacao } from "@/server/db";
import {
  dadosFoto,
  descartarFotos,
  encerrarItem,
  gravarArquivosFotos,
  lerData,
  marcaCanonica,
  mudarSituacao,
  prepararFotos,
  registrarMovimentacao,
  rotuloAtivo,
  traduzirConflito,
  travarAtivos,
  urlFoto,
  UUID,
  type FotoEnviada,
} from "./inventario-base";
import { aplicarConfiguracaoOriginal, criarComponente, validarComponente, validarConfiguracao } from "./componentes";

/**
 * Inventário (banco do portal): lista com indicadores, ficha do equipamento, cadastro com o
 * carregador principal, edição e carregadores. Alocações e manutenções têm módulos próprios.
 */

/* Lista */

export type FiltroInventario = {
  /** Equipamentos (padrão) ou componentes internos (RAM, SSD, HD): listas e indicadores separados. */
  grupo?: "equipamentos" | "componentes";
  busca?: string;
  empresaId?: string;
  categoria?: Categoria;
  marca?: string;
  situacao?: Situacao;
  /** Componentes: capacidade (GB) e notebook em que estão instalados. */
  capacidadeGb?: number;
  notebookId?: string;
  ordenar?: "nome" | "tipo" | "marca" | "empresa" | "situacao";
  direcao?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
};

/**
 * Filtros da lista. A situação é aplicada à parte: os indicadores de situação não a usam
 * (escolher "Disponível" não zera os demais números).
 */
/** Base de cada grupo: equipamentos (sem carregadores e componentes) ou componentes internos. */
function baseGrupo(f: FiltroInventario): Prisma.AtivoWhereInput {
  if (f.grupo === "componentes") {
    return f.categoria && CATEGORIAS_COMPONENTE.includes(f.categoria) ? { categoria: f.categoria } : { categoria: { in: [...CATEGORIAS_COMPONENTE] } };
  }
  // Carregadores ficam na ficha do notebook; na lista, só com o filtro de tipo.
  return f.categoria && !CATEGORIAS_COMPONENTE.includes(f.categoria) ? { categoria: f.categoria } : { categoria: { notIn: FORA_DE_EQUIPAMENTOS } };
}

function ondeInventario(f: FiltroInventario, comSituacao = true): Prisma.AtivoWhereInput {
  const busca = f.busca?.trim().slice(0, 80);
  const contem = { contains: busca, mode: "insensitive" as const };
  const componentes = f.grupo === "componentes";
  return {
    AND: [
      baseGrupo(f),
      f.empresaId && UUID.test(f.empresaId) ? { empresaId: f.empresaId } : {},
      f.marca ? { marca: { equals: f.marca, mode: "insensitive" } } : {},
      comSituacao && f.situacao ? { situacao: f.situacao } : {},
      componentes && f.capacidadeGb ? { capacidadeGb: f.capacidadeGb } : {},
      componentes && f.notebookId && UUID.test(f.notebookId) ? { instalacoes: { some: { vigente: true, equipamentoId: f.notebookId } } } : {},
      // Patrimônio não é coluna da tabela, mas continua pesquisável.
      busca ? { OR: [{ nomeDispositivo: contem }, { patrimonio: contem }, { numeroSerie: contem }, { modelo: contem }, { marca: contem }] } : {},
    ],
  };
}

const ORDEM: Record<NonNullable<FiltroInventario["ordenar"]>, (d: "asc" | "desc") => Prisma.AtivoOrderByWithRelationInput[]> = {
  nome: (d) => [{ nomeDispositivo: { sort: d, nulls: "last" } }, { patrimonio: d }],
  tipo: (d) => [{ categoria: d }, { nomeDispositivo: { sort: "asc", nulls: "last" } }, { patrimonio: "asc" }],
  marca: (d) => [{ marca: d }, { modelo: d }],
  empresa: (d) => [{ empresa: { nome: d } }, { nomeDispositivo: { sort: "asc", nulls: "last" } }],
  situacao: (d) => [{ situacao: d }, { nomeDispositivo: { sort: "asc", nulls: "last" } }],
};

/** Alocação em aberto do equipamento: entrega (ATIVA) ou reserva, com o TER vigente. */
const SELECAO_ALOCACAO_ABERTA = {
  where: { aberto: true },
  take: 1,
  select: {
    alocacao: {
      select: {
        id: true,
        numero: true,
        estado: true,
        entregueEm: true,
        previstaPara: true,
        colaborador: { select: { id: true, nome: true, empresa: { select: { id: true, nome: true, sigla: true } } } },
        termos: {
          where: { tipo: "TER", estado: { not: "CANCELADO" } },
          orderBy: { criadoEm: "desc" },
          take: 1,
          select: { id: true, numero: true, estado: true, emitidoEm: true, assinadoRegistradoEm: true },
        },
      },
    },
  },
} satisfies Prisma.Ativo$itensAlocacaoArgs;

type AlocacaoAberta = { alocacao: Prisma.AlocacaoGetPayload<{ select: (typeof SELECAO_ALOCACAO_ABERTA)["select"]["alocacao"]["select"] }> };

/** Responsável só a partir da entrega física; reserva não torna ninguém responsável (Q-27). */
function custodia(itens: AlocacaoAberta[]) {
  const a = itens[0]?.alocacao;
  if (!a) return { responsavel: null, reserva: null, ter: null };
  const ter = a.termos[0] ?? null;
  return a.estado === "ATIVA"
    ? {
        responsavel: { id: a.colaborador.id, nome: a.colaborador.nome, empresa: a.colaborador.empresa, alocacaoId: a.id, alocacao: a.numero, entregueEm: a.entregueEm!.toISOString() },
        reserva: null,
        ter,
      }
    : { responsavel: null, reserva: { id: a.colaborador.id, nome: a.colaborador.nome, alocacaoId: a.id, alocacao: a.numero, previstaPara: a.previstaPara?.toISOString().slice(0, 10) ?? null }, ter };
}

/**
 * Lista do inventário: equipamentos e estoque (custódia, entrega e TER ficam em Alocações).
 * Escopo dos números, sempre do banco:
 * - indicadores (total e cada situação): empresa, tipo, marca e pesquisa, sem o filtro de
 *   situação;
 * - rankings (por tipo, empresa e marca): a lista filtrada, com todos os filtros.
 */
export async function listarInventario(ator: Ator, f: FiltroInventario = {}) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "ativo.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");

    const where = ondeInventario(f);
    const escopoIndicadores = ondeInventario(f, false);
    const porPagina = f.porPagina ?? 12;
    const direcao = f.direcao === "desc" ? "desc" : "asc";

    const grupo = baseGrupo({ grupo: f.grupo });
    const componentes = f.grupo === "componentes";
    const [total, totalGeral, porSituacao, porTipo, porEmpresa, porMarca, marcas, capacidades, notebooks] = await Promise.all([
      prisma.ativo.count({ where }),
      prisma.ativo.count({ where: baseGrupo(f) }),
      prisma.ativo.groupBy({ by: ["situacao"], where: escopoIndicadores, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["categoria"], where, _count: { _all: true }, orderBy: { _count: { categoria: "desc" } }, take: 6 }),
      prisma.ativo.groupBy({ by: ["empresaId"], where, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["marca"], where, _count: { _all: true }, orderBy: { _count: { marca: "desc" } }, take: 6 }),
      prisma.ativo.findMany({ where: grupo, distinct: ["marca"], orderBy: { marca: "asc" }, select: { marca: true } }),
      // Opções dos filtros de componentes: capacidades cadastradas e notebooks com peças instaladas.
      componentes ? prisma.ativo.findMany({ where: grupo, distinct: ["capacidadeGb"], orderBy: { capacidadeGb: "asc" }, select: { capacidadeGb: true } }) : [],
      componentes
        ? prisma.ativo.findMany({
            where: { pecasConfiguracao: { some: { vigente: true, componenteId: { not: null } } } },
            orderBy: { nomeDispositivo: "asc" },
            select: { id: true, nomeDispositivo: true },
          })
        : [],
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const [linhas, empresas] = await Promise.all([
      prisma.ativo.findMany({
        where,
        orderBy: ORDEM[f.ordenar ?? "nome"](direcao),
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: {
          id: true,
          categoria: true,
          nomeDispositivo: true,
          patrimonio: true,
          marca: true,
          modelo: true,
          situacao: true,
          capacidadeGb: true,
          tecnologia: true,
          interfaceConexao: true,
          formato: true,
          empresa: { select: { id: true, nome: true, sigla: true } },
          fotos: { where: { contexto: "CADASTRO" }, orderBy: [{ tipo: "asc" }, { enviadaEm: "asc" }], take: 1, select: { id: true } },
          instalacoes: { where: { vigente: true }, take: 1, select: { equipamento: { select: { id: true, nomeDispositivo: true } } } },
        },
      }),
      prisma.empresa.findMany({ where: { id: { in: porEmpresa.map((e) => e.empresaId) } }, select: { id: true, nome: true, sigla: true } }),
    ]);
    const contar = (s: Situacao) => porSituacao.find((p) => p.situacao === s)?._count._all ?? 0;

    return {
      linhas: linhas.map((a) => ({
        id: a.id,
        categoria: a.categoria,
        nome: a.nomeDispositivo,
        /** Não é exibido na tabela: identifica o item sem nome de dispositivo e serve à pesquisa. */
        patrimonio: a.patrimonio,
        marca: a.marca,
        modelo: a.modelo,
        situacao: a.situacao,
        empresa: a.empresa,
        miniatura: a.fotos[0] ? urlFoto(a.fotos[0].id) : null,
        /** Componente: especificação e o notebook em que está instalado. */
        especificacao: ehComponente(a.categoria) && a.capacidadeGb ? descreverPeca({ ...a, tipo: a.categoria as TipoComponente, capacidadeGb: a.capacidadeGb }) : null,
        formato: a.formato,
        instaladoEm: a.instalacoes[0] ? { id: a.instalacoes[0].equipamento.id, nome: a.instalacoes[0].equipamento.nomeDispositivo ?? "Notebook" } : null,
      })),
      total,
      totalGeral,
      pagina,
      paginas,
      marcas: marcas.map((m) => m.marca),
      capacidades: capacidades.map((c) => c.capacidadeGb).filter((c): c is number => c !== null),
      notebooks: notebooks.map((n) => ({ id: n.id, nome: n.nomeDispositivo ?? "Notebook" })),
      indicadores: {
        total: porSituacao.reduce((s, p) => s + p._count._all, 0),
        disponiveis: contar("DISPONIVEL"),
        alocados: contar("ALOCADO"),
        reservados: contar("RESERVADO"),
        manutencao: contar("MANUTENCAO"),
        emAvaliacao: contar("DEVOLVIDO_EM_AVALIACAO"),
        baixados: contar("BAIXADO"),
        instalados: contar("INSTALADO"),
        porEmpresa: porEmpresa
          .map((e) => ({ ...empresas.find((x) => x.id === e.empresaId)!, total: e._count._all }))
          .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR")),
        porTipo: porTipo.map((t) => ({ categoria: t.categoria, total: t._count._all })),
        porMarca: porMarca.map((m) => ({ marca: m.marca, total: m._count._all })),
      },
    };
  });
}

export type ResultadoInventario = Awaited<ReturnType<typeof listarInventario>>;
export type LinhaInventario = ResultadoInventario["linhas"][number];

/* Ficha */

const iso = (d: Date | null) => d?.toISOString() ?? null;
const especPeca = (p: { tipo: TipoComponente; capacidadeGb: number; tecnologia: string | null; interfaceConexao: string | null; formato: string | null }): EspecPeca => ({
  tipo: p.tipo,
  capacidadeGb: p.capacidadeGb,
  tecnologia: p.tecnologia,
  interfaceConexao: p.interfaceConexao,
  formato: p.formato,
});
const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

export async function obterEquipamento(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "ativo.ver");
    const a = UUID.test(id)
      ? await prisma.ativo.findUnique({
          where: { id },
          include: {
            empresa: { select: { id: true, nome: true, sigla: true } },
            notebook: { select: { id: true, nomeDispositivo: true, patrimonio: true, modelo: true } },
            carregadores: {
              orderBy: { sequenciaCarregador: "asc" },
              select: { id: true, nomeDispositivo: true, patrimonio: true, sequenciaCarregador: true, situacao: true, desvinculadoEm: true, motivoDesvinculo: true, marca: true, modelo: true },
            },
            fotos: { orderBy: [{ enviadaEm: "asc" }, { tipo: "asc" }], select: { id: true, tipo: true, contexto: true, enviadaEm: true, enviadaPorNome: true, manutencaoId: true } },
            movimentacoes: { orderBy: { realizadoEm: "desc" }, take: 60 },
            itensAlocacao: SELECAO_ALOCACAO_ABERTA,
            manutencoes: { orderBy: { abertaEm: "desc" } },
            transferencias: { where: { pendente: true }, take: 1 },
            pecasConfiguracao: {
              where: { vigente: true },
              orderBy: [{ tipo: "asc" }, { instaladaEm: "asc" }],
              include: { componente: { select: { id: true, nomeDispositivo: true, marca: true, modelo: true } } },
            },
            intervencoes: { orderBy: { realizadaEm: "desc" }, take: 50 },
            instalacoes: { orderBy: { instaladaEm: "desc" }, include: { equipamento: { select: { id: true, nomeDispositivo: true } } } },
          },
        })
      : null;
    if (!a) throw new ErroNegocio("Equipamento não encontrado.");
    const pendente = a.transferencias[0] ?? null;
    const { responsavel, reserva, ter } = custodia(a.itensAlocacao);
    // Escopo próprio: só o equipamento entregue à própria pessoa.
    if (escopo !== "GRUPO" && responsavel?.id !== ator.colaboradorId) throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");

    const fotosDe = (manutencaoId: string | null) => a.fotos.filter((f) => f.manutencaoId === manutencaoId);
    return {
      id: a.id,
      categoria: a.categoria,
      nome: a.nomeDispositivo,
      patrimonio: a.patrimonio,
      empresa: a.empresa,
      marca: a.marca,
      modelo: a.modelo,
      numeroSerie: a.numeroSerie,
      processador: a.processador,
      memoriaRam: a.memoriaRam,
      armazenamento: a.armazenamento,
      sistemaOperacional: a.sistemaOperacional,
      dataAquisicao: dia(a.dataAquisicao),
      garantiaAte: dia(a.garantiaAte),
      observacoes: a.observacoes,
      situacao: a.situacao,
      situacaoDesde: a.situacaoDesde.toISOString(),
      criadoEm: a.criadoEm.toISOString(),
      criadoPorNome: a.criadoPorNome,
      atualizadoEm: a.atualizadoEm.toISOString(),
      fotos: fotosDe(null).map((f) => ({ id: f.id, tipo: f.tipo, contexto: f.contexto, url: urlFoto(f.id), enviadaEm: f.enviadaEm.toISOString(), enviadaPorNome: f.enviadaPorNome })),
      responsavel,
      reserva,
      ter: ter && { id: ter.id, numero: ter.numero, estado: ter.estado, emitidoEm: iso(ter.emitidoEm), assinadoEm: iso(ter.assinadoRegistradoEm) },
      notebook: a.notebook,
      sequenciaCarregador: a.sequenciaCarregador,
      desvinculadoEm: iso(a.desvinculadoEm),
      motivoDesvinculo: a.motivoDesvinculo,
      carregadores: a.carregadores.map((c) => ({
        id: c.id,
        nome: c.nomeDispositivo,
        patrimonio: c.patrimonio,
        sequencia: c.sequenciaCarregador!,
        situacao: c.situacao,
        marca: c.marca,
        modelo: c.modelo,
        desvinculadoEm: iso(c.desvinculadoEm),
        motivoDesvinculo: c.motivoDesvinculo,
      })),
      /** Transferência de colaborador reservada: a custódia atual continua até a entrega física. */
      transferenciaPendente: pendente && {
        id: pendente.id,
        colaborador: { id: pendente.colaboradorDestinoId!, nome: pendente.colaboradorDestinoNome! },
        previstaPara: dia(pendente.previstaPara),
        motivo: pendente.motivo,
        registradaEm: pendente.criadaEm.toISOString(),
        registradaPorNome: pendente.realizadaPorNome,
      },
      /** Notebook: configuração atual (peças vigentes), peças individualizadas e histórico de intervenções. */
      componentesInternos:
        a.categoria === "NOTEBOOK"
          ? {
              resumo: resumirConfiguracao(a.pecasConfiguracao.map(especPeca)),
              /** Sem peças nem intervenções: só o texto antigo da ficha (ou nada). */
              estruturada: a.pecasConfiguracao.length > 0 || a.intervencoes.length > 0,
              /** A configuração original só é corrigida antes de qualquer instalação, remoção ou substituição. */
              podeAjustarOriginal: !a.intervencoes.some((i) => i.tipo !== "CONFIGURACAO_ORIGINAL"),
              pecas: a.pecasConfiguracao.map((p) => ({
                id: p.id,
                tipo: p.tipo,
                descricao: descreverPeca(especPeca(p)),
                capacidadeGb: p.capacidadeGb,
                tecnologia: p.tecnologia,
                interfaceConexao: p.interfaceConexao,
                formato: p.formato,
                original: p.original,
                componente: p.componente ? { id: p.componente.id, nome: p.componente.nomeDispositivo!, fabricante: `${p.componente.marca} ${p.componente.modelo}` } : null,
                instaladaEm: p.instaladaEm.toISOString(),
                instaladaPorNome: p.instaladaPorNome,
              })),
              intervencoes: a.intervencoes.map((i) => ({
                id: i.id,
                tipo: i.tipo,
                motivo: i.motivo,
                anterior: i.configuracaoAnterior,
                resultante: i.configuracaoResultante,
                colaboradorNome: i.colaboradorNome,
                alocacaoNumero: i.alocacaoNumero,
                realizadaEm: i.realizadaEm.toISOString(),
                realizadaPorNome: i.realizadaPorNome,
              })),
            }
          : null,
      /** Componente (RAM, SSD, HD): especificação e instalações (atual e anteriores). */
      componente: ehComponente(a.categoria)
        ? {
            capacidadeGb: a.capacidadeGb!,
            tecnologia: a.tecnologia,
            interfaceConexao: a.interfaceConexao,
            formato: a.formato,
            frequenciaMhz: a.frequenciaMhz,
            especificacao: descreverPeca(especPeca({ ...a, tipo: a.categoria as TipoComponente, capacidadeGb: a.capacidadeGb! })),
            instalacoes: a.instalacoes.map((i) => ({
              id: i.id,
              notebook: { id: i.equipamento.id, nome: i.equipamento.nomeDispositivo ?? "Notebook" },
              vigente: i.vigente === true,
              original: i.original,
              instaladaEm: i.instaladaEm.toISOString(),
              removidaEm: iso(i.removidaEm),
              motivoRemocao: i.motivoRemocao,
              destino: i.destinoRemocao,
            })),
          }
        : null,
      movimentacoes: a.movimentacoes.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        situacaoAnterior: m.situacaoAnterior,
        situacaoNova: m.situacaoNova,
        colaboradorId: m.colaboradorId,
        colaboradorNome: m.colaboradorNome,
        alocacaoId: m.alocacaoId,
        realizadoPorNome: m.realizadoPorNome,
        realizadoEm: m.realizadoEm.toISOString(),
        observacao: m.observacao,
      })),
      manutencoes: a.manutencoes.map((m) => ({
        id: m.id,
        aberta: m.aberta === true,
        motivo: m.motivo,
        observacoes: m.observacoes,
        abertaEm: m.abertaEm.toISOString(),
        abertaPorNome: m.abertaPorNome,
        recolhidoDeNome: m.recolhidoDeNome,
        concluidaEm: iso(m.concluidaEm),
        concluidaPorNome: m.concluidaPorNome,
        servicoRealizado: m.servicoRealizado,
        resultado: m.resultado,
        fotos: fotosDe(m.id).map((f) => ({ id: f.id, tipo: f.tipo, contexto: f.contexto, url: urlFoto(f.id), enviadaEm: f.enviadaEm.toISOString(), enviadaPorNome: f.enviadaPorNome })),
      })),
    };
  });
}

export type FichaEquipamento = Awaited<ReturnType<typeof obterEquipamento>>;

/* Cadastro e edição */

export type DadosEquipamento = {
  categoria: string;
  nomeDispositivo?: string | null;
  patrimonio?: string | null;
  empresaId: string;
  marca: string;
  modelo: string;
  numeroSerie?: string | null;
  processador?: string | null;
  memoriaRam?: string | null;
  armazenamento?: string | null;
  sistemaOperacional?: string | null;
  dataAquisicao?: string | null;
  garantiaAte?: string | null;
  observacoes?: string | null;
  /** Notebook: configuração original estruturada (só especificação; nenhuma peça física é criada). */
  configuracao?: unknown;
  /** Componente (RAM, SSD, HD): a identificação (RAM001...) é automática. */
  capacidadeGb?: number | string | null;
  tecnologia?: string | null;
  interfaceConexao?: string | null;
  formato?: string | null;
  frequenciaMhz?: number | string | null;
};

const textoLivre = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t || null;
};

function identificador(v: string | null | undefined, rotulo: string, obrigatorio: boolean) {
  const t = normalizarIdentificador(v);
  if (!t) {
    if (obrigatorio) throw new ErroNegocio(`Informe ${rotulo}.`);
    return null;
  }
  if (!FORMATO_IDENTIFICADOR.test(t)) throw new ErroNegocio(`${rotulo[0].toUpperCase()}${rotulo.slice(1)}: use letras sem acento, números, hífen, ponto ou barra (até 40).`);
  return t;
}

async function validarDados(db: ClienteBanco, d: DadosEquipamento, categoria: Categoria) {
  const empresa = UUID.test(d.empresaId) ? await db.empresa.findUnique({ where: { id: d.empresaId }, select: { id: true, ativa: true, nome: true } }) : null;
  if (!empresa) throw new ErroNegocio("Selecione a empresa proprietária.");
  const marca = textoLivre(d.marca, 60, "Marca");
  const modelo = textoLivre(d.modelo, 80, "Modelo");
  if (!marca) throw new ErroNegocio("Informe a marca.");
  if (!modelo) throw new ErroNegocio("Informe o modelo.");
  const dataAquisicao = lerData(d.dataAquisicao, "Data de aquisição");
  const garantiaAte = lerData(d.garantiaAte, "Garantia");
  if (dataAquisicao && dataAquisicao.getTime() > Date.now()) throw new ErroNegocio("Data de aquisição: não pode estar no futuro.");
  if (dataAquisicao && garantiaAte && garantiaAte < dataAquisicao) throw new ErroNegocio("Garantia: a data final é anterior à aquisição.");
  const configuracao = COM_CONFIGURACAO.includes(categoria);
  return {
    empresa,
    dados: {
      marca: await marcaCanonica(db, marca),
      modelo,
      numeroSerie: identificador(d.numeroSerie, "número de série", false),
      processador: configuracao ? textoLivre(d.processador, 80, "Processador") : null,
      // Notebook: memória e armazenamento refletem as peças da configuração (nunca texto solto).
      ...(categoria === "NOTEBOOK"
        ? {}
        : {
            memoriaRam: configuracao ? textoLivre(d.memoriaRam, 40, "Memória RAM") : null,
            armazenamento: configuracao ? textoLivre(d.armazenamento, 60, "Armazenamento") : null,
          }),
      sistemaOperacional: configuracao ? textoLivre(d.sistemaOperacional, 60, "Sistema operacional") : null,
      dataAquisicao,
      garantiaAte,
      observacoes: textoLivre(d.observacoes, 1000, "Observações"),
    },
  };
}

/** Dados do componente para atualização (a categoria não muda na edição). */
function semCategoria<T extends { categoria: string }>(d: T): Omit<T, "categoria"> {
  const { categoria: _categoria, ...resto } = d;
  void _categoria;
  return resto;
}

/** Carregador do notebook na próxima posição livre (com o notebook travado na transação). */
async function criarCarregador(
  tx: Transacao,
  ator: Ator,
  notebook: { id: string; nomeDispositivo: string | null; empresaId: string; marca: string },
  observacao: string,
) {
  if (!notebook.nomeDispositivo) throw new ErroNegocio("Informe o nome do dispositivo do notebook antes de vincular carregadores.");
  const usadas = await tx.ativo.findMany({ where: { notebookId: notebook.id }, select: { sequenciaCarregador: true } });
  const sequencia = proximaSequencia(usadas.map((u) => u.sequenciaCarregador!));
  const carregador = await tx.ativo.create({
    data: {
      categoria: "CARREGADOR",
      nomeDispositivo: nomeCarregador(notebook.nomeDispositivo, sequencia),
      empresaId: notebook.empresaId,
      marca: notebook.marca,
      modelo: "Carregador",
      notebookId: notebook.id,
      sequenciaCarregador: sequencia,
      criadoPorNome: ator.nome,
    },
  });
  await registrarMovimentacao(tx, ator, carregador.id, { tipo: "CARREGADOR_VINCULADO", situacaoNova: "DISPONIVEL", observacao: `${observacao} (${notebook.nomeDispositivo}).` });
  await registrarMovimentacao(tx, ator, notebook.id, { tipo: "CARREGADOR_VINCULADO", observacao: `${carregador.nomeDispositivo}: ${observacao.toLowerCase()}.` });
  return carregador;
}

/**
 * Cadastro atômico: equipamento, carregador principal (notebook → <nome>C1), fotos e
 * histórico na mesma transação. O mesmo envio repetido devolve o cadastro já feito.
 */
export async function cadastrarEquipamento(ator: Ator, entrada: { dados: DadosEquipamento; fotos?: FotoEnviada[]; chaveRequisicao?: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.criar");
    if (entrada.fotos?.some((f) => f.dados.length)) exigirPermissao(ator, "evidencia.enviar");
    const chave = entrada.chaveRequisicao && UUID.test(entrada.chaveRequisicao) ? entrada.chaveRequisicao : null;
    if (chave) {
      const ja = await prisma.ativo.findUnique({ where: { chaveRequisicao: chave }, select: { id: true } });
      if (ja) return { id: ja.id, repetido: true };
    }

    const categoria = CATEGORIAS_CADASTRO.find((c) => c === entrada.dados.categoria);
    if (!categoria) throw new ErroNegocio("Selecione a categoria.");
    // Componente (RAM, SSD, HD): identificação automática (RAM001...), sem patrimônio.
    const componente = ehComponente(categoria);
    const nomeDispositivo = componente ? null : identificador(entrada.dados.nomeDispositivo, "o nome do dispositivo", categoria === "NOTEBOOK");
    const patrimonio = componente ? null : identificador(entrada.dados.patrimonio, "o patrimônio", true);
    const { empresa, dados } = await validarDados(prisma, entrada.dados, categoria);
    if (!empresa.ativa) throw new ErroNegocio("A empresa proprietária está inativa.");
    const especificacao = componente ? await validarComponente(prisma, { ...entrada.dados, categoria, capacidadeGb: entrada.dados.capacidadeGb ?? "" }) : null;
    const configuracao = categoria === "NOTEBOOK" ? validarConfiguracao(entrada.dados.configuracao) : null;
    const fotos = prepararFotos(entrada.fotos ?? []);
    await gravarArquivosFotos(fotos);

    try {
      const id = await prisma.$transaction(async (tx) => {
        let ativo;
        if (especificacao) {
          ativo = await criarComponente(tx, ator, especificacao, empresa.id, `Empresa proprietária: ${empresa.nome}.`, { chaveRequisicao: chave });
        } else {
          ativo = await tx.ativo.create({
            data: { categoria, nomeDispositivo, patrimonio, empresaId: empresa.id, ...dados, chaveRequisicao: chave, criadoPorNome: ator.nome },
          });
          await registrarMovimentacao(tx, ator, ativo.id, { tipo: "CADASTRO", situacaoNova: "DISPONIVEL", observacao: `Empresa proprietária: ${empresa.nome}.` });
        }
        if (categoria === "NOTEBOOK") {
          await criarCarregador(tx, ator, ativo, "Carregador principal criado com o notebook");
          // Só a especificação: nenhuma peça física (RAM001, SSD001...) nasce do cadastro.
          if (configuracao) await aplicarConfiguracaoOriginal(tx, ator, ativo, configuracao);
        }
        if (fotos.length) await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, ativo.id, ator), contexto: "CADASTRO" as const })) });
        await registrarAuditoria(tx, {
          acao: "ativo.criar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: ativo.id, descricao: rotuloAtivo(ativo) },
          origemPermissao: origem,
          detalhe: { categoria, empresa: empresa.nome, fotos: fotos.length, carregadorPrincipal: categoria === "NOTEBOOK", configuracaoOriginal: Boolean(configuracao) },
        });
        return ativo.id;
      });
      return { id, repetido: false };
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      // Envio repetido em paralelo: o outro já gravou (o conflito pode surgir em qualquer campo único).
      if (chave) {
        const ja = await prisma.ativo.findUnique({ where: { chaveRequisicao: chave }, select: { id: true } });
        if (ja) return { id: ja.id, repetido: true };
      }
      throw traduzirConflito(erro);
    }
  });
}

/**
 * Edição dos dados cadastrais. Categoria, situação, empresa proprietária, responsável e
 * alocações não mudam aqui: a empresa e o colaborador só mudam pelas transferências, com
 * histórico e auditoria. Renomear o notebook renomeia os carregadores vinculados.
 */
export async function editarEquipamento(ator: Ator, entrada: { id: string; dados: DadosEquipamento; fotos?: FotoEnviada[] }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    if (entrada.fotos?.some((f) => f.dados.length)) exigirPermissao(ator, "evidencia.enviar");
    const atual = UUID.test(entrada.id) ? await prisma.ativo.findUnique({ where: { id: entrada.id } }) : null;
    if (!atual) throw new ErroNegocio("Equipamento não encontrado.");
    if (entrada.dados.empresaId && entrada.dados.empresaId !== atual.empresaId) {
      throw new ErroNegocio("A empresa proprietária só muda pela transferência entre empresas, na ficha do equipamento.");
    }
    const carregador = atual.categoria === "CARREGADOR";
    const componente = ehComponente(atual.categoria);
    const nomeDispositivo =
      carregador || componente ? atual.nomeDispositivo : identificador(entrada.dados.nomeDispositivo, "o nome do dispositivo", atual.categoria === "NOTEBOOK");
    const patrimonio = componente
      ? atual.patrimonio
      : carregador
        ? identificador(entrada.dados.patrimonio, "o patrimônio", false)
        : identificador(entrada.dados.patrimonio, "o patrimônio", true);
    const { dados } = await validarDados(prisma, { ...entrada.dados, empresaId: atual.empresaId }, atual.categoria);
    const especificacao = componente
      ? await validarComponente(prisma, { ...entrada.dados, categoria: atual.categoria, capacidadeGb: entrada.dados.capacidadeGb ?? "" })
      : null;
    // Peça instalada: a especificação fica igual à registrada no notebook até a remoção.
    if (
      especificacao &&
      atual.situacao === "INSTALADO" &&
      (["capacidadeGb", "tecnologia", "interfaceConexao", "formato"] as const).some((k) => (especificacao.dados[k] ?? null) !== (atual[k] ?? null))
    ) {
      throw new ErroNegocio("Componente instalado: remova-o do notebook para corrigir a especificação.");
    }
    const configuracao = atual.categoria === "NOTEBOOK" ? validarConfiguracao(entrada.dados.configuracao) : null;
    const fotos = prepararFotos(entrada.fotos ?? []);
    await gravarArquivosFotos(fotos);

    try {
      await prisma.$transaction(async (tx) => {
        await travarAtivos(tx, [atual.id]);
        const novo = especificacao ? semCategoria(especificacao.dados) : { nomeDispositivo, patrimonio, ...dados };
        const antes: Record<string, unknown> = atual;
        const alterados = Object.entries(novo)
          .filter(([k, v]) => String(antes[k] instanceof Date ? (antes[k] as Date).toISOString() : (antes[k] ?? "")) !== String(v instanceof Date ? v.toISOString() : (v ?? "")))
          .map(([k]) => k);
        await tx.ativo.update({ where: { id: atual.id }, data: novo });
        // Configuração original: só antes de qualquer intervenção nos componentes (o caso de uso confere).
        if (configuracao) await aplicarConfiguracaoOriginal(tx, ator, atual, configuracao);

        const vinculados = atual.categoria === "NOTEBOOK" ? await tx.ativo.findMany({ where: { notebookId: atual.id, desvinculadoEm: null } }) : [];
        if (nomeDispositivo && nomeDispositivo !== atual.nomeDispositivo) {
          for (const c of vinculados) {
            await tx.ativo.update({ where: { id: c.id }, data: { nomeDispositivo: nomeCarregador(nomeDispositivo, c.sequenciaCarregador!) } });
          }
        }
        if (alterados.length || fotos.length) {
          await registrarMovimentacao(tx, ator, atual.id, {
            tipo: "EDICAO",
            observacao: fotos.length ? `${fotos.length} ${fotos.length === 1 ? "foto incluída" : "fotos incluídas"}.` : null,
          });
        }
        if (fotos.length) await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, atual.id, ator), contexto: "CADASTRO" as const })) });
        await registrarAuditoria(tx, {
          acao: "ativo.editar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: atual.id, descricao: rotuloAtivo({ ...atual, nomeDispositivo, patrimonio }) },
          origemPermissao: origem,
          detalhe: { campos: alterados, fotosIncluidas: fotos.length },
        });
      });
      return { id: atual.id };
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      throw traduzirConflito(erro);
    }
  });
}

/* Carregadores */

/** Carregador adicional (C2, C3...) ou o principal de um notebook que ainda não tem. */
export async function adicionarCarregador(ator: Ator, entrada: { notebookId: string; observacao?: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    if (!UUID.test(entrada.notebookId)) throw new ErroNegocio("Notebook não encontrado.");
    const observacao = textoLivre(entrada.observacao, 300, "Observação");
    try {
      return await prisma.$transaction(async (tx) => {
        await travarAtivos(tx, [entrada.notebookId]);
        const notebook = await tx.ativo.findUnique({ where: { id: entrada.notebookId } });
        if (!notebook || notebook.categoria !== "NOTEBOOK") throw new ErroNegocio("Notebook não encontrado.");
        if (notebook.situacao === "BAIXADO") throw new ErroNegocio("Notebook baixado não recebe carregadores.");
        const temVinculado = (await tx.ativo.count({ where: { notebookId: notebook.id, desvinculadoEm: null } })) > 0;
        const carregador = await criarCarregador(tx, ator, notebook, observacao ?? (temVinculado ? "Carregador adicional" : "Carregador principal"));
        await registrarAuditoria(tx, {
          acao: "ativo.carregador_vincular",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: carregador.id, descricao: carregador.nomeDispositivo ?? undefined },
          origemPermissao: origem,
          detalhe: { notebook: notebook.nomeDispositivo, sequencia: carregador.sequenciaCarregador },
        });
        return { id: carregador.id, nome: carregador.nomeDispositivo! };
      });
    } catch (erro) {
      throw traduzirConflito(erro);
    }
  });
}

/**
 * Troca, perda ou defeito: o vínculo é encerrado e preservado; perdido vira baixado e os
 * demais vão para avaliação (nunca direto para disponível). O substituto recebe a próxima
 * posição e, se o carregador estava entregue, entra na mesma alocação. O último carregador
 * vinculado só sai com substituto: todo notebook mantém um carregador principal.
 */
export async function desvincularCarregador(
  ator: Ator,
  entrada: { carregadorId: string; motivo: string; observacao?: string; substituir: boolean },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    exigirPermissao(ator, "ativo.transicionar");
    const motivo = MOTIVOS_CARREGADOR.find((m) => m === entrada.motivo);
    if (!motivo) throw new ErroNegocio("Selecione o motivo.");
    if (motivo === "PERDA") exigirPermissao(ator, "ativo.baixar");
    const observacao = textoLivre(entrada.observacao, 500, "Observação");
    if (!observacao) throw new ErroNegocio("Descreva o que aconteceu com o carregador.");
    if (!UUID.test(entrada.carregadorId)) throw new ErroNegocio("Carregador não encontrado.");

    try {
      return await prisma.$transaction(async (tx) => {
        const previo = await tx.ativo.findUnique({ where: { id: entrada.carregadorId }, select: { notebookId: true } });
        if (!previo?.notebookId) throw new ErroNegocio("Carregador não encontrado.");
        await travarAtivos(tx, [previo.notebookId, entrada.carregadorId]);
        const carregador = await tx.ativo.findUniqueOrThrow({
          where: { id: entrada.carregadorId },
          include: { notebook: true, itensAlocacao: { where: { aberto: true }, include: { alocacao: { include: { colaborador: { select: { id: true, nome: true } } } } } } },
        });
        const notebook = carregador.notebook!;
        if (carregador.desvinculadoEm) throw new ErroNegocio("Este carregador já foi desvinculado.");
        if (carregador.situacao === "RESERVADO" || carregador.situacao === "MANUTENCAO") {
          throw new ErroNegocio(carregador.situacao === "RESERVADO" ? "Cancele a reserva do carregador antes." : "Conclua a manutenção do carregador antes.");
        }
        const outros = await tx.ativo.count({ where: { notebookId: notebook.id, desvinculadoEm: null, NOT: { id: carregador.id } } });
        if (!entrada.substituir && outros === 0) throw new ErroNegocio("O notebook ficaria sem carregador vinculado: registre o substituto.");

        const agora = new Date();
        const item = carregador.itensAlocacao[0];
        const entregue = item && item.alocacao.estado === "ATIVA" ? item : null;
        const descricao = `${ROTULO_MOTIVO_CARREGADOR[motivo]}: ${observacao}`;
        await tx.ativo.update({ where: { id: carregador.id }, data: { desvinculadoEm: agora, motivoDesvinculo: motivo as MotivoDesvinculoCarregador } });
        if (entregue) await encerrarItem(tx, ator, entregue.id, "SUBSTITUICAO", agora);
        const destino = situacaoAposDesvinculo(motivo);
        const rotulo = carregador.nomeDispositivo ?? "Carregador";
        if (destino !== carregador.situacao) {
          await mudarSituacao(tx, ator, { id: carregador.id, situacao: carregador.situacao, rotulo }, destino, {
            tipo: "CARREGADOR_DESVINCULADO",
            colaborador: entregue?.alocacao.colaborador,
            alocacaoId: entregue?.alocacao.id,
            observacao: descricao,
            quando: agora,
          });
        } else {
          await registrarMovimentacao(tx, ator, carregador.id, { tipo: "CARREGADOR_DESVINCULADO", observacao: descricao, quando: agora });
        }
        await registrarMovimentacao(tx, ator, notebook.id, { tipo: "CARREGADOR_DESVINCULADO", observacao: `${rotulo} — ${descricao}`, quando: agora });

        let substituto: { id: string; nome: string } | null = null;
        if (entrada.substituir) {
          const novo = await criarCarregador(tx, ator, notebook, `Substitui ${rotulo}`);
          substituto = { id: novo.id, nome: novo.nomeDispositivo! };
          if (entregue) {
            // A pessoa recebe o substituto em troca: mesma alocação, entrega registrada agora.
            await tx.itemAlocacao.create({ data: { alocacaoId: entregue.alocacaoId, ativoId: novo.id, empresaProprietariaId: novo.empresaId } });
            await mudarSituacao(tx, ator, { id: novo.id, situacao: "DISPONIVEL", rotulo: substituto.nome }, "ALOCADO", {
              tipo: "ENTREGA",
              colaborador: entregue.alocacao.colaborador,
              alocacaoId: entregue.alocacaoId,
              observacao: `Entregue em substituição a ${rotulo}.`,
              quando: agora,
            });
          }
        }
        await registrarAuditoria(tx, {
          acao: "ativo.carregador_desvincular",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: carregador.id, descricao: rotulo },
          origemPermissao: origem,
          detalhe: { motivo, notebook: notebook.nomeDispositivo, substituto: substituto?.nome ?? null, estavaEntregue: Boolean(entregue) },
        });
        return { substituto };
      });
    } catch (erro) {
      throw traduzirConflito(erro);
    }
  });
}

/** Equipamento devolvido: depois da avaliação, volta a ficar disponível. */
export async function liberarAposAvaliacao(ator: Ator, entrada: { ativoId: string; observacao: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.transicionar");
    const observacao = textoLivre(entrada.observacao, 500, "Observação");
    if (!observacao) throw new ErroNegocio("Registre o resultado da avaliação.");
    if (!UUID.test(entrada.ativoId)) throw new ErroNegocio("Equipamento não encontrado.");
    await prisma.$transaction(async (tx) => {
      await travarAtivos(tx, [entrada.ativoId]);
      const a = await tx.ativo.findUnique({ where: { id: entrada.ativoId } });
      if (!a) throw new ErroNegocio("Equipamento não encontrado.");
      if (a.situacao !== "DEVOLVIDO_EM_AVALIACAO") throw new ErroNegocio("O equipamento não está em avaliação.");
      if (a.categoria === "CARREGADOR" && a.desvinculadoEm) throw new ErroNegocio("Carregador desvinculado não volta para o estoque por aqui.");
      await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao, rotulo: rotuloAtivo(a) }, "DISPONIVEL", { tipo: "LIBERACAO_AVALIACAO", observacao });
      await registrarAuditoria(tx, {
        acao: "ativo.transicionar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "ativo", id: a.id, descricao: rotuloAtivo(a) },
        origemPermissao: origem,
        detalhe: { de: a.situacao, para: "DISPONIVEL" },
      });
    });
  });
}

/* Fotos (rota autorizada) */

export async function lerFotoEquipamento(ator: Ator, fotoId: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "evidencia.ver");
    exigirPermissao(ator, "ativo.ver");
    const foto = UUID.test(fotoId) ? await prisma.fotoAtivo.findUnique({ where: { id: fotoId }, select: { chave: true, mime: true, ativoId: true } }) : null;
    if (!foto) return null;
    if (escopo !== "GRUPO") {
      const comigo = await prisma.itemAlocacao.count({
        where: { ativoId: foto.ativoId, aberto: true, alocacao: { estado: "ATIVA", colaboradorId: ator.colaboradorId } },
      });
      if (!comigo) throw new ErroAutorizacao("evidencia.ver", "ESCOPO_PROPRIO");
    }
    const dados = await obterArmazenamento().ler(foto.chave);
    return dados ? { dados, tipo: foto.mime } : null;
  });
}

/* Opções para formulários */

export async function opcoesInventario(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "ativo.ver");
    const marcas = await prisma.ativo.findMany({ distinct: ["marca"], orderBy: { marca: "asc" }, select: { marca: true } });
    return { marcas: marcas.map((m) => m.marca), categorias: CATEGORIAS.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] })) };
  });
}

export const SITUACOES_INVENTARIO = SITUACOES;
