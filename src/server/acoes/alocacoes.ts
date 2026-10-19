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
import type { FotoEnviada } from "@/server/modulos/inventario-base";
import { registrarTerAssinado } from "@/server/modulos/termos";

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
  data: z.string().max(40).optional(),
  observacoes: z.string().max(1000).optional(),
  chaveRequisicao: z.uuid().optional(),
});

export async function acaoCriarAlocacao(entrada: z.input<typeof esquemaNova>): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaNova.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Revise os dados da alocação." };
  try {
    const r = await criarAlocacao(ator, dados.data);
    atualizarTelas();
    return {
      ok: true,
      id: r.id,
      mensagem: dados.data.modo === "ENTREGAR" ? `Entrega ${r.numero} registrada.` : `Reserva ${r.numero} registrada.`,
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

export async function acaoConfirmarEntrega(alocacaoId: string, data?: string): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await confirmarEntrega(ator, { alocacaoId, data });
    atualizarTelas();
    return { ok: true, mensagem: `Entrega ${r.numero} confirmada.` };
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

/** PDF do TER assinado recebido de fora (GOV.BR): o portal só guarda e vincula. */
export async function acaoRegistrarTerAssinado(formData: FormData): Promise<ResultadoAlocacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const arquivo = formData.get("pdf");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Selecione o PDF do termo assinado." };
  try {
    const r = await registrarTerAssinado(ator, { alocacaoId: String(formData.get("alocacaoId") ?? ""), pdf: Buffer.from(await arquivo.arrayBuffer()) });
    atualizarTelas();
    return { ok: true, mensagem: `${r.numero}: PDF assinado registrado.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
