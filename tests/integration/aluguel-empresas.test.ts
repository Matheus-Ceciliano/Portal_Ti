/**
 * Uso de equipamentos entre empresas no banco: alocação só para a empresa proprietária ou, com
 * aluguel vigente, para a locatária; transferência de propriedade; aluguel e encerramento com
 * histórico; carregadores vinculados; concorrência; permissões, auditoria e dados existentes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { confirmarEntrega, criarAlocacao, registrarDevolucao } from "@/server/modulos/alocacoes";
import { alugarEquipamento, encerrarAluguel, MENSAGEM_OUTRA_EMPRESA } from "@/server/modulos/alugueis";
import { obterEquipamento, type DadosEquipamento } from "@/server/modulos/inventario";
import { transferirColaborador, transferirEmpresa } from "@/server/modulos/transferencias";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, verificacoesDaReserva, verificacoesNovas } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const BLOQUEIO = new RegExp(MENSAGEM_OUTRA_EMPRESA.replace(/[.]/g, "\\."));

let serie = 0;
const notebook = (empresaId: string, n = 5001): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-AL${n}-${++serie}`,
});

/** Duas empresas, cada uma com um colaborador; o equipamento é da "dona". */
async function cenario() {
  const dona = await criarEmpresa();
  const locataria = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
  const daDona = await criarPessoa({ ativada: true, empresaId: dona.id });
  const daLocataria = await criarPessoa({ ativada: true, empresaId: locataria.id });
  const nb = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id) });
  const c1 = await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } });
  return { dona, locataria, supervisor, daDona, daLocataria, nb, c1 };
}

const alugar = (supervisor: Ator, ativoId: string, empresaLocatariaId: string, empresaAtualId: string, extra: { inicio?: string; devolucaoPrevista?: string } = {}) =>
  alugarEquipamento(supervisor, { ativoId, empresaLocatariaId, empresaAtualId, inicio: extra.inicio ?? hoje(), devolucaoPrevista: extra.devolucaoPrevista, motivo: "Obra compartilhada", confirmacao: true });

const entregar = async (supervisor: Ator, colaboradorId: string, ativoIds: string[]) =>
  criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId, ativoIds, modo: "ENTREGAR", verificacoes: await verificacoesNovas(ativoIds) });

const situacao = async (id: string) => (await prisma.ativo.findUniqueOrThrow({ where: { id } })).situacao;

beforeEach(limparBanco);

describe("quem pode receber o equipamento", () => {
  it("1. colaborador da empresa proprietária recebe; 2. colaborador de outra empresa é recusado sem gravar nada", async () => {
    const { supervisor, daDona, daLocataria, nb, c1 } = await cenario();
    await expect(entregar(supervisor, daLocataria.colaboradorId, [nb.id, c1.id])).rejects.toThrow(BLOQUEIO);
    expect(await prisma.alocacao.count()).toBe(0);
    expect(await situacao(nb.id)).toBe("DISPONIVEL");
    // Reserva também é recusada (a regra vale para qualquer alocação).
    await expect(
      criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: daLocataria.colaboradorId, ativoIds: [nb.id], modo: "RESERVAR" }),
    ).rejects.toThrow(BLOQUEIO);

    const a = await entregar(supervisor, daDona.colaboradorId, [nb.id, c1.id]);
    expect(await prisma.alocacao.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: "ATIVA" });
  });

  it("3. transferência permanente: muda a proprietária com histórico; o uso passa à nova empresa; a empresa do colaborador não muda", async () => {
    const { dona, locataria, supervisor, daDona, daLocataria, nb, c1 } = await cenario();
    await transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: locataria.id, motivo: "Venda interna", confirmacao: true, empresaAtualId: dona.id });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).empresaId).toBe(locataria.id);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: c1.id } })).empresaId).toBe(locataria.id); // carregador sem patrimônio acompanha
    const ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha.transferenciasEmpresa).toHaveLength(1);
    expect(ficha.transferenciasEmpresa[0]).toMatchObject({ de: dona.nome, para: locataria.nome, motivo: "Venda interna", realizadaPorNome: supervisor.nome });

    await expect(entregar(supervisor, daDona.colaboradorId, [nb.id])).rejects.toThrow(BLOQUEIO);
    await entregar(supervisor, daLocataria.colaboradorId, [nb.id, c1.id]);
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: daDona.colaboradorId } })).empresaId).toBe(dona.id);
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: daLocataria.colaboradorId } })).empresaId).toBe(locataria.id);
  });
});

describe("aluguel entre empresas", () => {
  it("4. registra o aluguel sem mudar a propriedade nem entregar a ninguém; 5. a locatária recebe durante o aluguel e a proprietária não", async () => {
    const { dona, locataria, supervisor, daDona, daLocataria, nb, c1 } = await cenario();
    const r = await alugar(supervisor, nb.id, locataria.id, dona.id, { devolucaoPrevista: emDias(30) });
    expect(r).toMatchObject({ empresa: locataria.nome, repetido: false });
    const registro = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    expect(registro).toMatchObject({ vigente: true, empresaProprietariaId: dona.id, empresaLocatariaId: locataria.id, motivo: "Obra compartilhada", registradoPorNome: supervisor.nome });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).empresaId).toBe(dona.id);
    expect(await situacao(nb.id)).toBe("DISPONIVEL"); // aluguel não é entrega
    expect(await prisma.alocacao.count()).toBe(0);
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: nb.id, tipo: "ALUGUEL_INICIADO" } })).toBe(1);
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: c1.id, tipo: "ALUGUEL_INICIADO" } })).toBe(1);

    await expect(entregar(supervisor, daDona.colaboradorId, [nb.id])).rejects.toThrow(/alugado para .*Encerre o aluguel/);
    const a = await entregar(supervisor, daLocataria.colaboradorId, [nb.id, c1.id]);
    expect(await prisma.alocacao.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: "ATIVA", empresaColaboradorId: locataria.id });
    const ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha.aluguel).toMatchObject({ empresa: { id: locataria.id }, inicio: hoje(), herdado: false });
  });

  it("aluguel com início futuro: ninguém recebe antes do início; a devolução prevista não encerra o aluguel", async () => {
    const { dona, locataria, supervisor, daLocataria, nb } = await cenario();
    await alugar(supervisor, nb.id, locataria.id, dona.id, { inicio: emDias(5), devolucaoPrevista: emDias(6) });
    await expect(entregar(supervisor, daLocataria.colaboradorId, [nb.id])).rejects.toThrow(/começa em/);
    // Reserva para depois do início é aceita.
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: daLocataria.colaboradorId, ativoIds: [nb.id], modo: "RESERVAR", data: emDias(7) });
    expect(await prisma.aluguelEquipamento.count({ where: { vigente: true } })).toBe(1);
  });

  it("6. depois do encerramento a locatária não recebe mais; a situação física não muda", async () => {
    const { dona, locataria, supervisor, daDona, daLocataria, nb } = await cenario();
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    await expect(encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "  " })).rejects.toThrow(/motivo/);
    await encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim da obra" });
    expect(await prisma.aluguelEquipamento.findUniqueOrThrow({ where: { id: aluguel.id } })).toMatchObject({ vigente: null, motivoEncerramento: "Fim da obra", encerradoPorNome: supervisor.nome });
    expect(await situacao(nb.id)).toBe("DISPONIVEL");
    await expect(entregar(supervisor, daLocataria.colaboradorId, [nb.id])).rejects.toThrow(BLOQUEIO);
    await entregar(supervisor, daDona.colaboradorId, [nb.id]);
    await expect(encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "De novo" })).rejects.toThrow(/já foi encerrado/);
  });

  it("8. o encerramento é recusado com o equipamento entregue; depois da devolução, encerra sem marcar como disponível", async () => {
    const { dona, locataria, supervisor, daLocataria, nb, c1 } = await cenario();
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    const a = await entregar(supervisor, daLocataria.colaboradorId, [nb.id, c1.id]);
    await expect(encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" })).rejects.toThrow(/Registre a devolução antes de encerrar o aluguel/);
    expect(await prisma.aluguelEquipamento.count({ where: { vigente: true } })).toBe(1);

    const itens = await prisma.itemAlocacao.findMany({ where: { alocacaoId: a.id } });
    await registrarDevolucao(supervisor, {
      alocacaoId: a.id,
      itens: itens.map((i) => ({ itemId: i.id, estadoFisico: "BOM" as const, destino: "AVALIACAO" as const })),
    });
    await encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim da obra" });
    // Devolvido em avaliação continua assim: o encerramento não libera nada sozinho.
    expect(await situacao(nb.id)).toBe("DEVOLVIDO_EM_AVALIACAO");
  });

  it("7. dois aluguéis vigentes do mesmo equipamento não passam, nem em paralelo nem gravando direto no banco", async () => {
    const { dona, locataria, supervisor, nb } = await cenario();
    const terceira = await criarEmpresa();
    const r = await Promise.allSettled([alugar(supervisor, nb.id, locataria.id, dona.id), alugar(supervisor, nb.id, terceira.id, dona.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.aluguelEquipamento.count({ where: { ativoId: nb.id, vigente: true } })).toBe(1);
    await expect(alugar(supervisor, nb.id, terceira.id, dona.id)).rejects.toThrow(/já está alugado/);
    // O índice único é a última barreira.
    await expect(
      prisma.aluguelEquipamento.create({ data: { ativoId: nb.id, empresaProprietariaId: dona.id, empresaLocatariaId: terceira.id, inicio: new Date(), motivo: "x", registradoPorNome: "teste" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Nem aluguel para a própria proprietária.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5002) });
    await expect(alugar(supervisor, nb2.id, dona.id, dona.id)).rejects.toThrow(/diferente da proprietária/);
  });

  it("períodos não se sobrepõem: o novo aluguel começa no fim do anterior ou depois", async () => {
    const { dona, locataria, supervisor, nb } = await cenario();
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    await encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" });
    await expect(alugar(supervisor, nb.id, locataria.id, dona.id, { inicio: emDias(-10) })).rejects.toThrow(/último aluguel deste equipamento terminou/);
    await alugar(supervisor, nb.id, locataria.id, dona.id, { inicio: hoje() });
    expect(await prisma.aluguelEquipamento.count({ where: { ativoId: nb.id } })).toBe(2); // histórico preservado
  });

  it("9. carregadores vinculados seguem o aluguel do notebook; o carregador sozinho não é alugado", async () => {
    const { dona, locataria, supervisor, daDona, daLocataria, nb, c1 } = await cenario();
    await expect(alugar(supervisor, c1.id, locataria.id, dona.id)).rejects.toThrow(/carregador acompanha o notebook/);
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    expect((await obterEquipamento(supervisor, c1.id)).aluguel).toMatchObject({ empresa: { id: locataria.id }, herdado: true });
    // O carregador sozinho também só vai para a locatária.
    await expect(entregar(supervisor, daDona.colaboradorId, [c1.id])).rejects.toThrow(/alugado para/);
    const a = await entregar(supervisor, daLocataria.colaboradorId, [c1.id]);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    // Com o carregador entregue, o aluguel do notebook não se encerra.
    await expect(encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" })).rejects.toThrow(/C1 está com/);
    const [item] = await prisma.itemAlocacao.findMany({ where: { alocacaoId: a.id } });
    await registrarDevolucao(supervisor, { alocacaoId: a.id, itens: [{ itemId: item.id, estadoFisico: "BOM", destino: "AVALIACAO" }] });
    await encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" });
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: c1.id, tipo: "ALUGUEL_ENCERRADO" } })).toBe(1);
  });
});

describe("conflitos e concorrência", () => {
  it("10. propriedade e aluguel não conflitam: transferência bloqueada durante o aluguel (também no banco) e aluguel bloqueado com alocação de outra empresa", async () => {
    const { dona, locataria, supervisor, daDona, nb } = await cenario();
    const terceira = await criarEmpresa();
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    await expect(transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: terceira.id, motivo: "Venda", confirmacao: true, empresaAtualId: dona.id })).rejects.toThrow(
      /Encerre o aluguel antes de transferir a propriedade/,
    );
    // Gravação direta no banco também é recusada (gatilho).
    await expect(prisma.ativo.update({ where: { id: nb.id }, data: { empresaId: terceira.id } })).rejects.toThrow(/encerre o aluguel/);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).empresaId).toBe(dona.id);

    // Equipamento com colaborador da proprietária não é alugado a outra empresa.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5002) });
    await entregar(supervisor, daDona.colaboradorId, [nb2.id]);
    await expect(alugar(supervisor, nb2.id, locataria.id, dona.id)).rejects.toThrow(/Registre a devolução ou cancele a reserva antes do aluguel/);

    // Em paralelo, transferir e alugar o mesmo equipamento: só uma das operações vale.
    const nb3 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5003) });
    const r = await Promise.allSettled([
      transferirEmpresa(supervisor, { ativoId: nb3.id, empresaDestinoId: terceira.id, motivo: "Venda", confirmacao: true, empresaAtualId: dona.id }),
      alugar(supervisor, nb3.id, locataria.id, dona.id),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const final = await prisma.ativo.findUniqueOrThrow({ where: { id: nb3.id } });
    const vigente = await prisma.aluguelEquipamento.findFirst({ where: { ativoId: nb3.id, vigente: true } });
    expect(vigente ? final.empresaId === dona.id : final.empresaId === terceira.id).toBe(true);
  });

  it("11. alocações simultâneas e alocação concorrendo com o encerramento do aluguel ficam consistentes", async () => {
    const { dona, locataria, supervisor, daLocataria, nb } = await cenario();
    const outraDaLocataria = await criarPessoa({ ativada: true, empresaId: locataria.id });
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    const r = await Promise.allSettled([entregar(supervisor, daLocataria.colaboradorId, [nb.id]), entregar(supervisor, outraDaLocataria.colaboradorId, [nb.id])]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.itemAlocacao.count({ where: { ativoId: nb.id, aberto: true } })).toBe(1);

    // Outro equipamento: alocar e encerrar o aluguel ao mesmo tempo nunca deixa uso sem aluguel.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5002) });
    await alugar(supervisor, nb2.id, locataria.id, dona.id);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb2.id, vigente: true } });
    await Promise.allSettled([entregar(supervisor, daLocataria.colaboradorId, [nb2.id]), encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" })]);
    const aberto = await prisma.itemAlocacao.count({ where: { ativoId: nb2.id, aberto: true } });
    const vigente = await prisma.aluguelEquipamento.count({ where: { ativoId: nb2.id, vigente: true } });
    expect(aberto === 0 || vigente === 1).toBe(true);
  });

  it("transferência entre colaboradores respeita a empresa e a confirmação de reserva confere de novo", async () => {
    const { dona, locataria, supervisor, daDona, daLocataria, nb } = await cenario();
    const a = await entregar(supervisor, daDona.colaboradorId, [nb.id]);
    await expect(
      transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: daLocataria.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: a.id }),
    ).rejects.toThrow(BLOQUEIO);
    await expect(
      transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: daLocataria.colaboradorId, modo: "RESERVAR", alocacaoAtualId: a.id }),
    ).rejects.toThrow(BLOQUEIO);

    // Com reserva para a locatária, o aluguel não se encerra (a reserva nunca fica sem aluguel); a entrega confere de novo e passa.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5002) });
    await alugar(supervisor, nb2.id, locataria.id, dona.id);
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: daLocataria.colaboradorId, ativoIds: [nb2.id], modo: "RESERVAR" });
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb2.id } });
    await expect(encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" })).rejects.toThrow(/Cancele a reserva antes de encerrar o aluguel/);
    await expect(confirmarEntrega(supervisor, { alocacaoId: reserva.id, verificacoes: await verificacoesDaReserva(reserva.id) })).resolves.toMatchObject({ numero: expect.any(String) });
  });
});

describe("permissões, auditoria e dados existentes", () => {
  it("12. só quem edita equipamentos aluga e encerra; tudo fica auditado", async () => {
    const { dona, locataria, supervisor, daDona, nb } = await cenario();
    const comum = await ator(daDona.contaId);
    await expect(alugar(comum, nb.id, locataria.id, dona.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    expect(await prisma.aluguelEquipamento.count()).toBe(0);
    expect(await prisma.eventoAuditoria.count({ where: { resultado: "NEGADO", atorContaId: daDona.contaId } })).toBeGreaterThanOrEqual(1);

    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    await alugar(estagiario, nb.id, locataria.id, dona.id);
    const aluguel = await prisma.aluguelEquipamento.findFirstOrThrow({ where: { ativoId: nb.id } });
    await expect(encerrarAluguel(comum, { aluguelId: aluguel.id, motivo: "x" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await encerrarAluguel(supervisor, { aluguelId: aluguel.id, motivo: "Fim" });
    const eventos = await prisma.eventoAuditoria.findMany({ where: { alvoId: nb.id, resultado: "SUCESSO" }, orderBy: { criadoEm: "asc" } });
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(["ativo.alugar_empresa", "ativo.encerrar_aluguel"]));
    expect(eventos.find((e) => e.acao === "ativo.alugar_empresa")?.detalhe).toMatchObject({ locataria: expect.any(String), carregadores: 1 });
  });

  it("13. alocação antiga entre empresas fica como está; o aluguel para a empresa do colaborador a regulariza; o histórico é preservado", async () => {
    const { dona, locataria, supervisor, daDona, nb, c1 } = await cenario();
    const a = await entregar(supervisor, daDona.colaboradorId, [nb.id, c1.id]);
    // O colaborador mudou de empresa depois da entrega (registro anterior a esta regra).
    await prisma.colaborador.update({ where: { id: daDona.colaboradorId }, data: { empresaId: locataria.id } });
    expect(await prisma.alocacao.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: "ATIVA" }); // nada é encerrado em silêncio
    // Um novo equipamento da empresa antiga não vai mais para ele.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(dona.id, 5002) });
    await expect(entregar(supervisor, daDona.colaboradorId, [nb2.id])).rejects.toThrow(BLOQUEIO);
    // Regularização: aluguel para a empresa atual dele, com a alocação mantida.
    await alugar(supervisor, nb.id, locataria.id, dona.id);
    expect(await prisma.itemAlocacao.count({ where: { alocacaoId: a.id, aberto: true } })).toBe(2);
    const ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha).toMatchObject({ situacao: "ALOCADO", responsavel: { id: daDona.colaboradorId }, aluguel: { empresa: { id: locataria.id } } });
    expect(ficha.alugueis).toHaveLength(1);
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: nb.id } })).toBeGreaterThanOrEqual(3); // cadastro, entrega, aluguel
  });
});
