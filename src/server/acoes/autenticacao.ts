"use server";

import QRCode from "qrcode";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoria } from "@/server/auditoria";
import { obterAuth } from "@/server/auth/better-auth";
import { REGRAS, chaveEmail, chaveIp, estaBloqueado, limparFalhas, registrarFalha } from "@/server/auth/limitador";
import { obterSessao } from "@/server/auth/sessao";
import { registrarUsoTotp } from "@/server/auth/totp-usado";
import { ErroNegocio } from "@/server/authz/exigir";
import { obterConfiguracao } from "@/server/config";
import { prisma } from "@/server/db";
import { concluirAtivacaoTi, definirSenhaPessoal, obterSituacaoAtivacao } from "@/server/modulos/ativacao";

const MSG_INVALIDO = "E-mail ou senha inválidos.";
const MSG_LIMITE = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
const MSG_ERRO = "Não foi possível concluir. Tente novamente.";

function obterIp(h: Headers): string {
  // Em produção, só o proxy reverso confiável define este cabeçalho (configuração do host).
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function nomeCookieSessao() {
  const seguro = obterConfiguracao().AMBIENTE !== "DESENVOLVIMENTO";
  return `${seguro ? "__Secure-" : ""}vallur.session_token`;
}

async function registrarEntrada(contaId: string, comSegundoFator: boolean) {
  const conta = await prisma.contaAcesso.update({
    where: { id: contaId },
    data: { ultimoAcessoEm: new Date() },
    include: { colaborador: { select: { nome: true } } },
  });
  await registrarAuditoria(prisma, {
    acao: "auth.entrar",
    resultado: "SUCESSO",
    ator: { contaId, nome: conta.colaborador.nome },
    detalhe: { segundoFator: comSegundoFator },
  });
}

/* Entrar */

export type EstadoEntrada = { erro?: string; erros?: { email?: string; senha?: string }; email?: string };

const esquemaEntrada = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail corporativo válido.")),
  senha: z.string().min(1, "Informe a senha.").max(128, "Senha longa demais."),
});

export async function entrar(_anterior: EstadoEntrada, formData: FormData): Promise<EstadoEntrada> {
  const emailDigitado = String(formData.get("email") ?? "");
  const dados = esquemaEntrada.safeParse({ email: formData.get("email"), senha: formData.get("senha") });
  if (!dados.success) {
    const erros = z.flattenError(dados.error).fieldErrors;
    return { email: emailDigitado, erros: { email: erros.email?.[0], senha: erros.senha?.[0] } };
  }
  const { email, senha } = dados.data;
  const h = await headers();
  const ip = obterIp(h);

  // Limitador antes de qualquer hash; mesma resposta para conta existente ou não (DA-27).
  if (await estaBloqueado([chaveIp(ip), chaveEmail(email)])) return { erro: MSG_LIMITE, email };

  let destino = "/";
  try {
    const resposta = await obterAuth().api.signInEmail({ body: { email, password: senha }, headers: h });
    await limparFalhas(chaveEmail(email));
    if ("twoFactorRedirect" in resposta && resposta.twoFactorRedirect) {
      destino = "/entrar/segundo-fator";
    } else if ("user" in resposta) {
      await registrarEntrada(resposta.user.id, false);
    }
  } catch {
    const bloqueou = await registrarFalha(chaveEmail(email), REGRAS.entrarEmail);
    await registrarFalha(chaveIp(ip), REGRAS.entrarIp);
    if (bloqueou) {
      // Auditoria agregada: um evento ao atingir o limite, nunca um por tentativa.
      await registrarAuditoria(prisma, {
        acao: "auth.bloqueio_temporario",
        resultado: "FALHA",
        detalhe: { motivo: "tentativas_excedidas", janelaMinutos: 15 },
      });
    }
    return { erro: MSG_INVALIDO, email };
  }
  redirect(destino);
}

/* Segundo fator */

export type EstadoSegundoFator = { erro?: string };

export async function verificarSegundoFator(
  _anterior: EstadoSegundoFator,
  formData: FormData,
): Promise<EstadoSegundoFator> {
  const recuperacao = formData.get("modo") === "recuperacao";
  const codigo = String(formData.get("codigo") ?? "").replace(/\s/g, "");
  if (!recuperacao && !/^\d{6}$/.test(codigo)) {
    return { erro: "Informe os 6 dígitos mostrados no aplicativo autenticador." };
  }
  if (recuperacao && !/^[A-Za-z0-9-]{6,32}$/.test(codigo)) {
    return { erro: "Informe um código de recuperação válido." };
  }
  const h = await headers();
  const chave = `2fa:${chaveIp(obterIp(h))}`;
  if (await estaBloqueado([chave])) return { erro: MSG_LIMITE };

  let resposta: { token?: string; user: { id: string } };
  try {
    const auth = obterAuth();
    resposta = recuperacao
      ? await auth.api.verifyBackupCode({ body: { code: codigo }, headers: h })
      : await auth.api.verifyTOTP({ body: { code: codigo }, headers: h });
  } catch {
    await registrarFalha(chave, REGRAS.segundoFator);
    return { erro: "Código inválido ou expirado. Se o problema continuar, entre novamente." };
  }

  if (!resposta.token) return { erro: MSG_ERRO };
  if (!recuperacao && !(await registrarUsoTotp(resposta.user.id, codigo))) {
    await prisma.sessao.deleteMany({ where: { token: resposta.token } });
    await registrarAuditoria(prisma, {
      acao: "auth.totp_reutilizado",
      resultado: "NEGADO",
      alvo: { tipo: "conta_acesso", id: resposta.user.id },
    });
    return { erro: "Este código já foi usado. Aguarde o próximo código do aplicativo." };
  }
  await prisma.sessao.updateMany({ where: { token: resposta.token }, data: { mfaVerificadoEm: new Date() } });
  await registrarEntrada(resposta.user.id, true);
  redirect("/");
}

/* Sair */

/**
 * Encerra a sessão e devolve o resultado (sem redirecionar no servidor), para o diálogo
 * de confirmação exibir carregamento e erro. O cliente navega depois com recarga completa.
 */
export async function encerrarSessao(): Promise<{ ok: boolean }> {
  try {
    const contexto = await obterSessao();
    await obterAuth()
      .api.signOut({ headers: await headers() })
      .catch(() => undefined);
    if (contexto) {
      await prisma.sessao.deleteMany({ where: { id: contexto.sessaoId } });
      await registrarAuditoria(prisma, {
        acao: "auth.sair",
        resultado: "SUCESSO",
        ator: { contaId: contexto.ator.contaId, nome: contexto.ator.nome },
      });
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function sair() {
  const contexto = await obterSessao();
  try {
    await obterAuth().api.signOut({ headers: await headers() });
  } catch {
    // sessão já inexistente
  }
  if (contexto) {
    await prisma.sessao.deleteMany({ where: { id: contexto.sessaoId } });
    await registrarAuditoria(prisma, {
      acao: "auth.sair",
      resultado: "SUCESSO",
      ator: { contaId: contexto.ator.contaId, nome: contexto.ator.nome },
    });
  }
  redirect("/entrar?motivo=encerrada");
}

/* Ativação da conta */

export type DadosMfa = { totpUri: string; chave: string; qrCode: string; codigosRecuperacao: string[] };

export type EstadoAtivacao = {
  erro?: string;
  erros?: { codigo?: string; novaSenha?: string; confirmacao?: string; codigoMfa?: string; senha?: string };
  mfa?: DadosMfa;
};

const esquemaSenhaPessoal = z
  .object({
    codigo: z.string().trim().optional(),
    novaSenha: z.string().min(1, "Informe a nova senha."),
    confirmacao: z.string().min(1, "Repita a nova senha."),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não coincidem.",
  });

async function contaDaSessaoParaAtivacao() {
  const contexto = await obterSessao();
  if (!contexto) redirect("/entrar?motivo=expirada");
  return contexto;
}

async function prepararMfa(senha: string): Promise<DadosMfa> {
  const resposta = await obterAuth().api.enableTwoFactor({
    body: { password: senha, method: "totp" },
    headers: await headers(),
  });
  if (resposta.method !== "totp") throw new Error("método inesperado");
  const totpUri = resposta.totpURI;
  const segredo = new URL(totpUri).searchParams.get("secret") ?? "";
  return {
    totpUri,
    chave: segredo.match(/.{1,4}/g)?.join(" ") ?? segredo,
    // QR gerado localmente no servidor do portal, nunca por serviço externo.
    qrCode: await QRCode.toDataURL(totpUri, { margin: 1, width: 208, errorCorrectionLevel: "M" }),
    codigosRecuperacao: resposta.backupCodes,
  };
}

export async function definirSenhaAtivacao(
  _anterior: EstadoAtivacao,
  formData: FormData,
): Promise<EstadoAtivacao> {
  const { ator, sessaoId } = await contaDaSessaoParaAtivacao();
  const dados = esquemaSenhaPessoal.safeParse({
    codigo: formData.get("codigo") ?? undefined,
    novaSenha: formData.get("novaSenha"),
    confirmacao: formData.get("confirmacao"),
  });
  if (!dados.success) {
    const e = z.flattenError(dados.error).fieldErrors;
    return { erros: { novaSenha: e.novaSenha?.[0], confirmacao: e.confirmacao?.[0] } };
  }
  const chave = `ativacao:${ator.contaId}`;
  if (await estaBloqueado([chave])) return { erro: MSG_LIMITE };

  let precisaMfa = false;
  try {
    const situacao = await definirSenhaPessoal(ator.contaId, {
      novaSenha: dados.data.novaSenha,
      codigo: dados.data.codigo,
    });
    precisaMfa = situacao.precisaMfa;
  } catch (erro) {
    if (erro instanceof ErroNegocio) {
      if (erro.message.startsWith("Código")) {
        await registrarFalha(chave, REGRAS.ativacao);
        return { erros: { codigo: erro.message } };
      }
      return { erros: { novaSenha: erro.message } };
    }
    return { erro: MSG_ERRO };
  }
  // Senha trocada: encerra as demais sessões da conta (inclusive de quem conhecia a senha inicial).
  await prisma.sessao.deleteMany({ where: { userId: ator.contaId, id: { not: sessaoId } } });

  if (precisaMfa) {
    try {
      return { mfa: await prepararMfa(dados.data.novaSenha) };
    } catch {
      return { erro: MSG_ERRO };
    }
  }
  redirect("/");
}

/** Retomada: senha pessoal já definida, falta configurar o autenticador. */
export async function gerarChaveMfa(_anterior: EstadoAtivacao, formData: FormData): Promise<EstadoAtivacao> {
  const { ator } = await contaDaSessaoParaAtivacao();
  const situacao = await obterSituacaoAtivacao(ator.contaId);
  if (!situacao.precisaMfa || situacao.precisaSenhaPessoal) return { erro: MSG_ERRO };
  const chave = `ativacao:${ator.contaId}`;
  if (await estaBloqueado([chave])) return { erro: MSG_LIMITE };
  try {
    return { mfa: await prepararMfa(String(formData.get("senha") ?? "")) };
  } catch {
    await registrarFalha(chave, REGRAS.ativacao);
    return { erros: { senha: "Senha incorreta." } };
  }
}

export async function confirmarMfaAtivacao(
  anterior: EstadoAtivacao,
  formData: FormData,
): Promise<EstadoAtivacao> {
  const { ator } = await contaDaSessaoParaAtivacao();
  const situacao = await obterSituacaoAtivacao(ator.contaId);
  if (!situacao.precisaMfa || situacao.precisaSenhaPessoal) return { erro: MSG_ERRO };
  const codigo = String(formData.get("codigoMfa") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigo)) {
    return { ...anterior, erros: { codigoMfa: "Informe os 6 dígitos mostrados no aplicativo." } };
  }
  const chave = `ativacao:${ator.contaId}`;
  if (await estaBloqueado([chave])) return { ...anterior, erro: MSG_LIMITE };

  try {
    await obterAuth().api.verifyTOTP({ body: { code: codigo }, headers: await headers() });
  } catch {
    await registrarFalha(chave, REGRAS.ativacao);
    return { ...anterior, erros: { codigoMfa: "Código incorreto. Confira o horário do celular e tente o próximo código." } };
  }
  await registrarUsoTotp(ator.contaId, codigo);

  // A biblioteca troca a sessão ao habilitar o 2FA: localiza a nova pelo cookie emitido.
  const valor = (await cookies()).get(nomeCookieSessao())?.value;
  const token = valor ? decodeURIComponent(valor).split(".")[0] : undefined;
  const nova =
    (token && (await prisma.sessao.findUnique({ where: { token } }))) ||
    (await prisma.sessao.findFirst({ where: { userId: ator.contaId }, orderBy: { createdAt: "desc" } }));
  if (!nova) redirect("/entrar?motivo=expirada");

  await prisma.sessao.update({ where: { id: nova.id }, data: { mfaVerificadoEm: new Date(), ultimoUsoEm: new Date() } });
  await prisma.sessao.deleteMany({ where: { userId: ator.contaId, id: { not: nova.id } } });
  await concluirAtivacaoTi(ator.contaId);
  await limparFalhas(chave);
  redirect("/");
}
