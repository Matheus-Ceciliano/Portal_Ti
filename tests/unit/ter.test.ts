import { describe, expect, it } from "vitest";
import { cpfValido, formatarCpf, mascararCpf } from "@/lib/cpf";
import { numeroTer } from "@/lib/inventario";
import { acoesDoTer, nomeDocumentoTer, pendenciasDoTer, resumoTerDaEntrega, situacaoTer, type PermissoesTer } from "@/lib/ter";

const TODAS: PermissoesTer = { emitir: true, enviar: true, anexar: true, conferir: true, cancelar: true, substituir: true, baixar: true, modelo: true, administrativo: false };

describe("CPF", () => {
  it("valida os dígitos verificadores e recusa sequências repetidas", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("1234")).toBe(false);
  });

  it("formata durante a digitação e mascara pelos dois últimos dígitos", () => {
    expect(formatarCpf("5299822")).toBe("529.982.2");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(mascararCpf("25")).toBe("***.***.***-25");
    expect(mascararCpf(null)).toBeNull();
  });
});

describe("situação do TER", () => {
  it("separa documento e assinatura e resume para a tabela", () => {
    expect(situacaoTer({ estadoDocumento: null, estadoAssinatura: null })).toBe("REGISTRO_ANTERIOR");
    expect(situacaoTer({ estadoDocumento: "GERANDO", estadoAssinatura: null })).toBe("GERANDO");
    expect(situacaoTer({ estadoDocumento: "ERRO_GERACAO", estadoAssinatura: null, pendencias: ["CPF do colaborador"] })).toBe("PENDENTE_CADASTRO");
    expect(situacaoTer({ estadoDocumento: "ERRO_GERACAO", estadoAssinatura: null, pendencias: [] })).toBe("ERRO_GERACAO");
    expect(situacaoTer({ estadoDocumento: "EMITIDO", estadoAssinatura: "AGUARDANDO_ENVIO" })).toBe("AGUARDANDO_ENVIO");
    expect(situacaoTer({ estadoDocumento: "EMITIDO", estadoAssinatura: "ARQUIVO_RECEBIDO" })).toBe("AGUARDANDO_CONFERENCIA");
    expect(situacaoTer({ estadoDocumento: "EMITIDO", estadoAssinatura: "ASSINADO_CONFERIDO" })).toBe("ASSINADO_CONFERIDO");
    expect(situacaoTer({ estadoDocumento: "CANCELADO", estadoAssinatura: "ASSINADO_CONFERIDO" })).toBe("CANCELADO");
  });

  it("oferece as ações conforme a situação e as permissões", () => {
    const emitido = { estadoDocumento: "EMITIDO" as const, temPdf: true };
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "AGUARDANDO_ENVIO" }, TODAS)).toMatchObject({ enviar: true, reenviar: false, anexar: true, conferir: false, cancelar: true });
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "AGUARDANDO_ASSINATURA" }, TODAS)).toMatchObject({ enviar: false, reenviar: true, anexar: true });
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "ARQUIVO_RECEBIDO" }, TODAS)).toMatchObject({ conferir: true, reenviar: false });
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "ASSINATURA_RECUSADA" }, TODAS)).toMatchObject({ reenviar: true, anexar: true, conferir: false });
    // Assinado e conferido: sem reenvio; cancelar ou substituir só por perfil administrativo.
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "ASSINADO_CONFERIDO" }, TODAS)).toMatchObject({ reenviar: false, anexar: false, cancelar: false, substituir: false });
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "ASSINADO_CONFERIDO" }, { ...TODAS, administrativo: true })).toMatchObject({ cancelar: true, substituir: true });
    expect(acoesDoTer({ estadoDocumento: "CANCELADO", estadoAssinatura: "AGUARDANDO_ASSINATURA", temPdf: true }, TODAS)).toMatchObject({ reenviar: false, anexar: false, cancelar: false, pdf: true });
    expect(acoesDoTer({ estadoDocumento: "ERRO_GERACAO", estadoAssinatura: null, temPdf: false }, TODAS)).toMatchObject({ gerar: true, enviar: false, pdf: false });
    expect(acoesDoTer({ ...emitido, estadoAssinatura: "ARQUIVO_RECEBIDO" }, { ...TODAS, conferir: false })).toMatchObject({ conferir: false });
  });
});

describe("documento", () => {
  it("número no padrão das alocações: TER0137", () => {
    expect(numeroTer(137)).toBe("TER0137");
    expect(numeroTer(12345)).toBe("TER12345");
  });

  it("pendências: CPF sempre; CNPJ válido e real só em documento oficial (produção)", () => {
    const ficticia = { nome: "Empresa Fictícia", cnpj: "VLRTESTE000403" };
    const invalida = { nome: "Empresa Digitada Errada", cnpj: "11.222.333/0001-80" };
    const real = { nome: "Empresa Válida", cnpj: "11.222.333/0001-81" };
    expect(pendenciasDoTer({ temCpf: true, oficial: false, empresas: [ficticia, invalida] })).toEqual([]);
    expect(pendenciasDoTer({ temCpf: false, oficial: false, empresas: [real] })).toEqual(["CPF do colaborador"]);
    expect(pendenciasDoTer({ temCpf: true, oficial: true, empresas: [real, ficticia, invalida, ficticia] })).toEqual(["CNPJ válido de Empresa Fictícia", "CNPJ válido de Empresa Digitada Errada"]);
    expect(pendenciasDoTer({ temCpf: true, oficial: true, empresas: [real] })).toEqual([]);
  });

  it("nome do arquivo: colaborador, data local da entrega e complemento quando necessário", () => {
    const quando = new Date("2026-10-06T01:30:00.000Z"); // 05/10 22:30 em Brasília
    expect(nomeDocumentoTer("Colaborador Fictício", quando)).toBe("COLABORADOR FICTÍCIO - 2026.10.05 - TER");
    expect(nomeDocumentoTer("Colaborador Fictício", quando, "v2")).toBe("COLABORADOR FICTÍCIO - 2026.10.05 - TER (v2)");
  });

  it("mensagem da entrega física diz o que aconteceu com o TER", () => {
    expect(resumoTerDaEntrega(null)).toBe("");
    expect(resumoTerDaEntrega({ numero: "TER-2026-0001", estado: "EMITIDO" })).toBe(" TER-2026-0001 emitido.");
    expect(resumoTerDaEntrega({ numero: "TER-2026-0001", estado: "PENDENTE_CADASTRO" })).toContain("CPF");
    expect(resumoTerDaEntrega({ numero: "TER-2026-0001", estado: "ERRO_GERACAO" })).toContain("tente novamente");
  });
});
