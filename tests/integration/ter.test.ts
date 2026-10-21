/**
 * TER emitido pelo portal: geração automática na entrega física (um por evento, idempotente,
 * recuperável), instantâneos do checklist, PDF guardado com hash e versão, encaminhamento,
 * PDF assinado, conferência, cancelamento, substituição, permissões e proteção do CPF.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { MENSAGEM_ENVIO } from "@/lib/ter";
import { obterArmazenamento } from "@/server/armazenamento";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import type { DadosTer } from "@/server/documentos/ter-pdf";
import { cancelarReserva, confirmarEntrega, criarAlocacao } from "@/server/modulos/alocacoes";
import { salvarPergunta } from "@/server/modulos/checklists";
import type { DadosEquipamento } from "@/server/modulos/inventario";
import { sha256 } from "@/server/modulos/inventario-base";
import { editarPessoa } from "@/server/modulos/pessoas";
import {
  anexarAssinado,
  cancelarTer,
  conferirAssinatura,
  emitirTer,
  gerarNovamente,
  lerArquivoTer,
  listarTers,
  obterTer,
  registrarEnvio,
  substituirTer,
} from "@/server/modulos/ter";
import { transferirColaborador } from "@/server/modulos/transferencias";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { cpfFicticio, criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, checklistDe, respostasDe, verificacoesDaReserva, verificacoesDaTransferencia, verificacoesNovas } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

let serie = 0;
const notebook = (empresaId: string): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5,
  patrimonio: `VLR-T${++serie}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-TER-${serie}`,
});
const monitor = (empresaId: string): DadosEquipamento => ({
  categoria: "MONITOR",
  patrimonio: `VLR-M${++serie}`,
  empresaId,
  marcaId: MARCA.LG,
  modeloId: MODELO.lg24,
  numeroSerie: `SIM-MON-${serie}`,
});

async function cenario() {
  const empresa = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true, cpf: true })).contaId);
  const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true, empresaId: empresa.id })).contaId);
  const cpfAna = cpfFicticio();
  const ana = await criarPessoa({ ativada: true, empresaId: empresa.id, cpf: cpfAna });
  const bruno = await criarPessoa({ ativada: true, empresaId: empresa.id, cpf: true });
  const semCpf = await criarPessoa({ ativada: true, empresaId: empresa.id });
  return { empresa, supervisor, estagiario, ana, cpfAna, bruno, semCpf };
}

/** Notebook (com o C1) cadastrado, pronto para a entrega. */
async function notebookComCarregador(supervisor: Ator, empresaId: string) {
  const nb = await cadastrarComInspecao(supervisor, { dados: notebook(empresaId) });
  const c1 = await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } });
  return { nb, c1 };
}

async function entregar(supervisor: Ator, colaboradorId: string, ativoIds: string[], extra: Partial<Parameters<typeof criarAlocacao>[1]> = {}) {
  return criarAlocacao(supervisor, {
    responsavelTiContaId: supervisor.contaId,
    colaboradorId,
    ativoIds,
    modo: "ENTREGAR",
    verificacoes: await verificacoesNovas(ativoIds),
    ...extra,
  });
}

const termoDa = (alocacaoId: string) => prisma.termo.findFirstOrThrow({ where: { alocacaoId, tipo: "TER" }, include: { versoes: { orderBy: { versao: "asc" } } } });
const dadosDa = (v: { dados: unknown }) => v.dados as DadosTer;

beforeEach(limparBanco);

describe("geração automática na entrega física", () => {
  it("entrega imediata gera um TER emitido com PDF guardado, hash, versão e histórico; vários equipamentos, um documento", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const { nb, c1 } = await notebookComCarregador(supervisor, empresa.id);
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const r = await entregar(supervisor, ana.colaboradorId, [nb.id, c1.id, mon.id], { observacoes: "Uso no escritório." });
    expect(r.ter?.estado).toBe("EMITIDO");

    const t = await termoDa(r.id);
    expect(await prisma.termo.count({ where: { tipo: "TER" } })).toBe(1);
    expect(t.numero).toMatch(/^TER\d{4,}$/);
    expect([t.estadoDocumento, t.estadoAssinatura, t.estado, t.versaoVigente]).toEqual(["EMITIDO", "AGUARDANDO_ENVIO", "EMITIDO", 1]);
    expect(t.empresaId).toBe(empresa.id);
    const v = t.versoes[0];
    expect(v.estado).toBe("EMITIDO");
    const pdf = (await obterArmazenamento().ler(v.arquivoChave!))!;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sha256(pdf)).toBe(v.sha256);
    expect(v.tamanho).toBe(pdf.length);
    // A4 (595.28 x 841.89 pt): termo, declarações, assinaturas e anexos em fluxo contínuo.
    const caixas = pdf.toString("latin1").match(/\/MediaBox \[[^\]]+\]/g) ?? [];
    expect(caixas.length).toBe(v.paginas);
    expect(caixas.every((c) => /\[0 0 595\.28\d* 841\.89\d*\]/.test(c))).toBe(true);
    expect(v.paginas).toBeGreaterThanOrEqual(3);
    expect(v.nomeArquivo).toMatch(/^PESSOA TESTE .+ - \d{4}\.\d{2}\.\d{2} - TER\.pdf$/);

    const d = dadosDa(v);
    expect(new Set(d.equipamentos.map((e) => e.ativoId))).toEqual(new Set([nb.id, c1.id, mon.id]));
    expect(d.equipamentos.map((e) => e.anexo)).toEqual([1, 2, 3]);
    // Carregador logo depois do notebook que acompanha, identificado nos dois anexos.
    const iNb = d.equipamentos.findIndex((e) => e.ativoId === nb.id);
    expect(d.equipamentos[iNb + 1].ativoId).toBe(c1.id);
    // O carregador é uma unidade (anexo próprio) e aparece no notebook só como referência.
    expect(d.equipamentos[iNb].acessorios).toEqual([expect.objectContaining({ nome: "Carregador", quantidade: 1, estado: "Apto", identificacao: expect.stringMatching(new RegExp(`^${c1.nomeDispositivo!.replace(".", "\\.")}.* · anexo ${iNb + 2}$`)) })]);
    expect(d.equipamentos[iNb + 1].vinculo).toContain(`notebook ${nb.nome}`);
    expect(d.equipamentos[iNb + 1].acompanha).toEqual({ identificador: nb.nome, anexo: iNb + 1 });
    // Identificador (código do portal) e patrimônio são campos distintos; sem patrimônio, nada no lugar.
    expect(d.equipamentos[iNb]).toMatchObject({ identificador: nb.nome, patrimonio: expect.stringMatching(/^VLR-T/) });
    expect(d.equipamentos[iNb + 1]).toMatchObject({ identificador: c1.nomeDispositivo, patrimonio: null });
    for (const e of d.equipamentos) {
      const palavras = e.descricao.toLocaleLowerCase("pt-BR").split(" ");
      expect(new Set(palavras).size).toBe(palavras.length); // sem palavras repetidas ("Carregador ... Carregador")
    }
    expect(d.equipamentos[iNb + 1].descricao).toMatch(/^Carregador /);
    expect(d.equipamentos[iNb].descricao).toMatch(/^Notebook Dell Latitude 5440$/);
    // Fora de produção, o PDF sai como documento de teste (também registrado na versão).
    expect(d.teste).toBe(true);
    expect(v.documentoTeste).toBe(true);
    expect(d.entrega.observacoes).toBe("Uso no escritório.");
    expect(d.entrega.responsavelTi).toBe(supervisor.nome);
    expect(d.modelo).toMatchObject({ codigo: "FORM-TI-TR-001", revisao: "22", titulo: "TERMO DE ENTREGA, GUARDA E RESPONSABILIDADE" });
    // Texto jurídico do modelo preservado, sem alteração.
    expect(d.modelo.declaracoes).toHaveLength(7);
    expect(d.modelo.declaracoes[4]).toContain("artigo 462, § 1º, da Consolidação das Leis do Trabalho");
    expect(d.modelo.declaracoes[5]).toBe(
      "Este termo não constitui, por si só, confissão de dívida nem autoriza cobrança ou desconto automático. O colaborador compromete-se, ainda, a preservar credenciais de acesso, não compartilhar senhas, não desabilitar controles de segurança e não instalar programas ou realizar alterações não autorizadas.",
    );

    const hist = await prisma.historicoTer.findMany({ where: { termoId: t.id }, orderBy: { em: "asc" } });
    expect(hist.map((h) => h.acao)).toEqual(["ENTREGA_REGISTRADA", "TER_CRIADO", "PDF_GERADO", "EMITIDO"]);
    // As verificações técnicas apontam para o evento do TER.
    expect(await prisma.verificacaoEntrega.count({ where: { eventoEntregaId: t.eventoEntregaId } })).toBe(3);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "termo.emitir", alvoId: t.id } })).toBe(1);
  });

  it("reserva não gera TER; a conversão em entrega gera; cancelar a reserva não gera", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const outro = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const reserva = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [mon.id], modo: "RESERVAR" });
    const cancelada = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [outro.id], modo: "RESERVAR" });
    expect(await prisma.termo.count()).toBe(0);
    await cancelarReserva(supervisor, { alocacaoId: cancelada.id, motivo: "Desistência" });
    expect(await prisma.termo.count()).toBe(0);

    const c = await confirmarEntrega(supervisor, { alocacaoId: reserva.id, verificacoes: await verificacoesDaReserva(reserva.id) });
    expect(c.ter?.estado).toBe("EMITIDO");
    const t = await termoDa(reserva.id);
    const evento = await prisma.eventoEntrega.findUniqueOrThrow({ where: { id: t.eventoEntregaId! } });
    expect(evento.tipo).toBe("CONFIRMACAO_RESERVA");
    expect(dadosDa(t.versoes[0]).entrega.tipo).toBe("Reserva convertida em entrega");
  });

  it("nova entrega ao mesmo colaborador gera outro TER; requisição repetida não duplica; emissão simultânea emite uma vez", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const m1 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const m2 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const chave = randomUUID();
    const verificacoes = await verificacoesNovas([m1.id]);
    const base = { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [m1.id], modo: "ENTREGAR" as const, verificacoes, chaveRequisicao: chave };
    const [a, b] = await Promise.all([criarAlocacao(supervisor, base), criarAlocacao(supervisor, base)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.termo.count()).toBe(1);
    expect((await criarAlocacao(supervisor, base)).repetido).toBe(true);
    expect(await prisma.termo.count()).toBe(1);

    const segunda = await entregar(supervisor, ana.colaboradorId, [m2.id]);
    const [t1, t2] = [await termoDa(a.id), await termoDa(segunda.id)];
    expect(t1.numero).not.toBe(t2.numero);
    expect(t1.eventoEntregaId).not.toBe(t2.eventoEntregaId);
    // Mesmo colaborador e mesmo dia: o número diferencia o nome do arquivo.
    expect(t2.versoes[0].nomeArquivo).toContain(`(${t2.numero})`);

    // Já emitido: novas chamadas (inclusive simultâneas) não geram outro arquivo.
    const resultados = await Promise.all([emitirTer(t1.id, { contaId: null, nome: "Teste" }), emitirTer(t1.id, { contaId: null, nome: "Teste" })]);
    expect(resultados.map((r) => r.estado)).toEqual(["SEM_ALTERACAO", "SEM_ALTERACAO"]);
    expect(await prisma.historicoTer.count({ where: { termoId: t1.id, acao: "EMITIDO" } })).toBe(1);
  });

  it("sem CPF a entrega fica registrada e o TER pendente; erro de geração tem nova tentativa; CPF no cadastro gera o TER", async () => {
    const { empresa, supervisor, semCpf } = await cenario();
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const r = await entregar(supervisor, semCpf.colaboradorId, [mon.id]);
    expect(r.ter?.estado).toBe("PENDENTE_CADASTRO");
    expect((await prisma.alocacao.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe("ATIVA");
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: mon.id } })).situacao).toBe("ALOCADO");
    let t = await termoDa(r.id);
    expect([t.estadoDocumento, t.estado, t.versoes[0].estado, t.versoes[0].pendencias]).toEqual(["ERRO_GERACAO", "RASCUNHO", "ERRO_GERACAO", ["CPF do colaborador"]]);
    expect(t.versoes[0].arquivoChave).toBeNull();
    const lista = await listarTers(supervisor, { situacao: "PENDENTE_CADASTRO" });
    expect(lista.linhas.map((l) => l.numero)).toEqual([t.numero]);

    // Falha de geração (modelo indisponível): erro registrado, sem arquivo; nova tentativa depois.
    await prisma.versaoTer.update({ where: { id: t.versoes[0].id }, data: { modeloCodigo: "INEXISTENTE" } });
    const edicao = await prisma.colaborador.findUniqueOrThrow({ where: { id: semCpf.colaboradorId }, include: { empresa: true } });
    const salvo = await editarPessoa(supervisor, {
      colaboradorId: edicao.id,
      nome: edicao.nome,
      segundoNome: edicao.segundoNome,
      sobrenomeUtilizado: edicao.sobrenomeUtilizado,
      cargo: edicao.cargo,
      departamento: edicao.departamento,
      empresaId: edicao.empresaId,
      cpf: cpfFicticio(),
    });
    expect(salvo.tersGerados).toBe(1);
    t = await termoDa(r.id);
    expect([t.estadoDocumento, t.versoes[0].estado, t.versoes[0].pendencias, t.versoes[0].erro]).toEqual(["ERRO_GERACAO", "ERRO_GERACAO", [], "Modelo documental do TER não configurado."]);
    await prisma.versaoTer.update({ where: { id: t.versoes[0].id }, data: { modeloCodigo: "FORM-TI-TR-001" } });
    expect((await gerarNovamente(supervisor, t.id)).estado).toBe("EMITIDO");
    t = await termoDa(r.id);
    expect([t.estadoDocumento, t.estadoAssinatura, t.versoes[0].estado, t.versoes[0].tentativas]).toEqual(["EMITIDO", "AGUARDANDO_ENVIO", "EMITIDO", 3]);
    expect((await prisma.historicoTer.findMany({ where: { termoId: t.id }, orderBy: { em: "asc" } })).map((h) => h.acao)).toEqual([
      "ENTREGA_REGISTRADA",
      "TER_CRIADO",
      "PENDENCIA_CADASTRO",
      "ERRO_GERACAO",
      "PDF_GERADO",
      "EMITIDO",
    ]);
    await expect(gerarNovamente(supervisor, t.id)).rejects.toThrow(/não está aguardando geração/);
  });

  it("transferência com entrega imediata usa a inspeção obrigatória e gera o TER do novo colaborador", async () => {
    const { empresa, supervisor, ana, bruno } = await cenario();
    const { nb, c1 } = await notebookComCarregador(supervisor, empresa.id);
    const alo = await entregar(supervisor, ana.colaboradorId, [nb.id, c1.id]);
    await expect(transferirColaborador(supervisor, { ativoId: nb.id, colaboradorId: bruno.colaboradorId, modo: "ENTREGAR", confirmacaoFisica: true, alocacaoAtualId: alo.id })).rejects.toThrow(
      /confirme a condição/,
    );
    expect(await prisma.termo.count()).toBe(1);
    const r = await transferirColaborador(supervisor, {
      ativoId: nb.id,
      colaboradorId: bruno.colaboradorId,
      modo: "ENTREGAR",
      confirmacaoFisica: true,
      alocacaoAtualId: alo.id,
      verificacoes: await verificacoesDaTransferencia(nb.id, alo.id),
    });
    expect(r.ter?.estado).toBe("EMITIDO");
    const nova = await prisma.alocacao.findUniqueOrThrow({ where: { numero: r.numero! } });
    const t = await termoDa(nova.id);
    expect(t.colaboradorId).toBe(bruno.colaboradorId);
    expect(dadosDa(t.versoes[0]).entrega.tipo).toBe("Transferência entre colaboradores");
    expect(dadosDa(t.versoes[0]).equipamentos).toHaveLength(2);
    // O TER da entrega anterior não muda.
    expect((await termoDa(alo.id)).estadoDocumento).toBe("EMITIDO");
  });
});

describe("numeração", () => {
  it("TER0001 em diante, continuando do maior número já usado (inclusive no formato antigo)", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const m1 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const m2 = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const primeiro = await termoDa((await entregar(supervisor, ana.colaboradorId, [m1.id])).id);
    expect(primeiro.numero).toBe("TER0001");
    // Termo antigo no formato TER-AAAA-NNNN: a sequência continua a partir dele; o antigo não muda.
    const antigo = await prisma.termo.create({ data: { numero: "TER-2026-0136", tipo: "TER", alocacaoId: primeiro.alocacaoId, colaboradorId: ana.colaboradorId, estado: "EMITIDO" } });
    const segundo = await termoDa((await entregar(supervisor, ana.colaboradorId, [m2.id])).id);
    expect(segundo.numero).toBe("TER0137");
    expect((await prisma.termo.findUniqueOrThrow({ where: { id: antigo.id } })).numero).toBe("TER-2026-0136");
  });
});

describe("checklist no TER", () => {
  it("instantâneo por equipamento: ressalva, justificativa, opcional sem resposta; bloqueante impede a entrega; mudanças posteriores não alteram o termo", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const nbc = await checklistDe("NOTEBOOK");
    const { nb, c1 } = await notebookComCarregador(supervisor, empresa.id);
    const contexto = { tipo: "PRE_ALOCACAO" as const };

    // Bloqueante não conforme: nada é entregue nem documentado.
    const bloqueada = respostasDe(nbc.perguntas, contexto, "CONFORME", { [nbc.v("nb.tela")]: { resposta: "NAO_CONFORME", justificativa: "Linhas na tela" } });
    const doC1 = (await verificacoesNovas([c1.id]))[0];
    await expect(
      criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [nb.id, c1.id], modo: "ENTREGAR", verificacoes: [{ ativoId: nb.id, modo: "NOVA", inspecao: bloqueada }, doC1] }),
    ).rejects.toThrow(/defeito bloqueante/);
    expect(await prisma.termo.count()).toBe(0);

    // Ressalva não bloqueante, "não testado" com justificativa e a opcional (rede) sem resposta.
    const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#6b8fb3" } }).jpeg().toBuffer();
    const inspecao = respostasDe(nbc.perguntas, contexto, "CONFORME", {
      [nbc.v("nb.carcaca")]: { resposta: "NAO_CONFORME", justificativa: "Risco leve na tampa" },
      [nbc.v("nb.camera")]: { resposta: "NAO_TESTADO", justificativa: "Sem iluminação no local" },
      [nbc.v("nb.rede")]: null,
    });
    inspecao.fotos = { [nbc.v("nb.carcaca")]: [{ tipo: "OUTRA", dados: jpeg }] };
    const alo = await criarAlocacao(supervisor, {
      responsavelTiContaId: supervisor.contaId,
      colaboradorId: ana.colaboradorId,
      ativoIds: [nb.id, c1.id],
      modo: "ENTREGAR",
      verificacoes: [{ ativoId: nb.id, modo: "NOVA", inspecao }, doC1],
    });
    const t = await termoDa(alo.id);
    const v = t.versoes[0];
    const d = dadosDa(v);
    const e = d.equipamentos.find((x) => x.ativoId === nb.id)!;
    expect(e.condicao).toBe("Apto com ressalvas");
    expect(e.avarias).toEqual(expect.arrayContaining([expect.stringContaining("Risco leve na tampa"), expect.stringContaining("Não testado — Câmera")]));
    expect(e.respostas.find((r) => r.resposta === "NAO_TESTADO")?.justificativa).toBe("Sem iluminação no local");
    expect(e.respostas.some((r) => r.pergunta.startsWith("Rede cabeada"))).toBe(false);
    expect(e.semResposta).toEqual([expect.objectContaining({ pergunta: expect.stringMatching(/^Rede cabeada/), versao: 1 })]);
    expect(e.respostas.every((r) => r.versao === 1)).toBe(true);
    expect(e.fotos).toEqual([expect.objectContaining({ legenda: expect.stringContaining("Carcaça") })]);
    expect(d.equipamentos.find((x) => x.ativoId === c1.id)!.condicao).toBe("Apto");
    // Termo, declarações, os dois anexos e a página das evidências fotográficas.
    expect(v.paginas).toBeGreaterThanOrEqual(5);

    // Depois: a pergunta muda (nova versão) e o notebook passa por outra inspeção. O TER não muda.
    const p = await prisma.perguntaInspecao.findFirstOrThrow({ where: { codigo: "NOTEBOOK:nb.carcaca" }, include: { versoes: { orderBy: { versao: "desc" }, take: 1 } } });
    const atual = p.versoes[0];
    await salvarPergunta(supervisor, {
      id: p.id,
      categoriaId: p.categoriaId,
      ativa: true,
      grupo: atual.grupo,
      texto: "Carcaça revisada em nova redação",
      comoTestar: atual.comoTestar,
      resultadoEsperado: atual.resultadoEsperado,
      sinaisProblema: atual.sinaisProblema,
      obrigatoria: atual.obrigatoria,
      bloqueante: atual.bloqueante,
      aplicacao: atual.aplicacao,
      partes: [],
    });
    const depois = await prisma.versaoTer.findUniqueOrThrow({ where: { id: v.id } });
    expect(depois.dados).toEqual(v.dados);
    expect(sha256((await obterArmazenamento().ler(v.arquivoChave!))!)).toBe(v.sha256);
    const detalhe = await obterTer(supervisor, t.id);
    expect(detalhe.equipamentos.find((x) => x.ativoId === nb.id)!.verificacao!.instantaneo.respostas.some((r) => r.pergunta === "Carcaça revisada em nova redação")).toBe(false);
  });

  it("muitos equipamentos: um anexo por item e quebra de páginas", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push((await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) })).id);
    const r = await entregar(supervisor, ana.colaboradorId, ids);
    const v = (await termoDa(r.id)).versoes[0];
    expect(dadosDa(v).equipamentos.map((e) => e.anexo)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // Continuação automática: os 12 anexos ocupam várias páginas, sem página vazia por seção.
    expect(v.paginas).toBeGreaterThanOrEqual(6);
    expect(v.paginas).toBeLessThan(14);
  });
});

describe("assinatura", () => {
  async function emitido() {
    const c = await cenario();
    const mon = await cadastrarComInspecao(c.supervisor, { dados: monitor(c.empresa.id) });
    const alo = await entregar(c.supervisor, c.ana.colaboradorId, [mon.id]);
    return { ...c, t: await termoDa(alo.id), alo };
  }
  const assinado = async (base: Buffer) => Buffer.concat([base, Buffer.from("\n% assinatura simulada no teste\n%%EOF\n")]);
  const envio = (termoId: string, reenvio = false) => ({ termoId, reenvio, canal: "EMAIL", destinatario: "pessoa@vallur.test", mensagem: MENSAGEM_ENVIO });

  it("envio e reenvio registrados com o mesmo PDF; o PDF assinado só vale depois da conferência; recusa pede motivo e novo arquivo preserva o anterior", async () => {
    const { supervisor, estagiario, t } = await emitido();
    const v1 = t.versoes[0];
    await expect(registrarEnvio(supervisor, envio(t.id, true))).rejects.toThrow(/Reenvio indisponível/);
    // Antes da emissão não vale; no mesmo minuto da emissão (precisão do formulário), vale.
    const minutoAntes = new Date(Math.floor(v1.emitidaEm!.getTime() / 60_000) * 60_000 - 1).toISOString();
    await expect(registrarEnvio(supervisor, { ...envio(t.id), enviadoEm: minutoAntes })).rejects.toThrow(/anterior à emissão/);
    await registrarEnvio(estagiario, { ...envio(t.id), enviadoEm: new Date(Math.floor(v1.emitidaEm!.getTime() / 60_000) * 60_000).toISOString() });
    await expect(registrarEnvio(supervisor, envio(t.id))).rejects.toThrow(/já foi registrado/);
    await registrarEnvio(supervisor, { ...envio(t.id, true), canal: "PRESENCIAL", destinatario: "Entregue em mãos na recepção" });
    const envios = await prisma.envioTer.findMany({ where: { termoId: t.id }, orderBy: { registradoEm: "asc" } });
    expect(envios.map((e) => [e.reenvio, e.sha256, e.versao])).toEqual([
      [false, v1.sha256, 1],
      [true, v1.sha256, 1],
    ]);
    expect(await prisma.versaoTer.count({ where: { termoId: t.id } })).toBe(1);
    expect((await prisma.termo.findUniqueOrThrow({ where: { id: t.id } })).estadoAssinatura).toBe("AGUARDANDO_ASSINATURA");

    // Integridade do arquivo: não-PDF, o próprio PDF emitido ou versão errada são recusados.
    const emitidoPdf = (await obterArmazenamento().ler(v1.arquivoChave!))!;
    await expect(anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: Buffer.from("não é pdf"), nomeOriginal: "x.pdf" })).rejects.toThrow(/PDF/);
    await expect(anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: emitidoPdf, nomeOriginal: "x.pdf" })).rejects.toThrow(/sem assinatura/);
    await expect(anexarAssinado(supervisor, { termoId: t.id, versao: 2, pdf: await assinado(emitidoPdf), nomeOriginal: "x.pdf" })).rejects.toThrow(/versão vigente/);

    const primeiro = await assinado(emitidoPdf);
    await anexarAssinado(estagiario, { termoId: t.id, versao: 1, pdf: primeiro, nomeOriginal: "TER assinado.pdf" });
    let termo = await prisma.termo.findUniqueOrThrow({ where: { id: t.id } });
    // Anexar não é assinar: aguarda a conferência.
    expect([termo.estadoAssinatura, termo.estado, termo.arquivoAssinadoChave]).toEqual(["ARQUIVO_RECEBIDO", "AGUARDANDO_ASSINATURA", null]);
    const arq1 = await prisma.arquivoAssinadoTer.findFirstOrThrow({ where: { termoId: t.id } });
    expect(sha256((await obterArmazenamento().ler(arq1.chave))!)).toBe(sha256(primeiro));

    // Conferência: permissão própria (o Estagiário não tem por padrão).
    const conferencia = { termoId: t.id, arquivoId: arq1.id, resultado: "CONFORME", signatario: "Pessoa Teste", confereColaborador: true, confereDocumento: true };
    await expect(conferirAssinatura(estagiario, conferencia)).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(conferirAssinatura(supervisor, { ...conferencia, confereDocumento: false })).rejects.toThrow(/corresponde ao documento emitido/);
    await expect(conferirAssinatura(supervisor, { ...conferencia, resultado: "NAO_CONFORME" })).rejects.toThrow(/motivo da recusa/);
    await conferirAssinatura(supervisor, { ...conferencia, resultado: "NAO_CONFORME", confereDocumento: false, motivo: "O arquivo assinado não corresponde ao emitido." });
    termo = await prisma.termo.findUniqueOrThrow({ where: { id: t.id } });
    expect(termo.estadoAssinatura).toBe("ASSINATURA_RECUSADA");

    // Novo envio e novo arquivo: o anterior fica preservado.
    await registrarEnvio(supervisor, envio(t.id, true));
    const segundo = Buffer.concat([emitidoPdf, Buffer.from("\n% segunda assinatura\n%%EOF\n")]);
    await anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: segundo, nomeOriginal: "TER assinado 2.pdf" });
    const arquivos = await prisma.arquivoAssinadoTer.findMany({ where: { termoId: t.id }, orderBy: { recebidoEm: "asc" } });
    expect(arquivos).toHaveLength(2);
    await expect(conferirAssinatura(supervisor, { ...conferencia, arquivoId: arq1.id })).rejects.toThrow(/último PDF assinado/);
    await conferirAssinatura(supervisor, { ...conferencia, arquivoId: arquivos[1].id });
    termo = await prisma.termo.findUniqueOrThrow({ where: { id: t.id } });
    expect([termo.estadoAssinatura, termo.estado, termo.arquivoAssinadoChave]).toEqual(["ASSINADO_CONFERIDO", "ASSINADO", arquivos[1].chave]);
    await expect(registrarEnvio(supervisor, envio(t.id, true))).rejects.toThrow(/assinado e conferido/);
    await expect(anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: segundo, nomeOriginal: "y.pdf" })).rejects.toThrow(/assinado e conferido/);

    const hist = (await prisma.historicoTer.findMany({ where: { termoId: t.id }, orderBy: { em: "asc" } })).map((h) => h.acao);
    expect(hist.slice(4)).toEqual(["ENVIO", "REENVIO", "ARQUIVO_RECEBIDO", "RECUSA", "REENVIO", "ARQUIVO_RECEBIDO", "CONFERENCIA"]);
  });
});

describe("cancelamento e substituição", () => {
  it("cancelar exige motivo, não exclui o TER nem desfaz a alocação; cancelado não é reenviado", async () => {
    const { empresa, supervisor, ana } = await cenario();
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const alo = await entregar(supervisor, ana.colaboradorId, [mon.id]);
    const t = await termoDa(alo.id);
    await expect(cancelarTer(supervisor, { termoId: t.id, motivo: "", confirmacao: true })).rejects.toThrow(/motivo/);
    await expect(cancelarTer(supervisor, { termoId: t.id, motivo: "Emitido para a pessoa errada.", confirmacao: false })).rejects.toThrow(/Confirme/);
    await cancelarTer(supervisor, { termoId: t.id, motivo: "Emitido para a pessoa errada.", confirmacao: true });
    const termo = await prisma.termo.findUniqueOrThrow({ where: { id: t.id }, include: { versoes: true } });
    expect([termo.estadoDocumento, termo.estado, termo.motivoCancelamento, termo.canceladoPorNome]).toEqual(["CANCELADO", "CANCELADO", "Emitido para a pessoa errada.", supervisor.nome]);
    expect(termo.versoes[0].estado).toBe("CANCELADO");
    expect(await obterArmazenamento().ler(termo.versoes[0].arquivoChave!)).not.toBeNull();
    expect((await prisma.alocacao.findUniqueOrThrow({ where: { id: alo.id } })).estado).toBe("ATIVA");
    expect((await prisma.ativo.findUniqueOrThrow({ where: { id: mon.id } })).situacao).toBe("ALOCADO");
    await expect(registrarEnvio(supervisor, { termoId: t.id, reenvio: false, canal: "EMAIL", destinatario: "a@b.test", mensagem: "x" })).rejects.toThrow(/não cancelado/);
    await expect(cancelarTer(supervisor, { termoId: t.id, motivo: "De novo, por engano.", confirmacao: true })).rejects.toThrow(/já está cancelado/);
    // O banco não deixa excluir o termo, a versão nem o histórico.
    await expect(prisma.termo.delete({ where: { id: t.id } })).rejects.toThrow();
    await expect(prisma.versaoTer.deleteMany({ where: { termoId: t.id } })).rejects.toThrow();
    await expect(prisma.historicoTer.deleteMany({ where: { termoId: t.id } })).rejects.toThrow();
    await expect(prisma.versaoTer.update({ where: { id: termo.versoes[0].id }, data: { sha256: "0".repeat(64) } })).rejects.toThrow();
  });

  it("TER assinado e conferido só é cancelado por procedimento administrativo; substituição gera nova versão e preserva a anterior", async () => {
    const { empresa, supervisor, estagiario, ana } = await cenario();
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const alo = await entregar(supervisor, ana.colaboradorId, [mon.id]);
    const t = await termoDa(alo.id);
    const v1 = t.versoes[0];
    const pdf = (await obterArmazenamento().ler(v1.arquivoChave!))!;
    await registrarEnvio(supervisor, { termoId: t.id, reenvio: false, canal: "EMAIL", destinatario: "pessoa@vallur.test", mensagem: MENSAGEM_ENVIO });
    await anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: Buffer.concat([pdf, Buffer.from("\n%%EOF\n")]), nomeOriginal: "assinado.pdf" });
    const arq = await prisma.arquivoAssinadoTer.findFirstOrThrow({ where: { termoId: t.id } });
    await conferirAssinatura(supervisor, { termoId: t.id, arquivoId: arq.id, resultado: "CONFORME", signatario: "Pessoa Teste", confereColaborador: true, confereDocumento: true });

    await expect(cancelarTer(estagiario, { termoId: t.id, motivo: "Cancelamento sem procedimento.", confirmacao: true, procedimento: "PROC-1" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(cancelarTer(supervisor, { termoId: t.id, motivo: "Cancelamento sem procedimento.", confirmacao: true })).rejects.toThrow(/procedimento administrativo/);
    await expect(substituirTer(supervisor, { termoId: t.id, motivo: "Correção do cargo do colaborador." })).rejects.toThrow(/procedimento administrativo/);

    const s = await substituirTer(supervisor, { termoId: t.id, motivo: "Correção do cargo do colaborador.", procedimento: "Chamado 1234" });
    expect([s.versao, s.estado]).toEqual([2, "EMITIDO"]);
    const termo = await termoDa(alo.id);
    expect(termo.versoes.map((v) => v.estado)).toEqual(["SUBSTITUIDO", "EMITIDO"]);
    expect(termo.versoes[1].sha256).not.toBe(v1.sha256);
    expect(termo.versoes[1].nomeArquivo).toContain("(v2)");
    // A versão anterior e o PDF assinado dela continuam guardados; a assinatura não passa para a nova.
    expect(sha256((await obterArmazenamento().ler(v1.arquivoChave!))!)).toBe(v1.sha256);
    expect(await obterArmazenamento().ler(arq.chave)).not.toBeNull();
    expect([termo.versaoVigente, termo.estadoDocumento, termo.estadoAssinatura, termo.estado, termo.arquivoAssinadoChave]).toEqual([2, "EMITIDO", "AGUARDANDO_ENVIO", "EMITIDO", null]);
    expect(dadosDa(termo.versoes[1]).equipamentos[0].respostas).toEqual(dadosDa(v1).equipamentos[0].respostas);
    await expect(anexarAssinado(supervisor, { termoId: t.id, versao: 1, pdf: Buffer.concat([pdf, Buffer.from("\n%%EOF\n")]), nomeOriginal: "velho.pdf" })).rejects.toThrow(/versão vigente/);
  });
});

describe("segurança", () => {
  it("permissões no servidor, downloads autorizados e auditados, CPF fora de listas, dados e auditoria", async () => {
    const { empresa, supervisor, estagiario, ana, cpfAna } = await cenario();
    const colaborador = await ator(ana.contaId);
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const alo = await entregar(supervisor, ana.colaboradorId, [mon.id]);
    const t = await termoDa(alo.id);

    await expect(listarTers(colaborador)).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(obterTer(colaborador, t.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    // Pelo Portal do Colaborador, a titular baixa o próprio TER emitido, mas não o relatório da TI.
    expect(sha256((await lerArquivoTer(colaborador, t.id, { tipo: "emitido" }))!.dados)).toBe(t.versoes[0].sha256);
    await expect(lerArquivoTer(colaborador, t.id, { tipo: "relatorio", conferenciaId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(cancelarTer(colaborador, { termoId: t.id, motivo: "Sem permissão nenhuma.", confirmacao: true })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(registrarEnvio(colaborador, { termoId: t.id, reenvio: false, canal: "EMAIL", destinatario: "a@b.test", mensagem: "x" })).rejects.toBeInstanceOf(ErroAutorizacao);

    const arquivo = await lerArquivoTer(estagiario, t.id, { tipo: "emitido" });
    expect(sha256(arquivo!.dados)).toBe(t.versoes[0].sha256);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "termo.baixar", alvoId: t.id, resultado: "SUCESSO" } })).toBe(2); // a titular e o estagiário

    // CPF: cifrado no banco, só os dois últimos dígitos à vista; fora do instantâneo, das listas e da auditoria.
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: ana.colaboradorId } });
    expect(c.cpfFinal).toBe(cpfAna.slice(-2));
    const cifrado = Buffer.from(c.cpfCifrado!).toString("latin1");
    const lista = JSON.stringify(await listarTers(supervisor));
    const detalhe = await obterTer(supervisor, t.id);
    expect(detalhe.colaborador.cpf).toBe(`***.***.***-${c.cpfFinal}`);
    const auditoria = JSON.stringify(await prisma.eventoAuditoria.findMany());
    expect(await prisma.eventoAuditoria.count({ where: { acao: "colaborador.cpf_revelar", alvoId: ana.colaboradorId } })).toBe(1);
    const dados = JSON.stringify(t.versoes[0].dados);
    const formatado = `${cpfAna.slice(0, 3)}.${cpfAna.slice(3, 6)}.${cpfAna.slice(6, 9)}-${cpfAna.slice(9)}`;
    for (const texto of [lista, JSON.stringify(detalhe), auditoria, dados, cifrado]) {
      expect(texto).not.toContain(cpfAna);
      expect(texto).not.toContain(formatado);
    }
  });
});
