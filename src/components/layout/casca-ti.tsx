"use client";

import {
  BookOpenText,
  Boxes,
  Building2,
  FileCheck2,
  FileX2,
  Headset,
  LayoutDashboard,
  Menu,
  PackageCheck,
  PlugZap,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { GrupoNavegacao, IconeNavegacao } from "@/server/navegacao";
import { MarcaPortal } from "./marca";
import { MenuUsuario, type DadosUsuario } from "./menu-usuario";

const ICONES: Record<IconeNavegacao, LucideIcon> = {
  painel: LayoutDashboard,
  empresas: Building2,
  pessoas: Users,
  inventario: Boxes,
  alocacoes: PackageCheck,
  ter: FileCheck2,
  tdv: FileX2,
  chamados: Headset,
  tutoriais: BookOpenText,
  integracoes: PlugZap,
  auditoria: ScrollText,
  configuracoes: Settings,
};

function ativo(caminho: string, href: string) {
  return href === "/ti" ? caminho === "/ti" : caminho === href || caminho.startsWith(`${href}/`);
}

function Navegacao({ grupos, aoNavegar }: { grupos: GrupoNavegacao[]; aoNavegar?: () => void }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Navegação da área de TI" className="flex flex-col gap-5 px-3 py-4">
      {grupos.map((grupo, i) => (
        <div key={grupo.rotulo ?? `grupo-${i}`}>
          {grupo.rotulo ? (
            <p className="mb-1 px-3 text-[13px] leading-5 font-medium text-sidebar-foreground/75">{grupo.rotulo}</p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {grupo.itens.map((item) => {
              const Icone = ICONES[item.icone];
              const corrente = ativo(caminho, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={aoNavegar}
                    aria-current={corrente ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 items-center gap-3 rounded-md px-3 text-[15px] text-sidebar-foreground transition-colors lg:h-10 lg:text-sm",
                      "hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sidebar-ring",
                      corrente &&
                        "bg-sidebar-accent font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary",
                    )}
                  >
                    <Icone className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
                    <span className="flex-1">{item.rotulo}</span>
                    {item.contador ? (
                      <span
                        className="tabular rounded-sm bg-sidebar-primary px-1.5 text-xs leading-5 font-semibold text-sidebar-primary-foreground"
                        aria-label={item.contadorRotulo}
                      >
                        {item.contador}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function CascaTi({
  grupos,
  usuario,
  faixa,
  children,
}: {
  grupos: GrupoNavegacao[];
  usuario: DadosUsuario;
  faixa: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-60">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col overflow-y-auto bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <MarcaPortal claro />
        </div>
        <Navegacao grupos={grupos} />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {faixa}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card px-2 sm:px-4 lg:px-8">
          <Sheet open={aberto} onOpenChange={setAberto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu de navegação" data-testid="abrir-menu">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] max-w-[85vw] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <SheetDescription className="sr-only">Áreas do Portal TI disponíveis para o seu perfil.</SheetDescription>
              <div className="flex h-16 items-center border-b border-sidebar-border px-5">
                <MarcaPortal claro />
              </div>
              <div className="overflow-y-auto">
                <Navegacao grupos={grupos} aoNavegar={() => setAberto(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-titulo lg:hidden">Portal TI</span>
          <div className="ml-auto flex items-center gap-1">
            <AlternarTema />
            <MenuUsuario usuario={usuario} />
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="densidade-ti mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
