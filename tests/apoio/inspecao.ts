import { alvosDaInspecaoEntrada, perguntasAplicaveis, type ContextoInspecao, type Pergunta, type Resposta } from "@/lib/inspecao";
import type { ParteKit } from "@/lib/identificacao";
import type { Categoria } from "@/lib/inventario";
import type { Ator } from "@/server/authz/ator";
import { prisma } from "@/server/db";
import { checklistVigente } from "@/server/modulos/checklists";
import type { EntradaInspecao, EntradaVerificacao } from "@/server/modulos/inspecoes";
import { cadastrarEquipamento } from "@/server/modulos/inventario";

/**
 * Inspeções de teste: respostas explícitas montadas pelo próprio teste (o portal nunca as
 * presume), sobre o checklist vigente no banco. `resposta` vale para todas as perguntas que se
 * aplicam (as opcionais também); `excecoes` muda itens pela chave (versão) da pergunta.
 */
export function respostasDe(
  perguntas: readonly Pergunta[],
  contexto: ContextoInspecao,
  resposta: Resposta = "CONFORME",
  excecoes: Record<string, { resposta: Resposta; justificativa?: string } | null> = {},
): EntradaInspecao {
  return {
    respostas: Object.fromEntries(
      perguntasAplicaveis(perguntas, contexto)
        .filter((p) => excecoes[p.chave] !== null)
        .map((p) => [p.chave, excecoes[p.chave] ?? { resposta, justificativa: resposta === "CONFORME" ? undefined : "Justificativa registrada no teste." }]),
    ),
  };
}

/** Checklist vigente de uma categoria do catálogo inicial e a versão atual de cada pergunta pelo código curto ("mn.tela"). */
export async function checklistDe(codigoCategoria: string) {
  const categoria = await prisma.categoriaEquipamento.findUniqueOrThrow({ where: { codigo: codigoCategoria } });
  const { perguntas } = await checklistVigente(prisma, categoria.id);
  const codigos = await prisma.perguntaInspecao.findMany({ where: { categoriaId: categoria.id }, select: { id: true, codigo: true } });
  const v = (curto: string) => {
    const id = codigos.find((c) => c.codigo === `${codigoCategoria}:${curto}`)?.id;
    const p = perguntas.find((x) => x.perguntaId === id);
    if (!p) throw new Error(`pergunta ${curto} fora do checklist de ${codigoCategoria}`);
    return p.chave;
  };
  return { categoria, perguntas, v };
}

type EntradaCadastro = Parameters<typeof cadastrarEquipamento>[1];

/** Inspeções de entrada (tudo conforme) para os equipamentos que o cadastro vai criar. */
export async function inspecoesDeEntrada(dados: EntradaCadastro["dados"], condicao: "NOVO" | "USADO" = "NOVO") {
  const categoria = dados.categoriaId
    ? await prisma.categoriaEquipamento.findUnique({ where: { id: dados.categoriaId } }).catch(() => null)
    : dados.categoria
      ? await prisma.categoriaEquipamento.findUnique({ where: { codigo: dados.categoria } })
      : null;
  if (!categoria) return {};
  const partes = (dados.partesKit ?? []).map((p) => p.parte as ParteKit);
  const carregador = await prisma.categoriaEquipamento.findUniqueOrThrow({ where: { codigo: "CARREGADOR" } });
  const entradas = await Promise.all(
    alvosDaInspecaoEntrada(categoria.tipo as Categoria, categoria.nome, partes).map(async (a) => {
      const { perguntas } = await checklistVigente(prisma, a.fonte === "carregador" ? carregador.id : categoria.id);
      return [a.alvo, respostasDe(perguntas, { tipo: "ENTRADA", condicao, parte: a.parte })] as const;
    }),
  );
  return Object.fromEntries(entradas);
}

/** Cadastro como pelo formulário: equipamento novo com a inspeção de entrada respondida. */
export async function cadastrarComInspecao(ator: Ator, entrada: EntradaCadastro) {
  return cadastrarEquipamento(ator, {
    condicaoEntrada: "NOVO",
    ...entrada,
    inspecoes: entrada.inspecoes ?? (await inspecoesDeEntrada(entrada.dados, (entrada.condicaoEntrada as "NOVO" | "USADO" | undefined) ?? "NOVO")),
  });
}

/** Verificação da entrega física: uma inspeção nova (tudo conforme) por equipamento. */
export async function verificacoesNovas(ativoIds: string[]): Promise<EntradaVerificacao[]> {
  const ativos = await prisma.ativo.findMany({ where: { id: { in: ativoIds } }, select: { id: true, categoriaId: true, parteKit: true } });
  return Promise.all(
    ativos.map(async (a) => ({
      ativoId: a.id,
      modo: "NOVA" as const,
      inspecao: respostasDe((await checklistVigente(prisma, a.categoriaId)).perguntas, { tipo: "PRE_ALOCACAO", parte: a.parteKit }),
    })),
  );
}

/** Confirma a última inspeção de cada equipamento. */
export async function verificacoesConfirmando(ativoIds: string[]): Promise<EntradaVerificacao[]> {
  return Promise.all(
    ativoIds.map(async (ativoId) => {
      const u = await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId, estado: "CONCLUIDA" }, orderBy: [{ concluidaEm: "desc" }, { numero: "desc" }], select: { id: true } });
      return { ativoId, modo: "CONFIRMAR" as const, inspecaoId: u.id };
    }),
  );
}

/** Verificações (inspeção nova) dos itens de uma reserva, para confirmar a entrega. */
export async function verificacoesDaReserva(alocacaoId: string) {
  const itens = await prisma.itemAlocacao.findMany({ where: { alocacaoId, aberto: true }, select: { ativoId: true } });
  return verificacoesNovas(itens.map((i) => i.ativoId));
}
