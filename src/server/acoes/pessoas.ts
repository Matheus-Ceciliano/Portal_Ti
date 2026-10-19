"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { salvarGrupoLicenca } from "@/server/modulos/grupos-licenca";
import {
  cadastrarPessoa,
  editarPessoa,
  ErroIdentificadores,
  obterDetalhePessoa,
  SITUACOES_EDITAVEIS,
  verificarIdentificadores,
  type CampoIdentificador,
  type Conflito,
  type DetalhePessoa,
} from "@/server/modulos/pessoas";

export type ResultadoVerificacao =
  | { ok: true; conflitos: Conflito[]; sobrenomes: { valor: string; emUso: boolean }[] }
  | { ok: false; erro: string };

export type EstadoPessoa = {
  ok?: boolean;
  mensagem?: string;
  erro?: string;
  erros?: Record<string, string | undefined>;
  conflitos?: Conflito[];
  colaboradorId?: string;
};

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const CAMPOS: CampoIdentificador[] = ["nomeServidorPc", "loginUau", "loginMicrosoft", "emailCorporativo"];

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
const lista = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").filter((c): c is CampoIdentificador => CAMPOS.includes(c as CampoIdentificador)) : []));

const esquema = z.object({
  id: z.uuid().optional(),
  nome: texto(120).min(3, "Informe o nome completo."),
  segundoNome: texto(60).optional(),
  sobrenomeUtilizado: texto(60).optional(),
  empresaId: z.uuid("Selecione a empresa."),
  cargo: texto(80).optional().default(""),
  departamento: texto(80).optional().default(""),
  situacao: z.enum(SITUACOES_EDITAVEIS, "Selecione a situação.").optional(),
  grupoLicencaId: z.uuid().optional(),
  /** Só sem grupo de licença; os demais identificadores são sempre calculados no servidor. */
  emailCorporativo: texto(254).optional(),
  aplicar: lista,
  criarContaMicrosoft: z.boolean(),
  removerFoto: z.boolean(),
});

/** Erro do servidor no campo certo do formulário. */
function campoDoErro(mensagem: string): string | null {
  if (/senha/i.test(mensagem)) return "senhaInicial";
  if (/segundo nome/i.test(mensagem)) return "segundoNome";
  if (/sobrenome/i.test(mensagem)) return "sobrenomeUtilizado";
  if (/empresa/i.test(mensagem)) return "empresaId";
  if (/grupo de licença/i.test(mensagem)) return "grupoLicencaId";
  if (/Login UAU/.test(mensagem)) return "loginUau";
  if (/Login Microsoft/.test(mensagem)) return "loginMicrosoft";
  if (/e-mail/i.test(mensagem)) return "emailCorporativo";
  if (/servidor\/PC/.test(mensagem)) return "nomeServidorPc";
  if (/foto|imagem|logotipo|armazenamento|PNG/i.test(mensagem)) return "foto";
  return null;
}

/** Cadastro (sem id) ou edição (com id). Regras, permissões e unicidade são do servidor. */
export async function acaoSalvarPessoa(_a: EstadoPessoa, formData: FormData): Promise<EstadoPessoa> {
  const ator = await atorAtual();
  if (!ator) return { erro: SESSAO };
  const valor = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const dados = esquema.safeParse({
    id: valor("id"),
    nome: formData.get("nome") ?? "",
    segundoNome: valor("segundoNome"),
    sobrenomeUtilizado: valor("sobrenomeUtilizado"),
    empresaId: formData.get("empresaId") ?? "",
    cargo: valor("cargo"),
    departamento: valor("departamento"),
    situacao: valor("situacao"),
    grupoLicencaId: valor("grupoLicencaId"),
    emailCorporativo: valor("emailCorporativo"),
    aplicar: valor("aplicar"),
    criarContaMicrosoft: formData.get("criarContaMicrosoft") === "on",
    removerFoto: formData.get("removerFoto") === "sim",
  });
  if (!dados.success) {
    const campos = z.flattenError(dados.error).fieldErrors as Record<string, string[] | undefined>;
    return { erros: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v?.[0]])) };
  }
  const d = dados.data;
  const arquivo = formData.get("foto");
  const foto = arquivo instanceof File && arquivo.size > 0 ? Buffer.from(await arquivo.arrayBuffer()) : null;
  const identificacao = {
    nome: d.nome,
    segundoNome: d.segundoNome,
    sobrenomeUtilizado: d.sobrenomeUtilizado,
    empresaId: d.empresaId,
    cargo: d.cargo,
    departamento: d.departamento,
    situacao: d.situacao,
    grupoLicencaId: d.grupoLicencaId ?? null,
    foto,
  };

  try {
    if (d.id) {
      const r = await editarPessoa(ator, { ...identificacao, colaboradorId: d.id, aplicar: d.aplicar, removerFoto: d.removerFoto });
      revalidatePath("/ti/cadastros/pessoas");
      return { ok: true, colaboradorId: r.id, mensagem: `${r.nome}: cadastro atualizado.` };
    }
    // A senha inicial é calculada no servidor (fórmula da planilha); o navegador não a envia.
    const r = await cadastrarPessoa(ator, {
      ...identificacao,
      email: d.emailCorporativo ?? "",
      criarContaMicrosoft: d.criarContaMicrosoft,
    });
    revalidatePath("/ti/cadastros/pessoas");
    return {
      ok: true,
      colaboradorId: r.colaboradorId,
      mensagem: r.microsoft365
        ? `Pessoa cadastrada. ${r.microsoft365.mensagem}`
        : "Pessoa cadastrada.",
    };
  } catch (erro) {
    if (erro instanceof ErroIdentificadores) return { erro: erro.message, conflitos: erro.conflitos };
    const mensagem = mensagemDeErro(erro);
    const campo = campoDoErro(mensagem);
    return campo ? { erros: { [campo]: mensagem } } : { erro: mensagem };
  }
}

const esquemaVerificacao = z.object({
  nome: texto(120),
  segundoNome: texto(60).optional(),
  sobrenomeUtilizado: texto(60).optional(),
  grupoLicencaId: z.uuid().optional(),
  email: texto(254).optional(),
  colaboradorId: z.uuid().optional(),
});

/** Disponibilidade dos identificadores (banco do portal), calculados no servidor a partir do nome. */
export async function acaoVerificarIdentificadores(entrada: z.input<typeof esquemaVerificacao>): Promise<ResultadoVerificacao> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaVerificacao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados inválidos." };
  try {
    return { ok: true, ...(await verificarIdentificadores(ator, dados.data)) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoDetalhePessoa(id: string): Promise<{ ok: true; dados: DetalhePessoa } | { ok: false; erro: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterDetalhePessoa(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/* Catálogo de grupos de licença */

const esquemaGrupo = z.object({
  id: z.uuid().optional(),
  nome: texto(60).min(2, "Informe o nome do grupo."),
  dominioLogin: texto(253).min(3, "Informe o domínio de login."),
  dominioEmail: texto(253).min(3, "Informe o domínio de e-mail."),
  ativo: z.boolean(),
});

export async function acaoSalvarGrupoLicenca(_a: EstadoPessoa, formData: FormData): Promise<EstadoPessoa> {
  const ator = await atorAtual();
  if (!ator) return { erro: SESSAO };
  const dados = esquemaGrupo.safeParse({
    id: formData.get("id") || undefined,
    nome: formData.get("nome") ?? "",
    dominioLogin: formData.get("dominioLogin") ?? "",
    dominioEmail: formData.get("dominioEmail") ?? "",
    ativo: formData.get("ativo") !== "nao",
  });
  if (!dados.success) {
    const campos = z.flattenError(dados.error).fieldErrors as Record<string, string[] | undefined>;
    return { erros: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v?.[0]])) };
  }
  try {
    const { id, ...resto } = dados.data;
    const r = await salvarGrupoLicenca(ator, { id, dados: resto });
    revalidatePath("/ti/cadastros/pessoas");
    return { ok: true, mensagem: id ? `Grupo ${r.nome} atualizado.` : `Grupo ${r.nome} incluído.` };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (/login/i.test(mensagem)) return { erros: { dominioLogin: mensagem } };
    if (/e-mail/i.test(mensagem)) return { erros: { dominioEmail: mensagem } };
    if (/nome|grupo/i.test(mensagem)) return { erros: { nome: mensagem } };
    return { erro: mensagem };
  }
}
