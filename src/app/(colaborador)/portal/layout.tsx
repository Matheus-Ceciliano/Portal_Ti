import { FaixaAmbiente } from "@/components/comum/faixa-ambiente";
import { CascaPortal } from "@/components/layout/casca-portal";
import { exigirPortal } from "@/server/auth/sessao";
import { ROTULO_PERFIL } from "@/server/authz/catalogo";
import { pode } from "@/server/authz/exigir";
import { contarMeusTersPendentes } from "@/server/modulos/ter-colaborador";

export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const ator = await exigirPortal();
  // O indicador nunca impede o portal de abrir.
  const termosPendentes = await contarMeusTersPendentes(ator).catch(() => 0);
  return (
    <CascaPortal
      faixa={<FaixaAmbiente />}
      termosPendentes={termosPendentes}
      usuario={{
        nome: ator.nome,
        email: ator.email,
        perfis: [ROTULO_PERFIL.COLABORADOR, ...ator.perfisAtivos.map((p) => ROTULO_PERFIL[p])],
        atalho: pode(ator, "ti.acessar") ? { href: "/ti", rotulo: "Área de TI" } : undefined,
      }}
    >
      {children}
    </CascaPortal>
  );
}
