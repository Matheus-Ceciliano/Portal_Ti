import { Boxes, CheckCircle2, CircleDashed, Hand, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { hrefCom, type Parametros } from "@/components/comum/tabela";
import { ROTULO_CATEGORIA, ROTULO_SITUACAO, SITUACOES, type Situacao } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import type { ResultadoInventario } from "@/server/modulos/inventario";

type Indicadores = ResultadoInventario["indicadores"];

/** Indicador ativo quando a URL já tem exatamente o filtro dele. */
const ativo = (parametros: Parametros, filtro: Parametros) => Object.entries(filtro).every(([k, v]) => parametros[k] === v);

/** Clicar aplica o filtro; clicar de novo no indicador ativo o remove. */
function hrefIndicador(base: string, parametros: Parametros, filtro: Parametros) {
  const limpar = Object.fromEntries(Object.keys(filtro).map((k) => [k, undefined]));
  return hrefCom(base, { ...parametros, pagina: undefined }, ativo(parametros, filtro) ? limpar : filtro);
}

const foco = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type Cartao = { titulo: string; valor: number; icone: LucideIcon; tom: string; filtro: Parametros };

/**
 * Os quatro números do topo, do banco, com empresa, tipo, marca e pesquisa e sem o filtro de
 * situação (escolher "Disponíveis" não zera os demais). O total limpa o filtro de situação.
 */
export function CartoesInventario({ indicadores: i, base, parametros }: { indicadores: Indicadores; base: string; parametros: Parametros }) {
  const cartoes: Cartao[] = [
    { titulo: "Disponíveis", valor: i.disponiveis, icone: CircleDashed, tom: "text-info", filtro: { situacao: "DISPONIVEL" } },
    { titulo: "Alocados", valor: i.alocados, icone: CheckCircle2, tom: "text-sucesso", filtro: { situacao: "ALOCADO" } },
    { titulo: "Em manutenção", valor: i.manutencao, icone: Hand, tom: "text-manual", filtro: { situacao: "MANUTENCAO" } },
  ];
  const classe = cn(
    "flex h-full w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-left",
    "transition-[border-color,background-color] duration-150 hover:border-foreground/25 hover:bg-muted/60 motion-reduce:transition-none",
    foco,
  );
  const conteudo = (titulo: string, valor: number, Icone: LucideIcon, tom: string) => (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-4 font-semibold text-muted-foreground">
        <Icone className={cn("size-4 shrink-0", tom)} aria-hidden />
        <span className="min-w-0">{titulo}</span>
      </span>
      <span className="tabular text-base leading-6 font-bold text-titulo">{valor}</span>
    </>
  );
  return (
    <ul className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="indicadores-inventario">
      <li className="flex">
        <Link href={hrefCom(base, { ...parametros, pagina: undefined }, { situacao: undefined })} aria-label={`Total de equipamentos: ${i.total}. Mostrar todas as situações`} className={classe}>
          {conteudo("Total de equipamentos", i.total, Boxes, "text-muted-foreground")}
        </Link>
      </li>
      {cartoes.map((c) => {
        const marcado = ativo(parametros, c.filtro);
        return (
          <li key={c.titulo} className="flex">
            <Link
              href={hrefIndicador(base, parametros, c.filtro)}
              aria-label={`${c.titulo}: ${c.valor}. ${marcado ? "Remover filtro" : "Filtrar a lista"}`}
              aria-current={marcado ? "true" : undefined}
              className={cn(classe, marcado && "border-primary bg-accent/70 dark:border-link")}
            >
              {conteudo(c.titulo, c.valor, c.icone, c.tom)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type ItemRanking = { chave: string; rotulo: string; total: number; filtro?: Parametros; cor?: string };

const COR_SITUACAO: Record<Situacao, string> = {
  DISPONIVEL: "bg-info",
  RESERVADO: "bg-atencao",
  ALOCADO: "bg-sucesso",
  MANUTENCAO: "bg-manual",
  DEVOLVIDO_EM_AVALIACAO: "bg-atencao/60",
  BAIXADO: "bg-muted-foreground",
};

function percentual(valor: number, total: number) {
  if (!total || !valor) return "0%";
  const p = Math.round((valor / total) * 100);
  return p === 0 ? "<1%" : `${p}%`;
}

/** Primeiros N e o restante somado (o restante não filtra: são várias opções). */
function comRestante(itens: ItemRanking[], total: number, limite: number, rotuloRestante: string): ItemRanking[] {
  const exibidos = itens.slice(0, limite);
  const restante = total - exibidos.reduce((s, i) => s + i.total, 0);
  return restante > 0 ? [...exibidos, { chave: "restante", rotulo: rotuloRestante, total: restante }] : exibidos;
}

/** Ranking em barras horizontais: rótulo, barra proporcional, quantidade e percentual. */
function Ranking({ titulo, itens, total, base, parametros }: { titulo: string; itens: ItemRanking[]; total: number; base: string; parametros: Parametros }) {
  const id = useId();
  const linha = "grid grid-cols-[minmax(0,1fr)_minmax(2.5rem,0.9fr)_2.25rem_2.75rem] items-center gap-x-2.5 rounded-md px-2 py-1 text-[13px]";
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 px-2">
        <h2 id={id} className="text-[13px] font-semibold text-titulo">
          {titulo}
        </h2>
        <span className="tabular text-[12.5px] text-muted-foreground">
          {total} {total === 1 ? "equipamento" : "equipamentos"}
        </span>
      </div>
      {total === 0 ? (
        <p className="px-2 py-1 text-[13px] text-muted-foreground">Nenhum equipamento com os filtros atuais.</p>
      ) : (
        <ul>
          {itens.map((i) => {
            const pct = percentual(i.total, total);
            const conteudo = (
              <>
                <span className="truncate text-titulo" title={i.rotulo}>
                  {i.rotulo}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={cn("block h-full rounded-full", i.cor ?? "bg-chart-1")} style={{ width: `${total ? (i.total / total) * 100 : 0}%` }} />
                </span>
                <span className="tabular text-right font-semibold text-titulo">{i.total}</span>
                <span className="tabular text-right text-muted-foreground">{pct}</span>
              </>
            );
            if (!i.filtro) {
              return (
                <li key={i.chave} className={linha}>
                  {conteudo}
                </li>
              );
            }
            const marcado = ativo(parametros, i.filtro);
            return (
              <li key={i.chave}>
                <Link
                  href={hrefIndicador(base, parametros, i.filtro)}
                  aria-label={`${i.rotulo}: ${i.total} (${pct}). ${marcado ? "Remover filtro" : "Filtrar"}`}
                  aria-current={marcado ? "true" : undefined}
                  className={cn(linha, "transition-colors hover:bg-muted", foco, marcado && "bg-accent font-semibold")}
                >
                  {conteudo}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Visão geral (recolhível): situações com o mesmo escopo dos cartões; tipo, empresa e marca
 * com a lista filtrada (todos os filtros).
 */
export function VisaoGeralInventario({
  id,
  aberta,
  indicadores: i,
  totalLista,
  base,
  parametros,
}: {
  id: string;
  aberta: boolean;
  indicadores: Indicadores;
  totalLista: number;
  base: string;
  parametros: Parametros;
}) {
  const porSituacao: Record<Situacao, number> = {
    DISPONIVEL: i.disponiveis,
    RESERVADO: i.reservados,
    ALOCADO: i.alocados,
    MANUTENCAO: i.manutencao,
    DEVOLVIDO_EM_AVALIACAO: i.emAvaliacao,
    BAIXADO: i.baixados,
  };
  const comum = { base, parametros };
  return (
    <section id={id} hidden={!aberta} aria-label="Visão geral do inventário" className="mb-3 grid gap-x-8 gap-y-4 rounded-xl border bg-card p-3 md:grid-cols-2 lg:p-4" data-testid="visao-geral-inventario">
      <Ranking
        titulo="Por situação"
        total={i.total}
        itens={SITUACOES.map((s) => ({ chave: s, rotulo: ROTULO_SITUACAO[s], total: porSituacao[s], filtro: { situacao: s }, cor: COR_SITUACAO[s] }))}
        {...comum}
      />
      <Ranking
        titulo="Por tipo"
        total={totalLista}
        itens={comRestante(
          i.porTipo.map((t) => ({ chave: t.categoria, rotulo: ROTULO_CATEGORIA[t.categoria], total: t.total, filtro: { tipo: t.categoria } })),
          totalLista,
          6,
          "Outros tipos",
        )}
        {...comum}
      />
      <Ranking
        titulo="Por empresa"
        total={totalLista}
        itens={comRestante(
          i.porEmpresa.map((e) => ({ chave: e.id, rotulo: e.nome, total: e.total, filtro: { empresa: e.id } })),
          totalLista,
          8,
          "Outras empresas",
        )}
        {...comum}
      />
      <Ranking
        titulo="Por marca"
        total={totalLista}
        itens={comRestante(
          i.porMarca.map((m) => ({ chave: m.marca, rotulo: m.marca, total: m.total, filtro: { marca: m.marca } })),
          totalLista,
          6,
          "Outras marcas",
        )}
        {...comum}
      />
    </section>
  );
}
