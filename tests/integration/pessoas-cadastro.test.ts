/**
 * Cadastro de pessoas: identificadores calculados, duplicidade sem sufixos, senha segura,
 * edição sem renomear identificadores, catálogo de grupos de licença e RBAC no servidor.
 */
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MENSAGEM_LOGIN_EM_USO } from "@/lib/identificadores";
import { verificarSenha } from "@/server/auth/senha";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { EMPRESAS, PESSOAS } from "@/server/dados-ficticios/cadastros";
import { prisma } from "@/server/db";
import { listarGruposLicenca, salvarGrupoLicenca } from "@/server/modulos/grupos-licenca";
import {
  cadastrarPessoa,
  editarPessoa,
  ErroIdentificadores,
  listarPessoas,
  obterDetalhePessoa,
  verificarIdentificadores,
  type EntradaCadastro,
} from "@/server/modulos/pessoas";
import { criarEmpresa, criarPessoa, limparBanco, semearInventarioTeste, senhaAleatoria } from "../apoio/fabricas";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

/** Grupo do catálogo criado pela migração (VIRTA - F1). */
const virtaF1 = () => prisma.grupoLicenca.findUniqueOrThrow({ where: { nome: "VIRTA - F1" } });

async function cenario() {
  const empresa = await criarEmpresa();
  const supervisor = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
  return { empresa, supervisor: await ator(supervisor.contaId) };
}

const maria = (empresaId: string, grupoLicencaId: string | null, extra: Partial<EntradaCadastro> = {}): EntradaCadastro => ({
  nome: "Maria Fernanda Oliveira",
  segundoNome: "Fernanda",
  sobrenomeUtilizado: "Oliveira",
  cargo: "Analista de Planejamento",
  departamento: "Planejamento",
  empresaId,
  grupoLicencaId,
  email: "",
  senhaInicial: senhaAleatoria(),
  criarContaMicrosoft: false,
  ...extra,
});

beforeEach(limparBanco);

describe("cadastro com identificadores calculados", () => {
  it("calcula servidor/PC, login UAU, login Microsoft e e-mail pelo grupo de licença", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { email: "ignorado@outro.com" }));
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: r.colaboradorId }, include: { conta: true } });
    expect(c).toMatchObject({
      nomeServidorPc: "Maria Oliveira",
      loginUau: "MFOLIVEI",
      loginMicrosoft: "maria.oliveira@virtaeng.onmicrosoft.com",
      emailCorporativo: "maria.oliveira@virta.eng.br",
      grupoLicencaId: grupo.id,
      segundoNome: "Fernanda",
      sobrenomeUtilizado: "Oliveira",
    });
    expect(c.conta?.email).toBe("maria.oliveira@virta.eng.br"); // login do portal
    expect(c.conta?.senhaPessoalDefinidaEm).toBeNull(); // exige ativação
  });

  it("sem grupo de licença não presume domínio: exige o e-mail e não gera login Microsoft", async () => {
    const { empresa, supervisor } = await cenario();
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, null))).rejects.toThrow(/Informe o e-mail corporativo/);
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, null, { email: "Maria.Oliveira@Exemplo.test" }));
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: r.colaboradorId } });
    expect(c.emailCorporativo).toBe("maria.oliveira@exemplo.test");
    expect(c.loginMicrosoft).toBeNull();
    expect(c.loginUau).toBe("MFOLIVEI");
  });

  it("segundo nome ausente vem da fórmula da planilha; o informado pela TI prevalece", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const auto = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { segundoNome: undefined }));
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: auto.colaboradorId } })).segundoNome).toBe("Fernanda");

    const manual = await cadastrarPessoa(
      supervisor,
      maria(empresa.id, grupo.id, { nome: "Paulo de Souza Lima", segundoNome: "Henrique", sobrenomeUtilizado: "Lima" }),
    );
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: manual.colaboradorId } });
    expect([c.segundoNome, c.loginUau]).toEqual(["Henrique", "PHLIMA"]);
    const evento = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "colaborador.criar", alvoId: manual.colaboradorId } });
    expect(evento.detalhe).toMatchObject({ segundoNomeAlterado: true });
  });

  it("sobrenome utilizado precisa ser do nome completo; a grafia gravada é a do nome", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { sobrenomeUtilizado: "Silva" }))).rejects.toThrow(/faça parte do nome completo/);
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { sobrenomeUtilizado: "Oliveira2" }))).rejects.toThrow(/faça parte do nome completo/);
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { sobrenomeUtilizado: "" }))).rejects.toThrow(/Selecione o sobrenome/);
    // Um só sobrenome possível: escolhido sem perguntar.
    const unico = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "Rui Barros", segundoNome: undefined, sobrenomeUtilizado: undefined }));
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: unico.colaboradorId } })).sobrenomeUtilizado).toBe("Barros");
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { sobrenomeUtilizado: "oliveira" }));
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: r.colaboradorId } })).sobrenomeUtilizado).toBe("Oliveira");
    expect(await prisma.colaborador.count({ where: { nome: "Maria Fernanda Oliveira" } })).toBe(1);
  });
});

describe("duplicidade de logins", () => {
  it("recusa login em uso sem sugerir sufixos e aceita depois da troca do sobrenome", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id));

    const outra = { nome: "Maria Fernanda Oliveira Santos", sobrenomeUtilizado: "Oliveira" };
    const erro = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, outra)).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroIdentificadores);
    expect((erro as ErroIdentificadores).message).toBe(MENSAGEM_LOGIN_EM_USO);
    expect((erro as ErroIdentificadores).conflitos).toEqual([
      { campo: "nomeServidorPc", valor: "Maria Oliveira" },
      { campo: "loginUau", valor: "MFOLIVEI" },
      { campo: "loginMicrosoft", valor: "maria.oliveira@virtaeng.onmicrosoft.com" },
      { campo: "emailCorporativo", valor: "maria.oliveira@virta.eng.br" },
    ]);

    // Outro sobrenome do próprio nome: identificadores recalculados e livres. Nada numerado.
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { ...outra, sobrenomeUtilizado: "Santos" }));
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: r.colaboradorId } });
    expect([c.nomeServidorPc, c.loginUau, c.emailCorporativo, c.segundoNome]).toEqual(["Maria Santos", "MFSANTOS", "maria.santos@virta.eng.br", "Fernanda"]);
    const todos = await prisma.colaborador.findMany({ where: { loginUau: { not: null } }, select: { loginUau: true, emailCorporativo: true } });
    expect(todos.filter((t) => /\d/.test(`${t.loginUau}${t.emailCorporativo.split("@")[0]}`))).toEqual([]);
  });

  it("só o UAU colide: o conflito aponta apenas o login UAU", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id));
    const erro = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "Marcos Felipe Oliveira", segundoNome: "Fernando" })).catch((e) => e);
    expect((erro as ErroIdentificadores).conflitos).toEqual([{ campo: "loginUau", valor: "MFOLIVEI" }]);
  });

  it("compara como cada sistema: servidor/PC sem acentos nem maiúsculas; endereços sem maiúsculas", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "João Ângelo Conceição", segundoNome: "Ângelo", sobrenomeUtilizado: "Conceição" }));
    const semAcento = await cadastrarPessoa(
      supervisor,
      maria(empresa.id, null, { nome: "JOAO Pedro CONCEICAO", segundoNome: "Pedro", sobrenomeUtilizado: "CONCEICAO", email: "outro.endereco@exemplo.test" }),
    ).catch((e) => e);
    expect((semAcento as ErroIdentificadores).conflitos.map((c) => c.campo)).toEqual(["nomeServidorPc"]);

    const enderecoMaiusculo = await cadastrarPessoa(
      supervisor,
      maria(empresa.id, null, { nome: "Lia Rosa Prado", segundoNome: "Rosa", sobrenomeUtilizado: "Prado", email: "JOAO.CONCEICAO@virta.eng.br" }),
    ).catch((e) => e);
    expect((enderecoMaiusculo as ErroIdentificadores).conflitos).toEqual([{ campo: "emailCorporativo", valor: "joao.conceicao@virta.eng.br" }]);
  });

  it("o login do portal de outra conta também conta como em uso", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const existente = await criarPessoa({ ativada: true });
    const conta = await prisma.contaAcesso.findUniqueOrThrow({ where: { colaboradorId: existente.colaboradorId } });
    await prisma.contaAcesso.update({ where: { id: conta.id }, data: { email: "maria.oliveira@virta.eng.br" } });
    const erro = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id)).catch((e) => e);
    expect((erro as ErroIdentificadores).conflitos).toEqual([{ campo: "emailCorporativo", valor: "maria.oliveira@virta.eng.br" }]);
  });

  it("cadastros simultâneos com os mesmos logins: um grava, o outro recebe a duplicidade", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const resultados = await Promise.allSettled([1, 2, 3].map(() => cadastrarPessoa(supervisor, maria(empresa.id, grupo.id))));
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(recusas).toHaveLength(2);
    for (const r of recusas) expect(r.reason).toBeInstanceOf(ErroIdentificadores);
    expect(await prisma.colaborador.count({ where: { nome: "Maria Fernanda Oliveira" } })).toBe(1);
  });

  it("verificação para a tela: conflitos do sobrenome escolhido e opções em uso; todas em uso bloqueiam", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id));

    const v = await verificarIdentificadores(supervisor, { nome: "Maria Fernanda Oliveira Santos", sobrenomeUtilizado: "Oliveira", grupoLicencaId: grupo.id });
    expect(v.conflitos.map((c) => c.campo)).toEqual(["nomeServidorPc", "loginUau", "loginMicrosoft", "emailCorporativo"]);
    expect(v.sobrenomes).toEqual([
      { valor: "Fernanda", emUso: false },
      { valor: "Oliveira", emUso: true },
      { valor: "Santos", emUso: false },
      { valor: "Fernanda Oliveira", emUso: false },
      { valor: "Oliveira Santos", emUso: true }, // UAU cortado em 8: MFOLIVEI
    ]);

    // Nome com um só sobrenome possível e já em uso: nenhuma opção livre.
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "Ana Souza", segundoNome: "Souza", sobrenomeUtilizado: "Souza" }));
    const unica = await verificarIdentificadores(supervisor, { nome: "Ana Souza", sobrenomeUtilizado: "Souza", grupoLicencaId: grupo.id });
    expect(unica.sobrenomes).toEqual([{ valor: "Souza", emUso: true }]);
  });

  it("verificação exige permissão de cadastro ou edição no servidor", async () => {
    const comum = await ator((await criarPessoa({ ativada: true })).contaId);
    await expect(verificarIdentificadores(comum, { nome: "Maria Fernanda Oliveira", sobrenomeUtilizado: "Oliveira" })).rejects.toBeInstanceOf(ErroAutorizacao);
    const { empresa } = await cenario();
    await expect(cadastrarPessoa(comum, maria(empresa.id, null, { email: "maria@exemplo.test" }))).rejects.toBeInstanceOf(ErroAutorizacao);
  });
});

describe("senha inicial", () => {
  it("sem senha informada, gera a senha inicial pela fórmula com o nome curto da empresa e grava só o hash", async () => {
    const { empresa, supervisor } = await cenario();
    await prisma.empresa.update({ where: { id: empresa.id }, data: { nomeCurtoSenha: "Virta" } });
    const grupo = await virtaF1();
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { senhaInicial: undefined }));
    const senha = "Virta@77.70"; // M = 77, F = 70

    const conta = await prisma.contaAcesso.findUniqueOrThrow({ where: { colaboradorId: r.colaboradorId }, include: { credenciais: true } });
    expect(conta.senhaPessoalDefinidaEm).toBeNull(); // só abre a ativação
    expect(conta.credenciais[0].password).toMatch(/^\$argon2id\$/);
    expect(await verificarSenha(conta.credenciais[0].password!, senha)).toBe(true);

    // A senha não aparece em nenhuma tabela (inclusive auditoria) nem no detalhe da pessoa.
    const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    for (const { tablename } of tabelas) {
      const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(`SELECT count(*) AS total FROM "${tablename}" t WHERE t::text LIKE $1`, `%${senha}%`);
      expect({ tablename, total: Number(total) }).toEqual({ tablename, total: 0 });
    }
    const evento = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "colaborador.criar", alvoId: r.colaboradorId } });
    expect(evento.detalhe).toMatchObject({ credencialInicial: "formula_planilha" });
    const detalhe = JSON.stringify(await obterDetalhePessoa(supervisor, r.colaboradorId));
    expect(detalhe).not.toContain(senha);
    expect(detalhe).not.toMatch(/argon2|hash|password|segredo/i);
  });

  it("não gera senha sem segundo nome ou sem o nome curto da empresa (a sigla não substitui)", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { senhaInicial: undefined }))).rejects.toThrow(/nome curto da empresa/);
    await prisma.empresa.update({ where: { id: empresa.id }, data: { nomeCurtoSenha: "Virta" } });
    // "Maria" sozinho não tem 2ª parte: a fórmula não determina o segundo nome e nada é inventado.
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { senhaInicial: undefined, nome: "Maria", segundoNome: "" }))).rejects.toThrow(/segundo nome/);
    expect(await prisma.colaborador.count({ where: { loginUau: { startsWith: "M" } } })).toBe(0);
  });

  it("senha informada por integração continua passando pela política (o padrão da planilha é recusado)", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { senhaInicial: "Preserve@77.70" }))).rejects.toThrow(/padrão da planilha/);
    const senha = `Unica-${randomBytes(6).toString("hex")}-Marcador`;
    const r = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { senhaInicial: senha }));
    const credencial = await prisma.credencialConta.findFirstOrThrow({ where: { conta: { colaboradorId: r.colaboradorId } } });
    expect(credencial.password).not.toContain(senha);
  });
});

describe("edição", () => {
  it("não renomeia identificadores sem aplicar; aplicar o e-mail muda o login do portal e é auditado", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const { colaboradorId } = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id));
    const base = { colaboradorId, segundoNome: "Fernanda", cargo: "Coordenadora", departamento: "Planejamento", empresaId: empresa.id, grupoLicencaId: grupo.id };

    await editarPessoa(supervisor, { ...base, nome: "Maria Fernanda Souza", sobrenomeUtilizado: "Souza" });
    let c = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, include: { conta: true } });
    expect(c.nome).toBe("Maria Fernanda Souza");
    expect(c.cargo).toBe("Coordenadora");
    expect([c.loginUau, c.emailCorporativo, c.nomeServidorPc]).toEqual(["MFOLIVEI", "maria.oliveira@virta.eng.br", "Maria Oliveira"]);

    await editarPessoa(supervisor, { ...base, nome: "Maria Fernanda Souza", sobrenomeUtilizado: "Souza", aplicar: ["emailCorporativo", "nomeServidorPc"] });
    c = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, include: { conta: true } });
    expect(c.emailCorporativo).toBe("maria.souza@virta.eng.br");
    expect(c.conta?.email).toBe("maria.souza@virta.eng.br");
    expect(c.nomeServidorPc).toBe("Maria Souza");
    expect(c.loginUau).toBe("MFOLIVEI"); // não aplicado: continua

    const evento = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "colaborador.editar" }, orderBy: { criadoEm: "desc" } });
    expect(evento.detalhe).toMatchObject({ loginPortalAlterado: true });
    expect(JSON.stringify(evento.detalhe)).not.toContain("maria.souza"); // só nomes de campos
  });

  it("o próprio registro não é duplicidade; aplicar login de outra pessoa é recusado", async () => {
    const { empresa, supervisor } = await cenario();
    const grupo = await virtaF1();
    const { colaboradorId } = await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "Maria Fernanda Oliveira Santos" }));
    const base = { colaboradorId, nome: "Maria Fernanda Oliveira Santos", segundoNome: "Fernanda", cargo: "Analista", departamento: "Planejamento", empresaId: empresa.id, grupoLicencaId: grupo.id };
    const todos = ["nomeServidorPc", "loginUau", "loginMicrosoft", "emailCorporativo"] as const;

    await editarPessoa(supervisor, { ...base, sobrenomeUtilizado: "Oliveira", aplicar: [...todos] }); // mesmos valores: nada colide
    await cadastrarPessoa(supervisor, maria(empresa.id, grupo.id, { nome: "Mário Felipe Santos", segundoNome: "Felipe", sobrenomeUtilizado: "Santos" }));
    const erro = await editarPessoa(supervisor, { ...base, sobrenomeUtilizado: "Santos", aplicar: ["loginUau", "emailCorporativo"] }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroIdentificadores);
    expect((erro as ErroIdentificadores).conflitos.map((c) => c.campo)).toEqual(["loginUau"]); // MFSANTOS é do Mário
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } });
    expect([c.loginUau, c.emailCorporativo, c.sobrenomeUtilizado]).toEqual(["MFOLIVEI", "maria.oliveira@virta.eng.br", "Oliveira"]);

    await editarPessoa(supervisor, { ...base, sobrenomeUtilizado: "Santos", aplicar: ["emailCorporativo", "nomeServidorPc"] });
    const depois = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } });
    expect([depois.nomeServidorPc, depois.chaveServidorPc, depois.emailCorporativo]).toEqual(["Maria Santos", "maria santos", "maria.santos@virta.eng.br"]);
  });

  it("Estagiário edita pessoa comum, mas não a equipe de TI; Supervisor e Gestor editam a equipe", async () => {
    const { empresa } = await cenario();
    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    const comum = await criarPessoa({ ativada: true });
    const membroTi = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    const edicao = (colaboradorId: string) => ({ colaboradorId, nome: "Nome Editado Teste", cargo: "Analista", departamento: "TI", empresaId: empresa.id });

    await editarPessoa(estagiario, edicao(comum.colaboradorId));
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: comum.colaboradorId } })).nome).toBe("Nome Editado Teste");
    await expect(editarPessoa(estagiario, edicao(membroTi.colaboradorId))).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(editarPessoa(estagiario, edicao(estagiario.colaboradorId))).rejects.toBeInstanceOf(ErroAutorizacao);

    for (const perfil of ["SUPERVISOR_TI", "GESTOR_ADM"] as const) {
      const admin = await ator((await criarPessoa({ perfis: [perfil], ativada: true })).contaId);
      await editarPessoa(admin, { ...edicao(membroTi.colaboradorId), nome: `Editado por ${perfil}` });
      expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: membroTi.colaboradorId } })).nome).toBe(`Editado por ${perfil}`);
    }
  });
});

describe("listagem e detalhes", () => {
  it("busca por empresa, filtra por departamento e separa equipamento entregue de reservado", async () => {
    const { supervisor } = await cenario();
    // Inventário fictício no banco: Ana tem o notebook VLR-004512 entregue; Mariana, o VLR-004644 só reservado.
    await semearInventarioTeste();
    const porEmpresa = await listarPessoas(supervisor, { busca: EMPRESAS[0].nome.split(" ")[0] });
    expect(porEmpresa.linhas.map((l) => l.id)).toContain(PESSOAS[3].id);

    const ana = await obterDetalhePessoa(supervisor, PESSOAS[3].id);
    expect(ana.equipamentos.entregues.map((e) => e.patrimonio)).toContain("VLR-004512");

    const porDepartamento = await listarPessoas(supervisor, { departamento: PESSOAS[3].departamento });
    expect(porDepartamento.linhas.every((l) => l.departamento === PESSOAS[3].departamento)).toBe(true);

    const detalhe = await obterDetalhePessoa(supervisor, PESSOAS[7].id);
    expect(detalhe.equipamentos.entregues.map((e) => e.patrimonio)).toEqual([]);
    expect(detalhe.equipamentos.reservados.map((e) => e.patrimonio).sort()).toEqual(["NBI4644.C1", "VLR-004644"]); // notebook e carregador
  });

  it("colaborador não lista pessoas e só vê o próprio detalhe", async () => {
    const comum = await criarPessoa({ ativada: true });
    const outra = await criarPessoa({ ativada: true });
    const atorComum = await ator(comum.contaId);
    await expect(listarPessoas(atorComum, {})).rejects.toBeInstanceOf(ErroAutorizacao);
    expect((await obterDetalhePessoa(atorComum, comum.colaboradorId)).pessoa.id).toBe(comum.colaboradorId);
    await expect(obterDetalhePessoa(atorComum, outra.colaboradorId)).rejects.toBeInstanceOf(ErroAutorizacao);
  });
});

describe("catálogo de grupos de licença", () => {
  it("só administradores mantêm o catálogo; grupo inativo não vale no cadastro", async () => {
    const { empresa, supervisor } = await cenario();
    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    const nome = `TESTE ${randomBytes(3).toString("hex").toUpperCase()}`;
    const dados = { nome, dominioLogin: "teste.onmicrosoft.com", dominioEmail: "teste.example", ativo: true };
    await expect(salvarGrupoLicenca(estagiario, { dados })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(salvarGrupoLicenca(supervisor, { dados: { ...dados, dominioLogin: "não é domínio" } })).rejects.toBeInstanceOf(ErroNegocio);

    const { id } = await salvarGrupoLicenca(supervisor, { dados });
    expect((await listarGruposLicenca(estagiario)).some((g) => g.id === id)).toBe(true); // consulta liberada

    await salvarGrupoLicenca(supervisor, { id, dados: { ...dados, ativo: false } });
    expect((await listarGruposLicenca(estagiario)).some((g) => g.id === id)).toBe(false);
    await expect(cadastrarPessoa(supervisor, maria(empresa.id, id))).rejects.toThrow(/grupo de licença ativo/);
    await prisma.grupoLicenca.delete({ where: { id } }); // o catálogo não é limpo entre testes
  });
});
