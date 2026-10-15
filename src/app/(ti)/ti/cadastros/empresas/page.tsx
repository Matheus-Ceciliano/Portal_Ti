import { CabecalhoPagina, EmDesenvolvimento } from "@/components/comum/pagina";
import { StatusBadge } from "@/components/comum/status-badge";
import { TabelaSimples, td, th } from "@/components/painel/tabelas";
import { CheckCircle2 } from "lucide-react";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarEmpresas } from "@/server/modulos/pessoas";

export const metadata = { title: "Empresas" };

export default async function PaginaEmpresas() {
  const ator = await exigirPaginaTi("empresa.ver");
  const empresas = await listarEmpresas(ator);
  return (
    <>
      <CabecalhoPagina
        titulo="Empresas"
        descricao="Empresas do grupo cadastradas no portal (dados fictícios de desenvolvimento gravados no banco)."
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Empresas" }]}
      />
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border bg-card shadow-nivel-1">
          <TabelaSimples legenda="Empresas do grupo">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Empresa</th>
                <th className={th}>CNPJ</th>
                <th className={th}>Cidade</th>
                <th className={`${th} text-right`}>Pessoas ativas</th>
                <th className={th}>Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td className={td}>
                    <span className="font-medium text-titulo">{e.nome}</span>
                    <span className="block text-[13px] text-muted-foreground">{e.sigla}</span>
                  </td>
                  <td className={`${td} tabular whitespace-nowrap`}>{e.cnpj}</td>
                  <td className={td}>{e.cidade}</td>
                  <td className={`${td} tabular text-right font-medium text-titulo`}>{e.pessoasAtivas}</td>
                  <td className={td}>
                    <StatusBadge tom={e.ativa ? "sucesso" : "neutro"} icone={CheckCircle2}>
                      {e.ativa ? "Ativa" : "Inativa"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TabelaSimples>
        </div>
        <EmDesenvolvimento
          modulo="Cadastro e edição de empresas"
          previsao="A manutenção de empresas (empresa.gerenciar) entra com o módulo de catálogos. Por enquanto a lista vem da carga de desenvolvimento."
        />
      </div>
    </>
  );
}
