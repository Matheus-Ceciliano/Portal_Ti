"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { PERFIS_TI, PERFIS_ADMINISTRATIVOS } from "@/server/authz/catalogo";
import { mensagemDeErro } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import {
  atribuirPerfil,
  concederPermissaoIndividual,
  gerarNovoCodigoAtivacao,
  revogarPerfil,
  revogarPermissaoIndividual,
} from "@/server/modulos/perfis";
import {
  alterarBloqueioConta,
  cadastrarPessoa,
  provisionarContaMicrosoft,
  redefinirSenhaPelaTi,
} from "@/server/modulos/pessoas";

export type EstadoAcao = {
  ok?: boolean;
  mensagem?: string;
  erro?: string;
  erros?: Record<string, string | undefined>;
  codigoAtivacao?: { codigo: string; expiraEm: string; nome: string };
  colaboradorId?: string;
};

const SESSAO_EXPIRADA: EstadoAcao = { erro: "Sua sessão expirou. Entre novamente para continuar." };

async function atorAtual() {
  const contexto = await obterSessao();
  return contexto?.ator ?? null;
}

function errosDeCampo(erro: z.ZodError): Record<string, string | undefined> {
  const campos = z.flattenError(erro).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v?.[0]]));
}

/* Cadastro de pessoa com senha inicial */

const esquemaCadastro = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail corporativo válido.")),
  cargo: z.string().trim().min(2, "Informe o cargo.").max(80),
  departamento: z.string().trim().min(2, "Informe o departamento.").max(80),
  empresaId: z.uuid("Selecione a empresa."),
  senhaInicial: z.string().min(1, "Defina a senha inicial."),
  criarContaMicrosoft: z.boolean(),
});

export async function acaoCadastrarPessoa(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = esquemaCadastro.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    cargo: formData.get("cargo"),
    departamento: formData.get("departamento"),
    empresaId: formData.get("empresaId"),
    senhaInicial: formData.get("senhaInicial"),
    criarContaMicrosoft: formData.get("criarContaMicrosoft") === "on",
  });
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    const resultado = await cadastrarPessoa(ator, dados.data);
    revalidatePath("/ti/cadastros/pessoas");
    const m365 = resultado.microsoft365;
    return {
      ok: true,
      colaboradorId: resultado.colaboradorId,
      mensagem: m365
        ? `Pessoa cadastrada. ${m365.mensagem}`
        : "Pessoa cadastrada. Entregue a senha inicial ao titular por um canal fora do portal; no primeiro acesso ele define a própria senha.",
    };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    return mensagem.startsWith("A senha") || mensagem.startsWith("Essa senha")
      ? { erros: { senhaInicial: mensagem } }
      : { erro: mensagem };
  }
}

/* Perfis */

const esquemaAtribuir = z.object({
  colaboradorId: z.uuid("Selecione a pessoa."),
  perfil: z.enum(PERFIS_TI, "Selecione o perfil."),
  justificativa: z.string().trim().min(10, "Descreva a justificativa (mínimo de 10 caracteres).").max(500),
});

export async function acaoAtribuirPerfil(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = esquemaAtribuir.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    const r = await atribuirPerfil(ator, dados.data);
    revalidatePath("/ti/configuracoes");
    return {
      ok: true,
      mensagem: `Perfil ${r.perfil} atribuído a ${r.nome}. O perfil só vale depois da ativação pelo titular.`,
      codigoAtivacao: { codigo: r.codigoAtivacao, expiraEm: r.expiraEm.toISOString(), nome: r.nome },
    };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

export async function acaoRevogarPerfil(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = z
    .object({
      perfilAtribuidoId: z.uuid(),
      justificativa: z.string().trim().min(10, "Descreva a justificativa (mínimo de 10 caracteres).").max(500),
    })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    await revogarPerfil(ator, dados.data);
    revalidatePath("/ti/configuracoes");
    return { ok: true, mensagem: "Perfil revogado. As sessões da pessoa foram encerradas." };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

export async function acaoGerarCodigoAtivacao(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const colaboradorId = z.uuid().safeParse(formData.get("colaboradorId"));
  if (!colaboradorId.success) return { erro: "Pessoa inválida." };
  try {
    const r = await gerarNovoCodigoAtivacao(ator, { colaboradorId: colaboradorId.data });
    revalidatePath("/ti/configuracoes");
    return {
      ok: true,
      mensagem: `Novo código gerado para ${r.nome}. Os códigos anteriores foram invalidados.`,
      codigoAtivacao: { codigo: r.codigoAtivacao, expiraEm: r.expiraEm.toISOString(), nome: r.nome },
    };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

/* Permissões individuais */

const esquemaConceder = z.object({
  colaboradorId: z.uuid("Selecione a pessoa."),
  permissao: z.string().min(1, "Selecione a permissão."),
  justificativa: z.string().trim().min(10, "Descreva a justificativa (mínimo de 10 caracteres).").max(500),
  validaAte: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(`${v}T23:59:59-03:00`) : null)),
});

export async function acaoConcederPermissao(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = esquemaConceder.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    await concederPermissaoIndividual(ator, dados.data);
    revalidatePath("/ti/configuracoes");
    return { ok: true, mensagem: "Permissão concedida. Ela vale a partir da próxima requisição da pessoa." };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

export async function acaoRevogarPermissao(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const concessaoId = z.uuid().safeParse(formData.get("concessaoId"));
  if (!concessaoId.success) return { erro: "Concessão inválida." };
  try {
    await revogarPermissaoIndividual(ator, { concessaoId: concessaoId.data });
    revalidatePath("/ti/configuracoes");
    return { ok: true, mensagem: "Permissão revogada." };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

/* Conta de acesso */

export async function acaoRedefinirSenha(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = z
    .object({ colaboradorId: z.uuid(), novaSenha: z.string().min(1, "Defina a nova senha.") })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    await redefinirSenhaPelaTi(ator, dados.data);
    revalidatePath(`/ti/cadastros/pessoas/${dados.data.colaboradorId}`);
    return {
      ok: true,
      mensagem: "Senha redefinida e sessões encerradas. No próximo acesso o titular define uma senha pessoal.",
    };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    return mensagem.startsWith("A senha") || mensagem.startsWith("Essa senha")
      ? { erros: { novaSenha: mensagem } }
      : { erro: mensagem };
  }
}

export async function acaoAlterarBloqueio(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = z
    .object({ colaboradorId: z.uuid(), bloquear: z.enum(["sim", "nao"]) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Requisição inválida." };
  try {
    await alterarBloqueioConta(ator, {
      colaboradorId: dados.data.colaboradorId,
      bloquear: dados.data.bloquear === "sim",
    });
    revalidatePath(`/ti/cadastros/pessoas/${dados.data.colaboradorId}`);
    return { ok: true, mensagem: dados.data.bloquear === "sim" ? "Conta bloqueada." : "Conta desbloqueada." };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

export async function acaoProvisionarMicrosoft(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ator = await atorAtual();
  if (!ator) return SESSAO_EXPIRADA;
  const dados = z
    .object({ colaboradorId: z.uuid(), senhaMicrosoft: z.string().min(1, "Defina a senha inicial do Microsoft 365.") })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erros: errosDeCampo(dados.error) };
  try {
    const r = await provisionarContaMicrosoft(ator, dados.data);
    return r.ok ? { ok: true, mensagem: r.mensagem } : { erro: r.mensagem };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

/* Preferência de visão (não é dado de autorização) */

export async function acaoTrocarVisao(formData: FormData) {
  const ator = await atorAtual();
  if (!ator) return;
  const visao = formData.get("visao");
  if (visao !== "OPERACIONAL" && visao !== "GERENCIAL") return;
  if (!ator.perfisAtivos.some((p) => PERFIS_ADMINISTRATIVOS.includes(p))) return;
  await prisma.contaAcesso.update({ where: { id: ator.contaId }, data: { visaoPainel: visao } });
  revalidatePath("/ti", "layout");
}
