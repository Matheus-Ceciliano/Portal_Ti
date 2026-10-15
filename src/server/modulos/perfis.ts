import type { Perfil } from "@/generated/prisma/client";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { carregarAlvo } from "@/server/authz/ator";
import { PERFIS_ADMINISTRATIVOS, ROTULO_PERFIL, ehConcedivel, type PerfilTi } from "@/server/authz/catalogo";
import { ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma, type Transacao } from "@/server/db";
import { gerarCodigoAtivacao, reiniciarAtivacaoTi } from "./ativacao";

const CHAVE_BLOQUEIO_ADMINISTRADORES = 7_310_001;

/**
 * Regra do último administrador (PERMISSOES_RBAC.md §8), serializada por bloqueio
 * consultivo de transação para que duas revogações simultâneas não zerem a administração.
 */
export async function garantirOutroAdministrador(tx: Transacao, colaboradorIdSaindo: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAVE_BLOQUEIO_ADMINISTRADORES})`;
  const outros = await tx.perfilAtribuido.count({
    where: {
      revogadoEm: null,
      perfil: { in: [...PERFIS_ADMINISTRATIVOS] },
      colaboradorId: { not: colaboradorIdSaindo },
      colaborador: { situacao: "ATIVO", conta: { situacao: "ATIVA" } },
    },
  });
  if (outros === 0) {
    throw new ErroNegocio("Operação recusada: é o último administrador ativo do portal.");
  }
}

export async function listarEquipeTi(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "perfil.ver");
    const pessoas = await prisma.colaborador.findMany({
      where: { perfis: { some: { revogadoEm: null } } },
      orderBy: { nome: "asc" },
      include: {
        conta: { select: { situacao: true, ativacaoTiConcluidaEm: true, twoFactorEnabled: true, ultimoAcessoEm: true } },
        perfis: { where: { revogadoEm: null }, orderBy: { atribuidoEm: "asc" } },
        permissoesIndividuais: { where: { revogadaEm: null }, orderBy: { concedidaEm: "desc" } },
      },
    });
    return pessoas.map((p) => ({
      colaboradorId: p.id,
      nome: p.nome,
      email: p.emailCorporativo,
      cargo: p.cargo,
      contaSituacao: p.conta?.situacao ?? null,
      ativacaoConcluida: Boolean(p.conta?.ativacaoTiConcluidaEm),
      ultimoAcessoEm: p.conta?.ultimoAcessoEm ?? null,
      perfis: p.perfis.map((a) => ({ id: a.id, perfil: a.perfil as PerfilTi, atribuidoEm: a.atribuidoEm })),
      permissoes: p.permissoesIndividuais.map((pi) => ({
        id: pi.id,
        permissao: pi.permissao,
        validaAte: pi.validaAte,
        justificativa: pi.justificativa,
      })),
    }));
  });
}

/** Pessoas com conta de acesso que podem receber um perfil de TI. */
export async function listarCandidatosPerfil(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "perfil.ver");
    return prisma.colaborador.findMany({
      where: { situacao: "ATIVO", conta: { situacao: "ATIVA" } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, emailCorporativo: true },
    });
  });
}

/**
 * Atribui perfil de TI. Revoga as sessões do alvo, descarta o MFA anterior e gera um
 * código de ativação de uso único (entregue fora do portal). O perfil só vale depois
 * da ativação pelo titular.
 */
export async function atribuirPerfil(
  ator: Ator,
  entrada: { colaboradorId: string; perfil: PerfilTi; justificativa: string },
) {
  return executarCasoDeUso(ator, async () => {
    const justificativa = entrada.justificativa.trim();
    if (justificativa.length < 10) throw new ErroNegocio("Descreva a justificativa (mínimo de 10 caracteres).");

    return prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, entrada.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "perfil.atribuir", alvo);

      const pessoa = await tx.colaborador.findUniqueOrThrow({
        where: { id: entrada.colaboradorId },
        include: { conta: true, perfis: { where: { revogadoEm: null } } },
      });
      if (!pessoa.conta || pessoa.conta.situacao !== "ATIVA") {
        throw new ErroNegocio("A pessoa precisa ter conta de acesso ativa para receber um perfil de TI.");
      }
      const atuais = pessoa.perfis.map((p) => p.perfil as PerfilTi);
      if (atuais.includes(entrada.perfil)) throw new ErroNegocio("A pessoa já tem esse perfil.");
      const novoEhAdministrativo = PERFIS_ADMINISTRATIVOS.includes(entrada.perfil);
      if (entrada.perfil === "ESTAGIARIO_TI" && atuais.some((p) => PERFIS_ADMINISTRATIVOS.includes(p))) {
        throw new ErroNegocio("Estagiário TI e perfis administrativos não coexistem. Revogue o perfil administrativo antes.");
      }

      const agora = new Date();
      // Estagiário e perfil administrativo não coexistem (§3.10): revoga ESTAGIARIO_TI na mesma operação.
      if (novoEhAdministrativo && atuais.includes("ESTAGIARIO_TI")) {
        await tx.perfilAtribuido.updateMany({
          where: { colaboradorId: pessoa.id, perfil: "ESTAGIARIO_TI", revogadoEm: null },
          data: { revogadoEm: agora, revogadoPor: ator.contaId },
        });
      }
      await tx.perfilAtribuido.create({
        data: {
          colaboradorId: pessoa.id,
          perfil: entrada.perfil as Perfil,
          justificativa,
          atribuidoPor: ator.contaId,
        },
      });
      await reiniciarAtivacaoTi(tx, pessoa.conta.id);
      const { codigo, expiraEm } = await gerarCodigoAtivacao(tx, pessoa.conta.id, ator.contaId);
      await registrarAuditoria(tx, {
        acao: "perfil.atribuir",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
        detalhe: { perfil: entrada.perfil, perfisAntes: atuais, justificativa },
      });
      return { codigoAtivacao: codigo, expiraEm, nome: pessoa.nome, perfil: ROTULO_PERFIL[entrada.perfil] };
    });
  });
}

export async function revogarPerfil(ator: Ator, entrada: { perfilAtribuidoId: string; justificativa: string }) {
  return executarCasoDeUso(ator, async () => {
    const justificativa = entrada.justificativa.trim();
    if (justificativa.length < 10) throw new ErroNegocio("Descreva a justificativa (mínimo de 10 caracteres).");
    const registro = await prisma.perfilAtribuido.findUnique({ where: { id: entrada.perfilAtribuidoId } });
    if (!registro || registro.revogadoEm) throw new ErroNegocio("Perfil não encontrado ou já revogado.");

    return prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, registro.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "perfil.revogar", alvo);

      const pessoa = await tx.colaborador.findUniqueOrThrow({
        where: { id: registro.colaboradorId },
        include: { conta: true, perfis: { where: { revogadoEm: null } } },
      });
      const restantes = pessoa.perfis.filter((p) => p.id !== registro.id);
      const perdeAdministracao =
        PERFIS_ADMINISTRATIVOS.includes(registro.perfil as PerfilTi) &&
        !restantes.some((p) => PERFIS_ADMINISTRATIVOS.includes(p.perfil as PerfilTi));
      if (perdeAdministracao) await garantirOutroAdministrador(tx, pessoa.id);

      const agora = new Date();
      await tx.perfilAtribuido.update({
        where: { id: registro.id },
        data: { revogadoEm: agora, revogadoPor: ator.contaId },
      });
      // Sem perfil de TI, as concessões individuais deixam de existir (§3.9).
      if (restantes.length === 0) {
        await tx.permissaoIndividual.updateMany({
          where: { colaboradorId: pessoa.id, revogadaEm: null },
          data: { revogadaEm: agora, revogadaPor: ator.contaId },
        });
      }
      if (pessoa.conta) await tx.sessao.deleteMany({ where: { userId: pessoa.conta.id } });
      await registrarAuditoria(tx, {
        acao: "perfil.revogar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
        detalhe: { perfil: registro.perfil, justificativa },
      });
    });
  });
}

export async function concederPermissaoIndividual(
  ator: Ator,
  entrada: { colaboradorId: string; permissao: string; justificativa: string; validaAte: Date | null },
) {
  return executarCasoDeUso(ator, async () => {
    const justificativa = entrada.justificativa.trim();
    if (justificativa.length < 10) throw new ErroNegocio("Descreva a justificativa (mínimo de 10 caracteres).");
    if (!ehConcedivel(entrada.permissao)) {
      throw new ErroNegocio("Essa permissão não pode ser concedida individualmente.");
    }
    if (entrada.permissao === "provisionamento.executar" && !entrada.validaAte) {
      throw new ErroNegocio("A concessão de provisionamento exige data de validade.");
    }
    if (entrada.validaAte && entrada.validaAte <= new Date()) {
      throw new ErroNegocio("A validade precisa ser uma data futura.");
    }

    return prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, entrada.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "permissao_individual.gerenciar", alvo);
      if (!alvo.temPerfilTiAtivo) {
        throw new ErroNegocio("Permissões individuais só podem ser concedidas a quem tem perfil de TI.");
      }
      const existente = await tx.permissaoIndividual.findFirst({
        where: { colaboradorId: alvo.colaboradorId, permissao: entrada.permissao, revogadaEm: null },
      });
      if (existente) throw new ErroNegocio("Essa permissão já está concedida a esta pessoa.");
      const pessoa = await tx.colaborador.findUniqueOrThrow({ where: { id: alvo.colaboradorId } });
      const concessao = await tx.permissaoIndividual.create({
        data: {
          colaboradorId: alvo.colaboradorId,
          permissao: entrada.permissao,
          justificativa,
          concedidaPor: ator.contaId,
          validaAte: entrada.validaAte,
        },
      });
      await registrarAuditoria(tx, {
        acao: "permissao_individual.conceder",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
        detalhe: { permissao: entrada.permissao, validaAte: entrada.validaAte?.toISOString() ?? null, justificativa },
      });
      return concessao;
    });
  });
}

export async function revogarPermissaoIndividual(ator: Ator, entrada: { concessaoId: string }) {
  return executarCasoDeUso(ator, async () => {
    const concessao = await prisma.permissaoIndividual.findUnique({ where: { id: entrada.concessaoId } });
    if (!concessao || concessao.revogadaEm) throw new ErroNegocio("Concessão não encontrada ou já revogada.");
    return prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, concessao.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "permissao_individual.gerenciar", alvo);
      await tx.permissaoIndividual.update({
        where: { id: concessao.id },
        data: { revogadaEm: new Date(), revogadaPor: ator.contaId },
      });
      await registrarAuditoria(tx, {
        acao: "permissao_individual.revogar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: concessao.colaboradorId },
        origemPermissao: origem,
        detalhe: { permissao: concessao.permissao },
      });
    });
  });
}

/** Gera novo código de ativação para quem tem perfil de TI e ainda não ativou. */
export async function gerarNovoCodigoAtivacao(ator: Ator, entrada: { colaboradorId: string }) {
  return executarCasoDeUso(ator, async () =>
    prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, entrada.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "perfil.atribuir", alvo);
      const pessoa = await tx.colaborador.findUniqueOrThrow({
        where: { id: alvo.colaboradorId },
        include: { conta: true },
      });
      if (!pessoa.conta || !alvo.temPerfilTiAtivo) throw new ErroNegocio("A pessoa não tem perfil de TI.");
      await reiniciarAtivacaoTi(tx, pessoa.conta.id);
      const { codigo, expiraEm } = await gerarCodigoAtivacao(tx, pessoa.conta.id, ator.contaId);
      await registrarAuditoria(tx, {
        acao: "conta_acesso.gerar_codigo_ativacao",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
      });
      return { codigoAtivacao: codigo, expiraEm, nome: pessoa.nome };
    }),
  );
}
