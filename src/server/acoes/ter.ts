"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  anexarAssinado,
  cancelarTer,
  conferirAssinatura,
  definirAssinaturaTi,
  gerarNovamente,
  obterModeloTer,
  obterTer,
  registrarEnvio,
  substituirTer,
  type DetalheTer,
} from "@/server/modulos/ter";

type Falha = { ok: false; erro: string };
export type ResultadoTer = { ok: true; mensagem: string } | Falha;

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const DADOS = "Revise os dados informados.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

function atualizarTelas() {
  revalidatePath("/ti/documentos/ter");
  revalidatePath("/ti/alocacoes");
}

async function executar(fn: (ator: NonNullable<Awaited<ReturnType<typeof atorAtual>>>) => Promise<string>): Promise<ResultadoTer> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const mensagem = await fn(ator);
    atualizarTelas();
    return { ok: true, mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoDetalheTer(id: string): Promise<{ ok: true; dados: DetalheTer } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterTer(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoGerarNovamente(termoId: string): Promise<ResultadoTer> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await gerarNovamente(ator, termoId);
    atualizarTelas();
    if (r.estado === "PENDENTE_CADASTRO") return { ok: false, erro: `${r.numero} continua pendente: falta ${r.erro ?? "um dado obrigatório"} no cadastro de Pessoas.` };
    if (r.estado === "ERRO_GERACAO") return { ok: false, erro: r.erro ?? "Não foi possível gerar o PDF." };
    return { ok: true, mensagem: r.estado === "EMITIDO" ? `${r.numero} emitido.` : `${r.numero} já estava emitido.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaEnvio = z.object({
  termoId: z.uuid(),
  reenvio: z.boolean(),
  canal: z.string().max(20),
  destinatario: z.string().max(254),
  mensagem: z.string().max(4000),
  enviadoEm: z.string().max(40).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export async function acaoRegistrarEnvio(entrada: z.input<typeof esquemaEnvio>): Promise<ResultadoTer> {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  return executar(async (ator) => {
    const r = await registrarEnvio(ator, dados.data);
    return dados.data.reenvio ? `${r.numero}: reenvio registrado.` : `${r.numero}: envio para assinatura registrado.`;
  });
}

/** FormData: termoId, versao e o arquivo "pdf" (o PDF assinado recebido, guardado como chegou). */
export async function acaoAnexarAssinado(formData: FormData): Promise<ResultadoTer> {
  const arquivo = formData.get("pdf");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Selecione o PDF assinado." };
  return executar(async (ator) => {
    const r = await anexarAssinado(ator, {
      termoId: String(formData.get("termoId") ?? ""),
      versao: Number(formData.get("versao")),
      pdf: Buffer.from(await arquivo.arrayBuffer()),
      nomeOriginal: arquivo.name,
    });
    return `${r.numero}: PDF assinado recebido. Falta conferir a assinatura.`;
  });
}

/** FormData: dados da conferência e, opcionalmente, o relatório do validador ("relatorio", PDF). */
export async function acaoConferirAssinatura(formData: FormData): Promise<ResultadoTer> {
  const relatorio = formData.get("relatorio");
  const texto = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  return executar(async (ator) => {
    const r = await conferirAssinatura(ator, {
      termoId: texto("termoId") ?? "",
      arquivoId: texto("arquivoId") ?? "",
      resultado: texto("resultado") ?? "",
      ferramenta: texto("ferramenta"),
      signatario: texto("signatario"),
      confereColaborador: texto("confereColaborador") === "sim",
      confereDocumento: texto("confereDocumento") === "sim",
      assinaturaTiVerificada: texto("assinaturaTiVerificada") === "sim",
      observacoes: texto("observacoes"),
      motivo: texto("motivo"),
      relatorio: relatorio instanceof File && relatorio.size > 0 ? Buffer.from(await relatorio.arrayBuffer()) : null,
    });
    return {
      ASSINADO_CONFERIDO: `${r.numero}: assinatura conferida. TER assinado e conferido.`,
      ASSINATURA_RECUSADA: `${r.numero}: assinatura recusada. Reenvie o termo ao colaborador.`,
      VALIDACAO_INDETERMINADA: `${r.numero}: validação indeterminada registrada.`,
    }[r.estadoAssinatura as "ASSINADO_CONFERIDO" | "ASSINATURA_RECUSADA" | "VALIDACAO_INDETERMINADA"];
  });
}

const esquemaCancelamento = z.object({
  termoId: z.uuid(),
  motivo: z.string().max(1000),
  procedimento: z.string().max(200).nullable().optional(),
  confirmacao: z.boolean(),
});

export async function acaoCancelarTer(entrada: z.input<typeof esquemaCancelamento>): Promise<ResultadoTer> {
  const dados = esquemaCancelamento.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  return executar(async (ator) => `${(await cancelarTer(ator, dados.data)).numero} cancelado. A alocação não foi alterada.`);
}

const esquemaSubstituicao = z.object({ termoId: z.uuid(), motivo: z.string().max(1000), procedimento: z.string().max(200).nullable().optional() });

export async function acaoSubstituirTer(entrada: z.input<typeof esquemaSubstituicao>): Promise<ResultadoTer> {
  const dados = esquemaSubstituicao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  return executar(async (ator) => {
    const r = await substituirTer(ator, dados.data);
    return r.estado === "EMITIDO"
      ? `${r.numero}: versão ${r.versao} emitida. Encaminhe-a para assinatura.`
      : `${r.numero}: versão ${r.versao} criada, mas o PDF não foi gerado (${r.erro ?? "erro na geração"}). Tente gerar novamente.`;
  });
}

export async function acaoModeloTer() {
  const ator = await atorAtual();
  if (!ator) return { ok: false as const, erro: SESSAO };
  try {
    return { ok: true as const, dados: await obterModeloTer(ator) };
  } catch (erro) {
    return { ok: false as const, erro: mensagemDeErro(erro) };
  }
}

export async function acaoDefinirAssinaturaTi(modeloId: string, exige: boolean): Promise<ResultadoTer> {
  return executar(async (ator) => {
    const r = await definirAssinaturaTi(ator, { modeloId, exige });
    return r.exige ? `${r.codigo}: a conferência passa a exigir também a assinatura da TI.` : `${r.codigo}: a conferência exige só a assinatura do colaborador.`;
  });
}
