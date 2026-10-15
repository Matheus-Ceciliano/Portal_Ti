import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export type Indicador = {
  rotulo: string;
  valor: number;
  detalhe?: string;
  origem: "real" | "ficticio";
  destaque?: "atencao";
};

/** Faixa de indicadores: uma superfície dividida, não uma grade de cartões iguais. */
export function FaixaIndicadores({ itens }: { itens: Indicador[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card shadow-nivel-1 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((i, n) => (
        <div
          key={i.rotulo}
          className={cn(
            "flex flex-col gap-1 border-border px-4 py-4 sm:px-5",
            "border-b sm:border-r lg:border-b-0",
            n === itens.length - 1 && "border-b-0 sm:border-r-0",
          )}
        >
          <dt className="text-[13px] leading-[18px] text-muted-foreground">{i.rotulo}</dt>
          <dd
            className={cn(
              "tabular text-[28px] leading-9 font-semibold text-titulo",
              i.destaque === "atencao" && i.valor > 0 && "text-atencao",
            )}
          >
            {i.valor.toLocaleString("pt-BR")}
          </dd>
          <dd className="flex items-center gap-1 text-xs text-muted-foreground">
            {i.origem === "real" ? (
              <Database className="size-3" aria-hidden />
            ) : (
              <FlaskConical className="size-3 text-faixa" aria-hidden />
            )}
            <span>{i.origem === "real" ? "Banco do portal" : "Dado fictício"}</span>
            {i.detalhe ? <span className="sr-only">. {i.detalhe}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Distribuição em barras horizontais, apresentada como tabela (alternativa acessível embutida). */
export function TabelaBarras({
  legenda,
  colunas,
  linhas,
}: {
  legenda: string;
  colunas: [string, string];
  linhas: { rotulo: string; titulo?: string; valor: number; secundario?: number }[];
}) {
  const maximo = Math.max(1, ...linhas.map((l) => l.valor + (l.secundario ?? 0)));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{legenda}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{colunas[0]}</th>
          <th scope="col">{colunas[1]}</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.rotulo} className="border-b last:border-b-0">
            <th scope="row" className="w-[38%] py-2.5 pr-3 pl-4 text-left font-normal sm:pl-5" title={l.titulo}>
              <span className="line-clamp-1 text-foreground">{l.rotulo}</span>
            </th>
            <td className="py-2.5 pr-4 sm:pr-5">
              <div className="flex items-center gap-3">
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-sm bg-muted" aria-hidden>
                  <div className="bg-chart-1" style={{ width: `${(l.valor / maximo) * 100}%` }} />
                  {l.secundario ? (
                    <div className="bg-chart-3" style={{ width: `${(l.secundario / maximo) * 100}%` }} />
                  ) : null}
                </div>
                <span className="tabular w-16 text-right font-medium text-titulo">
                  {l.valor}
                  {l.secundario !== undefined ? <span className="font-normal text-muted-foreground"> + {l.secundario}</span> : null}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted-foreground sm:px-5">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", i.cor)} aria-hidden />
          {i.rotulo}
        </li>
      ))}
    </ul>
  );
}
