import { texto, type Parametros } from "@/components/comum/tabela";
import { GestaoTer } from "@/components/ter/gestao-ter";
import { SITUACOES_TER } from "@/lib/ter";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarTers } from "@/server/modulos/ter";

export const metadata = { title: "TER" };

/** Início do período (horário de Brasília), a partir de "últimos N dias". */
function inicioDoPeriodo(periodo: string | undefined) {
  const dias = Number(periodo);
  if (![7, 30, 90, 365].includes(dias)) return undefined;
  return new Date(Date.now() - dias * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export default async function PaginaTer({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ator = await exigirPaginaTi("termo.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    empresa: texto(sp.empresa),
    periodo: texto(sp.periodo),
    situacao: texto(sp.situacao),
    ordenar: texto(sp.ordenar),
    direcao: texto(sp.direcao),
    pagina: texto(sp.pagina),
  };
  const resultado = await listarTers(ator, {
    busca: parametros.busca,
    empresaId: parametros.empresa,
    situacao: SITUACOES_TER.find((s) => s === parametros.situacao),
    de: inicioDoPeriodo(parametros.periodo),
    ordenar: (["numero", "colaborador", "emissao"] as const).find((o) => o === parametros.ordenar),
    direcao: parametros.direcao === "asc" ? "asc" : "desc",
    pagina: Number(parametros.pagina) || 1,
  });
  return <GestaoTer resultado={resultado} parametros={parametros} filtrando={Boolean(parametros.busca || parametros.empresa || parametros.periodo || parametros.situacao)} />;
}
