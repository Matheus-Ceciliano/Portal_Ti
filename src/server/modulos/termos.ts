import { obterArmazenamento } from "@/server/armazenamento";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { rotuloAtivo, UUID } from "./inventario-base";

/**
 * Termos para o portal do colaborador e a lista de TDV. O TER emitido pelo portal (geração,
 * envio, PDF assinado e conferência) fica em ./ter.ts; o termo só fica "assinado" depois da
 * conferência, com o PDF assinado guardado (restrição no banco), e não altera a alocação.
 */

/** PDF assinado para a rota autorizada: TI com escopo de grupo ou o próprio colaborador (termo disponibilizado). */
export async function lerPdfTermo(ator: Ator, termoId: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "termo.baixar");
    const t = UUID.test(termoId) ? await prisma.termo.findUnique({ where: { id: termoId } }) : null;
    if (!t?.arquivoAssinadoChave) return null;
    if (escopo !== "GRUPO" && (t.colaboradorId !== ator.colaboradorId || !t.disponivelAoColaborador)) throw new ErroAutorizacao("termo.baixar", "ESCOPO_PROPRIO");
    const dados = await obterArmazenamento().ler(t.arquivoAssinadoChave);
    return dados ? { dados, nome: `${t.numero}.pdf` } : null;
  });
}

/* Listas (páginas TER/TDV e portal do colaborador) */

const equipamentosDoTermo = {
  alocacao: { select: { numero: true, entregueEm: true, itens: { select: { ativo: { select: { nomeDispositivo: true, patrimonio: true, modelo: true } } } } } },
  devolucao: { select: { numero: true, recebidaEm: true, itens: { select: { itemAlocacao: { select: { ativo: { select: { nomeDispositivo: true, patrimonio: true, modelo: true } } } } } } } },
} as const;

export async function listarTermos(ator: Ator, tipo: "TER" | "TDV") {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "termo.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("termo.ver", "ESCOPO_PROPRIO");
    const termos = await prisma.termo.findMany({
      where: { tipo },
      orderBy: { criadoEm: "desc" },
      take: 200,
      include: { colaborador: { select: { id: true, nome: true } }, ...equipamentosDoTermo },
    });
    return termos.map((t) => ({
      id: t.id,
      numero: t.numero,
      tipo: t.tipo,
      estado: t.estado,
      colaborador: t.colaborador,
      emitidoEm: t.emitidoEm?.toISOString() ?? null,
      assinadoEm: t.assinadoRegistradoEm?.toISOString() ?? null,
      temPdf: Boolean(t.arquivoAssinadoChave),
      disponibilizado: t.disponivelAoColaborador,
      referencia: t.alocacao?.numero ?? t.devolucao?.numero ?? null,
      equipamentos: (t.alocacao?.itens.map((i) => i.ativo) ?? t.devolucao?.itens.map((i) => i.itemAlocacao.ativo) ?? []).map(rotuloAtivo),
    }));
  });
}

export type TermoLista = Awaited<ReturnType<typeof listarTermos>>[number];

/** Documentos do colaborador: só os próprios e disponibilizados pela TI. */
export async function listarMeusDocumentos(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "termo.ver");
    const termos = await prisma.termo.findMany({
      where: { colaboradorId: ator.colaboradorId, disponivelAoColaborador: true, estado: { not: "CANCELADO" } },
      orderBy: { criadoEm: "desc" },
      include: equipamentosDoTermo,
    });
    return termos.map((t) => ({
      id: t.id,
      numero: t.numero,
      tipo: t.tipo,
      estado: t.estado,
      emitidoEm: t.emitidoEm?.toISOString() ?? null,
      assinadoEm: t.assinadoRegistradoEm?.toISOString() ?? null,
      temPdf: Boolean(t.arquivoAssinadoChave),
      equipamentos: (t.alocacao?.itens.map((i) => i.ativo) ?? t.devolucao?.itens.map((i) => i.itemAlocacao.ativo) ?? []).map(rotuloAtivo),
    }));
  });
}
