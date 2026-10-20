"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MarcaOpcao, ModeloOpcao, PadraoMemoriaOpcao, ProcessadorOpcao, SistemaOpcao } from "@/lib/catalogos";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  alterarSituacaoCatalogo,
  criarMarca,
  criarModelo,
  criarPadraoMemoria,
  criarProcessador,
  criarSistema,
  editarMarca,
  editarModelo,
  editarPadraoMemoria,
  editarProcessador,
  editarSistema,
  modelosDaMarca,
  type ModelosDaMarca,
} from "@/server/modulos/catalogos";

type Resposta<T> = { ok: true; dados: T; mensagem?: string } | { ok: false; erro: string };

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const REVISE = "Revise os dados informados.";

function atualizarTelas() {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/inventario/catalogos");
}

/** Sessão, validação do formato e tradução do erro: o caso de uso confere permissão e regras. */
async function executar<E extends z.ZodType, T>(esquema: E, entrada: unknown, fn: (ator: NonNullable<Awaited<ReturnType<typeof obterSessao>>>["ator"], dados: z.output<E>) => Promise<T>, mensagem: (r: T) => string): Promise<Resposta<T>> {
  const ator = (await obterSessao())?.ator;
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: REVISE };
  try {
    const r = await fn(ator, dados.data);
    atualizarTelas();
    return { ok: true, dados: r, mensagem: mensagem(r) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const id = z.uuid();
const nome = z.string().max(200);
const ativa = z.boolean();

const esquemaMarca = z.object({ nome });
export async function acaoCriarMarca(entrada: z.input<typeof esquemaMarca>): Promise<Resposta<MarcaOpcao>> {
  return executar(esquemaMarca, entrada, criarMarca, (m) => `Marca ${m.nome} cadastrada.`);
}
const esquemaEdicaoMarca = esquemaMarca.extend({ id, ativa });
export async function acaoEditarMarca(entrada: z.input<typeof esquemaEdicaoMarca>): Promise<Resposta<MarcaOpcao>> {
  return executar(esquemaEdicaoMarca, entrada, editarMarca, (m) => `Marca ${m.nome} atualizada.`);
}

const esquemaModelo = z.object({ nome, marcaId: z.string().max(40), categoriaId: z.string().max(40) });
export async function acaoCriarModelo(entrada: z.input<typeof esquemaModelo>): Promise<Resposta<ModeloOpcao>> {
  return executar(esquemaModelo, entrada, criarModelo, (m) => `Modelo ${m.nome} cadastrado.`);
}
const esquemaEdicaoModelo = esquemaModelo.extend({ id, ativa });
export async function acaoEditarModelo(entrada: z.input<typeof esquemaEdicaoModelo>): Promise<Resposta<ModeloOpcao>> {
  return executar(esquemaEdicaoModelo, entrada, editarModelo, (m) => `Modelo ${m.nome} atualizado.`);
}

const opcional = z.string().max(200).nullable().optional();
const esquemaProcessador = z.object({ modelo: nome, fabricante: opcional, familia: opcional, codigo: z.string().max(10).nullable().optional() });
export async function acaoCriarProcessador(entrada: z.input<typeof esquemaProcessador>): Promise<Resposta<ProcessadorOpcao>> {
  return executar(esquemaProcessador, entrada, criarProcessador, (p) => `Processador ${p.modelo} cadastrado.`);
}
const esquemaEdicaoProcessador = esquemaProcessador.extend({ id, ativa, confirmacao: z.boolean().optional() });
export async function acaoEditarProcessador(entrada: z.input<typeof esquemaEdicaoProcessador>): Promise<Resposta<ProcessadorOpcao>> {
  return executar(esquemaEdicaoProcessador, entrada, editarProcessador, (p) => `Processador ${p.modelo} atualizado.`);
}

const esquemaSistema = z.object({ nome, versao: opcional, categoriaIds: z.array(z.string().max(40)).max(50).optional() });
export async function acaoCriarSistema(entrada: z.input<typeof esquemaSistema>): Promise<Resposta<SistemaOpcao>> {
  return executar(esquemaSistema, entrada, criarSistema, (s) => `Sistema ${s.rotulo} cadastrado.`);
}
const esquemaEdicaoSistema = esquemaSistema.extend({ id, ativa });
export async function acaoEditarSistema(entrada: z.input<typeof esquemaEdicaoSistema>): Promise<Resposta<SistemaOpcao>> {
  return executar(esquemaEdicaoSistema, entrada, editarSistema, (s) => `Sistema ${s.rotulo} atualizado.`);
}

const esquemaMemoria = z.object({ tipo: z.string().max(20), valor: z.string().max(40) });
export async function acaoCriarPadraoMemoria(entrada: z.input<typeof esquemaMemoria>): Promise<Resposta<PadraoMemoriaOpcao>> {
  return executar(esquemaMemoria, entrada, criarPadraoMemoria, (p) => `${p.valor} cadastrado.`);
}
const esquemaEdicaoMemoria = z.object({ id, valor: z.string().max(40), ativa });
export async function acaoEditarPadraoMemoria(entrada: z.input<typeof esquemaEdicaoMemoria>): Promise<Resposta<PadraoMemoriaOpcao>> {
  return executar(esquemaEdicaoMemoria, entrada, editarPadraoMemoria, (p) => `${p.valor} atualizado.`);
}

const esquemaSituacao = z.object({ item: z.enum(["marca", "modelo", "processador", "sistema", "memoria"]), id, ativa });
export async function acaoSituacaoCatalogo(entrada: z.input<typeof esquemaSituacao>): Promise<Resposta<{ descricao: string }>> {
  return executar(esquemaSituacao, entrada, alterarSituacaoCatalogo, (r) => `${r.descricao} ${entrada.ativa ? "voltou às opções de cadastro" : "saiu das opções de novos cadastros"}.`);
}

/** Leitura (sem revalidar telas): modelos da marca para o diálogo da aba Marcas. */
export async function acaoModelosDaMarca(marcaId: string): Promise<Resposta<ModelosDaMarca>> {
  const ator = (await obterSessao())?.ator;
  if (!ator) return { ok: false, erro: SESSAO };
  if (!z.uuid().safeParse(marcaId).success) return { ok: false, erro: "Marca não encontrada." };
  try {
    return { ok: true, dados: await modelosDaMarca(ator, marcaId) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
