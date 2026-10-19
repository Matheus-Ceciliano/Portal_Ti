import { CabecalhoPagina, MarcaSimulado, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { TabelaSimples, td, th } from "@/components/painel/tabelas";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarChamados } from "@/server/modulos/consultas";

export const metadata = { title: "Chamados" };

type Chamado = Awaited<ReturnType<typeof listarChamados>>[number];

function Tabela({ itens, legenda }: { itens: Chamado[]; legenda: string }) {
  return (
    <TabelaSimples legenda={legenda}>
      <thead className="border-b bg-muted/50">
        <tr>
          <th className={th}>Chamado</th>
          <th className={th}>Solicitante</th>
          <th className={th}>Prioridade</th>
          <th className={th}>Situação</th>
          <th className={th}>Responsável</th>
          <th className={th}>Aberto em</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {itens.map((c) => (
          <tr key={c.id}>
            <td className={`${td} py-2`}>
              <span className="tabular block text-[13px] text-muted-foreground">{c.numero} · {c.categoria}</span>
              <span className="text-titulo">{c.titulo}</span>
            </td>
            <td className={td}>{c.solicitante}</td>
            <td className={td}><Estado grupo="prioridade" valor={c.prioridade} /></td>
            <td className={td}><Estado grupo="chamado" valor={c.estado} /></td>
            <td className={td}>{c.responsavel ?? <span className="font-medium text-atencao">Sem responsável</span>}</td>
            <td className={`${td} tabular whitespace-nowrap`}>{formatarDataHora(c.abertoEm)}</td>
          </tr>
        ))}
      </tbody>
    </TabelaSimples>
  );
}

export default async function PaginaChamados() {
  const ator = await exigirPaginaTi("chamado.atender");
  const chamados = await listarChamados(ator);
  const abertos = chamados.filter((c) => c.estado !== "RESOLVIDO");
  const resolvidos = chamados.filter((c) => c.estado === "RESOLVIDO");

  return (
    <>
      <CabecalhoPagina
        titulo="Chamados"
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            Fila de atendimento da equipe de TI. <MarcaSimulado />
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <section aria-labelledby="t-abertos" className="rounded-2xl border bg-card shadow-nivel-1">
          <h2 id="t-abertos" className="border-b px-5 py-3 text-base font-semibold">
            Em aberto <span className="tabular font-normal text-muted-foreground">({abertos.length})</span>
          </h2>
          <Tabela itens={abertos} legenda="Chamados em aberto" />
        </section>
        <section aria-labelledby="t-resolvidos" className="rounded-2xl border bg-card shadow-nivel-1">
          <h2 id="t-resolvidos" className="border-b px-5 py-3 text-base font-semibold">
            Resolvidos recentemente <span className="tabular font-normal text-muted-foreground">({resolvidos.length})</span>
          </h2>
          <Tabela itens={resolvidos} legenda="Chamados resolvidos" />
        </section>
        <p className="text-[13px] text-muted-foreground">
          Atribuição, comentários internos e SLA entram com o módulo de chamados.
        </p>
      </div>
    </>
  );
}
