import { CabecalhoPagina, EmDesenvolvimento, MarcaSimulado, formatarData } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { TabelaSimples, td, th } from "@/components/painel/tabelas";
import type { Ator } from "@/server/authz/ator";
import { listarTermos } from "@/server/modulos/consultas";

const DESCRICAO = {
  TER: "Termos de entrega e responsabilidade emitidos na alocação de equipamentos.",
  TDV: "Termos de devolução registrados quando o equipamento volta para a TI.",
};

export async function PaginaTermos({ ator, tipo }: { ator: Ator; tipo: "TER" | "TDV" }) {
  const termos = await listarTermos(ator, tipo);
  return (
    <>
      <CabecalhoPagina
        titulo={tipo === "TER" ? "TER: termos de entrega" : "TDV: termos de devolução"}
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            {DESCRICAO[tipo]} <MarcaSimulado />
          </span>
        }
        trilha={[{ rotulo: "Documentos" }, { rotulo: tipo }]}
      />
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border bg-card shadow-nivel-1">
          <TabelaSimples legenda={`Termos ${tipo}`}>
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Número</th>
                <th className={th}>Colaborador</th>
                <th className={th}>Equipamentos</th>
                <th className={th}>Situação</th>
                <th className={th}>Emitido em</th>
                <th className={th}>Visível ao colaborador</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {termos.map((t) => (
                <tr key={t.id}>
                  <td className={`${td} tabular font-medium text-titulo`}>{t.numero}</td>
                  <td className={td}>{t.colaborador}</td>
                  <td className={`${td} tabular`}>{t.ativos.join(", ")}</td>
                  <td className={td}><Estado grupo="termo" valor={t.estado} /></td>
                  <td className={`${td} tabular`}>{formatarData(t.emitidoEm)}</td>
                  <td className={td}>{t.disponibilizado ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </TabelaSimples>
        </div>
        <EmDesenvolvimento
          modulo={`Emissão de ${tipo}`}
          previsao="A geração do documento a partir dos modelos oficiais, a anexação do termo assinado e as fotos de evidência entram com o módulo de termos. Os modelos da TI não foram importados (contêm dados pessoais)."
        />
      </div>
    </>
  );
}
