/**
 * Casos de uso contra o PostgreSQL de teste: RBAC no backend (chamada direta, sem
 * interface), ativação segura da senha inicial, isolamento de dados e ausência de
 * senha em claro no banco.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { PESSOAS } from "@/server/dados-ficticios/cadastros";
import { prisma } from "@/server/db";
import { consumirCodigoAtivacao, definirSenhaPessoal, gerarCodigoAtivacao } from "@/server/modulos/ativacao";
import { listarMeusEquipamentos } from "@/server/modulos/consultas";
import { listarInventario } from "@/server/modulos/inventario";
import {
  atribuirPerfil,
  concederPermissaoIndividual,
  revogarPerfil,
} from "@/server/modulos/perfis";
import {
  alterarBloqueioConta,
  cadastrarPessoa,
  obterPessoa,
  redefinirSenhaPelaTi,
} from "@/server/modulos/pessoas";
import { criarEmpresa, criarPessoa, limparBanco, semearInventarioTeste, senhaAleatoria } from "../apoio/fabricas";

async function ator(contaId: string, mfaVerificado = true): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado });
  if (!a) throw new Error("ator inexistente");
  return a;
}

async function negado(promessa: Promise<unknown>) {
  await expect(promessa).rejects.toBeInstanceOf(ErroAutorizacao);
}

const amanha = () => new Date(Date.now() + 86_400_000);

beforeEach(limparBanco);

describe("Estagiário TI não escala privilégio (backend)", () => {
  it("não atribui perfil administrativo a si mesmo, e a negativa é auditada", async () => {
    const e = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    await negado(
      atribuirPerfil(await ator(e.contaId), {
        colaboradorId: e.colaboradorId,
        perfil: "SUPERVISOR_TI",
        justificativa: "Tentativa de autopromoção",
      }),
    );
    expect(await prisma.perfilAtribuido.count({ where: { colaboradorId: e.colaboradorId, perfil: "SUPERVISOR_TI" } })).toBe(0);
    const evento = await prisma.eventoAuditoria.findFirstOrThrow({ where: { acao: "perfil.atribuir" } });
    expect(evento).toMatchObject({ resultado: "NEGADO", origemPermissao: "RESTRICAO_OBRIGATORIA" });
  });

  it("não concede a si mesmo a permissão de provisionamento", async () => {
    const e = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    await negado(
      concederPermissaoIndividual(await ator(e.contaId), {
        colaboradorId: e.colaboradorId,
        permissao: "provisionamento.executar",
        justificativa: "Autoconcessão indevida",
        validaAte: amanha(),
      }),
    );
    expect(await prisma.permissaoIndividual.count()).toBe(0);
  });

  it("não administra membros da TI (senha, bloqueio, perfis), mas atende colaboradores comuns", async () => {
    const e = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    const supervisor = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const comum = await criarPessoa({ ativada: true });
    const estagiario = await ator(e.contaId);

    await negado(redefinirSenhaPelaTi(estagiario, { colaboradorId: supervisor.colaboradorId, novaSenha: senhaAleatoria() }));
    await negado(alterarBloqueioConta(estagiario, { colaboradorId: supervisor.colaboradorId, bloquear: true }));
    const perfilSupervisor = await prisma.perfilAtribuido.findFirstOrThrow({ where: { colaboradorId: supervisor.colaboradorId } });
    await negado(revogarPerfil(estagiario, { perfilAtribuidoId: perfilSupervisor.id, justificativa: "Tentativa indevida" }));

    await redefinirSenhaPelaTi(estagiario, { colaboradorId: comum.colaboradorId, novaSenha: senhaAleatoria() });
    const contaComum = await prisma.contaAcesso.findUniqueOrThrow({ where: { id: comum.contaId } });
    expect(contaComum.senhaPessoalDefinidaEm).toBeNull(); // senha conhecida pela TI exige nova ativação
  });

  it("provisiona somente depois da concessão individual feita por administrador", async () => {
    const e = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    const g = await criarPessoa({ perfis: ["GESTOR_ADM"], ativada: true });
    const empresa = await criarEmpresa();
    const cadastro = (email: string) => ({
      nome: "Pessoa Provisionada",
      email,
      cargo: "Analista",
      departamento: "Obras",
      empresaId: empresa.id,
      senhaInicial: senhaAleatoria(),
      criarContaMicrosoft: true,
    });

    await negado(cadastrarPessoa(await ator(e.contaId), cadastro("p1@vallur.test")));
    expect(await prisma.colaborador.count({ where: { emailCorporativo: "p1@vallur.test" } })).toBe(0);

    await expect(
      concederPermissaoIndividual(await ator(g.contaId), {
        colaboradorId: e.colaboradorId,
        permissao: "provisionamento.executar",
        justificativa: "Cobertura de férias da equipe",
        validaAte: null,
      }),
    ).rejects.toBeInstanceOf(ErroNegocio); // validade obrigatória

    await concederPermissaoIndividual(await ator(g.contaId), {
      colaboradorId: e.colaboradorId,
      permissao: "provisionamento.executar",
      justificativa: "Cobertura de férias da equipe",
      validaAte: amanha(),
    });
    const r = await cadastrarPessoa(await ator(e.contaId), cadastro("p2@vallur.test"));
    expect(r.microsoft365).toMatchObject({ ok: true, simulado: true });
    const criado = await prisma.colaborador.findUniqueOrThrow({ where: { id: r.colaboradorId } });
    expect(criado.entraObjectId).toBeNull(); // simulação nunca grava identidade Microsoft
    const evento = await prisma.eventoAuditoria.findFirstOrThrow({
      where: { acao: "provisionamento.executar", resultado: "SUCESSO" },
    });
    expect(evento.simulado).toBe(true);
    expect(evento.origemPermissao).toMatch(/^INDIVIDUAL:/);
  });
});

describe("Supervisor TI e Gestor ADM: autoridade equivalente no backend", () => {
  it("ambos atribuem perfis administrativos e concedem permissões", async () => {
    for (const perfil of ["SUPERVISOR_TI", "GESTOR_ADM"] as const) {
      const admin = await criarPessoa({ perfis: [perfil], ativada: true });
      const alvo = await criarPessoa({ ativada: true });
      const r = await atribuirPerfil(await ator(admin.contaId), {
        colaboradorId: alvo.colaboradorId,
        perfil: perfil === "SUPERVISOR_TI" ? "GESTOR_ADM" : "SUPERVISOR_TI",
        justificativa: "Atribuição de teste equivalente",
      });
      expect(r.codigoAtivacao).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it("regra do último administrador impede revogar o único perfil administrativo", async () => {
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const perfil = await prisma.perfilAtribuido.findFirstOrThrow({ where: { colaboradorId: s.colaboradorId } });
    await expect(
      revogarPerfil(await ator(s.contaId), { perfilAtribuidoId: perfil.id, justificativa: "Autorrevogação do único admin" }),
    ).rejects.toThrow(/último administrador/);
  });
});

describe("senha inicial não concede acesso privilegiado (ativação segura)", () => {
  it("conta recém-criada pela TI fica em ativação pendente, sem nenhuma permissão", async () => {
    const p = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: false });
    const a = await ator(p.contaId, true);
    expect(a.estadoAcesso).toBe("ATIVACAO_PENDENTE");
    expect(a.perfisAtivos).toEqual([]);
    await negado(
      atribuirPerfil(a, { colaboradorId: p.colaboradorId, perfil: "GESTOR_ADM", justificativa: "Antes da ativação" }),
    );
  });

  it("perfil de TI exige o código de uso único; código errado conta tentativas e invalida no limite", async () => {
    const p = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: false });
    const { codigo } = await gerarCodigoAtivacao(prisma, p.contaId, null);

    await expect(definirSenhaPessoal(p.contaId, { novaSenha: senhaAleatoria() })).rejects.toThrow(/Código/);
    for (let i = 0; i < 5; i++) {
      await expect(definirSenhaPessoal(p.contaId, { novaSenha: senhaAleatoria(), codigo: "AAAA-BBBB-CCCC" })).rejects.toThrow(/Código/);
    }
    // 5 falhas: o código correto foi invalidado e não serve mais.
    await expect(definirSenhaPessoal(p.contaId, { novaSenha: senhaAleatoria(), codigo })).rejects.toThrow(/Código/);
    expect((await ator(p.contaId)).estadoAcesso).toBe("ATIVACAO_PENDENTE");
  });

  it("código correto é aceito uma única vez (sem replay) e a senha inicial não pode ser reaproveitada", async () => {
    const p = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: false });
    const { codigo } = await gerarCodigoAtivacao(prisma, p.contaId, null);
    await expect(definirSenhaPessoal(p.contaId, { novaSenha: p.senha, codigo })).rejects.toThrow(/diferente/);

    const situacao = await definirSenhaPessoal(p.contaId, { novaSenha: senhaAleatoria(), codigo });
    expect(situacao).toMatchObject({ precisaSenhaPessoal: false, precisaMfa: true });
    expect(await consumirCodigoAtivacao(prisma, p.contaId, codigo)).toBe(false);
    // Senha pessoal definida, mas sem MFA confirmado: perfis de TI ainda não valem.
    expect((await ator(p.contaId)).estadoAcesso).toBe("ATIVACAO_TI_PENDENTE");
  });

  it("código vencido é recusado", async () => {
    const p = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: false });
    const { codigo } = await gerarCodigoAtivacao(prisma, p.contaId, null);
    await prisma.codigoAtivacao.updateMany({ where: { contaId: p.contaId }, data: { expiraEm: new Date(Date.now() - 1000) } });
    expect(await consumirCodigoAtivacao(prisma, p.contaId, codigo)).toBe(false);
  });

  it("gerar novo código invalida o anterior", async () => {
    const p = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: false });
    const primeiro = await gerarCodigoAtivacao(prisma, p.contaId, null);
    await gerarCodigoAtivacao(prisma, p.contaId, null);
    expect(await consumirCodigoAtivacao(prisma, p.contaId, primeiro.codigo)).toBe(false);
  });

  it("colaborador sem perfil de TI ativa definindo a própria senha, sem código", async () => {
    const p = await criarPessoa({ ativada: false });
    await definirSenhaPessoal(p.contaId, { novaSenha: senhaAleatoria() });
    expect((await ator(p.contaId)).estadoAcesso).toBe("LIBERADO");
  });

  it("atribuir perfil de TI revoga as sessões do alvo e reinicia a ativação", async () => {
    const admin = await criarPessoa({ perfis: ["GESTOR_ADM"], ativada: true });
    const alvo = await criarPessoa({ ativada: true });
    await prisma.sessao.create({
      data: { id: "s1", token: "t1", userId: alvo.contaId, expiresAt: amanha() },
    });
    await atribuirPerfil(await ator(admin.contaId), {
      colaboradorId: alvo.colaboradorId,
      perfil: "ESTAGIARIO_TI",
      justificativa: "Entrada na equipe de TI",
    });
    expect(await prisma.sessao.count({ where: { userId: alvo.contaId } })).toBe(0);
    const a = await ator(alvo.contaId);
    expect(a.estadoAcesso).toBe("ATIVACAO_TI_PENDENTE");
    expect(a.perfisAtivos).toEqual([]);
  });
});

describe("isolamento de dados de colaboradores", () => {
  it("colaborador só lê a própria ficha", async () => {
    const a = await criarPessoa({ ativada: true });
    const b = await criarPessoa({ ativada: true });
    const atorA = await ator(a.contaId);
    expect((await obterPessoa(atorA, a.colaboradorId))?.id).toBe(a.colaboradorId);
    await negado(obterPessoa(atorA, b.colaboradorId));
  });

  it("equipamentos: colaborador vê só os seus; o inventário é só da TI", async () => {
    await semearInventarioTeste();
    const p = await criarPessoa({ id: PESSOAS[3].id, colaboradorExistente: true, ativada: true });
    const meus = await listarMeusEquipamentos(await ator(p.contaId));
    expect(meus.map((m) => m.patrimonio ?? m.nome).sort()).toEqual(["NBI4512C1", "VLR-004512", "VLR-004513", "VLR-004530"]);
    expect(meus.every((m) => m.situacao === "ALOCADO")).toBe(true);
    await negado(listarInventario(await ator(p.contaId)));

    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    expect((await listarInventario(await ator(s.contaId))).totalGeral).toBe(18);
  });
});

describe("senha nunca persistida em texto", () => {
  it("após o cadastro, a senha não aparece em nenhuma tabela", async () => {
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const empresa = await criarEmpresa();
    const senha = `Unica-${Date.now()}-Marcador`;
    await cadastrarPessoa(await ator(s.contaId), {
      nome: "Pessoa Rastreada",
      email: "rastreada@vallur.test",
      cargo: "Analista",
      departamento: "Obras",
      empresaId: empresa.id,
      senhaInicial: senha,
      criarContaMicrosoft: true,
    });
    const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    for (const { tablename } of tabelas) {
      const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        `SELECT count(*) AS total FROM "${tablename}" t WHERE t::text LIKE $1`,
        `%${senha}%`,
      );
      expect({ tablename, total: Number(total) }).toEqual({ tablename, total: 0 });
    }
  });
});
