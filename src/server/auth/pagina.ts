import "server-only";
import { redirect } from "next/navigation";
import type { Ator } from "@/server/authz/ator";
import type { Permissao } from "@/server/authz/catalogo";
import { pode, podeComEscopoGrupo } from "@/server/authz/exigir";
import { exigirAreaTi } from "./sessao";

/** Página da área de TI que exige uma permissão específica (além de ti.acessar). */
export async function exigirPaginaTi(permissao: Permissao, opcoes: { escopoGrupo?: boolean } = {}): Promise<Ator> {
  const ator = await exigirAreaTi();
  const permitido = opcoes.escopoGrupo ? podeComEscopoGrupo(ator, permissao) : pode(ator, permissao);
  if (!permitido) redirect("/ti/acesso-negado");
  return ator;
}
