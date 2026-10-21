"use client";

import { BookOpenText, Boxes, FileSignature, Headset, House, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { cn } from "@/lib/utils";
import { MarcaPortal } from "./marca";
import { MenuUsuario, type DadosUsuario } from "./menu-usuario";

const ITENS: { href: string; rotulo: string; curto: string; icone: LucideIcon }[] = [
  { href: "/portal", rotulo: "Início", curto: "Início", icone: House },
  { href: "/portal/equipamentos", rotulo: "Meus equipamentos", curto: "Equip.", icone: Boxes },
  { href: "/portal/chamados", rotulo: "Meus chamados", curto: "Chamados", icone: Headset },
  { href: "/portal/termos", rotulo: "Meus termos", curto: "Termos", icone: FileSignature },
  { href: "/portal/tutoriais", rotulo: "Tutoriais", curto: "Tutoriais", icone: BookOpenText },
];

const ativo = (caminho: string, href: string) =>
  href === "/portal" ? caminho === "/portal" : caminho.startsWith(href);

/** Indicador discreto de termos aguardando a assinatura do colaborador. */
function Pendencias({ total, compacto }: { total: number; compacto?: boolean }) {
  if (!total) return null;
  return (
    <span
      className={cn("tabular inline-grid min-w-5 place-items-center rounded-full bg-atencao px-1 text-[11px] leading-5 font-bold text-white", compacto && "absolute -top-1 left-[calc(50%+6px)]")}
      aria-label={`${total} ${total === 1 ? "termo aguardando" : "termos aguardando"} sua assinatura`}
      data-testid="indicador-termos-pendentes"
    >
      {total}
    </span>
  );
}

export function CascaPortal({
  usuario,
  faixa,
  termosPendentes = 0,
  children,
}: {
  usuario: DadosUsuario;
  faixa: React.ReactNode;
  termosPendentes?: number;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      {faixa}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-4 sm:px-6">
          <Link href="/portal" className="rounded-md" aria-label="Portal TI Vallur, início">
            <MarcaPortal />
          </Link>
          <nav aria-label="Navegação do portal" className="hidden flex-1 lg:block">
            <ul className="flex gap-1">
              {ITENS.map((item) => {
                const corrente = ativo(caminho, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={corrente ? "page" : undefined}
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[15px] text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        corrente && "bg-accent font-semibold text-accent-foreground",
                      )}
                    >
                      {item.rotulo}
                      {item.href === "/portal/termos" ? <Pendencias total={termosPendentes} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <AlternarTema />
            <MenuUsuario usuario={usuario} />
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-10">
        {children}
      </main>
      <nav aria-label="Navegação do portal" className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {ITENS.map(({ href, curto, rotulo, icone: Icone }) => {
            const corrente = ativo(caminho, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={corrente ? "page" : undefined}
                  aria-label={rotulo}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground",
                    corrente && "font-semibold text-primary dark:text-link",
                  )}
                >
                  <Icone className="size-5" aria-hidden strokeWidth={corrente ? 2.25 : 1.75} />
                  {curto}
                  {href === "/portal/termos" ? <Pendencias total={termosPendentes} compacto /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
