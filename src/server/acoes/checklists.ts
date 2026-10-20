"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { alterarSituacaoPergunta, moverPergunta, salvarPergunta } from "@/server/modulos/checklists";

type Resultado = { ok: true; mensagem: string; id?: string } | { ok: false; erro: string };
const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

const esquemaPergunta = z.object({
  id: z.uuid().optional(),
  categoriaId: z.string().max(64),
  grupo: z.string().max(200),
  texto: z.string().max(400),
  comoTestar: z.string().max(1600),
  resultadoEsperado: z.string().max(1200),
  sinaisProblema: z.string().max(1200),
  obrigatoria: z.boolean(),
  bloqueante: z.boolean(),
  aplicacao: z.string().max(40),
  partes: z.array(z.string().max(20)).max(3).optional(),
  ordem: z.number().int().nullable().optional(),
  ativa: z.boolean(),
});

/** Cria ou edita uma pergunta do checklist (o conteúdo alterado vira nova versão). */
export async function acaoSalvarPergunta(entrada: z.input<typeof esquemaPergunta>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaPergunta.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Revise os dados da pergunta." };
  try {
    const r = await salvarPergunta(ator, dados.data);
    revalidatePath("/ti/inventario/catalogos");
    return { ok: true, id: r.id, mensagem: r.mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoMoverPergunta(id: string, direcao: "acima" | "abaixo"): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await moverPergunta(ator, { id, direcao });
    revalidatePath("/ti/inventario/catalogos");
    return { ok: true, mensagem: r.mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoSituacaoPergunta(id: string, ativa: boolean): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await alterarSituacaoPergunta(ator, { id, ativa: ativa === true });
    revalidatePath("/ti/inventario/catalogos");
    return { ok: true, mensagem: r.mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
