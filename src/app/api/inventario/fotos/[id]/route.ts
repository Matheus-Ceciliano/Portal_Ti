import { obterSessao } from "@/server/auth/sessao";
import { ErroAutorizacao } from "@/server/authz/exigir";
import { lerFotoEquipamento } from "@/server/modulos/inventario";

/** Foto de equipamento servida só a quem tem sessão e permissão (TI ou quem está com o equipamento). */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const contexto = await obterSessao();
  if (!contexto || contexto.ator.estadoAcesso !== "LIBERADO") return new Response(null, { status: 401 });
  try {
    const foto = await lerFotoEquipamento(contexto.ator, id);
    if (!foto) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(foto.dados), {
      headers: {
        "Content-Type": foto.tipo,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (erro) {
    return new Response(null, { status: erro instanceof ErroAutorizacao ? 403 : 500 });
  }
}
