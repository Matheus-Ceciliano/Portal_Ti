import { ESTADOS } from "@/components/comum/status-badge";

/** Opções e textos compartilhados entre o modal e a página completa da empresa. */

export const OPCOES_SITUACAO_COLABORADOR = Object.entries(ESTADOS.colaborador).map(([valor, d]) => ({ valor, rotulo: d.rotulo }));
export const OPCOES_SITUACAO_ATIVO = Object.entries(ESTADOS.ativo).map(([valor, d]) => ({ valor, rotulo: d.rotulo }));
export const OPCOES_SITUACAO_ALOCACAO = [
  { valor: "ENTREGUE", rotulo: "Com o colaborador" },
  { valor: "RESERVA", rotulo: "Reserva" },
  { valor: "ENCERRADA", rotulo: "Encerrada" },
];
/** Enquanto a TI não define uma visão consolidada, as duas leituras ficam explícitas. */
export const OPCOES_VINCULO = [
  { valor: "PROPRIETARIA", rotulo: "Equipamento da empresa" },
  { valor: "COLABORADOR", rotulo: "Colaborador da empresa" },
];
export const OPCOES_PERIODO = [
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "365", rotulo: "Últimos 12 meses" },
];

export const PLACEHOLDER = {
  colaboradores: "Pesquisar por nome, e-mail ou cargo",
  equipamentos: "Pesquisar por patrimônio, modelo, série ou responsável",
  alocacoes: "Pesquisar por número, equipamento, patrimônio ou colaborador",
};

export const VAZIO = {
  colaboradores: { titulo: "Nenhum colaborador", descricao: "Ainda não há pessoas cadastradas nesta empresa." },
  equipamentos: { titulo: "Nenhum equipamento", descricao: "Não há equipamentos desta empresa no inventário." },
  alocacoes: { titulo: "Nenhuma alocação", descricao: "Entregas de equipamentos da empresa ou a colaboradores dela aparecem aqui." },
};

export const contagem = (mostrando: number, total: number, totalEmpresa: number, nome: [string, string]) =>
  total === totalEmpresa
    ? `${totalEmpresa} ${totalEmpresa === 1 ? nome[0] : nome[1]}${mostrando < total ? ` · mostrando ${mostrando}` : ""}`
    : `${total} de ${totalEmpresa} ${totalEmpresa === 1 ? nome[0] : nome[1]}${mostrando < total ? ` · mostrando ${mostrando}` : ""}`;
