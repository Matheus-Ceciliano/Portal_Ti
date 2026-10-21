"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  cancelarReserva,
  confirmarEntrega,
  criarAlocacao,
  obterAlocacao,
  opcoesNovaAlocacao,
  registrarDevolucao,
  type DetalheAlocacaoReal,
  type OpcoesNovaAlocacao,
} from "@/server/modulos/alocacoes";
import { resumoTerDaEntrega } from "@/lib/ter";
import type { FotoEnviada } from "@/server/modulos/inventario-base";
import { lerVerificacoes } from "./inspecao-formulario";

type Falha = { ok: false; erro: string };
export type ResultadoAlocacao = { ok: true; mensagem: string; id?: string } | Falha;

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

function atualizarTelas() {
  revalidatePath("/ti/alocacoes");
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/inventario/manutencoes");
  revalidatePath("/ti/documentos/ter");
}

export async function acaoOpcoesNovaAlocacao(): Promise<{ ok: true; dados: OpcoesNovaAlocacao } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await opcoesNovaAlocacao(ator) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaNova = z.object({
  colaboradorId: z.uuid("Selecione o colaborador."),
  ativoIds: z.array(z.uuid()).min(1, "Selecione ao menos um equipamento.").max(30),
  modo: z.enum(["ENTREGAR", "RESERVAR"]),
  responsavelTiContaId: z.string().min(1, "Selecione o responsável TI.").max(64),
  data: z.string().max(40).optional(),
  observacoes: z.string().max(1000).optional(),
  chaveRequisicao: z.uuid().optional(),
  /** Entrega física: verificação técnica de cada equipamento (as fotos vêm em `anexos`). */
  verificacoes: z.unknown().optional(),
});

export async function acaoCriarAlocacao(entrada: z.input<typeof esquemaNova>, anexos?: FormData): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaNova.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Revise os dados da alocação." };
  try {
    const verificacoes = await lerVerificacoes(dados.data.verificacoes, anexos);
    if (!verificacoes) return { ok: false, erro: "Revise a verificação técnica dos equipamentos." };
    const r = await criarAlocacao(ator, { ...dados.data, verificacoes });
    atualizarTelas();
    return {
      ok: true,
      id: r.id,
      mensagem: dados.data.modo === "ENTREGAR" ? `Entrega ${r.numero} registrada.${resumoTerDaEntrega(r.ter)}` : `Reserva ${r.numero} registrada.`,
    };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoDetalheAlocacao(id: string): Promise<{ ok: true; dados: DetalheAlocacaoReal } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterAlocacao(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Reserva → entrega física, com a verificação técnica de cada item (fotos das inspeções novas em `anexos`). */
export async function acaoConfirmarEntrega(alocacaoId: string, data?: string, verificacoes?: unknown, anexos?: FormData): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const lidas = await lerVerificacoes(verificacoes, anexos);
    if (!lidas) return { ok: false, erro: "Revise a verificação técnica dos equipamentos." };
    const r = await confirmarEntrega(ator, { alocacaoId, data, verificacoes: lidas });
    atualizarTelas();
    return { ok: true, mensagem: `Entrega ${r.numero} confirmada.${resumoTerDaEntrega(r.ter)}` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoCancelarReserva(alocacaoId: string, motivo: string): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await cancelarReserva(ator, { alocacaoId, motivo });
    atualizarTelas();
    return { ok: true, mensagem: `Reserva ${r.numero} cancelada.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaItensDevolucao = z
  .array(
    z.object({
      itemId: z.uuid(),
      estadoFisico: z.string().max(20),
      destino: z.string().max(20),
      observacoes: z.string().max(1000).optional(),
    }),
  )
  .min(1, "Selecione ao menos um equipamento devolvido.")
  .max(30);

/** Devolução total ou parcial (FormData: itens em JSON e fotos "foto_<itemId>"). */
export async function acaoRegistrarDevolucao(formData: FormData): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  let itens: z.infer<typeof esquemaItensDevolucao>;
  try {
    const lidos = esquemaItensDevolucao.safeParse(JSON.parse(String(formData.get("itens") ?? "[]")));
    if (!lidos.success) return { ok: false, erro: lidos.error.issues[0]?.message ?? "Revise os equipamentos devolvidos." };
    itens = lidos.data;
  } catch {
    return { ok: false, erro: "Revise os equipamentos devolvidos." };
  }
  try {
    const comFotos = await Promise.all(
      itens.map(async (i) => {
        const fotos: FotoEnviada[] = [];
        for (const arquivo of formData.getAll(`foto_${i.itemId}`)) {
          if (arquivo instanceof File && arquivo.size > 0) fotos.push({ tipo: "OUTRA", dados: Buffer.from(await arquivo.arrayBuffer()) });
        }
        return { ...i, fotos };
      }),
    );
    const chave = String(formData.get("chaveRequisicao") ?? "");
    const r = await registrarDevolucao(ator, {
      alocacaoId: String(formData.get("alocacaoId") ?? ""),
      recebidaEm: String(formData.get("recebidaEm") ?? "") || null,
      observacoes: String(formData.get("observacoes") ?? "") || null,
      itens: comFotos,
      chaveRequisicao: chave || undefined,
    });
    atualizarTelas();
    return { ok: true, id: r.id, mensagem: `Devolução ${r.numero} registrada.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

