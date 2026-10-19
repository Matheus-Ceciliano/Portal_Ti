"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { problemaCnpj } from "@/lib/cnpj";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { SITUACOES } from "@/lib/inventario";
import {
  listarAlocacoesEmpresa,
  listarColaboradoresEmpresa,
  listarEquipamentosEmpresa,
  obterResumoEmpresa,
  SITUACOES_ALOCACAO_EMPRESA,
  VINCULOS_ALOCACAO,
  type ResumoEmpresa,
} from "@/server/modulos/empresa-registros";
import { salvarEmpresa } from "@/server/modulos/empresas";

export type EstadoEmpresa = {
  ok?: boolean;
  mensagem?: string;
  erro?: string;
  erros?: Partial<Record<"nome" | "sigla" | "cnpj" | "cidade" | "responsavel" | "nomeCurtoSenha" | "observacoes" | "logo", string>>;
};

const esquema = z.object({
  id: z.uuid().optional(),
  nome: z.string().trim().min(3, "Informe a razão social.").max(160, "Use no máximo 160 caracteres."),
  sigla: z
    .string()
    .trim()
    .min(2, "Informe a sigla ou nome curto.")
    .max(12, "Use no máximo 12 caracteres.")
    .regex(/^[\p{L}\p{N} .&-]+$/u, "Use letras, números, espaço, ponto, hífen ou &."),
  cnpj: z.string().superRefine((v, ctx) => {
    const problema = problemaCnpj(v);
    if (problema) ctx.addIssue({ code: "custom", message: problema });
  }),
  cidade: z.string().trim().min(2, "Informe a cidade.").max(80),
  responsavel: z.string().trim().max(120, "Use no máximo 120 caracteres.").optional(),
  nomeCurtoSenha: z
    .string()
    .trim()
    .max(30, "Use no máximo 30 caracteres.")
    .regex(/^[\p{L}\p{N}]+$/u, "Use só letras e números, sem espaços (ex.: Virta).")
    .optional(),
  ativa: z.boolean(),
  observacoes: z.string().trim().max(1000, "Use no máximo 1.000 caracteres.").optional(),
  removerLogo: z.boolean(),
});

export async function acaoSalvarEmpresa(_a: EstadoEmpresa, formData: FormData): Promise<EstadoEmpresa> {
  const contexto = await obterSessao();
  if (!contexto) return { erro: "Sua sessão expirou. Entre novamente para continuar." };
  const dados = esquema.safeParse({
    id: formData.get("id") || undefined,
    nome: formData.get("nome"),
    sigla: formData.get("sigla"),
    cnpj: formData.get("cnpj"),
    cidade: formData.get("cidade"),
    responsavel: formData.get("responsavel") || undefined,
    nomeCurtoSenha: formData.get("nomeCurtoSenha") || undefined,
    ativa: formData.get("ativa") === "ATIVA",
    observacoes: formData.get("observacoes") || undefined,
    removerLogo: formData.get("removerLogo") === "sim",
  });
  if (!dados.success) {
    const campos = z.flattenError(dados.error).fieldErrors as Record<string, string[] | undefined>;
    return { erros: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v?.[0]])) };
  }
  const arquivo = formData.get("logo");
  const logo = arquivo instanceof File && arquivo.size > 0 ? Buffer.from(await arquivo.arrayBuffer()) : null;

  try {
    const { id, ...resto } = dados.data;
    const salva = await salvarEmpresa(contexto.ator, {
      id,
      dados: resto,
      logo,
      removerLogo: resto.removerLogo,
    });
    revalidatePath("/ti/cadastros/empresas");
    return { ok: true, mensagem: id ? `${salva.nome} atualizada.` : `${salva.nome} cadastrada.` };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (/CNPJ/.test(mensagem)) return { erros: { cnpj: mensagem } };
    if (/sigla/.test(mensagem)) return { erros: { sigla: mensagem } };
    if (/razão social/.test(mensagem)) return { erros: { nome: mensagem } };
    if (/logotipo|armazenamento/.test(mensagem)) return { erros: { logo: mensagem } };
    return { erro: mensagem };
  }
}

const filtroBase = {
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).optional(),
  porPagina: z.coerce.number().int().min(1).max(50).optional(),
};
const esquemaRegistros = z.discriminatedUnion("aba", [
  z.object({
    aba: z.literal("colaboradores"),
    ...filtroBase,
    situacao: z.enum(["PRE_CADASTRO", "ATIVO", "AFASTADO", "DESLIGADO"]).optional(),
    departamento: z.string().max(80).optional(),
  }),
  z.object({
    aba: z.literal("equipamentos"),
    ...filtroBase,
    categoria: z.string().max(40).optional(),
    situacao: z.enum(SITUACOES).optional(),
  }),
  z.object({
    aba: z.literal("alocacoes"),
    ...filtroBase,
    situacao: z.enum(SITUACOES_ALOCACAO_EMPRESA).optional(),
    vinculo: z.enum(VINCULOS_ALOCACAO).optional(),
    periodo: z.enum(["30", "90", "365"]).optional(),
    ordem: z.enum(["recentes", "antigas"]).optional(),
  }),
]);

export type RespostaRegistros =
  | { ok: true; aba: "colaboradores"; dados: Awaited<ReturnType<typeof listarColaboradoresEmpresa>> }
  | { ok: true; aba: "equipamentos"; dados: Awaited<ReturnType<typeof listarEquipamentosEmpresa>> }
  | { ok: true; aba: "alocacoes"; dados: Awaited<ReturnType<typeof listarAlocacoesEmpresa>> }
  | { ok: false; erro: string };

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

export async function acaoResumoEmpresa(
  id: string,
): Promise<{ ok: true; dados: ResumoEmpresa } | { ok: false; erro: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterResumoEmpresa(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Registros de uma aba do modal; o servidor valida filtros, empresa e permissões. */
export async function acaoRegistrosEmpresa(empresaId: string, filtros: unknown): Promise<RespostaRegistros> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const f = esquemaRegistros.safeParse(filtros);
  if (!f.success) return { ok: false, erro: "Filtros inválidos." };
  try {
    switch (f.data.aba) {
      case "colaboradores":
        return { ok: true, aba: "colaboradores", dados: await listarColaboradoresEmpresa(ator, empresaId, f.data) };
      case "equipamentos":
        return { ok: true, aba: "equipamentos", dados: await listarEquipamentosEmpresa(ator, empresaId, f.data) };
      case "alocacoes":
        return { ok: true, aba: "alocacoes", dados: await listarAlocacoesEmpresa(ator, empresaId, f.data) };
    }
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

