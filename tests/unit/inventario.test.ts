import { describe, expect, it } from "vitest";
import {
  FORMATO_IDENTIFICADOR,
  nomeCarregador,
  normalizarIdentificador,
  numeroDocumento,
  proximaSequencia,
  situacaoAposDesvinculo,
  SITUACOES,
  TRANSICOES,
  transicaoValida,
} from "@/lib/inventario";

describe("carregadores", () => {
  it("nome do notebook + C + sequência (NBI5001 → NBI5001C1, C2, C3)", () => {
    expect(nomeCarregador("NBI5001", 1)).toBe("NBI5001C1");
    expect(nomeCarregador("nbi5001", 2)).toBe("NBI5001C2");
    expect(nomeCarregador(" NBI5001 ", 3)).toBe("NBI5001C3");
    expect(() => nomeCarregador("NBI5001", 0)).toThrow();
    expect(() => nomeCarregador("NBI5001", 1.5)).toThrow();
  });

  it("a sequência segue a maior já usada e nunca reaproveita posições (nem de carregador perdido)", () => {
    expect(proximaSequencia([])).toBe(1);
    expect(proximaSequencia([1])).toBe(2);
    expect(proximaSequencia([1, 2, 3])).toBe(4);
    expect(proximaSequencia([1, 3])).toBe(4); // a posição 2 (perdida) não volta
  });

  it("carregador substituído nunca volta sozinho para disponível", () => {
    expect(situacaoAposDesvinculo("PERDA")).toBe("BAIXADO");
    expect(situacaoAposDesvinculo("TROCA")).toBe("DEVOLVIDO_EM_AVALIACAO");
    expect(situacaoAposDesvinculo("DEFEITO")).toBe("DEVOLVIDO_EM_AVALIACAO");
  });
});

describe("transições de situação", () => {
  it("entrega física e reserva partem do estoque; reserva não pula etapas", () => {
    expect(transicaoValida("DISPONIVEL", "ALOCADO")).toBe(true);
    expect(transicaoValida("DISPONIVEL", "RESERVADO")).toBe(true);
    expect(transicaoValida("RESERVADO", "ALOCADO")).toBe(true);
    expect(transicaoValida("RESERVADO", "DISPONIVEL")).toBe(true);
    expect(transicaoValida("RESERVADO", "MANUTENCAO")).toBe(false);
  });

  it("devolução vai para avaliação ou manutenção, nunca direto para disponível", () => {
    expect(transicaoValida("ALOCADO", "DEVOLVIDO_EM_AVALIACAO")).toBe(true);
    expect(transicaoValida("ALOCADO", "MANUTENCAO")).toBe(true);
    expect(transicaoValida("ALOCADO", "DISPONIVEL")).toBe(false);
    expect(transicaoValida("DEVOLVIDO_EM_AVALIACAO", "DISPONIVEL")).toBe(true);
  });

  it("equipamento em manutenção não pode ser alocado nem reservado", () => {
    expect(transicaoValida("MANUTENCAO", "ALOCADO")).toBe(false);
    expect(transicaoValida("MANUTENCAO", "RESERVADO")).toBe(false);
    expect(transicaoValida("MANUTENCAO", "DISPONIVEL")).toBe(true);
    expect(transicaoValida("MANUTENCAO", "BAIXADO")).toBe(true);
  });

  it("baixado é final e a matriz cobre todas as situações", () => {
    expect(TRANSICOES.BAIXADO).toEqual([]);
    for (const s of SITUACOES) expect(TRANSICOES[s]).toBeDefined();
    for (const s of SITUACOES) expect(transicaoValida(s, s)).toBe(false);
  });
});

describe("identificadores e documentos", () => {
  it("patrimônio, nome e série em maiúsculas; formato sem acentos nem espaços", () => {
    expect(normalizarIdentificador("  vlr-004512 ")).toBe("VLR-004512");
    expect(FORMATO_IDENTIFICADOR.test("VLR-004512")).toBe(true);
    expect(FORMATO_IDENTIFICADOR.test("NBI5001")).toBe(true);
    expect(FORMATO_IDENTIFICADOR.test("NB I5001")).toBe(false);
    expect(FORMATO_IDENTIFICADOR.test("NOTEBOOK-JOÃO")).toBe(false);
    expect(FORMATO_IDENTIFICADOR.test("-X")).toBe(false);
  });

  it("números de documento com prefixo, ano e quatro dígitos", () => {
    expect(numeroDocumento("ALO", 2026, 1)).toBe("ALO-2026-0001");
    expect(numeroDocumento("DEV", 2026, 123)).toBe("DEV-2026-0123");
  });
});
