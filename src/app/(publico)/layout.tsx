import { Boxes, FileText, LifeBuoy, PlaySquare } from "lucide-react";
import { FaixaAmbiente } from "@/components/comum/faixa-ambiente";
import { MarcaPortal } from "@/components/layout/marca";
import { AlternarTema } from "@/components/tema/alternar-tema";

const RECURSOS = [
  { icone: Boxes, texto: "Equipamentos sob sua responsabilidade" },
  { icone: LifeBuoy, texto: "Chamados de suporte e acompanhamento" },
  { icone: FileText, texto: "Termos de entrega e devolução" },
  { icone: PlaySquare, texto: "Tutoriais da equipe de TI" },
];

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <FaixaAmbiente />
      <div className="grid flex-1 lg:grid-cols-[minmax(380px,40%)_1fr]">
        <aside className="hidden flex-col justify-between bg-sidebar px-12 py-12 text-sidebar-foreground lg:flex">
          <MarcaPortal claro />
          <div>
            <p className="max-w-[28ch] text-[28px] leading-9 font-semibold text-white">
              Tudo o que a TI cuida para você, num só lugar.
            </p>
            <ul className="mt-8 space-y-4">
              {RECURSOS.map(({ icone: Icone, texto }) => (
                <li key={texto} className="flex items-center gap-3 text-base">
                  <Icone className="size-5 text-sidebar-primary" aria-hidden strokeWidth={1.75} />
                  {texto}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm">Acesso restrito a colaboradores do Grupo Vallur.</p>
        </aside>
        <main className="relative flex flex-col px-4 py-8 sm:px-8">
          <div className="absolute top-3 right-3">
            <AlternarTema />
          </div>
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
            <div className="mb-8 lg:hidden">
              <MarcaPortal />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
