"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { alugarEquipamento, encerrarAluguel } from "@/server/modulos/alugueis";
import type { Resultado } from "./transferencias";

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const DADOS = "Revise os dados do aluguel.";
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

/** O aluguel muda quem pode receber o equipamento: ficha, inventário e alocações. */
function atualizarTelas(ativoId: string) {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/alocacoes");
  revalidatePath(`/ti/inventario/${ativoId}`);
}

const esquemaAluguel = z.object({
  ativoId: z.uuid(),
  empresaLocatariaId: z.string().max(40),
  inicio: z.string().max(10),
  devolucaoPrevista: z.string().max(10).nullable().optional(),
  motivo: z.string().max(1000),
  observacoes: z.string().max(2000).nullable().optional(),
  confirmacao: z.boolean(),
  empresaAtualId: z.uuid(),
  chaveRequisicao: z.uuid().optional(),
});

export async function acaoAlugarEquipamento(entrada: z.input<typeof esquemaAluguel>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaAluguel.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  try {
    const r = await alugarEquipamento(ator, dados.data);
    atualizarTelas(dados.data.ativoId);
    return { ok: true, mensagem: `Aluguel para ${r.empresa} registrado a partir de ${dataBr(dados.data.inicio)}.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaEncerramento = z.object({ aluguelId: z.uuid(), motivo: z.string().max(1000), ativoId: z.uuid() });

export async function acaoEncerrarAluguel(entrada: z.input<typeof esquemaEncerramento>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaEncerramento.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Informe o motivo do encerramento." };
  try {
    const r = await encerrarAluguel(ator, dados.data);
    atualizarTelas(dados.data.ativoId);
    return { ok: true, mensagem: `Aluguel para ${r.empresa} encerrado.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
