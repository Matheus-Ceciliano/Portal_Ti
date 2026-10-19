"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TIPOS_FOTO } from "@/lib/inventario";
import { obterSessao } from "@/server/auth/sessao";
import { mensagemDeErro } from "@/server/authz/exigir";
import {
  adicionarCarregador,
  cadastrarEquipamento,
  desvincularCarregador,
  editarEquipamento,
  liberarAposAvaliacao,
  obterEquipamento,
  type FichaEquipamento,
} from "@/server/modulos/inventario";
import type { FotoEnviada } from "@/server/modulos/inventario-base";
import { concluirManutencao, enviarParaManutencao } from "@/server/modulos/manutencoes";

export type EstadoInventario = {
  ok?: boolean;
  mensagem?: string;
  erro?: string;
  erros?: Record<string, string | undefined>;
  id?: string;
};

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const SESSAO = "Sua sessão expirou. Entre novamente para continuar.";

async function atorAtual() {
  return (await obterSessao())?.ator ?? null;
}

function atualizarTelas(ativoId?: string) {
  revalidatePath("/ti/inventario");
  revalidatePath("/ti/inventario/manutencoes");
  revalidatePath("/ti/alocacoes");
  if (ativoId) revalidatePath(`/ti/inventario/${ativoId}`);
}

/** Fotos enviadas no formulário: campos "foto_<TIPO>" (o nome do arquivo é descartado). */
async function fotosDoFormulario(formData: FormData, tipoFixo?: string): Promise<FotoEnviada[]> {
  const fotos: FotoEnviada[] = [];
  for (const tipo of tipoFixo ? [tipoFixo] : TIPOS_FOTO) {
    for (const arquivo of formData.getAll(`foto_${tipo}`)) {
      if (arquivo instanceof File && arquivo.size > 0) fotos.push({ tipo, dados: Buffer.from(await arquivo.arrayBuffer()) });
    }
  }
  return fotos;
}

const texto = (formData: FormData, chave: string) => {
  const v = formData.get(chave);
  return typeof v === "string" ? v : "";
};

function lerJson(valor: string): unknown {
  if (!valor) return undefined;
  try {
    return JSON.parse(valor);
  } catch {
    return undefined;
  }
}

/** Erro do servidor no campo certo do formulário. */
function campoDoErro(mensagem: string): string | null {
  const regras: [RegExp, string][] = [
    [/^Tecnologia da memória|^Memória RAM/i, "memoriaRam"],
    [/^Armazenamento|^Interface do (SSD|HD)/i, "armazenamento"],
    [/capacidade/i, "capacidadeGb"],
    [/^Tecnologia/i, "tecnologia"],
    [/^Interface/i, "interfaceConexao"],
    [/^Formato/i, "formato"],
    [/^Frequência/i, "frequenciaMhz"],
    [/tipo do componente/i, "categoria"],
    [/categoria/i, "categoria"],
    [/nome (do|de) dispositivo/i, "nomeDispositivo"],
    [/patrimônio/i, "patrimonio"],
    [/série/i, "numeroSerie"],
    [/empresa/i, "empresaId"],
    [/marca/i, "marca"],
    [/modelo/i, "modelo"],
    [/processador/i, "processador"],
    [/memória/i, "memoriaRam"],
    [/armazenamento/i, "armazenamento"],
    [/sistema operacional/i, "sistemaOperacional"],
    [/aquisição/i, "dataAquisicao"],
    [/garantia/i, "garantiaAte"],
    [/observaç/i, "observacoes"],
    [/foto|JPG|PNG/i, "fotos"],
  ];
  return regras.find(([r]) => r.test(mensagem))?.[1] ?? null;
}

/** Cadastro (sem id) ou edição (com id). Regras, unicidade e permissões são do servidor. */
export async function acaoSalvarEquipamento(_a: EstadoInventario, formData: FormData): Promise<EstadoInventario> {
  const ator = await atorAtual();
  if (!ator) return { erro: SESSAO };
  const id = texto(formData, "id");
  const dados = {
    categoria: texto(formData, "categoria"),
    nomeDispositivo: texto(formData, "nomeDispositivo"),
    patrimonio: texto(formData, "patrimonio"),
    empresaId: texto(formData, "empresaId"),
    marca: texto(formData, "marca"),
    modelo: texto(formData, "modelo"),
    numeroSerie: texto(formData, "numeroSerie"),
    processador: texto(formData, "processador"),
    memoriaRam: texto(formData, "memoriaRam"),
    armazenamento: texto(formData, "armazenamento"),
    sistemaOperacional: texto(formData, "sistemaOperacional"),
    dataAquisicao: texto(formData, "dataAquisicao"),
    garantiaAte: texto(formData, "garantiaAte"),
    observacoes: texto(formData, "observacoes"),
    // Componente (RAM, SSD, HD).
    capacidadeGb: texto(formData, "capacidadeGb"),
    tecnologia: texto(formData, "tecnologia"),
    interfaceConexao: texto(formData, "interfaceConexao"),
    formato: texto(formData, "formato"),
    frequenciaMhz: texto(formData, "frequenciaMhz"),
    // Notebook: configuração original estruturada (JSON); ausente = sem alteração.
    configuracao: lerJson(texto(formData, "configuracao")),
  };
  try {
    const fotos = await fotosDoFormulario(formData);
    if (id) {
      await editarEquipamento(ator, { id, dados, fotos });
      atualizarTelas(id);
      return { ok: true, id, mensagem: "Cadastro do equipamento atualizado." };
    }
    const r = await cadastrarEquipamento(ator, { dados, fotos, chaveRequisicao: texto(formData, "chaveRequisicao") });
    atualizarTelas(r.id);
    return {
      ok: true,
      id: r.id,
      mensagem:
        dados.categoria === "NOTEBOOK"
          ? "Equipamento cadastrado com o carregador principal."
          : ["MEMORIA_RAM", "SSD", "HD"].includes(dados.categoria)
            ? "Componente cadastrado no estoque."
            : "Equipamento cadastrado.",
    };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    const campo = campoDoErro(mensagem);
    return campo ? { erros: { [campo]: mensagem } } : { erro: mensagem };
  }
}

/** Dados completos para abrir a edição a partir da lista. */
export async function acaoEquipamento(id: string): Promise<{ ok: true; dados: FichaEquipamento } | { ok: false; erro: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    return { ok: true, dados: await obterEquipamento(ator, id) };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoAdicionarCarregador(notebookId: string, observacao?: string): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    const r = await adicionarCarregador(ator, { notebookId, observacao });
    atualizarTelas(notebookId);
    return { ok: true, mensagem: `Carregador ${r.nome} vinculado.` };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaDesvinculo = z.object({
  carregadorId: z.uuid(),
  motivo: z.enum(["TROCA", "PERDA", "DEFEITO"]),
  observacao: z.string().max(500),
  substituir: z.boolean(),
});

export async function acaoDesvincularCarregador(entrada: z.input<typeof esquemaDesvinculo>, notebookId: string): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  const dados = esquemaDesvinculo.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Revise os dados do carregador." };
  try {
    const r = await desvincularCarregador(ator, dados.data);
    atualizarTelas(notebookId);
    return { ok: true, mensagem: r.substituto ? `Registrado. Novo carregador: ${r.substituto.nome}.` : "Registrado." };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function acaoLiberarAvaliacao(ativoId: string, observacao: string): Promise<Resultado> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: SESSAO };
  try {
    await liberarAposAvaliacao(ator, { ativoId, observacao });
    atualizarTelas(ativoId);
    return { ok: true, mensagem: "Avaliação concluída: equipamento disponível." };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Envio para manutenção: com alocação ativa, só com o recolhimento físico confirmado. */
export async function acaoEnviarManutencao(_a: EstadoInventario, formData: FormData): Promise<EstadoInventario> {
  const ator = await atorAtual();
  if (!ator) return { erro: SESSAO };
  const ativoId = texto(formData, "ativoId");
  try {
    const r = await enviarParaManutencao(ator, {
      ativoId,
      motivo: texto(formData, "motivo"),
      observacoes: texto(formData, "observacoes"),
      confirmarRecolhimento: texto(formData, "confirmarRecolhimento") === "sim",
      recolhidoEm: texto(formData, "recolhidoEm") || null,
      fotos: await fotosDoFormulario(formData, "OUTRA"),
    });
    atualizarTelas(ativoId);
    return {
      ok: true,
      id: r.id,
      mensagem: r.alocacaoEncerrada ? `Manutenção registrada; alocação ${r.alocacaoEncerrada} encerrada para este equipamento.` : "Manutenção registrada.",
    };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (/motivo/i.test(mensagem)) return { erros: { motivo: mensagem } };
    if (/observaç/i.test(mensagem)) return { erros: { observacoes: mensagem } };
    if (/recolhimento/i.test(mensagem)) return { erros: { confirmarRecolhimento: mensagem } };
    if (/foto|JPG|PNG/i.test(mensagem)) return { erros: { fotos: mensagem } };
    return { erro: mensagem };
  }
}

export async function acaoConcluirManutencao(_a: EstadoInventario, formData: FormData): Promise<EstadoInventario> {
  const ator = await atorAtual();
  if (!ator) return { erro: SESSAO };
  try {
    const r = await concluirManutencao(ator, {
      manutencaoId: texto(formData, "manutencaoId"),
      resultado: texto(formData, "resultado"),
      servicoRealizado: texto(formData, "servicoRealizado"),
      fotos: await fotosDoFormulario(formData, "OUTRA"),
    });
    atualizarTelas(texto(formData, "ativoId") || undefined);
    return { ok: true, mensagem: r.resultado === "REPARADO" ? "Manutenção concluída: equipamento disponível." : "Manutenção concluída: equipamento baixado." };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (/resultado/i.test(mensagem)) return { erros: { resultado: mensagem } };
    if (/serviço/i.test(mensagem)) return { erros: { servicoRealizado: mensagem } };
    if (/foto|JPG|PNG/i.test(mensagem)) return { erros: { fotos: mensagem } };
    return { erro: mensagem };
  }
}
