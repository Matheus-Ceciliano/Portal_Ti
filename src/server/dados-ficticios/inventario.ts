/**
 * DADOS FICTÍCIOS do inventário para desenvolvimento e testes: patrimônios, séries (SIM-…) e
 * nomes de dispositivo inventados. Gravados no banco por `semearInventario`, com histórico
 * coerente (cadastro, entrega, reserva, devolução e manutenção). Nenhum termo é gravado como
 * assinado: "assinado" exige o PDF assinado guardado.
 */
import type { CategoriaAtivo, Prisma, SituacaoAtivo } from "@/generated/prisma/client";
import { nomeCarregador } from "@/lib/inventario";
import type { prisma as clientePrisma } from "@/server/db";
import { vincularCatalogosPorTexto } from "@/server/modulos/catalogos-texto";
import { EMPRESAS, PESSOAS } from "./cadastros";

const idAtivo = (n: number) => `c3a9e1b4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const idCarregador = (n: number) => `c3a9e1b4-0000-4000-8100-${String(n).padStart(12, "0")}`;
const [HZE, PBC, RCI, ASA] = EMPRESAS.map((e) => e.id);
const p = (i: number) => PESSOAS[i];
const OPERADOR = "Carga inicial (dados fictícios)";
const dia = (d: string, hora = "09:00") => new Date(`${d}T${hora}:00-03:00`);

type Semente = {
  n: number;
  patrimonio: string;
  categoria: CategoriaAtivo;
  marca: string;
  modelo: string;
  serie: string;
  empresaId: string;
  nome?: string;
  config?: { processador: string; memoriaRam: string; armazenamento: string; sistemaOperacional: string };
  aquisicao?: string;
};

const NB_I5 = { processador: "Intel Core i5-1345U", memoriaRam: "16 GB", armazenamento: "SSD 512 GB", sistemaOperacional: "Windows 11 Pro" };
const NB_I3 = { processador: "Intel Core i3-1215U", memoriaRam: "8 GB", armazenamento: "SSD 256 GB", sistemaOperacional: "Windows 11 Pro" };
const CEL = { processador: "Octa-core", memoriaRam: "8 GB", armazenamento: "128 GB", sistemaOperacional: "Android 14" };

export const SEMENTES: Semente[] = [
  { n: 1, patrimonio: "VLR-004512", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 5440", serie: "SIM-7K2P9Q1", empresaId: HZE, nome: "NBI4512", config: NB_I5, aquisicao: "2026-02-20" },
  { n: 2, patrimonio: "VLR-004513", categoria: "MONITOR", marca: "LG", modelo: "24MP400 24\"", serie: "SIM-310ZK88", empresaId: HZE },
  { n: 3, patrimonio: "VLR-004530", categoria: "KIT_TECLADO_MOUSE", marca: "Logitech", modelo: "MK270", serie: "SIM-MK27011", empresaId: HZE },
  { n: 4, patrimonio: "VLR-004601", categoria: "NOTEBOOK", marca: "Lenovo", modelo: "ThinkPad E14 Gen 6", serie: "SIM-PF4XZ02", empresaId: PBC, nome: "NBI4601", config: NB_I5, aquisicao: "2026-04-10" },
  { n: 5, patrimonio: "VLR-004602", categoria: "CELULAR", marca: "Samsung", modelo: "Galaxy A35", serie: "SIM-R58W3KQ", empresaId: PBC, config: CEL },
  { n: 6, patrimonio: "VLR-004377", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 3540", serie: "SIM-9H1LM07", empresaId: ASA, nome: "NBI4377", config: NB_I3, aquisicao: "2025-10-01" },
  { n: 7, patrimonio: "VLR-004378", categoria: "HEADSET", marca: "Jabra", modelo: "Evolve2 30", serie: "SIM-JB30A55", empresaId: ASA },
  { n: 8, patrimonio: "VLR-004390", categoria: "NOTEBOOK", marca: "Lenovo", modelo: "ThinkPad E14 Gen 6", serie: "SIM-PF4XZ19", empresaId: ASA, nome: "NBI4390", config: NB_I5 },
  { n: 9, patrimonio: "VLR-004644", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 5440", serie: "SIM-7K2P9R4", empresaId: RCI, nome: "NBI4644", config: NB_I5, aquisicao: "2026-09-25" },
  { n: 10, patrimonio: "VLR-004645", categoria: "CELULAR", marca: "Motorola", modelo: "Moto G85", serie: "SIM-ZY22H0C", empresaId: RCI, config: CEL },
  { n: 11, patrimonio: "VLR-004410", categoria: "DESKTOP", marca: "Dell", modelo: "OptiPlex 7010", serie: "SIM-OP7010B", empresaId: PBC, config: NB_I5 },
  { n: 12, patrimonio: "VLR-004650", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 5440", serie: "SIM-7K2P9S8", empresaId: ASA, nome: "NBI4650", config: NB_I5, aquisicao: "2026-09-25" },
  { n: 13, patrimonio: "VLR-004651", categoria: "MONITOR", marca: "Dell", modelo: "P2422H 24\"", serie: "SIM-P2422H3", empresaId: ASA },
  { n: 14, patrimonio: "VLR-004652", categoria: "CELULAR", marca: "Samsung", modelo: "Galaxy A35", serie: "SIM-R58W3M1", empresaId: HZE, config: CEL },
  { n: 15, patrimonio: "VLR-004199", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 3420", serie: "SIM-3420OLD", empresaId: RCI, nome: "NBI4199", config: NB_I3 },
  { n: 16, patrimonio: "VLR-004588", categoria: "NOTEBOOK", marca: "Lenovo", modelo: "IdeaPad 3", serie: "SIM-IDP3K21", empresaId: RCI, nome: "NBI4588", config: NB_I3 },
  { n: 17, patrimonio: "VLR-004589", categoria: "CELULAR", marca: "Motorola", modelo: "Moto G85", serie: "SIM-ZY22G9A", empresaId: PBC, config: CEL },
  { n: 18, patrimonio: "VLR-004590", categoria: "NOTEBOOK", marca: "Dell", modelo: "Latitude 3540", serie: "SIM-9H1LN33", empresaId: HZE, nome: "NBI4590", config: NB_I3 },
];

/** Entregas e reservas (o carregador C1 acompanha cada notebook). */
type Entrega = { numero: string; pessoa: number; itens: number[]; estado: "ATIVA" | "RESERVADA"; data: string; ter?: { numero: string; estado: "EMITIDO" | "AGUARDANDO_ASSINATURA" } };

export const ENTREGAS: Entrega[] = [
  { numero: "ALO-2025-0012", pessoa: 0, itens: [6, 7], estado: "ATIVA", data: "2025-11-18" },
  { numero: "ALO-2026-0003", pessoa: 1, itens: [8], estado: "ATIVA", data: "2026-01-09" },
  { numero: "ALO-2026-0006", pessoa: 11, itens: [18], estado: "ATIVA", data: "2026-02-20" },
  { numero: "ALO-2026-0009", pessoa: 3, itens: [1, 2, 3], estado: "ATIVA", data: "2026-03-12", ter: { numero: "TER-2026-0088", estado: "AGUARDANDO_ASSINATURA" } },
  { numero: "ALO-2026-0011", pessoa: 9, itens: [16], estado: "ATIVA", data: "2026-04-15" },
  { numero: "ALO-2026-0014", pessoa: 4, itens: [4, 5], estado: "ATIVA", data: "2026-05-04", ter: { numero: "TER-2026-0102", estado: "AGUARDANDO_ASSINATURA" } },
  { numero: "ALO-2026-0017", pessoa: 10, itens: [17], estado: "ATIVA", data: "2026-06-02" },
  { numero: "ALO-2026-0031", pessoa: 7, itens: [9], estado: "RESERVADA", data: "2026-10-23", ter: { numero: "TER-2026-0131", estado: "EMITIDO" } },
  { numero: "ALO-2026-0032", pessoa: 8, itens: [10], estado: "RESERVADA", data: "2026-10-24", ter: { numero: "TER-2026-0132", estado: "EMITIDO" } },
];

/** Entregas já devolvidas (com TDV): uma baixada sem conserto e uma em manutenção. */
type Devolvida = {
  alocacao: string;
  pessoa: number;
  item: number;
  entregue: string;
  devolucao: { numero: string; data: string; estadoFisico: "REGULAR" | "DANIFICADO"; observacoes: string; tdv: string };
  baixadoEm?: string;
};

export const DEVOLVIDAS: Devolvida[] = [
  {
    alocacao: "ALO-2025-0004",
    pessoa: 9,
    item: 15,
    entregue: "2025-03-10",
    devolucao: { numero: "DEV-2026-0007", data: "2026-08-21", estadoFisico: "DANIFICADO", observacoes: "Placa-mãe com defeito; não liga.", tdv: "TDV-2026-0019" },
    baixadoEm: "2026-08-28",
  },
  {
    alocacao: "ALO-2025-0009",
    pessoa: 5,
    item: 11,
    entregue: "2025-09-01",
    devolucao: { numero: "DEV-2026-0009", data: "2026-10-02", estadoFisico: "REGULAR", observacoes: "Não liga após queda de energia.", tdv: "TDV-2026-0021" },
  },
];

const CONTADORES: Record<string, number> = { "ALO-2025": 12, "ALO-2026": 32, "DEV-2026": 9, "TER-2026": 132, "TDV-2026": 21 };

type Banco = typeof clientePrisma;

/** Grava o inventário fictício. Não faz nada se já houver equipamentos (não apaga nem sobrescreve). */
export async function semearInventario(db: Banco): Promise<boolean> {
  if ((await db.ativo.count()) > 0) return false;
  await db.$transaction(async (tx) => {
    // Categoria do catálogo pelo tipo (catálogo inicial criado pela migração).
    const categorias = new Map((await tx.categoriaEquipamento.findMany({ where: { codigo: { not: null } }, select: { id: true, codigo: true } })).map((c) => [c.codigo!, c.id]));
    const categoriaId = (tipo: string) => {
      const id = categorias.get(tipo);
      if (!id) throw new Error(`Categoria ${tipo} ausente do catálogo.`);
      return id;
    };
    const movimentos: Prisma.MovimentacaoAtivoCreateManyInput[] = [];
    const mov = (ativoId: string, m: Omit<Prisma.MovimentacaoAtivoCreateManyInput, "ativoId" | "realizadoPorNome">) =>
      movimentos.push({ ativoId, realizadoPorNome: OPERADOR, ...m });

    for (const s of SEMENTES) {
      const cadastro = dia(s.aquisicao ?? "2025-01-10", "08:00");
      await tx.ativo.create({
        data: {
          id: idAtivo(s.n),
          categoria: s.categoria,
          categoriaId: categoriaId(s.categoria),
          nomeDispositivo: s.nome ?? null,
          patrimonio: s.patrimonio,
          empresaId: s.empresaId,
          marca: s.marca,
          modelo: s.modelo,
          numeroSerie: s.serie,
          ...(s.config ?? {}),
          dataAquisicao: s.aquisicao ? new Date(`${s.aquisicao}T00:00:00.000Z`) : null,
          criadoPorNome: OPERADOR,
          criadoEm: cadastro,
          situacaoDesde: cadastro,
        },
      });
      mov(idAtivo(s.n), { tipo: "CADASTRO", situacaoNova: "DISPONIVEL", realizadoEm: cadastro, observacao: "Carga inicial." });
      if (s.categoria === "NOTEBOOK") {
        await tx.ativo.create({
          data: {
            id: idCarregador(s.n),
            categoria: "CARREGADOR",
            categoriaId: categoriaId("CARREGADOR"),
            nomeDispositivo: nomeCarregador(s.nome!, 1),
            empresaId: s.empresaId,
            marca: s.marca,
            modelo: "Carregador",
            notebookId: idAtivo(s.n),
            sequenciaCarregador: 1,
            criadoPorNome: OPERADOR,
            criadoEm: cadastro,
            situacaoDesde: cadastro,
          },
        });
        mov(idCarregador(s.n), { tipo: "CARREGADOR_VINCULADO", situacaoNova: "DISPONIVEL", realizadoEm: cadastro, observacao: `Carregador principal (${s.nome}).` });
      }
    }

    const itensDe = (n: number) => {
      const s = SEMENTES.find((x) => x.n === n)!;
      return s.categoria === "NOTEBOOK" ? [{ id: idAtivo(n), n, empresaId: s.empresaId }, { id: idCarregador(n), n: -n, empresaId: s.empresaId }] : [{ id: idAtivo(n), n, empresaId: s.empresaId }];
    };
    const setSituacao = async (id: string, s: SituacaoAtivo, desde: Date) => tx.ativo.update({ where: { id }, data: { situacao: s, situacaoDesde: desde } });

    for (const e of ENTREGAS) {
      const pessoa = p(e.pessoa);
      const quando = dia(e.data, e.estado === "ATIVA" ? "10:30" : "08:30");
      const itens = e.itens.flatMap(itensDe);
      const alocacao = await tx.alocacao.create({
        data: {
          numero: e.numero,
          colaboradorId: pessoa.id,
          empresaColaboradorId: pessoa.empresaId,
          estado: e.estado,
          entregueEm: e.estado === "ATIVA" ? quando : null,
          entreguePorNome: e.estado === "ATIVA" ? OPERADOR : null,
          previstaPara: e.estado === "RESERVADA" ? new Date(`${e.data}T00:00:00.000Z`) : null,
          criadaPorNome: OPERADOR,
          criadaEm: e.estado === "ATIVA" ? quando : dia("2026-10-13", "08:30"),
          itens: { create: itens.map((i) => ({ ativoId: i.id, empresaProprietariaId: i.empresaId })) },
        },
      });
      const nova = e.estado === "ATIVA" ? "ALOCADO" : "RESERVADO";
      for (const i of itens) {
        await setSituacao(i.id, nova, e.estado === "ATIVA" ? quando : dia("2026-10-13", "08:30"));
        mov(i.id, {
          tipo: e.estado === "ATIVA" ? "ENTREGA" : "RESERVA",
          situacaoAnterior: "DISPONIVEL",
          situacaoNova: nova,
          colaboradorId: pessoa.id,
          colaboradorNome: pessoa.nome,
          alocacaoId: alocacao.id,
          realizadoEm: e.estado === "ATIVA" ? quando : dia("2026-10-13", "08:30"),
          observacao: e.estado === "ATIVA" ? `${e.numero}: entrega física.` : `${e.numero}: reservado para entrega.`,
        });
      }
      if (e.ter) {
        await tx.termo.create({
          data: {
            numero: e.ter.numero,
            tipo: "TER",
            alocacaoId: alocacao.id,
            colaboradorId: pessoa.id,
            estado: e.ter.estado,
            versaoModelo: "TER_VALLUR_v22",
            emitidoEm: e.estado === "ATIVA" ? quando : dia("2026-10-13", "09:00"),
            disponivelAoColaborador: e.ter.estado === "AGUARDANDO_ASSINATURA",
          },
        });
      }
    }

    for (const d of DEVOLVIDAS) {
      const pessoa = p(d.pessoa);
      const s = SEMENTES.find((x) => x.n === d.item)!;
      const entregue = dia(d.entregue, "10:00");
      const recebida = dia(d.devolucao.data, "14:00");
      const alocacao = await tx.alocacao.create({
        data: {
          numero: d.alocacao,
          colaboradorId: pessoa.id,
          empresaColaboradorId: pessoa.empresaId,
          estado: "ENCERRADA",
          entregueEm: entregue,
          entreguePorNome: OPERADOR,
          criadaPorNome: OPERADOR,
          criadaEm: entregue,
        },
      });
      const item = await tx.itemAlocacao.create({
        data: { alocacaoId: alocacao.id, ativoId: idAtivo(d.item), empresaProprietariaId: s.empresaId, aberto: null, encerradoEm: recebida, motivoEncerramento: "DEVOLUCAO", encerradoPorNome: OPERADOR },
      });
      const devolucao = await tx.devolucao.create({
        data: { numero: d.devolucao.numero, alocacaoId: alocacao.id, colaboradorId: pessoa.id, abrangencia: "TOTAL", recebidaEm: recebida, recebidaPorNome: OPERADOR },
      });
      await tx.itemDevolucao.create({
        data: { devolucaoId: devolucao.id, itemAlocacaoId: item.id, estadoFisico: d.devolucao.estadoFisico, destino: "MANUTENCAO", observacoes: d.devolucao.observacoes },
      });
      const baixado = d.baixadoEm ? dia(d.baixadoEm, "16:00") : null;
      const manutencao = await tx.manutencao.create({
        data: {
          ativoId: idAtivo(d.item),
          motivo: "Avaria identificada na devolução",
          observacoes: d.devolucao.observacoes,
          abertaEm: recebida,
          abertaPorNome: OPERADOR,
          recolhidoDeId: pessoa.id,
          recolhidoDeNome: pessoa.nome,
          recolhimentoConfirmadoEm: recebida,
          devolucaoId: devolucao.id,
          ...(baixado
            ? { aberta: null, concluidaEm: baixado, concluidaPorNome: OPERADOR, resultado: "SEM_REPARO" as const, servicoRealizado: "Avaliação técnica: reparo inviável." }
            : {}),
        },
      });
      await tx.itemAlocacao.update({ where: { id: item.id }, data: { manutencaoId: manutencao.id } });
      await tx.termo.create({
        data: { numero: d.devolucao.tdv, tipo: "TDV", devolucaoId: devolucao.id, colaboradorId: pessoa.id, estado: "AGUARDANDO_ASSINATURA", versaoModelo: "TDV_VALLUR_v08", emitidoEm: recebida },
      });
      mov(idAtivo(d.item), { tipo: "ENTREGA", situacaoAnterior: "DISPONIVEL", situacaoNova: "ALOCADO", colaboradorId: pessoa.id, colaboradorNome: pessoa.nome, alocacaoId: alocacao.id, realizadoEm: entregue, observacao: `${d.alocacao}: entrega física.` });
      mov(idAtivo(d.item), {
        tipo: "DEVOLUCAO",
        situacaoAnterior: "ALOCADO",
        situacaoNova: "MANUTENCAO",
        colaboradorId: pessoa.id,
        colaboradorNome: pessoa.nome,
        alocacaoId: alocacao.id,
        devolucaoId: devolucao.id,
        manutencaoId: manutencao.id,
        realizadoEm: recebida,
        observacao: `${d.devolucao.numero}: encaminhado para manutenção — ${d.devolucao.observacoes}`,
      });
      if (baixado) {
        mov(idAtivo(d.item), { tipo: "CONCLUSAO_MANUTENCAO", situacaoAnterior: "MANUTENCAO", situacaoNova: "BAIXADO", manutencaoId: manutencao.id, realizadoEm: baixado, observacao: "Sem reparo: avaliação técnica, reparo inviável." });
        await setSituacao(idAtivo(d.item), "BAIXADO", baixado);
        // O carregador do notebook baixado fica baixado junto (sem nova alocação).
        if (s.categoria === "NOTEBOOK") {
          await setSituacao(idCarregador(d.item), "BAIXADO", baixado);
          mov(idCarregador(d.item), { tipo: "CONCLUSAO_MANUTENCAO", situacaoAnterior: "DISPONIVEL", situacaoNova: "BAIXADO", realizadoEm: baixado, observacao: `Baixado junto com ${s.nome}.` });
        }
      } else {
        await setSituacao(idAtivo(d.item), "MANUTENCAO", recebida);
      }
    }

    await tx.movimentacaoAtivo.createMany({ data: movimentos });
    for (const [chave, valor] of Object.entries(CONTADORES)) {
      await tx.contadorDocumento.upsert({ where: { chave }, create: { chave, valor }, update: {} });
    }
    // Marca, modelo, processador e sistema dos equipamentos fictícios ligados aos Catálogos do Inventário.
    await vincularCatalogosPorTexto(tx);
  });
  return true;
}

export const ID_ATIVO_FICTICIO = idAtivo;
export const ID_CARREGADOR_FICTICIO = idCarregador;
