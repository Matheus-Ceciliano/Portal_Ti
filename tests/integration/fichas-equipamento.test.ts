/**
 * Ficha do equipamento e detalhe da alocação sobre a carga fictícia no banco: dados
 * relacionados, nada inventado, TER independente da entrega e RBAC no servidor.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { EMPRESAS, PESSOAS } from "@/server/dados-ficticios/cadastros";
import { ID_ATIVO_FICTICIO } from "@/server/dados-ficticios/inventario";
import { prisma } from "@/server/db";
import { obterAlocacao } from "@/server/modulos/alocacoes";
import { obterEquipamento } from "@/server/modulos/inventario";
import { criarPessoa, limparBanco, semearInventarioTeste } from "../apoio/fabricas";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

const [HZE, PBC] = EMPRESAS;

async function cenario() {
  await semearInventarioTeste();
  const supervisor = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
  return { supervisor: await ator(supervisor.contaId) };
}

beforeEach(limparBanco);

describe("ficha do equipamento", () => {
  it("relaciona empresa, responsável (desde a entrega), carregador e TER; o que não foi cadastrado fica vazio", async () => {
    const { supervisor } = await cenario();
    const f = await obterEquipamento(supervisor, ID_ATIVO_FICTICIO(1));
    expect(f).toMatchObject({ nome: "NBI4512", patrimonio: "VLR-004512", marca: "Dell", modelo: "Latitude 5440", numeroSerie: "SIM-7K2P9Q1", situacao: "ALOCADO" });
    expect(f.empresa).toMatchObject({ id: HZE.id, nome: HZE.nome });
    expect(f.responsavel).toMatchObject({ id: PESSOAS[3].id, nome: PESSOAS[3].nome, alocacao: "ALO-2026-0009" });
    expect(f.ter).toMatchObject({ numero: "TER-2026-0088", estado: "AGUARDANDO_ASSINATURA", assinadoEm: null });
    expect(f.carregadores.map((c) => [c.nome, c.situacao])).toEqual([["NBI4512.C1", "ALOCADO"]]);
    expect(f.garantiaAte).toBeNull();
    expect(f.fotos).toEqual([]);

    const disponivel = await obterEquipamento(supervisor, ID_ATIVO_FICTICIO(14));
    expect(disponivel).toMatchObject({ situacao: "DISPONIVEL", responsavel: null, reserva: null, ter: null });
    const reservado = await obterEquipamento(supervisor, ID_ATIVO_FICTICIO(9));
    expect(reservado).toMatchObject({ situacao: "RESERVADO", responsavel: null, reserva: { id: PESSOAS[7].id } });
    const emManutencao = await obterEquipamento(supervisor, ID_ATIVO_FICTICIO(11));
    expect(emManutencao.manutencoes[0]).toMatchObject({ aberta: true, recolhidoDeNome: PESSOAS[5].nome });
  });

  it("id inválido ou inexistente é recusado; colaborador comum não vê equipamento de outra pessoa", async () => {
    const { supervisor } = await cenario();
    await expect(obterEquipamento(supervisor, "../etc")).rejects.toBeInstanceOf(ErroNegocio);
    await expect(obterEquipamento(supervisor, randomUUID())).rejects.toBeInstanceOf(ErroNegocio);
    const comum = await criarPessoa({ ativada: true });
    await expect(obterEquipamento(await ator(comum.contaId), ID_ATIVO_FICTICIO(1))).rejects.toBeInstanceOf(ErroAutorizacao);
    // A própria pessoa vê o equipamento que está com ela.
    const ana = await criarPessoa({ id: PESSOAS[3].id, colaboradorExistente: true, ativada: true });
    expect((await obterEquipamento(await ator(ana.contaId), ID_ATIVO_FICTICIO(1))).patrimonio).toBe("VLR-004512");
  });
});

describe("detalhe da alocação", () => {
  it("traz colaborador, itens com a empresa proprietária de cada um, TER e histórico", async () => {
    const { supervisor } = await cenario();
    const alocacao = await prisma.alocacao.findUniqueOrThrow({ where: { numero: "ALO-2026-0009" } });
    const d = await obterAlocacao(supervisor, alocacao.id);
    expect(d).toMatchObject({ estado: "ATIVA", colaborador: { id: PESSOAS[3].id }, empresaColaborador: { id: HZE.id } });
    expect(d.itens.map((i) => i.ativo.nome ?? i.ativo.patrimonio).sort()).toEqual(["NBI4512", "NBI4512.C1", "VLR-004513", "VLR-004530"]);
    expect(d.termos).toEqual([expect.objectContaining({ numero: "TER-2026-0088", estado: "AGUARDANDO_ASSINATURA", temPdf: false })]);
    expect(d.historico.filter((h) => h.tipo === "ENTREGA")).toHaveLength(4);
  });

  it("devolução com outra empresa: proprietária e empresa do colaborador preservadas; RBAC no servidor", async () => {
    const { supervisor } = await cenario();
    const alocacao = await prisma.alocacao.findUniqueOrThrow({ where: { numero: "ALO-2025-0009" } });
    const d = await obterAlocacao(supervisor, alocacao.id);
    expect(d).toMatchObject({ estado: "ENCERRADA", empresaColaborador: { id: HZE.id } });
    expect(d.itens[0]).toMatchObject({ aberto: false, motivoEncerramento: "DEVOLUCAO", empresaProprietaria: { id: PBC.id } });
    expect(d.itens[0].devolucao).toMatchObject({ numero: "DEV-2026-0009", destino: "MANUTENCAO" });
    expect(d.devolucoes[0]).toMatchObject({ abrangencia: "TOTAL" });

    await expect(obterAlocacao(supervisor, randomUUID())).rejects.toBeInstanceOf(ErroNegocio);
    const comum = await criarPessoa({ ativada: true });
    await expect(obterAlocacao(await ator(comum.contaId), alocacao.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    const estagiario = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    expect((await obterAlocacao(await ator(estagiario.contaId), alocacao.id)).numero).toBe("ALO-2025-0009");
  });
});
