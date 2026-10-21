/**
 * Inspeções técnicas sobre o checklist configurável: entrada (novo/usado), respostas explícitas
 * e justificadas, devolução com inspeção pendente (sem bloquear o recebimento), verificação de
 * cada item na entrega física e preservação do histórico e do instantâneo da entrega.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { perguntasAplicaveis } from "@/lib/inspecao";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { prisma } from "@/server/db";
import { confirmarEntrega, criarAlocacao, obterAlocacao, registrarDevolucao } from "@/server/modulos/alocacoes";
import { concluirAvaliacao, condicoesParaEntrega } from "@/server/modulos/inspecoes";
import { cadastrarEquipamento, liberarAposAvaliacao, type DadosEquipamento } from "@/server/modulos/inventario";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, checklistDe, inspecoesDeEntrada, respostasDe, verificacoesConfirmando, verificacoesDaReserva, verificacoesNovas } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

let serie = 0;
const monitor = (empresaId: string): DadosEquipamento => ({ categoria: "MONITOR", patrimonio: `VLR-I${++serie}`, empresaId, marcaId: MARCA.LG, modeloId: MODELO.lg24, numeroSerie: `SIM-I${serie}` });
const notebook = (empresaId: string): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5,
  patrimonio: `VLR-N${++serie}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-N${serie}`,
});

async function cenario() {
  const empresa = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
  const pessoa = await criarPessoa({ ativada: true, empresaId: empresa.id });
  return { empresa, supervisor, pessoa };
}

const USADO = { tipo: "ENTRADA" as const, condicao: "USADO" as const };
const NOVO = { tipo: "ENTRADA" as const, condicao: "NOVO" as const };
const nc = (justificativa: string) => ({ resposta: "NAO_CONFORME" as const, justificativa });

beforeEach(limparBanco);

describe("inspeção de entrada", () => {
  it("exige a condição de entrada e respostas explícitas; novo dispensa os testes de usado", async () => {
    const { empresa, supervisor } = await cenario();
    const mon = await checklistDe("MONITOR");
    const dados = monitor(empresa.id);
    await expect(cadastrarEquipamento(supervisor, { dados, inspecoes: await inspecoesDeEntrada(dados) })).rejects.toThrow(/condição de entrada/);
    // Sem respostas: nada é presumido como conforme.
    await expect(cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "NOVO", inspecoes: { principal: { respostas: {} } } })).rejects.toThrow(/Responda este item/);
    // Item que só vale para usado não entra na inspeção do novo.
    const doUsado = respostasDe(mon.perguntas, USADO);
    await expect(cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "NOVO", inspecoes: { principal: doUsado } })).rejects.toThrow(/checklist mudou/);
    // Usado: a inspeção completa é obrigatória.
    await expect(cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: { principal: respostasDe(mon.perguntas, NOVO) } })).rejects.toThrow(/Responda este item/);
    expect(await prisma.ativo.count()).toBe(0);

    const r = await cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: { principal: doUsado } });
    expect(await prisma.ativo.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ condicaoEntrada: "USADO", situacao: "DISPONIVEL" });
    const insp = await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: r.id }, include: { respostas: { include: { versaoPergunta: true } } } });
    expect(insp).toMatchObject({ tipo: "ENTRADA", estado: "CONCLUIDA", condicaoEntrada: "USADO", resultado: "APTO", responsavelNome: supervisor.nome, categoriaNome: "Monitor", questionarioId: null });
    expect(insp.respostas).toHaveLength(perguntasAplicaveis(mon.perguntas, USADO).length);
    // Cada resposta aponta para a versão exibida, com o texto dela.
    expect(insp.respostas.every((x) => x.versaoPergunta && x.versaoPergunta.texto === x.pergunta && x.versaoPergunta.versao === 1)).toBe(true);
    expect(insp.numero).toMatch(/^INS-\d{4}-\d{4}$/);
  });

  it("justificativa obrigatória; pergunta opcional pode ficar sem resposta e não vira conforme", async () => {
    const { empresa, supervisor } = await cenario();
    const mon = await checklistDe("MONITOR");
    const dados = monitor(empresa.id);
    const com = (excecoes: Parameters<typeof respostasDe>[3]) => ({ principal: respostasDe(mon.perguntas, USADO, "CONFORME", excecoes) });
    await expect(cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: com({ [mon.v("mn.carcaca")]: { resposta: "NAO_CONFORME" } }) })).rejects.toThrow(/Descreva o problema/);
    await expect(
      cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: com({ [mon.v("mn.controles")]: { resposta: "NAO_TESTADO", justificativa: " " } }) }),
    ).rejects.toThrow(/não foi testado/);
    await expect(cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: com({ [mon.v("mn.tela")]: { resposta: "NAO_SE_APLICA" } }) })).rejects.toThrow(/não se aplica/);
    // Opcional (ajuste de altura): sem resposta, não gera linha nenhuma.
    const r = await cadastrarEquipamento(supervisor, { dados, condicaoEntrada: "USADO", inspecoes: com({ [mon.v("mn.ajustes")]: null }) });
    const insp = await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: r.id }, include: { respostas: true } });
    expect(insp.resultado).toBe("APTO");
    expect(insp.respostas.some((x) => x.versaoPerguntaId === mon.v("mn.ajustes"))).toBe(false);
  });

  it("defeito bloqueante na entrada: cadastrado, inapto e em manutenção; o notebook leva a inspeção do C1", async () => {
    const { empresa, supervisor } = await cenario();
    const mon = await checklistDe("MONITOR");
    const respostas = respostasDe(mon.perguntas, NOVO, "CONFORME", { [mon.v("mn.tela")]: nc("Linha vertical no centro") });
    const r = await cadastrarEquipamento(supervisor, { dados: monitor(empresa.id), condicaoEntrada: "NOVO", inspecoes: { principal: respostas } });
    expect(r.emManutencao).toEqual([r.nome]);
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: r.id } })).situacao).toBe("MANUTENCAO");
    expect(await prisma.manutencao.findFirstOrThrow({ where: { ativoId: r.id } })).toMatchObject({ aberta: true, observacoes: expect.stringContaining("Linha vertical") });
    expect(await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: r.id } })).toMatchObject({ resultado: "INAPTO" });

    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const c1 = await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } });
    expect(c1.condicaoEntrada).toBe("NOVO");
    const doC1 = await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: c1.id }, include: { respostas: { include: { versaoPergunta: { include: { pergunta: true } } } } } });
    const carregadores = await prisma.categoriaEquipamento.findUniqueOrThrow({ where: { codigo: "CARREGADOR" } });
    expect(doC1.tipo).toBe("ENTRADA");
    expect(doC1.respostas.every((x) => x.versaoPergunta?.pergunta.categoriaId === carregadores.id)).toBe(true);
  });
});

describe("devolução e avaliação", () => {
  it("devolução registra mesmo sem inspeção; pendente impede liberar; inapto não volta ao estoque", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const mon = await checklistDe("MONITOR");
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "ENTREGAR", verificacoes: await verificacoesConfirmando([m.id]) });
    const item = (await obterAlocacao(supervisor, a.id)).itens[0];
    await registrarDevolucao(supervisor, { alocacaoId: a.id, itens: [{ itemId: item.id, estadoFisico: "BOM", destino: "AVALIACAO" }] });
    // A custódia acabou, o equipamento está em avaliação e a inspeção ficou pendente.
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m.id } })).situacao).toBe("DEVOLVIDO_EM_AVALIACAO");
    expect(await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: m.id, pendente: true } })).toMatchObject({ estado: "PENDENTE", tipo: "DEVOLUCAO" });
    expect((await obterAlocacao(supervisor, a.id)).itens[0].ativo.inspecaoPendente).toBe(true);
    // Sem inspeção, nem nova alocação nem liberação.
    await expect(criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "RESERVAR" })).rejects.toThrow(/não está disponível/);
    await expect(liberarAposAvaliacao(supervisor, { ativoId: m.id, observacao: "ok" })).rejects.toThrow(/inspeção técnica pendente/);

    const inapta = respostasDe(mon.perguntas, { tipo: "DEVOLUCAO" }, "CONFORME", { [mon.v("mn.imagem")]: nc("Sem sinal em nenhuma entrada") });
    await expect(concluirAvaliacao(supervisor, { ativoId: m.id, inspecao: inapta, encaminhamento: "DISPONIVEL" })).rejects.toThrow(/Defeito bloqueante/);
    // Mantido em avaliação: a inspeção (inapta) fica registrada e a liberação continua bloqueada.
    await expect(concluirAvaliacao(supervisor, { ativoId: m.id, inspecao: inapta, encaminhamento: "AVALIACAO" })).resolves.toMatchObject({ resultado: "INAPTO" });
    expect(await prisma.inspecaoTecnica.count({ where: { ativoId: m.id, pendente: true } })).toBe(0);
    await expect(liberarAposAvaliacao(supervisor, { ativoId: m.id, observacao: "ok" })).rejects.toThrow(/defeito bloqueante/);
    // Nova inspeção (a anterior não muda) e envio para manutenção.
    await concluirAvaliacao(supervisor, { ativoId: m.id, inspecao: inapta, encaminhamento: "MANUTENCAO" });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m.id } })).situacao).toBe("MANUTENCAO");
    const inspecoes = await prisma.inspecaoTecnica.findMany({ where: { ativoId: m.id }, orderBy: { numero: "asc" } });
    expect(inspecoes.map((i) => [i.tipo, i.resultado])).toEqual([
      ["ENTRADA", "APTO"],
      ["DEVOLUCAO", "INAPTO"],
      ["DEVOLUCAO", "INAPTO"],
    ]);
  });

  it("inspeção apta libera o equipamento; envio direto para manutenção cancela a pendente", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const mon = await checklistDe("MONITOR");
    const [m1, m2] = [await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) }), await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) })];
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m1.id, m2.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([m1.id, m2.id]) });
    const itens = (await obterAlocacao(supervisor, a.id)).itens;
    await registrarDevolucao(supervisor, { alocacaoId: a.id, itens: itens.map((i) => ({ itemId: i.id, estadoFisico: "BOM", destino: "AVALIACAO" })) });

    await concluirAvaliacao(supervisor, { ativoId: m1.id, inspecao: respostasDe(mon.perguntas, { tipo: "DEVOLUCAO" }), encaminhamento: "DISPONIVEL" });
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: m1.id } })).situacao).toBe("DISPONIVEL");

    const { enviarParaManutencao } = await import("@/server/modulos/manutencoes");
    await enviarParaManutencao(supervisor, { ativoId: m2.id, motivo: "Tela quebrada na devolução", observacoes: "Trinca no canto" });
    expect(await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: m2.id, tipo: "DEVOLUCAO" } })).toMatchObject({ estado: "CANCELADA", pendente: null });
  });
});

describe("verificação na entrega física", () => {
  it("cada item precisa da própria verificação; confirmar exige a última inspeção; nova inspeção inapta não entrega", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nbc = await checklistDe("NOTEBOOK");
    const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresa.id) });
    const c1 = await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } });
    const base = { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id, c1.id], modo: "ENTREGAR" as const };

    await expect(criarAlocacao(supervisor, base)).rejects.toThrow(/confirme a condição/);
    await expect(criarAlocacao(supervisor, { ...base, verificacoes: await verificacoesConfirmando([nb.id]) })).rejects.toThrow(/confirme a condição/);
    const entrada = await prisma.inspecaoTecnica.findFirstOrThrow({ where: { ativoId: c1.id } });
    // Inspeção que não é a última do equipamento não serve.
    const doNotebook = (await verificacoesConfirmando([nb.id]))[0];
    const outraInspecao = doNotebook.modo === "CONFIRMAR" ? doNotebook.inspecaoId : "";
    await expect(criarAlocacao(supervisor, { ...base, verificacoes: [doNotebook, { ativoId: c1.id, modo: "CONFIRMAR", inspecaoId: outraInspecao }] })).rejects.toThrow(/inspeção mais recente/);
    const tela = respostasDe(nbc.perguntas, { tipo: "PRE_ALOCACAO" }, "CONFORME", { [nbc.v("nb.tela")]: nc("Mancha clara no canto") });
    await expect(
      criarAlocacao(supervisor, { ...base, verificacoes: [{ ativoId: nb.id, modo: "NOVA", inspecao: tela }, { ativoId: c1.id, modo: "CONFIRMAR", inspecaoId: entrada.id }] }),
    ).rejects.toThrow(/defeito bloqueante/);
    expect(await prisma.alocacao.count()).toBe(0);
    expect(await prisma.inspecaoTecnica.count({ where: { tipo: "PRE_ALOCACAO" } })).toBe(0);

    // Notebook com nova inspeção (com ressalva) e C1 confirmando a de entrada.
    const ressalva = respostasDe(nbc.perguntas, { tipo: "PRE_ALOCACAO" }, "CONFORME", { [nbc.v("nb.carcaca")]: nc("Risco leve na tampa") });
    const a = await criarAlocacao(supervisor, { ...base, verificacoes: [{ ativoId: nb.id, modo: "NOVA", inspecao: ressalva }, { ativoId: c1.id, modo: "CONFIRMAR", inspecaoId: entrada.id }] });
    const verificacoes = await prisma.verificacaoEntrega.findMany({ where: { alocacaoId: a.id }, include: { inspecao: true } });
    expect(verificacoes).toHaveLength(2);
    const doNb = verificacoes.find((v) => v.ativoId === nb.id)!;
    expect(doNb).toMatchObject({ modo: "NOVA_INSPECAO", responsavelNome: supervisor.nome, inspecao: { tipo: "PRE_ALOCACAO", alocacaoId: a.id, resultado: "APTO_COM_RESSALVAS" } });
    const instantaneo = doNb.instantaneo as { equipamento: { nome: string }; respostas: { pergunta: string; resposta: string; justificativa: string | null; versao: number }[] };
    expect(instantaneo.equipamento.nome).toBe("NBI5001");
    expect(instantaneo.respostas.find((r) => r.resposta === "NAO_CONFORME")).toMatchObject({ justificativa: "Risco leve na tampa", versao: 1 });
    expect(verificacoes.find((v) => v.ativoId === c1.id)).toMatchObject({ modo: "CONFIRMOU_ULTIMA", inspecaoId: entrada.id });

    // A revisão mostra a última inspeção válida e o checklist vigente de cada equipamento.
    const condicoes = await condicoesParaEntrega(supervisor, [nb.id, c1.id]);
    expect(condicoes.find((c) => c.ativoId === nb.id)?.ultima).toMatchObject({ tipo: "PRE_ALOCACAO", resultado: "APTO_COM_RESSALVAS" });
    expect(condicoes.find((c) => c.ativoId === nb.id)?.perguntas.length).toBe(perguntasAplicaveis(nbc.perguntas, { tipo: "PRE_ALOCACAO" }).length);
  });

  it("reserva sem verificação técnica; a entrega física da reserva exige a verificação", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "RESERVAR" });
    await expect(confirmarEntrega(supervisor, { alocacaoId: reserva.id })).rejects.toThrow(/confirme a condição/);
    await confirmarEntrega(supervisor, { alocacaoId: reserva.id, verificacoes: await verificacoesDaReserva(reserva.id) });
    expect(await prisma.verificacaoEntrega.count({ where: { alocacaoId: reserva.id } })).toBe(1);
    expect((await obterAlocacao(supervisor, reserva.id)).itens[0].verificacao?.instantaneo.inspecao.tipo).toBe("PRE_ALOCACAO");
  });

  it("inspeções concluídas, respostas e instantâneos da entrega não mudam nem são apagados", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const mon = await checklistDe("MONITOR");
    const m = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [m.id], modo: "ENTREGAR", verificacoes: await verificacoesConfirmando([m.id]) });
    const v = await prisma.verificacaoEntrega.findFirstOrThrow({ where: { alocacaoId: a.id } });
    await expect(prisma.inspecaoTecnica.update({ where: { id: v.inspecaoId }, data: { observacoes: "alterada" } })).rejects.toThrow();
    await expect(prisma.inspecaoTecnica.delete({ where: { id: v.inspecaoId } })).rejects.toThrow();
    await expect(prisma.respostaInspecao.updateMany({ where: { inspecaoId: v.inspecaoId }, data: { resposta: "NAO_CONFORME", justificativa: "x" } })).rejects.toThrow();
    await expect(prisma.verificacaoEntrega.update({ where: { id: v.id }, data: { instantaneo: {} } })).rejects.toThrow();

    // A devolução e uma inspeção posterior não alteram o instantâneo da entrega.
    const item = (await obterAlocacao(supervisor, a.id)).itens[0];
    await registrarDevolucao(supervisor, { alocacaoId: a.id, itens: [{ itemId: item.id, estadoFisico: "REGULAR", destino: "AVALIACAO" }] });
    await concluirAvaliacao(supervisor, {
      ativoId: m.id,
      inspecao: respostasDe(mon.perguntas, { tipo: "DEVOLUCAO" }, "CONFORME", { [mon.v("mn.carcaca")]: nc("Base riscada") }),
      encaminhamento: "DISPONIVEL",
    });
    expect((await prisma.verificacaoEntrega.findUniqueOrThrow({ where: { id: v.id } })).instantaneo).toEqual(v.instantaneo);
    expect(await prisma.inspecaoTecnica.count({ where: { ativoId: m.id, estado: "CONCLUIDA" } })).toBe(2);
  });
});
