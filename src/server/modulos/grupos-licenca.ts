import { FORMATO_DOMINIO } from "@/lib/identificadores";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode, podeComEscopoGrupo } from "@/server/authz/exigir";
import { prisma } from "@/server/db";

/**
 * Catálogo local de grupos de licença Microsoft (planilha IAM - CAT). Cada grupo define os
 * domínios usados no cálculo do login Microsoft e do e-mail. É configuração do portal: não
 * comprova licença atribuída nem domínio verificado no tenant (nenhuma consulta ao M365).
 */

export type GrupoLicencaItem = {
  id: string;
  nome: string;
  dominioLogin: string;
  dominioEmail: string;
  ativo: boolean;
  pessoas: number;
};

/** Quem cadastra ou consulta pessoas usa o catálogo; quem gerencia catálogos também. */
export async function listarGruposLicenca(ator: Ator, opcoes: { incluirInativos?: boolean } = {}): Promise<GrupoLicencaItem[]> {
  return executarCasoDeUso(ator, async () => {
    if (!podeComEscopoGrupo(ator, "colaborador.ver") && !pode(ator, "catalogo.gerenciar")) {
      throw new ErroAutorizacao("colaborador.ver", "ESCOPO_PROPRIO");
    }
    const grupos = await prisma.grupoLicenca.findMany({
      where: opcoes.incluirInativos ? {} : { ativo: true },
      orderBy: { nome: "asc" },
      include: { _count: { select: { colaboradores: true } } },
    });
    return grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      dominioLogin: g.dominioLogin,
      dominioEmail: g.dominioEmail,
      ativo: g.ativo,
      pessoas: g._count.colaboradores,
    }));
  });
}

export type DadosGrupoLicenca = { nome: string; dominioLogin: string; dominioEmail: string; ativo: boolean };

/**
 * Inclusão ou edição (com id). Mudar domínios não renomeia logins já atribuídos: eles só
 * mudam por edição explícita da pessoa. Grupo em uso não é excluído, só inativado.
 */
export async function salvarGrupoLicenca(ator: Ator, entrada: { id?: string; dados: DadosGrupoLicenca }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "catalogo.gerenciar");
    const nome = entrada.dados.nome.trim().replace(/\s+/g, " ").toUpperCase();
    const dominioLogin = entrada.dados.dominioLogin.trim().toLowerCase();
    const dominioEmail = entrada.dados.dominioEmail.trim().toLowerCase();
    if (nome.length < 2 || nome.length > 60) throw new ErroNegocio("Informe o nome do grupo (2 a 60 caracteres).");
    if (!FORMATO_DOMINIO.test(dominioLogin)) throw new ErroNegocio("Domínio de login inválido.");
    if (!FORMATO_DOMINIO.test(dominioEmail)) throw new ErroNegocio("Domínio de e-mail inválido.");

    const conflito = await prisma.grupoLicenca.findFirst({
      where: { nome, ...(entrada.id ? { NOT: { id: entrada.id } } : {}) },
      select: { id: true },
    });
    if (conflito) throw new ErroNegocio("Já existe um grupo com esse nome.");

    return prisma.$transaction(async (tx) => {
      const anterior = entrada.id ? await tx.grupoLicenca.findUnique({ where: { id: entrada.id } }) : null;
      if (entrada.id && !anterior) throw new ErroNegocio("Grupo não encontrado.");
      const dados = { nome, dominioLogin, dominioEmail, ativo: entrada.dados.ativo };
      const salvo = entrada.id
        ? await tx.grupoLicenca.update({ where: { id: entrada.id }, data: dados })
        : await tx.grupoLicenca.create({ data: dados });
      await registrarAuditoria(tx, {
        acao: entrada.id ? "catalogo.grupo_licenca.editar" : "catalogo.grupo_licenca.criar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "grupo_licenca", id: salvo.id, descricao: salvo.nome },
        origemPermissao: origem,
        detalhe: { dominioLogin, dominioEmail, ativo: salvo.ativo, ativoAntes: anterior?.ativo ?? null },
      });
      return { id: salvo.id, nome: salvo.nome };
    });
  });
}
