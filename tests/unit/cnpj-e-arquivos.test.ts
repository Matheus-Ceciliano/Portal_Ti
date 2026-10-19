import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, normalizarCnpj, problemaCnpj } from "@/lib/cnpj";
import { detectarImagem } from "@/server/armazenamento";

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido e o exemplo alfanumérico oficial da Receita", () => {
    expect(cnpjValido("00.000.000/0001-91")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12abc34501de35")).toBe(true); // minúsculas são normalizadas
  });

  it("recusa dígitos verificadores errados, tamanho errado, letras no DV e repetições", () => {
    expect(problemaCnpj("11.222.333/0001-80")).toMatch(/dígitos verificadores/);
    expect(problemaCnpj("11.222.333/0001")).toMatch(/14 caracteres/);
    expect(problemaCnpj("12ABC34501DEAB")).toMatch(/últimos caracteres/);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("AAAAAAAAAAAA00")).toBe(false);
    expect(problemaCnpj("")).toBe("Informe o CNPJ.");
  });

  it("normaliza para 14 caracteres e formata com máscara progressiva", () => {
    expect(normalizarCnpj(" 11.222.333/0001-81 ")).toBe("11222333000181");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("112223")).toBe("11.222.3");
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("detecção de imagem pelo conteúdo", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);

  it("reconhece PNG, JPG e WebP pela assinatura", () => {
    expect(detectarImagem(png)?.tipo).toBe("image/png");
    expect(detectarImagem(jpg)?.tipo).toBe("image/jpeg");
    expect(detectarImagem(webp)?.tipo).toBe("image/webp");
  });

  it("recusa SVG, HTML e executáveis, mesmo com nome de imagem", () => {
    expect(detectarImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(detectarImagem(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectarImagem(Buffer.from("MZ\x90\x00"))).toBeNull();
  });
});
