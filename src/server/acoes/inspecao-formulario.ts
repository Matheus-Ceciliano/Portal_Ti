import { z } from "zod";
import type { EntradaInspecao, EntradaVerificacao } from "@/server/modulos/inspecoes";
import type { FotoEnviada } from "@/server/modulos/inventario-base";

/**
 * Leitura das inspeções enviadas pelos formulários: respostas em JSON e fotos de evidência
 * nos campos "insp:<alvo>:<pergunta>" (alvo = equipamento, "principal", "carregador" ou peça
 * do kit). As regras (perguntas, justificativas, limites) são conferidas no caso de uso.
 */

const esquemaResposta = z.object({
  resposta: z.string().max(20).optional(),
  justificativa: z.string().max(600).optional(),
  observacao: z.string().max(600).optional(),
});

export const esquemaInspecao = z.object({
  respostas: z.record(z.string().max(60), esquemaResposta),
  observacoes: z.string().max(1000).optional(),
});

export const esquemaVerificacoes = z
  .array(
    z.discriminatedUnion("modo", [
      z.object({ ativoId: z.uuid(), modo: z.literal("CONFIRMAR"), inspecaoId: z.uuid() }),
      z.object({ ativoId: z.uuid(), modo: z.literal("NOVA"), inspecao: esquemaInspecao }),
    ]),
  )
  .max(30);

export const campoFotoInspecao = (alvo: string, chave: string) => `insp:${alvo}:${chave}`;

/** Fotos por pergunta de um alvo (o nome do arquivo é descartado). */
export async function fotosDaInspecao(formData: FormData | null | undefined, alvo: string): Promise<Record<string, FotoEnviada[]>> {
  const fotos: Record<string, FotoEnviada[]> = {};
  if (!formData) return fotos;
  const prefixo = `insp:${alvo}:`;
  for (const [campo, valor] of formData.entries()) {
    if (!campo.startsWith(prefixo) || !(valor instanceof File) || valor.size === 0) continue;
    (fotos[campo.slice(prefixo.length)] ??= []).push({ tipo: "OUTRA", dados: Buffer.from(await valor.arrayBuffer()) });
  }
  return fotos;
}

/** Inspeção de um alvo: respostas validadas no formato e fotos do formulário. */
export async function lerInspecao(dados: unknown, formData: FormData | null | undefined, alvo: string): Promise<EntradaInspecao | undefined> {
  const r = esquemaInspecao.safeParse(dados);
  if (!r.success) return undefined;
  return { ...r.data, fotos: await fotosDaInspecao(formData, alvo) };
}

/** Verificações da entrega física, com as fotos das inspeções novas. */
export async function lerVerificacoes(dados: unknown, formData: FormData | null | undefined): Promise<EntradaVerificacao[] | null> {
  const r = esquemaVerificacoes.safeParse(dados ?? []);
  if (!r.success) return null;
  return Promise.all(r.data.map(async (v) => (v.modo === "NOVA" ? { ...v, inspecao: { ...v.inspecao, fotos: await fotosDaInspecao(formData, v.ativoId) } } : v)));
}
