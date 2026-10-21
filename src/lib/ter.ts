import { cnpjFicticio, cnpjValido } from "@/lib/cnpj";

/**
 * TER (Termo de Entrega, Guarda e Responsabilidade): estados e textos usados no navegador e no
 * servidor. O estado documental (o PDF) e o estado da assinatura são separados; a tabela mostra
 * uma situação resumida derivada dos dois.
 */

export const ESTADOS_DOCUMENTO = ["GERANDO", "ERRO_GERACAO", "EMITIDO", "CANCELADO", "SUBSTITUIDO"] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];
export const ROTULO_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  GERANDO: "Gerando",
  ERRO_GERACAO: "Erro na geração",
  EMITIDO: "Emitido",
  CANCELADO: "Cancelado",
  SUBSTITUIDO: "Substituído",
};

export const ESTADOS_ASSINATURA = [
  "AGUARDANDO_ENVIO",
  "AGUARDANDO_ASSINATURA",
  "ARQUIVO_RECEBIDO",
  "ASSINADO_CONFERIDO",
  "ASSINATURA_RECUSADA",
  "VALIDACAO_INDETERMINADA",
] as const;
export type EstadoAssinatura = (typeof ESTADOS_ASSINATURA)[number];
export const ROTULO_ESTADO_ASSINATURA: Record<EstadoAssinatura, string> = {
  AGUARDANDO_ENVIO: "Aguardando envio",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ARQUIVO_RECEBIDO: "Arquivo recebido — aguardando conferência",
  ASSINADO_CONFERIDO: "Assinado e conferido",
  ASSINATURA_RECUSADA: "Assinatura recusada",
  VALIDACAO_INDETERMINADA: "Validação indeterminada",
};

/** Situação resumida da tabela. REGISTRO_ANTERIOR: termo registrado antes da emissão pelo portal. */
export const SITUACOES_TER = [
  "GERANDO",
  "PENDENTE_CADASTRO",
  "ERRO_GERACAO",
  "AGUARDANDO_ENVIO",
  "AGUARDANDO_ASSINATURA",
  "AGUARDANDO_CONFERENCIA",
  "ASSINADO_CONFERIDO",
  "ASSINATURA_RECUSADA",
  "VALIDACAO_INDETERMINADA",
  "CANCELADO",
  "REGISTRO_ANTERIOR",
] as const;
export type SituacaoTer = (typeof SITUACOES_TER)[number];
export const ROTULO_SITUACAO_TER: Record<SituacaoTer, string> = {
  GERANDO: "Gerando",
  PENDENTE_CADASTRO: "Pendente de cadastro",
  ERRO_GERACAO: "Erro na geração",
  AGUARDANDO_ENVIO: "Aguardando envio",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  AGUARDANDO_CONFERENCIA: "Aguardando conferência",
  ASSINADO_CONFERIDO: "Assinado e conferido",
  ASSINATURA_RECUSADA: "Assinatura recusada",
  VALIDACAO_INDETERMINADA: "Validação indeterminada",
  CANCELADO: "Cancelado",
  REGISTRO_ANTERIOR: "Registro anterior",
};

export function situacaoTer(t: { estadoDocumento: EstadoDocumento | null; estadoAssinatura: EstadoAssinatura | null; pendencias?: readonly string[] }): SituacaoTer {
  switch (t.estadoDocumento) {
    case null:
      return "REGISTRO_ANTERIOR";
    case "CANCELADO":
      return "CANCELADO";
    case "GERANDO":
      return "GERANDO";
    case "ERRO_GERACAO":
      return t.pendencias?.length ? "PENDENTE_CADASTRO" : "ERRO_GERACAO";
    default:
      if (t.estadoAssinatura === "ARQUIVO_RECEBIDO") return "AGUARDANDO_CONFERENCIA";
      return t.estadoAssinatura ?? "AGUARDANDO_ENVIO";
  }
}

/** Pendente de assinatura: o reenvio usa o mesmo PDF emitido. */
export const PERMITE_REENVIO: readonly EstadoAssinatura[] = ["AGUARDANDO_ASSINATURA", "ASSINATURA_RECUSADA", "VALIDACAO_INDETERMINADA"];
/** Aceita um PDF assinado (cada envio é um registro novo; o anterior fica preservado). */
export const PERMITE_ANEXO: readonly EstadoAssinatura[] = ["AGUARDANDO_ENVIO", "AGUARDANDO_ASSINATURA", "ARQUIVO_RECEBIDO", "ASSINATURA_RECUSADA", "VALIDACAO_INDETERMINADA"];

/** Pelo Portal do Colaborador: enviar o PDF assinado enquanto a assinatura está pendente ou após recusa. */
export const PERMITE_ENVIO_COLABORADOR: readonly EstadoAssinatura[] = ["AGUARDANDO_ENVIO", "AGUARDANDO_ASSINATURA", "ASSINATURA_RECUSADA"];

/** Situação do TER como o colaborador a vê (sem os estados internos da TI). */
export const SITUACOES_COLABORADOR = ["AGUARDANDO_ASSINATURA", "AGUARDANDO_CONFERENCIA", "ASSINADO_CONFERIDO", "ASSINATURA_RECUSADA", "EM_ANALISE", "EM_ATUALIZACAO", "CANCELADO"] as const;
export type SituacaoColaborador = (typeof SITUACOES_COLABORADOR)[number];
export const ROTULO_SITUACAO_COLABORADOR: Record<SituacaoColaborador, string> = {
  AGUARDANDO_ASSINATURA: "Aguardando sua assinatura",
  AGUARDANDO_CONFERENCIA: "Arquivo recebido — aguardando conferência",
  ASSINADO_CONFERIDO: "Assinado e conferido",
  ASSINATURA_RECUSADA: "Assinatura recusada",
  EM_ANALISE: "Em análise pela TI",
  EM_ATUALIZACAO: "Em atualização pela TI",
  CANCELADO: "Cancelado",
};

export function situacaoParaColaborador(t: { estadoDocumento: EstadoDocumento | null; estadoAssinatura: EstadoAssinatura | null }): SituacaoColaborador {
  if (t.estadoDocumento === "CANCELADO") return "CANCELADO";
  if (t.estadoDocumento !== "EMITIDO") return "EM_ATUALIZACAO";
  switch (t.estadoAssinatura) {
    case "ARQUIVO_RECEBIDO":
      return "AGUARDANDO_CONFERENCIA";
    case "ASSINADO_CONFERIDO":
      return "ASSINADO_CONFERIDO";
    case "ASSINATURA_RECUSADA":
      return "ASSINATURA_RECUSADA";
    case "VALIDACAO_INDETERMINADA":
      return "EM_ANALISE";
    default:
      return "AGUARDANDO_ASSINATURA";
  }
}

/** O colaborador pode enviar o PDF assinado (só da versão vigente, emitida). */
export const colaboradorPodeEnviar = (t: { estadoDocumento: EstadoDocumento | null; estadoAssinatura: EstadoAssinatura | null }) =>
  t.estadoDocumento === "EMITIDO" && t.estadoAssinatura !== null && PERMITE_ENVIO_COLABORADOR.includes(t.estadoAssinatura);

/** Serviço oficial para assinar o PDF (fora do portal; não há integração automática). */
export const SERVICO_ASSINATURA_GOVBR = "https://assinador.iti.br/";

/** O que o usuário pode fazer (decidido no servidor a partir do perfil; cada operação confere de novo). */
export type PermissoesTer = {
  emitir: boolean;
  enviar: boolean;
  anexar: boolean;
  conferir: boolean;
  cancelar: boolean;
  substituir: boolean;
  baixar: boolean;
  modelo: boolean;
  /** Supervisor TI ou Gestor ADM: procedimento administrativo sobre TER assinado e conferido. */
  administrativo: boolean;
};

/** Ações disponíveis para um TER conforme a situação e as permissões (o servidor valida de novo). */
export function acoesDoTer(t: { estadoDocumento: EstadoDocumento | null; estadoAssinatura: EstadoAssinatura | null; temPdf: boolean }, p: PermissoesTer) {
  const emitido = t.estadoDocumento === "EMITIDO";
  const assinatura = t.estadoAssinatura;
  const assinado = assinatura === "ASSINADO_CONFERIDO";
  return {
    pdf: t.temPdf && p.baixar,
    gerar: p.emitir && (t.estadoDocumento === "ERRO_GERACAO" || t.estadoDocumento === "GERANDO"),
    enviar: p.enviar && emitido && assinatura === "AGUARDANDO_ENVIO",
    reenviar: p.enviar && emitido && assinatura !== null && PERMITE_REENVIO.includes(assinatura),
    anexar: p.anexar && emitido && assinatura !== null && PERMITE_ANEXO.includes(assinatura),
    conferir: p.conferir && emitido && assinatura === "ARQUIVO_RECEBIDO",
    substituir: p.substituir && emitido && (!assinado || p.administrativo),
    cancelar: p.cancelar && t.estadoDocumento !== null && t.estadoDocumento !== "CANCELADO" && (!assinado || p.administrativo),
  };
}

export type AcaoTer = Exclude<keyof ReturnType<typeof acoesDoTer>, "pdf">;

/* Encaminhamento (sem serviço de e-mail no portal: feito fora dele e registrado aqui) */

export const CANAIS_ENVIO = ["EMAIL", "TEAMS", "PRESENCIAL", "OUTRO"] as const;
export type CanalEnvio = (typeof CANAIS_ENVIO)[number];
export const ROTULO_CANAL: Record<CanalEnvio, string> = {
  EMAIL: "E-mail (enviado fora do portal)",
  TEAMS: "Microsoft Teams (fora do portal)",
  PRESENCIAL: "Entregue pessoalmente",
  OUTRO: "Outro canal",
};

export const ASSUNTO_ENVIO = "Termo de Entrega e Responsabilidade — Portal TI Vallur";

export const MENSAGEM_ENVIO = [
  "Olá,",
  "",
  "Segue o Termo de Entrega e Responsabilidade referente aos equipamentos disponibilizados para suas atividades profissionais.",
  "",
  "Solicitamos a conferência das informações, a assinatura eletrônica do documento completo pelo GOV.BR e a devolução do PDF assinado à equipe de TI.",
  "",
  "Em caso de divergência nos equipamentos ou nas condições registradas, entre em contato com a TI antes de assinar.",
  "",
  "Atenciosamente,",
  "Equipe de TI — Vallur",
].join("\n");

/* Conferência manual da assinatura */

export const RESULTADOS_CONFERENCIA = ["CONFORME", "NAO_CONFORME", "INDETERMINADO"] as const;
export type ResultadoConferencia = (typeof RESULTADOS_CONFERENCIA)[number];
export const ROTULO_RESULTADO_CONFERENCIA: Record<ResultadoConferencia, string> = {
  CONFORME: "Conforme",
  NAO_CONFORME: "Não conforme",
  INDETERMINADO: "Indeterminado",
};

export const FERRAMENTA_PADRAO = "VALIDAR — ITI (validar.iti.gov.br)";

/* Histórico */

export const ROTULO_ACAO_TER: Record<string, string> = {
  ENTREGA_REGISTRADA: "Entrega física registrada",
  TER_CRIADO: "TER criado",
  VERSAO_CRIADA: "Nova versão criada",
  PDF_GERADO: "PDF gerado e armazenado",
  EMITIDO: "Emitido",
  ERRO_GERACAO: "Erro na geração",
  PENDENCIA_CADASTRO: "Pendência de cadastro",
  ENVIO: "Envio para assinatura registrado",
  REENVIO: "Reenvio registrado",
  ARQUIVO_RECEBIDO: "PDF assinado recebido",
  PDF_BAIXADO: "PDF baixado pelo colaborador",
  CONFERENCIA: "Assinatura conferida",
  RECUSA: "Assinatura recusada",
  INDETERMINADA: "Validação indeterminada",
  CANCELAMENTO: "TER cancelado",
  SUBSTITUICAO: "Versão substituída",
};

/**
 * Dados obrigatórios ausentes no cadastro de origem (nada é inventado): o CPF do colaborador e,
 * em documento oficial (produção), um CNPJ válido e real de cada empresa impressa no termo. Fora
 * de produção o documento sai marcado como teste e o CNPJ fictício é aceito.
 */
export function pendenciasDoTer(e: { temCpf: boolean; oficial: boolean; empresas: { nome: string; cnpj: string }[] }) {
  const cnpjs = e.oficial ? [...new Set(e.empresas.filter((x) => !cnpjValido(x.cnpj) || cnpjFicticio(x.cnpj)).map((x) => x.nome))] : [];
  return [...(e.temCpf ? [] : ["CPF do colaborador"]), ...cnpjs.map((n) => `CNPJ válido de ${n}`)];
}

/** Complemento da mensagem da entrega física: o que aconteceu com o TER gerado por ela. */
export function resumoTerDaEntrega(ter: { numero: string; estado: string } | null | undefined) {
  if (!ter) return "";
  if (ter.estado === "EMITIDO") return ` ${ter.numero} emitido.`;
  if (ter.estado === "PENDENTE_CADASTRO") return ` ${ter.numero} pendente: complete o cadastro (CPF da pessoa ou CNPJ da empresa) para gerar o PDF.`;
  return ` ${ter.numero} criado, mas o PDF não foi gerado: tente novamente na aba TER.`;
}

/** Nome do arquivo: NOME DO COLABORADOR - AAAA.MM.DD - TER (data local da entrega). */
export function nomeDocumentoTer(colaborador: string, entregueEm: Date, complemento?: string | null) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(entregueEm);
  const base = `${colaborador.normalize("NFC").trim().toLocaleUpperCase("pt-BR")} - ${p.replaceAll("-", ".")} - TER`;
  return complemento ? `${base} (${complemento})` : base;
}
