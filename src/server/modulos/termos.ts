import { novaChavePdf, obterArmazenamento, validarPdf } from "@/server/armazenamento";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { proximoNumero, rotuloAtivo, sha256, UUID } from "./inventario-base";

/**
 * TER e TDV (banco do portal). Nesta etapa o portal não emite o PDF nem integra assinatura:
 * só registra o PDF assinado recebido de fora, vinculado à alocação. O termo nunca fica
 * "assinado" sem o PDF guardado (restrição no banco) e não altera a alocação.
 */

/** Registra o TER assinado (PDF) de uma entrega já feita. */
export async function registrarTerAssinado(ator: Ator, entrada: { alocacaoId: string; pdf: Buffer }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.anexar_assinado");
    if (!UUID.test(entrada.alocacaoId)) throw new ErroNegocio("Alocação não encontrada.");
    validarPdf(entrada.pdf);
    const chave = novaChavePdf("termos");
    const resumo = sha256(entrada.pdf);
    await obterArmazenamento().salvar(chave, entrada.pdf);
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "alocacao" WHERE id = ${entrada.alocacaoId} FOR UPDATE`;
        const a = await tx.alocacao.findUnique({
          where: { id: entrada.alocacaoId },
          include: { termos: { where: { tipo: "TER", estado: { not: "CANCELADO" } }, orderBy: { criadoEm: "desc" } } },
        });
        if (!a) throw new ErroNegocio("Alocação não encontrada.");
        if (a.estado === "RESERVADA" || a.estado === "CANCELADA") throw new ErroNegocio("O TER assinado é registrado depois da entrega física.");
        if (a.termos.some((t) => t.estado === "ASSINADO")) throw new ErroNegocio("Esta alocação já tem TER assinado registrado.");
        const agora = new Date();
        const assinado = { estado: "ASSINADO" as const, arquivoAssinadoChave: chave, sha256Assinado: resumo, assinadoRegistradoEm: agora, assinadoRegistradoPorNome: ator.nome };
        const existente = a.termos[0];
        const termo = existente
          ? await tx.termo.update({ where: { id: existente.id }, data: assinado })
          : await tx.termo.create({
              data: { numero: await proximoNumero(tx, "TER", agora), tipo: "TER", alocacaoId: a.id, colaboradorId: a.colaboradorId, ...assinado },
            });
        await registrarAuditoria(tx, {
          acao: "termo.anexar_assinado",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "termo", id: termo.id, descricao: `${termo.numero} (${a.numero})` },
          origemPermissao: origem,
          detalhe: { alocacao: a.numero, sha256: resumo, tamanho: entrada.pdf.length },
        });
        return { numero: termo.numero };
      });
    } catch (erro) {
      await obterArmazenamento().remover(chave).catch(() => undefined);
      throw erro;
    }
  });
}

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
