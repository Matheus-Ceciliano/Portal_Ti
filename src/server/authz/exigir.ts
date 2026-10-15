import { registrarAuditoria } from "@/server/auditoria";
import { prisma } from "@/server/db";
import type { Ator } from "./ator";
import { permissaoEfetiva, type AlvoAutorizacao, type Escopo } from "./avaliar";
import type { Permissao } from "./catalogo";

export class ErroAutorizacao extends Error {
  constructor(
    readonly permissao: Permissao | string,
    readonly origem: string,
    readonly alvoId?: string,
  ) {
    super("Você não tem permissão para esta operação.");
    this.name = "ErroAutorizacao";
  }
}

/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroNegocio";
  }
}

/**
 * Barreira obrigatória de todo caso de uso (ARQUITETURA_TECNICA.md §10). Lança
 * ErroAutorizacao; a negativa é auditada por executarCasoDeUso, fora de qualquer
 * transação (para não ser desfeita pelo rollback).
 */
export function exigirPermissao(
  ator: Ator,
  permissao: Permissao,
  alvo?: AlvoAutorizacao,
): { origem: string; escopo: Escopo } {
  const resultado = permissaoEfetiva(ator, permissao, alvo);
  if (!resultado.permitido) throw new ErroAutorizacao(permissao, resultado.origem, alvo?.colaboradorId);
  return resultado;
}

/** Executa um caso de uso e audita negações de autorização. */
export async function executarCasoDeUso<T>(ator: Ator, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroAutorizacao) {
      await registrarAuditoria(prisma, {
        acao: erro.permissao,
        resultado: "NEGADO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: erro.alvoId ? { tipo: "colaborador", id: erro.alvoId } : undefined,
        origemPermissao: erro.origem,
      });
    }
    throw erro;
  }
}

/** Só para decidir o que exibir; a proteção real é exigirPermissao no servidor. */
export function pode(ator: Ator, permissao: Permissao, alvo?: AlvoAutorizacao): boolean {
  return permissaoEfetiva(ator, permissao, alvo).permitido;
}

export function podeComEscopoGrupo(ator: Ator, permissao: Permissao): boolean {
  const r = permissaoEfetiva(ator, permissao);
  return r.permitido && r.escopo === "GRUPO";
}

/** Mensagem segura para a interface a partir de um erro de caso de uso. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroAutorizacao || erro instanceof ErroNegocio) return erro.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}
