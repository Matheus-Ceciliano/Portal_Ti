import { obterSessao } from "@/server/auth/sessao";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { lerFotoPessoa } from "@/server/modulos/pessoas";

/** Foto servida só a quem tem sessão válida: TI com escopo de grupo ou a própria pessoa. */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const contexto = await obterSessao();
  if (!contexto || contexto.ator.estadoAcesso !== "LIBERADO") return new Response(null, { status: 401 });
  try {
    const foto = await lerFotoPessoa(contexto.ator, id);
    if (!foto) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(foto.dados), {
      headers: {
        "Content-Type": foto.tipo,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (erro) {
    return new Response(null, { status: erro instanceof ErroAutorizacao ? 403 : 500 });
  }
}
