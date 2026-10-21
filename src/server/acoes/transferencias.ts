"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { resumoTerDaEntrega } from "@/lib/ter";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  cancelarTransferencia,
  colaboradoresParaTransferencia,
  confirmarTransferencia,
  transferirColaborador,
  transferirEmpresa,
  type ColaboradorTransferencia,
} from "@/server/modulos/transferencias";
import { lerVerificacoes } from "./inspecao-formulario";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const DADOS = "Revise os dados da transferência.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

/** Indicadores, filtros e listas que dependem da empresa e da custódia. */
function atualizarTelas(ativoId: string) {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/alocacoes");
  revalidatePath(`/ti/inventario/${ativoId}`);
  revalidatePath("/ti/documentos/ter");
}

export async function acaoColaboradoresTransferencia(): Promise<{ ok: true; dados: ColaboradorTransferencia[] } | { ok: false; erro: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await colaboradoresParaTransferencia(ator) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaColaborador = z.object({
  ativoId: z.uuid(),
  colaboradorId: z.string().max(40),
  modo: z.enum(["ENTREGAR", "RESERVAR"]),
  data: z.string().max(40).nullable().optional(),
  observacoes: z.string().max(1000).nullable().optional(),
  confirmacaoFisica: z.boolean().optional(),
  alocacaoAtualId: z.string().max(40).nullable(),
  chaveRequisicao: z.uuid().optional(),
  /** Entrega física: verificação técnica de cada item (as fotos das inspeções novas vêm em `anexos`). */
  verificacoes: z.unknown().optional(),
});

export async function acaoTransferirColaborador(entrada: z.input<typeof esquemaColaborador>, anexos?: FormData): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaColaborador.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  try {
    const verificacoes = await lerVerificacoes(dados.data.verificacoes, anexos);
    if (!verificacoes) return { ok: false, erro: "Revise a verificação técnica dos equipamentos." };
    const r = await transferirColaborador(ator, { ...dados.data, verificacoes });
    atualizarTelas(dados.data.ativoId);
    const mensagem = {
      CONCLUIDA: `Transferido para ${r.colaborador}${r.numero ? ` (${r.numero})` : ""}.${resumoTerDaEntrega(r.ter)}`,
      RESERVADA: `Transferência para ${r.colaborador} reservada. A custódia atual continua até a entrega física.`,
      ALOCADO: `Entregue a ${r.colaborador}${r.numero ? ` (${r.numero})` : ""}.`,
      RESERVADO: `Reservado para ${r.colaborador}${r.numero ? ` (${r.numero})` : ""}.`,
    }[r.resultado];
    return { ok: true, mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaConfirmacao = z.object({
  ativoId: z.uuid(),
  transferenciaId: z.uuid(),
  data: z.string().max(40).nullable().optional(),
  confirmacaoFisica: z.boolean(),
  verificacoes: z.unknown().optional(),
});

export async function acaoConfirmarTransferencia(entrada: z.input<typeof esquemaConfirmacao>, anexos?: FormData): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaConfirmacao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  try {
    const verificacoes = await lerVerificacoes(dados.data.verificacoes, anexos);
    if (!verificacoes) return { ok: false, erro: "Revise a verificação técnica dos equipamentos." };
    const r = await confirmarTransferencia(ator, { ...dados.data, verificacoes });
    atualizarTelas(dados.data.ativoId);
    return { ok: true, mensagem: `Transferido para ${r.colaborador} (${r.numero}).${resumoTerDaEntrega(r.ter)}` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaCancelamento = z.object({ ativoId: z.uuid(), transferenciaId: z.uuid(), motivo: z.string().max(500) });

export async function acaoCancelarTransferencia(entrada: z.input<typeof esquemaCancelamento>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaCancelamento.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  try {
    await cancelarTransferencia(ator, dados.data);
    atualizarTelas(dados.data.ativoId);
    return { ok: true, mensagem: "Transferência cancelada." };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaEmpresa = z.object({
  ativoId: z.uuid(),
  empresaDestinoId: z.string().max(40),
  motivo: z.string().max(500),
  data: z.string().max(40).nullable().optional(),
  confirmacao: z.boolean(),
  empresaAtualId: z.uuid(),
  carregadoresComPatrimonio: z.array(z.uuid()).max(20).optional(),
  chaveRequisicao: z.uuid().optional(),
});

export async function acaoTransferirEmpresa(entrada: z.input<typeof esquemaEmpresa>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaEmpresa.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  try {
    const r = await transferirEmpresa(ator, dados.data);
    atualizarTelas(dados.data.ativoId);
    return { ok: true, mensagem: `Equipamento transferido para ${r.para}.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
