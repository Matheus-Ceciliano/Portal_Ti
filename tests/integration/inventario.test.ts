/**
 * Inventário e alocações no banco: cadastro atômico com carregador, unicidade, fotos privadas,
 * carregadores C1/C2/C3, alocações (entrega, reserva, concorrência), devolução parcial,
 * manutenção com recolhimento físico obrigatório, TER independente da entrega, RBAC e histórico.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { obterArmazenamento } from "@/server/armazenamento";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { cancelarReserva, confirmarEntrega, criarAlocacao, obterAlocacao, registrarDevolucao } from "@/server/modulos/alocacoes";
import {
  adicionarCarregador,
  desvincularCarregador,
  editarEquipamento,
  lerFotoEquipamento,
  liberarAposAvaliacao,
  listarInventario,
  obterEquipamento,
  type DadosEquipamento,
} from "@/server/modulos/inventario";
import { concluirManutencao, enviarParaManutencao, listarManutencoes } from "@/server/modulos/manutencoes";
import { lerPdfTermo } from "@/server/modulos/termos";
import { alugarEquipamento } from "@/server/modulos/alugueis";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, checklistDe, respostasDe, verificacoesDaReserva, verificacoesNovas } from "../apoio/inspecao";
import { concluirAvaliacao } from "@/server/modulos/inspecoes";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

/** PNG 1×1 mínimo válido (assinatura de conteúdo real). */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function cenario() {
  const empresa = await criarEmpresa();
  const outra = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
  // A pessoa é da empresa dos equipamentos: uso por outra empresa só com transferência ou aluguel.
  const pessoa = await criarPessoa({ ativada: true, empresaId: empresa.id });
  return { empresa, outra, supervisor, pessoa };
}

let serie = 0;
const hojeSp = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const notebook = (empresaId: string, n = 5001, extra: Partial<DadosEquipamento> = {}): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5, // código 5: o identificador é gerado (NBI5001, NBI5002...)
  patrimonio: `VLR-9${n}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-T${n}-${++serie}`,
  memoriaRam: "16 GB",
  ...extra,
});
/** Categoria sem identificação automática: nome informado (opcional) ou patrimônio. */
const desktop = (empresaId: string, extra: Partial<DadosEquipamento> = {}): DadosEquipamento => ({
  categoria: "DESKTOP",
  patrimonio: `VLR-8${++serie}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.optiplex,
  ...extra,
});
const monitor = (empresaId: string, n = 7001): DadosEquipamento => ({ categoria: "MONITOR", patrimonio: `VLR-9${n}`, empresaId, marcaId: MARCA.LG, modeloId: MODELO.lg24, numeroSerie: `SIM-M${n}-${++serie}` });

async function carregadoresDe(notebookId: string) {
  return prisma.ativo.findMany({ where: { notebookId }, orderBy: { sequenciaCarregador: "asc" } });
}

async function apagarArquivos(ativoIds: string[]) {
  const fotos = await prisma.fotoAtivo.findMany({ where: { ativoId: { in: ativoIds } }, select: { chave: true } });
  await Promise.all(fotos.map((f) => obterArmazenamento().remover(f.chave)));
}

beforeEach(limparBanco);

describe("cadastro de equipamentos", () => {
  it("notebook nasce com o carregador principal C1 na mesma transação, com histórico e auditoria", async () => {
    const { empresa, supervisor } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id), chaveRequisicao: randomUUID() });
    expect(r).toMatchObject({ nome: "NBI5001", carregador: "NBI5001.C1", repetido: false });
    const [c1] = await carregadoresDe(r.id);
    expect(c1).toMatchObject({ categoria: "CARREGADOR", nomeDispositivo: "NBI5001.C1", sequenciaCarregador: 1, situacao: "DISPONIVEL", empresaId: empresa.id, patrimonio: null });
    const ficha = await obterEquipamento(supervisor, r.id);
    expect(ficha).toMatchObject({ nome: "NBI5001", patrimonio: "VLR-95001", situacao: "DISPONIVEL", responsavel: null, ter: null });
    expect(ficha.carregadores.map((c) => c.nome)).toEqual(["NBI5001.C1"]);
    expect(ficha.movimentacoes.map((m) => m.tipo).sort()).toEqual(["CADASTRO", "CARREGADOR_VINCULADO"]);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "ativo.criar", alvoId: r.id, resultado: "SUCESSO" } })).toBe(1);

    // Outras categorias não ganham carregador.
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    expect(await carregadoresDe(m.id)).toEqual([]);
  });

  it("repetir o mesmo envio (inclusive simultâneo) não duplica equipamento nem carregador", async () => {
    const { empresa, supervisor } = await cenario();
    const chave = randomUUID();
    const r1 = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id), chaveRequisicao: chave });
    const r2 = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id), chaveRequisicao: chave });
    expect(r2).toMatchObject({ id: r1.id, repetido: true });

    const outra = randomUUID();
    const simultaneos = await Promise.all([1, 2, 3].map(() => cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5002), chaveRequisicao: outra })));
    expect(new Set(simultaneos.map((s) => s.id)).size).toBe(1);
    expect(await prisma.ativo.count({ where: { nomeDispositivo: { startsWith: "NBI5002" } } })).toBe(2); // notebook + C1
  });

  it("patrimônio, nome do dispositivo e número de série são únicos (sem diferenciar maiúsculas)", async () => {
    const { empresa, supervisor } = await cenario();
    await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5001, { numeroSerie: "SIM-UNICA" }) });
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5003, { patrimonio: "vlr-95001" }) })).rejects.toThrow(/patrimônio já está cadastrado/);
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5003, { numeroSerie: "sim-unica" }) })).rejects.toThrow(/número de série já está cadastrado/);
    // Categoria sem identificação automática: o nome informado também não repete um gerado (nem o do carregador).
    await expect(cadastrarComInspecao(supervisor, { dados: desktop(empresa.id, { nomeDispositivo: "nbi5001" }) })).rejects.toThrow(/nome de dispositivo já está cadastrado/);
    await expect(cadastrarComInspecao(supervisor, { dados: desktop(empresa.id, { nomeDispositivo: "NBI5001.C1" }) })).rejects.toThrow(/nome de dispositivo/);
    expect(await prisma.ativo.count({ where: { categoria: "NOTEBOOK" } })).toBe(1);
  });

  it("valida o cadastro no servidor: notebook exige processador com código; carregador não é avulso; categoria inativa, empresa inativa e datas", async () => {
    const { empresa, supervisor } = await cenario();
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5001, { processadorId: null }) })).rejects.toThrow(/modelo do processador/);
    // Processador sem código de nomenclatura: a TI configura antes (nenhum código é inventado).
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5001, { processadorId: PROCESSADOR.ryzen5 }) })).rejects.toThrow(/não tem código de nomenclatura/);
    await expect(cadastrarComInspecao(supervisor, { dados: { ...notebook(empresa.id), categoria: "CARREGADOR" } })).rejects.toThrow(/Carregadores nascem com o notebook/);
    await expect(cadastrarComInspecao(supervisor, { dados: desktop(empresa.id, { nomeDispositivo: "NB 5001" }) })).rejects.toThrow(/letras sem acento/);
    await expect(cadastrarComInspecao(supervisor, { dados: desktop(empresa.id, { patrimonio: null }) })).rejects.toThrow(/patrimônio ou o nome/);
    await prisma.categoriaEquipamento.update({ where: { codigo: "MONITOR" }, data: { ativa: false } });
    await expect(cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) })).rejects.toThrow(/Monitor está inativa/);
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5001, { dataAquisicao: "2026-05-01", garantiaAte: "2025-01-01" }) })).rejects.toThrow(/Garantia/);
    await prisma.empresa.update({ where: { id: empresa.id }, data: { ativa: false } });
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) })).rejects.toThrow(/inativa/);
    expect(await prisma.ativo.count()).toBe(0);
  });

  it("fotos: arquivos privados validados pelo conteúdo; o banco guarda só a chave; leitura com permissão", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id), fotos: [{ tipo: "FRONTAL", dados: PNG }, { tipo: "ETIQUETA_SERIE", dados: PNG }] });
    try {
      const fotos = await prisma.fotoAtivo.findMany({ where: { ativoId: r.id } });
      expect(fotos.map((f) => f.tipo).sort()).toEqual(["ETIQUETA_SERIE", "FRONTAL"]);
      expect(fotos.every((f) => /^equipamentos\/[0-9a-f-]{36}\.png$/.test(f.chave) && f.mime === "image/png" && f.contexto === "CADASTRO")).toBe(true);
      expect((await lerFotoEquipamento(supervisor, fotos[0].id))?.dados.equals(PNG)).toBe(true);
      // Quem não está com o equipamento não vê a foto.
      await expect(lerFotoEquipamento(await ator(pessoa.contaId), fotos[0].id)).rejects.toBeInstanceOf(ErroAutorizacao);
      expect((await obterEquipamento(supervisor, r.id)).fotos).toHaveLength(2);
    } finally {
      await apagarArquivos([r.id]);
    }
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5004), fotos: [{ tipo: "TELA", dados: Buffer.from("não é imagem") }] })).rejects.toThrow(/JPG, PNG ou WebP/);
    await expect(
      cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5004), fotos: Array.from({ length: 13 }, () => ({ tipo: "OUTRA", dados: PNG })) }),
    ).rejects.toThrow(/no máximo 12/);
    await expect(cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5004), fotos: [{ tipo: "SELFIE", dados: PNG }] })).rejects.toThrow(/Tipo de foto/);
    expect(await prisma.ativo.count({ where: { categoria: "NOTEBOOK" } })).toBe(1);
  });

  it("edição: o identificador gerado e a empresa proprietária não mudam; o processador muda sem renomear", async () => {
    const { empresa, outra, supervisor } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    await adicionarCarregador(supervisor, { notebookId: r.id });
    await editarEquipamento(supervisor, { id: r.id, dados: notebook(empresa.id, 5001, { nomeDispositivo: "NBI6001", numeroSerie: undefined, processadorId: PROCESSADOR.i7_1355U }) });
    expect(await prisma.ativo.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ nomeDispositivo: "NBI5001", processadorId: PROCESSADOR.i7_1355U, processador: "Intel Core i7-1355U" });
    expect((await carregadoresDe(r.id)).map((c) => [c.nomeDispositivo, c.empresaId])).toEqual([
      ["NBI5001.C1", empresa.id],
      ["NBI5001.C2", empresa.id],
    ]);
    // Mudar a empresa só pela transferência entre empresas (bloqueio no servidor, não só na tela).
    await expect(editarEquipamento(supervisor, { id: r.id, dados: notebook(outra.id, 5001) })).rejects.toThrow(/transferência entre empresas/);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: r.id } })).empresaId).toBe(empresa.id);
    expect(await prisma.movimentacaoAtivo.count({ where: { ativoId: r.id, tipo: "TRANSFERENCIA_EMPRESA" } })).toBe(0);
  });
});

describe("carregadores", () => {
  it("C2 e C3 seguem a sequência; adições simultâneas não repetem posição", async () => {
    const { empresa, supervisor } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    expect((await adicionarCarregador(supervisor, { notebookId: r.id })).nome).toBe("NBI5001.C2");
    const simultaneos = await Promise.all([1, 2, 3].map(() => adicionarCarregador(supervisor, { notebookId: r.id })));
    expect(simultaneos.map((s) => s.nome).sort()).toEqual(["NBI5001.C3", "NBI5001.C4", "NBI5001.C5"]);
    expect((await carregadoresDe(r.id)).map((c) => c.sequenciaCarregador)).toEqual([1, 2, 3, 4, 5]);
  });

  it("perda: carregador baixado, vínculo encerrado e substituto na mesma alocação; o último não sai sem substituto", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const [c1] = await carregadoresDe(r.id);
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [r.id, c1.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([r.id, c1.id]) });

    await expect(desvincularCarregador(supervisor, { carregadorId: c1.id, motivo: "PERDA", observacao: "Esquecido na obra", substituir: false })).rejects.toThrow(/sem carregador vinculado/);
    const { substituto } = await desvincularCarregador(supervisor, { carregadorId: c1.id, motivo: "PERDA", observacao: "Esquecido na obra", substituir: true });
    expect(substituto?.nome).toBe("NBI5001.C2");

    const [antigo, novo] = await carregadoresDe(r.id);
    expect(antigo).toMatchObject({ situacao: "BAIXADO", motivoDesvinculo: "PERDA" });
    expect(antigo.desvinculadoEm).not.toBeNull();
    expect(novo).toMatchObject({ situacao: "ALOCADO", desvinculadoEm: null });
    const detalhe = await obterAlocacao(supervisor, a.id);
    expect(detalhe.estado).toBe("ATIVA");
    expect(detalhe.itens.map((i) => [i.ativo.nome, i.aberto, i.motivoEncerramento])).toEqual(
      expect.arrayContaining([
        ["NBI5001.C1", false, "SUBSTITUICAO"],
        ["NBI5001.C2", true, null],
        ["NBI5001", true, null],
      ]),
    );
  });

  it("troca ou defeito vai para avaliação (nunca direto para disponível)", async () => {
    const { empresa, supervisor } = await cenario();
    const r = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const { id: c2 } = await adicionarCarregador(supervisor, { notebookId: r.id });
    await desvincularCarregador(supervisor, { carregadorId: c2, motivo: "DEFEITO", observacao: "Não carrega", substituir: false });
    const depois = await prisma.ativo.findUniqueOrThrow({ where: { id: c2 } });
    expect(depois).toMatchObject({ situacao: "DEVOLVIDO_EM_AVALIACAO", motivoDesvinculo: "DEFEITO" });
    await expect(liberarAposAvaliacao(supervisor, { ativoId: c2, observacao: "ok" })).rejects.toThrow(/desvinculado/);
    await expect(desvincularCarregador(supervisor, { carregadorId: c2, motivo: "TROCA", observacao: "x", substituir: false })).rejects.toThrow(/já foi desvinculado/);
  });
});

describe("alocações", () => {
  it("entrega de vários equipamentos: custódia na entrega física, empresas preservadas, um TER para a entrega", async () => {
    const { empresa, outra, supervisor, pessoa } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(outra.id) });
    const [c1] = await carregadoresDe(nb.id);
    // Monitor de outra empresa: só com aluguel para a empresa da pessoa (a propriedade continua com a outra).
    await alugarEquipamento(supervisor, { ativoId: mon.id, empresaLocatariaId: empresa.id, inicio: hojeSp(), motivo: "Uso na obra", confirmacao: true, empresaAtualId: outra.id });
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id, c1.id, mon.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id, c1.id, mon.id]), observacoes: "Kit de admissão" });
    expect(a.numero).toBe("AL0001"); // formato curto, sem ano

    const d = await obterAlocacao(supervisor, a.id);
    // Um TER para o evento de entrega (pendente: a pessoa do teste não tem CPF no cadastro).
    expect(d).toMatchObject({ estado: "ATIVA", empresaColaborador: { id: pessoa.empresaId }, termos: [expect.objectContaining({ tipo: "TER", situacao: "PENDENTE_CADASTRO" })] });
    expect(d.entregueEm).not.toBeNull();
    expect(Object.fromEntries(d.itens.map((i) => [i.ativo.nome ?? i.ativo.patrimonio, i.empresaProprietaria.id]))).toEqual({
      NBI5001: empresa.id,
      "NBI5001.C1": empresa.id,
      MNT001: outra.id,
    });
    // A propriedade do patrimônio alugado não muda com a entrega.
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: mon.id } })).empresaId).toBe(outra.id);
    const ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha).toMatchObject({ situacao: "ALOCADO", responsavel: { id: pessoa.colaboradorId, alocacao: a.numero }, reserva: null, ter: expect.objectContaining({ estado: "RASCUNHO" }) });
    const evento = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "alocacao.confirmar_entrega", alvoId: a.id } });
    expect(evento.detalhe).toMatchObject({ modo: "ENTREGAR", equipamentos: 3, equipamentosDeOutraEmpresa: 1 });
  });

  it("reserva não torna ninguém responsável; a confirmação da entrega muda a custódia; cancelar devolve ao estoque", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const amanha = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id], modo: "RESERVAR", data: amanha });
    let ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha).toMatchObject({ situacao: "RESERVADO", responsavel: null, reserva: { id: pessoa.colaboradorId, previstaPara: amanha } });
    await expect(registrarDevolucao(supervisor, { alocacaoId: reserva.id, itens: [] })).rejects.toThrow();
    await confirmarEntrega(supervisor, { alocacaoId: reserva.id, verificacoes: await verificacoesDaReserva(reserva.id) });
    ficha = await obterEquipamento(supervisor, nb.id);
    expect(ficha).toMatchObject({ situacao: "ALOCADO", responsavel: { id: pessoa.colaboradorId }, reserva: null });
    await expect(confirmarEntrega(supervisor, { alocacaoId: reserva.id, verificacoes: await verificacoesDaReserva(reserva.id) })).rejects.toThrow(/Só uma reserva/);
    await expect(cancelarReserva(supervisor, { alocacaoId: reserva.id, motivo: "Desistência" })).rejects.toThrow(/registre a devolução/);

    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const outra = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "RESERVAR" });
    await expect(cancelarReserva(supervisor, { alocacaoId: outra.id, motivo: " " })).rejects.toThrow(/motivo/);
    await cancelarReserva(supervisor, { alocacaoId: outra.id, motivo: "Colaborador não iniciou" });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m.id } })).situacao).toBe("DISPONIVEL");
    expect((await prisma.alocacao.findUniqueOrThrow({ where: { id: outra.id } })).estado).toBe("CANCELADA");
    await expect(criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "RESERVAR", data: "2020-01-01" })).rejects.toThrow(/passado/);
  });

  it("um patrimônio não tem duas alocações abertas, nem com pedidos simultâneos", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const outraPessoa = await criarPessoa({ ativada: true });
    const nb = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const resultados = await Promise.allSettled(
      [pessoa, outraPessoa, pessoa].map(async (p) => criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: p.colaboradorId, ativoIds: [nb.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id]) })),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of resultados.filter((x): x is PromiseRejectedResult => x.status === "rejected")) expect(r.reason).toBeInstanceOf(ErroNegocio);
    expect(await prisma.itemAlocacao.count({ where: { ativoId: nb.id, aberto: true } })).toBe(1);
    // A última barreira é o banco: um segundo item aberto do mesmo equipamento é recusado.
    const aberta = await prisma.alocacao.findFirstOrThrow({ where: { estado: "ATIVA" } });
    await expect(prisma.itemAlocacao.create({ data: { alocacaoId: aberta.id, ativoId: nb.id, empresaProprietariaId: empresa.id } })).rejects.toThrow();
  });

  it("envio duplicado devolve a mesma alocação; equipamento em manutenção não é alocado", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const a1 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id, 7001) });
    const a2 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id, 7002) });
    const chave = randomUUID();
    const pedidos = await Promise.all([1, 2].map(async () => criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [a1.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([a1.id]), chaveRequisicao: chave })));
    expect(new Set(pedidos.map((p) => p.id)).size).toBe(1);
    expect(await prisma.alocacao.count()).toBe(1);

    await enviarParaManutencao(supervisor, { ativoId: a2.id, motivo: "Tela com manchas", observacoes: "Faixas na lateral" });
    await expect(criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [a2.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([a2.id]) })).rejects.toThrow(/em manutenção e não pode ser alocado/);
    await expect(criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [a2.id], modo: "RESERVAR" })).rejects.toThrow(/em manutenção/);
  });
});

describe("devolução", () => {
  it("parcial encerra só os itens devolvidos; a alocação segue ativa até o último item", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const [c1] = await carregadoresDe(nb.id);
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id, c1.id, mon.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id, c1.id, mon.id]) });
    const itens = Object.fromEntries((await obterAlocacao(supervisor, a.id)).itens.map((i) => [i.ativo.id, i.id]));

    const parcial = await registrarDevolucao(supervisor, {
      alocacaoId: a.id,
      itens: [{ itemId: itens[mon.id], estadoFisico: "BOM", destino: "AVALIACAO", fotos: [{ tipo: "OUTRA", dados: PNG }] }],
    });
    try {
      expect(parcial.numero).toMatch(/^DEV-\d{4}-0001$/);
      let d = await obterAlocacao(supervisor, a.id);
      expect(d.estado).toBe("ATIVA");
      expect(d.devolucoes[0]).toMatchObject({ abrangencia: "PARCIAL", itens: 1 });
      expect((await prisma.ativo.findUniqueOrThrow({ where: { id: mon.id } })).situacao).toBe("DEVOLVIDO_EM_AVALIACAO");
      expect((await obterEquipamento(supervisor, nb.id)).responsavel?.id).toBe(pessoa.colaboradorId);
      expect(await prisma.fotoAtivo.count({ where: { ativoId: mon.id, contexto: "DEVOLUCAO", itemDevolucaoId: { not: null } } })).toBe(1);

      await expect(
        registrarDevolucao(supervisor, { alocacaoId: a.id, itens: [{ itemId: itens[nb.id], estadoFisico: "DANIFICADO", destino: "MANUTENCAO" }] }),
      ).rejects.toThrow(/Descreva o problema/);
      await expect(registrarDevolucao(supervisor, { alocacaoId: a.id, itens: [{ itemId: itens[mon.id], estadoFisico: "BOM", destino: "AVALIACAO" }] })).rejects.toThrow(/já foi devolvido/);

      await registrarDevolucao(supervisor, {
        alocacaoId: a.id,
        itens: [
          { itemId: itens[nb.id], estadoFisico: "DANIFICADO", destino: "MANUTENCAO", observacoes: "Tela trincada" },
          { itemId: itens[c1.id], estadoFisico: "BOM", destino: "AVALIACAO" },
        ],
      });
      d = await obterAlocacao(supervisor, a.id);
      expect(d.estado).toBe("ENCERRADA");
      expect(d.itens).toHaveLength(3); // nada é apagado
      expect(d.itens.every((i) => !i.aberto && i.motivoEncerramento === "DEVOLUCAO")).toBe(true);
      const manutencao = await prisma.manutencao.findFirstOrThrow({ where: { ativoId: nb.id } });
      expect(manutencao).toMatchObject({ aberta: true, observacoes: "Tela trincada", recolhidoDeId: pessoa.colaboradorId });
      expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).situacao).toBe("MANUTENCAO");
      // Sem a inspeção técnica, o monitor não sai da avaliação; inspecionado, volta ao estoque.
      await expect(liberarAposAvaliacao(supervisor, { ativoId: mon.id, observacao: "Testado, sem avarias" })).rejects.toThrow(/inspeção técnica/);
      await concluirAvaliacao(supervisor, { ativoId: mon.id, encaminhamento: "DISPONIVEL", inspecao: respostasDe((await checklistDe("MONITOR")).perguntas, { tipo: "DEVOLUCAO" }) });
      expect((await prisma.ativo.findUniqueOrThrow({ where: { id: mon.id } })).situacao).toBe("DISPONIVEL");
    } finally {
      await apagarArquivos([mon.id]);
    }
  });
});

describe("manutenção", () => {
  it("sem alocação: registra e a conclusão devolve ao estoque sem criar alocação", async () => {
    const { empresa, supervisor } = await cenario();
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await expect(enviarParaManutencao(supervisor, { ativoId: m.id, motivo: "", observacoes: "x" })).rejects.toThrow(/motivo/);
    await expect(enviarParaManutencao(supervisor, { ativoId: m.id, motivo: "Sem imagem", observacoes: " " })).rejects.toThrow(/observações/);
    const r = await enviarParaManutencao(supervisor, { ativoId: m.id, motivo: "Sem imagem", observacoes: "Não liga" });
    expect(r.alocacaoEncerrada).toBeNull();
    await expect(enviarParaManutencao(supervisor, { ativoId: m.id, motivo: "De novo", observacoes: "x" })).rejects.toThrow(/já está em manutenção/);
    expect((await listarManutencoes(supervisor)).linhas.map((l) => l.ativo.id)).toEqual([m.id]);

    await expect(concluirManutencao(supervisor, { manutencaoId: r.id, resultado: "REPARADO", servicoRealizado: "" })).rejects.toThrow(/serviço realizado/);
    await concluirManutencao(supervisor, { manutencaoId: r.id, resultado: "REPARADO", servicoRealizado: "Cabo substituído" });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m.id } })).situacao).toBe("DISPONIVEL");
    expect(await prisma.alocacao.count()).toBe(0);
    await expect(concluirManutencao(supervisor, { manutencaoId: r.id, resultado: "REPARADO", servicoRealizado: "x" })).rejects.toThrow(/já foi concluída/);
    expect((await listarManutencoes(supervisor, { situacao: "CONCLUIDA" })).linhas[0]).toMatchObject({ resultado: "REPARADO", servicoRealizado: "Cabo substituído" });
  });

  it("com alocação ativa: sem confirmação do recolhimento nada muda; confirmado, encerra o item e preserva o TER", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const [c1] = await carregadoresDe(nb.id);
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id, c1.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id, c1.id]) });
    const terAntes = await prisma.termo.findFirstOrThrow({ where: { alocacaoId: a.id } });

    await expect(enviarParaManutencao(supervisor, { ativoId: nb.id, motivo: "Teclado falhando", observacoes: "Teclas sem resposta" })).rejects.toThrow(/Confirme o recolhimento físico/);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).situacao).toBe("ALOCADO");
    expect(await prisma.manutencao.count()).toBe(0);

    const r = await enviarParaManutencao(supervisor, { ativoId: nb.id, motivo: "Teclado falhando", observacoes: "Teclas sem resposta", confirmarRecolhimento: true });
    expect(r.alocacaoEncerrada).toBe(a.numero);
    const d = await obterAlocacao(supervisor, a.id);
    expect(d.itens.find((i) => i.ativo.id === nb.id)).toMatchObject({ aberto: false, motivoEncerramento: "MANUTENCAO" });
    expect(d.estado).toBe("ATIVA"); // o carregador continua com a pessoa
    expect(d.termos[0]).toMatchObject({ numero: terAntes.numero, estado: terAntes.estado }); // TER não muda
    const m = await prisma.manutencao.findUniqueOrThrow({ where: { id: r.id } });
    expect(m).toMatchObject({ recolhidoDeId: pessoa.colaboradorId, abertaPorNome: supervisor.nome });
    expect(m.recolhimentoConfirmadoEm).not.toBeNull();
    const mov = await prisma.movimentacaoAtivo.findFirstOrThrow({ where: { ativoId: nb.id, tipo: "ENVIO_MANUTENCAO" } });
    expect(mov).toMatchObject({ colaboradorId: pessoa.colaboradorId, situacaoAnterior: "ALOCADO", situacaoNova: "MANUTENCAO", realizadoPorNome: supervisor.nome });
    expect(mov.observacao).toContain("Teclado falhando");
    // Reservado não vai para manutenção sem cancelar a reserva.
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [mon.id], modo: "RESERVAR" });
    await expect(enviarParaManutencao(supervisor, { ativoId: mon.id, motivo: "x", observacoes: "y" })).rejects.toThrow(/cancele a reserva/);
    await concluirManutencao(supervisor, { manutencaoId: r.id, resultado: "SEM_REPARO", servicoRealizado: "Placa danificada" });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: nb.id } })).situacao).toBe("BAIXADO");
  });
});

describe("TER e entrega", () => {
  it("entrega independe do TER: o termo pendente não bloqueia a custódia; reserva sem TER; o banco recusa assinado sem PDF", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([m.id]) });
    // Pessoa sem CPF no cadastro: o TER fica pendente e a entrega continua registrada.
    const d = await obterAlocacao(supervisor, a.id);
    expect(d.estado).toBe("ATIVA");
    expect(d.termos).toEqual([expect.objectContaining({ tipo: "TER", situacao: "PENDENTE_CADASTRO", temPdf: false, temPdfEmitido: false })]);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m.id } })).situacao).toBe("ALOCADO");
    // Sem PDF assinado conferido não há o que baixar.
    expect(await lerPdfTermo(await ator(pessoa.contaId), d.termos[0].id)).toBeNull();
    await expect(prisma.termo.create({ data: { numero: "TER-TESTE-1", tipo: "TER", alocacaoId: a.id, colaboradorId: pessoa.colaboradorId, estado: "ASSINADO" } })).rejects.toThrow();

    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id, 7002) });
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [mon.id], modo: "RESERVAR" });
    expect((await obterAlocacao(supervisor, reserva.id)).termos).toEqual([]);
  });
});

describe("lista do inventário", () => {
  it("sem custódia nem TER; indicadores ignoram o filtro de situação; rankings seguem os filtros; patrimônio pesquisável", async () => {
    const { empresa, outra, supervisor, pessoa } = await cenario();
    const entregue = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5001) });
    await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id, 5002) });
    await cadastrarComInspecao(supervisor, { dados: notebook(outra.id, 5003, { marcaId: MARCA.Lenovo, modeloId: MODELO.thinkpadE14 }) });
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [entregue.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([entregue.id]) });
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [mon.id], modo: "RESERVAR" });

    // Cada peça física é um registro próprio na lista: os carregadores C1 também aparecem.
    const tudo = await listarInventario(supervisor);
    expect(tudo.total).toBe(7);
    expect(Object.keys(tudo.linhas[0]).sort()).toEqual(["categoria", "empresa", "especificacao", "formato", "id", "instaladoEm", "marca", "miniatura", "modelo", "nome", "patrimonio", "situacao", "tipo"]);
    expect(tudo.indicadores).toMatchObject({ total: 7, disponiveis: 5, alocados: 1, reservados: 1, manutencao: 0, baixados: 0 });
    expect(tudo.indicadores.porTipo.map((t) => [t.nome, t.total])).toEqual([
      ["Notebook", 3],
      ["Carregador de notebook", 3],
      ["Monitor", 1],
    ]);

    const disponiveis = await listarInventario(supervisor, { situacao: "DISPONIVEL" });
    expect(disponiveis.total).toBe(5);
    expect(disponiveis.indicadores).toMatchObject({ total: 7, disponiveis: 5, alocados: 1, reservados: 1 });
    expect(disponiveis.indicadores.porTipo.map((t) => [t.nome, t.total])).toEqual([
      ["Carregador de notebook", 3],
      ["Notebook", 2],
    ]);
    expect(disponiveis.indicadores.porEmpresa.map((e) => [e.id, e.total]).sort()).toEqual([[empresa.id, 3], [outra.id, 2]].sort());
    expect(disponiveis.indicadores.porMarca).toEqual(expect.arrayContaining([{ marca: "Dell", total: 3 }, { marca: "Lenovo", total: 2 }]));

    const daEmpresa = await listarInventario(supervisor, { empresaId: empresa.id });
    expect(daEmpresa.indicadores).toMatchObject({ total: 5, disponiveis: 3, alocados: 1, reservados: 1 });
    expect(daEmpresa.indicadores.porEmpresa).toEqual([expect.objectContaining({ id: empresa.id, total: 5 })]);

    expect((await listarInventario(supervisor, { busca: "vlr-95002" })).linhas.map((l) => l.nome)).toEqual(["NBI5002"]);
    expect((await listarInventario(supervisor, { busca: "thinkpad" })).linhas.map((l) => l.nome)).toEqual(["NBI5003"]);
    // Responsável não é critério de pesquisa do inventário (fica em Alocações).
    const { nome } = await prisma.colaborador.findUniqueOrThrow({ where: { id: pessoa.colaboradorId }, select: { nome: true } });
    expect((await listarInventario(supervisor, { busca: nome })).total).toBe(0);
    const carregador = await prisma.categoriaEquipamento.findUniqueOrThrow({ where: { codigo: "CARREGADOR" } });
    expect((await listarInventario(supervisor, { categoriaId: carregador.id })).total).toBe(3);
  });
});

describe("permissões e histórico", () => {
  it("colaborador comum não cadastra, não aloca nem vê o inventário; vê só o equipamento que está com ele", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const comum = await ator(pessoa.contaId);
    await expect(cadastrarComInspecao(comum, { dados: notebook(empresa.id) })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(listarInventario(comum)).rejects.toBeInstanceOf(ErroAutorizacao);
    const nb = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await expect(criarAlocacao(comum, { responsavelTiContaId: comum.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id]) })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(enviarParaManutencao(comum, { ativoId: nb.id, motivo: "x", observacoes: "y" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(obterEquipamento(comum, nb.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([nb.id]) });
    expect((await obterEquipamento(comum, nb.id)).id).toBe(nb.id);
    expect(await prisma.eventoAuditoria.count({ where: { resultado: "NEGADO", atorContaId: pessoa.contaId } })).toBeGreaterThanOrEqual(4);

    // O Estagiário opera o inventário no dia a dia (PM §12).
    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    const r = await cadastrarComInspecao(estagiario, { dados: notebook(empresa.id, 5009) });
    await criarAlocacao(estagiario, { responsavelTiContaId: estagiario.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [r.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([r.id]) });
  });

  it("o histórico de movimentações é somente inserção", async () => {
    const { empresa, supervisor } = await cenario();
    await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await expect(prisma.movimentacaoAtivo.updateMany({ data: { observacao: "alterado" } })).rejects.toThrow();
    await expect(prisma.movimentacaoAtivo.deleteMany()).rejects.toThrow();
    expect(await prisma.movimentacaoAtivo.count()).toBe(1);
  });
});
