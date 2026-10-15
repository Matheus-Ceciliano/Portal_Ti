import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { obterConectores } from "@/integrations/fabrica";
import { registrarAuditoria } from "@/server/auditoria";
import { gerarHashSenha, validarPoliticaSenha } from "@/server/auth/senha";
import type { Ator } from "@/server/authz/ator";
import { carregarAlvo } from "@/server/authz/ator";
import { PERFIS_ADMINISTRATIVOS, type PerfilTi } from "@/server/authz/catalogo";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { garantirOutroAdministrador } from "./perfis";

export type FiltroPessoas = {
  busca?: string;
  empresaId?: string;
  situacao?: "ATIVO" | "PRE_CADASTRO" | "AFASTADO" | "DESLIGADO";
  ordenar?: "nome" | "empresa" | "criadoEm";
  direcao?: "asc" | "desc";
  pagina?: number;
};

export const POR_PAGINA = 10;

export async function listarPessoas(ator: Ator, filtro: FiltroPessoas) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (escopo !== "GRUPO") throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO");

    const busca = filtro.busca?.trim();
    const where: Prisma.ColaboradorWhereInput = {
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { emailCorporativo: { contains: busca, mode: "insensitive" } },
              { cargo: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filtro.empresaId ? { empresaId: filtro.empresaId } : {}),
      ...(filtro.situacao ? { situacao: filtro.situacao } : {}),
    };
    const direcao = filtro.direcao ?? "asc";
    const orderBy: Prisma.ColaboradorOrderByWithRelationInput =
      filtro.ordenar === "empresa"
        ? { empresa: { nome: direcao } }
        : filtro.ordenar === "criadoEm"
          ? { criadoEm: direcao }
          : { nome: direcao };
    const pagina = Math.max(1, filtro.pagina ?? 1);

    const [total, linhas] = await Promise.all([
      prisma.colaborador.count({ where }),
      prisma.colaborador.findMany({
        where,
        orderBy,
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        include: {
          empresa: { select: { nome: true, sigla: true } },
          conta: { select: { situacao: true, senhaPessoalDefinidaEm: true } },
          perfis: { where: { revogadoEm: null }, select: { perfil: true } },
        },
      }),
    ]);

    return {
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      linhas: linhas.map((c) => ({
        id: c.id,
        nome: c.nome,
        email: c.emailCorporativo,
        cargo: c.cargo,
        empresa: c.empresa.nome,
        empresaSigla: c.empresa.sigla,
        situacao: c.situacao,
        conta: c.conta
          ? { situacao: c.conta.situacao, ativada: Boolean(c.conta.senhaPessoalDefinidaEm) }
          : null,
        perfis: c.perfis.map((p) => p.perfil as PerfilTi),
      })),
    };
  });
}

/** Ficha de uma pessoa. Com escopo PROPRIO, só a própria ficha (isolamento entre colaboradores). */
export async function obterPessoa(ator: Ator, colaboradorId: string) {
  return executarCasoDeUso(ator, async () => {
    const { escopo } = exigirPermissao(ator, "colaborador.ver");
    if (escopo === "PROPRIO" && colaboradorId !== ator.colaboradorId) {
      throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO", colaboradorId);
    }
    const c = await prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      include: {
        empresa: true,
        conta: {
          select: {
            id: true,
            situacao: true,
            senhaPessoalDefinidaEm: true,
            ativacaoTiConcluidaEm: true,
            twoFactorEnabled: true,
            ultimoAcessoEm: true,
            createdAt: true,
          },
        },
        perfis: { where: { revogadoEm: null } },
        permissoesIndividuais: { where: { revogadaEm: null } },
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      nome: c.nome,
      email: c.emailCorporativo,
      cargo: c.cargo,
      departamento: c.departamento,
      empresa: c.empresa.nome,
      situacao: c.situacao,
      criadoEm: c.criadoEm,
      identidadeMicrosoftVinculada: Boolean(c.entraObjectId),
      conta: c.conta,
      perfis: c.perfis.map((p) => p.perfil as PerfilTi),
      permissoes: c.permissoesIndividuais.map((p) => ({ permissao: p.permissao, validaAte: p.validaAte })),
      temPerfilTi: c.perfis.length > 0,
    };
  });
}

export type EntradaCadastro = {
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
  empresaId: string;
  senhaInicial: string;
  criarContaMicrosoft: boolean;
};

export type ResultadoCadastro = {
  colaboradorId: string;
  microsoft365?: { ok: boolean; mensagem: string; simulado: true };
};

/**
 * Cadastro com senha inicial definida pela TI (DT-02) e provisionamento sem aprovação
 * (DT-03), mas com permissão verificada no servidor. A conta nasce exigindo ativação:
 * a senha inicial só abre /conta/ativar. A criação no Microsoft 365 é SIMULADA.
 */
export async function cadastrarPessoa(ator: Ator, entrada: EntradaCadastro): Promise<ResultadoCadastro> {
  return executarCasoDeUso(ator, async () => {
    const novoId = randomUUID();
    const alvoNovo = { colaboradorId: novoId, temPerfilTiAtivo: false };
    const origemCriar = exigirPermissao(ator, "colaborador.criar").origem;
    exigirPermissao(ator, "conta_acesso.criar", alvoNovo);
    const origemProvisionar = entrada.criarContaMicrosoft
      ? exigirPermissao(ator, "provisionamento.executar", alvoNovo).origem
      : null;

    const email = entrada.email.trim().toLowerCase();
    const problema = validarPoliticaSenha(entrada.senhaInicial, email);
    if (problema) throw new ErroNegocio(problema);
    const empresa = await prisma.empresa.findUnique({ where: { id: entrada.empresaId } });
    if (!empresa || !empresa.ativa) throw new ErroNegocio("Selecione uma empresa ativa.");
    const duplicado = await prisma.colaborador.findUnique({ where: { emailCorporativo: email }, select: { id: true } });
    const contaDuplicada = await prisma.contaAcesso.findUnique({ where: { email }, select: { id: true } });
    if (duplicado || contaDuplicada) throw new ErroNegocio("Já existe uma pessoa com esse e-mail corporativo.");

    const hashSenha = await gerarHashSenha(entrada.senhaInicial);
    const contaId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.colaborador.create({
        data: {
          id: novoId,
          nome: entrada.nome.trim(),
          emailCorporativo: email,
          cargo: entrada.cargo.trim(),
          departamento: entrada.departamento.trim(),
          empresaId: empresa.id,
          situacao: "ATIVO",
        },
      });
      await tx.contaAcesso.create({
        data: {
          id: contaId,
          name: entrada.nome.trim(),
          email,
          colaboradorId: novoId,
          credenciais: {
            create: { id: randomUUID(), accountId: contaId, providerId: "credential", password: hashSenha },
          },
        },
      });
      await registrarAuditoria(tx, {
        acao: "colaborador.criar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: novoId, descricao: entrada.nome.trim() },
        origemPermissao: origemCriar,
        detalhe: { empresa: empresa.sigla, contaAcessoCriada: true },
      });
    });

    if (!entrada.criarContaMicrosoft) return { colaboradorId: novoId };

    // Chamada única, sem retentativa automática; a senha vai só como parâmetro (§11.4).
    const { microsoft365 } = obterConectores();
    const resultado = await microsoft365.criarUsuario({
      nomeExibicao: entrada.nome.trim(),
      upn: email,
      senhaInicial: entrada.senhaInicial,
      marcadorPortal: novoId.replace(/-/g, "").slice(0, 16),
    });
    await registrarAuditoria(prisma, {
      acao: "provisionamento.executar",
      resultado: resultado.ok ? "SUCESSO" : "FALHA",
      ator: { contaId: ator.contaId, nome: ator.nome },
      alvo: { tipo: "colaborador", id: novoId, descricao: entrada.nome.trim() },
      origemPermissao: origemProvisionar ?? undefined,
      simulado: true,
      detalhe: {
        sistema: "Microsoft 365",
        operacao: "m365.criar_conta",
        correlacaoId: resultado.correlacaoId,
        erro: resultado.ok ? null : resultado.erro.codigo,
      },
    });
    // Modo simulação nunca grava entra_object_id (ARQUITETURA_TECNICA.md §11.4, item 11).
    return {
      colaboradorId: novoId,
      microsoft365: {
        ok: resultado.ok,
        simulado: true,
        mensagem: resultado.ok
          ? "Conta Microsoft 365 criada em modo de simulação (nenhuma conta real foi criada)."
          : `Falha simulada: ${resultado.erro.mensagem}`,
      },
    };
  });
}

/** Criação (simulada) da conta Microsoft 365 para uma pessoa já cadastrada. */
export async function provisionarContaMicrosoft(
  ator: Ator,
  entrada: { colaboradorId: string; senhaMicrosoft: string },
) {
  return executarCasoDeUso(ator, async () => {
    const alvo = await carregarAlvo(prisma, entrada.colaboradorId, { bloquear: false });
    if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
    const { origem } = exigirPermissao(ator, "provisionamento.executar", alvo);
    const pessoa = await prisma.colaborador.findUniqueOrThrow({ where: { id: alvo.colaboradorId } });
    const problema = validarPoliticaSenha(entrada.senhaMicrosoft, pessoa.emailCorporativo);
    if (problema) throw new ErroNegocio(problema);
    const { microsoft365 } = obterConectores();
    const resultado = await microsoft365.criarUsuario({
      nomeExibicao: pessoa.nome,
      upn: pessoa.emailCorporativo,
      senhaInicial: entrada.senhaMicrosoft,
      marcadorPortal: pessoa.id.replace(/-/g, "").slice(0, 16),
    });
    await registrarAuditoria(prisma, {
      acao: "provisionamento.executar",
      resultado: resultado.ok ? "SUCESSO" : "FALHA",
      ator: { contaId: ator.contaId, nome: ator.nome },
      alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
      origemPermissao: origem,
      simulado: true,
      detalhe: { sistema: "Microsoft 365", operacao: "m365.criar_conta", correlacaoId: resultado.correlacaoId },
    });
    return resultado.ok
      ? { ok: true as const, mensagem: "Conta Microsoft 365 criada em modo de simulação." }
      : { ok: false as const, mensagem: `Falha simulada: ${resultado.erro.mensagem}` };
  });
}

/** Redefinição de senha pela TI: a conta volta a exigir ativação pelo titular. */
export async function redefinirSenhaPelaTi(ator: Ator, entrada: { colaboradorId: string; novaSenha: string }) {
  return executarCasoDeUso(ator, async () => {
    const pessoa = await prisma.colaborador.findUnique({
      where: { id: entrada.colaboradorId },
      include: { conta: { include: { credenciais: { where: { providerId: "credential" } } } } },
    });
    if (!pessoa?.conta) throw new ErroNegocio("A pessoa não tem conta de acesso.");
    // Verificação prévia (sem bloqueio); repetida dentro da transação com SELECT … FOR UPDATE.
    const alvoPrevio = await carregarAlvo(prisma, pessoa.id, { bloquear: false });
    exigirPermissao(ator, "conta_acesso.redefinir_senha", alvoPrevio ?? undefined);
    const problema = validarPoliticaSenha(entrada.novaSenha, pessoa.emailCorporativo);
    if (problema) throw new ErroNegocio(problema);
    const hashSenha = await gerarHashSenha(entrada.novaSenha);

    await prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, pessoa.id, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, "conta_acesso.redefinir_senha", alvo);
      const conta = pessoa.conta!;
      await tx.credencialConta.update({ where: { id: conta.credenciais[0].id }, data: { password: hashSenha } });
      await tx.contaAcesso.update({ where: { id: conta.id }, data: { senhaPessoalDefinidaEm: null } });
      await tx.sessao.deleteMany({ where: { userId: conta.id } });
      await registrarAuditoria(tx, {
        acao: "conta_acesso.redefinir_senha",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
        detalhe: { sessoesRevogadas: true, exigeNovaAtivacao: true },
      });
    });
  });
}

export async function alterarBloqueioConta(
  ator: Ator,
  entrada: { colaboradorId: string; bloquear: boolean },
) {
  return executarCasoDeUso(ator, async () => {
    const permissao = entrada.bloquear ? "conta_acesso.bloquear" : "conta_acesso.desbloquear";
    await prisma.$transaction(async (tx) => {
      const alvo = await carregarAlvo(tx, entrada.colaboradorId, { bloquear: true });
      if (!alvo) throw new ErroNegocio("Pessoa não encontrada.");
      const { origem } = exigirPermissao(ator, permissao, alvo);
      const pessoa = await tx.colaborador.findUniqueOrThrow({
        where: { id: alvo.colaboradorId },
        include: { conta: true, perfis: { where: { revogadoEm: null } } },
      });
      if (!pessoa.conta || pessoa.conta.situacao === "DESATIVADA") {
        throw new ErroNegocio("A pessoa não tem conta de acesso ativa ou bloqueada.");
      }
      if (entrada.bloquear) {
        if (pessoa.perfis.some((p) => PERFIS_ADMINISTRATIVOS.includes(p.perfil as PerfilTi))) {
          await garantirOutroAdministrador(tx, pessoa.id);
        }
        await tx.sessao.deleteMany({ where: { userId: pessoa.conta.id } });
      }
      await tx.contaAcesso.update({
        where: { id: pessoa.conta.id },
        data: { situacao: entrada.bloquear ? "BLOQUEADA" : "ATIVA" },
      });
      await registrarAuditoria(tx, {
        acao: permissao,
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "colaborador", id: pessoa.id, descricao: pessoa.nome },
        origemPermissao: origem,
      });
    });
  });
}

export async function listarEmpresas(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "empresa.ver");
    const empresas = await prisma.empresa.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { colaboradores: { where: { situacao: "ATIVO" } } } } },
    });
    return empresas.map((e) => ({
      id: e.id,
      nome: e.nome,
      sigla: e.sigla,
      cnpj: e.cnpj,
      cidade: e.cidade,
      ativa: e.ativa,
      pessoasAtivas: e._count.colaboradores,
    }));
  });
}
