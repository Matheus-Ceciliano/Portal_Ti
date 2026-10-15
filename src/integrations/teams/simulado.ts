import { responderSimulado } from "../core/simulacao";
import type { CenarioSimulacao } from "../core/tipos";
import type { ConectorTeams, EquipeTeams } from "./tipos";

const EQUIPES: EquipeTeams[] = [
  { id: "sim-equipe-obras-norte", nome: "Obras Região Norte (simulado)", membros: 42, canais: 6 },
  { id: "sim-equipe-administrativo", nome: "Administrativo (simulado)", membros: 18, canais: 4 },
  { id: "sim-equipe-ti", nome: "Equipe de TI (simulado)", membros: 7, canais: 5 },
  { id: "sim-equipe-suprimentos", nome: "Suprimentos (simulado)", membros: 11, canais: 3 },
];

/** Conector Teams em modo SIMULACAO: dados fictícios, sem rede, sem credenciais. */
export function criarConectorTeamsSimulado(opcoes: { cenario?: CenarioSimulacao } = {}): ConectorTeams {
  const cenario = opcoes.cenario ?? "NORMAL";
  return {
    sistema: "Microsoft Teams",
    modo: "SIMULACAO",
    async listarEquipes() {
      return responderSimulado(cenario, () => EQUIPES.map((e) => ({ ...e })));
    },
    async adicionarMembro(equipeId) {
      return responderSimulado(cenario, () => ({ equipeId }));
    },
    async verificarSaude() {
      return {
        sistema: "Microsoft Teams",
        modo: "SIMULACAO",
        estado: cenario === "NORMAL" ? "OPERACIONAL" : "INDISPONIVEL",
        verificadoEm: new Date().toISOString(),
        detalhe:
          cenario === "NORMAL"
            ? "Adaptador simulado. Nenhuma chamada ao tenant."
            : "Falha simulada para teste de tratamento de erro.",
      };
    },
  };
}
