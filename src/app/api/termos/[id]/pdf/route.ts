import { obterSessao } from "@/server/auth/sessao";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { lerPdfTermo } from "@/server/modulos/termos";
import { lerArquivoTer, type AlvoArquivo } from "@/server/modulos/ter";

/** Nome com acentos no cabeçalho: versão ASCII + filename* (RFC 6266). */
function disposicao(nome: string, baixar: boolean) {
  const ascii = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${baixar ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/**
 * PDFs do termo, sempre por rota que confere sessão e permissão:
 * - ?arquivo=emitido[&versao=N]: PDF emitido pelo portal (versão vigente por padrão);
 * - ?arquivo=assinado&id=…: PDF assinado recebido; ?arquivo=relatorio&id=…: relatório da conferência;
 * - sem parâmetro: PDF assinado do termo (TI com escopo de grupo ou o colaborador, se disponibilizado).
 * &baixar=1 pede o download em vez da visualização.
 */
export async function GET(requisicao: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const contexto = await obterSessao();
  if (!contexto || contexto.ator.estadoAcesso !== "LIBERADO") return new Response(null, { status: 401 });
  const url = new URL(requisicao.url);
  const arquivo = url.searchParams.get("arquivo");
  const alvo: AlvoArquivo | null =
    arquivo === "emitido"
      ? { tipo: "emitido", versao: Number(url.searchParams.get("versao")) || null }
      : arquivo === "assinado"
        ? { tipo: "assinado", arquivoId: url.searchParams.get("id") ?? "" }
        : arquivo === "relatorio"
          ? { tipo: "relatorio", conferenciaId: url.searchParams.get("id") ?? "" }
          : null;
  if (arquivo && !alvo) return new Response(null, { status: 404 });
  try {
    const pdf = alvo ? await lerArquivoTer(contexto.ator, id, alvo) : await lerPdfTermo(contexto.ator, id);
    if (!pdf) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(pdf.dados), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(pdf.nome, url.searchParams.get("baixar") === "1"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (erro) {
    return new Response(null, { status: erro instanceof ErroAutorizacao ? 403 : 500 });
  }
}
