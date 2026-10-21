import type { EstadoAssinaturaTer, EstadoDocumentoTer, OrigemArquivoTer, Prisma, TipoEventoEntrega } from "@/generated/prisma/client";
import { formatarCnpj } from "@/lib/cnpj";
import { mascararCpf } from "@/lib/cpf";
import { ROTULO_PARTE, type ParteKit } from "@/lib/identificacao";
import { ROTULO_RESULTADO, ROTULO_TIPO_INSPECAO, type Resultado, type TipoInspecao } from "@/lib/inspecao";
import { ROTULO_FOTO, type TipoFoto } from "@/lib/inventario";
import {
  CANAIS_ENVIO,
  FERRAMENTA_PADRAO,
  nomeDocumentoTer,
  pendenciasDoTer,
  PERMITE_ANEXO,
  PERMITE_ENVIO_COLABORADOR,
  PERMITE_REENVIO,
  RESULTADOS_CONFERENCIA,
  ROTULO_CANAL,
  ROTULO_ESTADO_ASSINATURA,
  situacaoTer,
  type SituacaoTer,
} from "@/lib/ter";
import { novaChavePdf, obterArmazenamento, validarPdf } from "@/server/armazenamento";
import { registrarAuditoria } from "@/server/auditoria";
import type { Ator } from "@/server/authz/ator";
import { temPerfilAdministrativo } from "@/server/authz/avaliar";
import { ErroAutorizacao, ErroNegocio, executarCasoDeUso, exigirPermissao, pode } from "@/server/authz/exigir";
import { obterConfiguracao } from "@/server/config";
import { revelarCpf } from "@/server/cpf";
import { prisma, type Transacao } from "@/server/db";
import type { DadosTer, EquipamentoTer, ImagemPdf } from "@/server/documentos/ter-pdf";
import { alugueisQueValem } from "./alugueis";
import { registrarVerificacoes, type InstantaneoEntrega, type PerguntaSemResposta } from "./inspecoes";
import { lerMomento, proximoNumeroTer, rotuloAtivo, rotuloTipo, SELECAO_TIPO, sha256, UUID } from "./inventario-base";

/**
 * TER emitido pelo portal: um por evento de entrega física. A entrega registra o evento e cria
 * o TER (gerando) na mesma transação; o PDF é gerado logo depois, fora dela — se falhar, a
 * entrega continua registrada e o TER fica com erro, para tentar de novo. Emitida, a versão não
 * muda (correção é nova versão). A assinatura é externa (GOV.BR): o portal registra envios,
 * guarda o PDF assinado recebido e a conferência manual; só a conferência "conforme" torna o
 * TER assinado. Nada aqui altera a alocação ou a custódia.
 */

export const ROTULO_EVENTO: Record<TipoEventoEntrega, string> = {
  NOVA_ALOCACAO: "Nova alocação",
  CONFIRMACAO_RESERVA: "Reserva convertida em entrega",
  TRANSFERENCIA: "Transferência entre colaboradores",
  ENTREGA_ADICIONAL: "Entrega adicional",
};

const MODO_VERIFICACAO: Record<string, string> = {
  CONFIRMOU_ULTIMA: "Última inspeção confirmada na entrega",
  NOVA_INSPECAO: "Inspeção registrada na entrega",
};

type Responsavel = { contaId: string | null; nome: string };
const responsavel = (ator: Ator): Responsavel => ({ contaId: ator.contaId, nome: ator.nome });

const texto = (v: string | null | undefined, max: number, rotulo: string) => {
  const t = (v ?? "").normalize("NFC").trim();
  if (t.length > max) throw new ErroNegocio(`${rotulo}: use no máximo ${max} caracteres.`);
  return t;
};

async function travarTermo(tx: Transacao, termoId: string) {
  await tx.$queryRaw`SELECT id FROM "termo" WHERE id = ${termoId} FOR UPDATE`;
  const t = await tx.termo.findUnique({ where: { id: termoId }, include: { colaborador: { select: { id: true, nome: true, emailCorporativo: true } }, alocacao: { select: { numero: true } } } });
  if (!t || !t.eventoEntregaId) throw new ErroNegocio("TER não encontrado.");
  return t;
}

/** Instantes estritamente crescentes: eventos gravados na mesma transação mantêm a ordem. */
let ultimoInstante = 0;
function instante() {
  ultimoInstante = Math.max(Date.now(), ultimoInstante + 1);
  return new Date(ultimoInstante);
}

async function historico(tx: Transacao, termoId: string, versao: number | null, acao: string, por: Responsavel, detalhe?: string | null) {
  await tx.historicoTer.create({ data: { termoId, versao, acao, detalhe: detalhe ?? null, responsavelContaId: por.contaId, responsavelNome: por.nome, em: instante() } });
}

/* Evento de entrega física (na transação da entrega) */

/** Instantâneo de cada item no evento: o TER usa este, nunca o cadastro atual. */
export type ItemEvento = {
  itemAlocacaoId: string;
  ativoId: string;
  identificador: string;
  patrimonio: string | null;
  nomeDispositivo: string | null;
  categoria: string;
  tipo: string;
  parteKit: ParteKit | null;
  kitId: string | null;
  notebookId: string | null;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  /** Especificação cadastrada na entrega (processador, memória...); ausente nos eventos mais antigos. */
  especificacao?: string | null;
  proprietaria: { id: string; nome: string; sigla: string; cnpj: string };
  aluguel: { locataria: { id: string; nome: string; sigla: string }; inicio: string } | null;
  /** Fotos do cadastro vigentes na entrega. */
  fotos: { id: string; tipo: string }[];
};

/**
 * Entrega física confirmada: registra o evento (quem recebeu, quando, quais itens e em que
 * condições), grava as verificações técnicas apontando para ele e cria o TER com a versão 1
 * em geração. Chamar na transação da entrega, depois das regras de custódia e de empresa.
 */
export async function registrarEntregaFisica(
  tx: Transacao,
  ator: Ator,
  e: { alocacaoId: string; tipo: TipoEventoEntrega; entregueEm: Date; itens: { id: string; ativoId: string }[]; verificacoes: Parameters<typeof registrarVerificacoes>[4] },
) {
  const a = await tx.alocacao.findUniqueOrThrow({
    where: { id: e.alocacaoId },
    select: { id: true, numero: true, colaboradorId: true, empresaColaboradorId: true, responsavelTiNome: true, colaborador: { select: { nome: true } } },
  });
  const itens = await tx.itemAlocacao.findMany({
    where: { id: { in: e.itens.map((i) => i.id) } },
    include: {
      empresaProprietaria: { select: { id: true, nome: true, sigla: true, cnpj: true } },
      ativo: {
        select: {
          id: true,
          empresaId: true,
          categoria: true,
          ...SELECAO_TIPO,
          kitId: true,
          notebookId: true,
          desvinculadoEm: true,
          nomeDispositivo: true,
          patrimonio: true,
          marca: true,
          modelo: true,
          numeroSerie: true,
          processador: true,
          memoriaRam: true,
          armazenamento: true,
          sistemaOperacional: true,
          fotos: { where: { contexto: "CADASTRO", removidaEm: null }, orderBy: [{ tipo: "asc" }, { enviadaEm: "asc" }], select: { id: true, tipo: true } },
        },
      },
    },
  });
  const alugueis = await alugueisQueValem(tx, itens.map((i) => i.ativo));
  const instantaneo: ItemEvento[] = itens.map((i) => {
    const aluguel = alugueis.get(i.ativo.id);
    return {
      itemAlocacaoId: i.id,
      ativoId: i.ativo.id,
      identificador: rotuloAtivo(i.ativo),
      patrimonio: i.ativo.patrimonio,
      nomeDispositivo: i.ativo.nomeDispositivo,
      categoria: rotuloTipo(i.ativo),
      tipo: i.ativo.categoria,
      parteKit: i.ativo.parteKit as ParteKit | null,
      kitId: i.ativo.kitId,
      notebookId: i.ativo.notebookId && !i.ativo.desvinculadoEm ? i.ativo.notebookId : null,
      marca: i.ativo.marca,
      modelo: i.ativo.modelo,
      numeroSerie: i.ativo.numeroSerie,
      especificacao:
        [i.ativo.processador, i.ativo.memoriaRam ? `Memória ${i.ativo.memoriaRam}` : null, i.ativo.armazenamento ? `Armazenamento ${i.ativo.armazenamento}` : null, i.ativo.sistemaOperacional]
          .filter(Boolean)
          .join(" · ") || null,
      proprietaria: i.empresaProprietaria,
      aluguel: aluguel ? { locataria: aluguel.empresaLocataria, inicio: aluguel.inicio.toISOString().slice(0, 10) } : null,
      fotos: i.ativo.fotos,
    };
  });
  const evento = await tx.eventoEntrega.create({
    data: {
      alocacaoId: a.id,
      tipo: e.tipo,
      entregueEm: e.entregueEm,
      colaboradorId: a.colaboradorId,
      empresaColaboradorId: a.empresaColaboradorId,
      responsavelTiNome: a.responsavelTiNome ?? ator.nome,
      registradoPorContaId: ator.contaId,
      registradoPorNome: ator.nome,
      itens: instantaneo as unknown as Prisma.InputJsonArray,
    },
  });
  await registrarVerificacoes(tx, ator, a.id, e.itens, e.verificacoes, evento.id);

  const modelo = await tx.modeloDocumento.findFirst({ where: { tipo: "TER", ativo: true }, orderBy: { criadoEm: "desc" } });
  const termo = await tx.termo.create({
    data: {
      numero: await proximoNumeroTer(tx),
      tipo: "TER",
      alocacaoId: a.id,
      colaboradorId: a.colaboradorId,
      empresaId: a.empresaColaboradorId,
      eventoEntregaId: evento.id,
      estado: "RASCUNHO",
      estadoDocumento: "GERANDO",
      versaoModelo: modelo ? `${modelo.codigo} rev. ${modelo.revisao}` : null,
      versoes: {
        create: { versao: 1, estado: "GERANDO", motivo: "Emissão inicial", modeloCodigo: modelo?.codigo ?? "", modeloRevisao: modelo?.revisao ?? "", criadaPorNome: ator.nome },
      },
    },
  });
  const por = responsavel(ator);
  await historico(tx, termo.id, null, "ENTREGA_REGISTRADA", por, `${a.numero}: ${itens.length} equipamento(s) entregue(s) a ${a.colaborador.nome} (${ROTULO_EVENTO[e.tipo].toLowerCase()}).`);
  await historico(tx, termo.id, 1, "TER_CRIADO", por, `${termo.numero} criado automaticamente pela entrega física.`);
  return { termoId: termo.id, numero: termo.numero };
}

/* Emissão (fora da transação da entrega) */

export type ResultadoEmissao = { numero: string; estado: "EMITIDO" | "ERRO_GERACAO" | "PENDENTE_CADASTRO" | "SEM_ALTERACAO"; erro?: string };

/**
 * Gera o PDF da versão em geração (ou com erro), guarda no armazenamento privado e só então a
 * marca como emitida. Idempotente: com duas chamadas simultâneas, só uma emite e a outra
 * descarta o arquivo. Nunca lança: a falha fica registrada no TER.
 */
export async function emitirTer(termoId: string, por: Responsavel): Promise<ResultadoEmissao> {
  const t = await prisma.termo.findUnique({ where: { id: termoId }, include: { versoes: { orderBy: { versao: "desc" }, take: 1 } } });
  if (!t) return { numero: "", estado: "SEM_ALTERACAO" };
  const v = t.versoes[0];
  if (!v || (v.estado !== "GERANDO" && v.estado !== "ERRO_GERACAO") || t.estadoDocumento === "CANCELADO") return { numero: t.numero, estado: "SEM_ALTERACAO" };
  let chave: string | null = null;
  try {
    const montado = await montarDocumento(termoId, v.versao, por);
    if (montado.tipo === "PENDENTE") {
      await registrarFalha(termoId, v.versao, por, `Pendência de cadastro: ${montado.pendencias.join(", ")}. Complete o cadastro de origem; o TER é gerado em seguida.`, montado.pendencias);
      return { numero: t.numero, estado: "PENDENTE_CADASTRO", erro: montado.pendencias.join(", ") };
    }
    // O gerador de PDF só é carregado quando há documento a emitir.
    const { renderizarTer } = await import("@/server/documentos/ter-pdf");
    const { pdf, paginas } = await renderizarTer(montado.dados, montado.recursos);
    chave = novaChavePdf("termos");
    await obterArmazenamento().salvar(chave, pdf);
    const arquivo = chave;
    const emitido = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "termo" WHERE id = ${termoId} FOR UPDATE`;
      const atual = await tx.termo.findUniqueOrThrow({ where: { id: termoId } });
      const versao = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId, versao: v.versao } } });
      if ((versao.estado !== "GERANDO" && versao.estado !== "ERRO_GERACAO") || atual.estadoDocumento === "CANCELADO") return false;
      const agora = new Date(montado.dados.emitidoEm);
      const resumo = sha256(pdf);
      await tx.versaoTer.update({
        where: { id: versao.id },
        data: {
          estado: "EMITIDO",
          dados: montado.dados as unknown as Prisma.InputJsonObject,
          arquivoChave: arquivo,
          sha256: resumo,
          tamanho: pdf.length,
          paginas,
          nomeArquivo: `${montado.dados.documento}.pdf`,
          documentoTeste: montado.dados.teste,
          erro: null,
          pendencias: [],
          tentativas: { increment: 1 },
          emitidaEm: agora,
          emitidaPorNome: por.nome,
        },
      });
      await tx.termo.update({
        where: { id: termoId },
        data: { estadoDocumento: "EMITIDO", estadoAssinatura: "AGUARDANDO_ENVIO", estado: "EMITIDO", versaoVigente: v.versao, emitidoEm: agora },
      });
      await historico(tx, termoId, v.versao, "PDF_GERADO", por, `${paginas} página(s), ${Math.ceil(pdf.length / 1024)} KB. SHA-256 ${resumo}.`);
      await historico(tx, termoId, v.versao, "EMITIDO", por, `Versão ${v.versao} emitida (${montado.dados.modelo.codigo} rev. ${montado.dados.modelo.revisao}).`);
      await registrarAuditoria(tx, {
        acao: "termo.emitir",
        resultado: "SUCESSO",
        ator: por.contaId ? { contaId: por.contaId, nome: por.nome } : null,
        alvo: { tipo: "termo", id: termoId, descricao: `${t.numero} v${v.versao}` },
        origemPermissao: "ENTREGA_FISICA",
        detalhe: { versao: v.versao, sha256: resumo, tamanho: pdf.length, paginas, equipamentos: montado.dados.equipamentos.length },
      });
      return true;
    });
    if (!emitido) {
      await obterArmazenamento().remover(arquivo).catch(() => undefined);
      return { numero: t.numero, estado: "SEM_ALTERACAO" };
    }
    return { numero: t.numero, estado: "EMITIDO" };
  } catch (erro) {
    if (chave) await obterArmazenamento().remover(chave).catch(() => undefined);
    const mensagem = erro instanceof ErroNegocio ? erro.message : "Falha ao gerar ou armazenar o PDF. Tente gerar novamente.";
    if (!(erro instanceof ErroNegocio)) console.error("Falha na emissão do TER", termoId, erro);
    await registrarFalha(termoId, v.versao, por, mensagem, []).catch((e) => console.error("Falha ao registrar o erro do TER", termoId, e));
    return { numero: t.numero, estado: "ERRO_GERACAO", erro: mensagem };
  }
}

async function registrarFalha(termoId: string, versao: number, por: Responsavel, erro: string, pendencias: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "termo" WHERE id = ${termoId} FOR UPDATE`;
    const v = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId, versao } } });
    if (v.estado !== "GERANDO" && v.estado !== "ERRO_GERACAO") return;
    await tx.versaoTer.update({ where: { id: v.id }, data: { estado: "ERRO_GERACAO", erro: erro.slice(0, 500), pendencias, tentativas: { increment: 1 } } });
    await tx.termo.update({ where: { id: termoId }, data: { estadoDocumento: "ERRO_GERACAO" } });
    await historico(tx, termoId, versao, pendencias.length ? "PENDENCIA_CADASTRO" : "ERRO_GERACAO", por, erro);
  });
}

/** Depois da entrega (já gravada): emite o TER sem afetar o resultado da operação. */
export async function emitirAposEntrega(ter: { termoId: string; numero: string } | null | undefined, ator: Ator) {
  if (!ter) return null;
  const r = await emitirTer(ter.termoId, responsavel(ator)).catch((erro): ResultadoEmissao => {
    console.error("Falha na emissão do TER", ter.termoId, erro);
    return { numero: ter.numero, estado: "ERRO_GERACAO" };
  });
  return { numero: ter.numero, estado: r.estado === "SEM_ALTERACAO" ? "EMITIDO" : r.estado, erro: r.erro ?? null };
}

/** Cadastro completado (ex.: CPF informado): gera os TERs do colaborador que esperavam por ele. */
export async function retomarPendentesDoColaborador(colaboradorId: string, ator: Ator) {
  const pendentes = await prisma.termo.findMany({
    where: { colaboradorId, estadoDocumento: "ERRO_GERACAO", versoes: { some: { estado: "ERRO_GERACAO", NOT: { pendencias: { isEmpty: true } } } } },
    select: { id: true },
  });
  for (const p of pendentes) await emitirTer(p.id, responsavel(ator));
  return pendentes.length;
}

/* Montagem do documento: snapshots do evento + cadastro atual de empresa e colaborador */

const ORDEM_TIPO = (i: ItemEvento) => (i.tipo === "CARREGADOR" ? 1 : 0);

/** Equipamentos principais em ordem; cada carregador logo depois do notebook que acompanha. */
export function ordenarItens(itens: ItemEvento[]) {
  const porNome = (a: ItemEvento, b: ItemEvento) => ORDEM_TIPO(a) - ORDEM_TIPO(b) || a.identificador.localeCompare(b.identificador, "pt-BR", { numeric: true });
  const ids = new Set(itens.map((i) => i.ativoId));
  const anexos = (i: ItemEvento) => i.tipo === "CARREGADOR" && i.notebookId !== null && ids.has(i.notebookId);
  const principais = itens.filter((i) => !anexos(i)).sort(porNome);
  return principais.flatMap((p) => [p, ...itens.filter((c) => anexos(c) && c.notebookId === p.ativoId).sort(porNome)]);
}

async function imagemParaPdf(dados: Buffer | null, mime: string | null): Promise<ImagemPdf | null> {
  if (!dados) return null;
  try {
    // Reduz e normaliza (WebP não entra no PDF): proporção preservada.
    const sharp = (await import("sharp")).default;
    const saida = await sharp(dados).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { data: saida, format: "jpg" };
  } catch {
    if (mime === "image/jpeg") return { data: dados, format: "jpg" };
    if (mime === "image/png") return { data: dados, format: "png" };
    return null;
  }
}

async function logoParaPdf(dados: Buffer | null): Promise<ImagemPdf | null> {
  if (!dados) return null;
  try {
    const sharp = (await import("sharp")).default;
    return { data: await sharp(dados).resize({ height: 160, fit: "inside", withoutEnlargement: true }).png().toBuffer(), format: "png" };
  } catch {
    return null;
  }
}

/** "Notebook Dell Latitude 5440" sem repetir palavras (o carregador sai como "Carregador Dell"). */
export function descricaoEquipamento(i: ItemEvento) {
  const partes = [i.tipo === "CARREGADOR" ? "Carregador" : i.categoria];
  const jaTem = (t: string) => partes.join(" ").toLocaleLowerCase("pt-BR").includes(t.toLocaleLowerCase("pt-BR"));
  for (const p of [i.marca, i.modelo].map((x) => x?.trim())) if (p && !jaTem(p)) partes.push(p);
  return partes.join(" ");
}

async function montarDocumento(termoId: string, versao: number, por: Responsavel) {
  const t = await prisma.termo.findUniqueOrThrow({
    where: { id: termoId },
    include: {
      eventoEntrega: { include: { verificacoes: true, alocacao: { select: { numero: true, observacoes: true } } } },
      colaborador: { select: { id: true, nome: true, cargo: true, departamento: true, emailCorporativo: true, cpfCifrado: true, cpfFinal: true } },
      empresa: { select: { id: true, nome: true, cnpj: true, logoChave: true } },
      versoes: { where: { versao } },
    },
  });
  const v = t.versoes[0];
  const evento = t.eventoEntrega;
  if (!evento || !t.empresa) throw new ErroNegocio("TER sem evento de entrega vinculado.");
  const modelo = v.modeloCodigo
    ? await prisma.modeloDocumento.findUnique({ where: { tipo_codigo_revisao: { tipo: "TER", codigo: v.modeloCodigo, revisao: v.modeloRevisao } } })
    : await prisma.modeloDocumento.findFirst({ where: { tipo: "TER", ativo: true }, orderBy: { criadoEm: "desc" } });
  if (!modelo) throw new ErroNegocio("Modelo documental do TER não configurado.");

  const itens = ordenarItens(evento.itens as unknown as ItemEvento[]);
  // Dados obrigatórios do modelo que faltam no cadastro: nada é inventado. Documento oficial
  // (produção) só com CNPJ válido e real; fora de produção o PDF sai como documento de teste.
  const oficial = obterConfiguracao().AMBIENTE === "PRODUCAO";
  const pendencias = pendenciasDoTer({ temCpf: Boolean(t.colaborador.cpfCifrado), oficial, empresas: [{ nome: t.empresa.nome, cnpj: t.empresa.cnpj }, ...itens.map((i) => i.proprietaria)] });
  if (pendencias.length) return { tipo: "PENDENTE" as const, pendencias };
  const teste = !oficial;

  const cpf = revelarCpf(t.colaborador.cpfCifrado!);
  await registrarAuditoria(prisma, {
    acao: "colaborador.cpf_revelar",
    resultado: "SUCESSO",
    ator: por.contaId ? { contaId: por.contaId, nome: por.nome } : null,
    alvo: { tipo: "colaborador", id: t.colaborador.id, descricao: t.colaborador.nome },
    origemPermissao: "EMISSAO_TER",
    detalhe: { finalidade: "Montagem do PDF do TER", termo: t.numero, versao },
  });

  const verificacoes = new Map(evento.verificacoes.map((x) => [x.itemAlocacaoId, x.instantaneo as unknown as InstantaneoEntrega]));
  const resultadoDe = new Map(itens.map((i) => [i.ativoId, verificacoes.get(i.itemAlocacaoId)?.inspecao.resultado as Resultado | undefined]));
  const rotuloResultado = (ativoId: string) => {
    const r = resultadoDe.get(ativoId);
    return r ? ROTULO_RESULTADO[r] : "Não verificado";
  };

  // Fotos: as do cadastro vigentes na entrega e as evidências da inspeção usada.
  const fotosPorItem = new Map<string, { id: string; legenda: string }[]>();
  for (const i of itens) {
    const snap = verificacoes.get(i.itemAlocacaoId);
    const daInspecao = (snap?.respostas ?? []).flatMap((r) => r.fotos.map((id) => ({ id, legenda: `${i.identificador} — ${r.pergunta}`.slice(0, 160) })));
    const doCadastro = i.fotos.map((f) => ({ id: f.id, legenda: `${i.identificador} — ${ROTULO_FOTO[f.tipo as TipoFoto] ?? "Foto"}` }));
    fotosPorItem.set(i.ativoId, [...doCadastro, ...daInspecao]);
  }
  const idsFotos = [...fotosPorItem.values()].flat().map((f) => f.id);
  const registros = idsFotos.length ? await prisma.fotoAtivo.findMany({ where: { id: { in: idsFotos } }, select: { id: true, chave: true, mime: true } }) : [];
  const armazenamento = obterArmazenamento();
  const fotos = new Map<string, ImagemPdf>();
  for (const f of registros) {
    const imagem = await imagemParaPdf(await armazenamento.ler(f.chave), f.mime);
    if (imagem) fotos.set(f.id, imagem);
  }
  const logo = await logoParaPdf(t.empresa.logoChave ? await armazenamento.ler(t.empresa.logoChave) : null);

  const equipamentos: EquipamentoTer[] = itens.map((i, n) => {
    const snap = verificacoes.get(i.itemAlocacaoId);
    if (!snap) throw new ErroNegocio(`${i.identificador}: verificação da entrega não encontrada.`);
    const notebook = i.notebookId ? itens.find((x) => x.ativoId === i.notebookId) : undefined;
    // Cada unidade é contada uma vez: o carregador tem anexo próprio e aparece aqui só como referência.
    const acessorios = [
      ...itens.filter((c) => c.tipo === "CARREGADOR" && c.notebookId === i.ativoId).map((c) => ({ ...c, nome: "Carregador" })),
      ...(i.kitId ? itens.filter((c) => c.kitId === i.kitId && c.ativoId !== i.ativoId).map((c) => ({ ...c, nome: c.parteKit ? ROTULO_PARTE[c.parteKit] : c.categoria })) : []),
    ].map((c) => ({
      nome: c.nome,
      quantidade: 1,
      identificacao: [c.identificador, c.numeroSerie ? `S/N ${c.numeroSerie}` : null, `anexo ${itens.findIndex((x) => x.ativoId === c.ativoId) + 1}`].filter(Boolean).join(" · "),
      estado: rotuloResultado(c.ativoId),
    }));
    const ressalvas = snap.respostas
      .filter((r) => r.resposta === "NAO_CONFORME" || r.resposta === "NAO_TESTADO")
      .map((r) => `${r.resposta === "NAO_TESTADO" ? "Não testado" : "Não conforme"} — ${r.pergunta}${r.justificativa ? `: ${r.justificativa}` : ""}`);
    return {
      anexo: n + 1,
      ativoId: i.ativoId,
      // O identificador é o código do portal; o patrimônio é outro campo, só quando informado.
      identificador: i.nomeDispositivo ?? i.identificador,
      patrimonio: i.patrimonio,
      nomeDispositivo: i.nomeDispositivo,
      categoria: i.categoria,
      descricao: descricaoEquipamento(i),
      especificacao: i.especificacao ?? null,
      marca: i.marca,
      modelo: i.modelo,
      numeroSerie: i.numeroSerie,
      proprietaria: { nome: i.proprietaria.nome, cnpj: formatarCnpj(i.proprietaria.cnpj) },
      aluguel: i.aluguel ? { locataria: i.aluguel.locataria.nome, inicio: i.aluguel.inicio.split("-").reverse().join("/") } : null,
      condicao: ROTULO_RESULTADO[snap.inspecao.resultado as Resultado] ?? snap.inspecao.resultado,
      avarias: ressalvas,
      acompanha: notebook ? { identificador: notebook.nomeDispositivo ?? notebook.identificador, anexo: itens.indexOf(notebook) + 1 } : null,
      vinculo: notebook
        ? `Acompanha o notebook ${notebook.nomeDispositivo ?? notebook.identificador} (anexo ${itens.indexOf(notebook) + 1}).`
        : i.tipo === "CARREGADOR" && i.notebookId
          ? "Carregador vinculado a um notebook entregue em outro evento."
          : i.parteKit
            ? `Peça de kit: ${ROTULO_PARTE[i.parteKit]}.`
            : null,
      inspecao: {
        numero: snap.inspecao.numero ?? "sem número",
        tipo: ROTULO_TIPO_INSPECAO[snap.inspecao.tipo as TipoInspecao] ?? snap.inspecao.tipo,
        concluidaEm: snap.inspecao.concluidaEm,
        responsavel: snap.inspecao.responsavel,
        resultado: ROTULO_RESULTADO[snap.inspecao.resultado as Resultado] ?? snap.inspecao.resultado,
        observacoes: snap.inspecao.observacoes,
      },
      verificacao: { modo: MODO_VERIFICACAO[snap.modo] ?? snap.modo, verificadaEm: snap.verificadaEm, responsavel: snap.responsavel.nome },
      respostas: snap.respostas.map((r) => ({
        grupo: r.grupo,
        pergunta: r.pergunta,
        versao: r.versao,
        resposta: r.resposta,
        justificativa: r.justificativa,
        observacao: r.observacao,
        bloqueante: r.bloqueante,
      })),
      semResposta: ((snap as { semResposta?: PerguntaSemResposta[] }).semResposta ?? []).map((x) => ({ grupo: x.grupo, pergunta: x.pergunta, versao: x.versao })),
      acessorios,
      fotos: fotosPorItem.get(i.ativoId) ?? [],
    };
  });

  // Mesmo colaborador e mesmo dia em outro TER: o número diferencia o nome do arquivo.
  const outros = await prisma.termo.findMany({
    where: { colaboradorId: t.colaboradorId, tipo: "TER", NOT: { id: t.id }, eventoEntregaId: { not: null } },
    select: { eventoEntrega: { select: { entregueEm: true } } },
  });
  const base = nomeDocumentoTer(t.colaborador.nome, evento.entregueEm);
  const repetido = outros.some((o) => o.eventoEntrega && nomeDocumentoTer(t.colaborador.nome, o.eventoEntrega.entregueEm) === base);
  const complemento = [repetido ? t.numero : null, versao > 1 ? `v${versao}` : null].filter(Boolean).join(" ");

  const dados: DadosTer = {
    formato: 2,
    teste,
    numero: t.numero,
    versao,
    documento: nomeDocumentoTer(t.colaborador.nome, evento.entregueEm, complemento || null),
    emitidoEm: new Date().toISOString(),
    modelo: { codigo: modelo.codigo, revisao: modelo.revisao, titulo: modelo.titulo, declaracoes: modelo.declaracoes as string[], exigeAssinaturaTi: modelo.exigeAssinaturaTi },
    entrega: {
      evento: evento.id,
      tipo: ROTULO_EVENTO[evento.tipo],
      entregueEm: evento.entregueEm.toISOString(),
      alocacao: evento.alocacao.numero,
      responsavelTi: evento.responsavelTiNome,
      registradoPor: evento.registradoPorNome,
      observacoes: evento.alocacao.observacoes,
    },
    empresa: { id: t.empresa.id, nome: t.empresa.nome, cnpj: formatarCnpj(t.empresa.cnpj), temLogo: Boolean(logo) },
    colaborador: {
      id: t.colaborador.id,
      nome: t.colaborador.nome,
      cpfFinal: t.colaborador.cpfFinal,
      matricula: null,
      cargo: t.colaborador.cargo || null,
      departamento: t.colaborador.departamento || null,
      gestor: null,
      email: t.colaborador.emailCorporativo,
    },
    equipamentos,
  };
  return { tipo: "PRONTO" as const, dados, recursos: { cpf, logo, fotos } };
}

/* Ações da aba TER */

const exigirGrupo = (ator: Ator, permissao: "termo.ver" | "termo.baixar") => {
  const r = exigirPermissao(ator, permissao);
  if (r.escopo !== "GRUPO") throw new ErroAutorizacao(permissao, "ESCOPO_PROPRIO");
  return r;
};

function exigirId(id: string) {
  if (!UUID.test(id)) throw new ErroNegocio("TER não encontrado.");
}

const auditarTer = (ator: Ator, origem: string, acao: string, t: { id: string; numero: string }, detalhe: Record<string, unknown>) => ({
  acao,
  resultado: "SUCESSO" as const,
  ator: { contaId: ator.contaId, nome: ator.nome },
  alvo: { tipo: "termo", id: t.id, descricao: t.numero },
  origemPermissao: origem,
  detalhe,
});

/** Nova tentativa de geração (erro, pendência resolvida ou geração interrompida). */
export async function gerarNovamente(ator: Ator, termoId: string) {
  return executarCasoDeUso(ator, async () => {
    exigirPermissao(ator, "termo.emitir");
    exigirId(termoId);
    const t = await prisma.termo.findUnique({ where: { id: termoId }, select: { estadoDocumento: true, eventoEntregaId: true } });
    if (!t?.eventoEntregaId) throw new ErroNegocio("TER não encontrado.");
    if (t.estadoDocumento !== "ERRO_GERACAO" && t.estadoDocumento !== "GERANDO") throw new ErroNegocio("Este TER não está aguardando geração.");
    return emitirTer(termoId, responsavel(ator));
  });
}

export type EntradaEnvio = { termoId: string; reenvio: boolean; canal: string; destinatario: string; mensagem: string; enviadoEm?: string | null; observacao?: string | null };

/**
 * Registra o encaminhamento feito fora do portal (não há serviço de e-mail): sempre o PDF já
 * emitido da versão vigente, com o mesmo hash. O reenvio não gera outro documento.
 */
export async function registrarEnvio(ator: Ator, e: EntradaEnvio) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.enviar");
    exigirId(e.termoId);
    const canal = CANAIS_ENVIO.find((c) => c === e.canal);
    if (!canal) throw new ErroNegocio("Escolha o canal do encaminhamento.");
    const destinatario = texto(e.destinatario, 254, "Destinatário");
    if (!destinatario) throw new ErroNegocio("Informe o destinatário.");
    if ((canal === "EMAIL" || canal === "TEAMS") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) throw new ErroNegocio("Destinatário: informe um e-mail válido.");
    const mensagem = texto(e.mensagem, 4000, "Mensagem");
    if (!mensagem) throw new ErroNegocio("Informe a mensagem de encaminhamento.");
    const observacao = texto(e.observacao, 500, "Observação") || null;
    const enviadoEm = lerMomento(e.enviadoEm, "Data do encaminhamento");
    return prisma.$transaction(async (tx) => {
      const t = await travarTermo(tx, e.termoId);
      if (t.estadoDocumento !== "EMITIDO" || !t.versaoVigente) throw new ErroNegocio("Só um TER emitido (e não cancelado nem substituído) é encaminhado para assinatura.");
      const estado = t.estadoAssinatura as EstadoAssinaturaTer;
      if (e.reenvio ? !PERMITE_REENVIO.includes(estado) : estado !== "AGUARDANDO_ENVIO") {
        throw new ErroNegocio(
          estado === "ASSINADO_CONFERIDO"
            ? "Este TER já está assinado e conferido."
            : e.reenvio
              ? `Reenvio indisponível: ${ROTULO_ESTADO_ASSINATURA[estado].toLowerCase()}.`
              : "O envio deste TER já foi registrado. Use o reenvio.",
        );
      }
      const v = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId: t.id, versao: t.versaoVigente } } });
      if (v.estado !== "EMITIDO" || !v.sha256) throw new ErroNegocio("A versão vigente não está emitida.");
      // O formulário informa data e hora até o minuto: o envio no mesmo minuto da emissão vale.
      if (enviadoEm.getTime() < Math.floor(v.emitidaEm!.getTime() / 60_000) * 60_000) throw new ErroNegocio("Data do encaminhamento: não pode ser anterior à emissão do TER.");
      await tx.envioTer.create({
        data: {
          termoId: t.id,
          versao: v.versao,
          reenvio: e.reenvio,
          canal,
          destinatario,
          mensagem,
          sha256: v.sha256,
          observacao,
          enviadoEm,
          registradoPorContaId: ator.contaId,
          registradoPorNome: ator.nome,
        },
      });
      await tx.termo.update({ where: { id: t.id }, data: { estadoAssinatura: "AGUARDANDO_ASSINATURA", estado: "AGUARDANDO_ASSINATURA" } });
      await historico(tx, t.id, v.versao, e.reenvio ? "REENVIO" : "ENVIO", responsavel(ator), `${ROTULO_CANAL[canal]} para ${destinatario}.${observacao ? ` ${observacao}` : ""}`);
      await registrarAuditoria(tx, auditarTer(ator, origem, "termo.enviar", t, { versao: v.versao, reenvio: e.reenvio, canal, sha256: v.sha256 }));
      return { numero: t.numero };
    });
  });
}

/** PDF assinado recebido, guardado como chegou. Não torna o TER assinado: falta a conferência. */
export async function anexarAssinado(ator: Ator, e: { termoId: string; versao: number; pdf: Buffer; nomeOriginal: string }) {
  return executarCasoDeUso(ator, async () => {
    const { origem, escopo } = exigirPermissao(ator, "termo.anexar_assinado");
    // Pela aba TER, só a TI (escopo de grupo); o colaborador envia os próprios pelo portal.
    if (escopo !== "GRUPO") throw new ErroAutorizacao("termo.anexar_assinado", "ESCOPO_PROPRIO");
    return receberArquivoAssinado(ator, origem, e, "TI");
  });
}

/**
 * Núcleo do recebimento (TI ou Portal do Colaborador): o PDF é guardado exatamente como chegou,
 * em registro novo (os anteriores ficam), e o TER passa a aguardar a conferência. Pelo portal,
 * só o titular, na versão vigente e enquanto a assinatura estiver pendente ou após recusa.
 */
export async function receberArquivoAssinado(
  ator: Ator,
  origemPermissao: string,
  e: { termoId: string; versao: number; pdf: Buffer; nomeOriginal: string },
  canal: OrigemArquivoTer,
) {
  exigirId(e.termoId);
  validarPdf(e.pdf);
  const nomeOriginal = (texto(e.nomeOriginal, 200, "Nome do arquivo") || "termo-assinado.pdf").replace(/[\\/]/g, "_");
  const chave = novaChavePdf("termos-assinados");
  const resumo = sha256(e.pdf);
  await obterArmazenamento().salvar(chave, e.pdf);
  const portal = canal === "PORTAL_COLABORADOR";
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await travarTermo(tx, e.termoId);
      // A titularidade vem da sessão (nunca de um id enviado pelo navegador).
      if (portal && t.colaboradorId !== ator.colaboradorId) throw new ErroAutorizacao("termo.anexar_assinado", "TITULARIDADE");
      if (t.estadoDocumento !== "EMITIDO" || !t.versaoVigente) {
        throw new ErroNegocio(portal ? "Este TER não está disponível para assinatura (cancelado ou em atualização pela TI)." : "O PDF assinado é anexado a um TER emitido (não cancelado nem substituído).");
      }
      if (e.versao !== t.versaoVigente) {
        throw new ErroNegocio(portal ? "O TER foi atualizado para uma nova versão. Atualize a página, baixe a versão vigente e assine-a." : `O arquivo deve corresponder à versão vigente (versão ${t.versaoVigente}).`);
      }
      const estado = t.estadoAssinatura as EstadoAssinaturaTer;
      if (!(portal ? PERMITE_ENVIO_COLABORADOR : PERMITE_ANEXO).includes(estado)) {
        throw new ErroNegocio(
          estado === "ASSINADO_CONFERIDO"
            ? "Este TER já está assinado e conferido."
            : portal && estado === "ARQUIVO_RECEBIDO"
              ? "Já recebemos um PDF assinado deste TER. Aguarde a conferência da TI."
              : portal && estado === "VALIDACAO_INDETERMINADA"
                ? "A assinatura deste TER está em análise pela TI."
                : "Este TER não aceita PDF assinado agora.",
        );
      }
      const v = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId: t.id, versao: t.versaoVigente } } });
      if (v.sha256 === resumo) throw new ErroNegocio(portal ? "Este é o PDF emitido, ainda sem assinatura. Assine o documento pelo GOV.BR e envie o arquivo assinado." : "Este é o PDF emitido pelo portal, sem assinatura. Anexe o arquivo assinado recebido.");
      const anteriores = await tx.arquivoAssinadoTer.count({ where: { termoId: t.id, versao: t.versaoVigente } });
      await tx.arquivoAssinadoTer.create({
        data: { termoId: t.id, versao: t.versaoVigente, chave, nomeOriginal, tamanho: e.pdf.length, sha256: resumo, enviadoPorContaId: ator.contaId, enviadoPorNome: ator.nome, origem: canal },
      });
      await tx.termo.update({ where: { id: t.id }, data: { estadoAssinatura: "ARQUIVO_RECEBIDO", estado: "AGUARDANDO_ASSINATURA" } });
      await historico(
        tx,
        t.id,
        t.versaoVigente,
        "ARQUIVO_RECEBIDO",
        responsavel(ator),
        `${portal ? "Enviado pelo colaborador no Portal do Colaborador" : "Recebido pela TI"}${anteriores ? ` (${anteriores + 1}º envio)` : ""}: ${nomeOriginal} (${Math.ceil(e.pdf.length / 1024)} KB, SHA-256 ${resumo}). Aguardando conferência.`,
      );
      await registrarAuditoria(tx, auditarTer(ator, origemPermissao, "termo.anexar_assinado", t, { versao: t.versaoVigente, sha256: resumo, tamanho: e.pdf.length, origem: canal }));
      return { numero: t.numero };
    });
  } catch (erro) {
    await obterArmazenamento().remover(chave).catch(() => undefined);
    throw erro;
  }
}

export type EntradaConferencia = {
  termoId: string;
  arquivoId: string;
  resultado: string;
  ferramenta?: string | null;
  signatario?: string | null;
  confereColaborador: boolean;
  confereDocumento: boolean;
  assinaturaTiVerificada?: boolean | null;
  relatorio?: Buffer | null;
  observacoes?: string | null;
  motivo?: string | null;
};

/**
 * Conferência manual (validador oficial VALIDAR do ITI, quando aplicável): o portal não valida
 * a assinatura sozinho. "Conforme" exige o signatário, a correspondência com o colaborador e
 * com o documento emitido (e a assinatura da TI, quando o modelo exige).
 */
export async function conferirAssinatura(ator: Ator, e: EntradaConferencia) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.conferir_assinatura");
    exigirId(e.termoId);
    if (!UUID.test(e.arquivoId)) throw new ErroNegocio("Selecione o PDF assinado a conferir.");
    const resultado = RESULTADOS_CONFERENCIA.find((r) => r === e.resultado);
    if (!resultado) throw new ErroNegocio("Informe o resultado da conferência.");
    const ferramenta = texto(e.ferramenta, 200, "Ferramenta") || FERRAMENTA_PADRAO;
    const signatario = texto(e.signatario, 200, "Signatário") || null;
    const observacoes = texto(e.observacoes, 1000, "Observações") || null;
    const motivo = texto(e.motivo, 1000, "Motivo") || null;
    if (resultado === "CONFORME") {
      if (!signatario) throw new ErroNegocio("Informe a identidade do signatário mostrada pelo validador.");
      if (!e.confereColaborador) throw new ErroNegocio("Confirme que o signatário corresponde ao colaborador.");
      if (!e.confereDocumento) throw new ErroNegocio("Confirme que o arquivo assinado corresponde ao documento emitido.");
    } else if (!motivo) {
      throw new ErroNegocio(resultado === "NAO_CONFORME" ? "Informe o motivo da recusa." : "Informe por que a validação ficou indeterminada.");
    }
    let relatorioChave: string | null = null;
    if (e.relatorio && e.relatorio.length) {
      validarPdf(e.relatorio);
      relatorioChave = novaChavePdf("termos-relatorios");
      await obterArmazenamento().salvar(relatorioChave, e.relatorio);
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const t = await travarTermo(tx, e.termoId);
        if (t.estadoDocumento !== "EMITIDO" || t.estadoAssinatura !== "ARQUIVO_RECEBIDO") throw new ErroNegocio("Não há PDF assinado aguardando conferência neste TER.");
        const ultimo = await tx.arquivoAssinadoTer.findFirst({ where: { termoId: t.id, versao: t.versaoVigente! }, orderBy: { recebidoEm: "desc" }, include: { conferencias: { select: { id: true } } } });
        if (!ultimo || ultimo.id !== e.arquivoId || ultimo.conferencias.length) throw new ErroNegocio("Confira o último PDF assinado recebido (atualize a página).");
        const versao = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId: t.id, versao: t.versaoVigente! } } });
        const modelo = await tx.modeloDocumento.findUnique({ where: { tipo_codigo_revisao: { tipo: "TER", codigo: versao.modeloCodigo, revisao: versao.modeloRevisao } } });
        const exigeTi = modelo?.exigeAssinaturaTi ?? false;
        if (resultado === "CONFORME" && exigeTi && !e.assinaturaTiVerificada) throw new ErroNegocio("O modelo exige também a assinatura do responsável da TI: confirme-a.");
        await tx.conferenciaTer.create({
          data: {
            termoId: t.id,
            arquivoId: ultimo.id,
            resultado,
            ferramenta,
            signatario,
            confereColaborador: e.confereColaborador,
            confereDocumento: e.confereDocumento,
            assinaturaTiVerificada: exigeTi ? Boolean(e.assinaturaTiVerificada) : null,
            relatorioChave,
            observacoes,
            motivo,
            conferidaPorContaId: ator.contaId,
            conferidaPorNome: ator.nome,
          },
        });
        const estadoAssinatura: EstadoAssinaturaTer = resultado === "CONFORME" ? "ASSINADO_CONFERIDO" : resultado === "NAO_CONFORME" ? "ASSINATURA_RECUSADA" : "VALIDACAO_INDETERMINADA";
        const agora = new Date();
        await tx.termo.update({
          where: { id: t.id },
          data:
            resultado === "CONFORME"
              ? { estadoAssinatura, estado: "ASSINADO", arquivoAssinadoChave: ultimo.chave, sha256Assinado: ultimo.sha256, assinadoRegistradoEm: agora, assinadoRegistradoPorNome: ator.nome }
              : { estadoAssinatura, estado: "AGUARDANDO_ASSINATURA" },
        });
        const acao = resultado === "CONFORME" ? "CONFERENCIA" : resultado === "NAO_CONFORME" ? "RECUSA" : "INDETERMINADA";
        await historico(
          tx,
          t.id,
          t.versaoVigente,
          acao,
          responsavel(ator),
          [`${ferramenta}.`, signatario ? `Signatário: ${signatario}.` : null, motivo ? `Motivo: ${motivo}` : null, observacoes].filter(Boolean).join(" "),
        );
        await registrarAuditoria(tx, auditarTer(ator, origem, "termo.conferir_assinatura", t, { versao: t.versaoVigente, resultado, arquivo: ultimo.sha256, relatorio: Boolean(relatorioChave) }));
        return { numero: t.numero, estadoAssinatura };
      });
    } catch (erro) {
      if (relatorioChave) await obterArmazenamento().remover(relatorioChave).catch(() => undefined);
      throw erro;
    }
  });
}

/** TER assinado e conferido só sai por procedimento administrativo (perfil administrativo, referência e motivo). */
function exigirProcedimentoAdministrativo(ator: Ator, procedimento: string, acao: "termo.cancelar") {
  if (!temPerfilAdministrativo(ator.perfisAtivos) || ator.perfisAtivos.includes("ESTAGIARIO_TI")) throw new ErroAutorizacao(acao, "TER_ASSINADO");
  if (!procedimento) throw new ErroNegocio("TER assinado e conferido: informe a referência do procedimento administrativo que autoriza a operação.");
}

/** Cancela o TER (não o exclui nem desfaz a alocação). O PDF, os envios e os arquivos assinados ficam. */
export async function cancelarTer(ator: Ator, e: { termoId: string; motivo: string; procedimento?: string | null; confirmacao: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.cancelar");
    exigirId(e.termoId);
    const motivo = texto(e.motivo, 1000, "Motivo");
    if (motivo.length < 10) throw new ErroNegocio("Informe o motivo do cancelamento (ao menos 10 caracteres).");
    if (!e.confirmacao) throw new ErroNegocio("Confirme o cancelamento do TER.");
    const procedimento = texto(e.procedimento, 200, "Procedimento administrativo");
    return prisma.$transaction(async (tx) => {
      const t = await travarTermo(tx, e.termoId);
      if (t.estadoDocumento === "CANCELADO") throw new ErroNegocio("Este TER já está cancelado.");
      const assinado = t.estadoAssinatura === "ASSINADO_CONFERIDO";
      if (assinado) exigirProcedimentoAdministrativo(ator, procedimento, "termo.cancelar");
      const agora = new Date();
      const vigente = await tx.versaoTer.findFirst({ where: { termoId: t.id, estado: { in: ["EMITIDO", "GERANDO", "ERRO_GERACAO"] } }, orderBy: { versao: "desc" } });
      if (vigente) await tx.versaoTer.update({ where: { id: vigente.id }, data: { estado: "CANCELADO" } });
      await tx.termo.update({
        where: { id: t.id },
        data: { estadoDocumento: "CANCELADO", estado: "CANCELADO", canceladoEm: agora, canceladoPorNome: ator.nome, motivoCancelamento: motivo, procedimentoCancelamento: assinado ? procedimento : null },
      });
      await historico(tx, t.id, vigente?.versao ?? t.versaoVigente, "CANCELAMENTO", responsavel(ator), `${motivo}${assinado ? ` Procedimento: ${procedimento}.` : ""}`);
      await registrarAuditoria(tx, auditarTer(ator, origem, "termo.cancelar", t, { versao: vigente?.versao ?? null, assinado, alocacao: t.alocacao?.numero ?? null }));
      return { numero: t.numero };
    });
  });
}

/**
 * Correção do documento: a versão vigente fica substituída (o PDF dela continua guardado) e
 * uma nova versão é gerada com os dados corrigidos na origem. Os instantâneos técnicos da
 * entrega não mudam. A assinatura da versão anterior não vale para a nova.
 */
export async function substituirTer(ator: Ator, e: { termoId: string; motivo: string; procedimento?: string | null }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.cancelar");
    exigirPermissao(ator, "termo.emitir");
    exigirId(e.termoId);
    const motivo = texto(e.motivo, 1000, "Motivo");
    if (motivo.length < 10) throw new ErroNegocio("Descreva o erro corrigido (ao menos 10 caracteres).");
    const procedimento = texto(e.procedimento, 200, "Procedimento administrativo");
    const nova = await prisma.$transaction(async (tx) => {
      const t = await travarTermo(tx, e.termoId);
      if (t.estadoDocumento !== "EMITIDO" || !t.versaoVigente) throw new ErroNegocio("Só a versão emitida e vigente de um TER pode ser substituída.");
      const assinado = t.estadoAssinatura === "ASSINADO_CONFERIDO";
      if (assinado) exigirProcedimentoAdministrativo(ator, procedimento, "termo.cancelar");
      const anterior = t.versaoVigente;
      const v = await tx.versaoTer.findUniqueOrThrow({ where: { termoId_versao: { termoId: t.id, versao: anterior } } });
      const modelo = await tx.modeloDocumento.findFirst({ where: { tipo: "TER", ativo: true }, orderBy: { criadoEm: "desc" } });
      await tx.versaoTer.update({ where: { id: v.id }, data: { estado: "SUBSTITUIDO" } });
      await tx.versaoTer.create({
        data: { termoId: t.id, versao: anterior + 1, estado: "GERANDO", motivo, modeloCodigo: modelo?.codigo ?? v.modeloCodigo, modeloRevisao: modelo?.revisao ?? v.modeloRevisao, criadaPorNome: ator.nome },
      });
      await tx.termo.update({
        where: { id: t.id },
        data: { estadoDocumento: "GERANDO", estadoAssinatura: null, estado: "RASCUNHO", arquivoAssinadoChave: null, sha256Assinado: null, assinadoRegistradoEm: null, assinadoRegistradoPorNome: null },
      });
      await historico(tx, t.id, anterior, "SUBSTITUICAO", responsavel(ator), `${motivo}${assinado ? ` Procedimento: ${procedimento}.` : ""}`);
      await historico(tx, t.id, anterior + 1, "VERSAO_CRIADA", responsavel(ator), `Versão ${anterior + 1} criada em substituição à versão ${anterior}.`);
      await registrarAuditoria(tx, auditarTer(ator, origem, "termo.substituir", t, { versaoAnterior: anterior, novaVersao: anterior + 1, assinado }));
      return { numero: t.numero, versao: anterior + 1 };
    });
    const r = await emitirTer(e.termoId, responsavel(ator));
    return { ...nova, estado: r.estado, erro: r.erro ?? null };
  });
}

/* Consulta */

export type FiltroTers = {
  busca?: string;
  empresaId?: string;
  situacao?: SituacaoTer;
  de?: string;
  ate?: string;
  ordenar?: "numero" | "colaborador" | "emissao";
  direcao?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
};

const ONDE_SITUACAO: Record<SituacaoTer, Prisma.TermoWhereInput> = {
  GERANDO: { estadoDocumento: "GERANDO" },
  PENDENTE_CADASTRO: { estadoDocumento: "ERRO_GERACAO", versoes: { some: { estado: "ERRO_GERACAO", NOT: { pendencias: { isEmpty: true } } } } },
  ERRO_GERACAO: { estadoDocumento: "ERRO_GERACAO", versoes: { some: { estado: "ERRO_GERACAO", pendencias: { isEmpty: true } } } },
  AGUARDANDO_ENVIO: { estadoDocumento: "EMITIDO", estadoAssinatura: "AGUARDANDO_ENVIO" },
  AGUARDANDO_ASSINATURA: { estadoDocumento: "EMITIDO", estadoAssinatura: "AGUARDANDO_ASSINATURA" },
  AGUARDANDO_CONFERENCIA: { estadoDocumento: "EMITIDO", estadoAssinatura: "ARQUIVO_RECEBIDO" },
  ASSINADO_CONFERIDO: { estadoDocumento: "EMITIDO", estadoAssinatura: "ASSINADO_CONFERIDO" },
  ASSINATURA_RECUSADA: { estadoDocumento: "EMITIDO", estadoAssinatura: "ASSINATURA_RECUSADA" },
  VALIDACAO_INDETERMINADA: { estadoDocumento: "EMITIDO", estadoAssinatura: "VALIDACAO_INDETERMINADA" },
  CANCELADO: { OR: [{ estadoDocumento: "CANCELADO" }, { estadoDocumento: null, estado: "CANCELADO" }] },
  REGISTRO_ANTERIOR: { estadoDocumento: null, estado: { not: "CANCELADO" } },
};

const ORDEM_TERS: Record<NonNullable<FiltroTers["ordenar"]>, (d: "asc" | "desc") => Prisma.TermoOrderByWithRelationInput[]> = {
  numero: (d) => [{ criadoEm: d }, { numero: d }],
  colaborador: (d) => [{ colaborador: { nome: d } }, { criadoEm: "desc" }],
  emissao: (d) => [{ emitidoEm: { sort: d, nulls: "last" } }, { criadoEm: d }],
};

function ondeTers(f: FiltroTers): Prisma.TermoWhereInput {
  const busca = f.busca?.trim().slice(0, 80);
  const contem = { contains: busca, mode: "insensitive" as const };
  const inicio = f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de) ? new Date(`${f.de}T00:00:00-03:00`) : null;
  const fim = f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate) ? new Date(`${f.ate}T23:59:59.999-03:00`) : null;
  return {
    AND: [
      { tipo: "TER" },
      f.empresaId && UUID.test(f.empresaId) ? { OR: [{ empresaId: f.empresaId }, { empresaId: null, alocacao: { empresaColaboradorId: f.empresaId } }] } : {},
      f.situacao && ONDE_SITUACAO[f.situacao] ? ONDE_SITUACAO[f.situacao] : {},
      inicio || fim ? { emitidoEm: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } } : {},
      busca
        ? {
            OR: [
              { numero: contem },
              { alocacao: { numero: contem } },
              { colaborador: { nome: contem } },
              { empresa: { nome: contem } },
              { eventoEntrega: { verificacoes: { some: { ativo: { OR: [{ patrimonio: contem }, { nomeDispositivo: contem }, { numeroSerie: contem }] } } } } },
              { eventoEntregaId: null, alocacao: { itens: { some: { ativo: { OR: [{ patrimonio: contem }, { nomeDispositivo: contem }, { numeroSerie: contem }] } } } } },
            ],
          }
        : {},
    ],
  };
}

const SELECAO_LINHA = {
  colaborador: { select: { id: true, nome: true } },
  empresa: { select: { id: true, nome: true, sigla: true } },
  alocacao: {
    select: {
      id: true,
      numero: true,
      empresaColaborador: { select: { id: true, nome: true, sigla: true } },
      itens: { select: { ativo: { select: { nomeDispositivo: true, patrimonio: true, modelo: true } } } },
    },
  },
  eventoEntrega: { select: { itens: true, entregueEm: true } },
  arquivosAssinados: { orderBy: { recebidoEm: "desc" as const }, take: 1, select: { origem: true, versao: true } },
  versoes: { orderBy: { versao: "desc" as const }, take: 1, select: { versao: true, estado: true, pendencias: true, erro: true, documentoTeste: true } },
} satisfies Prisma.TermoInclude;

type LinhaBanco = Prisma.TermoGetPayload<{ include: typeof SELECAO_LINHA }>;

/** PDF disponível para baixar (o emitido vigente ou, em registro anterior, o assinado) ou o motivo de não haver. */
function pdfDaLinha(t: LinhaBanco) {
  if (t.eventoEntregaId) {
    if (t.versaoVigente) return { href: `/api/termos/${t.id}/pdf?arquivo=emitido`, motivo: null };
    return { href: null, motivo: t.estadoDocumento === "GERANDO" ? "PDF em geração" : t.estadoDocumento === "ERRO_GERACAO" ? "PDF não gerado: pendência ou erro na geração" : "PDF não emitido" };
  }
  return t.arquivoAssinadoChave ? { href: `/api/termos/${t.id}/pdf`, motivo: null } : { href: null, motivo: "Registro anterior sem PDF no portal" };
}

function paraLinha(t: LinhaBanco) {
  const v = t.versoes[0];
  const pdf = pdfDaLinha(t);
  const itens = t.eventoEntrega ? ordenarItens(t.eventoEntrega.itens as unknown as ItemEvento[]).map((i) => i.identificador) : (t.alocacao?.itens.map((i) => rotuloAtivo(i.ativo)) ?? []);
  return {
    id: t.id,
    numero: t.numero,
    versao: t.versaoVigente ?? v?.versao ?? null,
    alocacao: t.alocacao ? { id: t.alocacao.id, numero: t.alocacao.numero } : null,
    colaborador: t.colaborador,
    empresa: t.empresa ?? t.alocacao?.empresaColaborador ?? null,
    equipamentos: itens,
    emitidoEm: t.emitidoEm?.toISOString() ?? null,
    entregueEm: t.eventoEntrega?.entregueEm.toISOString() ?? null,
    criadoEm: t.criadoEm.toISOString(),
    estadoDocumento: t.estadoDocumento as EstadoDocumentoTer | null,
    estadoAssinatura: t.estadoAssinatura as EstadoAssinaturaTer | null,
    estadoLegado: t.estado,
    situacao: situacaoTer({ estadoDocumento: t.estadoDocumento, estadoAssinatura: t.estadoAssinatura, pendencias: v?.estado === "ERRO_GERACAO" ? v.pendencias : [] }),
    erro: v?.estado === "ERRO_GERACAO" ? v.erro : null,
    pendencias: v?.estado === "ERRO_GERACAO" ? v.pendencias : [],
    temPdf: Boolean(pdf.href),
    /** Rota autorizada do PDF (download com &baixar=1) ou, sem arquivo, o motivo. */
    hrefPdf: pdf.href,
    semPdf: pdf.motivo,
    /** Versão emitida fora de produção: documento de teste, sem validade oficial. */
    teste: v?.documentoTeste ?? false,
    /** O PDF aguardando conferência foi enviado pelo próprio colaborador, no portal. */
    arquivoPeloPortal: t.estadoAssinatura === "ARQUIVO_RECEBIDO" && t.arquivosAssinados[0]?.origem === "PORTAL_COLABORADOR",
  };
}

/** Ações que a interface oferece (o servidor confere de novo em cada operação). */
function acoesPermitidas(ator: Ator) {
  return {
    emitir: pode(ator, "termo.emitir"),
    enviar: pode(ator, "termo.enviar"),
    anexar: pode(ator, "termo.anexar_assinado"),
    conferir: pode(ator, "termo.conferir_assinatura"),
    cancelar: pode(ator, "termo.cancelar"),
    substituir: pode(ator, "termo.cancelar") && pode(ator, "termo.emitir"),
    baixar: pode(ator, "termo.baixar"),
    modelo: pode(ator, "termo.modelo_gerenciar"),
    administrativo: temPerfilAdministrativo(ator.perfisAtivos) && !ator.perfisAtivos.includes("ESTAGIARIO_TI"),
  };
}

export async function listarTers(ator: Ator, f: FiltroTers = {}) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "termo.ver");
    const where = ondeTers(f);
    const porPagina = f.porPagina ?? 12;
    const contar = (s: SituacaoTer) => prisma.termo.count({ where: { AND: [{ tipo: "TER" }, ONDE_SITUACAO[s]] } });
    const [total, totalGeral, aguardandoEnvio, aguardandoAssinatura, aguardandoConferencia, assinados, cancelados, comErro, pendentesCadastro] = await Promise.all([
      prisma.termo.count({ where }),
      prisma.termo.count({ where: { tipo: "TER" } }),
      contar("AGUARDANDO_ENVIO"),
      contar("AGUARDANDO_ASSINATURA"),
      contar("AGUARDANDO_CONFERENCIA"),
      contar("ASSINADO_CONFERIDO"),
      contar("CANCELADO"),
      contar("ERRO_GERACAO"),
      contar("PENDENTE_CADASTRO"),
    ]);
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
    const linhas = await prisma.termo.findMany({
      where,
      orderBy: f.ordenar ? ORDEM_TERS[f.ordenar](f.direcao === "asc" ? "asc" : "desc") : [{ criadoEm: "desc" }, { numero: "desc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: SELECAO_LINHA,
    });
    const empresas = await prisma.empresa.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } });
    return {
      linhas: linhas.map(paraLinha),
      total,
      totalGeral,
      pagina,
      paginas,
      indicadores: { total: totalGeral, aguardandoAssinatura: aguardandoEnvio + aguardandoAssinatura, aguardandoConferencia, assinados, cancelados, pendencias: comErro + pendentesCadastro },
      /** Fora de produção, todo PDF emitido é documento de teste. */
      ambienteTeste: obterConfiguracao().AMBIENTE !== "PRODUCAO",
      empresas,
      acoes: acoesPermitidas(ator),
    };
  });
}

export type ResultadoTers = Awaited<ReturnType<typeof listarTers>>;
export type LinhaTer = ResultadoTers["linhas"][number];
export type AcoesTer = ResultadoTers["acoes"];

/** Detalhe para o modal: dados gerais, equipamentos e inspeções (instantâneos), documento e histórico. */
export async function obterTer(ator: Ator, id: string) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "termo.ver");
    exigirId(id);
    const t = await prisma.termo.findUnique({
      where: { id },
      include: {
        ...SELECAO_LINHA,
        colaborador: { select: { id: true, nome: true, emailCorporativo: true, cargo: true, departamento: true, cpfFinal: true } },
        eventoEntrega: { include: { verificacoes: true } },
        versoes: { orderBy: { versao: "desc" } },
        envios: { orderBy: { registradoEm: "desc" } },
        arquivosAssinados: { orderBy: { recebidoEm: "desc" }, include: { conferencias: { select: { id: true } } } },
        conferencias: { orderBy: { conferidaEm: "desc" } },
        historico: { orderBy: [{ em: "asc" }, { id: "asc" }] },
      },
    });
    if (!t || t.tipo !== "TER") throw new ErroNegocio("TER não encontrado.");
    const linha = paraLinha({ ...t, versoes: t.versoes.slice(0, 1) });
    const evento = t.eventoEntrega;
    const instantaneos = new Map((evento?.verificacoes ?? []).map((v) => [v.itemAlocacaoId, v]));
    const itens = evento ? ordenarItens(evento.itens as unknown as ItemEvento[]) : [];
    const versaoModelo = t.versoes.find((v) => v.versao === t.versaoVigente) ?? t.versoes[0];
    const modelo = versaoModelo?.modeloCodigo
      ? await prisma.modeloDocumento.findUnique({
          where: { tipo_codigo_revisao: { tipo: "TER", codigo: versaoModelo.modeloCodigo, revisao: versaoModelo.modeloRevisao } },
          select: { codigo: true, revisao: true, exigeAssinaturaTi: true },
        })
      : null;
    const ultimoArquivo = t.arquivosAssinados.find((a) => a.versao === t.versaoVigente) ?? null;
    return {
      ...linha,
      colaborador: {
        id: t.colaborador.id,
        nome: t.colaborador.nome,
        emailCorporativo: t.colaborador.emailCorporativo,
        cargo: t.colaborador.cargo,
        departamento: t.colaborador.departamento,
        /** Mascarado (***.***.***-12): o número só entra no PDF. */
        cpf: mascararCpf(t.colaborador.cpfFinal),
      },
      evento: evento
        ? {
            id: evento.id,
            tipo: ROTULO_EVENTO[evento.tipo],
            entregueEm: evento.entregueEm.toISOString(),
            responsavelTi: evento.responsavelTiNome,
            registradoPor: evento.registradoPorNome,
          }
        : null,
      modelo,
      motivoCancelamento: t.motivoCancelamento,
      procedimentoCancelamento: t.procedimentoCancelamento,
      canceladoEm: t.canceladoEm?.toISOString() ?? null,
      canceladoPorNome: t.canceladoPorNome,
      equipamentos: itens.map((i) => {
        const v = instantaneos.get(i.itemAlocacaoId);
        const snap = v?.instantaneo as unknown as InstantaneoEntrega | undefined;
        return {
          ativoId: i.ativoId,
          identificador: i.identificador,
          patrimonio: i.patrimonio,
          categoria: i.categoria,
          marca: i.marca,
          modelo: i.modelo,
          numeroSerie: i.numeroSerie,
          proprietaria: i.proprietaria,
          aluguel: i.aluguel,
          acompanha: i.notebookId ? (itens.find((x) => x.ativoId === i.notebookId)?.identificador ?? null) : null,
          acessorios: [
            ...itens.filter((c) => c.tipo === "CARREGADOR" && c.notebookId === i.ativoId).map((c) => c.identificador),
            ...(i.kitId ? itens.filter((c) => c.kitId === i.kitId && c.ativoId !== i.ativoId).map((c) => c.identificador) : []),
          ],
          /** Instantâneo da entrega (somente leitura): o mesmo usado no PDF. */
          verificacao:
            v && snap
              ? {
                  modo: v.modo,
                  verificadaEm: v.verificadaEm.toISOString(),
                  responsavel: v.responsavelNome,
                  instantaneo: snap,
                  resultado: snap.inspecao.resultado as Resultado,
                  semResposta: (snap as { semResposta?: PerguntaSemResposta[] }).semResposta ?? [],
                }
              : null,
        };
      }),
      versoes: t.versoes.map((v) => ({
        versao: v.versao,
        estado: v.estado,
        motivo: v.motivo,
        modelo: v.modeloCodigo ? `${v.modeloCodigo} rev. ${v.modeloRevisao}` : null,
        sha256: v.sha256,
        tamanho: v.tamanho,
        paginas: v.paginas,
        nomeArquivo: v.nomeArquivo,
        emitidaEm: v.emitidaEm?.toISOString() ?? null,
        emitidaPorNome: v.emitidaPorNome,
        criadaEm: v.criadaEm.toISOString(),
        erro: v.erro,
        pendencias: v.pendencias,
        temArquivo: Boolean(v.arquivoChave),
        documentoTeste: v.documentoTeste,
      })),
      envios: t.envios.map((e) => ({
        id: e.id,
        versao: e.versao,
        reenvio: e.reenvio,
        canal: e.canal,
        destinatario: e.destinatario,
        mensagem: e.mensagem,
        sha256: e.sha256,
        observacao: e.observacao,
        enviadoEm: e.enviadoEm.toISOString(),
        registradoEm: e.registradoEm.toISOString(),
        registradoPorNome: e.registradoPorNome,
      })),
      arquivosAssinados: t.arquivosAssinados.map((a) => ({
        id: a.id,
        versao: a.versao,
        nomeOriginal: a.nomeOriginal,
        tamanho: a.tamanho,
        sha256: a.sha256,
        recebidoEm: a.recebidoEm.toISOString(),
        enviadoPorNome: a.enviadoPorNome,
        origem: a.origem,
        conferido: a.conferencias.length > 0,
      })),
      arquivoParaConferir:
        t.estadoAssinatura === "ARQUIVO_RECEBIDO" && ultimoArquivo && !ultimoArquivo.conferencias.length
          ? { id: ultimoArquivo.id, nomeOriginal: ultimoArquivo.nomeOriginal, sha256: ultimoArquivo.sha256, origem: ultimoArquivo.origem, enviadoPorNome: ultimoArquivo.enviadoPorNome, recebidoEm: ultimoArquivo.recebidoEm.toISOString() }
          : null,
      conferencias: t.conferencias.map((c) => ({
        id: c.id,
        arquivoId: c.arquivoId,
        resultado: c.resultado,
        ferramenta: c.ferramenta,
        signatario: c.signatario,
        confereColaborador: c.confereColaborador,
        confereDocumento: c.confereDocumento,
        assinaturaTiVerificada: c.assinaturaTiVerificada,
        temRelatorio: Boolean(c.relatorioChave),
        observacoes: c.observacoes,
        motivo: c.motivo,
        conferidaEm: c.conferidaEm.toISOString(),
        conferidaPorNome: c.conferidaPorNome,
      })),
      historico: t.historico.map((h) => ({ id: h.id, versao: h.versao, acao: h.acao, detalhe: h.detalhe, responsavel: h.responsavelNome, em: h.em.toISOString() })),
      ultimoEnvio: t.envios[0] ? { canal: t.envios[0].canal, destinatario: t.envios[0].destinatario, enviadoEm: t.envios[0].enviadoEm.toISOString() } : null,
      acoes: acoesPermitidas(ator),
    };
  });
}

export type DetalheTer = Awaited<ReturnType<typeof obterTer>>;

/** TERs ligados a uma alocação, colaborador ou equipamento (outras telas). */
export async function tersRelacionados(ator: Ator, alvo: { alocacaoId?: string; colaboradorId?: string; ativoId?: string }) {
  if (!pode(ator, "termo.ver")) return [];
  const onde: Prisma.TermoWhereInput = alvo.alocacaoId
    ? { alocacaoId: alvo.alocacaoId }
    : alvo.colaboradorId
      ? { colaboradorId: alvo.colaboradorId }
      : { eventoEntrega: { verificacoes: { some: { ativoId: alvo.ativoId } } } };
  const termos = await prisma.termo.findMany({ where: { AND: [{ tipo: "TER" }, onde] }, orderBy: { criadoEm: "desc" }, take: 50, include: SELECAO_LINHA });
  return termos.map(paraLinha);
}

/* Arquivos (rota autorizada) */

export type AlvoArquivo = { tipo: "emitido"; versao?: number | null } | { tipo: "assinado"; arquivoId: string } | { tipo: "relatorio"; conferenciaId: string };

/** PDF emitido (versão), assinado recebido ou relatório da validação. Download auditado. */
export async function lerArquivoTer(ator: Ator, termoId: string, alvo: AlvoArquivo) {
  return executarCasoDeUso(ator, async () => {
    const { origem, escopo } = exigirPermissao(ator, "termo.baixar");
    exigirId(termoId);
    const t = await prisma.termo.findUnique({ where: { id: termoId }, select: { id: true, numero: true, versaoVigente: true, colaboradorId: true, eventoEntregaId: true } });
    if (!t) return null;
    const titular = t.colaboradorId === ator.colaboradorId;
    // Fora da TI, só o titular, e só os PDFs emitidos e o assinado já conferido (nunca o relatório).
    if (escopo !== "GRUPO") {
      if (!titular || !t.eventoEntregaId || alvo.tipo === "relatorio") throw new ErroAutorizacao("termo.baixar", "TITULARIDADE");
      if (alvo.tipo === "assinado") {
        const conferido = UUID.test(alvo.arquivoId) ? await prisma.conferenciaTer.count({ where: { termoId, arquivoId: alvo.arquivoId, resultado: "CONFORME" } }) : 0;
        if (!conferido) throw new ErroAutorizacao("termo.baixar", "TITULARIDADE");
      }
    }
    let chave: string | null = null;
    let nome = `${t.numero}.pdf`;
    let descricao = "";
    if (alvo.tipo === "emitido") {
      const versao = alvo.versao ?? t.versaoVigente;
      const v = versao ? await prisma.versaoTer.findUnique({ where: { termoId_versao: { termoId, versao } } }) : null;
      chave = v?.arquivoChave ?? null;
      nome = v?.nomeArquivo ?? nome;
      descricao = `emitido v${versao}`;
    } else if (alvo.tipo === "assinado") {
      const a = UUID.test(alvo.arquivoId) ? await prisma.arquivoAssinadoTer.findFirst({ where: { id: alvo.arquivoId, termoId } }) : null;
      chave = a?.chave ?? null;
      nome = a ? `${t.numero} v${a.versao} - assinado.pdf` : nome;
      descricao = "assinado";
    } else {
      const c = UUID.test(alvo.conferenciaId) ? await prisma.conferenciaTer.findFirst({ where: { id: alvo.conferenciaId, termoId } }) : null;
      chave = c?.relatorioChave ?? null;
      nome = `${t.numero} - relatório de validação.pdf`;
      descricao = "relatório de validação";
    }
    if (!chave) return null;
    const dados = await obterArmazenamento().ler(chave);
    if (!dados) return null;
    await registrarAuditoria(prisma, auditarTer(ator, origem, "termo.baixar", t, { arquivo: descricao }));
    // O colaborador baixou o próprio TER: aparece na linha do tempo dele (no máximo um registro a cada 10 minutos).
    if (titular && alvo.tipo === "emitido" && t.eventoEntregaId) {
      const recente = await prisma.historicoTer.count({ where: { termoId, acao: "PDF_BAIXADO", responsavelContaId: ator.contaId, em: { gte: new Date(Date.now() - 10 * 60_000) } } });
      if (!recente) await prisma.historicoTer.create({ data: { termoId, versao: alvo.versao ?? t.versaoVigente, acao: "PDF_BAIXADO", responsavelContaId: ator.contaId, responsavelNome: ator.nome, em: instante() } });
    }
    return { dados, nome };
  });
}

/* Modelo documental */

export async function obterModeloTer(ator: Ator) {
  return executarCasoDeUso(ator, async () => {
    exigirGrupo(ator, "termo.ver");
    const m = await prisma.modeloDocumento.findFirst({ where: { tipo: "TER", ativo: true }, orderBy: { criadoEm: "desc" } });
    return m ? { id: m.id, codigo: m.codigo, revisao: m.revisao, titulo: m.titulo, declaracoes: m.declaracoes as string[], exigeAssinaturaTi: m.exigeAssinaturaTi, podeGerir: pode(ator, "termo.modelo_gerenciar") } : null;
  });
}

/**
 * Exigência da assinatura do responsável da TI na conferência (configuração do modelo
 * aprovado). O texto jurídico não é editável pelo portal: revisão nova entra por migração.
 */
export async function definirAssinaturaTi(ator: Ator, e: { modeloId: string; exige: boolean }) {
  return executarCasoDeUso(ator, async () => {
    const { origem } = exigirPermissao(ator, "termo.modelo_gerenciar");
    if (!UUID.test(e.modeloId)) throw new ErroNegocio("Modelo não encontrado.");
    return prisma.$transaction(async (tx) => {
      const m = await tx.modeloDocumento.findUnique({ where: { id: e.modeloId } });
      if (!m) throw new ErroNegocio("Modelo não encontrado.");
      await tx.modeloDocumento.update({ where: { id: m.id }, data: { exigeAssinaturaTi: e.exige } });
      await registrarAuditoria(tx, {
        acao: "termo.modelo_gerenciar",
        resultado: "SUCESSO",
        ator: { contaId: ator.contaId, nome: ator.nome },
        alvo: { tipo: "modelo_documento", id: m.id, descricao: `${m.codigo} rev. ${m.revisao}` },
        origemPermissao: origem,
        detalhe: { exigeAssinaturaTi: e.exige },
      });
      return { codigo: m.codigo, exige: e.exige };
    });
  });
}
