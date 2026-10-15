import type { ClienteBanco } from "@/server/db";
import type { AlvoAutorizacao, AtorAutorizacao, EstadoAcesso } from "./avaliar";
import { PERFIS_TI, type PerfilTi } from "./catalogo";

export type Ator = AtorAutorizacao & {
  contaId: string;
  nome: string;
  email: string;
  cargo: string;
  empresa: string;
  /** Perfis de TI atribuídos e não revogados (podem ainda não valer, se a ativação estiver pendente). */
  perfisAtribuidos: PerfilTi[];
  mfaVerificado: boolean;
  visao: "OPERACIONAL" | "GERENCIAL";
};

export function calcularEstadoAcesso(
  conta: { senhaPessoalDefinidaEm: Date | null; ativacaoTiConcluidaEm: Date | null },
  perfisAtribuidos: readonly PerfilTi[],
): EstadoAcesso {
  if (!conta.senhaPessoalDefinidaEm) return "ATIVACAO_PENDENTE";
  if (perfisAtribuidos.length > 0 && !conta.ativacaoTiConcluidaEm) return "ATIVACAO_TI_PENDENTE";
  return "LIBERADO";
}

/**
 * Monta o ator a partir do banco a cada requisição (perfis e concessões nunca vêm do
 * cookie). Perfis de TI só valem com a ativação concluída e o segundo fator verificado.
 */
export async function carregarAtor(
  db: ClienteBanco,
  contaId: string,
  opcoes: { mfaVerificado: boolean },
): Promise<Ator | null> {
  const conta = await db.contaAcesso.findUnique({
    where: { id: contaId },
    include: {
      colaborador: {
        include: {
          empresa: { select: { nome: true } },
          perfis: { where: { revogadoEm: null }, select: { perfil: true } },
          permissoesIndividuais: {
            where: { revogadaEm: null },
            select: { id: true, permissao: true, validaAte: true },
          },
        },
      },
    },
  });
  if (!conta || conta.situacao !== "ATIVA" || conta.colaborador.situacao !== "ATIVO") return null;

  const perfisAtribuidos = PERFIS_TI.filter((p) =>
    conta.colaborador.perfis.some((a) => a.perfil === p),
  );
  const estadoAcesso = calcularEstadoAcesso(conta, perfisAtribuidos);
  const perfisValem = estadoAcesso === "LIBERADO" && opcoes.mfaVerificado;
  const perfisAtivos = perfisValem ? perfisAtribuidos : [];

  return {
    contaId: conta.id,
    colaboradorId: conta.colaboradorId,
    nome: conta.colaborador.nome,
    email: conta.email,
    cargo: conta.colaborador.cargo,
    empresa: conta.colaborador.empresa.nome,
    estadoAcesso,
    perfisAtribuidos,
    perfisAtivos,
    permissoesIndividuais: conta.colaborador.permissoesIndividuais,
    mfaVerificado: opcoes.mfaVerificado,
    visao:
      conta.visaoPainel ??
      (perfisAtribuidos.includes("GESTOR_ADM") ? "GERENCIAL" : "OPERACIONAL"),
  };
}

/**
 * Carrega o alvo de uma operação. Dentro de uma transação, use bloquear=true:
 * SELECT … FOR UPDATE na linha do colaborador evita que uma atribuição concorrente
 * de perfil escape da restrição dependente do alvo (§3.10).
 */
export async function carregarAlvo(
  db: ClienteBanco,
  colaboradorId: string,
  { bloquear }: { bloquear: boolean },
): Promise<AlvoAutorizacao | null> {
  if (bloquear) {
    const linhas = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM colaborador WHERE id = ${colaboradorId} FOR UPDATE`;
    if (linhas.length === 0) return null;
  }
  const colaborador = await db.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { id: true, perfis: { where: { revogadoEm: null }, select: { id: true } } },
  });
  if (!colaborador) return null;
  return { colaboradorId: colaborador.id, temPerfilTiAtivo: colaborador.perfis.length > 0 };
}
