import { obterConfiguracao, type Configuracao } from "@/server/config";
import type { CenarioSimulacao } from "./core/tipos";
import { criarConectorM365Simulado } from "./microsoft-365/simulado";
import type { ConectorMicrosoft365 } from "./microsoft-365/tipos";
import { criarConectorTeamsSimulado } from "./teams/simulado";
import type { ConectorTeams } from "./teams/tipos";

export type Conectores = { microsoft365: ConectorMicrosoft365; teams: ConectorTeams };

/**
 * Único ponto de criação de conectores. Qualquer modo diferente de SIMULACAO é
 * recusado (não existe conector real no código, então não há fallback possível).
 * A validação da configuração já impede MODO_INTEGRACOES diferente de SIMULACAO.
 */
export function obterConectores(
  config: Pick<Configuracao, "MODO_INTEGRACOES"> = obterConfiguracao(),
  cenario: CenarioSimulacao = "NORMAL",
): Conectores {
  if (config.MODO_INTEGRACOES !== "SIMULACAO") {
    throw new Error("Conectores reais não estão disponíveis nesta etapa: somente SIMULACAO.");
  }
  return {
    microsoft365: criarConectorM365Simulado({ cenario }),
    teams: criarConectorTeamsSimulado({ cenario }),
  };
}
