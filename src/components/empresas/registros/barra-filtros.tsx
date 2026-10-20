"use client";

import { Loader2, X } from "lucide-react";
import { useId } from "react";
import { CampoBusca } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DefFiltro = {
  chave: string;
  rotulo: string;
  /** Rótulo da opção sem filtro (ex.: "Todas as situações"). */
  todos?: string;
  opcoes: { valor: string; rotulo: string }[];
  valor: string;
  /** Lista longa ou variável (departamentos, categorias): seleção com busca interna. */
  pesquisavel?: boolean;
  /** Filtros que dependem deste (ex.: modelo depende da marca): limpos quando este muda. */
  limpa?: string[];
};

/**
 * Barra de pesquisa e filtros dos registros da empresa. Sem estado próprio: o modal
 * guarda os valores em memória e a página completa, na URL. `compacta`: controles mais baixos
 * no desktop e, com largura (container `@container` acima), pesquisa e filtros numa só linha.
 */
export function BarraFiltros({
  busca,
  aoBuscar,
  placeholder,
  rotuloBusca,
  filtros,
  aoFiltrar,
  aoLimpar,
  resumo,
  carregando,
  compacta,
}: {
  busca: string;
  aoBuscar: (valor: string) => void;
  placeholder: string;
  rotuloBusca: string;
  filtros: DefFiltro[];
  aoFiltrar: (chave: string, valor: string) => void;
  aoLimpar: () => void;
  resumo: React.ReactNode;
  carregando?: boolean;
  compacta?: boolean;
}) {
  const id = useId();
  // Filtros "limpáveis" têm a opção "todos"; seletores de ordenação não contam como filtro ativo.
  const ativos = filtros.filter((f) => f.todos !== undefined && f.valor).length + (busca ? 1 : 0);
  const algumAtivo = ativos > 0;
  // Muitos filtros: a pesquisa ganha a linha inteira e os filtros dividem a de baixo.
  const muitos = filtros.length >= 5;

  return (
    <div className={cn("flex flex-col", compacta ? "gap-2" : "gap-2.5")} role="search" aria-label="Pesquisa e filtros">
      {/* Compacta com até 4 filtros: pesquisa e filtros numa linha quando o cartão é largo. */}
      <div className={compacta && !muitos ? "flex flex-col gap-2 @5xl:flex-row" : muitos ? "flex flex-col gap-2" : "flex flex-col gap-2 lg:flex-row"}>
        <div className={cn("min-w-0 flex-1", compacta && !muitos && "@5xl:min-w-64")}>
          <label htmlFor={`${id}-busca`} className="sr-only">
            {rotuloBusca}
          </label>
          <CampoBusca id={`${id}-busca`} value={busca} onChange={(e) => aoBuscar(e.target.value)} placeholder={placeholder} className={compacta ? "lg:h-9" : undefined} />
        </div>
        <div
          className={
            compacta
              ? muitos
                ? "grid grid-cols-2 gap-2 @3xl:grid-cols-3 @5xl:grid-cols-5"
                : "grid grid-cols-2 gap-2 @3xl:grid-cols-4 @5xl:flex"
              : muitos
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
                : "grid grid-cols-2 gap-2 sm:flex"
          }
        >
          {filtros.map((f) => (
            <div
              key={f.chave}
              className={compacta && !muitos ? "min-w-0 @5xl:w-46 @5xl:shrink-0" : muitos ? "min-w-0" : filtros.length >= 4 ? "min-w-0 sm:w-44" : "min-w-0 sm:w-52"}
            >
              <label htmlFor={`${id}-${f.chave}`} className="sr-only">
                {f.rotulo}
              </label>
              <SelecaoPersonalizada
                id={`${id}-${f.chave}`}
                valor={f.valor}
                aoMudar={(v) => aoFiltrar(f.chave, v)}
                opcoes={f.opcoes}
                vazio={f.todos}
                pesquisavel={f.pesquisavel}
                destacado={f.todos !== undefined && Boolean(f.valor)}
                className={compacta ? "lg:h-9" : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      <div className={cn("flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground", compacta ? "min-h-6" : "min-h-7")}>
        <p aria-live="polite" className="flex items-center gap-2">
          {carregando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {resumo}
          {ativos > 0 ? <span className="sr-only">. {ativos} filtros ativos.</span> : null}
        </p>
        {algumAtivo ? (
          <Button type="button" variant="ghost" size="xs" onClick={aoLimpar}>
            <X aria-hidden /> Limpar filtros
          </Button>
        ) : null}
      </div>
    </div>
  );
}
