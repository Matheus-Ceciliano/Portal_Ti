import { createHash } from "node:crypto";
import type { MotivoEncerramentoItem, Prisma, TipoMovimentacao } from "@/generated/prisma/client";
import { ROTULO_PARTE, type ParteKit } from "@/lib/identificacao";
import {
  FOTO_TAMANHO_MAXIMO,
  FOTOS_POR_ENVIO,
  numeroAlocacao,
  numeroDocumento,
  ROTULO_SITUACAO,
  TIPOS_FOTO,
  transicaoValida,
  type Situacao,
  type TipoFoto,
} from "@/lib/inventario";
import { detectarImagem, novaChave, obterArmazenamento } from "@/server/armazenamento";
import type { Ator } from "@/server/authz/ator";
import { ErroNegocio } from "@/server/authz/exigir";
import type { ClienteBanco, Transacao } from "@/server/db";

/**
 * Peças comuns de inventário, alocações e manutenções: travamento de linhas, numeração de
 * documentos, livro de movimentações (com validação de transição) e fotos privadas.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operador = (ator: Ator) => ({ realizadoPorContaId: ator.contaId, realizadoPorNome: ator.nome });

/**
 * Trava as linhas dos equipamentos até o fim da transação, sempre na mesma ordem (evita
 * impasse). Quem chega depois espera e então lê a situação já atualizada.
 */
export async function travarAtivos(tx: Transacao, ids: string[]) {
  const unicos = [...new Set(ids)].sort();
  if (!unicos.length) return;
  await tx.$queryRaw`SELECT id FROM "ativo" WHERE id = ANY(${unicos}::text[]) ORDER BY id FOR UPDATE`;
}

/** Próximo número de documento (ALO-2026-0001...), atômico mesmo com cadastros simultâneos. */
export async function proximoNumero(tx: ClienteBanco, prefixo: string, quando = new Date()) {
  const ano = quando.getFullYear();
  const chave = `${prefixo}-${ano}`;
  const [{ valor }] = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "contador_documento" (chave, valor) VALUES (${chave}, 1)
    ON CONFLICT (chave) DO UPDATE SET valor = "contador_documento".valor + 1
    RETURNING valor`;
  return numeroDocumento(prefixo, ano, Number(valor));
}

/**
 * Número da alocação (AL0001, AL0002...): uma sequência única no PostgreSQL, sem reinício
 * anual. O contador parte do maior número já usado — inclusive no formato antigo
 * (ALO-AAAA-NNNN) —, então nenhum número se repete nem é reaproveitado. O índice único da
 * coluna é a última barreira contra cadastros simultâneos.
 */
export async function proximoNumeroAlocacao(tx: ClienteBanco) {
  const [{ n }] = await tx.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(MAX(COALESCE(substring("numero" from '^AL([0-9]+)$'), substring("numero" from '^ALO-[0-9]{4}-([0-9]+)$'))::bigint), 0)::int AS n
    FROM "alocacao"`;
  const [{ valor }] = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "contador_documento" (chave, valor) VALUES ('AL', ${n + 1})
    ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("contador_documento".valor + 1, ${n + 1})
    RETURNING valor`;
  return numeroAlocacao(Number(valor));
}

/** Mesma marca escrita de outro jeito ("dell", "DELL") usa a grafia já cadastrada. */
export async function marcaCanonica(db: ClienteBanco, marca: string) {
  const existente = await db.ativo.findFirst({ where: { marca: { equals: marca, mode: "insensitive" } }, select: { marca: true } });
  return existente?.marca ?? marca;
}

type Movimentacao = {
  tipo: TipoMovimentacao;
  colaborador?: { id: string; nome: string } | null;
  alocacaoId?: string;
  manutencaoId?: string;
  devolucaoId?: string;
  observacao?: string | null;
  quando?: Date;
};

export async function registrarMovimentacao(
  tx: ClienteBanco,
  ator: Ator,
  ativoId: string,
  m: Movimentacao & { situacaoAnterior?: Situacao; situacaoNova?: Situacao },
) {
  await tx.movimentacaoAtivo.create({
    data: {
      ativoId,
      tipo: m.tipo,
      situacaoAnterior: m.situacaoAnterior,
      situacaoNova: m.situacaoNova,
      colaboradorId: m.colaborador?.id,
      colaboradorNome: m.colaborador?.nome,
      alocacaoId: m.alocacaoId,
      manutencaoId: m.manutencaoId,
      devolucaoId: m.devolucaoId,
      observacao: m.observacao || null,
      ...operador(ator),
      ...(m.quando ? { realizadoEm: m.quando } : {}),
    },
  });
}

/**
 * Única forma de mudar a situação: valida a transição e grava a movimentação na mesma
 * transação. Transição fora da matriz é recusada.
 */
export async function mudarSituacao(
  tx: ClienteBanco,
  ator: Ator,
  ativo: { id: string; situacao: Situacao; rotulo: string },
  para: Situacao,
  m: Movimentacao,
) {
  if (!transicaoValida(ativo.situacao, para)) {
    throw new ErroNegocio(`${ativo.rotulo}: não é possível passar de "${ROTULO_SITUACAO[ativo.situacao]}" para "${ROTULO_SITUACAO[para]}".`);
  }
  await tx.ativo.update({ where: { id: ativo.id }, data: { situacao: para, situacaoDesde: m.quando ?? new Date() } });
  await registrarMovimentacao(tx, ator, ativo.id, { ...m, situacaoAnterior: ativo.situacao, situacaoNova: para });
}

/** Encerra um item de alocação em aberto (o índice único libera o equipamento). */
export async function encerrarItem(tx: ClienteBanco, ator: Ator, itemId: string, motivo: MotivoEncerramentoItem, quando = new Date(), extra: Prisma.ItemAlocacaoUpdateInput = {}) {
  await tx.itemAlocacao.update({
    where: { id: itemId },
    data: { aberto: null, encerradoEm: quando, motivoEncerramento: motivo, encerradoPorNome: ator.nome, ...extra },
  });
}

/** Alocação sem itens em aberto deixa de estar ativa (o histórico permanece). */
export async function encerrarAlocacaoSemItens(tx: ClienteBanco, alocacaoId: string) {
  const abertos = await tx.itemAlocacao.count({ where: { alocacaoId, aberto: true } });
  if (abertos === 0) await tx.alocacao.updateMany({ where: { id: alocacaoId, estado: "ATIVA" }, data: { estado: "ENCERRADA" } });
}

/**
 * Transferência de colaborador reservada deixa de valer quando a custódia de origem acaba
 * (devolução, manutenção): é cancelada na mesma transação, com o motivo no histórico.
 */
export async function cancelarTransferenciaPendente(tx: ClienteBanco, ator: Ator, ativoId: string, motivo: string, quando = new Date()) {
  const p = await tx.transferencia.findFirst({ where: { ativoId, pendente: true } });
  if (!p) return null;
  await tx.transferencia.update({
    where: { id: p.id },
    data: { estado: "CANCELADA", pendente: null, canceladaEm: quando, canceladaPorNome: ator.nome, motivoCancelamento: motivo },
  });
  await registrarMovimentacao(tx, ator, ativoId, {
    tipo: "CANCELAMENTO_RESERVA",
    colaborador: { id: p.colaboradorDestinoId!, nome: p.colaboradorDestinoNome! },
    observacao: `Transferência para ${p.colaboradorDestinoNome} cancelada: ${motivo}`,
    quando,
  });
  return p;
}

/** Seleção para o rótulo do tipo: nome da categoria no catálogo e a peça do kit. */
export const SELECAO_TIPO = { categoriaEquipamento: { select: { nome: true } }, parteKit: true } as const;

/** Rótulo do tipo exibido em todos os módulos: "Monitor", "Kit teclado e mouse · Teclado"... */
export const rotuloTipo = (a: { categoriaEquipamento: { nome: string }; parteKit: ParteKit | null }) =>
  a.parteKit ? `${a.categoriaEquipamento.nome} · ${ROTULO_PARTE[a.parteKit]}` : a.categoriaEquipamento.nome;

/** Identificação curta do equipamento para mensagens: nome do dispositivo ou patrimônio. */
export const rotuloAtivo = (a: { nomeDispositivo: string | null; patrimonio: string | null; modelo?: string }) =>
  a.nomeDispositivo ?? a.patrimonio ?? a.modelo ?? "Equipamento";

/* Fotos (armazenamento privado; o banco guarda só a chave) */

export type FotoEnviada = { tipo: string; dados: Buffer };
export type FotoPreparada = { tipo: TipoFoto; chave: string; mime: string; tamanho: number; dados: Buffer };

/** Valida pelo conteúdo (não pelo nome nem pelo tipo declarado), tamanho e quantidade. */
export function prepararFotos(fotos: FotoEnviada[]): FotoPreparada[] {
  const validas = fotos.filter((f) => f.dados.length > 0);
  if (validas.length > FOTOS_POR_ENVIO) throw new ErroNegocio(`Envie no máximo ${FOTOS_POR_ENVIO} fotos por vez.`);
  return validas.map((f) => {
    if (!TIPOS_FOTO.includes(f.tipo as TipoFoto)) throw new ErroNegocio("Tipo de foto inválido.");
    if (f.dados.length > FOTO_TAMANHO_MAXIMO) throw new ErroNegocio("Cada foto pode ter no máximo 5 MB.");
    const imagem = detectarImagem(f.dados);
    if (!imagem) throw new ErroNegocio("Envie as fotos em JPG, PNG ou WebP.");
    return { tipo: f.tipo as TipoFoto, chave: novaChave("equipamentos", imagem.extensao), mime: imagem.tipo, tamanho: f.dados.length, dados: f.dados };
  });
}

/** Grava os arquivos antes da transação; se ela falhar, `descartarFotos` remove o que foi gravado. */
export async function gravarArquivosFotos(fotos: FotoPreparada[]) {
  if (!fotos.length) return;
  const armazenamento = obterArmazenamento();
  const gravadas: string[] = [];
  try {
    for (const f of fotos) {
      await armazenamento.salvar(f.chave, f.dados);
      gravadas.push(f.chave);
    }
  } catch (erro) {
    await descartarFotos(gravadas);
    throw erro;
  }
}

export async function descartarFotos(chaves: string[]) {
  if (!chaves.length) return;
  const armazenamento = obterArmazenamento();
  await Promise.all(chaves.map((c) => armazenamento.remover(c).catch(() => undefined)));
}

export const dadosFoto = (f: FotoPreparada, ativoId: string, ator: Ator) => ({
  ativoId,
  tipo: f.tipo,
  chave: f.chave,
  mime: f.mime,
  tamanho: f.tamanho,
  enviadaPorNome: ator.nome,
});

export const urlFoto = (id: string) => `/api/inventario/fotos/${id}`;

export const sha256 = (dados: Buffer) => createHash("sha256").update(dados).digest("hex");

/**
 * Unicidade violada (inclusive por corrida entre a verificação e a gravação): mensagem
 * clara, sem detalhes do banco.
 */
export function traduzirConflito(erro: unknown): unknown {
  if (!erro || typeof erro !== "object" || (erro as { code?: string }).code !== "P2002") return erro;
  const e = erro as { meta?: unknown; message?: string };
  // Os metadados apontam o índice violado; a mensagem pode trazer trechos de código com outros
  // nomes de campo, então só entra quando os metadados não bastam.
  const meta = JSON.stringify(e.meta ?? {});
  const texto = /patrimonio|nome_dispositivo|nomeDispositivo|numero_serie|numeroSerie|sequencia_carregador|sequenciaCarregador|aberta|aberto|pendente|componente_id|vigente/.test(meta)
    ? meta
    : meta + String(e.message ?? "");
  if (/patrimonio/.test(texto)) return new ErroNegocio("Este patrimônio já está cadastrado.");
  if (/nome_dispositivo|nomeDispositivo/.test(texto)) return new ErroNegocio("Este nome de dispositivo já está cadastrado.");
  if (/numero_serie|numeroSerie/.test(texto)) return new ErroNegocio("Este número de série já está cadastrado.");
  if (/sequencia_carregador|sequenciaCarregador/.test(texto)) return new ErroNegocio("Outro carregador acabou de ser registrado para este notebook. Tente de novo.");
  if (/aberta/.test(texto)) return new ErroNegocio("Este equipamento já tem uma manutenção aberta.");
  if (/pendente/.test(texto)) return new ErroNegocio("Já existe uma transferência reservada para este equipamento. Revise e tente de novo.");
  if (/componente_id|vigente/.test(texto)) return new ErroNegocio("Este componente acabou de ser instalado em outro equipamento. Revise e tente de novo.");
  if (/aberto/.test(texto)) return new ErroNegocio("Um dos equipamentos acabou de entrar em outra alocação ou reserva. Revise e tente de novo.");
  return new ErroNegocio("O registro acabou de ser alterado por outra pessoa. Revise e tente de novo.");
}

/** Datas "AAAA-MM-DD" vindas de formulário (sem hora, sem fuso). */
export function lerData(valor: string | null | undefined, rotulo: string): Date | null {
  if (!valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ErroNegocio(`${rotulo}: data inválida.`);
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new ErroNegocio(`${rotulo}: data inválida.`);
  return data;
}

/** Data e hora de um evento informadas no formulário: não podem estar no futuro. */
export function lerMomento(valor: string | null | undefined, rotulo: string, agora = new Date()): Date {
  if (!valor) return agora;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new ErroNegocio(`${rotulo}: data inválida.`);
  if (data.getTime() > agora.getTime() + 5 * 60_000) throw new ErroNegocio(`${rotulo}: não pode estar no futuro.`);
  return data;
}
