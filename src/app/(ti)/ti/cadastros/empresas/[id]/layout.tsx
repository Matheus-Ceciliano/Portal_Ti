import { notFound } from "next/navigation";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { ErroNegocio } from "@/server/authz/exigir";
import { exigirEmpresa } from "@/server/modulos/empresa-registros";

/**
 * Valida permissão e empresa ANTES do loading.tsx do segmento: assim um id inválido ou
 * inexistente responde 404 de verdade (dentro da área de carregamento o status já seria 200).
 */
export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const ator = await exigirPaginaTi("empresa.ver");
  const { id } = await params;
  try {
    await exigirEmpresa(ator, id);
  } catch (erro) {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  }
  return children;
}
