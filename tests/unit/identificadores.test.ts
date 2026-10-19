import { describe, expect, it } from "vitest";
import * as identificadores from "@/lib/identificadores";
import {
  calcularIdentificadores,
  calcularLoginUau,
  calcularNomeServidorPc,
  calcularSegundoNome,
  calcularSenhaInicial,
  chaveServidorPc,
  enderecoValido,
  faltaParaSenhaInicial,
  fazParteDoNome,
  opcoesSobrenome,
  seguePadraoSenhaPlanilha,
  sobrenomeDoNome,
} from "@/lib/identificadores";
import { validarPoliticaSenha } from "@/server/auth/senha";

const VIRTA_F1 = { dominioLogin: "virtaeng.onmicrosoft.com", dominioEmail: "virta.eng.br" };
const PRESERVE_BASIC = { dominioLogin: "preserveurbanismo.com.br", dominioEmail: "preserveurbanismo.com.br" };

describe("identificadores calculados (fórmulas da planilha IAM - Novo Usuário)", () => {
  it("reproduz o exemplo: Maria Fernanda Oliveira, grupo VIRTA - F1", () => {
    expect(
      calcularIdentificadores({ nomeCompleto: "Maria Fernanda Oliveira", segundoNome: "Fernanda", sobrenomeUtilizado: "Oliveira", grupo: VIRTA_F1 }),
    ).toEqual({
      nomeServidorPc: "Maria Oliveira",
      loginUau: "MFOLIVEI",
      loginMicrosoft: "maria.oliveira@virtaeng.onmicrosoft.com",
      emailCorporativo: "maria.oliveira@virta.eng.br",
    });
  });

  it("usa o domínio de login e o de e-mail do grupo escolhido", () => {
    const r = calcularIdentificadores({ nomeCompleto: "Bruno Lima", sobrenomeUtilizado: "Lima", grupo: PRESERVE_BASIC });
    expect(r.loginMicrosoft).toBe("bruno.lima@preserveurbanismo.com.br");
    expect(r.emailCorporativo).toBe("bruno.lima@preserveurbanismo.com.br");
  });

  it("sem grupo de licença não presume domínio: login Microsoft e e-mail ficam vazios", () => {
    const r = calcularIdentificadores({ nomeCompleto: "Maria Fernanda Oliveira", segundoNome: "Fernanda", sobrenomeUtilizado: "Oliveira" });
    expect(r.nomeServidorPc).toBe("Maria Oliveira");
    expect(r.loginUau).toBe("MFOLIVEI");
    expect(r.loginMicrosoft).toBe("");
    expect(r.emailCorporativo).toBe("");
  });

  it("nome vazio não gera nada", () => {
    expect(calcularIdentificadores({ nomeCompleto: "   ", sobrenomeUtilizado: "Silva", grupo: VIRTA_F1 })).toEqual({
      nomeServidorPc: "",
      loginUau: "",
      loginMicrosoft: "",
      emailCorporativo: "",
    });
  });

  it("acentos: o nome de exibição mantém; logins e e-mail removem", () => {
    const r = calcularIdentificadores({ nomeCompleto: "João Ângelo Conceição", segundoNome: "Ângelo", sobrenomeUtilizado: "Conceição", grupo: VIRTA_F1 });
    expect(r.nomeServidorPc).toBe("João Conceição");
    expect(r.loginUau).toBe("JACONCEI");
    expect(r.loginMicrosoft).toBe("joao.conceicao@virtaeng.onmicrosoft.com");
    expect(r.emailCorporativo).toBe("joao.conceicao@virta.eng.br");
  });

  it("espaços repetidos e nas pontas são normalizados", () => {
    expect(calcularNomeServidorPc("  Ana   Paula   Souza ", "  Souza ")).toBe("Ana Souza");
    expect(calcularLoginUau("  Ana   Paula   Souza ", " Paula ", " Souza ")).toBe("APSOUZA");
  });

  it("sobrenome composto: espaço vira ponto no e-mail e some no login UAU (limite de 8)", () => {
    const r = calcularIdentificadores({ nomeCompleto: "Carla Maria da Silva", segundoNome: "Maria", sobrenomeUtilizado: "da Silva", grupo: VIRTA_F1 });
    expect(r.nomeServidorPc).toBe("Carla da Silva");
    expect(r.loginUau).toBe("CMDASILV");
    expect(r.loginUau).toHaveLength(8);
    expect(r.emailCorporativo).toBe("carla.da.silva@virta.eng.br");
  });

  it("login UAU: sem segundo nome usa só a inicial do primeiro nome; nunca passa de 8", () => {
    expect(calcularLoginUau("Paulo Albuquerque", "", "Albuquerque")).toBe("PALBUQUE");
    expect(calcularLoginUau("Li Wu", "", "Wu")).toBe("LWU");
  });

  it("caracteres fora do padrão de login são removidos", () => {
    const r = calcularIdentificadores({ nomeCompleto: "D'Ávila Souza", sobrenomeUtilizado: "O'Neil", grupo: VIRTA_F1 });
    expect(r.loginMicrosoft).toBe("davila.oneil@virtaeng.onmicrosoft.com");
    expect(enderecoValido(r.loginMicrosoft)).toBe(true);
  });

  it("trocar só o sobrenome recalcula servidor/PC, UAU, login e e-mail, sem mexer no segundo nome nem na senha", () => {
    const base = { nomeCompleto: "Maria Fernanda Oliveira Santos", segundoNome: "Fernanda", grupo: VIRTA_F1 };
    expect(calcularIdentificadores({ ...base, sobrenomeUtilizado: "Oliveira" })).toEqual({
      nomeServidorPc: "Maria Oliveira",
      loginUau: "MFOLIVEI",
      loginMicrosoft: "maria.oliveira@virtaeng.onmicrosoft.com",
      emailCorporativo: "maria.oliveira@virta.eng.br",
    });
    expect(calcularIdentificadores({ ...base, sobrenomeUtilizado: "Santos" })).toEqual({
      nomeServidorPc: "Maria Santos",
      loginUau: "MFSANTOS",
      loginMicrosoft: "maria.santos@virtaeng.onmicrosoft.com",
      emailCorporativo: "maria.santos@virta.eng.br",
    });
    expect(calcularSenhaInicial("Virta", base.nomeCompleto, base.segundoNome)).toBe("Virta@77.70"); // independe do sobrenome
  });

  it("não existe gerador de sufixos numéricos (MFOLIVE2, maria.oliveira2…)", () => {
    expect(Object.keys(identificadores).filter((nome) => /alternativa|sugest|sufixo/i.test(nome))).toEqual([]);
    for (const sobrenome of opcoesSobrenome("Maria Fernanda Oliveira Santos")) {
      const r = calcularIdentificadores({ nomeCompleto: "Maria Fernanda Oliveira Santos", segundoNome: "Fernanda", sobrenomeUtilizado: sobrenome, grupo: VIRTA_F1 });
      for (const valor of Object.values(r)) expect(valor.split("@")[0]).not.toMatch(/\d/);
    }
  });
});

describe("segundo nome (coluna calculada da planilha)", () => {
  it("é a 2ª parte do nome depois de descartar só DA e DE, sem diferenciar maiúsculas", () => {
    expect(calcularSegundoNome("Maria Fernanda Oliveira")).toBe("Fernanda");
    expect(calcularSegundoNome("Ana da Silva")).toBe("Silva");
    expect(calcularSegundoNome("Ana DE Souza Lima")).toBe("Souza");
    expect(calcularSegundoNome("Carla Maria da Silva")).toBe("Maria");
    expect(calcularSegundoNome("  João   Ângelo  Conceição ")).toBe("Ângelo"); // espaços normalizados, acentos preservados
  });

  it("como na planilha, do/dos/das/e não são descartados", () => {
    expect(calcularSegundoNome("Maria dos Santos")).toBe("dos");
    expect(calcularSegundoNome("Pedro do Carmo")).toBe("do");
    expect(calcularSegundoNome("Rita e Souza")).toBe("e");
  });

  it("sem 2ª parte não inventa valor", () => {
    expect(calcularSegundoNome("")).toBeNull();
    expect(calcularSegundoNome("Maria")).toBeNull();
    expect(calcularSegundoNome("Maria da")).toBeNull();
    expect(calcularSegundoNome("Maria de da")).toBeNull();
  });

  it("edição manual continua válida enquanto fizer parte do nome", () => {
    expect(fazParteDoNome("Maria Fernanda Oliveira", "fernanda")).toBe(true);
    expect(fazParteDoNome("Maria Fernanda Oliveira", "Oliveira")).toBe(true);
    expect(fazParteDoNome("Maria Fernanda Oliveira", "Maria")).toBe(false); // o primeiro nome não é segundo nome
    expect(fazParteDoNome("Maria Fernanda Oliveira", "Fern")).toBe(false);
    expect(fazParteDoNome("Maria Cristina Oliveira", "Fernanda")).toBe(false);
  });
});

describe("opções de sobrenome utilizado", () => {
  it("só trechos do próprio nome, na ordem, com a grafia do nome", () => {
    expect(opcoesSobrenome("Maria Fernanda Oliveira")).toEqual(["Fernanda", "Oliveira", "Fernanda Oliveira"]);
    expect(opcoesSobrenome("JOÃO SILVA")).toEqual(["SILVA"]);
    expect(opcoesSobrenome("Maria")).toEqual([]);
    expect(opcoesSobrenome("")).toEqual([]);
  });

  it("partículas acompanham o sobrenome e não viram opção sozinhas", () => {
    expect(opcoesSobrenome("Carla Maria da Silva")).toEqual(["Maria", "Silva", "da Silva"]);
    expect(opcoesSobrenome("Maria dos Santos Pereira")).toEqual(["Santos", "dos Santos", "Pereira", "Santos Pereira"]);
    expect(opcoesSobrenome("Pedro do Carmo de Andrade")).toEqual(["Carmo", "do Carmo", "Andrade", "de Andrade"]);
  });

  it("sobrenomes compostos e acentos", () => {
    expect(opcoesSobrenome("João Castelo Branco")).toEqual(["Castelo", "Branco", "Castelo Branco"]);
    expect(opcoesSobrenome("Ana Souza e Silva")).toEqual(["Souza", "Silva", "Souza e Silva"]);
    expect(opcoesSobrenome("José Conceição Araújo")).toContain("Conceição Araújo");
  });

  it("sobrenome informado vale só se for do nome (devolve a grafia do nome)", () => {
    expect(sobrenomeDoNome("Maria Fernanda Oliveira", "oliveira")).toBe("Oliveira");
    expect(sobrenomeDoNome("Maria Fernanda Oliveira", "Santos")).toBeNull();
    expect(sobrenomeDoNome("Maria Fernanda Oliveira", "Oliveira2")).toBeNull();
    expect(sobrenomeDoNome("Maria Fernanda Oliveira", "")).toBeNull();
  });
});

describe("chave de unicidade do servidor/PC", () => {
  it("ignora maiúsculas, acentos e espaços repetidos", () => {
    expect(chaveServidorPc("João  Conceição")).toBe("joao conceicao");
    expect(chaveServidorPc("JOAO CONCEICAO")).toBe(chaveServidorPc("João Conceição"));
    expect(chaveServidorPc("  ")).toBeNull();
    expect(chaveServidorPc(null)).toBeNull();
  });
});

describe("senha inicial de ativação (fórmula da planilha)", () => {
  it("segue exatamente a fórmula: Empresa@UNICODE(inicial do nome).UNICODE(inicial do segundo nome)", () => {
    expect(calcularSenhaInicial("Virta", "Maria", "Oliveira")).toBe("Virta@77.79"); // exemplo do pedido
    expect(calcularSenhaInicial("Virta", "Maria Fernanda Oliveira", "Fernanda")).toBe("Virta@77.70");
    expect(calcularSenhaInicial("Preserve", "Bruno Lima", "Henrique")).toBe("Preserve@66.72");
  });

  it("UNICODE distingue maiúsculas e minúsculas e usa o código de caracteres acentuados", () => {
    expect(calcularSenhaInicial("Virta", "maria", "oliveira")).toBe("Virta@109.111");
    expect(calcularSenhaInicial("Arvos", "Ângela Souza", "Érica")).toBe("Arvos@194.201");
    expect(calcularSenhaInicial("Arvos", "Ângela Souza", "Érica")).not.toContain("Â"); // código, não a letra
    expect(calcularSenhaInicial("Virta", "  Maria  ", " Oliveira ")).toBe("Virta@77.79"); // espaços nas pontas
  });

  it("usa o nome curto configurado como informado (nunca a sigla) e não gera nada se faltar dado", () => {
    expect(calcularSenhaInicial("PRESERVE", "Maria", "Oliveira")).toBe("PRESERVE@77.79");
    expect(calcularSenhaInicial("", "Maria", "Oliveira")).toBeNull();
    expect(calcularSenhaInicial(null, "Maria", "Oliveira")).toBeNull();
    expect(calcularSenhaInicial("Virta", "", "Oliveira")).toBeNull();
    expect(calcularSenhaInicial("Virta", "Maria", "  ")).toBeNull();
    expect(faltaParaSenhaInicial("Virta", "Maria", "")).toBe("Informe o segundo nome.");
    expect(faltaParaSenhaInicial(null, "Maria", "Oliveira")).toMatch(/nome curto da empresa/);
  });

  it("vale só para a ativação: a senha pessoal continua não podendo seguir esse padrão", () => {
    const inicial = calcularSenhaInicial("Preserve", "Maria Fernanda Oliveira", "Fernanda")!;
    expect(seguePadraoSenhaPlanilha(inicial)).toBe(true);
    expect(validarPoliticaSenha(inicial)).toMatch(/padrão da planilha/);
    expect(validarPoliticaSenha("k7Qm-2xVtR9pLw")).toBeNull();
  });
});
