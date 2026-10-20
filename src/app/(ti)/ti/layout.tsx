import { cookies } from "next/headers";
import { FaixaAmbiente } from "@/components/comum/faixa-ambiente";
import { CascaTi } from "@/components/layout/casca-ti";
import { barraFixada, COOKIE_BARRA_LATERAL } from "@/components/layout/preferencia-barra";
import { exigirAreaTi } from "@/server/auth/sessao";
import { PERFIS_ADMINISTRATIVOS, ROTULO_PERFIL } from "@/server/authz/catalogo";
import { pode } from "@/server/authz/exigir";
import { CHAMADOS } from "@/server/dados-ficticios/operacao";
import { navegacaoTi } from "@/server/navegacao";

export default async function LayoutTi({ children }: { children: React.ReactNode }) {
  // Defesa em profundidade: cada página e cada ação também verifica a permissão.
  const ator = await exigirAreaTi();
  const navegacao = navegacaoTi(ator, {
    chamadosSemResponsavel: CHAMADOS.filter((c) => c.estado !== "RESOLVIDO" && !c.responsavelId).length,
  });
  // Preferência da barra lateral (fixada ou recolhida) lida aqui: o primeiro quadro já sai certo.
  const fixada = barraFixada((await cookies()).get(COOKIE_BARRA_LATERAL)?.value);
  return (
    <CascaTi
      navegacao={navegacao}
      fixadaInicial={fixada}
      faixa={<FaixaAmbiente />}
      usuario={{
        nome: ator.nome,
        email: ator.email,
        perfis: ator.perfisAtivos.map((p) => ROTULO_PERFIL[p]),
        visao: ator.visao,
        podeTrocarVisao: ator.perfisAtivos.some((p) => PERFIS_ADMINISTRATIVOS.includes(p)),
        atalho: pode(ator, "portal.acessar") ? { href: "/portal", rotulo: "Meu portal de colaborador" } : undefined,
      }}
    >
      {children}
    </CascaTi>
  );
}
