/**
 * Transferências do equipamento no banco: entre colaboradores (entrega física na mesma
 * transação ou reserva sem encerrar a custódia, Q-27) e entre empresas (só a proprietária muda).
 * Bloqueios, concorrência, carregadores, termos, histórico e permissões no servidor.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { criarAlocacao, registrarDevolucao } from "@/server/modulos/alocacoes";
import { adicionarCarregador, type DadosEquipamento } from "@/server/modulos/inventario";
import { concluirManutencao, enviarParaManutencao } from "@/server/modulos/manutencoes";
import { cancelarTransferencia, confirmarTransferencia, transferirColaborador, transferirEmpresa } from "@/server/modulos/transferencias";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, verificacoesNovas } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

let serie = 0;
const notebook = (empresaId: string, n = 5001): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5, // código 5: o identificador é gerado (NBI5001, NBI5002...)
  patrimonio: `VLR-9${n}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-T${n}-${++serie}`,
});

async function cenario() {
  const empresa = await criarEmpresa();
  const outra = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
  // Colaboradores da empresa dos equipamentos (uso por outra empresa exige transferência ou aluguel).
  const ana = await criarPessoa({ ativada: true, empresaId: empresa.id });
  const bruno = await criarPessoa({ ativada: true, empresaId: empresa.id });
  const carla = await criarPessoa({ ativada: true, empresaId: empresa.id });
  return { empresa, outra, supervisor, ana, bruno, carla };
}

/** Notebook com o C1, entregue (os dois na mesma alocação). */
async function entregue(supervisor: Ator, empresaId: string, colaboradorId: string, n = 5001) {
  const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresaId, n) });
  const c1 = await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } });
  const alo = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId, ativoIds: [nb.id, c1.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id, c1.id]) });
  return { nb, c1, alo };
}

const abertos = (ativoId: string) => prisma.itemAlocacao.findMany({ where: { ativoId, aberto: true }, include: { alocacao: true } });
const ativo = (id: string) => prisma.ativo.findUniqueOrThrow({ where: { id } });

beforeEach(limparBanco);

describe("transferência entre colaboradores", () => {
  it("entrega física: encerra a alocação anterior e cria a nova na mesma operação; carregador junto; termo anterior intacto", async () => {
    const { empresa, supervisor, ana, bruno } = await cenario();
    const { nb, c1, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const ter = await prisma.termo.create({
      data: { numero: "TER-TESTE-1", tipo: "TER", alocacaoId: alo.id, colaboradorId: ana.colaboradorId, estado: "EMITIDO", emitidoEm: new Date() },
    });

    const r = await transferirColaborador(supervisor, {
      ativoId: nb.id,
      colaboradorId: bruno.colaboradorId,
      modo: "ENTREGAR",
      confirmacaoFisica: true,
      alocacaoAtualId: alo.id,
      observacoes: "Mudança de equipe",
    });
    expect(r).toMatchObject({ resultado: "CONCLUIDA", repetido: false });

    const antiga = await prisma.alocacao.findUniqueOrThrow({ where: { id: alo.id }, include: { itens: true } });
    expect(antiga.estado).toBe("ENCERRADA");
    expect(antiga.itens.map((i) => [i.aberto, i.motivoEncerramento])).toEqual([
      [null, "TRANSFERENCIA"],
      [null, "TRANSFERENCIA"],
    ]);
    for (const id of [nb.id, c1.id]) {
      const itens = await abertos(id);
      expect(itens).toHaveLength(1); // nunca duas alocações abertas
      expect(itens[0].alocacao).toMatchObject({ numero: r.numero, estado: "ATIVA", colaboradorId: bruno.colaboradorId });
      expect(itens[0].empresaProprietariaId).toBe(empresa.id);
      expect((await ativo(id)).situacao).toBe("ALOCADO");
    }
    // Termo anterior não é apagado nem alterado; a nova alocação começa sem TER.
    expect(await prisma.termo.findUniqueOrThrow({ where: { id: ter.id } })).toMatchObject({ estado: "EMITIDO", alocacaoId: alo.id });
    expect(await prisma.termo.count({ where: { alocacao: { numero: r.numero! } } })).toBe(0);

    expect(await prisma.transferencia.findFirstOrThrow({ where: { ativoId: nb.id } })).toMatchObject({
      tipo: "COLABORADOR",
      estado: "CONCLUIDA",
      pendente: null,
      colaboradorOrigemId: ana.colaboradorId,
      colaboradorDestinoId: bruno.colaboradorId,
      alocacaoOrigemId: alo.id,
      motivo: "Mudança de equipe",
      realizadaPorNome: supervisor.nome,
    });
    const mov = await prisma.movimentacaoAtivo.findFirstOrThrow({ where: { ativoId: nb.id, tipo: "TRANSFERENCIA_COLABORADOR" } });
    expect(mov).toMatchObject({ colaboradorId: bruno.colaboradorId, realizadoPorNome: supervisor.nome });
    expect(mov.observacao).toContain(alo.numero);
    // Histórico de ambos preservado: as movimentações da entrega à Ana continuam.
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: nb.id, tipo: "ENTREGA", colaboradorId: ana.colaboradorId } })).toBe(1);
    // Carregadores: o mesmo C1, sem novo carregador nem renumeração.
    expect((await prisma.ativo.findMany({ where: { notebookId: nb.id } })).map((c) => [c.nomeDispositivo, c.sequenciaCarregador])).toEqual([["NBI5001.C1", 1]]);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "ativo.transferir_colaborador", resultado: "SUCESSO" } })).toBe(1);
  });

  it("recusa mesmo colaborador, desligado, falta de confirmação física e alocação desatualizada, sem gravar nada", async () => {
    const { empresa, supervisor, ana, bruno, carla } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const base = { ativoId: nb.id, modo: "ENTREGAR" as const, confirmacaoFisica: true, alocacaoAtualId: alo.id };
    await expect(transferirColaborador(supervisor, { ...base, colaboradorId: ana.colaboradorId })).rejects.toThrow(/diferente do atual/);
    await prisma.colaborador.update({ where: { id: carla.colaboradorId }, data: { situacao: "DESLIGADO" } });
    await expect(transferirColaborador(supervisor, { ...base, colaboradorId: carla.colaboradorId })).rejects.toThrow(/desligado/);
    await expect(transferirColaborador(supervisor, { ...base, colaboradorId: bruno.colaboradorId, confirmacaoFisica: false })).rejects.toThrow(/Confirme a devolução/);
    await expect(transferirColaborador(supervisor, { ...base, colaboradorId: bruno.colaboradorId, alocacaoAtualId: randomUUID() })).rejects.toThrow(/movimentado por outra pessoa/);
    await expect(transferirColaborador(supervisor, { ...base, colaboradorId: "" })).rejects.toThrow(/novo colaborador/);
    expect((await abertos(nb.id))[0].alocacaoId).toBe(alo.id);
    expect(await prisma.transferencia.count()).toBe(0);
  });

  it("reserva: a custódia atual continua até a entrega física; depois, confirmar ou cancelar", async () => {
    const { empresa, supervisor, ana, bruno, carla } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const r = await transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "RESERVAR", alocacaoAtualId: alo.id });
    expect(r.resultado).toBe("RESERVADA");
    expect((await abertos(nb.id)).map((i) => i.alocacaoId)).toEqual([alo.id]); // nada encerrado antes da entrega
    expect((await prisma.alocacao.findUniqueOrThrow({ where: { id: alo.id } })).estado).toBe("ATIVA");
    const pendente = await prisma.transferencia.findFirstOrThrow({ where: { ativoId: nb.id } });
    expect(pendente).toMatchObject({ estado: "PENDENTE", pendente: true, colaboradorDestinoId: bruno.colaboradorId });

    // Uma pendência por vez.
    await expect(transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: carla.colaboradorId, modo: "RESERVAR", alocacaoAtualId: alo.id })).rejects.toThrow(/transferência reservada/);
    await expect(
      transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: carla.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: alo.id }),
    ).rejects.toThrow(/transferência reservada/);

    await expect(confirmarTransferencia(supervisor, { transferenciaId: pendente.id, confirmacaoFisica: false })).rejects.toThrow(/Confirme a devolução/);
    const c = await confirmarTransferencia(supervisor, { transferenciaId: pendente.id, confirmacaoFisica: true });
    const agora = await abertos(nb.id);
    expect(agora).toHaveLength(1);
    expect(agora[0].alocacao).toMatchObject({ numero: c.numero, colaboradorId: bruno.colaboradorId, estado: "ATIVA" });
    expect(await prisma.transferencia.findUniqueOrThrow({ where: { id: pendente.id } })).toMatchObject({ estado: "CONCLUIDA", pendente: null, alocacaoDestinoId: agora[0].alocacaoId });
    await expect(confirmarTransferencia(supervisor, { transferenciaId: pendente.id, confirmacaoFisica: true })).rejects.toThrow(/já foi concluída/);

    // Nova reserva e cancelamento: a custódia fica com quem está.
    await transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: carla.colaboradorId, modo: "RESERVAR", alocacaoAtualId: agora[0].alocacaoId });
    const outra = await prisma.transferencia.findFirstOrThrow({ where: { ativoId: nb.id, pendente: true } });
    await expect(cancelarTransferencia(supervisor, { transferenciaId: outra.id, motivo: "  " })).rejects.toThrow(/motivo/);
    await cancelarTransferencia(supervisor, { transferenciaId: outra.id, motivo: "Mudou de área" });
    expect(await prisma.transferencia.findUniqueOrThrow({ where: { id: outra.id } })).toMatchObject({ estado: "CANCELADA", pendente: null, motivoCancelamento: "Mudou de área" });
    expect((await abertos(nb.id))[0].alocacao.colaboradorId).toBe(bruno.colaboradorId);

    // Histórico de transferências: não se apaga nem se reescreve.
    await expect(prisma.transferencia.deleteMany()).rejects.toThrow();
    await expect(prisma.transferencia.update({ where: { id: pendente.id }, data: { motivo: "alterado" } })).rejects.toThrow();
    expect(await prisma.transferencia.count()).toBe(2);
  });

  it("devolução e envio para manutenção cancelam a transferência reservada", async () => {
    const { empresa, supervisor, ana, bruno } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    await transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "RESERVAR", alocacaoAtualId: alo.id });
    const [item] = await abertos(nb.id);
    await registrarDevolucao(supervisor, { alocacaoId: alo.id, itens: [{ itemId: item.id, estadoFisico: "BOM", destino: "AVALIACAO" }] });
    const t = await prisma.transferencia.findFirstOrThrow({ where: { ativoId: nb.id } });
    expect(t).toMatchObject({ estado: "CANCELADA", pendente: null });
    expect(t.motivoCancelamento).toMatch(/devolução registrada/);

    const segundo = await entregue(supervisor, empresa.id, ana.colaboradorId, 5002);
    await transferirColaborador(supervisor, { ativoId: segundo.nb.id, colaboradorId: bruno.colaboradorId, modo: "RESERVAR", alocacaoAtualId: segundo.alo.id });
    await enviarParaManutencao(supervisor, { ativoId: segundo.nb.id, motivo: "Tela", observacoes: "Trincada", confirmarRecolhimento: true });
    expect((await prisma.transferencia.findFirstOrThrow({ where: { ativoId: segundo.nb.id } })).estado).toBe("CANCELADA");
  });

  it("só se transfere de colaborador a partir de alocação ativa; reservado e carregador vinculado também não", async () => {
    const { empresa, outra, supervisor, ana, bruno } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const m = await enviarParaManutencao(supervisor, { ativoId: nb.id, motivo: "Teclado", observacoes: "Teclas falhando" });
    const estoque = { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR" as const, alocacaoAtualId: null };
    await expect(transferirColaborador(supervisor, estoque)).rejects.toThrow(/alocação ativa/);
    // A propriedade pode mudar durante a manutenção; só o baixado é bloqueado.
    await transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: outra.id, motivo: "Rateio", confirmacao: true, empresaAtualId: empresa.id });
    await concluirManutencao(supervisor, { manutencaoId: m.id, resultado: "SEM_REPARO", servicoRealizado: "Placa sem conserto" });
    expect((await ativo(nb.id)).situacao).toBe("BAIXADO");
    await expect(transferirColaborador(supervisor, estoque)).rejects.toThrow(/alocação ativa/);
    await expect(transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: empresa.id, motivo: "Volta", confirmacao: true, empresaAtualId: outra.id })).rejects.toThrow(/baixado/);

    const reservado = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5002) });
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [reservado.id], modo: "RESERVAR" });
    await expect(transferirColaborador(supervisor, { ...estoque, ativoId: reservado.id, alocacaoAtualId: reserva.id, confirmacaoFisica: true })).rejects.toThrow(/reservado/i);

    const { c1, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId, 5003);
    await expect(
      transferirColaborador(supervisor, { ativoId: c1.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: alo.id }),
    ).rejects.toThrow(/acompanha o notebook/);
    await expect(transferirEmpresa(supervisor, { ativoId: c1.id, empresaDestinoId: outra.id, motivo: "x", confirmacao: true, empresaAtualId: empresa.id })).rejects.toThrow(/acompanha o notebook/);
  });

  it("em estoque não há transferência: a entrega é uma nova alocação", async () => {
    const { empresa, supervisor, bruno } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    await expect(transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR", alocacaoAtualId: null })).rejects.toThrow(
      /a partir de uma alocação ativa/,
    );
    expect(await prisma.alocacao.count()).toBe(0);
    expect(await prisma.transferencia.count()).toBe(0);
  });

  it("duas transferências simultâneas do mesmo equipamento: só uma passa e nunca há duas alocações abertas", async () => {
    const { empresa, supervisor, ana, bruno, carla } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const resultados = await Promise.allSettled(
      [bruno, carla].map((p) =>
        transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: p.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: alo.id }),
      ),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(recusa.reason)).toMatch(/movimentado por outra pessoa/);
    expect(await abertos(nb.id)).toHaveLength(1);
    expect(await prisma.alocacao.count({ where: { estado: "ATIVA", itens: { some: { ativoId: nb.id, aberto: true } } } })).toBe(1);
    expect(await prisma.transferencia.count()).toBe(1);

    // Reservas simultâneas: uma só pendência.
    const atual = (await abertos(nb.id))[0].alocacaoId;
    const reservas = await Promise.allSettled(
      [ana, carla].map((p) => transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: p.colaboradorId, modo: "RESERVAR", alocacaoAtualId: atual })),
    );
    // Seja quem for o atual, só uma reserva passa (a outra esbarra na pendência ou no mesmo colaborador).
    expect(reservas.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.transferencia.count({ where: { pendente: true } })).toBe(1);
  });

  it("o mesmo envio repetido devolve a transferência já registrada", async () => {
    const { empresa, supervisor, ana, bruno } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const entrada = { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR" as const, confirmacaoFisica: true, alocacaoAtualId: alo.id, chaveRequisicao: randomUUID() };
    const [a, b] = await Promise.all([transferirColaborador(supervisor, entrada), transferirColaborador(supervisor, entrada)]);
    expect([a.repetido, b.repetido].sort()).toEqual([false, true]);
    expect(a.numero).toBe(b.numero);
    expect(await prisma.transferencia.count()).toBe(1);
  });
});

describe("transferência entre empresas", () => {
  it("muda só a proprietária, e só para a empresa de quem está com o equipamento; alocação e responsável ficam; carregadores sem patrimônio acompanham, com patrimônio só se escolhidos", async () => {
    const { empresa, outra, supervisor, ana } = await cenario();
    const terceira = await criarEmpresa();
    const { nb, c1, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const c2 = await adicionarCarregador(supervisor, { notebookId: nb.id });
    await prisma.ativo.update({ where: { id: c2.id }, data: { patrimonio: "VLR-9C2" } });

    // Com a Ana (da empresa atual), a propriedade não vai para outra empresa: nada muda em silêncio.
    await expect(transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: outra.id, motivo: "Rateio", confirmacao: true, empresaAtualId: empresa.id })).rejects.toThrow(
      /só pode passar para a empresa do colaborador/,
    );
    expect((await ativo(nb.id)).empresaId).toBe(empresa.id);
    expect(await prisma.transferencia.count({ where: { tipo: "EMPRESA" } })).toBe(0);

    // A Ana passou a trabalhar na outra empresa (vínculo registrado em Pessoas): a transferência regulariza o uso.
    await prisma.colaborador.update({ where: { id: ana.colaboradorId }, data: { empresaId: outra.id } });
    const r = await transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: outra.id, motivo: "  Rateio de custos  ", confirmacao: true, empresaAtualId: empresa.id });
    expect(r).toMatchObject({ de: empresa.nome, para: outra.nome, repetido: false });
    expect((await ativo(nb.id)).empresaId).toBe(outra.id);
    expect((await ativo(c1.id)).empresaId).toBe(outra.id); // sem patrimônio: acompanha
    expect((await ativo(c2.id)).empresaId).toBe(empresa.id); // com patrimônio, não escolhido: fica
    // Alocação e responsável não mudam; o item guarda a proprietária da data da entrega.
    const [item] = await abertos(nb.id);
    expect(item).toMatchObject({ alocacaoId: alo.id, empresaProprietariaId: empresa.id });
    expect(item.alocacao).toMatchObject({ estado: "ATIVA", colaboradorId: ana.colaboradorId });
    // A empresa do colaborador nunca muda por transferência de equipamento.
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: ana.colaboradorId } })).empresaId).toBe(outra.id);

    expect(await prisma.transferencia.findFirstOrThrow({ where: { ativoId: nb.id, tipo: "EMPRESA" } })).toMatchObject({
      estado: "CONCLUIDA",
      empresaOrigemId: empresa.id,
      empresaOrigemNome: empresa.nome,
      empresaDestinoId: outra.id,
      empresaDestinoNome: outra.nome,
      motivo: "Rateio de custos",
      realizadaPorNome: supervisor.nome,
    });
    const mov = await prisma.movimentacaoAtivo.findFirstOrThrow({ where: { ativoId: nb.id, tipo: "TRANSFERENCIA_EMPRESA" } });
    expect(mov.observacao).toContain("Rateio de custos");
    expect(mov.observacao).toContain("NBI5001.C2 (VLR-9C2)"); // mantido, registrado
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: c1.id, tipo: "TRANSFERENCIA_EMPRESA" } })).toBe(1);

    // Em estoque, escolhido explicitamente, o carregador com patrimônio também muda.
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5002) });
    const c2b = await adicionarCarregador(supervisor, { notebookId: nb2.id });
    await prisma.ativo.update({ where: { id: c2b.id }, data: { patrimonio: "VLR-9C2B" } });
    const [c1b] = await prisma.ativo.findMany({ where: { notebookId: nb2.id, sequenciaCarregador: 1 } });
    await transferirEmpresa(supervisor, { ativoId: nb2.id, empresaDestinoId: terceira.id, motivo: "Venda interna", confirmacao: true, empresaAtualId: empresa.id, carregadoresComPatrimonio: [c2b.id] });
    expect([(await ativo(nb2.id)).empresaId, (await ativo(c1b.id)).empresaId, (await ativo(c2b.id)).empresaId]).toEqual([terceira.id, terceira.id, terceira.id]);
    // Vínculos e sequência intactos.
    expect((await prisma.ativo.findMany({ where: { notebookId: nb2.id }, orderBy: { sequenciaCarregador: "asc" } })).map((c) => c.nomeDispositivo)).toEqual(["NBI5002.C1", "NBI5002.C2"]);
    expect(await prisma.transferencia.count({ where: { tipo: "EMPRESA" } })).toBe(2);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "ativo.transferir_empresa", resultado: "SUCESSO" } })).toBe(2);
  });

  it("exige destino, motivo e confirmação; recusa a mesma empresa, empresa inativa e dados desatualizados, sem gravar nada", async () => {
    const { empresa, outra, supervisor } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const base = { ativoId: nb.id, empresaDestinoId: outra.id, motivo: "Rateio", confirmacao: true, empresaAtualId: empresa.id };
    await expect(transferirEmpresa(supervisor, { ...base, empresaDestinoId: "" })).rejects.toThrow(/empresa de destino/);
    await expect(transferirEmpresa(supervisor, { ...base, motivo: "   " })).rejects.toThrow(/motivo/);
    await expect(transferirEmpresa(supervisor, { ...base, confirmacao: false })).rejects.toThrow(/Confirme/);
    await expect(transferirEmpresa(supervisor, { ...base, empresaDestinoId: empresa.id })).rejects.toThrow(/diferente da atual/);
    await expect(transferirEmpresa(supervisor, { ...base, empresaAtualId: outra.id })).rejects.toThrow(/movimentado por outra pessoa/);
    await prisma.empresa.update({ where: { id: outra.id }, data: { ativa: false } });
    await expect(transferirEmpresa(supervisor, base)).rejects.toThrow(/inativa/);
    expect((await ativo(nb.id)).empresaId).toBe(empresa.id);
    expect(await prisma.transferencia.count()).toBe(0);
  });

  it("duas transferências simultâneas: só uma passa", async () => {
    const { empresa, outra, supervisor } = await cenario();
    const terceira = await criarEmpresa();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const resultados = await Promise.allSettled(
      [outra, terceira].map((d) => transferirEmpresa(supervisor, { ativoId: nb.id, empresaDestinoId: d.id, motivo: "Rateio", confirmacao: true, empresaAtualId: empresa.id })),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.transferencia.count()).toBe(1);
    const final = (await ativo(nb.id)).empresaId;
    expect((await prisma.transferencia.findFirstOrThrow()).empresaDestinoId).toBe(final);
  });
});

describe("permissões no servidor", () => {
  it("colaborador comum não transfere nem confirma; o Estagiário TI opera as transferências", async () => {
    const { empresa, outra, supervisor, ana, bruno } = await cenario();
    const { nb, alo } = await entregue(supervisor, empresa.id, ana.colaboradorId);
    const comum = await ator(ana.contaId);
    await expect(
      transferirColaborador(comum, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: alo.id }),
    ).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(transferirEmpresa(comum, { ativoId: nb.id, empresaDestinoId: outra.id, motivo: "x", confirmacao: true, empresaAtualId: empresa.id })).rejects.toBeInstanceOf(ErroAutorizacao);
    await transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "RESERVAR", alocacaoAtualId: alo.id });
    const pendente = await prisma.transferencia.findFirstOrThrow({ where: { pendente: true } });
    await expect(confirmarTransferencia(comum, { transferenciaId: pendente.id, confirmacaoFisica: true })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(cancelarTransferencia(comum, { transferenciaId: pendente.id, motivo: "x" })).rejects.toBeInstanceOf(ErroAutorizacao);
    expect(await prisma.eventoAuditoria.count({ where: { resultado: "NEGADO", atorContaId: ana.contaId } })).toBeGreaterThanOrEqual(4);
    expect((await abertos(nb.id))[0].alocacaoId).toBe(alo.id);

    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    await confirmarTransferencia(estagiario, { transferenciaId: pendente.id, confirmacaoFisica: true });
    // Em estoque, a propriedade muda pelo Estagiário TI (com o Bruno, só para a empresa dele).
    const nb2 = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5002) });
    await transferirEmpresa(estagiario, { ativoId: nb2.id, empresaDestinoId: outra.id, motivo: "Rateio", confirmacao: true, empresaAtualId: empresa.id });
    expect((await ativo(nb2.id)).empresaId).toBe(outra.id);
  });
});
