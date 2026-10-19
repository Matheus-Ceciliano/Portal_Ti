import type { Prisma } from "@/generated/prisma/client";
import { normalizarCnpj, problemaCnpj } from "@/lib/cnpj";
import { registrarAuditoria } from "@/server/auditoria";
import { armazenamentoDisponivel, novaChave, obterArmazenamento, validarLogo } from "@/server/armazenamento";
import type { Ator } from "@/server/authz/ator";
import { ErroNegocio, executarCasoDeUso, exigirPermissao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";

export type EmpresaResumo = {
  id: string;
  nome: string;
  sigla: string;
  cnpj: string;
  cidade: string;
  ativa: boolean;
  responsavel: string | null;
  /** Nome curto usado na senha inicial de ativação (não é a sigla). */
  nomeCurtoSenha: string | null;
  observacoes: string | null;
  pessoasAtivas: number;
  /** URL versionada do logotipo (rota autorizada), ou null. */
  logoUrl: string | null;
};

const urlLogo = (e: { id: string; logoChave: string | null; atualizadoEm: Date }) =>
  e.logoChave ? `/api/empresas/${e.id}/logo?v=${e.atualizadoEm.getTime()}` : null;

/** Pessoas ativas: colaboradores da empresa com situação ATIVO (regra do cadastro). */
export async function listarEmpresas(ator: Ator): Promise<EmpresaResumo[]> {
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
      responsavel: e.responsavel,
      nomeCurtoSenha: e.nomeCurtoSenha,
      observacoes: e.observacoes,
      pessoasAtivas: e._count.colaboradores,
      logoUrl: urlLogo(e),
    }));
  });
}

export type DadosEmpresa = {
  nome: string;
  sigla: string;
  cnpj: string;
  cidade: string;
  responsavel?: string;
  nomeCurtoSenha?: string;
  ativa: boolean;
  observacoes?: string;
};

/** Cadastro (sem id) ou edição (com id). A validação do CNPJ é refeita aqui, no servidor. */
export async function salvarEmpresa(
  ator: Ator,
  entrada: { id?: string; dados: DadosEmpresa; logo?: Buffer | null; removerLogo?: boolean },
) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "empresa.gerenciar");
    const problema = problemaCnpj(entrada.dados.cnpj);
    if (problema) throw new ErroNegocio(problema);
    const cnpj = normalizarCnpj(entrada.dados.cnpj);
    const sigla = entrada.dados.sigla.trim().toUpperCase();
    const nome = entrada.dados.nome.trim();

    const conflito = await prisma.empresa.findFirst({
      where: { OR: [{ cnpj }, { nome }, { sigla }], ...(entrada.id ? { NOT: { id: entrada.id } } : {}) },
      select: { cnpj: true, nome: true, sigla: true },
    });
    if (conflito?.cnpj === cnpj) throw new ErroNegocio("Já existe uma empresa com esse CNPJ.");
    if (conflito?.nome === nome) throw new ErroNegocio("Já existe uma empresa com essa razão social.");
    if (conflito) throw new ErroNegocio("Já existe uma empresa com essa sigla.");

    const anterior = entrada.id ? await prisma.empresa.findUnique({ where: { id: entrada.id } }) : null;
    if (entrada.id && !anterior) throw new ErroNegocio("Empresa não encontrada.");

    // Logotipo: validado pelo conteúdo, gravado com nome aleatório antes da transação.
    let logo: { chave: string; tipo: string } | null = null;
    if (entrada.logo && entrada.logo.length > 0) {
      const imagem = validarLogo(entrada.logo);
      const chave = novaChave("empresas", imagem.extensao);
      await obterArmazenamento().salvar(chave, entrada.logo);
      logo = { chave, tipo: imagem.tipo };
    }

    const dados: Prisma.EmpresaUncheckedCreateInput = {
      nome,
      sigla,
      cnpj,
      cidade: entrada.dados.cidade.trim(),
      ativa: entrada.dados.ativa,
      responsavel: entrada.dados.responsavel?.trim() || null,
      nomeCurtoSenha: entrada.dados.nomeCurtoSenha?.trim() || null,
      observacoes: entrada.dados.observacoes?.trim() || null,
      ...(logo ? { logoChave: logo.chave, logoTipo: logo.tipo } : {}),
      ...(!logo && entrada.removerLogo ? { logoChave: null, logoTipo: null } : {}),
    };

    try {
      const salva = await prisma.$transaction(async (tx) => {
        const empresa = entrada.id
          ? await tx.empresa.update({ where: { id: entrada.id }, data: dados })
          : await tx.empresa.create({ data: dados });
        await registrarAuditoria(tx, {
          acao: entrada.id ? "empresa.editar" : "empresa.criar",
          resultado: "SUCESSO",
          ator: { contaId: ator.contaId, nome: ator.nome },
          alvo: { tipo: "empresa", id: empresa.id, descricao: empresa.nome },
          origemPermissao: origem,
          detalhe: {
            sigla,
            ativa: empresa.ativa,
            logoEnviado: Boolean(logo),
            logoRemovido: Boolean(!logo && entrada.removerLogo && anterior?.logoChave),
          },
        });
        return empresa;
      });
      // Logotipo substituído ou removido: o arquivo anterior deixa de existir.
      if (anterior?.logoChave && anterior.logoChave !== salva.logoChave) {
        await obterArmazenamento().remover(anterior.logoChave).catch(() => undefined);
      }
      return { id: salva.id, nome: salva.nome };
    } catch (erro) {
      if (logo) await obterArmazenamento().remover(logo.chave).catch(() => undefined);
      throw erro;
    }
  });
}

/** Logotipo para a rota autorizada /api/empresas/[id]/logo. */
export async function lerLogoEmpresa(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "empresa.ver");
    const empresa = await prisma.empresa.findUnique({ where: { id }, select: { logoChave: true, logoTipo: true } });
    if (!empresa?.logoChave || !empresa.logoTipo || !armazenamentoDisponivel()) return null;
    const dados = await obterArmazenamento().ler(empresa.logoChave);
    return dados ? { dados, tipo: empresa.logoTipo } : null;
  });
}

export { armazenamentoDisponivel };
