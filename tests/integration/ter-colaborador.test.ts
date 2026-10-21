/**
 * TER no Portal do Colaborador: só os próprios termos (titularidade pela sessão), downloads
 * protegidos, envio do PDF assinado (guardado como chegou, sem aprovação automática), recusa e
 * reenvio, termos cancelados e substituídos, e a conferência pela TI.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MENSAGEM_ENVIO } from "@/lib/ter";
import { obterArmazenamento } from "@/server/armazenamento";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { criarAlocacao } from "@/server/modulos/alocacoes";
import type { DadosEquipamento } from "@/server/modulos/inventario";
import { sha256 } from "@/server/modulos/inventario-base";
import { anexarAssinado, cancelarTer, conferirAssinatura, lerArquivoTer, listarTers, obterTer, registrarEnvio, substituirTer } from "@/server/modulos/ter";
import { contarMeusTersPendentes, enviarMeuTerAssinado, listarMeusTers, obterMeuTer } from "@/server/modulos/ter-colaborador";
import { MARCA, MODELO } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";
import { cadastrarComInspecao, verificacoesNovas } from "../apoio/inspecao";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

let serie = 0;
const monitor = (empresaId: string): DadosEquipamento => ({
  categoria: "MONITOR",
  patrimonio: `VLR-P${++serie}`,
  empresaId,
  marcaId: MARCA.LG,
  modeloId: MODELO.lg24,
  numeroSerie: `SIM-PORTAL-${serie}`,
});

async function cenario() {
  const empresa = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true, cpf: true })).contaId);
  const ana = await criarPessoa({ ativada: true, empresaId: empresa.id, cpf: true });
  const bruno = await criarPessoa({ ativada: true, empresaId: empresa.id, cpf: true });
  const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
  const alo = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [mon.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([mon.id]) });
  const t = await prisma.termo.findFirstOrThrow({ where: { alocacaoId: alo.id }, include: { versoes: true } });
  return { empresa, supervisor, ana, bruno, colaboradora: await ator(ana.contaId), outro: await ator(bruno.contaId), t, alo };
}

const emitido = async (versaoChave: string) => (await obterArmazenamento().ler(versaoChave))!;
const assinado = (base: Buffer, marca = "assinatura de teste") => Buffer.concat([base, Buffer.from(`\n% ${marca}\n%%EOF\n`)]);

beforeEach(limparBanco);

describe("acesso do colaborador", () => {
  it("vê e baixa só os próprios TERs; URL ou id de outra pessoa é negado e auditado; nada da TI", async () => {
    const { supervisor, colaboradora, outro, t, bruno } = await cenario();
    const meus = await listarMeusTers(colaboradora);
    expect(meus.map((x) => x.numero)).toEqual([t.numero]);
    expect(meus[0]).toMatchObject({ situacao: "AGUARDANDO_ASSINATURA", podeEnviar: true, versao: 1, historico: false });
    expect(await listarMeusTers(outro)).toEqual([]);
    expect(await contarMeusTersPendentes(colaboradora)).toBe(1);
    expect(await contarMeusTersPendentes(outro)).toBe(0);

    // Id de outra pessoa (URL manipulada): negado e auditado.
    await expect(obterMeuTer(outro, t.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(lerArquivoTer(outro, t.id, { tipo: "emitido" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(enviarMeuTerAssinado(outro, { termoId: t.id, versao: 1, pdf: assinado(await emitido(t.versoes[0].arquivoChave!)), nomeOriginal: "x.pdf" })).rejects.toBeInstanceOf(ErroAutorizacao);
    expect(await prisma.arquivoAssinadoTer.count()).toBe(0);
    expect(await prisma.eventoAuditoria.count({ where: { resultado: "NEGADO", atorContaId: bruno.contaId } })).toBe(3);
    await expect(obterMeuTer(outro, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/não encontrado/);

    // Nenhuma operação administrativa da TI.
    await expect(listarTers(colaboradora)).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(obterTer(colaboradora, t.id)).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(anexarAssinado(colaboradora, { termoId: t.id, versao: 1, pdf: assinado(await emitido(t.versoes[0].arquivoChave!)), nomeOriginal: "x.pdf" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(registrarEnvio(colaboradora, { termoId: t.id, reenvio: false, canal: "EMAIL", destinatario: "a@b.test", mensagem: "x" })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(lerArquivoTer(colaboradora, t.id, { tipo: "relatorio", conferenciaId: t.id })).rejects.toBeInstanceOf(ErroAutorizacao);

    // Download do próprio PDF: exatamente o arquivo emitido; fica na linha do tempo (uma vez a cada 10 min).
    const pdf = await lerArquivoTer(colaboradora, t.id, { tipo: "emitido" });
    expect(sha256(pdf!.dados)).toBe(t.versoes[0].sha256);
    await lerArquivoTer(colaboradora, t.id, { tipo: "emitido" });
    expect(await prisma.historicoTer.count({ where: { termoId: t.id, acao: "PDF_BAIXADO" } })).toBe(1);
    // A TI baixando não entra como download do colaborador.
    await lerArquivoTer(supervisor, t.id, { tipo: "emitido" });
    expect(await prisma.historicoTer.count({ where: { termoId: t.id, acao: "PDF_BAIXADO" } })).toBe(1);
    const d = await obterMeuTer(colaboradora, t.id);
    expect(d.eventos.map((e) => e.titulo)).toEqual(["Equipamentos entregues", "TER disponibilizado", "PDF baixado"]);
    expect(d).toMatchObject({ podeEnviar: true, recusa: null, pdfAssinado: null, colaborador: colaboradora.nome });
    expect(d.equipamentos).toHaveLength(1);

    // Colaborador desligado não tem sessão (nenhuma ação possível).
    await prisma.colaborador.update({ where: { id: bruno.colaboradorId }, data: { situacao: "DESLIGADO" } });
    expect(await carregarAtor(prisma, bruno.contaId, { mfaVerificado: true })).toBeNull();
  });

  it("termo sem PDF emitido (pendência de cadastro) não aparece para o colaborador", async () => {
    const empresa = await criarEmpresa();
    const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
    const semCpf = await criarPessoa({ ativada: true, empresaId: empresa.id });
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: semCpf.colaboradorId, ativoIds: [mon.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([mon.id]) });
    expect(await prisma.termo.count({ where: { colaboradorId: semCpf.colaboradorId } })).toBe(1);
    expect(await listarMeusTers(await ator(semCpf.contaId))).toEqual([]);
  });
});

describe("envio do PDF assinado pelo portal", () => {
  it("valida o arquivo, guarda os bytes como chegaram, aguarda a conferência; recusa, reenvio e aprovação pela TI", async () => {
    const { supervisor, colaboradora, t } = await cenario();
    const base = await emitido(t.versoes[0].arquivoChave!);
    const envio = (pdf: Buffer, versao = 1) => enviarMeuTerAssinado(colaboradora, { termoId: t.id, versao, pdf, nomeOriginal: "Meu TER assinado.pdf" });

    await expect(envio(Buffer.from("isto não é um pdf"))).rejects.toThrow(/PDF/);
    await expect(envio(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from("\n%%EOF")]))).rejects.toThrow(/10 MB/);
    await expect(envio(base)).rejects.toThrow(/ainda sem assinatura/);
    await expect(envio(assinado(base), 2)).rejects.toThrow(/nova versão/);
    expect(await prisma.arquivoAssinadoTer.count()).toBe(0);

    // Dois envios ao mesmo tempo: um é recebido, o outro espera a conferência.
    const primeiro = assinado(base, "primeira");
    const resultados = await Promise.allSettled([envio(primeiro), envio(assinado(base, "simultanea"))]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((resultados.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/Aguarde a conferência/);
    const arq1 = await prisma.arquivoAssinadoTer.findFirstOrThrow({ where: { termoId: t.id } });
    expect(arq1).toMatchObject({ origem: "PORTAL_COLABORADOR", enviadoPorNome: colaboradora.nome, versao: 1 });
    expect([primeiro, assinado(base, "simultanea")].map(sha256)).toContain(arq1.sha256);
    expect(sha256((await obterArmazenamento().ler(arq1.chave))!)).toBe(arq1.sha256);
    const termo = await prisma.termo.findUniqueOrThrow({ where: { id: t.id } });
    // Receber não é assinar: aguarda a conferência da TI.
    expect([termo.estadoAssinatura, termo.estado, termo.arquivoAssinadoChave]).toEqual(["ARQUIVO_RECEBIDO", "AGUARDANDO_ASSINATURA", null]);
    const auditoria = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "termo.anexar_assinado", alvoId: t.id } });
    expect(auditoria.detalhe).toMatchObject({ origem: "PORTAL_COLABORADOR", sha256: arq1.sha256 });
    expect((await prisma.historicoTer.findFirstOrThrow({ where: { termoId: t.id, acao: "ARQUIVO_RECEBIDO" } })).detalhe).toMatch(/^Enviado pelo colaborador no Portal do Colaborador/);
    expect((await listarMeusTers(colaboradora))[0]).toMatchObject({ situacao: "AGUARDANDO_CONFERENCIA", podeEnviar: false });

    // Na aba TER: aguardando conferência, enviado pelo colaborador.
    const lista = await listarTers(supervisor, { situacao: "AGUARDANDO_CONFERENCIA" });
    expect(lista.linhas.map((l) => [l.numero, l.arquivoPeloPortal])).toEqual([[t.numero, true]]);
    expect((await obterTer(supervisor, t.id)).arquivoParaConferir).toMatchObject({ id: arq1.id, origem: "PORTAL_COLABORADOR" });

    // Recusa: o colaborador vê o motivo (não as observações internas) e envia de novo.
    await conferirAssinatura(supervisor, {
      termoId: t.id,
      arquivoId: arq1.id,
      resultado: "NAO_CONFORME",
      confereColaborador: false,
      confereDocumento: false,
      motivo: "O PDF não contém assinatura eletrônica.",
      observacoes: "Nota interna da TI que não deve aparecer.",
    });
    let meu = await obterMeuTer(colaboradora, t.id);
    expect(meu).toMatchObject({ situacao: "ASSINATURA_RECUSADA", podeEnviar: true, recusa: { motivo: "O PDF não contém assinatura eletrônica." } });
    expect(JSON.stringify(meu)).not.toContain("Nota interna");
    expect(await contarMeusTersPendentes(colaboradora)).toBe(1);
    await envio(assinado(base, "segunda"));
    expect(await prisma.arquivoAssinadoTer.count({ where: { termoId: t.id } })).toBe(2);
    expect(await obterArmazenamento().ler(arq1.chave)).not.toBeNull();

    // Aprovação manual pela TI: só então assinado e conferido; o colaborador baixa o assinado conferido.
    const arq2 = await prisma.arquivoAssinadoTer.findFirstOrThrow({ where: { termoId: t.id }, orderBy: { recebidoEm: "desc" } });
    await expect(lerArquivoTer(colaboradora, t.id, { tipo: "assinado", arquivoId: arq2.id })).rejects.toBeInstanceOf(ErroAutorizacao);
    await conferirAssinatura(supervisor, { termoId: t.id, arquivoId: arq2.id, resultado: "CONFORME", signatario: colaboradora.nome, confereColaborador: true, confereDocumento: true });
    meu = await obterMeuTer(colaboradora, t.id);
    expect(meu).toMatchObject({ situacao: "ASSINADO_CONFERIDO", podeEnviar: false, pdfAssinado: `/api/termos/${t.id}/pdf?arquivo=assinado&id=${arq2.id}` });
    expect(sha256((await lerArquivoTer(colaboradora, t.id, { tipo: "assinado", arquivoId: arq2.id }))!.dados)).toBe(arq2.sha256);
    // O arquivo recusado não fica disponível para o colaborador.
    await expect(lerArquivoTer(colaboradora, t.id, { tipo: "assinado", arquivoId: arq1.id })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(envio(assinado(base, "terceira"))).rejects.toThrow(/já está assinado e conferido/);
    expect(meu.eventos.map((e) => e.titulo)).toEqual([
      "Equipamentos entregues",
      "TER disponibilizado",
      "Documento assinado enviado",
      "Assinatura recusada",
      "Novo documento assinado enviado",
      "Assinatura conferida",
    ]);
    expect(meu.eventos.find((e) => e.titulo === "Assinatura recusada")?.detalhe).toContain("O PDF não contém assinatura eletrônica.");
    expect(await contarMeusTersPendentes(colaboradora)).toBe(0);
  });

  it("TER cancelado fica só para consulta; substituído: a versão anterior é consulta e só a vigente recebe assinatura", async () => {
    const { supervisor, colaboradora, t, empresa, ana } = await cenario();
    const base = await emitido(t.versoes[0].arquivoChave!);

    await substituirTer(supervisor, { termoId: t.id, motivo: "Correção do cargo do colaborador." });
    let meu = await obterMeuTer(colaboradora, t.id);
    expect(meu.versao).toBe(2);
    expect(meu.versoesAnteriores).toEqual([expect.objectContaining({ versao: 1, estado: "SUBSTITUIDO" })]);
    expect(meu.eventos.some((e) => e.titulo === "Nova versão disponibilizada (versão 2)")).toBe(true);
    // A versão anterior continua para consulta (download), mas não recebe assinatura.
    expect(sha256((await lerArquivoTer(colaboradora, t.id, { tipo: "emitido", versao: 1 }))!.dados)).toBe(t.versoes[0].sha256);
    await expect(enviarMeuTerAssinado(colaboradora, { termoId: t.id, versao: 1, pdf: assinado(base), nomeOriginal: "v1.pdf" })).rejects.toThrow(/nova versão/);
    const v2 = await prisma.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId: t.id, versao: 2 } } });
    await enviarMeuTerAssinado(colaboradora, { termoId: t.id, versao: 2, pdf: assinado(await emitido(v2.arquivoChave!)), nomeOriginal: "v2.pdf" });

    // Outro TER do mesmo colaborador, cancelado pela TI: consulta, sem envio; a alocação continua.
    const mon = await cadastrarComInspecao(supervisor, { dados: monitor(empresa.id) });
    const alo = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: ana.colaboradorId, ativoIds: [mon.id], modo: "ENTREGAR", verificacoes: await verificacoesNovas([mon.id]) });
    const t2 = await prisma.termo.findFirstOrThrow({ where: { alocacaoId: alo.id }, include: { versoes: true } });
    await registrarEnvio(supervisor, { termoId: t2.id, reenvio: false, canal: "EMAIL", destinatario: "pessoa@vallur.test", mensagem: MENSAGEM_ENVIO });
    await cancelarTer(supervisor, { termoId: t2.id, motivo: "Emitido em duplicidade.", confirmacao: true });
    const lista = await listarMeusTers(colaboradora);
    expect(lista.map((x) => [x.numero, x.situacao, x.historico, x.podeEnviar])).toEqual([
      [t2.numero, "CANCELADO", true, false],
      [t.numero, "AGUARDANDO_CONFERENCIA", false, false],
    ]);
    meu = await obterMeuTer(colaboradora, t2.id);
    expect(meu.eventos.map((e) => e.titulo)).toContain("TER cancelado pela TI");
    await expect(
      enviarMeuTerAssinado(colaboradora, { termoId: t2.id, versao: 1, pdf: assinado(await emitido(t2.versoes[0].arquivoChave!)), nomeOriginal: "x.pdf" }),
    ).rejects.toThrow(/não está disponível para assinatura/);
    expect((await prisma.alocacao.findUniqueOrThrow({ where: { id: alo.id } })).estado).toBe("ATIVA");
  });
});
