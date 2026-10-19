"use client";

import { useState } from "react";
import type { PermissoesAlocacao } from "@/components/alocacoes/dialogo-detalhes-alocacao";
import type { Parametros } from "@/components/comum/tabela";
import { DialogoAlocacao } from "@/components/empresas/registros/dialogo-alocacao";
import { TabelaAlocacoes } from "@/components/empresas/registros/tabelas-registros";
import type { AlocacaoEmpresa } from "@/server/modulos/empresa-registros";

/** Tabela da aba Alocações com o modal de detalhes; fechar mantém filtros, página e rolagem. */
export function AlocacoesComDetalhes({
  itens,
  empresaId,
  ordenacao,
  pode,
}: {
  itens: AlocacaoEmpresa[];
  empresaId: string;
  ordenacao: { base: string; parametros: Parametros };
  pode: PermissoesAlocacao;
}) {
  const [selecionada, setSelecionada] = useState<AlocacaoEmpresa | null>(null);
  return (
    <>
      <TabelaAlocacoes
        itens={itens}
        empresaId={empresaId}
        ordenacao={ordenacao}
        aoVer={(id) => setSelecionada(itens.find((a) => a.id === id) ?? null)}
      />
      <DialogoAlocacao alocacao={selecionada} pode={pode} aoFechar={() => setSelecionada(null)} />
    </>
  );
}
