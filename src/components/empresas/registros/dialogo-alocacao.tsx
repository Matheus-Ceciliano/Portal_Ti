"use client";

import { DialogoDetalhesAlocacao, type PermissoesAlocacao } from "@/components/alocacoes/dialogo-detalhes-alocacao";
import type { AlocacaoEmpresa } from "@/server/modulos/empresa-registros";

const ESTADO = { ENTREGUE: "ATIVA", RESERVA: "RESERVADA", ENCERRADA: "ENCERRADA" } as const;

/**
 * Detalhes de uma alocação a partir da aba Alocações da empresa: o mesmo modal do módulo de
 * Alocações, com o equipamento da linha destacado.
 */
export function DialogoAlocacao({
  alocacao,
  pode,
  aoFechar,
}: {
  alocacao: AlocacaoEmpresa | null;
  pode: PermissoesAlocacao;
  aoFechar: () => void;
}) {
  return (
    <DialogoDetalhesAlocacao
      inicial={alocacao ? { id: alocacao.alocacaoId, numero: alocacao.numero, colaborador: alocacao.responsavel, estado: ESTADO[alocacao.situacao] } : null}
      destacarAtivo={alocacao?.ativoId}
      pode={pode}
      aoFechar={aoFechar}
    />
  );
}
