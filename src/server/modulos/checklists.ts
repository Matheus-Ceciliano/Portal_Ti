import type { Prisma } from "@/generated/prisma/client";
import { PARTES_KIT, type ParteKit } from "@/lib/identificacao";
import { APLICACOES, type Aplicacao, type Pergunta } from "@/lib/inspecao";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import { prisma, type ClienteBanco } from "@/server/db";
import { UUID } from "./inventario-base";

/**
 * Checklists de inspeção por categoria, mantidos pela TI sem mudar o código. A pergunta tem
 * identidade estável (ordem e situação mudam nela); o conteúdo — texto, orientações e regras —
 * vive em versões que nunca mudam: editar cria a próxima versão e as inspeções já feitas
 * continuam apontando para a versão que exibiram. Inativar tira a pergunta das próximas
 * inspeções sem apagar nada do histórico.
 */

const SELECAO_VERSAO = {
  id: true,
  versao: true,
  grupo: true,
  texto: true,
  comoTestar: true,
  resultadoEsperado: true,
  sinaisProblema: true,
  obrigatoria: true,
  bloqueante: true,
  aplicacao: true,
  partes: true,
  criadaEm: true,
  criadaPorNome: true,
} as const satisfies Prisma.VersaoPerguntaInspecaoSelect;

type VersaoLida = Prisma.VersaoPerguntaInspecaoGetPayload<{ select: typeof SELECAO_VERSAO }>;

/** Versão no formato do checklist (o mesmo no cadastro, na devolução e na entrega). */
export const paraPergunta = (perguntaId: string, v: VersaoLida): Pergunta => ({
  chave: v.id,
  perguntaId,
  versao: v.versao,
  grupo: v.grupo,
  texto: v.texto,
  orientacao: { comoTestar: v.comoTestar, resultadoEsperado: v.resultadoEsperado, sinaisProblema: v.sinaisProblema },
  bloqueante: v.bloqueante,
  obrigatoria: v.obrigatoria,
  aplicacao: v.aplicacao as Aplicacao,
  partes: v.partes as ParteKit[],
});

const comVersaoAtual = { versoes: { orderBy: { versao: "desc" }, take: 1, select: SELECAO_VERSAO } } as const;

/**
 * Checklist vigente da categoria: perguntas ativas, na ordem, com a versão atual. Categoria sem
 * perguntas ativas usa o checklist de "Outro" (nenhuma inspeção fica sem verificação).
 */
export async function checklistVigente(db: ClienteBanco, categoriaId: string): Promise<{ perguntas: Pergunta[]; herdado: boolean }> {
  const ler = (onde: Prisma.PerguntaInspecaoWhereInput) =>
    db.perguntaInspecao.findMany({ where: { ...onde, ativa: true }, orderBy: [{ ordem: "asc" }, { criadaEm: "asc" }], include: comVersaoAtual });
  let lidas = await ler({ categoriaId });
  let herdado = false;
  if (!lidas.length) {
    lidas = await ler({ categoria: { codigo: "OUTRO" } });
    herdado = true;
  }
  return { perguntas: lidas.filter((p) => p.versoes[0]).map((p) => paraPergunta(p.id, p.versoes[0])), herdado };
}

/* Gestão (Catálogos do Inventário > Checklists de Inspeção) */

const exigirGrupo = (ator: Ator) => {
  const { escopo } = exigirPermissao(ator, "ativo.ver");
  if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
};

/** Todas as perguntas (ativas e inativas) de todas as categorias, com a versão atual e o uso. */
export async function listarChecklists(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator);
    const [perguntas, usos] = await Promise.all([
      prisma.perguntaInspecao.findMany({
        orderBy: [{ categoriaId: "asc" }, { ordem: "asc" }, { criadaEm: "asc" }],
        include: { ...comVersaoAtual, _count: { select: { versoes: true } } },
      }),
      prisma.respostaInspecao.groupBy({ by: ["versaoPerguntaId"], where: { versaoPerguntaId: { not: null } }, _count: { _all: true } }),
    ]);
    const versaoDe = new Map((await prisma.versaoPerguntaInspecao.findMany({ select: { id: true, perguntaId: true } })).map((v) => [v.id, v.perguntaId]));
    const usoPorPergunta = new Map<string, number>();
    for (const u of usos) {
      const p = versaoDe.get(u.versaoPerguntaId!);
      if (p) usoPorPergunta.set(p, (usoPorPergunta.get(p) ?? 0) + u._count._all);
    }
    return {
      perguntas: perguntas
        .filter((p) => p.versoes[0])
        .map((p) => ({
          id: p.id,
          categoriaId: p.categoriaId,
          ordem: p.ordem,
          ativa: p.ativa,
          versoes: p._count.versoes,
          /** Respostas registradas com qualquer versão desta pergunta. */
          usos: usoPorPergunta.get(p.id) ?? 0,
          atual: paraPergunta(p.id, p.versoes[0]),
          atualizadaEm: p.versoes[0].criadaEm.toISOString(),
          atualizadaPorNome: p.versoes[0].criadaPorNome,
        })),
      podeGerir: pode(ator, "catalogo.gerenciar"),
    };
  });
}

export type ListaChecklists = Awaited<ReturnType<typeof listarChecklists>>;
export type PerguntaGestao = ListaChecklists["perguntas"][number];

export type EntradaPergunta = {
  id?: string | null;
  categoriaId: string;
  grupo: string;
  texto: string;
  comoTestar: string;
  resultadoEsperado: string;
  sinaisProblema: string;
  obrigatoria: boolean;
  bloqueante: boolean;
  aplicacao: string;
  partes?: string[];
  ordem?: number | null;
  ativa: boolean;
};

const texto = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim().replace(/[ \t]+/g, " ");
  if (!t) throw new ErroNegocio(`Informe ${rotulo}.`);
  if (t.length > max) throw new ErroNegocio(`${rotulo[0].toUpperCase()}${rotulo.slice(1)}: use no máximo ${max} caracteres.`);
  return t;
};

const auditar = (ator: Ator, origem: string, acao: string, alvo: { id: string; descricao: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo: { tipo: "pergunta_inspecao", ...alvo },
  origemPermissao: origem,
  detalhe,
});

/** Ordem 1..n da categoria, com a pergunta indicada na posição pedida (a mesma lista, sem buracos). */
async function reordenar(tx: Prisma.TransactionClient, categoriaId: string, perguntaId: string, posicao: number) {
  const todas = await tx.perguntaInspecao.findMany({ where: { categoriaId }, orderBy: [{ ordem: "asc" }, { criadaEm: "asc" }], select: { id: true, ordem: true } });
  const ids = todas.map((p) => p.id).filter((id) => id !== perguntaId);
  ids.splice(Math.min(Math.max(posicao, 1), ids.length + 1) - 1, 0, perguntaId);
  for (const [i, id] of ids.entries()) {
    const atual = todas.find((p) => p.id === id);
    if (atual?.ordem !== i + 1) await tx.perguntaInspecao.update({ where: { id }, data: { ordem: i + 1 } });
  }
}

/**
 * Cria ou edita uma pergunta. Mudar o conteúdo cria a próxima versão (a anterior fica no
 * histórico das inspeções); ordem e situação mudam na própria pergunta. A categoria não muda
 * depois de criada.
 */
export async function salvarPergunta(ator: Ator, entrada: EntradaPergunta) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    const conteudo = {
      grupo: texto(entrada.grupo, 60, "o grupo"),
      texto: texto(entrada.texto, 200, "a pergunta"),
      comoTestar: texto(entrada.comoTestar, 800, "como testar"),
      resultadoEsperado: texto(entrada.resultadoEsperado, 600, "o resultado esperado"),
      sinaisProblema: texto(entrada.sinaisProblema, 600, "os sinais de não conformidade"),
      obrigatoria: entrada.obrigatoria === true,
      bloqueante: entrada.bloqueante === true,
      aplicacao: (APLICACOES.find((a) => a === entrada.aplicacao) ?? null) as Aplicacao | null,
      partes: [...new Set(entrada.partes ?? [])] as string[],
    };
    if (!conteudo.aplicacao) throw new ErroNegocio("Escolha quando a pergunta se aplica.");
    if (conteudo.partes.some((p) => !PARTES_KIT.includes(p as ParteKit))) throw new ErroNegocio("Peça do kit inválida.");
    const ordem = entrada.ordem == null || entrada.ordem === ("" as unknown) ? null : Number(entrada.ordem);
    if (ordem !== null && (!Number.isInteger(ordem) || ordem < 1 || ordem > 999)) throw new ErroNegocio("Ordem: use um número inteiro a partir de 1.");

    return prisma.$transaction(async (tx) => {
      // Uma alteração de checklist por categoria de cada vez (ordem sem colisão).
      const categoriaId = entrada.id
        ? (await tx.perguntaInspecao.findUnique({ where: { id: UUID.test(entrada.id) ? entrada.id : "" }, select: { categoriaId: true } }))?.categoriaId
        : entrada.categoriaId;
      if (!categoriaId || !UUID.test(categoriaId)) throw new ErroNegocio(entrada.id ? "Pergunta não encontrada." : "Selecione a categoria do equipamento.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checklist:${categoriaId}`}))`;
      const categoria = await tx.categoriaEquipamento.findUnique({ where: { id: categoriaId }, select: { id: true, nome: true, tipo: true } });
      if (!categoria) throw new ErroNegocio("Selecione a categoria do equipamento.");
      if (conteudo.partes.length && categoria.tipo !== "KIT_TECLADO_MOUSE") throw new ErroNegocio("Peças só se aplicam a categorias de kit.");

      if (!entrada.id) {
        const total = await tx.perguntaInspecao.count({ where: { categoriaId } });
        const p = await tx.perguntaInspecao.create({
          data: { categoriaId, ordem: total + 1, ativa: entrada.ativa !== false, criadaPorNome: ator.nome, versoes: { create: { ...conteudo, aplicacao: conteudo.aplicacao!, partes: conteudo.partes as ParteKit[], versao: 1, criadaPorNome: ator.nome } } },
        });
        if (ordem !== null && ordem !== total + 1) await reordenar(tx, categoriaId, p.id, ordem);
        await registrarAuditoria(tx, auditar(ator, origem, "catalogo.gerenciar", { id: p.id, descricao: conteudo.texto }, { operacao: "pergunta_criada", categoria: categoria.nome, versao: 1 }));
        return { id: p.id, versao: 1, novaVersao: false, mensagem: "Pergunta cadastrada." };
      }

      const atual = await tx.perguntaInspecao.findUniqueOrThrow({ where: { id: entrada.id }, include: comVersaoAtual });
      const v = atual.versoes[0];
      const mudou =
        !v ||
        (["grupo", "texto", "comoTestar", "resultadoEsperado", "sinaisProblema", "obrigatoria", "bloqueante", "aplicacao"] as const).some((k) => v[k] !== conteudo[k]) ||
        [...v.partes].sort().join(",") !== [...conteudo.partes].sort().join(",");
      let versao = v?.versao ?? 0;
      if (mudou) {
        versao += 1;
        await tx.versaoPerguntaInspecao.create({
          data: { perguntaId: atual.id, ...conteudo, aplicacao: conteudo.aplicacao!, partes: conteudo.partes as ParteKit[], versao, criadaPorNome: ator.nome },
        });
      }
      if (atual.ativa !== (entrada.ativa !== false)) await tx.perguntaInspecao.update({ where: { id: atual.id }, data: { ativa: entrada.ativa !== false } });
      if (ordem !== null && ordem !== atual.ordem) await reordenar(tx, categoriaId, atual.id, ordem);
      await registrarAuditoria(
        tx,
        auditar(ator, origem, "catalogo.gerenciar", { id: atual.id, descricao: conteudo.texto }, { operacao: "pergunta_editada", categoria: categoria.nome, versao, novaVersao: mudou, ativa: entrada.ativa !== false }),
      );
      return {
        id: atual.id,
        versao,
        novaVersao: mudou,
        mensagem: mudou ? `Pergunta atualizada: versão ${versao} vale para as próximas inspeções.` : "Pergunta atualizada.",
      };
    });
  });
}

/** Sobe ou desce a pergunta uma posição na categoria. */
export async function moverPergunta(ator: Ator, entrada: { id: string; direcao: "acima" | "abaixo" }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    if (!UUID.test(entrada.id) || (entrada.direcao !== "acima" && entrada.direcao !== "abaixo")) throw new ErroNegocio("Pergunta não encontrada.");
    return prisma.$transaction(async (tx) => {
      const p = await tx.perguntaInspecao.findUnique({ where: { id: entrada.id }, include: comVersaoAtual });
      if (!p) throw new ErroNegocio("Pergunta não encontrada.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checklist:${p.categoriaId}`}))`;
      const todas = await tx.perguntaInspecao.findMany({ where: { categoriaId: p.categoriaId }, orderBy: [{ ordem: "asc" }, { criadaEm: "asc" }], select: { id: true } });
      const i = todas.findIndex((x) => x.id === p.id);
      const destino = entrada.direcao === "acima" ? i : i + 2;
      if (destino < 1 || destino > todas.length) return { mensagem: "A pergunta já está no limite da lista." };
      await reordenar(tx, p.categoriaId, p.id, destino);
      await registrarAuditoria(tx, auditar(ator, origem, "catalogo.gerenciar", { id: p.id, descricao: p.versoes[0]?.texto ?? "" }, { operacao: "pergunta_reordenada", posicao: destino }));
      return { mensagem: `Pergunta movida para a posição ${destino}.` };
    });
  });
}

/** Ativa ou inativa: a inativa sai das próximas inspeções e continua nas já registradas. */
export async function alterarSituacaoPergunta(ator: Ator, entrada: { id: string; ativa: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    exigirGrupo(ator);
    if (!UUID.test(entrada.id)) throw new ErroNegocio("Pergunta não encontrada.");
    return prisma.$transaction(async (tx) => {
      const p = await tx.perguntaInspecao.findUnique({ where: { id: entrada.id }, include: comVersaoAtual });
      if (!p) throw new ErroNegocio("Pergunta não encontrada.");
      if (p.ativa !== entrada.ativa) await tx.perguntaInspecao.update({ where: { id: p.id }, data: { ativa: entrada.ativa } });
      await registrarAuditoria(tx, auditar(ator, origem, "catalogo.gerenciar", { id: p.id, descricao: p.versoes[0]?.texto ?? "" }, { operacao: entrada.ativa ? "pergunta_ativada" : "pergunta_inativada" }));
      return { mensagem: entrada.ativa ? "Pergunta ativada." : "Pergunta inativada: sai das próximas inspeções e continua no histórico." };
    });
  });
}
