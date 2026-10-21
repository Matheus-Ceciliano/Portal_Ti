import type { EstadoAssinaturaTer, EstadoDocumentoTer, Prisma } from "@/generated/prisma/client";
import { ROTULO_RESULTADO, type Resultado } from "@/lib/inspecao";
import { colaboradorPodeEnviar, situacaoParaColaborador } from "@/lib/ter";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import type { InstantaneoEntrega } from "./inspecoes";
import { UUID } from "./inventario-base";
import { descricaoEquipamento, ordenarItens, receberArquivoAssinado, ROTULO_EVENTO, type ItemEvento } from "./ter";

/**
 * TER no Portal do Colaborador: só os termos do colaborador da sessão (o id que o navegador
 * envia nunca decide a titularidade). Ele consulta, baixa o PDF emitido, envia o PDF assinado
 * pelo GOV.BR e acompanha a conferência. Emissão, cancelamento, substituição e conferência
 * continuam com a TI. Aparecem os termos já emitidos ao menos uma vez (o PDF existe).
 */

const ONDE_MEUS = (ator: Ator): Prisma.TermoWhereInput => ({ colaboradorId: ator.colaboradorId, tipo: "TER", eventoEntregaId: { not: null }, versaoVigente: { not: null } });

/** Pendentes de ação do colaborador (indicador no menu e no início do portal). */
export async function contarMeusTersPendentes(ator: Ator) {
  return prisma.termo.count({ where: { ...ONDE_MEUS(ator), estadoDocumento: "EMITIDO", estadoAssinatura: { in: ["AGUARDANDO_ENVIO", "AGUARDANDO_ASSINATURA", "ASSINATURA_RECUSADA"] } } });
}

const MENSAGEM_RECUSA = "O arquivo enviado não pôde ser validado. Verifique se o PDF contém a assinatura eletrônica do documento completo e envie novamente.";

export async function listarMeusTers(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "termo.ver");
    const termos = await prisma.termo.findMany({
      where: ONDE_MEUS(ator),
      orderBy: [{ criadoEm: "desc" }],
      take: 100,
      include: {
        eventoEntrega: { select: { entregueEm: true, itens: true } },
        versoes: { orderBy: { versao: "desc" }, select: { versao: true, estado: true, emitidaEm: true } },
      },
    });
    return termos.map((t) => {
      const situacao = situacaoParaColaborador({ estadoDocumento: t.estadoDocumento as EstadoDocumentoTer, estadoAssinatura: t.estadoAssinatura as EstadoAssinaturaTer });
      const vigente = t.versoes.find((v) => v.versao === t.versaoVigente);
      return {
        id: t.id,
        numero: t.numero,
        versao: t.versaoVigente!,
        entregueEm: t.eventoEntrega!.entregueEm.toISOString(),
        emitidoEm: vigente?.emitidaEm?.toISOString() ?? t.emitidoEm?.toISOString() ?? null,
        equipamentos: ordenarItens(t.eventoEntrega!.itens as unknown as ItemEvento[]).map((i) => i.nomeDispositivo ?? i.identificador),
        situacao,
        /** Cancelado: só consulta. */
        historico: situacao === "CANCELADO",
        podeEnviar: colaboradorPodeEnviar({ estadoDocumento: t.estadoDocumento as EstadoDocumentoTer, estadoAssinatura: t.estadoAssinatura as EstadoAssinaturaTer }),
        /** Versões anteriores substituídas (consulta). */
        versoesAnteriores: t.versoes.filter((v) => v.estado === "SUBSTITUIDO").length,
      };
    });
  });
}

export type MeuTer = Awaited<ReturnType<typeof listarMeusTers>>[number];

type Evento = { em: string; titulo: string; detalhe: string | null; tom: "info" | "sucesso" | "erro" | "atencao" | "neutro" };

/** Detalhe do próprio TER: documento, equipamentos, situação e linha do tempo simplificada. */
export async function obterMeuTer(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "termo.ver");
    if (!UUID.test(id)) throw new ErroNegocio("TER não encontrado.");
    const t = await prisma.termo.findUnique({
      where: { id },
      include: {
        eventoEntrega: { include: { verificacoes: { select: { itemAlocacaoId: true, instantaneo: true } } } },
        empresa: { select: { nome: true } },
        versoes: { orderBy: { versao: "desc" }, select: { versao: true, estado: true, emitidaEm: true, nomeArquivo: true, arquivoChave: true } },
        arquivosAssinados: { orderBy: { recebidoEm: "asc" }, select: { id: true, versao: true, nomeOriginal: true, recebidoEm: true, origem: true, chave: true } },
        conferencias: { orderBy: { conferidaEm: "asc" }, select: { resultado: true, motivo: true, conferidaEm: true, arquivoId: true } },
        historico: { where: { acao: { in: ["EMITIDO", "ENVIO", "REENVIO", "PDF_BAIXADO", "CANCELAMENTO", "SUBSTITUICAO"] } }, orderBy: [{ em: "asc" }, { id: "asc" }] },
      },
    });
    if (!t || t.tipo !== "TER" || !t.eventoEntrega || !t.versaoVigente) throw new ErroNegocio("TER não encontrado.");
    // Titularidade pela sessão; tentativa sobre o TER de outra pessoa é negada e auditada.
    if (t.colaboradorId !== ator.colaboradorId) throw new ErroAutorizacao("termo.ver", "TITULARIDADE");

    const estados = { estadoDocumento: t.estadoDocumento as EstadoDocumentoTer, estadoAssinatura: t.estadoAssinatura as EstadoAssinaturaTer };
    const situacao = situacaoParaColaborador(estados);
    const vigente = t.versoes.find((v) => v.versao === t.versaoVigente)!;
    const instantaneos = new Map(t.eventoEntrega.verificacoes.map((v) => [v.itemAlocacaoId, v.instantaneo as unknown as InstantaneoEntrega]));
    const itens = ordenarItens(t.eventoEntrega.itens as unknown as ItemEvento[]);
    const ultimaConferencia = t.conferencias[t.conferencias.length - 1];
    const conferido = t.conferencias.find((c) => c.resultado === "CONFORME" && t.arquivosAssinados.find((a) => a.id === c.arquivoId)?.chave === t.arquivoAssinadoChave);

    const eventos: Evento[] = [
      { em: t.eventoEntrega.entregueEm.toISOString(), titulo: "Equipamentos entregues", detalhe: ROTULO_EVENTO[t.eventoEntrega.tipo], tom: "neutro" } satisfies Evento,
      ...t.historico.flatMap((h): Evento[] => {
        const em = h.em.toISOString();
        if (h.acao === "EMITIDO") return [{ em, titulo: h.versao && h.versao > 1 ? `Nova versão disponibilizada (versão ${h.versao})` : "TER disponibilizado", detalhe: null, tom: "info" }];
        if (h.acao === "ENVIO" || h.acao === "REENVIO") return [{ em, titulo: "TER encaminhado para sua assinatura", detalhe: null, tom: "info" }];
        if (h.acao === "PDF_BAIXADO") return h.responsavelContaId === ator.contaId ? [{ em, titulo: "PDF baixado", detalhe: null, tom: "neutro" }] : [];
        if (h.acao === "CANCELAMENTO") return [{ em, titulo: "TER cancelado pela TI", detalhe: "Mantido apenas para consulta.", tom: "neutro" }];
        return [{ em, titulo: `Versão ${h.versao} substituída por uma nova versão`, detalhe: "A versão anterior fica disponível só para consulta.", tom: "neutro" }];
      }),
      ...t.arquivosAssinados.map((a, i): Evento => ({
        em: a.recebidoEm.toISOString(),
        titulo: i === 0 ? "Documento assinado enviado" : "Novo documento assinado enviado",
        detalhe: a.origem === "PORTAL_COLABORADOR" ? `Enviado por você pelo portal (versão ${a.versao}).` : `Recebido pela TI (versão ${a.versao}).`,
        tom: "info",
      })),
      ...t.conferencias.map((c): Evento => ({
        em: c.conferidaEm.toISOString(),
        titulo: c.resultado === "CONFORME" ? "Assinatura conferida" : c.resultado === "NAO_CONFORME" ? "Assinatura recusada" : "Assinatura em análise pela TI",
        detalhe: c.resultado === "NAO_CONFORME" ? (c.motivo ? `Motivo informado pela TI: ${c.motivo}` : MENSAGEM_RECUSA) : null,
        tom: c.resultado === "CONFORME" ? "sucesso" : c.resultado === "NAO_CONFORME" ? "erro" : "atencao",
      })),
    ].sort((a, b) => a.em.localeCompare(b.em));
    if (situacao === "AGUARDANDO_CONFERENCIA") eventos.push({ em: eventos[eventos.length - 1].em, titulo: "Aguardando conferência da TI", detalhe: "A situação muda quando a TI conferir a assinatura.", tom: "atencao" });

    return {
      id: t.id,
      numero: t.numero,
      versao: t.versaoVigente,
      colaborador: ator.nome,
      empresa: t.empresa?.nome ?? null,
      entregueEm: t.eventoEntrega.entregueEm.toISOString(),
      emitidoEm: vigente.emitidaEm?.toISOString() ?? null,
      nomeArquivo: vigente.nomeArquivo,
      situacao,
      podeEnviar: colaboradorPodeEnviar(estados),
      /** Recusa vigente: a justificativa da TI (nunca as observações internas). */
      recusa: situacao === "ASSINATURA_RECUSADA" ? { mensagem: MENSAGEM_RECUSA, motivo: ultimaConferencia?.motivo ?? null } : null,
      pdf: vigente.arquivoChave ? `/api/termos/${t.id}/pdf?arquivo=emitido&versao=${vigente.versao}` : null,
      /** PDF assinado já conferido (a versão assinada do próprio colaborador). */
      pdfAssinado: conferido ? `/api/termos/${t.id}/pdf?arquivo=assinado&id=${conferido.arquivoId}` : null,
      versoesAnteriores: t.versoes
        .filter((v) => v.versao !== t.versaoVigente && v.arquivoChave)
        .map((v) => ({ versao: v.versao, estado: v.estado, emitidaEm: v.emitidaEm?.toISOString() ?? null, pdf: `/api/termos/${t.id}/pdf?arquivo=emitido&versao=${v.versao}` })),
      equipamentos: itens.map((i) => {
        const snap = instantaneos.get(i.itemAlocacaoId);
        return {
          identificador: i.nomeDispositivo ?? i.identificador,
          patrimonio: i.patrimonio,
          categoria: i.categoria,
          descricao: descricaoEquipamento(i),
          numeroSerie: i.numeroSerie,
          condicao: snap ? (ROTULO_RESULTADO[snap.inspecao.resultado as Resultado] ?? snap.inspecao.resultado) : null,
        };
      }),
      eventos,
    };
  });
}

export type DetalheMeuTer = Awaited<ReturnType<typeof obterMeuTer>>;

/**
 * PDF assinado enviado pelo colaborador no portal: o mesmo recebimento da aba TER (arquivo
 * guardado como chegou, registro novo a cada envio), com a origem registrada. Não torna o TER
 * assinado: a TI ainda confere.
 */
export async function enviarMeuTerAssinado(ator: Ator, e: { termoId: string; versao: number; pdf: Buffer; nomeOriginal: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.anexar_assinado");
    return receberArquivoAssinado(ator, origem, e, "PORTAL_COLABORADOR");
  });
}
