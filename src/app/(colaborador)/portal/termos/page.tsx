import { ListaDocumentos } from "@/components/portal/blocos-portal";
import { MeusTermos } from "@/components/portal/termos/meus-termos";
import { exigirPortal } from "@/server/auth/sessao";
import { listarMeusDocumentos } from "@/server/modulos/consultas";
import { listarMeusTers } from "@/server/modulos/ter-colaborador";

export const metadata = { title: "Meus Termos de Responsabilidade" };

export default async function PaginaMeusTermos() {
  const ator = await exigirPortal();
  const [termos, documentos] = await Promise.all([listarMeusTers(ator), listarMeusDocumentos(ator)]);
  // Termos anteriores à emissão pelo portal (e devoluções) continuam como documentos disponibilizados pela TI.
  const outros = documentos.filter((d) => !termos.some((t) => t.id === d.id));
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Meus Termos de Responsabilidade</h1>
        <p className="mt-1 text-muted-foreground">
          Termos de entrega dos equipamentos sob sua responsabilidade. Baixe o PDF, assine pelo GOV.BR e anexe aqui o documento assinado; a equipe de TI confere a assinatura.
        </p>
      </header>
      <MeusTermos itens={termos} />
      {outros.length ? (
        <section aria-labelledby="outros-documentos" className="flex flex-col gap-3">
          <h2 id="outros-documentos" className="text-lg leading-[26px] font-semibold">
            Outros documentos
          </h2>
          <ListaDocumentos itens={outros} />
        </section>
      ) : null}
    </div>
  );
}
