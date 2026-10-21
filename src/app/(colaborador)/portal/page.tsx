import Link from "next/link";
import { MarcaSimulado } from "@/components/comum/pagina";
import { ListaChamados, ListaDocumentos, ListaEquipamentos, ListaTutoriais, ResumoMeusTermos } from "@/components/portal/blocos-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { obterPainelColaborador } from "@/server/modulos/consultas";

export const metadata = { title: "Início" };

function Bloco({ titulo, href, rotuloLink, children }: { titulo: string; href: string; rotuloLink: string; children: React.ReactNode }) {
  const id = `bloco-${href.replaceAll("/", "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg leading-[26px] font-semibold">{titulo}</h2>
        <Link href={href} className="text-sm text-link underline-offset-4 hover:underline">{rotuloLink}</Link>
      </div>
      {children}
    </section>
  );
}

export default async function InicioPortal() {
  const ator = await exigirPortal();
  const { equipamentos, chamados, documentos, termos, tutoriais } = await obterPainelColaborador(ator);
  const abertos = chamados.filter((c) => c.estado !== "RESOLVIDO");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl leading-8 font-semibold">Olá, {ator.nome.split(" ")[0]}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          {ator.cargo} · {ator.empresa} <MarcaSimulado texto="Itens de demonstração" />
        </p>
      </header>
      <Bloco titulo={`Meus equipamentos (${equipamentos.length})`} href="/portal/equipamentos" rotuloLink="Ver todos">
        <ListaEquipamentos itens={equipamentos} />
      </Bloco>
      <Bloco titulo={`Chamados em aberto (${abertos.length})`} href="/portal/chamados" rotuloLink="Ver histórico">
        <ListaChamados itens={abertos} />
      </Bloco>
      <Bloco titulo="Meus Termos de Responsabilidade" href="/portal/termos" rotuloLink="Ver termos">
        {/* Sem TER emitido pelo portal, os termos anteriores disponibilizados pela TI continuam aqui. */}
        {termos.length || !documentos.length ? <ResumoMeusTermos itens={termos} /> : <ListaDocumentos itens={documentos} />}
      </Bloco>
      <Bloco titulo="Tutoriais recentes" href="/portal/tutoriais" rotuloLink="Ver tutoriais">
        <ListaTutoriais itens={tutoriais} />
      </Bloco>
    </div>
  );
}
