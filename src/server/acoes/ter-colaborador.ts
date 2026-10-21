"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import { enviarMeuTerAssinado, obterMeuTer, type DetalheMeuTer } from "@/server/modulos/ter-colaborador";

type Falha = { ok: false; erro: string };
const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

export async function acaoMeuTer(id: string): Promise<{ ok: true; dados: DetalheMeuTer } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterMeuTer(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** FormData: termoId, versao (a vigente que o colaborador viu) e o arquivo "pdf". */
export async function acaoEnviarMeuTerAssinado(formData: FormData): Promise<{ ok: true; mensagem: string } | Falha> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const arquivo = formData.get("pdf");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Selecione o PDF assinado." };
  try {
    await enviarMeuTerAssinado(ator, {
      termoId: String(formData.get("termoId") ?? ""),
      versao: Number(formData.get("versao")),
      pdf: Buffer.from(await arquivo.arrayBuffer()),
      nomeOriginal: arquivo.name,
    });
    revalidatePath("/portal");
    revalidatePath("/portal/termos");
    revalidatePath("/ti/documentos/ter");
    return { ok: true, mensagem: "Documento recebido. Sua assinatura será conferida pela equipe de TI." };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
