"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PARTES_KIT } from "@/lib/identificacao";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { criarCategoria, editarCategoria, excluirCategoria, previaCadastro, type CategoriaCatalogo } from "@/server/modulos/categorias";

type Resposta<T> = { ok: true; dados: T; mensagem?: string } | { ok: false; erro: string };

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

function atualizarTelas() {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/inventario/catalogos");
}

const esquemaPrevia = z.object({
  categoriaId: z.string().max(40),
  processadorId: z.string().max(40).nullable().optional(),
  partes: z.array(z.enum(PARTES_KIT)).max(3).optional(),
});

/** Prévia do identificador: só informativa; o número definitivo é confirmado ao salvar. */
export async function acaoPreviaIdentificador(entrada: z.input<typeof esquemaPrevia>): Promise<Resposta<{ nome: string; partes: string[] } | null>> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaPrevia.safeParse(entrada);
  if (!dados.success) return { ok: true, dados: null };
  try {
    return { ok: true, dados: await previaCadastro(ator, dados.data) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaCategoria = z.object({ nome: z.string().max(120), prefixo: z.string().max(20), digitos: z.union([z.number(), z.string().max(3)]), ativa: z.boolean().optional() });

export async function acaoCriarCategoria(entrada: z.input<typeof esquemaCategoria>): Promise<Resposta<CategoriaCatalogo>> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaCategoria.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Revise os dados da categoria." };
  try {
    const c = await criarCategoria(ator, dados.data);
    atualizarTelas();
    return { ok: true, dados: c, mensagem: `Categoria ${c.nome} criada.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaEdicao = z.object({
  id: z.uuid(),
  nome: z.string().max(120),
  prefixo: z.string().max(20).nullable().optional(),
  digitos: z.union([z.number(), z.string().max(3)]).optional(),
  ativa: z.boolean(),
  confirmacao: z.boolean().optional(),
});

export async function acaoEditarCategoria(entrada: z.input<typeof esquemaEdicao>): Promise<Resposta<CategoriaCatalogo>> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaEdicao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Revise os dados da categoria." };
  try {
    const c = await editarCategoria(ator, dados.data);
    atualizarTelas();
    return { ok: true, dados: c, mensagem: `Categoria ${c.nome} atualizada.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoExcluirCategoria(id: string): Promise<Resposta<null>> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await excluirCategoria(ator, { id });
    atualizarTelas();
    return { ok: true, dados: null, mensagem: `Categoria ${r.nome} excluída.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
