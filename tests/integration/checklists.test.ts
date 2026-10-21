/**
 * Checklists de inspeção configuráveis: a TI cria, ordena, inativa e edita perguntas por
 * categoria sem mudar o código (permissão conferida no servidor); editar uma pergunta usada
 * cria nova versão e o histórico das inspeções e o instantâneo da entrega ficam como estavam.
 */
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { criarAlocacao } from "@/server/modulos/alocacoes";
import { alterarSituacaoPergunta, checklistVigente, listarChecklists, moverPergunta, salvarPergunta } from "@/server/modulos/checklists";
import { MARCA } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, verificacoesConfirmando } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

/** Categoria criada pela TI (sem checklist próprio) e um modelo dela para cadastrar equipamentos. */
async function categoriaNova() {
  const sufixo = randomBytes(3).toString("hex");
  const categoria = await prisma.categoriaEquipamento.create({ data: { nome: `Leitor de código ${sufixo}`, tipo: "OUTRO", regra: "NENHUMA", criadaPorNome: "Teste" } });
  const modelo = await prisma.modeloEquipamento.create({ data: { nome: `LT-${sufixo}`, chave: `lt-${sufixo}`, marcaId: MARCA.LG, categoriaId: categoria.id } });
  return { categoria, modelo };
}

const pergunta = (categoriaId: string, texto: string, extra: Partial<Parameters<typeof salvarPergunta>[1]> = {}) => ({
  categoriaId,
  grupo: "Funcionamento",
  texto,
  comoTestar: "Leia três etiquetas diferentes com o leitor conectado a um computador com um editor de texto aberto.",
  resultadoEsperado: "Cada leitura aparece completa no editor, sem caracteres trocados.",
  sinaisProblema: "Leitura falhando, caracteres trocados ou leitor desconectando.",
  obrigatoria: true,
  bloqueante: false,
  aplicacao: "SEMPRE",
  ativa: true,
  ...extra,
});

beforeEach(limparBanco);

describe("gestão dos checklists", () => {
  it("cria, ordena e inativa perguntas da categoria; só quem gerencia catálogos altera", async () => {
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    const { categoria } = await categoriaNova();
    // Sem perguntas próprias, vale o checklist de "Outro".
    expect((await checklistVigente(prisma, categoria.id)).herdado).toBe(true);

    await expect(salvarPergunta(estagiario, pergunta(categoria.id, "Lê o código de barras"))).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(salvarPergunta(supervisor, pergunta(categoria.id, "  "))).rejects.toThrow(/Informe a pergunta/);
    await expect(salvarPergunta(supervisor, pergunta(categoria.id, "Lê o código", { comoTestar: "" }))).rejects.toThrow(/como testar/);
    await expect(salvarPergunta(supervisor, pergunta(categoria.id, "Lê o código", { partes: ["TECLADO"] }))).rejects.toThrow(/kit/);

    const lerCodigo = await salvarPergunta(supervisor, pergunta(categoria.id, "Lê o código de barras"));
    const cabo = await salvarPergunta(supervisor, pergunta(categoria.id, "Cabo USB íntegro", { bloqueante: true }));
    const base = await salvarPergunta(supervisor, pergunta(categoria.id, "Base firme", { ordem: 1, obrigatoria: false, grupo: "Estado físico" }));
    const textos = async () =>
      (await listarChecklists(supervisor)).perguntas
        .filter((p) => p.categoriaId === categoria.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map((p) => `${p.ordem}. ${p.atual.texto}`);
    expect(await textos()).toEqual(["1. Base firme", "2. Lê o código de barras", "3. Cabo USB íntegro"]);

    await moverPergunta(supervisor, { id: base.id, direcao: "abaixo" });
    expect(await textos()).toEqual(["1. Lê o código de barras", "2. Base firme", "3. Cabo USB íntegro"]);
    await expect(moverPergunta(estagiario, { id: base.id, direcao: "acima" })).rejects.toBeInstanceOf(ErroAutorizacao);

    await alterarSituacaoPergunta(supervisor, { id: cabo.id, ativa: false });
    await expect(alterarSituacaoPergunta(estagiario, { id: cabo.id, ativa: true })).rejects.toBeInstanceOf(ErroAutorizacao);
    const vigente = await checklistVigente(prisma, categoria.id);
    expect(vigente.herdado).toBe(false);
    expect(vigente.perguntas.map((p) => p.texto)).toEqual(["Lê o código de barras", "Base firme"]);
    expect(vigente.perguntas.find((p) => p.perguntaId === lerCodigo.id)?.orientacao.comoTestar).toMatch(/três etiquetas/);
    expect(await prisma.eventoAuditoria.count({ where: { acao: "catalogo.gerenciar", resultado: "SUCESSO", alvoTipo: "pergunta_inspecao" } })).toBe(5);
  });

  it("pergunta já usada: editar cria nova versão; inspeções e instantâneo da entrega mantêm a versão antiga", async () => {
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    const empresa = await criarEmpresa();
    const pessoa = await criarPessoa({ ativada: true, empresaId: empresa.id });
    const { categoria, modelo } = await categoriaNova();
    const q = await salvarPergunta(supervisor, pergunta(categoria.id, "Lê o código de barras"));

    const leitor = await cadastrarComInspecao(supervisor, { dados: { categoriaId: categoria.id, patrimonio: `VLR-L${randomBytes(2).toString("hex")}`, empresaId: empresa.id, marcaId: MARCA.LG, modeloId: modelo.id } });
    const a = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [leitor.id], modo: "ENTREGAR", verificacoes: await verificacoesConfirmando([leitor.id]) });
    const respostaAntes = await prisma.respostaInspecao.findFirstOrThrow({ where: { chave: q.id }, include: { versaoPergunta: true } });
    expect(respostaAntes.versaoPergunta).toMatchObject({ versao: 1, texto: "Lê o código de barras" });
    const instantaneo = (await prisma.verificacaoEntrega.findFirstOrThrow({ where: { alocacaoId: a.id } })).instantaneo;

    // Mudar o conteúdo cria a versão 2; salvar sem mudança não cria outra.
    const editada = await salvarPergunta(supervisor, { ...pergunta(categoria.id, "Lê códigos de barras e QR"), id: q.id });
    expect(editada).toMatchObject({ versao: 2, novaVersao: true });
    expect(await salvarPergunta(supervisor, { ...pergunta(categoria.id, "Lê códigos de barras e QR"), id: q.id })).toMatchObject({ versao: 2, novaVersao: false });
    expect((await checklistVigente(prisma, categoria.id)).perguntas[0]).toMatchObject({ texto: "Lê códigos de barras e QR", versao: 2, perguntaId: q.id });

    // O que já foi respondido continua com a versão e o texto de antes.
    const respostaDepois = await prisma.respostaInspecao.findUniqueOrThrow({ where: { id: respostaAntes.id }, include: { versaoPergunta: true } });
    expect(respostaDepois.pergunta).toBe("Lê o código de barras");
    expect(respostaDepois.versaoPergunta).toMatchObject({ versao: 1, texto: "Lê o código de barras" });
    await expect(prisma.versaoPerguntaInspecao.update({ where: { id: respostaAntes.versaoPerguntaId! }, data: { texto: "alterado" } })).rejects.toThrow();
    await expect(prisma.versaoPerguntaInspecao.delete({ where: { id: respostaAntes.versaoPerguntaId! } })).rejects.toThrow();

    // Inativar tira a pergunta das próximas inspeções, não do histórico nem do TER.
    await alterarSituacaoPergunta(supervisor, { id: q.id, ativa: false });
    expect(await prisma.respostaInspecao.count({ where: { chave: q.id } })).toBe(1); // a da entrada (a entrega confirmou essa inspeção)
    expect((await prisma.verificacaoEntrega.findFirstOrThrow({ where: { alocacaoId: a.id } })).instantaneo).toEqual(instantaneo);
    expect(JSON.stringify(instantaneo)).toContain("Lê o código de barras");
  });
});
