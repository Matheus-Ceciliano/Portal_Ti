import Link from "next/link";
import { CabecalhoPagina, EmDesenvolvimento, formatarData } from "@/components/comum/pagina";
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
        descricao={DESCRICAO[tipo]}
        trilha={[{ rotulo: "Documentos" }, { rotulo: tipo }]}
      />
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border bg-card shadow-nivel-1">
          <TabelaSimples legenda={`Termos ${tipo}`}>
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Número</th>
                <th className={th}>Colaborador</th>
                <th className={th}>Equipamentos</th>
                <th className={th}>Situação</th>
                <th className={th}>Emitido em</th>
                <th className={th}>PDF assinado</th>
                <th className={th}>Visível ao colaborador</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {termos.map((t) => (
                <tr key={t.id}>
                  <td className={`${td} tabular font-medium text-titulo`}>{t.numero}</td>
                  <td className={td}>
                    <Link href={`/ti/cadastros/pessoas/${t.colaborador.id}`} className="underline-offset-4 hover:underline">
                      {t.colaborador.nome}
                    </Link>
                  </td>
                  <td className={`${td} tabular`}>{t.equipamentos.join(", ")}</td>
                  <td className={td}><Estado grupo="termo" valor={t.estado} /></td>
                  <td className={`${td} tabular`}>{t.emitidoEm ? formatarData(t.emitidoEm) : "—"}</td>
                  <td className={td}>
                    {t.temPdf ? (
                      <a href={`/api/termos/${t.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-link underline-offset-4 hover:underline">
                        Abrir
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={td}>{t.disponibilizado ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </TabelaSimples>
        </div>
        <EmDesenvolvimento
          modulo={`Emissão de ${tipo}`}
          previsao={
            tipo === "TER"
              ? "O TER é emitido automaticamente na entrega física (aba TER)."
              : "A emissão do TDV a partir do modelo oficial ainda não está no portal. Os vínculos com as condições registradas na entrega já ficam guardados para a comparação na devolução."
          }
        />
      </div>
    </>
  );
}
