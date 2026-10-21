import { randomUUID } from "node:crypto";
import type { Prisma, SituacaoColaborador } from "@/generated/prisma/client";
import { obterConectores } from "@/integrations/fabrica";
import {
  calcularIdentificadores,
  calcularSegundoNome,
  calcularSenhaInicial,
  chaveServidorPc,
  faltaParaSenhaInicial,
  enderecoValido,
  FORMATO_LOGIN_UAU,
  MENSAGEM_LOGIN_EM_USO,
  normalizarNome,
  opcoesSobrenome,
  sobrenomeDoNome,
  type GrupoLicencaDominios,
} from "@/lib/identificadores";
import { armazenamentoDisponivel, novaChave, obterArmazenamento, validarLogo } from "@/server/armazenamento";
import { registrarAuditoria } from "@/server/auditoria";
import { gerarHashSenha, validarPoliticaSenha } from "@/server/auth/senha";
import type { Ator } from "@/server/authz/ator";
import { carregarAlvo } from "@/server/authz/ator";
import { PERFIS_ADMINISTRATIVOS, type PerfilTi } from "@/server/authz/catalogo";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import type { EstadoTermo } from "@/generated/prisma/client";
import { mascararCpf } from "@/lib/cpf";
import { situacaoTer, type SituacaoTer } from "@/lib/ter";
import { protegerCpf } from "@/server/cpf";
import { prisma, type ClienteBanco } from "@/server/db";
import { garantirOutroAdministrador } from "./perfis";
import { rotuloTipo, SELECAO_TIPO } from "./inventario-base";
import { retomarPendentesDoColaborador } from "./ter";

/* Listagem */

export const SITUACOES_PESSOA = ["ATIVO", "PRE_CADASTRO", "AFASTADO", "DESLIGADO"] as const;
/** Situações escolhidas no cadastro e na edição; o desligamento é um processo próprio. */
export const SITUACOES_EDITAVEIS = ["ATIVO", "PRE_CADASTRO", "AFASTADO"] as const;

export type FiltroPessoas = {
  busca?: string;
  empresaId?: string;
  situacao?: SituacaoColaborador;
  departamento?: string;
  grupoLicencaId?: string;
  ordenar?: "nome" | "empresa" | "cargo" | "situacao" | "criadoEm";
  direcao?: "asc" | "desc";
  pagina?: number;
};

export const POR_PAGINA = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const urlFoto = (c: { id: string; fotoChave: string | null; atualizadoEm: Date }) =>
  c.fotoChave ? `/api/pessoas/${c.id}/foto?v=${c.atualizadoEm.getTime()}` : null;

/** Situação da conta para exibição: ativação pendente enquanto vale a senha inicial. */
export function situacaoDaConta(conta: { situacao: string; senhaPessoalDefinidaEm: Date | null } | null) {
  if (!conta) return "SEM_CONTA" as const;
  if (conta.situacao === "ATIVA" && !conta.senhaPessoalDefinidaEm) return "PENDENTE" as const;
  return conta.situacao as "ATIVA" | "BLOQUEADA" | "DESATIVADA";
}

export async function listarPessoas(ator: Ator, filtro: FiltroPessoas) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO");

    const busca = normalizarNome(filtro.busca);
    const contem = { contains: busca, mode: "insensitive" as const };
    const where: Prisma.ColaboradorWhereInput = {
      ...(busca
        ? {
            OR: [
              { nome: contem },
              { emailCorporativo: contem },
              { cargo: contem },
              { empresa: { nome: contem } },
              { empresa: { sigla: contem } },
            ],
          }
        : {}),
      ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
      ...(filtro.situacao ? { situacao: filtro.situacao } : {}),
      ...(filtro.departamento ? { departamento: filtro.departamento } : {}),
      ...(filtro.grupoLicencaId ? { grupoLicencaId: filtro.grupoLicencaId } : {}),
    };
    const direcao = filtro.direcao ?? "asc";
    const orderBy: Prisma.ColaboradorOrderByWithRelationInput[] =
      filtro.ordenar === "empresa"
        ? [{ empresa: { nome: direcao } }, { nome: "asc" }]
        : filtro.ordenar === "cargo"
          ? [{ cargo: direcao }, { nome: "asc" }]
          : filtro.ordenar === "situacao"
            ? [{ situacao: direcao }, { nome: "asc" }]
            : filtro.ordenar === "criadoEm"
              ? [{ criadoEm: direcao }]
              : [{ nome: direcao }];

    const [total, totalGeral, departamentos] = await Promise.all([
      prisma.colaborador.count({ where }),
      prisma.colaborador.count(),
      prisma.colaborador.findMany({
        where: { departamento: { not: "" } },
        distinct: ["departamento"],
        select: { departamento: true },
        orderBy: { departamento: "asc" },
      }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const pagina = Math.min(Math.max(1, filtro.pagina ?? 1), paginas);
    const linhas = await prisma.colaborador.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        empresa: { select: { id: true, nome: true, sigla: true } },
        conta: { select: { situacao: true, senhaPessoalDefinidaEm: true } },
        grupoLicenca: { select: { nome: true } },
        perfis: { where: { revogadoEm: null }, select: { id: true } },
      },
    });

    return {
      total,
      totalGeral,
      pagina,
      paginas,
      departamentos: departamentos.map((d) => d.departamento),
      linhas: linhas.map((c) => ({
        id: c.id,
        nome: c.nome,
        email: c.emailCorporativo,
        cargo: c.cargo,
        departamento: c.departamento,
        empresa: c.empresa,
        situacao: c.situacao,
        conta: situacaoDaConta(c.conta),
        grupoLicenca: c.grupoLicenca?.nome ?? null,
        fotoUrl: urlFoto(c),
        /** Não é exibido: decide se a linha pode ser editada (equipe de TI exige perfil administrativo). */
        temPerfilTi: c.perfis.length > 0,
      })),
    };
  });
}

/** Ficha resumida (página /ti/cadastros/pessoas/[id]). Com escopo PROPRIO, só a própria. */
export async function obterPessoa(ator: Ator, colaboradorId: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (escopo === "PROPRIO" && colaboradorId !== ator.colaboradorId) {
      throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO", colaboradorId);
    }
    const c = await prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      include: {
        empresa: true,
        grupoLicenca: { select: { nome: true } },
        conta: {
          select: {
            id: true,
            situacao: true,
            senhaPessoalDefinidaEm: true,
            ativacaoTiConcluidaEm: true,
            twoFactorEnabled: true,
            ultimoAcessoEm: true,
            createdAt: true,
          },
        },
        perfis: { where: { revogadoEm: null } },
        permissoesIndividuais: { where: { revogadaEm: null } },
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      nome: c.nome,
      email: c.emailCorporativo,
      cargo: c.cargo,
      departamento: c.departamento,
      empresa: c.empresa.nome,
      situacao: c.situacao,
      criadoEm: c.criadoEm,
      nomeServidorPc: c.nomeServidorPc,
      loginUau: c.loginUau,
      loginMicrosoft: c.loginMicrosoft,
      grupoLicenca: c.grupoLicenca?.nome ?? null,
      identidadeMicrosoftVinculada: Boolean(c.entraObjectId),
      conta: c.conta,
      perfis: c.perfis.map((p) => p.perfil as PerfilTi),
      permissoes: c.permissoesIndividuais.map((p) => ({ permissao: p.permissao, validaAte: p.validaAte })),
      temPerfilTi: c.perfis.length > 0,
    };
  });
}

/* Detalhes (modal com abas) */

export type EquipamentoPessoa = {
  id: string;
  patrimonio: string;
  tipo: string;
  modelo: string;
  numeroSerie: string | null;
  nomeDispositivo: string | null;
  /** Data da entrega física (entregues) ou data prevista/da reserva (reservados). */
  data: string;
  alocacao: { id: string; numero: string };
  ter: { numero: string; estado: EstadoTermo; emitidoEm: string | null; assinadoEm: string | null } | null;
};

export type DocumentoPessoa = {
  id: string;
  numero: string;
  tipo: "TER" | "TDV";
  estado: EstadoTermo;
  /** TER emitido pelo portal: situação resumida (documento e assinatura). */
  situacao: SituacaoTer | null;
  emitidoEm: string | null;
  assinadoEm: string | null;
  ativos: string[];
  disponibilizado: boolean;
  temPdf: boolean;
};

export type DetalhePessoa = Awaited<ReturnType<typeof obterDetalhePessoa>>;

/**
 * Detalhe completo para o modal. Senha, hash e segredos nunca saem do servidor: da conta
 * vão só situação e datas. Equipamentos (entregues × reservados), alocações e termos vêm do
 * inventário no banco; reserva não torna ninguém responsável (Q-27).
 */
export async function obterDetalhePessoa(ator: Ator, colaboradorId: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (!UUID.test(colaboradorId)) throw new ErroNegocio("Pessoa não encontrada.");
    // O CPF só aparece (mascarado) para a TI; nem a própria pessoa o vê no portal.
    const veCpf = escopo === "GRUPO";
    if (escopo !== "GRUPO" && colaboradorId !== ator.colaboradorId) {
      throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO", colaboradorId);
    }
    const c = await prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      include: {
        empresa: { select: { id: true, nome: true, sigla: true } },
        grupoLicenca: { select: { id: true, nome: true, dominioLogin: true, dominioEmail: true } },
        conta: { select: { situacao: true, senhaPessoalDefinidaEm: true, ultimoAcessoEm: true } },
        perfis: { where: { revogadoEm: null }, select: { perfil: true } },
      },
    });
    if (!c) throw new ErroNegocio("Pessoa não encontrada.");
    const alvo = { colaboradorId: c.id, temPerfilTiAtivo: c.perfis.length > 0 };

    // Equipamentos ou termos só com escopo de grupo em ativos/termos (a própria pessoa vê os seus).
    const veAtivos = pode(ator, "ativo.ver");
    const [itens, termos] = await Promise.all([
      veAtivos
        ? prisma.itemAlocacao.findMany({
            where: { aberto: true, alocacao: { colaboradorId: c.id, estado: { in: ["ATIVA", "RESERVADA"] } } },
            orderBy: { alocacao: { criadaEm: "desc" } },
            include: {
              ativo: { select: { id: true, categoria: true, ...SELECAO_TIPO, patrimonio: true, nomeDispositivo: true, marca: true, modelo: true, numeroSerie: true } },
              alocacao: {
                select: {
                  id: true,
                  numero: true,
                  estado: true,
                  entregueEm: true,
                  previstaPara: true,
                  criadaEm: true,
                  termos: { where: { tipo: "TER", estado: { not: "CANCELADO" } }, orderBy: { criadoEm: "desc" }, take: 1 },
                },
              },
            },
          })
        : [],
      pode(ator, "termo.ver")
        ? prisma.termo.findMany({
            where: { colaboradorId: c.id },
            orderBy: { criadoEm: "desc" },
            include: {
              alocacao: { select: { itens: { select: { ativo: { select: { patrimonio: true, nomeDispositivo: true } } } } } },
              devolucao: { select: { itens: { select: { itemAlocacao: { select: { ativo: { select: { patrimonio: true, nomeDispositivo: true } } } } } } } },
              eventoEntrega: { select: { verificacoes: { select: { ativo: { select: { patrimonio: true, nomeDispositivo: true } } } } } },
              versoes: { orderBy: { versao: "desc" }, take: 1, select: { estado: true, pendencias: true } },
            },
          })
        : [],
    ]);
    const paraEquipamento = (i: (typeof itens)[number]): EquipamentoPessoa => {
      const t = i.alocacao.termos[0];
      return {
        id: i.ativo.id,
        patrimonio: i.ativo.patrimonio ?? i.ativo.nomeDispositivo ?? "—",
        tipo: rotuloTipo(i.ativo),
        modelo: `${i.ativo.marca} ${i.ativo.modelo}`,
        numeroSerie: i.ativo.numeroSerie,
        nomeDispositivo: i.ativo.nomeDispositivo,
        data: (i.alocacao.entregueEm ?? i.alocacao.previstaPara ?? i.alocacao.criadaEm).toISOString(),
        alocacao: { id: i.alocacao.id, numero: i.alocacao.numero },
        ter: t ? { numero: t.numero, estado: t.estado, emitidoEm: t.emitidoEm?.toISOString() ?? null, assinadoEm: t.assinadoRegistradoEm?.toISOString() ?? null } : null,
      };
    };
    const documentos: DocumentoPessoa[] = termos.map((t) => ({
      id: t.id,
      numero: t.numero,
      tipo: t.tipo,
      estado: t.estado,
      situacao: t.eventoEntregaId
        ? situacaoTer({ estadoDocumento: t.estadoDocumento, estadoAssinatura: t.estadoAssinatura, pendencias: t.versoes[0]?.estado === "ERRO_GERACAO" ? t.versoes[0].pendencias : [] })
        : null,
      emitidoEm: t.emitidoEm?.toISOString() ?? null,
      assinadoEm: t.assinadoRegistradoEm?.toISOString() ?? null,
      ativos: (
        t.eventoEntrega?.verificacoes.map((x) => x.ativo) ??
        t.alocacao?.itens.map((x) => x.ativo) ??
        t.devolucao?.itens.map((x) => x.itemAlocacao.ativo) ??
        []
      ).map((a) => a.nomeDispositivo ?? a.patrimonio ?? "—"),
      disponibilizado: t.disponivelAoColaborador,
      temPdf: Boolean(t.arquivoAssinadoChave),
    }));

    return {
      pessoa: {
        id: c.id,
        nome: c.nome,
        segundoNome: c.segundoNome,
        sobrenomeUtilizado: c.sobrenomeUtilizado,
        email: c.emailCorporativo,
        cargo: c.cargo,
        departamento: c.departamento,
        empresa: c.empresa,
        situacao: c.situacao,
        criadoEm: c.criadoEm.toISOString(),
        fotoUrl: urlFoto(c),
        nomeServidorPc: c.nomeServidorPc,
        loginUau: c.loginUau,
        loginMicrosoft: c.loginMicrosoft,
        grupoLicenca: c.grupoLicenca,
        identidadeMicrosoftVinculada: Boolean(c.entraObjectId),
        temPerfilTi: alvo.temPerfilTiAtivo,
        cpf: veCpf ? mascararCpf(c.cpfFinal) : null,
      },
      conta: c.conta
        ? {
            situacao: situacaoDaConta(c.conta),
            senhaPessoalDefinidaEm: c.conta.senhaPessoalDefinidaEm?.toISOString() ?? null,
            ultimoAcessoEm: c.conta.ultimoAcessoEm?.toISOString() ?? null,
          }
        : null,
      equipamentos: {
        entregues: itens.filter((i) => i.alocacao.estado === "ATIVA").map(paraEquipamento),
        reservados: itens.filter((i) => i.alocacao.estado === "RESERVADA").map(paraEquipamento),
      },
      documentos,
      permissoes: {
        editar: podeEditarPessoa(ator, alvo),
        redefinirSenha: Boolean(c.conta) && pode(ator, "conta_acesso.redefinir_senha", alvo),
      },
    };
  });
}

/* Identificadores: duplicidade */

export type CampoIdentificador = "nomeServidorPc" | "loginUau" | "loginMicrosoft" | "emailCorporativo";
export type Conflito = { campo: CampoIdentificador; valor: string };
type Valores = Record<CampoIdentificador, string | null>;

const CAMPOS: CampoIdentificador[] = ["nomeServidorPc", "loginUau", "loginMicrosoft", "emailCorporativo"];

/** Duplicidade nunca é resolvida com números ou sufixos: a TI escolhe outro sobrenome. */
export class ErroIdentificadores extends ErroNegocio {
  constructor(readonly conflitos: Conflito[]) {
    super(MENSAGEM_LOGIN_EM_USO);
  }
}

/**
 * Valores já usados no banco do portal (fora `ignorarId`), em duas consultas. Cada sistema
 * compara do seu jeito: servidor/PC pela chave sem maiúsculas nem acentos; UAU em maiúsculas;
 * e-mail corporativo, login Microsoft e login do portal (conta de acesso) em minúsculas e no
 * mesmo espaço de endereços (um não pode repetir o outro). Não garante disponibilidade no
 * Microsoft 365 nem no UAU, que só as integrações reais poderão confirmar.
 */
async function valoresEmUso(db: ClienteBanco, lista: Valores[], ignorarId?: string) {
  const chaves = new Set<string>();
  const uaus = new Set<string>();
  const enderecos = new Set<string>();
  for (const v of lista) {
    const chave = chaveServidorPc(v.nomeServidorPc);
    if (chave) chaves.add(chave);
    if (v.loginUau) uaus.add(v.loginUau.toUpperCase());
    for (const e of [v.loginMicrosoft, v.emailCorporativo]) if (e) enderecos.add(e.toLowerCase());
  }
  const usados = new Set<string>();
  if (chaves.size || uaus.size || enderecos.size) {
    const [colaboradores, contas] = await Promise.all([
      db.colaborador.findMany({
        where: {
          ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
          OR: [
            { chaveServidorPc: { in: [...chaves] } },
            { loginUau: { in: [...uaus] } },
            { emailCorporativo: { in: [...enderecos] } },
            { loginMicrosoft: { in: [...enderecos] } },
          ],
        },
        select: { chaveServidorPc: true, loginUau: true, emailCorporativo: true, loginMicrosoft: true },
      }),
      enderecos.size
        ? db.contaAcesso.findMany({
            where: { email: { in: [...enderecos] }, ...(ignorarId ? { NOT: { colaboradorId: ignorarId } } : {}) },
            select: { email: true },
          })
        : [],
    ]);
    for (const c of colaboradores) {
      if (c.chaveServidorPc) usados.add(`pc:${c.chaveServidorPc}`);
      if (c.loginUau) usados.add(`uau:${c.loginUau.toUpperCase()}`);
      for (const e of [c.emailCorporativo, c.loginMicrosoft]) if (e) usados.add(`end:${e.toLowerCase()}`);
    }
    for (const c of contas) usados.add(`end:${c.email.toLowerCase()}`);
  }
  return (v: Valores, campos: readonly CampoIdentificador[] = CAMPOS): Conflito[] =>
    campos.flatMap((campo) => {
      const valor = v[campo];
      if (!valor) return [];
      const chave =
        campo === "nomeServidorPc" ? `pc:${chaveServidorPc(valor)}` : campo === "loginUau" ? `uau:${valor.toUpperCase()}` : `end:${valor.toLowerCase()}`;
      return usados.has(chave) ? [{ campo, valor }] : [];
    });
}

export async function procurarConflitos(
  db: ClienteBanco,
  valores: Valores,
  ignorarId?: string,
  campos: readonly CampoIdentificador[] = CAMPOS,
): Promise<Conflito[]> {
  return (await valoresEmUso(db, [valores], ignorarId))(valores, campos);
}

/**
 * Serializa cadastros e edições de identificadores: dentro da transação, quem chega depois
 * espera e então enxerga o que o anterior gravou. Os índices únicos são a última barreira.
 */
async function travarIdentificadores(tx: ClienteBanco) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(72026110)");
}

/** Identificadores pelas fórmulas da planilha. Sem grupo de licença, o e-mail é o informado. */
function identificadoresDe(
  nome: string,
  segundoNome: string | null,
  sobrenome: string | null,
  grupo: GrupoLicencaDominios | null,
  emailInformado?: string | null,
): Valores {
  const c = calcularIdentificadores({ nomeCompleto: nome, segundoNome, sobrenomeUtilizado: sobrenome, grupo });
  return {
    nomeServidorPc: c.nomeServidorPc || null,
    // Sem dados para ao menos 2 caracteres, o login UAU fica sem cálculo.
    loginUau: c.loginUau.length >= 2 ? c.loginUau : null,
    loginMicrosoft: c.loginMicrosoft || null,
    emailCorporativo: (grupo ? c.emailCorporativo : normalizarNome(emailInformado).toLowerCase()) || null,
  };
}

async function grupoAtivo(db: ClienteBanco, grupoLicencaId?: string | null) {
  if (!grupoLicencaId) return null;
  const grupo = UUID.test(grupoLicencaId) ? await db.grupoLicenca.findUnique({ where: { id: grupoLicencaId } }) : null;
  if (!grupo || !grupo.ativo) throw new ErroNegocio("Selecione um grupo de licença ativo.");
  return grupo;
}

const FORMATO_SEGUNDO_NOME = /^\p{L}[\p{L}\p{M}' -]{0,59}$/u;

/**
 * Segundo nome e sobrenome utilizado. O segundo nome vem da fórmula da planilha quando não é
 * informado (a TI pode alterá-lo). O sobrenome precisa ser um trecho do próprio nome e é
 * gravado com a grafia do nome; só é obrigatório escolher quando o nome oferece mais de uma
 * opção. Na edição, o valor já gravado continua aceito, e quem não tinha composição pode
 * continuar sem ela.
 */
function resolverComposicao(
  nome: string,
  e: { segundoNome?: string | null; sobrenomeUtilizado?: string | null },
  anterior?: { segundoNome: string | null; sobrenomeUtilizado: string | null },
) {
  const segundoNome = normalizarNome(e.segundoNome) || calcularSegundoNome(nome);
  if (!segundoNome && !(anterior && !anterior.segundoNome)) {
    throw new ErroNegocio("Não foi possível determinar o segundo nome pelo nome completo. Informe o segundo nome.");
  }
  if (segundoNome && !FORMATO_SEGUNDO_NOME.test(segundoNome)) throw new ErroNegocio("Segundo nome inválido: use só letras.");

  const informado = normalizarNome(e.sobrenomeUtilizado);
  if (!informado) {
    if (anterior && !anterior.sobrenomeUtilizado) return { segundoNome, sobrenome: null };
    // Um só sobrenome possível: não há o que escolher (a tela faz o mesmo).
    const opcoes = opcoesSobrenome(nome);
    if (opcoes.length === 1) return { segundoNome, sobrenome: opcoes[0] };
    throw new ErroNegocio(opcoes.length ? "Selecione o sobrenome utilizado." : "Informe o nome completo com o sobrenome.");
  }
  const sobrenome =
    sobrenomeDoNome(nome, informado) ?? (anterior && normalizarNome(anterior.sobrenomeUtilizado) === informado ? informado : null);
  if (!sobrenome) throw new ErroNegocio("Selecione um sobrenome que faça parte do nome completo.");
  return { segundoNome, sobrenome };
}

function validarFormato(ids: Valores) {
  if (!ids.nomeServidorPc || ids.nomeServidorPc.length > 80) throw new ErroNegocio("Nome do servidor/PC inválido.");
  if (ids.loginUau !== null && !FORMATO_LOGIN_UAU.test(ids.loginUau)) throw new ErroNegocio("Login UAU inválido: use de 2 a 8 letras ou números.");
  if (ids.loginMicrosoft && !enderecoValido(ids.loginMicrosoft)) throw new ErroNegocio("Login Microsoft inválido.");
  if (!ids.emailCorporativo) throw new ErroNegocio("Informe o e-mail corporativo: sem grupo de licença não há domínio para calculá-lo.");
  if (!enderecoValido(ids.emailCorporativo)) throw new ErroNegocio("E-mail corporativo inválido.");
}

export type EntradaVerificacao = {
  nome: string;
  segundoNome?: string | null;
  sobrenomeUtilizado?: string | null;
  grupoLicencaId?: string | null;
  /** E-mail informado (só sem grupo de licença). */
  email?: string | null;
  /** Edição: o próprio registro não conta como duplicidade. */
  colaboradorId?: string;
};

/**
 * Disponibilidade, para a tela: conflitos dos identificadores do sobrenome escolhido e, para
 * cada opção de sobrenome do nome, se ela geraria algum login em uso. Tudo recalculado aqui.
 */
export async function verificarIdentificadores(ator: Ator, entrada: EntradaVerificacao) {
  return executarCasoDeUso(ator, async () => {
    if (!pode(ator, "colaborador.criar") && !pode(ator, "colaborador.editar")) {
      throw new ErroAutorizacao("colaborador.criar", "PERFIL");
    }
    const nome = normalizarNome(entrada.nome);
    const grupo = await grupoAtivo(prisma, entrada.grupoLicencaId);
    const segundoNome = normalizarNome(entrada.segundoNome) || calcularSegundoNome(nome);
    const opcoes = opcoesSobrenome(nome);
    const porOpcao = opcoes.map((sobrenome) => identificadoresDe(nome, segundoNome, sobrenome, grupo, entrada.email));
    const informado = normalizarNome(entrada.sobrenomeUtilizado);
    const escolhido = informado ? identificadoresDe(nome, segundoNome, informado, grupo, entrada.email) : null;
    const conflitosDe = await valoresEmUso(prisma, escolhido ? [...porOpcao, escolhido] : porOpcao, entrada.colaboradorId);
    // Sem grupo, o e-mail digitado não depende do sobrenome: não conta para as opções.
    const dependemDoSobrenome = grupo ? CAMPOS : (["nomeServidorPc", "loginUau"] as const);
    return {
      conflitos: escolhido ? conflitosDe(escolhido) : [],
      sobrenomes: opcoes.map((valor, i) => ({ valor, emUso: conflitosDe(porOpcao[i], dependemDoSobrenome).length > 0 })),
    };
  });
}

/* Cadastro e edição */

export type EntradaIdentificacao = {
  nome: string;
  /** Ausente: calculado pela fórmula da planilha. */
  segundoNome?: string | null;
  /** Trecho do próprio nome (opções de `opcoesSobrenome`). */
  sobrenomeUtilizado?: string | null;
  cargo: string;
  departamento: string;
  empresaId: string;
  situacao?: (typeof SITUACOES_EDITAVEIS)[number];
  grupoLicencaId?: string | null;
  foto?: Buffer | null;
  /** CPF (cifrado ao gravar). Na edição, ausente mantém o atual. */
  cpf?: string | null;
};

export type EntradaCadastro = EntradaIdentificacao & {
  /** E-mail corporativo informado: só vale sem grupo de licença (com grupo, é calculado). */
  email: string;
  /**
   * Ausente (fluxo da tela): calculada pela fórmula da planilha com o nome curto da empresa,
   * como credencial temporária de ativação. Informada (integrações e testes): passa pela
   * política de senhas.
   */
  senhaInicial?: string;
  criarContaMicrosoft: boolean;
};

export type ResultadoCadastro = {
  colaboradorId: string;
  microsoft365?: { ok: boolean; mensagem: string; simulado: true };
};

async function empresaAtiva(db: ClienteBanco, empresaId: string) {
  const empresa = UUID.test(empresaId) ? await db.empresa.findUnique({ where: { id: empresaId } }) : null;
  if (!empresa || !empresa.ativa) throw new ErroNegocio("Selecione uma empresa ativa.");
  return empresa;
}

async function gravarFoto(foto: Buffer | null | undefined) {
  if (!foto || foto.length === 0) return null;
  let imagem;
  try {
    imagem = validarLogo(foto); // mesmas regras do logotipo: conteúdo real, tipo e tamanho
  } catch (erro) {
    if (erro instanceof ErroNegocio) throw new ErroNegocio(erro.message.replace(/o logotipo/gi, "a foto").replace(/do logotipo/gi, "da foto"));
    throw erro;
  }
  const chave = novaChave("pessoas", imagem.extensao);
  await obterArmazenamento().salvar(chave, foto);
  return { chave, tipo: imagem.tipo };
}

/** Unicidade violada por corrida entre a verificação e a gravação: mensagem clara, sem detalhes do banco. */
function traduzirUnicidade(erro: unknown) {
  if (erro && typeof erro === "object" && "code" in erro && (erro as { code: string }).code === "P2002") {
    if (/cpf/i.test(JSON.stringify((erro as { meta?: unknown }).meta ?? {}))) return new ErroNegocio(CPF_EM_USO);
    return new ErroNegocio("Um dos identificadores acabou de ser usado por outra pessoa. Revise e tente de novo.");
  }
  return erro;
}

const CPF_EM_USO = "CPF já cadastrado para outra pessoa.";

/** CPF informado: valida, cifra e confere a duplicidade pelo HMAC (o número nunca é comparado em texto). */
async function prepararCpf(cpf: string | null | undefined, ignorarId?: string) {
  if (!cpf?.trim()) return null;
  const protegido = protegerCpf(cpf);
  const outro = await prisma.colaborador.findUnique({ where: { cpfHmac: protegido.cpfHmac }, select: { id: true } });
  if (outro && outro.id !== ignorarId) throw new ErroNegocio(CPF_EM_USO);
  return protegido;
}

/**
 * Cadastro com senha inicial definida pela TI (DT-02) e provisionamento sem aprovação
 * (DT-03), mas com permissão verificada no servidor. A conta nasce exigindo ativação:
 * a senha inicial só abre /conta/ativar. A criação no Microsoft 365 é SIMULADA.
 */
export async function cadastrarPessoa(ator: Ator, entrada: EntradaCadastro): Promise<ResultadoCadastro> {
  return executarCasoDeUso(ator, async () => {
    const novoId = randomUUID();
    const alvoNovo = { colaboradorId: novoId, temPerfilTiAtivo: false };
    const origemCriar = exigirPermissao(ator, "colaborador.criar").origem;
    exigirPermissao(ator, "conta_acesso.criar", alvoNovo);
    const origemProvisionar = entrada.criarContaMicrosoft
      ? exigirPermissao(ator, "provisionamento.executar", alvoNovo).origem
      : null;

    const nome = normalizarNome(entrada.nome);
    const empresa = await empresaAtiva(prisma, entrada.empresaId);
    const { segundoNome, sobrenome } = resolverComposicao(nome, entrada);
    const grupo = await grupoAtivo(prisma, entrada.grupoLicencaId);
    const ids = identificadoresDe(nome, segundoNome, sobrenome, grupo, entrada.email);
    validarFormato(ids);
    const email = ids.emailCorporativo!;
    let senhaInicial: string;
    if (entrada.senhaInicial) {
      const problema = validarPoliticaSenha(entrada.senhaInicial, email);
      if (problema) throw new ErroNegocio(problema);
      senhaInicial = entrada.senhaInicial;
    } else {
      // Fórmula da planilha: só abre a ativação, onde a pessoa cria a senha pessoal (política forte).
      const calculada = calcularSenhaInicial(empresa.nomeCurtoSenha, nome, segundoNome);
      if (!calculada) {
        throw new ErroNegocio(`Senha inicial: ${faltaParaSenhaInicial(empresa.nomeCurtoSenha, nome, segundoNome)}`);
      }
      senhaInicial = calculada;
    }
    const conflitos = await procurarConflitos(prisma, ids);
    if (conflitos.length) throw new ErroIdentificadores(conflitos);
    const cpf = await prepararCpf(entrada.cpf);

    const hashSenha = await gerarHashSenha(senhaInicial);
    const foto = await gravarFoto(entrada.foto);
    const contaId = randomUUID();

    try {
      await prisma.$transaction(async (tx) => {
        // Cadastro simultâneo com os mesmos logins: o segundo encontra o primeiro já gravado.
        await travarIdentificadores(tx);
        const corrida = await procurarConflitos(tx, ids);
        if (corrida.length) throw new ErroIdentificadores(corrida);
        await tx.colaborador.create({
          data: {
            id: novoId,
            nome,
            segundoNome,
            sobrenomeUtilizado: sobrenome,
            emailCorporativo: email,
            cargo: normalizarNome(entrada.cargo),
            departamento: normalizarNome(entrada.departamento),
            empresaId: empresa.id,
            situacao: entrada.situacao ?? "ATIVO",
            grupoLicencaId: grupo?.id ?? null,
            nomeServidorPc: ids.nomeServidorPc,
            chaveServidorPc: chaveServidorPc(ids.nomeServidorPc),
            loginUau: ids.loginUau,
            loginMicrosoft: ids.loginMicrosoft,
            fotoChave: foto?.chave ?? null,
            fotoTipo: foto?.tipo ?? null,
            ...(cpf ?? {}),
          },
        });
        await tx.contaAcesso.create({
          data: {
            id: contaId,
            name: nome,
            email,
            colaboradorId: novoId,
            credenciais: {
              create: { id: randomUUID(), accountId: contaId, providerId: "credential", password: hashSenha },
            },
          },
        });
        await registrarAuditoria(tx, {
          acao: "colaborador.criar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "colaborador", id: novoId, descricao: nome },
          origemPermissao: origemCriar,
          detalhe: {
            empresa: empresa.sigla,
            contaAcessoCriada: true,
            grupoLicenca: Boolean(grupo),
            // Só a origem da senha; o valor nunca vai para a auditoria.
            credencialInicial: entrada.senhaInicial ? "informada" : "formula_planilha",
            segundoNomeAlterado: segundoNome !== calcularSegundoNome(nome),
            // Só se foi informado; o número nunca vai para a auditoria.
            cpfInformado: Boolean(cpf),
          },
        });
      });
    } catch (erro) {
      if (foto) await obterArmazenamento().remover(foto.chave).catch(() => undefined);
      throw traduzirUnicidade(erro);
    }

    if (!entrada.criarContaMicrosoft) return { colaboradorId: novoId };

    // Chamada única, sem retentativa automática; a senha vai só como parâmetro (§11.4).
    const { microsoft365 } = obterConectores();
    const resultado = await microsoft365.criarUsuario({
      nomeExibicao: nome,
      upn: ids.loginMicrosoft ?? email,
      senhaInicial,
      marcadorPortal: novoId.replace(/-/g, "").slice(0, 16),
    });
    await registrarAuditoria(prisma, {
      acao: "provisionamento.executar",
      resultado: resultado.ok ? "SUCESSO" : "FALHA",
      ator: { contaId: ator.contaId, nome: ator.nome },
      alvo: { tipo: "colaborador", id: novoId, descricao: nome },
      origemPermissao: origemProvisionar ?? undefined,
      simulado: true,
      detalhe: {
        sistema: "Microsoft 365",
        operacao: "m365.criar_conta",
        correlacaoId: resultado.correlacaoId,
        erro: resultado.ok ? null : resultado.erro.codigo,
      },
    });
    // Modo simulação nunca grava entra_object_id (ARQUITETURA_TECNICA.md §11.4, item 11).
    return {
      colaboradorId: novoId,
      microsoft365: {
        ok: resultado.ok,
        simulado: true,
        mensagem: resultado.ok
          ? "Conta Microsoft 365 criada em modo de simulação (nenhuma conta real foi criada)."
          : `Falha simulada: ${resultado.erro.mensagem}`,
      },
    };
  });
}

/**
 * Editar exige colaborador.editar; se a pessoa tem perfil de TI, também
 * colaborador.editar_equipe_ti (só perfis administrativos: o Estagiário nunca edita a
 * equipe de TI, nem a si mesmo).
 */
export function podeEditarPessoa(ator: Ator, alvo: { colaboradorId: string; temPerfilTiAtivo: boolean }) {
  return pode(ator, "colaborador.editar", alvo) && (!alvo.temPerfilTiAtivo || pode(ator, "colaborador.editar_equipe_ti", alvo));
}

export type EntradaEdicao = EntradaIdentificacao & {
  colaboradorId: string;
  /** Identificadores atuais que a pessoa escolheu substituir pelos propostos (ou ajustados). */
  aplicar?: CampoIdentificador[];
  removerFoto?: boolean;
};

/**
 * Edição: dados cadastrais livres; identificadores só mudam nos campos marcados em
 * `aplicar` (nunca por recálculo automático). Mudar o e-mail muda o login do portal e é
 * auditado. Nenhuma conta Microsoft é renomeada e a senha não é alterada.
 */
export async function editarPessoa(ator: Ator, entrada: EntradaEdicao) {
  return executarCasoDeUso(ator, async () => {
    if (!UUID.test(entrada.colaboradorId)) throw new ErroNegocio("Pessoa não encontrada.");
    const previo = await carregarAlvo(prisma, entrada.colaboradorId, { bloquear: false });
    if (!previo) throw new ErroNegocio("Pessoa não encontrada.");
    const { origem } = exigirPermissao(ator, "colaborador.editar", previo);
    if (previo.temPerfilTiAtivo) exigirPermissao(ator, "colaborador.editar_equipe_ti", previo);

    const nome = normalizarNome(entrada.nome);
    const empresa = await empresaAtiva(prisma, entrada.empresaId);
    const atual = await prisma.colaborador.findUniqueOrThrow({ where: { id: entrada.colaboradorId }, include: { conta: true } });
    const { segundoNome, sobrenome } = resolverComposicao(nome, entrada, atual);
    const grupo = await grupoAtivo(prisma, entrada.grupoLicencaId);
    // Sem grupo, o e-mail atual vale como informado (não exige recálculo nem domínio).
    const propostos = identificadoresDe(nome, segundoNome, sobrenome, grupo, atual.emailCorporativo);
    const aplicar = new Set((entrada.aplicar ?? []).filter((c) => sobrenome && propostos[c]));
    if (aplicar.size) validarFormato({ ...propostos, emailCorporativo: propostos.emailCorporativo ?? atual.emailCorporativo });
    const finais = {
      nomeServidorPc: aplicar.has("nomeServidorPc") ? propostos.nomeServidorPc : atual.nomeServidorPc,
      loginUau: aplicar.has("loginUau") ? propostos.loginUau : atual.loginUau,
      loginMicrosoft: aplicar.has("loginMicrosoft") ? propostos.loginMicrosoft : atual.loginMicrosoft,
      emailCorporativo: aplicar.has("emailCorporativo") ? propostos.emailCorporativo! : atual.emailCorporativo,
    };
    // Só o que muda é verificado: o próprio registro não conta como duplicidade.
    const mudam = CAMPOS.filter((c) => aplicar.has(c) && finais[c] !== atual[c]);
    const conflitos = await procurarConflitos(prisma, finais, atual.id, mudam);
    if (conflitos.length) throw new ErroIdentificadores(conflitos);

    const situacao = entrada.situacao ?? atual.situacao;
    if (atual.situacao === "DESLIGADO" && situacao !== "DESLIGADO") {
      throw new ErroNegocio("Pessoa desligada não é reativada pela edição do cadastro.");
    }
    const cpfInformado = await prepararCpf(entrada.cpf, atual.id);
    const cpf = cpfInformado && cpfInformado.cpfHmac !== atual.cpfHmac ? cpfInformado : null;
    const foto = await gravarFoto(entrada.foto);

    try {
      await prisma.$transaction(async (tx) => {
        // Revalida com bloqueio da linha: um perfil de TI atribuído em paralelo muda a regra.
        const alvo = await carregarAlvo(tx, atual.id, { bloquear: true });
        if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
        if (mudam.length) {
          await travarIdentificadores(tx);
          const corrida = await procurarConflitos(tx, finais, atual.id, mudam);
          if (corrida.length) throw new ErroIdentificadores(corrida);
        }
        exigirPermissao(ator, "colaborador.editar", alvo);
        if (alvo.temPerfilTiAtivo) exigirPermissao(ator, "colaborador.editar_equipe_ti", alvo);
        if (atual.situacao === "ATIVO" && situacao !== "ATIVO") {
          const perfis = await tx.perfilAtribuido.findMany({ where: { colaboradorId: atual.id, revogadoEm: null }, select: { perfil: true } });
          if (perfis.some((p) => PERFIS_ADMINISTRATIVOS.includes(p.perfil as PerfilTi))) await garantirOutroAdministrador(tx, atual.id);
        }

        const dados = {
          nome,
          segundoNome,
          sobrenomeUtilizado: sobrenome,
          cargo: normalizarNome(entrada.cargo),
          departamento: normalizarNome(entrada.departamento),
          empresaId: empresa.id,
          situacao,
          grupoLicencaId: grupo?.id ?? null,
          nomeServidorPc: finais.nomeServidorPc,
          loginUau: finais.loginUau,
          loginMicrosoft: finais.loginMicrosoft,
          emailCorporativo: finais.emailCorporativo,
        };
        await tx.colaborador.update({
          where: { id: atual.id },
          data: {
            ...dados,
            // A chave só acompanha um nome de servidor/PC aplicado (cadastros antigos repetidos ficam sem chave).
            ...(mudam.includes("nomeServidorPc") ? { chaveServidorPc: chaveServidorPc(finais.nomeServidorPc) } : {}),
            ...(foto ? { fotoChave: foto.chave, fotoTipo: foto.tipo } : {}),
            ...(!foto && entrada.removerFoto ? { fotoChave: null, fotoTipo: null } : {}),
            ...(cpf ?? {}),
          },
        });
        if (atual.conta && (atual.conta.email !== finais.emailCorporativo || atual.conta.name !== nome)) {
          await tx.contaAcesso.update({ where: { id: atual.conta.id }, data: { email: finais.emailCorporativo, name: nome } });
        }

        const antes: Record<string, unknown> = atual;
        const alterados = Object.entries(dados)
          .filter(([k, v]) => antes[k] !== v)
          .map(([k]) => k);
        if (foto || (entrada.removerFoto && atual.fotoChave)) alterados.push("foto");
        if (cpf) alterados.push("cpf");
        await registrarAuditoria(tx, {
          acao: "colaborador.editar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "colaborador", id: atual.id, descricao: nome },
          origemPermissao: origem,
          // Só os nomes dos campos: valores pessoais não vão para a auditoria.
          detalhe: { campos: alterados, loginPortalAlterado: atual.emailCorporativo !== finais.emailCorporativo, empresa: empresa.sigla },
        });
      });
    } catch (erro) {
      if (foto) await obterArmazenamento().remover(foto.chave).catch(() => undefined);
      throw traduzirUnicidade(erro);
    }
    if (atual.fotoChave && (foto || entrada.removerFoto)) await obterArmazenamento().remover(atual.fotoChave).catch(() => undefined);
    // CPF completado: os TERs que esperavam por ele são gerados agora (falha fica no próprio TER).
    const tersGerados = cpf ? await retomarPendentesDoColaborador(atual.id, ator).catch(() => 0) : 0;
    return { id: atual.id, nome, tersGerados };
  });
}

/** Foto para a rota autorizada /api/pessoas/[id]/foto: TI com escopo de grupo ou a própria pessoa. */
export async function lerFotoPessoa(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (escopo !== "GRUPO" && id !== ator.colaboradorId) throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO", id);
    const c = await prisma.colaborador.findUnique({ where: { id }, select: { fotoChave: true, fotoTipo: true } });
    if (!c?.fotoChave || !c.fotoTipo || !armazenamentoDisponivel()) return null;
    const dados = await obterArmazenamento().ler(c.fotoChave);
    return dados ? { dados, tipo: c.fotoTipo } : null;
  });
}

/** Criação (simulada) da conta Microsoft 365 para uma pessoa já cadastrada. */
export async function provisionarContaMicrosoft(
  ator: Ator,
  entrada: { colaboradorId: string; senhaMicrosoft: string },
) {
  return executarCasoDeUso(ator, async () => {
    const alvo = await carregarAlvo(prisma, entrada.colaboradorId, { bloquear: false });
    if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
    const { origem } = exigirPermissao(ator, "provisionamento.executar", alvo);
    const pessoa = await prisma.colaborador.findUniqueOrThrow({ where: { id: alvo.colaboradorId } });
    const problema = validarPoliticaSenha(entrada.senhaMicrosoft, pessoa.emailCorporativo);
    if (problema) throw new ErroNegocio(problema);
    const { microsoft365 } = obterConectores();
    const resultado = await microsoft365.criarUsuario({
      nomeExibicao: pessoa.nome,
      upn: pessoa.emailCorporativo,
      senhaInicial: entrada.senhaMicrosoft,
      marcadorPortal: pessoa.id.replace(/-/g, "").slice(0, 16),
    });
    await registrarAuditoria(prisma, {
      acao: "provisionamento.executar",
      resultado: resultado.ok ? "SUCESSO" : "FALHA",
      ator: { contaId: ator.contaId, nome: ator.nome },
      alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
      origemPermissao: origem,
      simulado: true,
      detalhe: { sistema: "Microsoft 365", operacao: "m365.criar_conta", correlacaoId: resultado.correlacaoId },
    });
    return resultado.ok
      ? { ok: true as const, mensagem: "Conta Microsoft 365 criada em modo de simulação." }
      : { ok: false as const, mensagem: `Falha simulada: ${resultado.erro.mensagem}` };
  });
}

/** Redefinição de senha pela TI: a conta volta a exigir ativação pelo titular. */
export async function redefinirSenhaPelaTi(ator: Ator, entrada: { colaboradorId: string; novaSenha: string }) {
  return executarCasoDeUso(ator, async () => {
    const pessoa = await prisma.colaborador.findUnique({
      where: { id: entrada.colaboradorId },
      include: { conta: { include: { credenciais: { where: { providerId: "credential" } } } } },
    });
    if (!pessoa?.conta) throw new ErroNegocio("A pessoa não tem conta de acesso.");
    // Verificação prévia (sem bloqueio); repetida dentro da transação com SELECT … FOR UPDATE.
    const alvoPrevio = await carregarAlvo(prisma, pessoa.id, { bloquear: false });
    exigirPermissao(ator, "conta_acesso.redefinir_senha", alvoPrevio ?? undefined);
    const problema = validarPoliticaSenha(entrada.novaSenha, pessoa.emailCorporativo);
    if (problema) throw new ErroNegocio(problema);
    const hashSenha = await gerarHashSenha(entrada.novaSenha);

    await prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, pessoa.id, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "conta_acesso.redefinir_senha", alvo);
      const conta = pessoa.conta!;
      await tx.credencialConta.update({ where: { id: conta.credenciais[0].id }, data: { password: hashSenha } });
      await tx.contaAcesso.update({ where: { id: conta.id }, data: { senhaPessoalDefinidaEm: null } });
      await tx.sessao.deleteMany({ where: { userId: conta.id } });
      await registrarAuditoria(tx, {
        acao: "conta_acesso.redefinir_senha",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
        detalhe: { sessoesRevogadas: true, exigeNovaAtivacao: true },
      });
    });
  });
}

export async function alterarBloqueioConta(
  ator: Ator,
  entrada: { colaboradorId: string; bloquear: boolean },
) {
  return executarCasoDeUso(ator, async () => {
    const permissao = entrada.bloquear ? "conta_acesso.bloquear" : "conta_acesso.desbloquear";
    await prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, entrada.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, permissao, alvo);
      const pessoa = await tx.colaborador.findUniqueOrThrow({
        where: { id: alvo.colaboradorId },
        include: { conta: true, perfis: { where: { revogadoEm: null } } },
      });
      if (!pessoa.conta || pessoa.conta.situacao === "DESATIVADA") {
        throw new ErroNegocio("A pessoa não tem conta de acesso ativa ou bloqueada.");
      }
      if (entrada.bloquear) {
        if (pessoa.perfis.some((p) => PERFIS_ADMINISTRATIVOS.includes(p.perfil as PerfilTi))) {
          await garantirOutroAdministrador(tx, pessoa.id);
        }
        await tx.sessao.deleteMany({ where: { userId: pessoa.conta.id } });
      }
      await tx.contaAcesso.update({
        where: { id: pessoa.conta.id },
        data: { situacao: entrada.bloquear ? "BLOQUEADA" : "ATIVA" },
      });
      await registrarAuditoria(tx, {
        acao: permissao,
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
      });
    });
  });
}
