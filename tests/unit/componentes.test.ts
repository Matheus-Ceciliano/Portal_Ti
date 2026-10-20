import { describe, expect, it } from "vitest";
import {
  compativeis,
  descreverPeca,
  formatarCapacidade,
  identificadorComponente,
  pecasDaConfiguracao,
  resumirConfiguracao,
  sugerirConfiguracao,
} from "@/lib/componentes";
import { transicaoValida } from "@/lib/inventario";

describe("componentes internos: regras puras", () => {
  it("identificadores com sequência própria e três dígitos", () => {
    expect([identificadorComponente("MEMORIA_RAM", 1), identificadorComponente("SSD", 12), identificadorComponente("HD", 7), identificadorComponente("MEMORIA_RAM", 1000)]).toEqual([
      "RAM001",
      "SSD012",
      "HDD007",
      "RAM1000",
    ]);
  });

  it("descrição e capacidade", () => {
    expect(formatarCapacidade(512)).toBe("512 GB");
    expect(formatarCapacidade(2000)).toBe("2 TB");
    expect(descreverPeca({ tipo: "MEMORIA_RAM", capacidadeGb: 16, tecnologia: "DDR4" })).toBe("16 GB DDR4");
    expect(descreverPeca({ tipo: "SSD", capacidadeGb: 512, interfaceConexao: "NVMe/PCIe" })).toBe("SSD NVMe/PCIe 512 GB");
    expect(descreverPeca({ tipo: "HD", capacidadeGb: 1000 })).toBe("HD 1 TB");
  });

  it("configuração: soma só as peças vigentes, sem contagem duplicada", () => {
    const original = pecasDaConfiguracao({ memoria: { capacidadeGb: 8, tecnologia: "DDR4" }, armazenamento: [{ tipo: "SSD", capacidadeGb: 256, interfaceConexao: "SATA" }] });
    expect(resumirConfiguracao(original)).toMatchObject({ ramTotalGb: 8, memoria: "8 GB DDR4", armazenamento: "SSD SATA 256 GB" });
    // Substituição: a nova entra no lugar da original (não 8 + 16).
    const substituida = [{ tipo: "MEMORIA_RAM" as const, capacidadeGb: 16, tecnologia: "DDR4" }, original[1]];
    expect(resumirConfiguracao(substituida).ramTotalGb).toBe(16);
    // Adição: soma.
    expect(resumirConfiguracao([...original, { tipo: "MEMORIA_RAM", capacidadeGb: 8, tecnologia: "DDR4" }, { tipo: "HD", capacidadeGb: 1000, interfaceConexao: "SATA" }])).toMatchObject({
      ramTotalGb: 16,
      memoria: "16 GB DDR4",
      armazenamento: "SSD SATA 256 GB + HD SATA 1 TB",
    });
    expect(resumirConfiguracao([]).texto).toBe("Sem peças registradas");
  });

  it("compatibilidade e transições: peça instalada sai para estoque, avaliação, manutenção ou baixa", () => {
    expect(compativeis("SSD", "HD")).toBe(true);
    expect(compativeis("MEMORIA_RAM", "SSD")).toBe(false);
    expect(transicaoValida("DISPONIVEL", "INSTALADO")).toBe(true);
    expect(["DISPONIVEL", "DEVOLVIDO_EM_AVALIACAO", "MANUTENCAO", "BAIXADO"].every((d) => transicaoValida("INSTALADO", d as "DISPONIVEL"))).toBe(true);
    expect(transicaoValida("INSTALADO", "ALOCADO")).toBe(false);
  });

  it("texto antigo só sugere o preenchimento", () => {
    expect(sugerirConfiguracao("16 GB", "SSD 512 GB")).toEqual({ memoria: 16, tecnologia: null, armazenamento: { tipo: "SSD", capacidadeGb: 512, interfaceConexao: null } });
    expect(sugerirConfiguracao("8 GB DDR4", "HD 1 TB SATA")).toEqual({ memoria: 8, tecnologia: "DDR4", armazenamento: { tipo: "HD", capacidadeGb: 1000, interfaceConexao: "SATA" } });
    expect(sugerirConfiguracao(null, null)).toEqual({ memoria: null, tecnologia: null, armazenamento: null });
  });
});
