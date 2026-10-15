import type { Ator } from "@/server/authz/ator";
import { podeComEscopoGrupo, pode } from "@/server/authz/exigir";
import type { Permissao } from "@/server/authz/catalogo";

export type IconeNavegacao =
  | "painel"
  | "empresas"
  | "pessoas"
  | "inventario"
  | "ter"
  | "tdv"
  | "chamados"
  | "tutoriais"
  | "integracoes"
  | "auditoria"
  | "configuracoes";

export type ItemNavegacao = { href: string; rotulo: string; icone: IconeNavegacao; contador?: number; contadorRotulo?: string };
export type GrupoNavegacao = { rotulo?: string; itens: ItemNavegacao[] };

type Definicao = ItemNavegacao & { permissao: Permissao; escopoGrupo?: boolean };

/**
 * Itens visíveis calculados no servidor a partir das permissões efetivas. Esconder um
 * item é só experiência: cada página e cada ação verifica a permissão de novo.
 */
export function navegacaoTi(ator: Ator, contadores: { chamadosSemResponsavel: number }): GrupoNavegacao[] {
  const filtrar = (itens: Definicao[]) =>
    itens
      .filter((i) => (i.escopoGrupo ? podeComEscopoGrupo(ator, i.permissao) : pode(ator, i.permissao)))
      .map((i): ItemNavegacao => ({
        href: i.href,
        rotulo: i.rotulo,
        icone: i.icone,
        contador: i.contador,
        contadorRotulo: i.contadorRotulo,
      }));

  const painel: Definicao = { href: "/ti", rotulo: "Dashboard", icone: "painel", permissao: "dashboard.ver" };
  const auditoria: Definicao = { href: "/ti/auditoria", rotulo: "Auditoria", icone: "auditoria", permissao: "auditoria.ver" };
  const gerencial = ator.visao === "GERENCIAL";

  const grupos: GrupoNavegacao[] = [
    { itens: filtrar(gerencial ? [painel, auditoria] : [painel]) },
    {
      rotulo: "Cadastros",
      itens: filtrar([
        { href: "/ti/cadastros/empresas", rotulo: "Empresas", icone: "empresas", permissao: "empresa.ver" },
        { href: "/ti/cadastros/pessoas", rotulo: "Pessoas", icone: "pessoas", permissao: "colaborador.ver", escopoGrupo: true },
      ]),
    },
    {
      itens: filtrar([
        { href: "/ti/inventario", rotulo: "Inventário", icone: "inventario", permissao: "ativo.ver", escopoGrupo: true },
      ]),
    },
    {
      rotulo: "Documentos",
      itens: filtrar([
        { href: "/ti/documentos/ter", rotulo: "TER", icone: "ter", permissao: "termo.ver", escopoGrupo: true },
        { href: "/ti/documentos/tdv", rotulo: "TDV", icone: "tdv", permissao: "termo.ver", escopoGrupo: true },
      ]),
    },
    {
      itens: filtrar([
        {
          href: "/ti/chamados",
          rotulo: "Chamados",
          icone: "chamados",
          permissao: "chamado.atender",
          contador: contadores.chamadosSemResponsavel || undefined,
          contadorRotulo: `${contadores.chamadosSemResponsavel} chamados sem responsável`,
        },
        { href: "/ti/tutoriais", rotulo: "Tutoriais", icone: "tutoriais", permissao: "tutorial.gerenciar" },
      ]),
    },
    {
      rotulo: "Administração",
      itens: filtrar([
        { href: "/ti/integracoes", rotulo: "Integrações", icone: "integracoes", permissao: "integracao.ver" },
        ...(gerencial ? [] : [auditoria]),
        { href: "/ti/configuracoes", rotulo: "Configurações", icone: "configuracoes", permissao: "perfil.ver" },
      ]),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}
