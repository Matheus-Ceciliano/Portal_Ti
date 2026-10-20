import type { FichaEquipamento } from "@/server/modulos/inventario";
import { identificacao } from "../visual";
import type { EquipamentoTransferencia } from "./dialogos-transferencia";

/** O que os diálogos de transferência precisam da ficha (carregadores: só os vinculados). */
export function paraTransferencia(ficha: FichaEquipamento): EquipamentoTransferencia {
  return {
    id: ficha.id,
    rotulo: identificacao(ficha),
    descricao: `${ficha.rotuloTipo} · ${ficha.marca} ${ficha.modelo}`,
    empresa: ficha.empresa,
    responsavel: ficha.responsavel
      ? { id: ficha.responsavel.id, nome: ficha.responsavel.nome, alocacao: ficha.responsavel.alocacao, alocacaoId: ficha.responsavel.alocacaoId }
      : null,
    carregadores: ficha.carregadores.filter((c) => !c.desvinculadoEm).map((c) => ({ id: c.id, nome: c.nome, patrimonio: c.patrimonio, situacao: c.situacao })),
  };
}

/** Carregador ainda vinculado: transfere-se o notebook, nunca o carregador sozinho. */
export const carregadorVinculado = (ficha: FichaEquipamento) => ficha.categoria === "CARREGADOR" && Boolean(ficha.notebook) && !ficha.desvinculadoEm;
