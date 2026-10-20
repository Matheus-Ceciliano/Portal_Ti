/**
 * Componentes internos dos notebooks no banco: cadastro simples (só especificação), peças do
 * estoque (RAM001, SSD001, HDD001), instalação, remoção e substituição com histórico,
 * atualização da configuração sem contagem duplicada, concorrência, notebook alocado,
 * proibição de alocar peças a pessoas, permissões, auditoria e dados existentes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { carregarAtor, type Ator } from "@/server/authz/ator";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { prisma } from "@/server/db";
import { criarAlocacao } from "@/server/modulos/alocacoes";
import { instalarComponente, removerComponente, substituirComponente } from "@/server/modulos/componentes";
import { cadastrarEquipamento, editarEquipamento, listarInventario, obterEquipamento, type DadosEquipamento } from "@/server/modulos/inventario";
import { enviarParaManutencao } from "@/server/modulos/manutencoes";
import { transferirColaborador } from "@/server/modulos/transferencias";
import { MARCA, MODELO, PROCESSADOR } from "../apoio/catalogo";
import { criarEmpresa, criarPessoa, limparBanco } from "../apoio/fabricas";

async function ator(contaId: string): Promise<Ator> {
  const a = await carregarAtor(prisma, contaId, { mfaVerificado: true });
  if (!a) throw new Error("ator inexistente");
  return a;
}

let serie = 0;
const CONFIG = { memoria: { capacidadeGb: 16, tecnologia: "DDR4" }, armazenamento: [{ tipo: "SSD", capacidadeGb: 512, interfaceConexao: "NVMe/PCIe" }] };
const notebook = (empresaId: string, n = 5001, configuracao: unknown = CONFIG): DadosEquipamento => ({
  categoria: "NOTEBOOK",
  processadorId: PROCESSADOR.i5, // código 5: o identificador é gerado (NBI5001, NBI5002...)
  patrimonio: `VLR-9${n}`,
  empresaId,
  marcaId: MARCA.Dell,
  modeloId: MODELO.latitude5440,
  numeroSerie: `SIM-N${n}-${++serie}`,
  configuracao,
});
const peca = (empresaId: string, categoria: "MEMORIA_RAM" | "SSD" | "HD", capacidadeGb: number, extra: Partial<DadosEquipamento> = {}): DadosEquipamento => ({
  categoria,
  empresaId,
  capacidadeGb,
  tecnologia: categoria === "MEMORIA_RAM" ? "DDR4" : null,
  interfaceConexao: categoria === "SSD" ? "NVMe/PCIe" : categoria === "HD" ? "SATA" : null,
  formato: categoria === "MEMORIA_RAM" ? "SO-DIMM" : categoria === "SSD" ? "M.2 2280" : '2,5"',
  marcaId: MARCA.Kingston,
  modeloId: categoria === "MEMORIA_RAM" ? MODELO.furyRam : categoria === "SSD" ? MODELO.furySsd : MODELO.furyHd,
  ...extra,
});

async function cenario() {
  const empresa = await criarEmpresa();
  const supervisor = await ator((await criarPessoa({ perfis: ["SUPERVISOR_TI"], ativada: true })).contaId);
  const pessoa = await criarPessoa({ ativada: true });
  return { empresa, supervisor, pessoa };
}

const ficha = (id: string) => prisma.ativo.findUniqueOrThrow({ where: { id } });
const vigentes = (equipamentoId: string) => prisma.pecaConfiguracao.findMany({ where: { equipamentoId, vigente: true }, orderBy: { instaladaEm: "asc" } });
const componentesFisicos = () => prisma.ativo.count({ where: { categoria: { in: ["MEMORIA_RAM", "SSD", "HD"] } } });

beforeEach(limparBanco);

describe("cadastro simples do notebook", () => {
  it("guarda só a especificação: nenhuma peça física, nenhum estoque fictício; C1 continua automático", async () => {
    const { empresa, supervisor } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id) });
    const a = await ficha(nb.id);
    expect([a.memoriaRam, a.armazenamento, a.processador]).toEqual(["16 GB DDR4", "SSD NVMe/PCIe 512 GB", "Intel Core i5"]);
    expect(await componentesFisicos()).toBe(0);
    const pecas = await vigentes(nb.id);
    expect(pecas.map((p) => [p.tipo, p.capacidadeGb, p.original, p.componenteId])).toEqual([
      ["MEMORIA_RAM", 16, true, null],
      ["SSD", 512, true, null],
    ]);
    expect(await prisma.ativo.findFirstOrThrow({ where: { notebookId: nb.id } })).toMatchObject({ nomeDispositivo: "NBI5001.C1", categoria: "CARREGADOR" });
    expect(await prisma.intervencaoConfiguracao.count({ where: { equipamentoId: nb.id, tipo: "CONFIGURACAO_ORIGINAL" } })).toBe(1);

    // Sem configuração: nada é inventado.
    const vazio = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5002, null) });
    expect(await ficha(vazio.id)).toMatchObject({ memoriaRam: null, armazenamento: null });
    expect(await vigentes(vazio.id)).toHaveLength(0);
    expect(await componentesFisicos()).toBe(0);

    // SSD e HD juntos.
    const ambos = await cadastrarEquipamento(supervisor, {
      dados: notebook(empresa.id, 5003, { memoria: { capacidadeGb: 8, tecnologia: null }, armazenamento: [{ tipo: "SSD", capacidadeGb: 256, interfaceConexao: "SATA" }, { tipo: "HD", capacidadeGb: 1000, interfaceConexao: null }] }),
    });
    expect((await ficha(ambos.id)).armazenamento).toBe("SSD SATA 256 GB + HD 1 TB");
    await expect(cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5004, { memoria: { capacidadeGb: 16, tecnologia: "DDR9" }, armazenamento: [] }) })).rejects.toThrow(/Tecnologia/);
  });
});

describe("peças no estoque", () => {
  it("RAM, SSD e HD com identificação automática e sequências próprias; sem patrimônio; validação no servidor", async () => {
    const { empresa, supervisor } = await cenario();
    const ram1 = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 16, { frequenciaMhz: "3200", numeroSerie: "km-001" }) });
    const ssd1 = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "SSD", 512) });
    const hd1 = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "HD", 1000) });
    const ram2 = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    const nomes = await Promise.all([ram1, ssd1, hd1, ram2].map(async (c) => (await ficha(c.id)).nomeDispositivo));
    expect(nomes).toEqual(["RAM001", "SSD001", "HDD001", "RAM002"]);
    expect(await ficha(ram1.id)).toMatchObject({ patrimonio: null, situacao: "DISPONIVEL", capacidadeGb: 16, tecnologia: "DDR4", formato: "SO-DIMM", frequenciaMhz: 3200, numeroSerie: "KM-001" });
    // Cadastros simultâneos não repetem número.
    const juntos = await Promise.all([1, 2, 3].map(() => cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "SSD", 256) })));
    expect(new Set(await Promise.all(juntos.map(async (c) => (await ficha(c.id)).nomeDispositivo))).size).toBe(3);

    await expect(cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 0) })).rejects.toThrow(/capacidade/);
    await expect(cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "SSD", 512, { interfaceConexao: "USB" }) })).rejects.toThrow(/Interface/);
    await expect(cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8, { numeroSerie: "KM-001" }) })).rejects.toThrow(/série já está cadastrado/);
  });
});

describe("instalação, substituição e remoção", () => {
  async function preparado() {
    const base = await cenario();
    const nb = await cadastrarEquipamento(base.supervisor, { dados: notebook(base.empresa.id) });
    return { ...base, nb };
  }

  it("instalar soma à configuração; substituir não duplica; remover devolve ao estoque; histórico com antes e depois", async () => {
    const { empresa, supervisor, nb } = await preparado();
    const extra = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) }); // RAM001
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: extra.id, motivo: "Upgrade" });
    expect((await ficha(nb.id)).memoriaRam).toBe("24 GB DDR4");
    expect(await ficha(extra.id)).toMatchObject({ situacao: "INSTALADO" });

    // Substituição da peça original (sem identificação): a nova entra no lugar dela.
    const [original] = (await vigentes(nb.id)).filter((p) => p.original && p.tipo === "MEMORIA_RAM");
    const grande = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 16) }); // RAM002
    const r = await substituirComponente(supervisor, { notebookId: nb.id, pecaId: original.id, componenteId: grande.id, motivo: "Memória original com defeito" });
    expect(r).toMatchObject({ anterior: "RAM 24 GB DDR4 · SSD NVMe/PCIe 512 GB", resultante: "RAM 24 GB DDR4 · SSD NVMe/PCIe 512 GB" });
    const antiga = await prisma.pecaConfiguracao.findUniqueOrThrow({ where: { id: original.id } });
    expect(antiga).toMatchObject({ vigente: null, componenteId: null, destinoRemocao: null, motivoRemocao: "Memória original com defeito" });
    expect(await componentesFisicos()).toBe(2); // nenhum código inventado para a peça original

    // Substituição de peça identificada: a removida volta ao estoque.
    const maior = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 32) }); // RAM003
    const linhaExtra = (await vigentes(nb.id)).find((p) => p.componenteId === extra.id)!;
    await substituirComponente(supervisor, { notebookId: nb.id, pecaId: linhaExtra.id, componenteId: maior.id, motivo: "Upgrade", destino: "DISPONIVEL" });
    expect((await ficha(nb.id)).memoriaRam).toBe("48 GB DDR4"); // 16 (RAM002) + 32 (RAM003)
    expect((await ficha(extra.id)).situacao).toBe("DISPONIVEL");

    // Remoção com destino manutenção: abre a manutenção da peça.
    const linhaMaior = (await vigentes(nb.id)).find((p) => p.componenteId === maior.id)!;
    await removerComponente(supervisor, { notebookId: nb.id, pecaId: linhaMaior.id, motivo: "Erro de memória", destino: "MANUTENCAO" });
    expect((await ficha(maior.id)).situacao).toBe("MANUTENCAO");
    expect(await prisma.manutencao.count({ where: { ativoId: maior.id, aberta: true } })).toBe(1);
    expect((await ficha(nb.id)).memoriaRam).toBe("16 GB DDR4");

    // Baixa.
    const linhaGrande = (await vigentes(nb.id)).find((p) => p.componenteId === grande.id)!;
    await removerComponente(supervisor, { notebookId: nb.id, pecaId: linhaGrande.id, motivo: "Queimada", destino: "BAIXADO" });
    expect((await ficha(grande.id)).situacao).toBe("BAIXADO");
    expect((await ficha(nb.id)).memoriaRam).toBeNull(); // sem memória registrada: a ficha não mantém dado contraditório

    // Histórico completo e imutável.
    const historico = await prisma.intervencaoConfiguracao.findMany({ where: { equipamentoId: nb.id }, orderBy: { realizadaEm: "asc" } });
    expect(historico.map((h) => h.tipo)).toEqual(["CONFIGURACAO_ORIGINAL", "INSTALACAO", "SUBSTITUICAO", "SUBSTITUICAO", "REMOCAO", "REMOCAO"]);
    expect(historico.every((h) => h.realizadaPorNome === supervisor.nome)).toBe(true);
    await expect(prisma.intervencaoConfiguracao.deleteMany()).rejects.toThrow();
    await expect(prisma.pecaConfiguracao.update({ where: { id: original.id }, data: { motivoRemocao: "x" } })).rejects.toThrow();
    expect(await prisma.eventoAuditoria.count({ where: { acao: { startsWith: "ativo.componente_" }, resultado: "SUCESSO" } })).toBe(5);
  });

  it("peça original removida que entra no estoque é identificada só nesse momento; nova peça cadastrada na própria instalação", async () => {
    const { supervisor, nb } = await preparado();
    const [ssd] = (await vigentes(nb.id)).filter((p) => p.tipo === "SSD");
    const r = await substituirComponente(supervisor, {
      notebookId: nb.id,
      pecaId: ssd.id,
      novoComponente: { categoria: "SSD", capacidadeGb: 1000, interfaceConexao: "NVMe/PCIe", formato: "M.2 2280", marcaId: MARCA.Samsung, modeloId: MODELO.samsung990 },
      motivo: "Upgrade de armazenamento",
      destino: "DISPONIVEL",
      registrarRemovida: { marcaId: MARCA["SK Hynix"], modeloId: MODELO.hynixPc801, formato: "M.2 2280" },
    });
    expect(r).toMatchObject({ instalado: "SSD001", registrado: "SSD002", resultante: "RAM 16 GB DDR4 · SSD NVMe/PCIe 1 TB" });
    expect((await ficha(nb.id)).armazenamento).toBe("SSD NVMe/PCIe 1 TB");
    const registrada = await prisma.ativo.findUniqueOrThrow({ where: { nomeDispositivo: "SSD002" } });
    expect(registrada).toMatchObject({ situacao: "DISPONIVEL", capacidadeGb: 512, interfaceConexao: "NVMe/PCIe", marca: "SK Hynix" });
    expect(await prisma.pecaConfiguracao.findUniqueOrThrow({ where: { id: ssd.id } })).toMatchObject({ vigente: null, componenteId: registrada.id, destinoRemocao: "DISPONIVEL" });
    // HD no lugar de SSD é permitido; memória no lugar de armazenamento, não.
    const linha = (await vigentes(nb.id)).find((p) => p.tipo === "SSD")!;
    await expect(
      substituirComponente(supervisor, { notebookId: nb.id, pecaId: linha.id, novoComponente: { categoria: "MEMORIA_RAM", capacidadeGb: 8, marcaId: MARCA.Kingston, modeloId: MODELO.furyRam }, motivo: "z", destino: "DISPONIVEL" }),
    ).rejects.toThrow(/memória por memória/);
  });

  it("exige motivo e destino; a mesma peça não é removida duas vezes; notebook baixado não recebe intervenção", async () => {
    const { empresa, supervisor, nb } = await preparado();
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id });
    const linha = (await vigentes(nb.id)).find((p) => p.componenteId === ram.id)!;
    await expect(removerComponente(supervisor, { notebookId: nb.id, pecaId: linha.id, motivo: " ", destino: "DISPONIVEL" })).rejects.toThrow(/motivo/);
    await expect(removerComponente(supervisor, { notebookId: nb.id, pecaId: linha.id, motivo: "Troca" })).rejects.toThrow(/destino/);
    const duas = await Promise.allSettled([1, 2].map(() => removerComponente(supervisor, { notebookId: nb.id, pecaId: linha.id, motivo: "Troca", destino: "DISPONIVEL" })));
    expect(duas.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.intervencaoConfiguracao.count({ where: { tipo: "REMOCAO" } })).toBe(1);
    await prisma.ativo.update({ where: { id: nb.id }, data: { situacao: "BAIXADO" } });
    await expect(instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id })).rejects.toThrow(/baixado/);
  });

  it("uma peça nunca fica em dois notebooks, nem com instalações simultâneas", async () => {
    const { empresa, supervisor } = await cenario();
    const a = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5101) });
    const b = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5102) });
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    const r = await Promise.allSettled([a, b].map((n) => instalarComponente(supervisor, { notebookId: n.id, componenteId: ram.id })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/não está disponível|outro equipamento/);
    expect(await prisma.pecaConfiguracao.count({ where: { componenteId: ram.id, vigente: true } })).toBe(1);
    // Mesmo pelo banco: o índice único impede a segunda linha vigente.
    const outro = (await vigentes(a.id)).length ? b : a;
    const qualquer = await prisma.intervencaoConfiguracao.findFirstOrThrow({ where: { equipamentoId: outro.id } });
    await expect(
      prisma.pecaConfiguracao.create({
        data: { equipamentoId: outro.id, tipo: "MEMORIA_RAM", componenteId: ram.id, capacidadeGb: 8, instaladaEm: new Date(), instaladaPorNome: "x", instaladaNaId: qualquer.id },
      }),
    ).rejects.toThrow();
  });
});

describe("pessoas e notebook alocado", () => {
  it("RAM, SSD e HD nunca são alocados a pessoas (servidor e banco)", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    await expect(criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [ram.id], modo: "ENTREGAR" })).rejects.toThrow(/não são alocados a pessoas/);
    await expect(transferirColaborador(supervisor, { ativoId: ram.id, colaboradorId: pessoa.colaboradorId, modo: "ENTREGAR", alocacaoAtualId: null })).rejects.toThrow(/não são alocados a pessoas/);
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5201) });
    const alo = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id], modo: "ENTREGAR" });
    await expect(prisma.itemAlocacao.create({ data: { alocacaoId: alo.id, ativoId: ram.id, empresaProprietariaId: empresa.id } })).rejects.toThrow(/não são alocados a pessoas/);
    await expect(enviarParaManutencao(supervisor, { ativoId: ram.id, motivo: "x", observacoes: "y" })).resolves.toBeTruthy(); // em estoque pode ir para manutenção
  });

  it("intervenção em notebook alocado exige confirmação e não encerra a alocação", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id) });
    const alo = await criarAlocacao(supervisor, { responsavelTiContaId: supervisor.contaId, colaboradorId: pessoa.colaboradorId, ativoIds: [nb.id], modo: "ENTREGAR" });
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 16) });
    await expect(instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id })).rejects.toThrow(/Confirme que ele está disponível/);
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id, confirmacaoIntervencao: true, motivo: "Upgrade" });
    expect(await prisma.alocacao.findUniqueOrThrow({ where: { id: alo.id } })).toMatchObject({ estado: "ATIVA" });
    expect(await prisma.itemAlocacao.count({ where: { ativoId: nb.id, aberto: true, alocacaoId: alo.id } })).toBe(1);
    expect(await prisma.itemAlocacao.count({ where: { ativoId: ram.id } })).toBe(0); // a peça não vira alocação
    const i = await prisma.intervencaoConfiguracao.findFirstOrThrow({ where: { equipamentoId: nb.id, tipo: "INSTALACAO" } });
    expect(i).toMatchObject({ alocacaoNumero: alo.numero });
    expect(i.colaboradorNome).toBeTruthy();
    // Peça instalada não vai direto para manutenção nem muda de especificação.
    await expect(enviarParaManutencao(supervisor, { ativoId: ram.id, motivo: "x", observacoes: "y" })).rejects.toThrow(/instalado em um notebook/);
    await expect(editarEquipamento(supervisor, { id: ram.id, dados: peca(empresa.id, "MEMORIA_RAM", 32) })).rejects.toThrow(/remova-o do notebook/);
    await editarEquipamento(supervisor, { id: ram.id, dados: peca(empresa.id, "MEMORIA_RAM", 16, { modeloId: MODELO.furyBeast }) });
    expect((await ficha(ram.id)).modelo).toBe("Fury Beast");
  });
});

describe("dados existentes e configuração original", () => {
  it("notebook antigo (só a ficha escrita): vincular soma à memória da ficha, sem criar peça a partir do texto", async () => {
    const { empresa, supervisor } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id, 5301, null) });
    await prisma.ativo.update({ where: { id: nb.id }, data: { memoriaRam: "8 GB", armazenamento: "SSD 256 GB" } }); // como os cadastros antigos
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    // Edição sem a configuração não apaga o texto.
    await editarEquipamento(supervisor, { id: nb.id, dados: { ...notebook(empresa.id, 5301, null), modeloId: MODELO.latitude3540 } });
    expect(await ficha(nb.id)).toMatchObject({ memoriaRam: "8 GB", armazenamento: "SSD 256 GB", modelo: "Latitude 3540" });

    // A ficha antiga conta como configuração original: 8 GB + RAM001 (8 GB) = 16 GB.
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id });
    expect(await ficha(nb.id)).toMatchObject({ memoriaRam: "16 GB DDR4", armazenamento: "SSD 256 GB" });
    expect(await componentesFisicos()).toBe(1); // só a RAM001: nada criado a partir do texto
    const historico = await prisma.intervencaoConfiguracao.findMany({ where: { equipamentoId: nb.id }, orderBy: { criadaEm: "asc" } });
    expect(historico.map((h) => [h.tipo, h.configuracaoAnterior, h.configuracaoResultante])).toEqual([
      ["CONFIGURACAO_ORIGINAL", "RAM 8 GB · SSD 256 GB", "RAM 8 GB · SSD 256 GB"],
      ["INSTALACAO", "RAM 8 GB · SSD 256 GB", "RAM 16 GB DDR4 · SSD 256 GB"],
    ]);
    const f = await obterEquipamento(supervisor, nb.id);
    expect(f.componentesInternos).toMatchObject({ estruturada: true, podeAjustarOriginal: false, resumo: { memoria: "16 GB DDR4" } });
    expect(f.componentesInternos!.pecas.map((p) => [p.descricao, p.original, p.componente?.nome ?? null])).toEqual([
      ["8 GB", true, null],
      ["8 GB DDR4", false, "RAM001"],
      ["SSD 256 GB", true, null],
    ]); // agrupadas por tipo
  });

  it("a configuração original se corrige pela edição até a primeira intervenção; depois, só pelos componentes", async () => {
    const { empresa, supervisor } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id) });
    const ajuste = { memoria: { capacidadeGb: 32, tecnologia: "DDR5" }, armazenamento: [{ tipo: "SSD", capacidadeGb: 1000, interfaceConexao: "NVMe/PCIe" }] };
    await editarEquipamento(supervisor, { id: nb.id, dados: notebook(empresa.id, 5001, ajuste) });
    expect(await ficha(nb.id)).toMatchObject({ memoriaRam: "32 GB DDR5", armazenamento: "SSD NVMe/PCIe 1 TB" });
    expect(await prisma.pecaConfiguracao.count({ where: { equipamentoId: nb.id } })).toBe(4); // 2 encerradas + 2 vigentes
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id });
    await expect(editarEquipamento(supervisor, { id: nb.id, dados: notebook(empresa.id, 5001, CONFIG) })).rejects.toThrow(/intervenções/);
  });
});

describe("lista do inventário", () => {
  it("equipamentos e componentes em listas e números separados; filtros por capacidade e notebook", async () => {
    const { empresa, supervisor } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id) });
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 16) });
    await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "SSD", 512) });
    await instalarComponente(supervisor, { notebookId: nb.id, componenteId: ram.id });

    const equipamentos = await listarInventario(supervisor);
    expect(equipamentos.linhas.map((l) => l.nome)).toEqual(["NBI5001", "NBI5001.C1"]); // peças internas ficam no outro grupo
    expect(equipamentos.indicadores.total).toBe(2); // notebook e carregador

    const componentes = await listarInventario(supervisor, { grupo: "componentes" });
    expect(componentes.linhas.map((l) => [l.nome, l.especificacao, l.situacao, l.instaladoEm?.nome ?? null])).toEqual([
      ["RAM001", "16 GB DDR4", "INSTALADO", "NBI5001"],
      ["SSD001", "SSD NVMe/PCIe 512 GB", "DISPONIVEL", null],
    ]);
    expect(componentes.indicadores).toMatchObject({ total: 2, instalados: 1, disponiveis: 1, alocados: 0 });
    expect(componentes.capacidades).toEqual([16, 512]);
    expect(componentes.notebooks).toEqual([{ id: nb.id, nome: "NBI5001" }]);
    expect((await listarInventario(supervisor, { grupo: "componentes", capacidadeGb: 512 })).linhas.map((l) => l.nome)).toEqual(["SSD001"]);
    expect((await listarInventario(supervisor, { grupo: "componentes", notebookId: nb.id })).linhas.map((l) => l.nome)).toEqual(["RAM001"]);
    expect((await listarInventario(supervisor, { grupo: "componentes", busca: "ram001" })).total).toBe(1);
  });
});

describe("permissões", () => {
  it("colaborador comum não cadastra peças nem intervém; o Estagiário TI opera", async () => {
    const { empresa, supervisor, pessoa } = await cenario();
    const nb = await cadastrarEquipamento(supervisor, { dados: notebook(empresa.id) });
    const ram = await cadastrarEquipamento(supervisor, { dados: peca(empresa.id, "MEMORIA_RAM", 8) });
    const comum = await ator(pessoa.contaId);
    await expect(cadastrarEquipamento(comum, { dados: peca(empresa.id, "SSD", 256) })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(instalarComponente(comum, { notebookId: nb.id, componenteId: ram.id })).rejects.toBeInstanceOf(ErroAutorizacao);
    await expect(editarEquipamento(comum, { id: nb.id, dados: notebook(empresa.id, 5001, CONFIG) })).rejects.toBeInstanceOf(ErroAutorizacao);
    expect(await prisma.eventoAuditoria.count({ where: { resultado: "NEGADO", atorContaId: pessoa.contaId } })).toBeGreaterThanOrEqual(3);
    const estagiario = await ator((await criarPessoa({ perfis: ["ESTAGIARIO_TI"], ativada: true })).contaId);
    await instalarComponente(estagiario, { notebookId: nb.id, componenteId: ram.id });
    expect((await ficha(nb.id)).memoriaRam).toBe("24 GB DDR4");
  });
});
