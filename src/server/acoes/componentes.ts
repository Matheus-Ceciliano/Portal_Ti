"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  componentesDisponiveis,
  instalarComponente,
  removerComponente,
  substituirComponente,
  type ComponenteDisponivel,
} from "@/server/modulos/componentes";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const DADOS = "Revise os dados da intervenção.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

function atualizarTelas(notebookId: string) {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/inventario/manutencoes");
  revalidatePath(`/ti/inventario/${notebookId}`);
}

export async function acaoComponentesDisponiveis(): Promise<{ ok: true; dados: ComponenteDisponivel[] } | { ok: false; erro: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await componentesDisponiveis(ator) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const texto = z.string().max(1000).nullable().optional();
const numero = z.union([z.number(), z.string().max(12)]).nullable().optional();
const dadosComponente = z.object({
  categoria: z.string().max(20),
  capacidadeGb: z.union([z.number(), z.string().max(12)]),
  tecnologia: texto,
  interfaceConexao: texto,
  formato: texto,
  frequenciaMhz: numero,
  marcaId: z.string().max(40).nullable().optional(),
  modeloId: z.string().max(40).nullable().optional(),
  numeroSerie: texto,
});

const esquemaIntervencao = z.object({
  modo: z.enum(["INSTALAR", "REMOVER", "SUBSTITUIR"]),
  notebookId: z.uuid(),
  pecaId: z.uuid().nullable().optional(),
  componenteId: z.uuid().nullable().optional(),
  novoComponente: dadosComponente.nullable().optional(),
  destino: z.string().max(40).nullable().optional(),
  registrarRemovida: dadosComponente.omit({ categoria: true, capacidadeGb: true }).extend({ capacidadeGb: numero }).nullable().optional(),
  motivo: z.string().max(500).nullable().optional(),
  data: z.string().max(40).nullable().optional(),
  confirmacaoIntervencao: z.boolean().optional(),
  chaveRequisicao: z.uuid().optional(),
});

export async function acaoIntervencaoComponente(entrada: z.input<typeof esquemaIntervencao>): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaIntervencao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: DADOS };
  const { modo, ...resto } = dados.data;
  try {
    const caso = modo === "INSTALAR" ? instalarComponente : modo === "REMOVER" ? removerComponente : substituirComponente;
    const r = await caso(ator, resto);
    atualizarTelas(resto.notebookId);
    const registro = r.registrado ? ` Peça removida registrada como ${r.registrado}.` : "";
    const mensagem =
      modo === "INSTALAR" ? `${r.instalado} vinculado ao notebook.` : modo === "REMOVER" ? `Componente removido.${registro}` : `Componente substituído por ${r.instalado}.${registro}`;
    return { ok: true, mensagem };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
