import { CabecalhoPagina, EmDesenvolvimento, MarcaSimulado, formatarData } from "@/components/comum/pagina";
import { TabelaSimples, td, th } from "@/components/painel/tabelas";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { listarTutoriais } from "@/server/modulos/consultas";

export const metadata = { title: "Tutoriais" };

export default async function PaginaTutoriaisTi() {
  const ator = await exigirPaginaTi("tutorial.gerenciar");
  const tutoriais = await listarTutoriais(ator);
  return (
    <>
      <CabecalhoPagina
        titulo="Tutoriais"
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            Central de tutoriais publicada no portal do colaborador. <MarcaSimulado />
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border bg-card shadow-nivel-1">
          <TabelaSimples legenda="Tutoriais publicados">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Título</th>
                <th className={th}>Categoria</th>
                <th className={th}>Formato</th>
                <th className={th}>Atualizado em</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tutoriais.map((t) => (
                <tr key={t.id}>
                  <td className={`${td} font-medium text-titulo`}>{t.titulo}</td>
                  <td className={td}>{t.categoria}</td>
                  <td className={td}>{t.formato} · {t.duracao}</td>
                  <td className={`${td} tabular`}>{formatarData(t.atualizadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaSimples>
        </div>
        <EmDesenvolvimento
          modulo="Publicação de tutoriais"
          previsao="A sincronização com a pasta da TI no OneDrive e a definição de público por perfil entram com o módulo de tutoriais."
        />
      </div>
    </>
  );
}
