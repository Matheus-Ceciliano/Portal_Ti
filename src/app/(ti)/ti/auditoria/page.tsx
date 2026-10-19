import { ScrollText } from "lucide-react";
import Link from "next/link";
import { CampoBusca, Selecao } from "@/components/comum/campos";
import { CabecalhoPagina, EstadoVazio, formatarDataHora } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { Paginacao, texto, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarAuditoria } from "@/server/modulos/consultas";

export const metadata = { title: "Auditoria" };
const BASE = "/ti/auditoria";

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("auditoria.ver");
  const sp = await searchParams;
  const parametros: Parametros = { acao: texto(sp.acao), resultado: texto(sp.resultado), pagina: texto(sp.pagina) };
  const resultado = (["SUCESSO", "NEGADO", "FALHA"] as const).find((r) => r === parametros.resultado);
  const dados = await listarAuditoria(ator, {
    acao: parametros.acao,
    resultado,
    pagina: Number(parametros.pagina) || 1,
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Eventos reais gravados pelo portal: somente metadados, nunca senhas, hashes ou segredos. Ninguém altera ou exclui eventos."
      />
      <div className="rounded-2xl border bg-card shadow-nivel-1">
        <form method="get" role="search" aria-label="Filtrar eventos" className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_200px_auto] sm:px-5">
          <div>
            <label htmlFor="acao" className="sr-only">Ação</label>
            <CampoBusca id="acao" name="acao" defaultValue={parametros.acao} placeholder="Ação, por exemplo perfil.atribuir" />
          </div>
          <div>
            <label htmlFor="resultado" className="sr-only">Resultado</label>
            <Selecao id="resultado" name="resultado" defaultValue={parametros.resultado ?? ""}>
              <option value="">Todos os resultados</option>
              <option value="SUCESSO">Sucesso</option>
              <option value="NEGADO">Negado</option>
              <option value="FALHA">Falha</option>
            </Selecao>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">Filtrar</Button>
            {parametros.acao || parametros.resultado ? (
              <Button asChild variant="ghost"><Link href={BASE}>Limpar</Link></Button>
            ) : null}
          </div>
        </form>
        {dados.eventos.length === 0 ? (
          <EstadoVazio icone={ScrollText} titulo="Nenhum evento encontrado" descricao="Ajuste os filtros para ver outros eventos." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <caption className="sr-only">Eventos de auditoria</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    {["Data e hora", "Ação", "Resultado", "Quem", "Alvo", "Origem da permissão"].map((c, i) => (
                      <th key={c} scope="col" className={`h-10 px-4 text-left text-[13px] font-medium whitespace-nowrap text-muted-foreground ${i === 0 ? "pl-5" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dados.eventos.map((e) => (
                    <tr key={e.id}>
                      <td className="tabular h-11 py-2 pr-4 pl-5 whitespace-nowrap">{formatarDataHora(e.criadoEm)}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[13px] text-titulo">{e.acao}</span>
                        {e.simulado ? <StatusBadge tom="neutro" className="ml-2 h-5">simulado</StatusBadge> : null}
                      </td>
                      <td className="px-4"><Estado grupo="auditoria" valor={e.resultado} /></td>
                      <td className="px-4">{e.atorNome ?? "Sistema"}</td>
                      <td className="px-4">{e.alvoDescricao ?? (e.alvoId ? <span className="font-mono text-[12px]">{e.alvoId.slice(0, 8)}…</span> : "—")}</td>
                      <td className="px-4 font-mono text-[12px] text-muted-foreground">{e.origemPermissao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao base={BASE} parametros={parametros} pagina={dados.pagina} paginas={dados.paginas} total={dados.total} rotulo="eventos" />
          </>
        )}
      </div>
    </>
  );
}
