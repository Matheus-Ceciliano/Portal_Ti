import { describe, expect, it } from "vitest";
import { codificarRetorno, hrefFichaEquipamento, lerRetorno } from "@/lib/retorno-empresa";

const EMPRESA = "a1f0c7e2-0000-4000-8000-000000000001";

describe("retorno da ficha do equipamento para a empresa", () => {
  it("preserva aba, pesquisa, filtros, ordenação e página", () => {
    const retorno = codificarRetorno({ tab: "equipamentos", busca: "dell latitude", situacao: "EM_USO", ordenar: "modelo", direcao: "desc", pagina: 2 });
    const href = hrefFichaEquipamento("at-01", { empresaId: EMPRESA, retorno });
    const q = new URL(href, "http://x").searchParams;
    expect(lerRetorno(q.get("empresa")!, q.get("retorno")!)?.href).toBe(
      `/ti/cadastros/empresas/${EMPRESA}?tab=equipamentos&busca=dell+latitude&situacao=EM_USO&ordenar=modelo&direcao=desc&pagina=2`,
    );
  });

  it("monta o destino sempre no caminho da empresa: nunca redireciona para outro site ou rota", () => {
    expect(lerRetorno("https://evil.example", "tab=equipamentos")).toBeNull();
    expect(lerRetorno("../../ti/configuracoes", "")).toBeNull();
    expect(lerRetorno(undefined, "tab=equipamentos")).toBeNull();
    const r = lerRetorno(EMPRESA, "tab=//evil.example&next=https://evil.example&busca=<script>&pagina=abc&situacao=EM_USO");
    expect(r?.href).toBe(`/ti/cadastros/empresas/${EMPRESA}?situacao=EM_USO`);
    expect(lerRetorno(EMPRESA, "x".repeat(600))?.href).toBe(`/ti/cadastros/empresas/${EMPRESA}`);
  });

  it("ignora chaves desconhecidas ao codificar", () => {
    expect(codificarRetorno({ tab: "alocacoes", foo: "bar", busca: "" })).toBe("tab=alocacoes");
  });
});
