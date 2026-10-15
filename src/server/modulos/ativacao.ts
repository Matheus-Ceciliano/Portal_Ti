import { randomInt } from "node:crypto";
import { registrarAuditoria } from "@/server/auditoria";
import { gerarHashSenha, hmac, validarPoliticaSenha, verificarSenha } from "@/server/auth/senha";
import { ErroNegocio } from "@/server/authz/exigir";
import { prisma, type ClienteBanco } from "@/server/db";

/**
 * Ativação segura (Check 3; ARQUITETURA_TECNICA.md §9.6, Q-43):
 *  - a senha inicial definida pela TI só abre /conta/ativar;
 *  - o titular define a própria senha (diferente da inicial);
 *  - com perfil de TI, também informa o código de ativação de uso único, gerado pelo
 *    administrador que atribuiu o perfil e entregue fora do portal, e configura o TOTP.
 * Só então os perfis de TI passam a valer. Tudo verificado no servidor.
 */

export const VALIDADE_CODIGO_MS = 48 * 60 * 60 * 1000;
export const TENTATIVAS_CODIGO = 5;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

function novoCodigo(): string {
  const grupos = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join(""),
  );
  return grupos.join("-");
}

const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCodigo = (c: string) => hmac(normalizarCodigo(c), "codigo-ativacao");

/** Gera um código novo e invalida os anteriores. Devolve o código em claro UMA vez. */
export async function gerarCodigoAtivacao(db: ClienteBanco, contaId: string, criadoPor: string | null) {
  const agora = new Date();
  await db.codigoAtivacao.updateMany({
    where: { contaId, usadoEm: null, invalidadoEm: null },
    data: { invalidadoEm: agora },
  });
  const codigo = novoCodigo();
  await db.codigoAtivacao.create({
    data: {
      contaId,
      hashCodigo: hashCodigo(codigo),
      criadoPor,
      expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_MS),
    },
  });
  return { codigo, expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_MS) };
}

/**
 * Consome o código: válido só se for da conta, não usado, não invalidado, dentro da
 * validade e abaixo do limite de tentativas. Falha incrementa tentativas do código ativo.
 */
export async function consumirCodigoAtivacao(db: ClienteBanco, contaId: string, codigo: string): Promise<boolean> {
  const agora = new Date();
  const ativo = await db.codigoAtivacao.findFirst({
    where: { contaId, usadoEm: null, invalidadoEm: null, expiraEm: { gt: agora } },
    orderBy: { criadoEm: "desc" },
  });
  if (!ativo) return false;
  if (ativo.tentativas >= TENTATIVAS_CODIGO || ativo.hashCodigo !== hashCodigo(codigo)) {
    const tentativas = ativo.tentativas + 1;
    await db.codigoAtivacao.update({
      where: { id: ativo.id },
      data: { tentativas, invalidadoEm: tentativas >= TENTATIVAS_CODIGO ? agora : null },
    });
    return false;
  }
  // Atualização condicional: um segundo uso concorrente do mesmo código não passa.
  const { count } = await db.codigoAtivacao.updateMany({
    where: { id: ativo.id, usadoEm: null, invalidadoEm: null },
    data: { usadoEm: agora },
  });
  return count === 1;
}

export type SituacaoAtivacao = {
  precisaCodigo: boolean;
  precisaSenhaPessoal: boolean;
  precisaMfa: boolean;
  perfilTi: boolean;
};

export async function obterSituacaoAtivacao(contaId: string): Promise<SituacaoAtivacao> {
  const conta = await prisma.contaAcesso.findUniqueOrThrow({
    where: { id: contaId },
    include: { colaborador: { select: { perfis: { where: { revogadoEm: null }, select: { id: true } } } } },
  });
  const perfilTi = conta.colaborador.perfis.length > 0;
  const tiPendente = perfilTi && !conta.ativacaoTiConcluidaEm;
  return {
    perfilTi,
    precisaCodigo: tiPendente && !conta.ativacaoTiCodigoValidadoEm,
    precisaSenhaPessoal: !conta.senhaPessoalDefinidaEm || (tiPendente && !conta.ativacaoTiCodigoValidadoEm),
    precisaMfa: tiPendente,
  };
}

/** Etapa 1: senha pessoal (e código, para perfil de TI). */
export async function definirSenhaPessoal(
  contaId: string,
  entrada: { novaSenha: string; codigo?: string },
): Promise<SituacaoAtivacao> {
  const situacao = await obterSituacaoAtivacao(contaId);
  if (!situacao.precisaSenhaPessoal) throw new ErroNegocio("A senha pessoal já foi definida.");

  const conta = await prisma.contaAcesso.findUniqueOrThrow({
    where: { id: contaId },
    include: { credenciais: { where: { providerId: "credential" } }, colaborador: true },
  });
  const problema = validarPoliticaSenha(entrada.novaSenha, conta.email);
  if (problema) throw new ErroNegocio(problema);
  const credencial = conta.credenciais[0];
  if (credencial?.password && (await verificarSenha(credencial.password, entrada.novaSenha))) {
    throw new ErroNegocio("A nova senha precisa ser diferente da senha recebida da TI.");
  }
  const novoHash = await gerarHashSenha(entrada.novaSenha);

  // Fora da transação: a tentativa falha precisa ficar registrada (limite de tentativas).
  if (situacao.precisaCodigo) {
    const valido = entrada.codigo ? await consumirCodigoAtivacao(prisma, contaId, entrada.codigo) : false;
    if (!valido) throw new ErroNegocio("Código de ativação inválido, expirado ou já utilizado.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.credencialConta.update({ where: { id: credencial.id }, data: { password: novoHash } });
    await tx.contaAcesso.update({
      where: { id: contaId },
      data: {
        senhaPessoalDefinidaEm: new Date(),
        ...(situacao.precisaCodigo ? { ativacaoTiCodigoValidadoEm: new Date() } : {}),
      },
    });
    await registrarAuditoria(tx, {
      acao: "conta.definir_senha_pessoal",
      resultado: "SUCESSO",
      ator: { contaId, nome: conta.colaborador.nome },
      alvo: { tipo: "conta_acesso", id: contaId },
      detalhe: { comCodigoAtivacao: situacao.precisaCodigo },
    });
  });

  return obterSituacaoAtivacao(contaId);
}

/** Etapa 2 concluída: TOTP confirmado. A partir daqui os perfis de TI valem. */
export async function concluirAtivacaoTi(contaId: string) {
  const conta = await prisma.contaAcesso.update({
    where: { id: contaId },
    data: { ativacaoTiConcluidaEm: new Date() },
    include: { colaborador: true },
  });
  await registrarAuditoria(prisma, {
    acao: "conta_acesso.ativar_perfil_ti",
    resultado: "SUCESSO",
    ator: { contaId, nome: conta.colaborador.nome },
    alvo: { tipo: "conta_acesso", id: contaId },
  });
}

/** Reinicia a ativação de TI (atribuição de perfil): MFA anterior descartado, sessões revogadas. */
export async function reiniciarAtivacaoTi(db: ClienteBanco, contaId: string) {
  await db.fatorMfa.deleteMany({ where: { userId: contaId } });
  await db.sessao.deleteMany({ where: { userId: contaId } });
  await db.contaAcesso.update({
    where: { id: contaId },
    data: { ativacaoTiConcluidaEm: null, ativacaoTiCodigoValidadoEm: null, twoFactorEnabled: false },
  });
}
