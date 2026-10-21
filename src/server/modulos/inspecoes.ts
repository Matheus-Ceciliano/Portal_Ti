import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ParteKit } from "@/lib/identificacao";
import {
  defeitosBloqueantes,
  errosChecklist,
  perguntasAplicaveis,
  RESPOSTAS,
  resultadoChecklist,
  ROTULO_RESULTADO,
  type CondicaoEntrada,
  type ContextoInspecao,
  type Pergunta,
  type Resposta,
  type RespostasFormulario,
  type Resultado,
  type TipoInspecao,
} from "@/lib/inspecao";
import { FOTOS_POR_ENVIO, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type ClienteBanco, type Transacao } from "@/server/db";
import { checklistVigente } from "./checklists";
import {
  dadosFoto,
  descartarFotos,
  gravarArquivosFotos,
  mudarSituacao,
  prepararFotos,
  proximoNumero,
  rotuloAtivo,
  rotuloTipo,
  traduzirConflito,
  travarAtivos,
  urlFoto,
  UUID,
  type FotoEnviada,
  type FotoPreparada,
} from "./inventario-base";

/**
 * Inspeções técnicas: entrada (cadastro), devolução (avaliação) e pré-alocação. As respostas
 * são conferidas no servidor contra o checklist vigente da categoria (configurado pela TI) —
 * nenhuma é presumida — e o resultado é calculado aqui. Cada resposta aponta para a versão da
 * pergunta exibida. Concluída, a inspeção não muda: a seguinte é sempre outro registro. A
 * entrega física guarda, por item, o instantâneo do que foi verificado (TER).
 */

export type EntradaInspecao = {
  /** Respostas por versão de pergunta (a chave que o checklist exibiu). */
  respostas?: Record<string, { resposta?: string | null; justificativa?: string | null; observacao?: string | null } | undefined>;
  observacoes?: string | null;
  /** Fotos de evidência por pergunta (mesma chave das respostas). */
  fotos?: Record<string, FotoEnviada[] | undefined>;
};

/** O que a inspeção precisa saber do equipamento. */
export const SELECAO_INSPECAO = {
  id: true,
  categoria: true,
  categoriaId: true,
  parteKit: true,
  nomeDispositivo: true,
  patrimonio: true,
  numeroSerie: true,
  marca: true,
  modelo: true,
  categoriaEquipamento: { select: { codigo: true, nome: true } },
} as const;
export type AtivoInspecao = Prisma.AtivoGetPayload<{ select: typeof SELECAO_INSPECAO }>;

/** Checklist vigente de cada categoria, lido uma vez por operação. */
export function leitorDeChecklists(db: ClienteBanco) {
  const cache = new Map<string, Promise<Pergunta[]>>();
  return (categoriaId: string) => {
    if (!cache.has(categoriaId)) cache.set(categoriaId, checklistVigente(db, categoriaId).then((c) => c.perguntas));
    return cache.get(categoriaId)!;
  };
}

export type InspecaoPreparada = {
  contexto: ContextoInspecao;
  perguntas: Pergunta[];
  respostas: RespostasFormulario;
  observacoes: string | null;
  fotos: Map<string, FotoPreparada[]>;
  resultado: Resultado;
};

const texto = (v: string | null | undefined) => (v ?? "").normalize("NFC").trim();

/**
 * Confere as respostas contra o checklist vigente (as obrigatórias respondidas, nenhuma de fora),
 * as justificativas e as fotos. Erro aponta a primeira pergunta com problema.
 */
export function prepararInspecao(checklist: readonly Pergunta[], contexto: ContextoInspecao, entrada: EntradaInspecao | null | undefined, rotulo: string): InspecaoPreparada {
  if (!entrada || typeof entrada !== "object") throw new ErroNegocio(`${rotulo}: preencha a inspeção técnica.`);
  const perguntas = perguntasAplicaveis(checklist, contexto);
  if (!perguntas.length) throw new ErroNegocio(`${rotulo}: o checklist desta categoria não tem perguntas para esta inspeção. Configure em Catálogos do Inventário.`);
  const chaves = new Set(perguntas.map((p) => p.chave));
  const brutas = entrada.respostas ?? {};
  if (Object.keys(brutas).some((k) => !chaves.has(k))) {
    throw new ErroNegocio(`${rotulo}: o checklist mudou enquanto a inspeção era preenchida. Atualize a página e responda de novo.`);
  }
  const respostas: RespostasFormulario = {};
  for (const p of perguntas) {
    const r = brutas[p.chave];
    respostas[p.chave] = {
      resposta: RESPOSTAS.find((x) => x === r?.resposta) ?? "",
      justificativa: texto(r?.justificativa),
      observacao: texto(r?.observacao),
    };
  }
  const erros = errosChecklist(perguntas, respostas);
  const primeira = perguntas.find((p) => erros[p.chave]);
  if (primeira) throw new ErroNegocio(`${rotulo}: "${primeira.texto}". ${erros[primeira.chave]}`);
  const observacoes = texto(entrada.observacoes);
  if (observacoes.length > 1000) throw new ErroNegocio(`${rotulo}: observações da inspeção com no máximo 1000 caracteres.`);

  const fotos = new Map<string, FotoPreparada[]>();
  let total = 0;
  for (const [chave, lista] of Object.entries(entrada.fotos ?? {})) {
    if (!lista?.length) continue;
    if (!chaves.has(chave) || !respostas[chave]?.resposta) throw new ErroNegocio(`${rotulo}: foto de um item sem resposta ou fora do checklist.`);
    const preparadas = prepararFotos(lista.map((f) => ({ ...f, tipo: "OUTRA" })));
    total += preparadas.length;
    if (preparadas.length) fotos.set(chave, preparadas);
  }
  if (total > FOTOS_POR_ENVIO) throw new ErroNegocio(`${rotulo}: envie no máximo ${FOTOS_POR_ENVIO} fotos por inspeção.`);
  return { contexto, perguntas, respostas, observacoes: observacoes || null, fotos, resultado: resultadoChecklist(perguntas, respostas)! };
}

export const fotosDaInspecao = (p: InspecaoPreparada) => [...p.fotos.values()].flat();

/** Itens que impedem o uso, para mensagens e para a manutenção. */
const descreverDefeitos = (p: InspecaoPreparada) =>
  defeitosBloqueantes(p.perguntas, p.respostas).map((x) => `${x.texto}: ${p.respostas[x.chave].justificativa}`);

/**
 * Grava a inspeção concluída — ou conclui a pendente do equipamento, na devolução —, com as
 * respostas (texto da pergunta como foi exibido e a versão dela) e as fotos de evidência.
 * Pergunta opcional sem resposta não gera linha: nada é presumido.
 */
export async function gravarInspecao(
  tx: Transacao,
  ator: Ator,
  ativo: AtivoInspecao,
  prep: InspecaoPreparada,
  extra: { tipo: TipoInspecao; condicaoEntrada?: CondicaoEntrada | null; devolucaoId?: string | null; alocacaoId?: string | null; quando?: Date },
) {
  const quando = extra.quando ?? new Date();
  const numero = await proximoNumero(tx, "INS", quando);
  const pendente = extra.tipo === "DEVOLUCAO" ? await tx.inspecaoTecnica.findFirst({ where: { ativoId: ativo.id, pendente: true }, select: { id: true } }) : null;
  const dados = {
    numero,
    tipo: extra.tipo,
    estado: "CONCLUIDA" as const,
    pendente: null,
    categoria: ativo.categoria,
    categoriaNome: rotuloTipo(ativo),
    condicaoEntrada: extra.condicaoEntrada ?? null,
    resultado: prep.resultado,
    observacoes: prep.observacoes,
    alocacaoId: extra.alocacaoId ?? null,
    concluidaEm: quando,
    responsavelContaId: ator.contaId,
    responsavelNome: ator.nome,
    // Opcionais sem resposta ficam registradas como tal (texto e versão exibidos).
    perguntasSemResposta: prep.perguntas
      .filter((p) => !prep.respostas[p.chave]?.resposta)
      .map((p) => ({ perguntaId: p.perguntaId, versaoPerguntaId: p.chave, versao: p.versao, grupo: p.grupo, pergunta: p.texto })),
  };
  const inspecao = pendente
    ? await tx.inspecaoTecnica.update({ where: { id: pendente.id }, data: dados, select: { id: true } })
    : await tx.inspecaoTecnica.create({
        data: { ...dados, ativoId: ativo.id, devolucaoId: extra.devolucaoId ?? null, abertaEm: quando, abertaPorNome: ator.nome },
        select: { id: true },
      });
  const linhas = prep.perguntas
    .filter((p) => prep.respostas[p.chave]?.resposta)
    .map((p, i) => {
      const r = prep.respostas[p.chave];
      return {
        id: randomUUID(),
        inspecaoId: inspecao.id,
        chave: p.perguntaId,
        versaoPerguntaId: p.chave,
        ordem: i + 1,
        grupo: p.grupo,
        pergunta: p.texto,
        bloqueante: p.bloqueante,
        obrigatoria: p.obrigatoria,
        resposta: r.resposta as Resposta,
        justificativa: r.justificativa || null,
        observacao: r.observacao || null,
      };
    });
  await tx.respostaInspecao.createMany({ data: linhas });
  const fotos = linhas.flatMap((l) =>
    (prep.fotos.get(l.versaoPerguntaId) ?? []).map((f) => ({ ...dadosFoto(f, ativo.id, ator), contexto: "INSPECAO" as const, inspecaoId: inspecao.id, respostaId: l.id })),
  );
  if (fotos.length) await tx.fotoAtivo.createMany({ data: fotos });
  return { id: inspecao.id, numero, resultado: prep.resultado };
}

/**
 * Inspeção de entrada (cadastro). Com defeito bloqueante, o equipamento é cadastrado mas não
 * fica disponível: entra em manutenção com os itens reprovados.
 */
export async function registrarInspecaoEntrada(tx: Transacao, ator: Ator, ativoId: string, prep: InspecaoPreparada, condicao: CondicaoEntrada) {
  const a = await tx.ativo.findUniqueOrThrow({ where: { id: ativoId }, select: { ...SELECAO_INSPECAO, situacao: true } });
  const r = await gravarInspecao(tx, ator, a, prep, { tipo: "ENTRADA", condicaoEntrada: condicao });
  if (r.resultado === "INAPTO") {
    const m = await tx.manutencao.create({
      data: { ativoId, motivo: `Defeito bloqueante na inspeção de entrada ${r.numero}`, observacoes: descreverDefeitos(prep).join("\n").slice(0, 1000), abertaPorNome: ator.nome },
    });
    await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo: rotuloAtivo(a) }, "MANUTENCAO", {
      tipo: "ENVIO_MANUTENCAO",
      manutencaoId: m.id,
      observacao: `Inspeção de entrada ${r.numero}: inapto.`,
    });
  }
  return { ...r, nome: rotuloAtivo(a) };
}

/* Consulta */

export const SELECAO_RESUMO = {
  id: true,
  numero: true,
  tipo: true,
  estado: true,
  categoriaNome: true,
  condicaoEntrada: true,
  resultado: true,
  observacoes: true,
  abertaEm: true,
  abertaPorNome: true,
  motivoAbertura: true,
  concluidaEm: true,
  responsavelNome: true,
  canceladaEm: true,
  motivoCancelamento: true,
  perguntasSemResposta: true,
  questionario: { select: { codigo: true, versao: true, titulo: true } },
  respostas: {
    orderBy: { ordem: "asc" },
    select: {
      chave: true,
      grupo: true,
      pergunta: true,
      resposta: true,
      justificativa: true,
      observacao: true,
      bloqueante: true,
      versaoPergunta: { select: { versao: true } },
      fotos: { select: { id: true } },
    },
  },
} as const satisfies Prisma.InspecaoTecnicaSelect;

export function resumoInspecao(i: Prisma.InspecaoTecnicaGetPayload<{ select: typeof SELECAO_RESUMO }>) {
  return {
    id: i.id,
    numero: i.numero,
    tipo: i.tipo,
    estado: i.estado,
    categoria: i.categoriaNome,
    condicaoEntrada: i.condicaoEntrada,
    resultado: i.resultado,
    observacoes: i.observacoes,
    abertaEm: i.abertaEm.toISOString(),
    abertaPorNome: i.abertaPorNome,
    motivoAbertura: i.motivoAbertura,
    concluidaEm: i.concluidaEm?.toISOString() ?? null,
    responsavel: i.responsavelNome,
    canceladaEm: i.canceladaEm?.toISOString() ?? null,
    motivoCancelamento: i.motivoCancelamento,
    questionario: i.questionario,
    respostas: i.respostas.map((r) => ({
      chave: r.chave,
      grupo: r.grupo,
      pergunta: r.pergunta,
      resposta: r.resposta,
      justificativa: r.justificativa,
      observacao: r.observacao,
      bloqueante: r.bloqueante,
      /** Versão da pergunta respondida (nula nas inspeções da primeira etapa). */
      versao: r.versaoPergunta?.versao ?? null,
      fotos: r.fotos.map((f) => ({ id: f.id, url: urlFoto(f.id) })),
    })),
    /** Perguntas opcionais deixadas sem resposta (nada é presumido). */
    semResposta: (i.perguntasSemResposta as PerguntaSemResposta[] | null) ?? [],
  };
}

export type PerguntaSemResposta = { perguntaId: string; versaoPerguntaId: string; versao: number; grupo: string; pergunta: string };

export type ResumoInspecao = ReturnType<typeof resumoInspecao>;

/** Última inspeção concluída (a válida para a próxima entrega). */
export const ultimaConcluida = (db: ClienteBanco, ativoId: string) =>
  db.inspecaoTecnica.findFirst({ where: { ativoId, estado: "CONCLUIDA" }, orderBy: [{ concluidaEm: "desc" }, { numero: "desc" }], select: SELECAO_RESUMO });

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

/** Condição de cada equipamento para a revisão da entrega: questionário e última inspeção. */
export async function condicoesParaEntrega(ator: Ator, ativoIds: string[]) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const ids = [...new Set(ativoIds)].filter((i) => UUID.test(i)).slice(0, 30);
    const ativos = (await prisma.ativo.findMany({ where: { id: { in: ids } }, select: SELECAO_INSPECAO })).sort(
      // Equipamentos primeiro; os carregadores (que os acompanham) depois.
      (a, b) => Number(a.categoria === "CARREGADOR") - Number(b.categoria === "CARREGADOR") || rotuloAtivo(a).localeCompare(rotuloAtivo(b), "pt-BR"),
    );
    const checklist = leitorDeChecklists(prisma);
    const [ultimas, perguntas] = await Promise.all([
      Promise.all(ativos.map((a) => ultimaConcluida(prisma, a.id))),
      Promise.all(ativos.map((a) => checklist(a.categoriaId))),
    ]);
    return ativos.map((a, i) => ({
      ativoId: a.id,
      rotulo: rotuloAtivo(a),
      rotuloCategoria: rotuloTipo(a),
      parteKit: a.parteKit as ParteKit | null,
      /** Checklist vigente para a inspeção antes da entrega (só o que vale para o item). */
      perguntas: perguntasAplicaveis(perguntas[i], { tipo: "PRE_ALOCACAO", parte: a.parteKit }),
      ultima: ultimas[i] ? resumoInspecao(ultimas[i]!) : null,
    }));
  });
}

export type CondicaoParaEntrega = Awaited<ReturnType<typeof condicoesParaEntrega>>[number];

/** Inspeção completa (respostas e fotos) para consulta. */
export async function obterInspecao(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const i = UUID.test(id) ? await prisma.inspecaoTecnica.findUnique({ where: { id }, select: SELECAO_RESUMO }) : null;
    if (!i) throw new ErroNegocio("Inspeção não encontrada.");
    return resumoInspecao(i);
  });
}

/** Checklist da avaliação técnica do equipamento devolvido (só o que vale para ele). */
export async function checklistParaAvaliacao(ator: Ator, ativoId: string) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const a = UUID.test(ativoId) ? await prisma.ativo.findUnique({ where: { id: ativoId }, select: SELECAO_INSPECAO }) : null;
    if (!a) throw new ErroNegocio("Equipamento não encontrado.");
    const { perguntas, herdado } = await checklistVigente(prisma, a.categoriaId);
    return { rotulo: rotuloAtivo(a), categoria: rotuloTipo(a), herdado, perguntas: perguntasAplicaveis(perguntas, { tipo: "DEVOLUCAO", parte: a.parteKit }) };
  });
}

/** Checklists da inspeção de entrada: o da categoria e, no notebook, o do carregador C1. */
export async function checklistsDoCadastro(ator: Ator, categoriaId: string) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "ativo.criar");
    const c = UUID.test(categoriaId) ? await prisma.categoriaEquipamento.findUnique({ where: { id: categoriaId }, select: { id: true, tipo: true } }) : null;
    if (!c) throw new ErroNegocio("Selecione a categoria.");
    const principal = await checklistVigente(prisma, c.id);
    const carregador =
      c.tipo === "NOTEBOOK" ? await prisma.categoriaEquipamento.findUnique({ where: { codigo: "CARREGADOR" }, select: { id: true } }).then((x) => (x ? checklistVigente(prisma, x.id) : null)) : null;
    return { principal: principal.perguntas, herdado: principal.herdado, carregador: carregador?.perguntas ?? null };
  });
}

/* Verificação na entrega física */

export type EntradaVerificacao =
  | { ativoId: string; modo: "CONFIRMAR"; inspecaoId: string }
  | { ativoId: string; modo: "NOVA"; inspecao: EntradaInspecao };

type VerificacaoPreparada = { modo: "CONFIRMAR"; inspecaoId: string } | { modo: "NOVA"; prep: InspecaoPreparada };

/**
 * Antes da transação: cada equipamento entregue tem a própria verificação — confirmar a
 * última inspeção ou uma inspeção nova, que não pode ter defeito bloqueante.
 */
export async function prepararVerificacoes(db: ClienteBanco, ativoIds: string[], verificacoes: EntradaVerificacao[] | null | undefined) {
  const lista = Array.isArray(verificacoes) ? verificacoes : [];
  const porAtivo = new Map<string, EntradaVerificacao>();
  for (const v of lista) {
    if (!v || typeof v !== "object" || !ativoIds.includes(v.ativoId)) throw new ErroNegocio("Verificação técnica de um equipamento fora da entrega.");
    if (porAtivo.has(v.ativoId)) throw new ErroNegocio("Equipamento com mais de uma verificação técnica.");
    porAtivo.set(v.ativoId, v);
  }
  const ativos = await db.ativo.findMany({ where: { id: { in: ativoIds } }, select: SELECAO_INSPECAO });
  const checklist = leitorDeChecklists(db);
  const preparadas = new Map<string, VerificacaoPreparada>();
  for (const a of ativos) {
    const rotulo = rotuloAtivo(a);
    const v = porAtivo.get(a.id);
    if (!v) throw new ErroNegocio(`${rotulo}: confirme a condição do equipamento antes da entrega física.`);
    if (v.modo === "CONFIRMAR") {
      if (!UUID.test(v.inspecaoId ?? "")) throw new ErroNegocio(`${rotulo}: inspeção não encontrada.`);
      preparadas.set(a.id, { modo: "CONFIRMAR", inspecaoId: v.inspecaoId });
    } else if (v.modo === "NOVA") {
      const prep = prepararInspecao(await checklist(a.categoriaId), { tipo: "PRE_ALOCACAO", parte: a.parteKit }, v.inspecao, `Inspeção de ${rotulo}`);
      if (prep.resultado === "INAPTO") {
        throw new ErroNegocio(`${rotulo}: a inspeção encontrou defeito bloqueante (${descreverDefeitos(prep)[0]}). Retire-o da entrega e encaminhe para manutenção.`);
      }
      preparadas.set(a.id, { modo: "NOVA", prep });
    } else {
      throw new ErroNegocio(`${rotulo}: escolha entre confirmar a última inspeção ou registrar uma nova.`);
    }
  }
  return preparadas;
}

export const fotosDasVerificacoes = (p: Map<string, VerificacaoPreparada>) =>
  [...p.values()].flatMap((v) => (v.modo === "NOVA" ? fotosDaInspecao(v.prep) : []));

/**
 * Na transação, com os equipamentos travados: confere que a inspeção confirmada continua sendo
 * a última (e sem defeito bloqueante), grava as inspeções novas e o instantâneo de cada item.
 */
export async function registrarVerificacoes(
  tx: Transacao,
  ator: Ator,
  alocacaoId: string,
  itens: { id: string; ativoId: string }[],
  preparadas: Map<string, VerificacaoPreparada>,
  /** Evento de entrega física (TER) a que os itens pertencem. */
  eventoEntregaId: string | null = null,
) {
  const agora = new Date();
  const ativos = new Map((await tx.ativo.findMany({ where: { id: { in: itens.map((i) => i.ativoId) } }, select: SELECAO_INSPECAO })).map((a) => [a.id, a]));
  for (const item of itens) {
    const ativo = ativos.get(item.ativoId)!;
    const rotulo = rotuloAtivo(ativo);
    const v = preparadas.get(item.ativoId);
    if (!v) throw new ErroNegocio(`${rotulo}: confirme a condição do equipamento antes da entrega física.`);
    let inspecaoId: string;
    if (v.modo === "CONFIRMAR") {
      const ultima = await ultimaConcluida(tx, ativo.id);
      if (!ultima || ultima.id !== v.inspecaoId) throw new ErroNegocio(`${rotulo}: há uma inspeção mais recente do que a exibida. Revise a condição do equipamento.`);
      if (ultima.resultado === "INAPTO") throw new ErroNegocio(`${rotulo}: a última inspeção tem defeito bloqueante. Registre uma nova inspeção ou encaminhe para manutenção.`);
      inspecaoId = ultima.id;
    } else {
      inspecaoId = (await gravarInspecao(tx, ator, ativo, v.prep, { tipo: "PRE_ALOCACAO", alocacaoId, quando: agora })).id;
    }
    const inspecao = resumoInspecao(await tx.inspecaoTecnica.findUniqueOrThrow({ where: { id: inspecaoId }, select: SELECAO_RESUMO }));
    await tx.verificacaoEntrega.create({
      data: {
        itemAlocacaoId: item.id,
        alocacaoId,
        ativoId: ativo.id,
        inspecaoId,
        modo: v.modo === "CONFIRMAR" ? "CONFIRMOU_ULTIMA" : "NOVA_INSPECAO",
        instantaneo: instantaneoEntrega(ativo, inspecao, v.modo === "CONFIRMAR" ? "CONFIRMOU_ULTIMA" : "NOVA_INSPECAO", agora, ator),
        verificadaEm: agora,
        responsavelContaId: ator.contaId,
        responsavelNome: ator.nome,
        eventoEntregaId,
      },
    });
  }
}

/** Instantâneo da condição na entrega (o que o TER vai mostrar); inspeções futuras não o alteram. */
function instantaneoEntrega(ativo: AtivoInspecao, inspecao: ResumoInspecao, modo: "CONFIRMOU_ULTIMA" | "NOVA_INSPECAO", quando: Date, ator: Ator) {
  return {
    versao: 2,
    equipamento: {
      id: ativo.id,
      nome: ativo.nomeDispositivo,
      patrimonio: ativo.patrimonio,
      numeroSerie: ativo.numeroSerie,
      categoria: rotuloTipo(ativo),
      marca: ativo.marca,
      modelo: ativo.modelo,
      tipo: ativo.categoria,
      parteKit: ativo.parteKit,
    },
    inspecao: {
      id: inspecao.id,
      numero: inspecao.numero,
      tipo: inspecao.tipo,
      concluidaEm: inspecao.concluidaEm,
      responsavel: inspecao.responsavel,
      resultado: inspecao.resultado,
      observacoes: inspecao.observacoes,
    },
    questionario: inspecao.questionario,
    respostas: inspecao.respostas.map(({ fotos, ...r }) => ({ ...r, fotos: fotos.map((f) => f.id) })),
    semResposta: inspecao.semResposta,
    modo,
    verificadaEm: quando.toISOString(),
    responsavel: { contaId: ator.contaId, nome: ator.nome },
  } satisfies Prisma.InputJsonObject;
}

export type InstantaneoEntrega = ReturnType<typeof instantaneoEntrega>;

/* Avaliação técnica do equipamento devolvido */

export const ENCAMINHAMENTOS = ["DISPONIVEL", "MANUTENCAO", "AVALIACAO"] as const;
export type Encaminhamento = (typeof ENCAMINHAMENTOS)[number];

/**
 * Inspeção do equipamento em avaliação (conclui a pendente) e o encaminhamento decidido pela
 * TI: liberar para uso (só sem defeito bloqueante), enviar para manutenção ou manter em
 * avaliação. Nada é liberado sem a inspeção registrada.
 */
export async function concluirAvaliacao(ator: Ator, entrada: { ativoId: string; inspecao: EntradaInspecao; encaminhamento: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.transicionar");
    if (Object.values(entrada.inspecao?.fotos ?? {}).some((l) => l?.some((f) => f.dados.length))) exigirPermissao(ator, "evidencia.enviar");
    const encaminhamento = ENCAMINHAMENTOS.find((e) => e === entrada.encaminhamento);
    if (!encaminhamento) throw new ErroNegocio("Escolha o encaminhamento do equipamento.");
    const previo = UUID.test(entrada.ativoId) ? await prisma.ativo.findUnique({ where: { id: entrada.ativoId }, select: SELECAO_INSPECAO }) : null;
    if (!previo) throw new ErroNegocio("Equipamento não encontrado.");
    const prep = prepararInspecao((await checklistVigente(prisma, previo.categoriaId)).perguntas, { tipo: "DEVOLUCAO", parte: previo.parteKit }, entrada.inspecao, "Inspeção");
    if (encaminhamento === "DISPONIVEL" && prep.resultado === "INAPTO") {
      throw new ErroNegocio(`Defeito bloqueante (${descreverDefeitos(prep)[0]}): o equipamento não pode ser liberado. Envie para manutenção ou mantenha em avaliação.`);
    }
    const fotos = fotosDaInspecao(prep);
    await gravarArquivosFotos(fotos);

    try {
      return await prisma.$transaction(async (tx) => {
        await travarAtivos(tx, [previo.id]);
        const a = await tx.ativo.findUniqueOrThrow({ where: { id: previo.id }, select: { ...SELECAO_INSPECAO, situacao: true, desvinculadoEm: true } });
        const rotulo = rotuloAtivo(a);
        if (a.situacao !== "DEVOLVIDO_EM_AVALIACAO") throw new ErroNegocio(`${rotulo} não está em avaliação.`);
        if (encaminhamento === "DISPONIVEL" && a.categoria === "CARREGADOR" && a.desvinculadoEm) throw new ErroNegocio("Carregador desvinculado não volta para o estoque por aqui.");
        const r = await gravarInspecao(tx, ator, a, prep, { tipo: "DEVOLUCAO" });
        const observacao = `Inspeção ${r.numero}: ${ROTULO_RESULTADO[r.resultado].toLowerCase()}.`;
        if (encaminhamento === "DISPONIVEL") {
          await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo }, "DISPONIVEL", { tipo: "LIBERACAO_AVALIACAO", observacao });
        } else if (encaminhamento === "MANUTENCAO") {
          const defeitos = descreverDefeitos(prep);
          const naoConformes = prep.perguntas
            .filter((p) => prep.respostas[p.chave].resposta === "NAO_CONFORME" && !p.bloqueante)
            .map((p) => `${p.texto}: ${prep.respostas[p.chave].justificativa}`);
          const m = await tx.manutencao.create({
            data: {
              ativoId: a.id,
              motivo: `Encaminhado pela inspeção ${r.numero}`,
              observacoes: ([...defeitos, ...naoConformes].join("\n") || prep.observacoes || observacao).slice(0, 1000),
              abertaPorNome: ator.nome,
            },
          });
          await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo }, "MANUTENCAO", { tipo: "ENVIO_MANUTENCAO", manutencaoId: m.id, observacao });
        }
        await registrarAuditoria(tx, {
          acao: "ativo.transicionar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: a.id, descricao: rotulo },
          origemPermissao: origem,
          detalhe: { inspecao: r.numero, tipo: "DEVOLUCAO", resultado: r.resultado, encaminhamento, fotos: fotos.length },
        });
        return { numero: r.numero, resultado: r.resultado, encaminhamento };
      });
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      throw traduzirConflito(erro);
    }
  });
}
