"use server";

import { revalidatePath } from "next/cache";
import { ROTULO_RESULTADO, type Pergunta } from "@/lib/inspecao";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  checklistParaAvaliacao,
  checklistsDoCadastro,
  concluirAvaliacao,
  condicoesParaEntrega,
  obterInspecao,
  type CondicaoParaEntrega,
  type ResumoInspecao,
} from "@/server/modulos/inspecoes";
import { lerInspecao } from "./inspecao-formulario";

type Falha = { ok: false; erro: string };
const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

/** Condição de cada equipamento (última inspeção e questionário) para a revisão da entrega. */
export async function acaoCondicoesParaEntrega(ativoIds: string[]): Promise<{ ok: true; dados: CondicaoParaEntrega[] } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await condicoesParaEntrega(ator, Array.isArray(ativoIds) ? ativoIds.slice(0, 30) : []) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoInspecao(id: string): Promise<{ ok: true; dados: ResumoInspecao } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterInspecao(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Checklist vigente para a avaliação técnica do equipamento devolvido. */
export async function acaoChecklistParaAvaliacao(ativoId: string): Promise<{ ok: true; dados: { rotulo: string; categoria: string; herdado: boolean; perguntas: Pergunta[] } } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await checklistParaAvaliacao(ator, ativoId) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Checklists da inspeção de entrada (categoria e, no notebook, carregador C1). */
export async function acaoChecklistsDoCadastro(categoriaId: string): Promise<{ ok: true; dados: { principal: Pergunta[]; herdado: boolean; carregador: Pergunta[] | null } } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await checklistsDoCadastro(ator, categoriaId) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Inspeção do equipamento em avaliação e o encaminhamento (FormData: "inspecao" em JSON e fotos por pergunta). */
export async function acaoConcluirAvaliacao(formData: FormData): Promise<{ ok: true; mensagem: string } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const ativoId = String(formData.get("ativoId") ?? "");
  try {
    let dados: unknown;
    try {
      dados = JSON.parse(String(formData.get("inspecao") ?? ""));
    } catch {
      return { ok: false, erro: "Revise as respostas da inspeção." };
    }
    const inspecao = await lerInspecao(dados, formData, "avaliacao");
    if (!inspecao) return { ok: false, erro: "Revise as respostas da inspeção." };
    const r = await concluirAvaliacao(ator, { ativoId, inspecao, encaminhamento: String(formData.get("encaminhamento") ?? "") });
    revalidatePath("/ti/inventario");
    revalidatePath("/ti/inventario/manutencoes");
    revalidatePath("/ti/alocacoes");
    revalidatePath(`/ti/inventario/${ativoId}`);
    const destino = r.encaminhamento === "DISPONIVEL" ? "equipamento disponível" : r.encaminhamento === "MANUTENCAO" ? "enviado para manutenção" : "continua em avaliação";
    return { ok: true, mensagem: `Inspeção ${r.numero} registrada (${ROTULO_RESULTADO[r.resultado].toLowerCase()}): ${destino}.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
