/**
 * Registros por empresa: toda consulta fica restrita à empresa selecionada, filtros e
 * ordenação funcionam no servidor e as permissões valem também em chamada direta.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { EMPRESAS, PESSOAS } from "@/server/dados-ficticios/cadastros";
import { prisma } from "@/server/db";
import {
  listarAlocacoesEmpresa,
  listarColaboradoresEmpresa,
  listarEquipamentosEmpresa,
  obterResumoEmpresa,
} from "@/server/modulos/empresa-registros";
import { criarPessoa, limparBanco, semearInventarioTeste } from "../apoio/fabricas";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

const [HZE, PBC, RCI] = EMPRESAS;

/** Empresas fictícias com os mesmos ids dos equipamentos fictícios, e pessoas em cada uma. */
async function cenario() {
  await prisma.empresa.createMany({ data: [HZE, PBC, RCI] });
  await prisma.colaborador.createMany({
    data: [
      { nome: "Bianca Lopes", emailCorporativo: "bianca@vallur.test", cargo: "Engenheira de Custos", departamento: "Planejamento", empresaId: HZE.id },
      { nome: "Diego Ramos", emailCorporativo: "diego@vallur.test", cargo: "Técnico de Campo", departamento: "Obras", empresaId: HZE.id, situacao: "AFASTADO" },
      { nome: "Elisa Moura", emailCorporativo: "elisa@vallur.test", cargo: "Analista", departamento: "Obras", empresaId: HZE.id },
      { nome: "Fábio Teles", emailCorporativo: "fabio@vallur.test", cargo: "Analista", departamento: "Obras", empresaId: PBC.id },
      // Responsáveis dos equipamentos fictícios (mesmos ids do cadastro fictício).
      ...[PESSOAS[3], PESSOAS[11]].map((p) => ({ id: p.id, nome: p.nome, emailCorporativo: p.email, cargo: p.cargo, departamento: p.departamento, empresaId: HZE.id })),
    ],
  });
  const supervisor = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
  return { supervisor: await ator(supervisor.contaId) };
}

beforeEach(limparBanco);

describe("colaboradores da empresa", () => {
  it("lista só os da empresa e filtra por nome, e-mail, cargo, situação e departamento", async () => {
    const { supervisor } = await cenario();
    const todos = await listarColaboradoresEmpresa(supervisor, HZE.id);
    expect(todos.totalEmpresa).toBe(5);
    expect(todos.itens.some((c) => c.nome === "Fábio Teles")).toBe(false); // outra empresa

    expect((await listarColaboradoresEmpresa(supervisor, HZE.id, { busca: "bianca" })).itens.map((c) => c.nome)).toEqual(["Bianca Lopes"]);
    expect((await listarColaboradoresEmpresa(supervisor, HZE.id, { busca: "diego@vallur" })).itens.map((c) => c.nome)).toEqual(["Diego Ramos"]);
    expect((await listarColaboradoresEmpresa(supervisor, HZE.id, { busca: "custos" })).itens.map((c) => c.nome)).toEqual(["Bianca Lopes"]);
    expect((await listarColaboradoresEmpresa(supervisor, HZE.id, { situacao: "AFASTADO" })).itens.map((c) => c.nome)).toEqual(["Diego Ramos"]);
    const obras = await listarColaboradoresEmpresa(supervisor, HZE.id, { departamento: "Obras" });
    expect(obras.itens.map((c) => c.nome)).toEqual(["Diego Ramos", "Elisa Moura"]);
    expect(obras.departamentos).toContain("Planejamento");
    // Pesquisa por um colaborador de outra empresa não retorna nada.
    expect((await listarColaboradoresEmpresa(supervisor, HZE.id, { busca: "Fábio" })).total).toBe(0);
  });

  it("ordena e pagina no servidor", async () => {
    const { supervisor } = await cenario();
    const pagina1 = await listarColaboradoresEmpresa(supervisor, HZE.id, { ordenar: "nome", direcao: "desc", porPagina: 2 });
    expect(pagina1.paginas).toBe(3);
    expect(pagina1.itens.map((c) => c.nome)).toEqual(["Patrícia Gomes", "Elisa Moura"]);
    const pagina3 = await listarColaboradoresEmpresa(supervisor, HZE.id, { ordenar: "nome", direcao: "desc", porPagina: 2, pagina: 3 });
    expect(pagina3.itens.map((c) => c.nome)).toEqual(["Ana Beatriz Souza"]);
  });

  it("colaborador comum não consulta; Estagiário consulta; id inválido ou inexistente é recusado", async () => {
    await cenario();
    const comum = await criarPessoa({ ativada: true });
    await expect(listarColaboradoresEmpresa(await ator(comum.contaId), HZE.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    const estagiario = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    expect((await listarColaboradoresEmpresa(await ator(estagiario.contaId), HZE.id)).totalEmpresa).toBe(5);
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    await expect(listarColaboradoresEmpresa(await ator(s.contaId), "nao-e-uuid")).rejects.toBeInstanceOf(ErroNegocio);
    await expect(listarColaboradoresEmpresa(await ator(s.contaId), randomUUID())).rejects.toBeInstanceOf(ErroNegocio);
  });
});

/** Inventário fictício gravado no banco (mesmos patrimônios e pessoas do cadastro fictício). */
async function cenarioInventario() {
  await semearInventarioTeste();
  const supervisor = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
  return { supervisor: await ator(supervisor.contaId) };
}

describe("equipamentos e alocações da empresa (banco)", () => {
  it("equipamentos: só os de que a empresa é proprietária; pesquisa por patrimônio, modelo, série e responsável; filtros", async () => {
    const { supervisor } = await cenarioInventario();
    const todos = await listarEquipamentosEmpresa(supervisor, HZE.id);
    expect(todos.totalEmpresa).toBe(5); // carregadores ficam na ficha do notebook
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { busca: "VLR-004513" })).itens.map((a) => a.modelo)).toEqual(['24MP400 24"']);
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { busca: "logitech" })).total).toBe(1);
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { busca: "SIM-9H1LN33" })).total).toBe(1);
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { busca: "Patrícia" })).itens.map((a) => a.patrimonio)).toEqual(["VLR-004590"]);
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { categoria: "CELULAR" })).itens.map((a) => a.situacao)).toEqual(["DISPONIVEL"]);
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { situacao: "ALOCADO" })).total).toBe(4);
    expect(todos.categorias.map((c) => c.rotulo)).toEqual(["Celular", "Kit teclado e mouse", "Monitor", "Notebook"]);
    // Patrimônio de outra empresa não aparece.
    expect((await listarEquipamentosEmpresa(supervisor, HZE.id, { busca: "VLR-004601" })).total).toBe(0);
  });

  it("alocações: empresa proprietária e empresa do colaborador separadas; entrega física independe do TER", async () => {
    const { supervisor } = await cenarioInventario();
    const agora = new Date("2026-10-15T12:00:00-03:00");
    const todas = await listarAlocacoesEmpresa(supervisor, HZE.id, {}, agora);
    expect(todas.totalEmpresa).toBe(7);
    // Fernanda (HZE) devolveu um desktop da Pedra Branca: aparece pelo vínculo do colaborador.
    expect((await listarAlocacoesEmpresa(supervisor, HZE.id, { vinculo: "PROPRIETARIA" }, agora)).total).toBe(6);
    const pelaPessoa = await listarAlocacoesEmpresa(supervisor, HZE.id, { vinculo: "COLABORADOR" }, agora);
    expect(pelaPessoa.total).toBe(7);
    const encerrada = pelaPessoa.itens.find((a) => a.situacao === "ENCERRADA")!;
    expect(encerrada).toMatchObject({ patrimonio: "VLR-004410", empresaProprietaria: { sigla: "PBC" }, empresaColaborador: { sigla: "HZE" } });

    expect((await listarAlocacoesEmpresa(supervisor, HZE.id, { situacao: "ENTREGUE" }, agora)).total).toBe(6);
    const antigas = await listarAlocacoesEmpresa(supervisor, HZE.id, { ordem: "antigas" }, agora);
    expect(antigas.itens[0].patrimonio).toBe("VLR-004410"); // 01/09/2025
    // Entregue mesmo sem TER: o termo é acompanhado à parte.
    expect(todas.itens.find((a) => a.patrimonio === "VLR-004590")).toMatchObject({ situacao: "ENTREGUE", ter: null });
    expect(todas.itens.find((a) => a.patrimonio === "VLR-004512")).toMatchObject({ situacao: "ENTREGUE", ter: "AGUARDANDO_ASSINATURA", numero: "ALO-2026-0009" });
    expect((await listarAlocacoesEmpresa(supervisor, HZE.id, { periodo: "90" }, agora)).total).toBe(0);
    expect((await listarAlocacoesEmpresa(supervisor, HZE.id, { periodo: "365" }, agora)).total).toBe(6);
    expect((await listarAlocacoesEmpresa(supervisor, HZE.id, { busca: "Ana Beatriz" }, agora)).total).toBe(4);

    // Rio Claro: reservas não contam como entregues.
    const reservas = await listarAlocacoesEmpresa(supervisor, RCI.id, { situacao: "RESERVA" }, agora);
    expect(reservas.total).toBe(3);
    expect(reservas.itens.every((a) => a.dataEntrega === null)).toBe(true);
    expect((await listarAlocacoesEmpresa(supervisor, RCI.id, { situacao: "ENTREGUE" }, agora)).total).toBe(2);
  });

  it("resumo usa os números do banco", async () => {
    const { supervisor } = await cenarioInventario();
    const r = await obterResumoEmpresa(supervisor, HZE.id);
    expect(r.colaboradores).toMatchObject({ total: 3, ativos: 3 });
    expect(r.equipamentos).toEqual({ total: 5, alocados: 4, disponiveis: 1, manutencao: 0, reservados: 0 });
    expect(r.alocacoes?.total).toBe(6);
    expect(r.alocacoes?.recentes).toHaveLength(4);
  });
});
