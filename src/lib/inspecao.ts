import { ROTULO_PARTE, type ParteKit } from "@/lib/identificacao";
import type { Categoria } from "@/lib/inventario";

/**
 * Inspeção técnica: regras das respostas e do resultado (as mesmas no navegador e no
 * servidor). As perguntas e as orientações de cada categoria ficam no banco, configuradas pela
 * TI em Catálogos do Inventário > Checklists de Inspeção; cada edição cria uma nova versão da
 * pergunta e as inspeções antigas continuam com a versão que exibiram.
 */

export const TIPOS_INSPECAO = ["ENTRADA", "DEVOLUCAO", "PRE_ALOCACAO"] as const;
export type TipoInspecao = (typeof TIPOS_INSPECAO)[number];
export const ROTULO_TIPO_INSPECAO: Record<TipoInspecao, string> = {
  ENTRADA: "Entrada",
  DEVOLUCAO: "Devolução",
  PRE_ALOCACAO: "Pré-alocação",
};

export const CONDICOES_ENTRADA = ["NOVO", "USADO"] as const;
export type CondicaoEntrada = (typeof CONDICOES_ENTRADA)[number];
export const ROTULO_CONDICAO: Record<CondicaoEntrada, string> = { NOVO: "Novo", USADO: "Usado" };

export const RESPOSTAS = ["CONFORME", "NAO_CONFORME", "NAO_TESTADO", "NAO_SE_APLICA"] as const;
export type Resposta = (typeof RESPOSTAS)[number];
export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  CONFORME: "Conforme",
  NAO_CONFORME: "Não conforme",
  NAO_TESTADO: "Não testado",
  NAO_SE_APLICA: "Não se aplica",
};

export const RESULTADOS = ["APTO", "APTO_COM_RESSALVAS", "INAPTO"] as const;
export type Resultado = (typeof RESULTADOS)[number];
export const ROTULO_RESULTADO: Record<Resultado, string> = {
  APTO: "Apto",
  APTO_COM_RESSALVAS: "Apto com ressalvas",
  INAPTO: "Inapto",
};

/** Quando a pergunta vale (configurado por pergunta no checklist). */
export const APLICACOES = ["SEMPRE", "EXCETO_ENTRADA_NOVO", "APOS_CADASTRO"] as const;
export type Aplicacao = (typeof APLICACOES)[number];
export const ROTULO_APLICACAO: Record<Aplicacao, string> = {
  SEMPRE: "Em todas as inspeções",
  EXCETO_ENTRADA_NOVO: "Fora da entrada de equipamento novo",
  APOS_CADASTRO: "Só depois do cadastro",
};
export const DETALHE_APLICACAO: Record<Aplicacao, string> = {
  SEMPRE: "Entrada (novo e usado), devolução e entrega.",
  EXCETO_ENTRADA_NOVO: "Teste de equipamento usado: fica fora da entrada de equipamento novo.",
  APOS_CADASTRO: "Devolução e entrega (ex.: etiqueta do portal, que nasce no cadastro).",
};

export type Orientacao = { comoTestar: string; resultadoEsperado: string; sinaisProblema: string };

/** Pergunta como o checklist a exibe (uma versão de uma pergunta do catálogo). */
export type Pergunta = {
  /** Id da versão exibida: a resposta aponta para ela. */
  chave: string;
  /** Pergunta do catálogo (estável entre versões). */
  perguntaId: string;
  versao: number;
  grupo: string;
  texto: string;
  orientacao: Orientacao;
  /** "Não conforme" aqui impede a aprovação, a liberação e a entrega (defeito bloqueante). */
  bloqueante: boolean;
  /** Obrigatória: precisa de resposta explícita; "Não se aplica" pede justificativa. */
  obrigatoria: boolean;
  aplicacao: Aplicacao;
  /** Kit: peças a que a pergunta se aplica (vazio = todas). */
  partes: readonly ParteKit[];
};

export type ContextoInspecao = { tipo: TipoInspecao; condicao?: CondicaoEntrada | null; parte?: ParteKit | null };

/** Perguntas que valem neste contexto (tipo da inspeção, condição de entrada e peça do kit). */
export function perguntasAplicaveis(perguntas: readonly Pergunta[], c: ContextoInspecao): Pergunta[] {
  return perguntas.filter(
    (p) =>
      !(p.aplicacao === "APOS_CADASTRO" && c.tipo === "ENTRADA") &&
      !(p.aplicacao === "EXCETO_ENTRADA_NOVO" && c.tipo === "ENTRADA" && c.condicao === "NOVO") &&
      (!p.partes.length || !c.parte || p.partes.includes(c.parte)),
  );
}

/**
 * Equipamentos que nascem do cadastro e a inspeção de entrada de cada um: o notebook leva a do
 * carregador C1 (checklist da categoria de carregadores); o kit, uma por peça marcada.
 */
export function alvosDaInspecaoEntrada(tipo: Categoria, nomeCategoria: string, partes: readonly ParteKit[]) {
  if (tipo === "KIT_TECLADO_MOUSE") {
    return partes.map((p) => ({ alvo: p as string, parte: p as ParteKit | null, fonte: "categoria" as const, titulo: ROTULO_PARTE[p], rotulo: `Inspeção do ${ROTULO_PARTE[p].toLowerCase()}` }));
  }
  return [
    { alvo: "principal", parte: null, fonte: "categoria" as const, titulo: nomeCategoria, rotulo: "Inspeção de entrada" },
    ...(tipo === "NOTEBOOK" ? [{ alvo: "carregador", parte: null, fonte: "carregador" as const, titulo: "Carregador C1", rotulo: "Inspeção do carregador" }] : []),
  ];
}

/** Orientação curta para a dica ao passar o mouse: a primeira frase de "como testar". */
export const dicaDe = (p: Pergunta) => p.orientacao.comoTestar.split(/(?<=\.)\s/)[0];

export type RespostaFormulario = { resposta?: Resposta | ""; justificativa?: string; observacao?: string };
export type RespostasFormulario = Record<string, RespostaFormulario>;

export const TEXTO_RESPOSTA_MAXIMO = 500;
export const JUSTIFICATIVA_MINIMA = 5;

/** Não conforme e não testado sempre; "não se aplica" quando a verificação é obrigatória. */
export const exigeJustificativa = (p: Pergunta, r: Resposta | "" | undefined) =>
  r === "NAO_CONFORME" || r === "NAO_TESTADO" || (r === "NAO_SE_APLICA" && p.obrigatoria);

/** Erros por pergunta. Nada é presumido: pergunta obrigatória sem resposta continua sem resposta. */
export function errosChecklist(perguntas: readonly Pergunta[], respostas: RespostasFormulario): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const p of perguntas) {
    const r = respostas[p.chave];
    const justificativa = (r?.justificativa ?? "").trim();
    if (!r?.resposta || !RESPOSTAS.includes(r.resposta)) {
      if (p.obrigatoria) erros[p.chave] = "Responda este item.";
    } else if (exigeJustificativa(p, r.resposta) && justificativa.length < JUSTIFICATIVA_MINIMA) {
      erros[p.chave] =
        r.resposta === "NAO_CONFORME"
          ? "Descreva o problema encontrado."
          : r.resposta === "NAO_TESTADO"
            ? "Explique por que não foi testado."
            : "Explique por que esta verificação não se aplica.";
    } else if (justificativa.length > TEXTO_RESPOSTA_MAXIMO || (r.observacao ?? "").trim().length > TEXTO_RESPOSTA_MAXIMO) {
      erros[p.chave] = `Use no máximo ${TEXTO_RESPOSTA_MAXIMO} caracteres.`;
    }
  }
  return erros;
}

/** Itens bloqueantes marcados como não conformes. */
export const defeitosBloqueantes = (perguntas: readonly Pergunta[], respostas: RespostasFormulario) =>
  perguntas.filter((p) => p.bloqueante && respostas[p.chave]?.resposta === "NAO_CONFORME");

/**
 * Resultado técnico: defeito bloqueante = inapto; algum não conforme ou não testado = apto com
 * ressalvas; o resto = apto. Com pergunta obrigatória sem resposta, não há resultado.
 */
export function resultadoChecklist(perguntas: readonly Pergunta[], respostas: RespostasFormulario): Resultado | null {
  if (perguntas.some((p) => p.obrigatoria && !respostas[p.chave]?.resposta)) return null;
  if (defeitosBloqueantes(perguntas, respostas).length) return "INAPTO";
  if (perguntas.some((p) => ["NAO_CONFORME", "NAO_TESTADO"].includes(respostas[p.chave]?.resposta ?? ""))) return "APTO_COM_RESSALVAS";
  return "APTO";
}
