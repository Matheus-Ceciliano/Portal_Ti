/**
 * Catálogos do Inventário no banco: marcas sem duplicidade por grafia, modelos da marca
 * (diálogo da aba Marcas) com categoria e quantidade de equipamentos, ordem alfabética dos
 * modelos (marca e depois modelo, sem diferenciar maiúsculas) e permissão de gestão.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { criarMarca, criarModelo, listarCatalogos, modelosDaMarca } from "@/server/modulos/catalogos";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

const categoriaId = async (codigo: string) => (await prisma.categoriaEquipamento.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;

beforeEach(limparBanco);

describe("marcas e modelos", () => {
  it("marca não se repete por grafia (Dell = DELL = dell)", async () => {
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    await expect(criarMarca(supervisor, { nome: "DELL" })).rejects.toThrow(/Dell já está cadastrada/);
    await expect(criarMarca(supervisor, { nome: "  dell " })).rejects.toThrow(/já está cadastrada/);
    const acer = await criarMarca(supervisor, { nome: "Acer" });
    expect(acer).toMatchObject({ nome: "Acer", ativa: true });
    // Só quem gerencia catálogos cadastra.
    const comum = await ator((await criarPessoa({ ativada: true })).contaId);
    await expect(criarMarca(comum, { nome: "Asus" })).rejects.toBeInstanceOf(ErroAutorizacao);
  });

  it("modelos da marca: só os da marca escolhida, em ordem alfabética, com categoria e quantidade do banco", async () => {
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    const empresa = await criarEmpresa();
    const notebook = await categoriaId("NOTEBOOK");
    // Grafia em minúscula entra na ordem sem diferenciar maiúsculas.
    await criarModelo(supervisor, { nome: "inspiron 15", marcaId: MARCA.Dell, categoriaId: notebook });
    for (let n = 1; n <= 2; n++) {
      await cadastrarComInspecao(supervisor, {
        dados: { categoria: "NOTEBOOK", processadorId: PROCESSADOR.i5, empresaId: empresa.id, marcaId: MARCA.Dell, modeloId: MODELO.latitude5440, numeroSerie: `SIM-CAT-${n}` },
      });
    }

    const r = await modelosDaMarca(supervisor, MARCA.Dell);
    expect(r.marca).toMatchObject({ id: MARCA.Dell, nome: "Dell" });
    expect(r.modelos.map((m) => [m.nome, m.categoria, m.equipamentos])).toEqual([
      ["inspiron 15", "Notebook", 0],
      ["Latitude 3540", "Notebook", 0],
      ["Latitude 5440", "Notebook", 2],
      ["OptiPlex 7010", "Desktop", 0],
    ]);
    // A contagem é a do banco; os carregadores C1 ficam sem modelo e aparecem à parte.
    expect(await prisma.ativo.count({ where: { modeloId: MODELO.latitude5440 } })).toBe(2);
    expect(r.semModelo).toBe(2);
    // Marca sem modelos: lista vazia (o diálogo mostra o estado vazio).
    expect((await modelosDaMarca(supervisor, MARCA.HP)).modelos).toEqual([]);
  });

  it("lista de modelos: marca (A–Z) e depois modelo (A–Z), sem diferenciar maiúsculas", async () => {
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    const monitor = await categoriaId("MONITOR");
    const acer = await criarMarca(supervisor, { nome: "acer" });
    await criarModelo(supervisor, { nome: "Zeta 27", marcaId: acer.id, categoriaId: monitor });
    await criarModelo(supervisor, { nome: "alfa 24", marcaId: acer.id, categoriaId: monitor });
    await criarModelo(supervisor, { nome: "Nitro", marcaId: MARCA.Samsung, categoriaId: monitor });

    const { modelos } = await listarCatalogos(supervisor);
    const pares = modelos.map((m) => `${m.marca} | ${m.nome}`);
    expect(pares.slice(0, 2)).toEqual(["acer | alfa 24", "acer | Zeta 27"]);
    const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
    expect([...modelos].sort((a, b) => comparar(a.marca, b.marca) || comparar(a.nome, b.nome)).map((m) => m.id)).toEqual(modelos.map((m) => m.id));
    expect(pares).toContain("Samsung | Nitro");
  });
});
