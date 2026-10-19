import { GestaoAlocacoes } from "@/components/alocacoes/gestao-alocacoes";
import { texto, type Parametros } from "@/components/comum/tabela";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { colaboradoresComAlocacao, ESTADOS_ALOCACAO, listarAlocacoes } from "@/server/modulos/alocacoes";
import { listarEmpresas } from "@/server/modulos/empresas";

export const metadata = { title: "Alocações" };

export default async function PaginaAlocacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    colaborador: texto(sp.colaborador),
    empresaColaborador: texto(sp.empresaColaborador),
    empresaProprietaria: texto(sp.empresaProprietaria),
    periodo: texto(sp.periodo),
    situacao: texto(sp.situacao),
    pagina: texto(sp.pagina),
  };
  const [resultado, empresas, colaboradores] = await Promise.all([
    listarAlocacoes(ator, {
      busca: parametros.busca,
      colaboradorId: parametros.colaborador,
      empresaColaboradorId: parametros.empresaColaborador,
      empresaProprietariaId: parametros.empresaProprietaria,
      periodo: (["30", "90", "365"] as const).find((p) => p === parametros.periodo),
      estado: ESTADOS_ALOCACAO.find((e) => e === parametros.situacao),
      pagina: Number(parametros.pagina) || 1,
    }),
    listarEmpresas(ator),
    colaboradoresComAlocacao(ator),
  ]);
  return (
    <GestaoAlocacoes
      resultado={resultado}
      parametros={parametros}
      filtrando={Boolean(parametros.busca || parametros.colaborador || parametros.empresaColaborador || parametros.empresaProprietaria || parametros.periodo || parametros.situacao)}
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      colaboradores={colaboradores}
      podeCriar={pode(ator, "alocacao.criar")}
      podeEntregar={pode(ator, "alocacao.confirmar_entrega")}
      pode={{
        confirmar: pode(ator, "alocacao.confirmar_entrega"),
        cancelar: pode(ator, "alocacao.cancelar"),
        devolver: pode(ator, "devolucao.registrar"),
        anexarTer: pode(ator, "termo.anexar_assinado"),
      }}
    />
  );
}
