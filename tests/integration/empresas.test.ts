/** Cadastro de empresas no servidor: permissão, CNPJ, duplicidade, logotipo e detalhes. */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao, ErroNegocio } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { concederPermissaoIndividual } from "@/server/modulos/perfis";
import { obterResumoEmpresa } from "@/server/modulos/empresa-registros";
import { lerLogoEmpresa, salvarEmpresa } from "@/server/modulos/empresas";
import { criarPessoa, limparBanco } from "../apoio/fabricas";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

const dados = (extra: Partial<Parameters<typeof salvarEmpresa>[1]["dados"]> = {}) => ({
  nome: `Empresa Teste ${randomUUID().slice(0, 6)}`,
  sigla: `T${randomUUID().slice(0, 4).toUpperCase()}`,
  cnpj: "11.222.333/0001-81",
  cidade: "Belo Horizonte",
  ativa: true,
  ...extra,
});

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

beforeEach(limparBanco);

describe("empresas", () => {
  it("Estagiário não cadastra empresa sem concessão; com concessão, cadastra", async () => {
    const estagiario = await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true });
    const gestor = await criarPessoa({ perfis: ["GESTOR_ADM"], ativada: true });
    await expect(salvarEmpresa(await ator(estagiario.contaId), { dados: dados() })).rejects.toBeInstanceOf(ErroAutorizacao);

    await concederPermissaoIndividual(await ator(gestor.contaId), {
      colaboradorId: estagiario.colaboradorId,
      permissao: "empresa.gerenciar",
      justificativa: "Atualização do cadastro de empresas",
      validaAte: null,
    });
    const r = await salvarEmpresa(await ator(estagiario.contaId), { dados: dados() });
    const salva = await prisma.empresa.findUniqueOrThrow({ where: { id: r.id } });
    expect(salva.cnpj).toBe("11222333000181"); // forma canônica
    expect(await prisma.eventoAuditoria.count({ where: { acao: "empresa.criar", resultado: "SUCESSO" } })).toBe(1);
  });

  it("valida CNPJ no servidor e recusa duplicidade", async () => {
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const a = await ator(s.contaId);
    await expect(salvarEmpresa(a, { dados: dados({ cnpj: "11.222.333/0001-80" }) })).rejects.toThrow(/dígitos verificadores/);
    await salvarEmpresa(a, { dados: dados() });
    await expect(salvarEmpresa(a, { dados: dados() })).rejects.toThrow(/mesmo CNPJ|esse CNPJ/);
    await expect(salvarEmpresa(a, { dados: dados({ cnpj: "12.ABC.345/01DE-35" }) })).resolves.toBeTruthy();
  });

  it("aceita logotipo PNG real, recusa SVG e serve o arquivo só com empresa.ver", async () => {
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const a = await ator(s.contaId);
    await expect(
      salvarEmpresa(a, { dados: dados(), logo: Buffer.from("<svg onload=alert(1)></svg>") }),
    ).rejects.toBeInstanceOf(ErroNegocio);

    const r = await salvarEmpresa(a, { dados: dados(), logo: PNG });
    const logo = await lerLogoEmpresa(a, r.id);
    expect(logo?.tipo).toBe("image/png");
    expect(logo?.dados.equals(PNG)).toBe(true);

    const colaborador = await criarPessoa({ ativada: true });
    await expect(lerLogoEmpresa(await ator(colaborador.contaId), r.id)).rejects.toBeInstanceOf(ErroAutorizacao);

    // Remover o logotipo apaga o arquivo do armazenamento.
    await salvarEmpresa(a, { id: r.id, dados: { ...dados(), nome: "Outro Nome Ltda.", sigla: "ONL", cnpj: "00.000.000/0001-91" }, removerLogo: true });
    expect(await lerLogoEmpresa(a, r.id)).toBeNull();
  });

  it("resumo: colaborador não acessa; administrador vê os números da empresa", async () => {
    const s = await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true });
    const r = await salvarEmpresa(await ator(s.contaId), { dados: dados() });
    const colaborador = await criarPessoa({ ativada: true });
    await expect(obterResumoEmpresa(await ator(colaborador.contaId), r.id)).rejects.toBeInstanceOf(ErroAutorizacao);

    await prisma.colaborador.update({ where: { id: colaborador.colaboradorId }, data: { empresaId: r.id } });
    const resumo = await obterResumoEmpresa(await ator(s.contaId), r.id);
    expect(resumo.empresa.pessoasAtivas).toBe(1);
    expect(resumo.colaboradores).toMatchObject({ total: 1, ativos: 1 });
  });
});
