import { AlertTriangle, FlaskConical } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, Secao, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { TabelaSimples, td, th } from "@/components/painel/tabelas";
import { cn } from "@/lib/utils";
import type { CenarioSimulacao } from "@/integrations/core/tipos";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { obterEstadoIntegracoes } from "@/server/modulos/consultas";

export const metadata = { title: "Integrações" };

const CENARIOS: { valor: CenarioSimulacao; rotulo: string }[] = [
  { valor: "NORMAL", rotulo: "Normal" },
  { valor: "INDISPONIVEL", rotulo: "Serviço indisponível" },
  { valor: "LIMITE_REQUISICOES", rotulo: "Limite de requisições" },
];

export default async function PaginaIntegracoes({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const ator = await exigirPaginaTi("integracao.ver");
  const { cenario: bruto } = await searchParams;
  const cenario = CENARIOS.find((c) => c.valor === bruto)?.valor ?? "NORMAL";
  const { saude, licencas, equipes } = await obterEstadoIntegracoes(ator, cenario);

  return (
    <>
      <CabecalhoPagina
        titulo="Integrações"
        descricao="Microsoft 365 e Microsoft Teams em modo de simulação. Não há credenciais configuradas e nenhuma chamada sai do portal."
      />
      <div className="flex flex-col gap-6">
        <div className="flex gap-3 rounded-lg border border-faixa/30 bg-faixa-fundo px-4 py-3 text-sm text-faixa">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Os adaptadores reais não existem nesta etapa. A configuração recusa qualquer modo diferente de simulação e
            nenhum tenant está autorizado para escrita (Q-09). Os dados abaixo são fictícios.
          </p>
        </div>

        <nav aria-label="Cenário de simulação" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Simular cenário:</span>
          {CENARIOS.map((c) => (
            <Link
              key={c.valor}
              href={c.valor === "NORMAL" ? "/ti/integracoes" : `/ti/integracoes?cenario=${c.valor}`}
              aria-current={cenario === c.valor ? "true" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-md border border-input px-3 lg:h-8",
                cenario === c.valor ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {c.rotulo}
            </Link>
          ))}
        </nav>

        <div className="grid gap-6 md:grid-cols-2">
          {saude.map((s) => (
            <Secao key={s.sistema} titulo={s.sistema} acoes={<Estado grupo="saude" valor={s.estado} />}>
              <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-sm">
                <div>
                  <dt className="text-[13px] text-muted-foreground">Modo</dt>
                  <dd className="font-medium text-titulo">Simulação</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted-foreground">Verificado em</dt>
                  <dd className="tabular font-medium text-titulo">{formatarDataHora(s.verificadoEm)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[13px] text-muted-foreground">Detalhe</dt>
                  <dd>{s.detalhe}</dd>
                </div>
              </dl>
            </Secao>
          ))}
        </div>

        <Secao titulo="Licenças Microsoft 365" simulado>
          {licencas.ok ? (
            <TabelaSimples legenda="Licenças Microsoft 365 simuladas">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className={th}>Licença</th>
                  <th className={`${th} text-right`}>Consumidas</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={`${th} text-right`}>Livres</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {licencas.dados.map((l) => (
                  <tr key={l.sku}>
                    <td className={td}>
                      <span className="text-titulo">{l.nome}</span>
                      <span className="block font-mono text-[12px] text-muted-foreground">{l.sku}</span>
                    </td>
                    <td className={`${td} tabular text-right`}>{l.consumidas}</td>
                    <td className={`${td} tabular text-right`}>{l.total}</td>
                    <td className={cn(`${td} tabular text-right font-semibold`, l.total - l.consumidas <= 2 ? "text-atencao" : "text-titulo")}>
                      {l.total - l.consumidas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaSimples>
          ) : (
            <ErroConector mensagem={licencas.erro.mensagem} correlacao={licencas.correlacaoId} />
          )}
        </Secao>

        <Secao titulo="Equipes do Teams" simulado>
          {equipes.ok ? (
            <ul className="divide-y">
              {equipes.dados.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="font-medium text-titulo">{e.nome}</span>
                  <span className="tabular text-[13px] text-muted-foreground">
                    {e.membros} membros · {e.canais} canais
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ErroConector mensagem={equipes.erro.mensagem} correlacao={equipes.correlacaoId} />
          )}
        </Secao>
      </div>
    </>
  );
}

function ErroConector({ mensagem, correlacao }: { mensagem: string; correlacao: string }) {
  return (
    <div role="alert" className="flex gap-3 px-5 py-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-erro" aria-hidden />
      <div>
        <p className="font-semibold text-titulo">Não foi possível consultar o conector</p>
        <p className="text-muted-foreground">{mensagem} Tente novamente em alguns minutos.</p>
        <p className="mt-1 font-mono text-[12px] text-muted-foreground">Correlação: {correlacao}</p>
      </div>
    </div>
  );
}
