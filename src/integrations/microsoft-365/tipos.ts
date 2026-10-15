import type { ModoConector, ResultadoConector, SaudeConector } from "../core/tipos";

export type LicencaM365 = {
  sku: string;
  nome: string;
  total: number;
  consumidas: number;
};

export type NovoUsuarioM365 = {
  nomeExibicao: string;
  upn: string;
  /** Usada só na chamada; nunca é persistida, registrada ou devolvida. */
  senhaInicial: string;
  /** Marcador do portal para reconciliação sem senha (Q-23). */
  marcadorPortal: string;
};

export type UsuarioM365 = { objectId: string; upn: string; nomeExibicao: string };

export type EstadoReconciliacao = "JA_APLICADO" | "NAO_APLICADO" | "CONFLITO";

export interface ConectorMicrosoft365 {
  readonly sistema: "Microsoft 365";
  readonly modo: ModoConector;
  criarUsuario(entrada: NovoUsuarioM365): Promise<ResultadoConector<UsuarioM365>>;
  atribuirLicenca(objectId: string, sku: string): Promise<ResultadoConector<{ sku: string }>>;
  listarLicencas(): Promise<ResultadoConector<LicencaM365[]>>;
  verificarEstado(marcadorPortal: string): Promise<ResultadoConector<EstadoReconciliacao>>;
  verificarSaude(): Promise<SaudeConector>;
}
