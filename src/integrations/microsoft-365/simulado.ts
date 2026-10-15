import { idSimulado, responderSimulado } from "../core/simulacao";
import type { CenarioSimulacao } from "../core/tipos";
import type { ConectorMicrosoft365, LicencaM365 } from "./tipos";

const LICENCAS: LicencaM365[] = [
  { sku: "SIM_BUSINESS_BASIC", nome: "Microsoft 365 Business Basic (simulado)", total: 120, consumidas: 87 },
  { sku: "SIM_BUSINESS_STANDARD", nome: "Microsoft 365 Business Standard (simulado)", total: 60, consumidas: 58 },
  { sku: "SIM_E3", nome: "Microsoft 365 E3 (simulado)", total: 15, consumidas: 9 },
];

/**
 * Conector Microsoft 365 em modo SIMULACAO. Não importa SDK, não lê credenciais e não
 * faz nenhuma chamada de rede. A senha recebida em criarUsuario é descartada.
 * Cenário de erro: UPN iniciado por "simular-falha." (indisponível) ou "simular-conflito." (conflito).
 */
export function criarConectorM365Simulado(opcoes: { cenario?: CenarioSimulacao } = {}): ConectorMicrosoft365 {
  const criados = new Map<string, string>();
  const cenarioPorUpn = (upn: string): CenarioSimulacao =>
    upn.startsWith("simular-falha.")
      ? "INDISPONIVEL"
      : upn.startsWith("simular-conflito.")
        ? "CONFLITO"
        : (opcoes.cenario ?? "NORMAL");

  return {
    sistema: "Microsoft 365",
    modo: "SIMULACAO",
    async criarUsuario({ nomeExibicao, upn, marcadorPortal }) {
      return responderSimulado(cenarioPorUpn(upn), () => {
        const objectId = idSimulado(`m365:${upn}`);
        criados.set(marcadorPortal, objectId);
        return { objectId, upn, nomeExibicao };
      });
    },
    async atribuirLicenca(_objectId, sku) {
      return responderSimulado(opcoes.cenario ?? "NORMAL", () => ({ sku }));
    },
    async listarLicencas() {
      return responderSimulado(opcoes.cenario ?? "NORMAL", () => LICENCAS.map((l) => ({ ...l })));
    },
    async verificarEstado(marcadorPortal) {
      return responderSimulado(opcoes.cenario ?? "NORMAL", () =>
        criados.has(marcadorPortal) ? "JA_APLICADO" : "NAO_APLICADO",
      );
    },
    async verificarSaude() {
      const indisponivel = opcoes.cenario && opcoes.cenario !== "NORMAL";
      return {
        sistema: "Microsoft 365",
        modo: "SIMULACAO",
        estado: indisponivel ? "INDISPONIVEL" : "OPERACIONAL",
        verificadoEm: new Date().toISOString(),
        detalhe: indisponivel
          ? "Falha simulada para teste de tratamento de erro."
          : "Adaptador simulado. Nenhuma chamada ao tenant.",
      };
    },
  };
}
