import { describe, expect, it } from "vitest";
import { permissaoEfetiva, type AtorAutorizacao } from "@/server/authz/avaliar";
import {
  PERMISSOES_COLABORADOR,
  RESTRITAS_POR_ALVO,
  RESTRITAS_SEMPRE,
  TODAS_PERMISSOES,
  type PerfilTi,
} from "@/server/authz/catalogo";

const ator = (perfis: PerfilTi[], extra: Partial<AtorAutorizacao> = {}): AtorAutorizacao => ({
  colaboradorId: "ator",
  estadoAcesso: "LIBERADO",
  perfisAtivos: perfis,
  permissoesIndividuais: [],
  ...extra,
});
const alvoComum = { colaboradorId: "outra-pessoa", temPerfilTiAtivo: false };
const alvoTi = { colaboradorId: "membro-ti", temPerfilTiAtivo: true };
const amanha = new Date(Date.now() + 86_400_000);
const ontem = new Date(Date.now() - 86_400_000);

describe("equivalência Supervisor TI × Gestor ADM (DT-05)", () => {
  it("têm resultado idêntico para todas as permissões do catálogo, com e sem alvo", () => {
    for (const permissao of TODAS_PERMISSOES) {
      for (const alvo of [undefined, alvoComum, alvoTi]) {
        const s = permissaoEfetiva(ator(["SUPERVISOR_TI"]), permissao, alvo).permitido;
        const g = permissaoEfetiva(ator(["GESTOR_ADM"]), permissao, alvo).permitido;
        expect({ permissao, s }).toEqual({ permissao, s: g });
        expect(s).toBe(true);
      }
    }
  });
});

describe("restrições obrigatórias do Estagiário TI (DT-07)", () => {
  const estagiario = ator(["ESTAGIARIO_TI"]);

  it("nunca atribui perfis, concede permissões, altera segurança nem edita membros da TI", () => {
    for (const permissao of RESTRITAS_SEMPRE) {
      for (const alvo of [undefined, alvoComum, { colaboradorId: "ator", temPerfilTiAtivo: true }]) {
        expect(permissaoEfetiva(estagiario, permissao, alvo)).toEqual({
          permitido: false,
          origem: "RESTRICAO_OBRIGATORIA",
        });
      }
    }
  });

  it("concessão individual nunca contorna restrição obrigatória", () => {
    const comConcessaoIndevida = ator(["ESTAGIARIO_TI"], {
      permissoesIndividuais: [
        { id: "x1", permissao: "perfil.atribuir", validaAte: null },
        { id: "x2", permissao: "permissao_individual.gerenciar", validaAte: null },
        { id: "x3", permissao: "seguranca.configurar", validaAte: null },
      ],
    });
    expect(permissaoEfetiva(comConcessaoIndevida, "perfil.atribuir", { colaboradorId: "ator", temPerfilTiAtivo: true }).permitido).toBe(false);
    expect(permissaoEfetiva(comConcessaoIndevida, "permissao_individual.gerenciar", alvoComum).permitido).toBe(false);
    expect(permissaoEfetiva(comConcessaoIndevida, "seguranca.configurar").permitido).toBe(false);
  });

  it("não age sobre credenciais de membros da TI, mas age sobre colaboradores comuns", () => {
    for (const permissao of ["conta_acesso.redefinir_senha", "conta_acesso.bloquear", "conta_acesso.encerrar_sessoes", "conta_acesso.criar"] as const) {
      expect(permissaoEfetiva(estagiario, permissao, alvoTi).permitido).toBe(false);
      expect(permissaoEfetiva(estagiario, permissao, alvoComum).permitido).toBe(true);
    }
  });

  it("permissões dependentes do alvo falham fechadas quando o alvo não é informado", () => {
    for (const permissao of RESTRITAS_POR_ALVO) {
      expect(permissaoEfetiva(estagiario, permissao).permitido).toBe(false);
    }
  });
});

describe("provisionamento do Estagiário só com concessão individual (DT-07)", () => {
  it("sem concessão: negado", () => {
    expect(permissaoEfetiva(ator(["ESTAGIARIO_TI"]), "provisionamento.executar", alvoComum).permitido).toBe(false);
  });

  it("com concessão válida: permitido para colaborador comum, com origem individual", () => {
    const comConcessao = ator(["ESTAGIARIO_TI"], {
      permissoesIndividuais: [{ id: "c1", permissao: "provisionamento.executar", validaAte: amanha }],
    });
    expect(permissaoEfetiva(comConcessao, "provisionamento.executar", alvoComum)).toEqual({
      permitido: true,
      origem: "INDIVIDUAL:c1",
      escopo: "GRUPO",
    });
    // ...mas nunca para si mesmo nem para membro da TI (autoprovisionamento).
    expect(permissaoEfetiva(comConcessao, "provisionamento.executar", { colaboradorId: "ator", temPerfilTiAtivo: false }).permitido).toBe(false);
    expect(permissaoEfetiva(comConcessao, "provisionamento.executar", alvoTi).permitido).toBe(false);
  });

  it("concessão vencida não vale", () => {
    const vencida = ator(["ESTAGIARIO_TI"], {
      permissoesIndividuais: [{ id: "c1", permissao: "provisionamento.executar", validaAte: ontem }],
    });
    expect(permissaoEfetiva(vencida, "provisionamento.executar", alvoComum).permitido).toBe(false);
  });

  it("concessão sem perfil de TI ativo não vale", () => {
    const semPerfil = ator([], {
      permissoesIndividuais: [{ id: "c1", permissao: "provisionamento.executar", validaAte: amanha }],
    });
    expect(permissaoEfetiva(semPerfil, "provisionamento.executar", alvoComum).permitido).toBe(false);
  });
});

describe("ativação e perfil Colaborador", () => {
  it("conta com ativação pendente não recebe nenhuma permissão, mesmo com perfil administrativo", () => {
    for (const estadoAcesso of ["ATIVACAO_PENDENTE", "ATIVACAO_TI_PENDENTE"] as const) {
      const pendente = ator(["SUPERVISOR_TI"], { estadoAcesso });
      for (const permissao of TODAS_PERMISSOES) {
        expect(permissaoEfetiva(pendente, permissao, alvoComum).permitido).toBe(false);
      }
    }
  });

  it("administrador sem perfis ativos na sessão (sem MFA) é tratado como colaborador", () => {
    const semMfa = ator([]);
    expect(permissaoEfetiva(semMfa, "ti.acessar").permitido).toBe(false);
    expect(permissaoEfetiva(semMfa, "perfil.atribuir", alvoComum).permitido).toBe(false);
  });

  it("colaborador só tem as permissões de autosserviço, sempre com escopo PROPRIO", () => {
    const colaborador = ator([]);
    for (const permissao of TODAS_PERMISSOES) {
      const r = permissaoEfetiva(colaborador, permissao, alvoComum);
      if (PERMISSOES_COLABORADOR.includes(permissao)) {
        expect(r).toEqual({ permitido: true, origem: "PERFIL:COLABORADOR", escopo: "PROPRIO" });
      } else {
        expect(r.permitido).toBe(false);
      }
    }
  });
});
