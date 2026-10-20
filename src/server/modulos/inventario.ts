import type { MotivoDesvinculoCarregador, Prisma } from "@/generated/prisma/client";
import {
  CATEGORIAS,
  CATEGORIAS_COMPONENTE,
  COM_CONFIGURACAO,
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
import { configuracaoDoTexto, descreverPeca, ehComponente, pecasDaConfiguracao, resumirConfiguracao, type EspecPeca, type TipoComponente } from "@/lib/componentes";
import { nomeParteKit, PARTES_KIT, ROTULO_PARTE, type Regra } from "@/lib/identificacao";
import { alvosDaInspecaoEntrada, CONDICOES_ENTRADA, type CondicaoEntrada } from "@/lib/inspecao";
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
import { alugueisQueValem, diaDe, exigirEmpresaAutorizada } from "./alugueis";
import { resolverFabricante, resolverProcessador, resolverSistema } from "./catalogos";
import { categoriaDoTipo } from "./categorias";
import { aplicarConfiguracaoOriginal, criarComponente, tecnologiasMemoria, validarComponente, validarConfiguracao } from "./componentes";
import { gerarIdentificador } from "./identificacao-ativos";
import {
  fotosDaInspecao,
  leitorDeChecklists,
  prepararInspecao,
  registrarInspecaoEntrada,
  resumoInspecao,
  SELECAO_RESUMO,
  type EntradaInspecao,
  type InspecaoPreparada,
} from "./inspecoes";

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
  /** Categoria do catálogo (o filtro "Tipo" da lista). */
  categoriaId?: string;
  /** Marca e modelo do catálogo (id). */
  marca?: string;
  modelo?: string;
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
/**
 * Base de cada grupo: equipamentos (tudo o que é físico, inclusive carregadores e peças de
 * kit, cada um como registro próprio) ou componentes internos (RAM, SSD, HD).
 */
function baseGrupo(f: FiltroInventario): Prisma.AtivoWhereInput {
  const componentes = f.grupo === "componentes";
  return {
    AND: [
      componentes ? { categoria: { in: [...CATEGORIAS_COMPONENTE] } } : { categoria: { notIn: [...CATEGORIAS_COMPONENTE] } },
      f.categoriaId && UUID.test(f.categoriaId) ? { categoriaId: f.categoriaId } : {},
    ],
  };
}

function ondeInventario(f: FiltroInventario, comSituacao = true): Prisma.AtivoWhereInput {
  const busca = f.busca?.trim().slice(0, 80);
  const contem = { contains: busca, mode: "insensitive" as const };
  const componentes = f.grupo === "componentes";
  return {
    AND: [
      baseGrupo(f),
      f.empresaId && UUID.test(f.empresaId) ? { empresaId: f.empresaId } : {},
      f.marca ? (UUID.test(f.marca) ? { marcaId: f.marca } : { marca: { equals: f.marca, mode: "insensitive" } }) : {},
      f.modelo && UUID.test(f.modelo) ? { modeloId: f.modelo } : {},
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
  tipo: (d) => [{ categoriaEquipamento: { nome: d } }, { nomeDispositivo: { sort: "asc", nulls: "last" } }, { patrimonio: "asc" }],
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
    const marcaFiltro = f.marca && UUID.test(f.marca) ? f.marca : null;
    const [total, totalGeral, porSituacao, porTipo, porEmpresa, porMarca, marcas, modelos, capacidades, notebooks] = await Promise.all([
      prisma.ativo.count({ where }),
      prisma.ativo.count({ where: baseGrupo(f) }),
      prisma.ativo.groupBy({ by: ["situacao"], where: escopoIndicadores, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["categoriaId"], where, _count: { _all: true }, orderBy: { _count: { categoriaId: "desc" } }, take: 6 }),
      prisma.ativo.groupBy({ by: ["empresaId"], where, _count: { _all: true } }),
      prisma.ativo.groupBy({ by: ["marca"], where, _count: { _all: true }, orderBy: { _count: { marca: "desc" } }, take: 6 }),
      // Opções dos filtros Marca e Modelo: itens do catálogo usados neste grupo (modelo pela marca escolhida).
      prisma.marcaEquipamento.findMany({ where: { ativos: { some: grupo } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      prisma.modeloEquipamento.findMany({
        where: { ativos: { some: grupo }, ...(marcaFiltro ? { marcaId: marcaFiltro } : {}) },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, marcaId: true },
      }),
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
          categoriaEquipamento: { select: { id: true, nome: true } },
          parteKit: true,
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
          fotos: { where: { contexto: "CADASTRO", removidaEm: null }, orderBy: [{ tipo: "asc" }, { enviadaEm: "asc" }], take: 1, select: { id: true } },
          instalacoes: { where: { vigente: true }, take: 1, select: { equipamento: { select: { id: true, nomeDispositivo: true } } } },
        },
      }),
      prisma.empresa.findMany({ where: { id: { in: porEmpresa.map((e) => e.empresaId) } }, select: { id: true, nome: true, sigla: true } }),
    ]);
    const nomesCategorias = new Map(
      (await prisma.categoriaEquipamento.findMany({ where: { id: { in: porTipo.map((t) => t.categoriaId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]),
    );
    const contar = (s: Situacao) => porSituacao.find((p) => p.situacao === s)?._count._all ?? 0;

    return {
      linhas: linhas.map((a) => ({
        id: a.id,
        categoria: a.categoria,
        /** Nome da categoria no catálogo; peça de kit: "Kit teclado e mouse · Teclado". */
        tipo: a.parteKit ? `${a.categoriaEquipamento.nome} · ${ROTULO_PARTE[a.parteKit]}` : a.categoriaEquipamento.nome,
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
      marcas,
      modelos,
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
        porTipo: porTipo.map((t) => ({ categoriaId: t.categoriaId, nome: nomesCategorias.get(t.categoriaId) ?? "Categoria", total: t._count._all })),
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
            categoriaEquipamento: { select: { id: true, codigo: true, nome: true, regra: true, prefixo: true } },
            processadorCatalogo: { select: { modelo: true, codigoNomenclatura: true } },
            inspecoes: { orderBy: [{ abertaEm: "desc" }, { numero: "desc" }], take: 30, select: SELECAO_RESUMO },
            kit: { select: { id: true, codigo: true, partes: { orderBy: { nomeDispositivo: "asc" }, select: { id: true, nomeDispositivo: true, parteKit: true, situacao: true } } } },
            notebook: { select: { id: true, nomeDispositivo: true, patrimonio: true, modelo: true } },
            carregadores: {
              orderBy: { sequenciaCarregador: "asc" },
              select: { id: true, nomeDispositivo: true, patrimonio: true, sequenciaCarregador: true, situacao: true, desvinculadoEm: true, motivoDesvinculo: true, marca: true, modelo: true },
            },
            fotos: { where: { removidaEm: null }, orderBy: [{ enviadaEm: "asc" }, { tipo: "asc" }], select: { id: true, tipo: true, contexto: true, enviadaEm: true, enviadaPorNome: true, manutencaoId: true } },
            movimentacoes: { orderBy: { realizadoEm: "desc" }, take: 60 },
            itensAlocacao: SELECAO_ALOCACAO_ABERTA,
            manutencoes: { orderBy: { abertaEm: "desc" } },
            transferencias: { where: { pendente: true }, take: 1 },
            alugueis: {
              orderBy: [{ inicio: "desc" }, { registradoEm: "desc" }],
              include: { empresaLocataria: { select: { id: true, nome: true, sigla: true } } },
            },
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
    // Aluguel que vale agora (o próprio ou, no carregador vinculado, o do notebook) e as mudanças de propriedade.
    const [aluguelAtual, propriedade] = await Promise.all([
      alugueisQueValem(prisma, [a]).then((m) => m.get(a.id) ?? null),
      prisma.transferencia.findMany({ where: { ativoId: a.id, tipo: "EMPRESA", estado: "CONCLUIDA" }, orderBy: { efetivadaEm: "desc" } }),
    ]);
    const originais = a.categoria === "NOTEBOOK" ? await prisma.pecaConfiguracao.count({ where: { equipamentoId: a.id, original: true } }) : 0;
    const { responsavel, reserva, ter } = custodia(a.itensAlocacao);
    // Escopo próprio: só o equipamento entregue à própria pessoa.
    if (escopo !== "GRUPO" && responsavel?.id !== ator.colaboradorId) throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");

    const fotosDe = (manutencaoId: string | null) => a.fotos.filter((f) => f.manutencaoId === manutencaoId);
    return {
      id: a.id,
      categoria: a.categoria,
      /** Categoria do catálogo (nome exibido e regra do identificador). */
      categoriaCatalogo: { id: a.categoriaEquipamento.id, nome: a.categoriaEquipamento.nome, regra: a.categoriaEquipamento.regra as Regra },
      rotuloTipo: a.parteKit ? `${a.categoriaEquipamento.nome} · ${ROTULO_PARTE[a.parteKit]}` : a.categoriaEquipamento.nome,
      /** Código de nomenclatura do processador (NBI5…); só informativo depois do cadastro. */
      codigoProcessador: a.processadorCatalogo?.codigoNomenclatura ?? null,
      /** Peça de kit: o código do kit e as peças irmãs. */
      kit: a.kit && {
        codigo: a.kit.codigo,
        parte: a.parteKit!,
        partes: a.kit.partes.map((x) => ({ id: x.id, nome: x.nomeDispositivo!, parte: x.parteKit!, situacao: x.situacao })),
      },
      nome: a.nomeDispositivo,
      patrimonio: a.patrimonio,
      empresa: a.empresa,
      marca: a.marca,
      modelo: a.modelo,
      /** Referências do catálogo (o formulário de edição parte delas). */
      marcaId: a.marcaId,
      modeloId: a.modeloId,
      processadorId: a.processadorId,
      sistemaOperacionalId: a.sistemaOperacionalId,
      numeroSerie: a.numeroSerie,
      processador: a.processador ?? a.processadorCatalogo?.modelo ?? null,
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
      // As evidências das inspeções ficam com a inspeção.
      fotos: fotosDe(null)
        .filter((f) => f.contexto !== "INSPECAO")
        .map((f) => ({ id: f.id, tipo: f.tipo, contexto: f.contexto, url: urlFoto(f.id), enviadaEm: f.enviadaEm.toISOString(), enviadaPorNome: f.enviadaPorNome })),
      /** Novo ou usado na entrada no inventário (nulo nos cadastros anteriores). */
      condicaoEntrada: a.condicaoEntrada,
      parteKit: a.parteKit,
      /** Inspeções técnicas (a pendente, se houver, primeiro), sem alteração depois de concluídas. */
      inspecoes: a.inspecoes.map(resumoInspecao),
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
      /** Empresa locatária com aluguel vigente (a propriedade não muda); no carregador, pode vir do notebook. */
      aluguel: aluguelAtual && {
        id: aluguelAtual.id,
        empresa: aluguelAtual.empresaLocataria,
        inicio: dia(aluguelAtual.inicio)!,
        devolucaoPrevista: dia(aluguelAtual.devolucaoPrevista),
        motivo: aluguelAtual.motivo,
        registradoEm: aluguelAtual.registradoEm.toISOString(),
        registradoPorNome: aluguelAtual.registradoPorNome,
        herdado: aluguelAtual.herdado,
      },
      /** Histórico de aluguéis do próprio equipamento (o vigente e os encerrados). */
      alugueis: a.alugueis.map((x) => ({
        id: x.id,
        empresa: x.empresaLocataria,
        inicio: dia(x.inicio)!,
        devolucaoPrevista: dia(x.devolucaoPrevista),
        motivo: x.motivo,
        observacoes: x.observacoes,
        vigente: x.vigente === true,
        registradoEm: x.registradoEm.toISOString(),
        registradoPorNome: x.registradoPorNome,
        encerradoEm: iso(x.encerradoEm),
        encerradoPorNome: x.encerradoPorNome,
        motivoEncerramento: x.motivoEncerramento,
      })),
      /** Mudanças de propriedade (transferências entre empresas). */
      transferenciasEmpresa: propriedade.map((t) => ({
        id: t.id,
        de: t.empresaOrigemNome,
        para: t.empresaDestinoNome,
        motivo: t.motivo,
        efetivadaEm: iso(t.efetivadaEm ?? t.criadaEm)!,
        realizadaPorNome: t.realizadaPorNome,
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
              // Notebook antigo: a ficha escrita conta como configuração original na soma.
              resumo: resumirConfiguracao([
                ...(originais === 0 ? pecasDaConfiguracao(configuracaoDoTexto(a.memoriaRam, a.armazenamento) ?? { memoria: null, armazenamento: [] }) : []),
                ...a.pecasConfiguracao.map(especPeca),
              ]),
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
  /** Categoria do catálogo. Sem ela, `categoria` (o tipo) usa a categoria padrão do tipo. */
  categoriaId?: string | null;
  categoria?: string;
  /** Só nas categorias sem identificação automática; nas demais o portal gera o nome. */
  nomeDispositivo?: string | null;
  patrimonio?: string | null;
  empresaId: string;
  /** Catálogos: marca, modelo (da marca e da categoria), processador e sistema operacional. */
  marcaId?: string | null;
  modeloId?: string | null;
  /** Notebook: o código de nomenclatura do processador define o identificador (i5 → NBI5001). */
  processadorId?: string | null;
  sistemaOperacionalId?: string | null;
  numeroSerie?: string | null;
  memoriaRam?: string | null;
  armazenamento?: string | null;
  dataAquisicao?: string | null;
  garantiaAte?: string | null;
  observacoes?: string | null;
  /** Notebook: configuração original estruturada (só especificação; nenhuma peça física é criada). */
  configuracao?: unknown;
  /** Componente (RAM, SSD, HD). */
  capacidadeGb?: number | string | null;
  tecnologia?: string | null;
  interfaceConexao?: string | null;
  formato?: string | null;
  frequenciaMhz?: number | string | null;
  /** Kit: peças que acompanham (teclado, mouse, hub/receptor) e o número de série de cada uma. */
  partesKit?: { parte: string; numeroSerie?: string | null }[] | null;
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

/** Categoria escolhida no cadastro ou a padrão do tipo informado. */
async function resolverCategoria(db: ClienteBanco, d: DadosEquipamento) {
  const c =
    d.categoriaId && UUID.test(d.categoriaId)
      ? await db.categoriaEquipamento.findUnique({ where: { id: d.categoriaId } })
      : d.categoria
        ? await db.categoriaEquipamento.findUnique({ where: { codigo: d.categoria } })
        : null;
  if (!c) throw new ErroNegocio("Selecione a categoria.");
  return { ...c, tipo: c.tipo as Categoria, regra: c.regra as Regra };
}

/** Peças do kit: ao menos uma, sem repetir; cada uma com o próprio número de série (opcional). */
function lerPartesKit(partes: DadosEquipamento["partesKit"]) {
  const lista = (partes ?? []).map((p) => {
    const parte = PARTES_KIT.find((x) => x === p.parte);
    if (!parte) throw new ErroNegocio("Peça do kit inválida.");
    return { parte, numeroSerie: identificador(p.numeroSerie, `o número de série do ${ROTULO_PARTE[parte].toLowerCase()}`, false) };
  });
  if (!lista.length) throw new ErroNegocio("Selecione ao menos uma peça do kit.");
  if (new Set(lista.map((p) => p.parte)).size !== lista.length) throw new ErroNegocio("Peça do kit repetida.");
  const series = lista.map((p) => p.numeroSerie).filter(Boolean);
  if (new Set(series).size !== series.length) throw new ErroNegocio("Número de série repetido entre as peças do kit.");
  return lista.sort((a, b) => PARTES_KIT.indexOf(a.parte) - PARTES_KIT.indexOf(b.parte));
}

type AtualCatalogo = { marcaId: string | null; modeloId: string | null; processadorId: string | null; sistemaOperacionalId: string | null } | null;

/**
 * Dados comuns do cadastro e da edição. Marca, modelo, processador e sistema vêm dos
 * catálogos (o texto gravado acompanha o item); itens inativos só valem para quem já os usa.
 */
async function validarDados(db: ClienteBanco, d: DadosEquipamento, cat: { id: string; tipo: Categoria }, atual: AtualCatalogo = null) {
  const categoria = cat.tipo;
  const empresa = UUID.test(d.empresaId) ? await db.empresa.findUnique({ where: { id: d.empresaId }, select: { id: true, ativa: true, nome: true } }) : null;
  if (!empresa) throw new ErroNegocio("Selecione a empresa proprietária.");
  // O carregador nasce com o modelo "Carregador": o modelo do catálogo é opcional para ele.
  const fabricante = await resolverFabricante(db, d, cat.id, { modeloOpcional: categoria === "CARREGADOR", atual });
  const dataAquisicao = lerData(d.dataAquisicao, "Data de aquisição");
  const garantiaAte = lerData(d.garantiaAte, "Garantia");
  if (dataAquisicao && dataAquisicao.getTime() > Date.now()) throw new ErroNegocio("Data de aquisição: não pode estar no futuro.");
  if (dataAquisicao && garantiaAte && garantiaAte < dataAquisicao) throw new ErroNegocio("Garantia: a data final é anterior à aquisição.");
  const configuracao = COM_CONFIGURACAO.includes(categoria);
  const processador = configuracao ? await resolverProcessador(db, d.processadorId, atual) : null;
  const sistema = configuracao ? await resolverSistema(db, d.sistemaOperacionalId, cat.id, atual) : null;
  return {
    empresa,
    fabricante,
    processador,
    dados: {
      marcaId: fabricante.marcaId,
      marca: fabricante.marca,
      numeroSerie: identificador(d.numeroSerie, "número de série", false),
      processadorId: processador?.id ?? null,
      processador: processador?.modelo ?? null,
      // Notebook: memória e armazenamento refletem as peças da configuração (nunca texto solto).
      ...(categoria === "NOTEBOOK"
        ? {}
        : {
            memoriaRam: configuracao ? textoLivre(d.memoriaRam, 40, "Memória RAM") : null,
            armazenamento: configuracao ? textoLivre(d.armazenamento, 60, "Armazenamento") : null,
          }),
      sistemaOperacionalId: sistema?.id ?? null,
      sistemaOperacional: sistema?.rotulo ?? null,
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
  notebook: { id: string; nomeDispositivo: string | null; empresaId: string; marca: string; marcaId: string | null },
  observacao: string,
  condicaoEntrada: CondicaoEntrada | null = null,
) {
  if (!notebook.nomeDispositivo) throw new ErroNegocio("O notebook não tem identificador para nomear os carregadores.");
  const usadas = await tx.ativo.findMany({ where: { notebookId: notebook.id }, select: { sequenciaCarregador: true } });
  const sequencia = proximaSequencia(usadas.map((u) => u.sequenciaCarregador!));
  const categoria = await categoriaDoTipo(tx, "CARREGADOR");
  const carregador = await tx.ativo.create({
    data: {
      categoria: "CARREGADOR",
      categoriaId: categoria.id,
      nomeDispositivo: nomeCarregador(notebook.nomeDispositivo, sequencia),
      empresaId: notebook.empresaId,
      marca: notebook.marca,
      marcaId: notebook.marcaId,
      modelo: "Carregador",
      notebookId: notebook.id,
      sequenciaCarregador: sequencia,
      condicaoEntrada,
      criadoPorNome: ator.nome,
    },
  });
  await registrarMovimentacao(tx, ator, carregador.id, { tipo: "CARREGADOR_VINCULADO", situacaoNova: "DISPONIVEL", observacao: `${observacao} (${notebook.nomeDispositivo}).` });
  await registrarMovimentacao(tx, ator, notebook.id, { tipo: "CARREGADOR_VINCULADO", observacao: `${carregador.nomeDispositivo}: ${observacao.toLowerCase()}.` });
  return carregador;
}

/** Cadastro já feito com a mesma chave: o equipamento ou a primeira peça do kit. */
async function cadastroRepetido(chave: string | null) {
  if (!chave) return null;
  const ativo = await prisma.ativo.findUnique({ where: { chaveRequisicao: chave }, select: { id: true, nomeDispositivo: true } });
  if (ativo) return { id: ativo.id, nome: ativo.nomeDispositivo, carregador: null, pecas: [] as string[], emManutencao: [] as string[], repetido: true };
  const kit = await prisma.kitEquipamento.findUnique({ where: { chaveRequisicao: chave }, select: { codigo: true, partes: { orderBy: { nomeDispositivo: "asc" }, take: 1, select: { id: true } } } });
  return kit?.partes[0] ? { id: kit.partes[0].id, nome: kit.codigo as string | null, carregador: null, pecas: [] as string[], emManutencao: [] as string[], repetido: true } : null;
}

/**
 * Cadastro atômico, com o identificador gerado no banco pela regra da categoria: notebook
 * (NBI + família + sequência) com o carregador C1; kit (KTM01) com uma peça por item
 * marcado; peças internas e demais categorias com a sequência da abreviação. Fotos e
 * histórico na mesma transação; o mesmo envio repetido devolve o cadastro já feito.
 */
export async function cadastrarEquipamento(
  ator: Ator,
  entrada: {
    dados: DadosEquipamento;
    fotos?: FotoEnviada[];
    fotosPartes?: Partial<Record<string, FotoEnviada[]>>;
    chaveRequisicao?: string;
    /** Novo ou usado: define as verificações da inspeção de entrada. */
    condicaoEntrada?: string | null;
    /** Inspeção de entrada de cada equipamento criado: "principal", "carregador" (C1) ou a peça do kit. */
    inspecoes?: Partial<Record<string, EntradaInspecao>>;
  },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.criar");
    const fotosPartesEnviadas = Object.values(entrada.fotosPartes ?? {}).flat().filter((f): f is FotoEnviada => Boolean(f));
    if ([...(entrada.fotos ?? []), ...fotosPartesEnviadas].some((f) => f.dados.length)) exigirPermissao(ator, "evidencia.enviar");
    const chave = entrada.chaveRequisicao && UUID.test(entrada.chaveRequisicao) ? entrada.chaveRequisicao : null;
    const ja = await cadastroRepetido(chave);
    if (ja) return ja;

    const cat = await resolverCategoria(prisma, entrada.dados);
    if (!cat.ativa) throw new ErroNegocio(`A categoria ${cat.nome} está inativa.`);
    if (cat.regra === "CARREGADOR") throw new ErroNegocio("Carregadores nascem com o notebook (C1) ou na ficha do notebook.");
    const tipo = cat.tipo;
    const { empresa, dados, fabricante, processador } = await validarDados(prisma, entrada.dados, cat);
    if (!empresa.ativa) throw new ErroNegocio("A empresa proprietária está inativa.");
    const automatico = cat.regra !== "NENHUMA";
    const nomeManual = automatico ? null : identificador(entrada.dados.nomeDispositivo, "o nome do dispositivo", false);
    const patrimonio = identificador(entrada.dados.patrimonio, "o patrimônio", false);
    if (!automatico && !nomeManual && !patrimonio) throw new ErroNegocio("Informe o patrimônio ou o nome do dispositivo.");
    // Notebook: o código de nomenclatura do processador entra no identificador (i5 → NBI5001).
    if (cat.regra === "PROCESSADOR") {
      if (!processador) throw new ErroNegocio("Selecione o modelo do processador.");
      if (!processador.codigo) throw new ErroNegocio(`O processador ${processador.modelo} não tem código de nomenclatura: configure-o em Catálogos do Inventário.`);
    }
    const especificacao = ehComponente(tipo) ? await validarComponente(prisma, { ...entrada.dados, categoria: tipo, capacidadeGb: entrada.dados.capacidadeGb ?? "" }) : null;
    const configuracao = tipo === "NOTEBOOK" ? validarConfiguracao(entrada.dados.configuracao, await tecnologiasMemoria(prisma)) : null;
    const modelo = { modeloId: fabricante.modeloId, modelo: fabricante.modelo! };
    const partes = cat.regra === "KIT" ? lerPartesKit(entrada.dados.partesKit) : [];
    const fotos = prepararFotos(cat.regra === "KIT" ? [] : (entrada.fotos ?? []));
    const fotosPartes = new Map(partes.map((p) => [p.parte, prepararFotos(entrada.fotosPartes?.[p.parte] ?? [])]));
    // Inspeção de entrada obrigatória para cada equipamento que nasce aqui (nunca presumida).
    const condicao = CONDICOES_ENTRADA.find((c) => c === entrada.condicaoEntrada);
    if (!condicao) throw new ErroNegocio("Informe a condição de entrada do equipamento (novo ou usado).");
    // Checklist vigente da categoria (o C1 do notebook usa o da categoria de carregadores).
    const checklist = leitorDeChecklists(prisma);
    const categoriaCarregador = tipo === "NOTEBOOK" ? (await categoriaDoTipo(prisma, "CARREGADOR")).id : null;
    const inspecoes = new Map(
      await Promise.all(
        alvosDaInspecaoEntrada(tipo, cat.nome, partes.map((p) => p.parte)).map(
          async (x) =>
            [
              x.alvo,
              prepararInspecao(await checklist(x.fonte === "carregador" ? categoriaCarregador! : cat.id), { tipo: "ENTRADA", condicao, parte: x.parte }, entrada.inspecoes?.[x.alvo], x.rotulo),
            ] as const,
        ),
      ),
    );
    const fotosInspecao = [...inspecoes.values()].flatMap(fotosDaInspecao);
    if (fotosInspecao.length) exigirPermissao(ator, "evidencia.enviar");
    const todas = [...fotos, ...[...fotosPartes.values()].flat(), ...fotosInspecao];
    await gravarArquivosFotos(todas);
    const emManutencao: string[] = [];
    const inspecionar = async (tx: Transacao, alvo: string, ativoId: string) => {
      const r = await registrarInspecaoEntrada(tx, ator, ativoId, inspecoes.get(alvo) as InspecaoPreparada, condicao);
      if (r.resultado === "INAPTO") emManutencao.push(r.nome);
    };

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        if (cat.regra === "KIT") {
          // O kit é o agrupador lógico; cada peça marcada vira um equipamento próprio.
          const codigo = await gerarIdentificador(tx, cat);
          const kit = await tx.kitEquipamento.create({ data: { codigo, categoriaId: cat.id, criadoPorNome: ator.nome, chaveRequisicao: chave } });
          const criadas: { id: string; nome: string }[] = [];
          for (const p of partes) {
            const nome = nomeParteKit(codigo, p.parte);
            const parte = await tx.ativo.create({
              data: {
                categoria: tipo,
                categoriaId: cat.id,
                kitId: kit.id,
                parteKit: p.parte,
                nomeDispositivo: nome,
                patrimonio: null,
                empresaId: empresa.id,
                ...dados,
                ...modelo,
                numeroSerie: p.numeroSerie,
                condicaoEntrada: condicao,
                criadoPorNome: ator.nome,
              },
            });
            await registrarMovimentacao(tx, ator, parte.id, { tipo: "CADASTRO", situacaoNova: "DISPONIVEL", observacao: `Kit ${codigo}: ${ROTULO_PARTE[p.parte].toLowerCase()}. Empresa proprietária: ${empresa.nome}.` });
            await inspecionar(tx, p.parte, parte.id);
            const fotosDaParte = fotosPartes.get(p.parte) ?? [];
            if (fotosDaParte.length) await tx.fotoAtivo.createMany({ data: fotosDaParte.map((f) => ({ ...dadosFoto(f, parte.id, ator), contexto: "CADASTRO" as const })) });
            criadas.push({ id: parte.id, nome });
          }
          await registrarAuditoria(tx, {
            acao: "ativo.criar",
            resultado: "SUCESSO",
            ator: { contaId: ator.contaId, nome: ator.nome },
            alvo: { tipo: "kit_equipamento", id: kit.id, descricao: codigo },
            origemPermissao: origem,
            detalhe: { categoria: cat.nome, kit: codigo, pecas: criadas.map((c) => c.nome), empresa: empresa.nome, fotos: todas.length },
          });
          return { id: criadas[0].id, nome: codigo, carregador: null, pecas: criadas.map((c) => c.nome), emManutencao };
        }

        let ativo;
        if (especificacao) {
          ativo = await criarComponente(tx, ator, especificacao, empresa.id, `Empresa proprietária: ${empresa.nome}.`, { chaveRequisicao: chave, patrimonio });
          await tx.ativo.update({ where: { id: ativo.id }, data: { condicaoEntrada: condicao } });
        } else {
          const nomeDispositivo = automatico ? await gerarIdentificador(tx, { ...cat, codigoProcessador: processador?.codigo }) : nomeManual;
          ativo = await tx.ativo.create({
            data: {
              categoria: tipo,
              categoriaId: cat.id,
              nomeDispositivo,
              patrimonio,
              empresaId: empresa.id,
              ...dados,
              ...modelo,
              chaveRequisicao: chave,
              condicaoEntrada: condicao,
              criadoPorNome: ator.nome,
            },
          });
          await registrarMovimentacao(tx, ator, ativo.id, { tipo: "CADASTRO", situacaoNova: "DISPONIVEL", observacao: `Empresa proprietária: ${empresa.nome}.` });
        }
        let carregador: string | null = null;
        if (tipo === "NOTEBOOK") {
          // Notebook e carregador principal (C1) na mesma transação.
          const c1 = await criarCarregador(tx, ator, ativo, "Carregador principal criado com o notebook", condicao);
          carregador = c1.nomeDispositivo;
          // Só a especificação: nenhuma peça física (RAM001, SSD001...) nasce do cadastro.
          if (configuracao) await aplicarConfiguracaoOriginal(tx, ator, ativo, configuracao);
          await inspecionar(tx, "carregador", c1.id);
        }
        await inspecionar(tx, "principal", ativo.id);
        if (fotos.length) await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, ativo.id, ator), contexto: "CADASTRO" as const })) });
        await registrarAuditoria(tx, {
          acao: "ativo.criar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: ativo.id, descricao: rotuloAtivo(ativo) },
          origemPermissao: origem,
          detalhe: {
            categoria: cat.nome,
            identificador: ativo.nomeDispositivo,
            empresa: empresa.nome,
            fotos: fotos.length,
            carregadorPrincipal: tipo === "NOTEBOOK",
            configuracaoOriginal: Boolean(configuracao),
            condicaoEntrada: condicao,
            emManutencao,
          },
        });
        return { id: ativo.id, nome: ativo.nomeDispositivo, carregador, pecas: [] as string[], emManutencao };
      });
      return { ...resultado, repetido: false };
    } catch (erro) {
      await descartarFotos(todas.map((f) => f.chave));
      // Envio repetido em paralelo: o outro já gravou (o conflito pode surgir em qualquer campo único).
      const repetido = await cadastroRepetido(chave);
      if (repetido) return repetido;
      throw traduzirConflito(erro);
    }
  });
}

/**
 * Edição dos dados cadastrais. Categoria, identificador gerado, situação, empresa
 * proprietária, responsável e alocações não mudam aqui: a empresa e o colaborador só mudam
 * pelas transferências, com histórico e auditoria.
 */
export async function editarEquipamento(ator: Ator, entrada: { id: string; dados: DadosEquipamento; fotos?: FotoEnviada[]; removerFotos?: string[] }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.editar");
    const removerFotos = [...new Set(entrada.removerFotos ?? [])];
    // Incluir ou retirar fotos é tratar evidência: mesma permissão nos dois sentidos.
    if (entrada.fotos?.some((f) => f.dados.length) || removerFotos.length) exigirPermissao(ator, "evidencia.enviar");
    if (removerFotos.some((f) => !UUID.test(f))) throw new ErroNegocio("Foto não encontrada.");
    const atual = UUID.test(entrada.id) ? await prisma.ativo.findUnique({ where: { id: entrada.id }, include: { categoriaEquipamento: { select: { regra: true } } } }) : null;
    if (!atual) throw new ErroNegocio("Equipamento não encontrado.");
    if (entrada.dados.empresaId && entrada.dados.empresaId !== atual.empresaId) {
      throw new ErroNegocio("A empresa proprietária só muda pela transferência entre empresas, na ficha do equipamento.");
    }
    const componente = ehComponente(atual.categoria);
    // Identificador gerado (ou de carregador/peça de kit) não se edita; só categorias sem regra aceitam nome informado.
    const nomeLivre = atual.categoriaEquipamento.regra === "NENHUMA" && !atual.kitId;
    const nomeDispositivo = nomeLivre ? identificador(entrada.dados.nomeDispositivo, "o nome do dispositivo", false) : atual.nomeDispositivo;
    const patrimonio = componente ? atual.patrimonio : identificador(entrada.dados.patrimonio, "o patrimônio", false);
    if (!nomeDispositivo && !patrimonio && atual.categoria !== "CARREGADOR") throw new ErroNegocio("Informe o patrimônio ou o nome do dispositivo.");
    const { dados, fabricante, processador } = await validarDados(prisma, { ...entrada.dados, empresaId: atual.empresaId }, { id: atual.categoriaId, tipo: atual.categoria as Categoria }, atual);
    // Notebook com processador escolhido continua com um (o identificador não muda).
    if (atual.categoria === "NOTEBOOK" && atual.processadorId && !processador) throw new ErroNegocio("Selecione o modelo do processador.");
    const especificacao = componente
      ? await validarComponente(prisma, { ...entrada.dados, categoria: atual.categoria, capacidadeGb: entrada.dados.capacidadeGb ?? "" }, atual)
      : null;
    // Peça instalada: a especificação fica igual à registrada no notebook até a remoção.
    if (
      especificacao &&
      atual.situacao === "INSTALADO" &&
      (["capacidadeGb", "tecnologia", "interfaceConexao", "formato"] as const).some((k) => (especificacao.dados[k] ?? null) !== (atual[k] ?? null))
    ) {
      throw new ErroNegocio("Componente instalado: remova-o do notebook para corrigir a especificação.");
    }
    // Trocar o processador é dado técnico: o notebook não é renomeado.
    const configuracao = atual.categoria === "NOTEBOOK" ? validarConfiguracao(entrada.dados.configuracao, await tecnologiasMemoria(prisma)) : null;
    const fotos = prepararFotos(entrada.fotos ?? []);
    await gravarArquivosFotos(fotos);

    try {
      await prisma.$transaction(async (tx) => {
        await travarAtivos(tx, [atual.id]);
        const novo = especificacao
          ? semCategoria(especificacao.dados)
          : { nomeDispositivo, patrimonio, ...dados, ...(fabricante.modeloId ? { modeloId: fabricante.modeloId, modelo: fabricante.modelo! } : {}) };
        const antes: Record<string, unknown> = atual;
        const alterados = Object.entries(novo)
          .filter(([k, v]) => String(antes[k] instanceof Date ? (antes[k] as Date).toISOString() : (antes[k] ?? "")) !== String(v instanceof Date ? v.toISOString() : (v ?? "")))
          .map(([k]) => k);
        await tx.ativo.update({ where: { id: atual.id }, data: novo });
        // Configuração original: só antes de qualquer intervenção nos componentes (o caso de uso confere).
        if (configuracao) await aplicarConfiguracaoOriginal(tx, ator, atual, configuracao);
        // Só fotos do cadastro saem (as de manutenção e devolução são registro do evento); o arquivo fica.
        if (removerFotos.length) {
          const r = await tx.fotoAtivo.updateMany({
            where: { id: { in: removerFotos }, ativoId: atual.id, contexto: "CADASTRO", removidaEm: null },
            data: { removidaEm: new Date(), removidaPorNome: ator.nome },
          });
          if (r.count !== removerFotos.length) throw new ErroNegocio("Uma das fotos já foi removida ou não é do cadastro. Atualize a página.");
        }
        if (alterados.length || fotos.length || removerFotos.length) {
          const fotosTexto = [
            fotos.length ? `${fotos.length} ${fotos.length === 1 ? "foto incluída" : "fotos incluídas"}` : null,
            removerFotos.length ? `${removerFotos.length} ${removerFotos.length === 1 ? "foto removida" : "fotos removidas"}` : null,
          ].filter(Boolean);
          await registrarMovimentacao(tx, ator, atual.id, { tipo: "EDICAO", observacao: fotosTexto.length ? `${fotosTexto.join("; ")}.` : null });
        }
        if (fotos.length) await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, atual.id, ator), contexto: "CADASTRO" as const })) });
        await registrarAuditoria(tx, {
          acao: "ativo.editar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: atual.id, descricao: rotuloAtivo({ ...atual, nomeDispositivo, patrimonio }) },
          origemPermissao: origem,
          detalhe: { campos: alterados, fotosIncluidas: fotos.length, fotosRemovidas: removerFotos.length },
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
          include: { notebook: true, itensAlocacao: { where: { aberto: true }, include: { alocacao: { include: { colaborador: { select: { id: true, nome: true, empresaId: true } } } } } } },
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
            await exigirEmpresaAutorizada(tx, [novo], entregue.alocacao.colaborador.empresaId, diaDe(agora));
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
