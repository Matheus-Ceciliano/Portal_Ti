import type { Prisma } from "@/generated/prisma/client";
import { PODE_IR_PARA_MANUTENCAO, ROTULO_SITUACAO, type Categoria, type Situacao } from "@/lib/inventario";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import {
  cancelarTransferenciaPendente,
  dadosFoto,
  descartarFotos,
  encerrarAlocacaoSemItens,
  encerrarItem,
  gravarArquivosFotos,
  lerMomento,
  mudarSituacao,
  prepararFotos,
  rotuloAtivo,
  traduzirConflito,
  travarAtivos,
  urlFoto,
  UUID,
  type FotoEnviada,
} from "./inventario-base";

/**
 * Manutenção de equipamentos. Equipamento entregue só sai do colaborador com a confirmação
 * explícita do recolhimento físico; abrir o formulário não muda nada. O TER já assinado
 * não é alterado.
 */

const texto = (v: string | null | undefined, max: number, rotulo: string, obrigatorio: boolean) => {
  const t = (v ?? "").normalize("NFC").trim();
  if (!t && obrigatorio) throw new ErroNegocio(`Informe ${rotulo}.`);
  if (t.length > max) throw new ErroNegocio(`${rotulo[0].toUpperCase()}${rotulo.slice(1)}: use no máximo ${max} caracteres.`);
  return t || null;
};

export async function enviarParaManutencao(
  ator: Ator,
  entrada: { ativoId: string; motivo: string; observacoes: string; confirmarRecolhimento?: boolean; recolhidoEm?: string | null; fotos?: FotoEnviada[] },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.transicionar");
    if (entrada.fotos?.some((f) => f.dados.length)) exigirPermissao(ator, "evidencia.enviar");
    if (!UUID.test(entrada.ativoId)) throw new ErroNegocio("Equipamento não encontrado.");
    const motivo = texto(entrada.motivo, 200, "o motivo da manutenção", true)!;
    const observacoes = texto(entrada.observacoes, 1000, "as observações", true)!;
    const recolhidoEm = lerMomento(entrada.recolhidoEm, "Data do recolhimento");
    const fotos = prepararFotos(entrada.fotos ?? []);
    await gravarArquivosFotos(fotos);

    try {
      return await prisma.$transaction(async (tx) => {
        await travarAtivos(tx, [entrada.ativoId]);
        const a = await tx.ativo.findUnique({
          where: { id: entrada.ativoId },
          include: { itensAlocacao: { where: { aberto: true }, include: { alocacao: { include: { colaborador: { select: { id: true, nome: true } } } } } } },
        });
        if (!a) throw new ErroNegocio("Equipamento não encontrado.");
        const rotulo = rotuloAtivo(a);
        if (a.situacao === "MANUTENCAO") throw new ErroNegocio(`${rotulo} já está em manutenção.`);
        if (a.situacao === "RESERVADO") throw new ErroNegocio(`${rotulo} está reservado: cancele a reserva antes de enviar para manutenção.`);
        if (a.situacao === "INSTALADO") throw new ErroNegocio(`${rotulo} está instalado em um notebook: remova-o pelos componentes internos do notebook.`);
        if (!PODE_IR_PARA_MANUTENCAO.includes(a.situacao as Situacao)) {
          throw new ErroNegocio(`${rotulo} não pode ir para manutenção (${ROTULO_SITUACAO[a.situacao as Situacao].toLowerCase()}).`);
        }
        const item = a.itensAlocacao.find((i) => i.alocacao.estado === "ATIVA") ?? null;
        if (item && entrada.confirmarRecolhimento !== true) {
          throw new ErroNegocio(`Confirme o recolhimento físico com ${item.alocacao.colaborador.nome} antes de registrar a manutenção.`);
        }

        const manutencao = await tx.manutencao.create({
          data: {
            ativoId: a.id,
            motivo,
            observacoes,
            abertaPorNome: ator.nome,
            recolhidoDeId: item?.alocacao.colaborador.id,
            recolhidoDeNome: item?.alocacao.colaborador.nome,
            recolhimentoConfirmadoEm: item ? recolhidoEm : null,
          },
        });
        if (item) {
          // A alocação termina só para este equipamento; o histórico e o TER permanecem.
          await encerrarItem(tx, ator, item.id, "MANUTENCAO", recolhidoEm, { manutencaoId: manutencao.id });
          await encerrarAlocacaoSemItens(tx, item.alocacaoId);
          await cancelarTransferenciaPendente(tx, ator, a.id, "equipamento recolhido para manutenção.", recolhidoEm);
        }
        await mudarSituacao(tx, ator, { id: a.id, situacao: a.situacao as Situacao, rotulo }, "MANUTENCAO", {
          tipo: "ENVIO_MANUTENCAO",
          colaborador: item?.alocacao.colaborador,
          alocacaoId: item?.alocacaoId,
          manutencaoId: manutencao.id,
          observacao: item ? `${motivo} Recolhido de ${item.alocacao.colaborador.nome} (${item.alocacao.numero}).` : motivo,
        });
        if (fotos.length) {
          await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, a.id, ator), contexto: "MANUTENCAO" as const, manutencaoId: manutencao.id })) });
        }
        await registrarAuditoria(tx, {
          acao: "ativo.manutencao_enviar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: a.id, descricao: rotulo },
          origemPermissao: origem,
          detalhe: { alocacaoEncerrada: item?.alocacao.numero ?? null, recolhimentoConfirmado: Boolean(item), fotos: fotos.length },
        });
        return { id: manutencao.id, alocacaoEncerrada: item?.alocacao.numero ?? null };
      });
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      throw traduzirConflito(erro);
    }
  });
}

/** Conclusão: reparado volta a ficar disponível; sem reparo é baixado. Nenhuma alocação é criada. */
export async function concluirManutencao(
  ator: Ator,
  entrada: { manutencaoId: string; resultado: string; servicoRealizado: string; fotos?: FotoEnviada[] },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "ativo.transicionar");
    if (entrada.resultado !== "REPARADO" && entrada.resultado !== "SEM_REPARO") throw new ErroNegocio("Informe o resultado da manutenção.");
    if (entrada.resultado === "SEM_REPARO") exigirPermissao(ator, "ativo.baixar");
    if (entrada.fotos?.some((f) => f.dados.length)) exigirPermissao(ator, "evidencia.enviar");
    if (!UUID.test(entrada.manutencaoId)) throw new ErroNegocio("Manutenção não encontrada.");
    const servicoRealizado = texto(entrada.servicoRealizado, 1000, "o serviço realizado", true)!;
    const fotos = prepararFotos(entrada.fotos ?? []);
    await gravarArquivosFotos(fotos);

    try {
      return await prisma.$transaction(async (tx) => {
        const previa = await tx.manutencao.findUnique({ where: { id: entrada.manutencaoId }, select: { ativoId: true } });
        if (!previa) throw new ErroNegocio("Manutenção não encontrada.");
        await travarAtivos(tx, [previa.ativoId]);
        const m = await tx.manutencao.findUniqueOrThrow({ where: { id: entrada.manutencaoId }, include: { ativo: true } });
        if (m.aberta !== true) throw new ErroNegocio("Esta manutenção já foi concluída.");
        const rotulo = rotuloAtivo(m.ativo);
        const resultado = entrada.resultado as "REPARADO" | "SEM_REPARO";
        const agora = new Date();
        await tx.manutencao.update({
          where: { id: m.id },
          data: { aberta: null, concluidaEm: agora, concluidaPorNome: ator.nome, servicoRealizado, resultado },
        });
        await mudarSituacao(tx, ator, { id: m.ativo.id, situacao: m.ativo.situacao as Situacao, rotulo }, resultado === "REPARADO" ? "DISPONIVEL" : "BAIXADO", {
          tipo: "CONCLUSAO_MANUTENCAO",
          manutencaoId: m.id,
          observacao: `${resultado === "REPARADO" ? "Reparado" : "Sem reparo"}: ${servicoRealizado}`,
          quando: agora,
        });
        if (fotos.length) {
          await tx.fotoAtivo.createMany({ data: fotos.map((f) => ({ ...dadosFoto(f, m.ativo.id, ator), contexto: "CONCLUSAO_MANUTENCAO" as const, manutencaoId: m.id })) });
        }
        await registrarAuditoria(tx, {
          acao: "ativo.manutencao_concluir",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "ativo", id: m.ativo.id, descricao: rotulo },
          origemPermissao: origem,
          detalhe: { resultado, fotos: fotos.length },
        });
        return { resultado };
      });
    } catch (erro) {
      await descartarFotos(fotos.map((f) => f.chave));
      throw traduzirConflito(erro);
    }
  });
}

/* Página de manutenções */

export type FiltroManutencoes = {
  busca?: string;
  empresaId?: string;
  categoria?: Categoria;
  marca?: string;
  periodo?: "30" | "90" | "365";
  situacao?: "ABERTA" | "CONCLUIDA";
  pagina?: number;
  porPagina?: number;
};

export async function listarManutencoes(ator: Ator, f: FiltroManutencoes = {}, agora = new Date()) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "ativo.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("ativo.ver", "ESCOPO_PROPRIO");
    const busca = f.busca?.trim().slice(0, 80);
    const contem = { contains: busca, mode: "insensitive" as const };
    const limite = f.periodo ? new Date(agora.getTime() - Number(f.periodo) * 86_400_000) : null;
    const situacao = f.situacao ?? "ABERTA";
    const where: Prisma.ManutencaoWhereInput = {
      AND: [
        situacao === "ABERTA" ? { aberta: true } : { aberta: null },
        f.empresaId && UUID.test(f.empresaId) ? { ativo: { empresaId: f.empresaId } } : {},
        f.categoria ? { ativo: { categoria: f.categoria } } : {},
        f.marca ? { ativo: { marca: { equals: f.marca, mode: "insensitive" } } } : {},
        limite ? { abertaEm: { gte: limite } } : {},
        busca
          ? {
              OR: [
                { motivo: contem },
                { ativo: { OR: [{ nomeDispositivo: contem }, { patrimonio: contem }, { modelo: contem }, { numeroSerie: contem }, { marca: contem }] } },
              ],
            }
          : {},
      ],
    };
    const porPagina = f.porPagina ?? 12;
    const [total, abertas, concluidas30] = await Promise.all([
      prisma.manutencao.count({ where }),
      prisma.manutencao.count({ where: { aberta: true } }),
      prisma.manutencao.count({ where: { aberta: null, concluidaEm: { gte: new Date(agora.getTime() - 30 * 86_400_000) } } }),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const linhas = await prisma.manutencao.findMany({
      where,
      orderBy: situacao === "ABERTA" ? { abertaEm: "asc" } : { concluidaEm: "desc" },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: {
        ativo: {
          select: {
            id: true,
            categoria: true,
            nomeDispositivo: true,
            patrimonio: true,
            marca: true,
            modelo: true,
            empresa: { select: { id: true, nome: true, sigla: true } },
            fotos: { where: { contexto: "CADASTRO" }, orderBy: [{ tipo: "asc" }], take: 1, select: { id: true } },
          },
        },
      },
    });
    return {
      linhas: linhas.map((m) => ({
        id: m.id,
        aberta: m.aberta === true,
        motivo: m.motivo,
        observacoes: m.observacoes,
        abertaEm: m.abertaEm.toISOString(),
        abertaPorNome: m.abertaPorNome,
        recolhidoDeNome: m.recolhidoDeNome,
        concluidaEm: m.concluidaEm?.toISOString() ?? null,
        concluidaPorNome: m.concluidaPorNome,
        servicoRealizado: m.servicoRealizado,
        resultado: m.resultado,
        dias: Math.max(0, Math.floor(((m.concluidaEm ?? agora).getTime() - m.abertaEm.getTime()) / 86_400_000)),
        ativo: {
          id: m.ativo.id,
          categoria: m.ativo.categoria,
          nome: m.ativo.nomeDispositivo,
          patrimonio: m.ativo.patrimonio,
          rotulo: rotuloAtivo(m.ativo),
          marca: m.ativo.marca,
          modelo: m.ativo.modelo,
          empresa: m.ativo.empresa,
          miniatura: m.ativo.fotos[0] ? urlFoto(m.ativo.fotos[0].id) : null,
        },
      })),
      total,
      pagina,
      paginas,
      indicadores: { abertas, concluidas30 },
    };
  });
}

export type ResultadoManutencoes = Awaited<ReturnType<typeof listarManutencoes>>;
