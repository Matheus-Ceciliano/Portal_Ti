/**
 * Identificadores de acesso calculados a partir do nome, reproduzindo as fórmulas da planilha
 * "SGSI - Novo Usuário" (aba IAM - Novo Usuário). Funções puras: a tela usa para a prévia e o
 * servidor recalcula para gravar. A normalização técnica (espaços, acentos e caracteres
 * aceitos em logins) preserva a intenção da fórmula.
 */

export type GrupoLicencaDominios = { dominioLogin: string; dominioEmail: string };

export type FontesIdentificadores = {
  nomeCompleto: string;
  segundoNome?: string | null;
  sobrenomeUtilizado?: string | null;
  /** Ausente: login Microsoft e e-mail não são calculados (nenhum domínio é presumido). */
  grupo?: GrupoLicencaDominios | null;
};

export type Identificadores = {
  nomeServidorPc: string;
  loginUau: string;
  loginMicrosoft: string;
  emailCorporativo: string;
};

/** Unicode NFC, sem espaços nas pontas e com espaços internos simples. */
export function normalizarNome(valor: string | null | undefined): string {
  return (valor ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Remove acentos e marcas diacríticas (João → Joao, Conceição → Conceicao). */
export function semAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").normalize("NFC");
}

/** Primeiro nome: TEXTOANTES(Nome Completo; " "; 1). Sem espaço, o nome inteiro. */
export function primeiroNome(nomeCompleto: string): string {
  return normalizarNome(nomeCompleto).split(" ")[0] ?? "";
}

const palavras = (nomeCompleto: string) => normalizarNome(nomeCompleto).split(" ").filter(Boolean);

/**
 * Segundo Nome, coluna calculada da planilha (conferida no arquivo):
 * =IF(Nome="";"";LET(parts;TEXTSPLIT(Nome;" ");INDEX(FILTER(parts;NOT(ISNUMBER(MATCH(UPPER(parts);HSTACK("DA";"DE");0))));;2)))
 * Divide o nome nos espaços, descarta só "DA" e "DE" (sem diferenciar maiúsculas) e pega a 2ª
 * parte que sobra. A planilha NÃO descarta "do", "dos" nem "das". Sem 2ª parte a planilha dá
 * erro; aqui, null: a tela pede o valor, sem inventar.
 */
export function calcularSegundoNome(nomeCompleto: string): string | null {
  return palavras(nomeCompleto).filter((p) => !["DA", "DE"].includes(p.toUpperCase()))[1] ?? null;
}

/** O valor é uma palavra (ou sequência de palavras) do nome, depois do primeiro nome. */
export function fazParteDoNome(nomeCompleto: string, valor: string | null | undefined): boolean {
  const alvo = normalizarNome(valor).toLowerCase();
  return Boolean(alvo) && ` ${palavras(nomeCompleto).slice(1).join(" ").toLowerCase()} `.includes(` ${alvo} `);
}

/** Preposições que acompanham o sobrenome seguinte ("da Silva") e conjunção de compostos ("Souza e Silva"). */
const PREPOSICOES = new Set(["da", "das", "de", "do", "dos"]);
const ehLigacao = (p: string) => PREPOSICOES.has(p.toLowerCase()) || p.toLowerCase() === "e";

/**
 * Opções de "Sobrenome Utilizado": só trechos do próprio nome, com a grafia do nome, na
 * ordem em que aparecem. Cada palavra depois do primeiro nome; a mesma palavra com a
 * preposição anterior ("da Silva", "dos Santos"); e duas palavras seguidas, para sobrenomes
 * compostos ("Castelo Branco", "Souza e Silva"). Nenhum sobrenome é inventado ou numerado.
 */
export function opcoesSobrenome(nomeCompleto: string): string[] {
  const partes = palavras(nomeCompleto);
  const opcoes: string[] = [];
  const incluir = (valor: string) => {
    if (!opcoes.some((o) => o.toLowerCase() === valor.toLowerCase())) opcoes.push(valor);
  };
  for (let i = 1; i < partes.length; i++) {
    if (ehLigacao(partes[i])) continue;
    incluir(partes[i]);
    if (i >= 2 && PREPOSICOES.has(partes[i - 1].toLowerCase())) incluir(`${partes[i - 1]} ${partes[i]}`);
  }
  for (let i = 1; i < partes.length - 1; i++) {
    const [seguinte, depois] = [partes[i + 1], partes[i + 2]];
    if (ehLigacao(partes[i])) continue;
    if (!ehLigacao(seguinte)) incluir(`${partes[i]} ${seguinte}`);
    else if (seguinte.toLowerCase() === "e" && depois && !ehLigacao(depois)) incluir(`${partes[i]} e ${depois}`);
  }
  return opcoes;
}

/** A opção de sobrenome equivalente ao valor (sem diferenciar maiúsculas), com a grafia do nome; null se não for do nome. */
export function sobrenomeDoNome(nomeCompleto: string, valor: string | null | undefined): string | null {
  const alvo = normalizarNome(valor).toLowerCase();
  return alvo ? (opcoesSobrenome(nomeCompleto).find((o) => o.toLowerCase() === alvo) ?? null) : null;
}

/**
 * SERVIDOR / PC: =SE(Nome="";"";TEXTOANTES(Nome;" ";1)&" "&Sobrenome Utilizado).
 * Mantém acentos (é um nome de exibição); sem sobrenome, só o primeiro nome.
 */
export function calcularNomeServidorPc(nomeCompleto: string, sobrenomeUtilizado?: string | null): string {
  const nome = normalizarNome(nomeCompleto);
  if (!nome) return "";
  return normalizarNome(`${primeiroNome(nome)} ${normalizarNome(sobrenomeUtilizado)}`);
}

/** Letras e números ASCII, sem acentos (base dos logins). */
const soAlfanumerico = (valor: string) => semAcentos(valor).replace(/[^A-Za-z0-9]/g, "");

/**
 * Login UAU: =MAIÚSCULA(ESQUERDA(ESQUERDA(Nome;1)&ESQUERDA(Segundo Nome;1)&Sobrenome;8)).
 * Normalização técnica: sem acentos, espaços ou símbolos (sobrenome composto vira uma palavra).
 */
export function calcularLoginUau(nomeCompleto: string, segundoNome?: string | null, sobrenomeUtilizado?: string | null): string {
  const nome = normalizarNome(nomeCompleto);
  if (!nome) return "";
  const inicialNome = soAlfanumerico(primeiroNome(nome)).slice(0, 1);
  const inicialSegundo = soAlfanumerico(normalizarNome(segundoNome)).slice(0, 1);
  const sobrenome = soAlfanumerico(normalizarNome(sobrenomeUtilizado));
  return `${inicialNome}${inicialSegundo}${sobrenome}`.slice(0, 8).toUpperCase();
}

/**
 * Parte local do login e do e-mail: MINÚSCULA(SUBSTITUIR(SERVIDOR/PC;" ";".")).
 * Normalização técnica: sem acentos e só a-z, 0-9, ponto, hífen e sublinhado; pontos
 * repetidos ou nas pontas são removidos.
 */
export function parteLocal(nomeServidorPc: string): string {
  return semAcentos(normalizarNome(nomeServidorPc))
    .toLowerCase()
    .replace(/ /g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");
}

/** Login Microsoft: parte local + "@" + domínio de login do grupo; vazio sem grupo. */
export function calcularLoginMicrosoft(nomeServidorPc: string, grupo?: GrupoLicencaDominios | null): string {
  const local = parteLocal(nomeServidorPc);
  return grupo && local ? `${local}@${grupo.dominioLogin.toLowerCase()}` : "";
}

/** E-mail corporativo: parte local + "@" + domínio de e-mail do grupo; vazio sem grupo. */
export function calcularEmailCorporativo(nomeServidorPc: string, grupo?: GrupoLicencaDominios | null): string {
  const local = parteLocal(nomeServidorPc);
  return grupo && local ? `${local}@${grupo.dominioEmail.toLowerCase()}` : "";
}

export function calcularIdentificadores(f: FontesIdentificadores): Identificadores {
  const nomeServidorPc = calcularNomeServidorPc(f.nomeCompleto, f.sobrenomeUtilizado);
  return {
    nomeServidorPc,
    loginUau: calcularLoginUau(f.nomeCompleto, f.segundoNome, f.sobrenomeUtilizado),
    loginMicrosoft: calcularLoginMicrosoft(nomeServidorPc, f.grupo),
    emailCorporativo: calcularEmailCorporativo(nomeServidorPc, f.grupo),
  };
}

/* Validação de formato (valores calculados ou ajustados manualmente) */

export const FORMATO_LOGIN_UAU = /^[A-Z0-9]{2,8}$/;
const FORMATO_ENDERECO = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
export const FORMATO_DOMINIO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export const enderecoValido = (valor: string) => FORMATO_ENDERECO.test(valor) && !valor.includes("..");

/** Duplicidade: nunca se acrescentam números ou sufixos; a TI escolhe outro sobrenome. */
export const MENSAGEM_LOGIN_EM_USO = "Este login já está em uso. Selecione outro sobrenome do colaborador.";

/**
 * Chave de unicidade do usuário do servidor/PC: sem diferenciar maiúsculas (como o Windows)
 * nem acentos (os logins derivados já os removem). "João Oliveira" = "joao oliveira".
 */
export function chaveServidorPc(nomeServidorPc: string | null | undefined): string | null {
  return semAcentos(normalizarNome(nomeServidorPc)).toLowerCase() || null;
}

/* Senha inicial de ativação (fórmula da planilha) */

/**
 * =SE([@[Nome Completo]]="";"";[@Empresa]&"@"&UNICODE(ESQUERDA([@[Nome Completo]];1))&"."&UNICODE(ESQUERDA([@[Segundo Nome]];1)))
 *
 * "Empresa" é o nome curto configurado na empresa (Arvos, Preserve, Virta), nunca a sigla.
 * UNICODE = código numérico do primeiro caractere, com maiúsculas e minúsculas distintas
 * (Maria → 77, maria → 109). Diferente da planilha, não gera nada se faltar o segundo nome
 * ou o nome curto. É credencial TEMPORÁRIA: só abre a ativação, onde a pessoa cria a senha
 * pessoal. Nunca é gravada em texto, nem em auditoria, logs ou URL.
 */
export function calcularSenhaInicial(
  nomeCurtoEmpresa: string | null | undefined,
  nomeCompleto: string,
  segundoNome: string | null | undefined,
): string | null {
  const empresa = (nomeCurtoEmpresa ?? "").trim();
  const nome = normalizarNome(nomeCompleto);
  const segundo = normalizarNome(segundoNome);
  if (!empresa || !nome || !segundo) return null;
  return `${empresa}@${nome.codePointAt(0)}.${segundo.codePointAt(0)}`;
}

/** O que falta para calcular a senha inicial (mensagem para a tela), ou null. */
export function faltaParaSenhaInicial(nomeCurtoEmpresa: string | null | undefined, nomeCompleto: string, segundoNome: string | null | undefined) {
  if (!normalizarNome(nomeCompleto)) return "Informe o nome completo.";
  if (!normalizarNome(segundoNome)) return "Informe o segundo nome.";
  if (!(nomeCurtoEmpresa ?? "").trim()) return "Configure o nome curto da empresa em Cadastros → Empresas.";
  return null;
}

/** Padrão "Empresa@número.número" da planilha (ou com o segundo código vazio). */
export function seguePadraoSenhaPlanilha(senha: string): boolean {
  return /^[\p{L}\p{N} &.-]{1,40}@\d{1,7}\.\d{0,7}$/u.test(senha);
}
