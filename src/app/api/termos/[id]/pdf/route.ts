import { obterSessao } from "@/server/auth/sessao";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { lerPdfTermo } from "@/server/modulos/termos";

/** PDF do termo assinado: TI com escopo de grupo ou o próprio colaborador, se disponibilizado. */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const contexto = await obterSessao();
  if (!contexto || contexto.ator.estadoAcesso !== "LIBERADO") return new Response(null, { status: 401 });
  try {
    const pdf = await lerPdfTermo(contexto.ator, id);
    if (!pdf) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(pdf.dados), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nome}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (erro) {
    return new Response(null, { status: erro instanceof ErroAutorizacao ? 403 : 500 });
  }
}
