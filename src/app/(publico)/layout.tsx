import { CheckCircle2, FileCheck2, Headset, Laptop, Loader, ShieldCheck } from "lucide-react";
import { FaixaAmbiente } from "@/components/comum/faixa-ambiente";
import { StatusBadge } from "@/components/comum/status-badge";
import { MarcaPortal } from "@/components/layout/marca";
import { AlternarTema } from "@/components/tema/alternar-tema";

/** Prévia ilustrativa do que o colaborador acompanha no portal (exemplo, não dado real). */
const EXEMPLOS = [
  { icone: Laptop, titulo: "Notebook Dell Latitude", detalhe: "Patrimônio VLR-004512", tom: "sucesso", estado: "Em uso", Estado: CheckCircle2 },
  { icone: Headset, titulo: "Chamado CH-2026-0142", detalhe: "Rede da obra sem conexão", tom: "info", estado: "Em atendimento", Estado: Loader },
  { icone: FileCheck2, titulo: "Termo de entrega", detalhe: "TER-2026-0088", tom: "sucesso", estado: "Assinado", Estado: CheckCircle2 },
] as const;

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <FaixaAmbiente />
      <div className="grid flex-1 lg:grid-cols-[minmax(440px,44%)_1fr]">
        <aside className="hidden bg-sidebar lg:block">
          {/* Escopo escuro: os badges usam a variante de alto contraste sobre o azul institucional. */}
          <div className="dark flex h-full justify-center px-10 py-10 text-sidebar-foreground xl:px-14">
            {/* Bloco único centralizado na coluna; o texto continua alinhado à esquerda dentro dele. */}
            <div className="flex w-full max-w-[460px] flex-col">
              <MarcaPortal claro />
              <div className="my-auto py-10">
                <h2 className="text-[32px] leading-10 font-bold tracking-[-0.02em] text-white motion-safe:animate-entrada">
                  Tudo o que a TI cuida para você, num só lugar.
                </h2>
                <p className="mt-3 text-[15px] leading-6 text-sidebar-foreground">
                  Equipamentos, chamados, termos e tutoriais da equipe de TI do Grupo Vallur.
                </p>

                <figure className="mt-10 w-full rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10">
                  <figcaption className="flex items-center justify-between px-3 pt-2 pb-3 text-[13px] text-sidebar-foreground/80">
                    <span className="font-semibold text-white">Seu painel no portal</span>
                    <span>Exemplo</span>
                  </figcaption>
                  <ul className="flex flex-col gap-1">
                    {EXEMPLOS.map(({ icone: Icone, titulo, detalhe, tom, estado, Estado }, i) => (
                      <li
                        key={titulo}
                        className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5 motion-safe:animate-entrada"
                        style={{ animationDelay: `${120 + i * 80}ms` }}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-sidebar-primary" aria-hidden>
                          <Icone className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{titulo}</span>
                          <span className="block truncate text-[13px] text-sidebar-foreground/85">{detalhe}</span>
                        </span>
                        <StatusBadge tom={tom} icone={Estado}>
                          {estado}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                </figure>
              </div>
              <div className="flex items-start gap-3 border-t border-white/10 pt-6 text-[13px] leading-5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
                <p>
                  Acesso restrito a colaboradores do Grupo Vallur. A equipe de TI entra com senha pessoal e verificação
                  em duas etapas.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="relative flex flex-col px-4 py-6 sm:px-8 sm:py-10">
          <div className="flex items-center justify-between lg:justify-end">
            <div className="lg:hidden">
              <MarcaPortal />
            </div>
            <AlternarTema />
          </div>
          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-6 motion-safe:animate-entrada">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
