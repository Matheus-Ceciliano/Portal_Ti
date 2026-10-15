import type { ModoConector, ResultadoConector, SaudeConector } from "../core/tipos";

export type EquipeTeams = { id: string; nome: string; membros: number; canais: number };

export interface ConectorTeams {
  readonly sistema: "Microsoft Teams";
  readonly modo: ModoConector;
  listarEquipes(): Promise<ResultadoConector<EquipeTeams[]>>;
  adicionarMembro(equipeId: string, objectId: string): Promise<ResultadoConector<{ equipeId: string }>>;
  verificarSaude(): Promise<SaudeConector>;
}
