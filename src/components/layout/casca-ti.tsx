"use client";

import {
  BookOpenText,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { GrupoNavegacao, IconeNavegacao, NavegacaoTi } from "@/server/navegacao";
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

const ITEM_BARRA = cn(
  "relative flex h-11 w-full items-center gap-3 rounded-md px-3 text-[15px] text-sidebar-foreground transition-colors lg:h-10 lg:text-sm",
  "hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sidebar-ring",
);
const ITEM_BARRA_ATIVO =
  "bg-sidebar-accent font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary";

const itemCorrente = (caminho: string, grupos: GrupoNavegacao[]) => grupos.flatMap((g) => g.itens).find((i) => ativo(caminho, i.href));

function Navegacao({
  grupos,
  aoNavegar,
  rotulo = "Navegação da área de TI",
  className,
}: {
  grupos: GrupoNavegacao[];
  aoNavegar?: () => void;
  rotulo?: string;
  className?: string;
}) {
  const caminho = usePathname();
  return (
    <nav aria-label={rotulo} className={cn("flex flex-col gap-5 px-3 py-4", className)}>
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
                    className={cn(ITEM_BARRA, corrente && ITEM_BARRA_ATIVO)}
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

/**
 * Desktop: painel flutuante à direita da barra (não a expande nem cria rolagem). Fecha ao
 * clicar fora, com Esc ou ao escolher uma opção.
 */
function MaisOpcoes({ grupos }: { grupos: GrupoNavegacao[] }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const corrente = itemCorrente(caminho, grupos);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="mais-opcoes"
          className={cn(ITEM_BARRA, (corrente || aberto) && ITEM_BARRA_ATIVO, !corrente && "before:hidden")}
        >
          <Ellipsis className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-left">
            Mais opções
            {corrente ? <span className="font-normal text-white/75"> · {corrente.rotulo}</span> : null}
          </span>
          <ChevronRight className="size-4 shrink-0 opacity-75" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={20}
        collisionPadding={8}
        aria-label="Mais opções"
        className="max-h-(--radix-popover-content-available-height) w-60 gap-0 overflow-y-auto rounded-xl p-1.5 shadow-nivel-2 ring-black/5 dark:ring-white/10"
      >
        <nav aria-label="Mais opções" className="flex flex-col gap-1.5">
          {grupos.map((grupo, i) => (
            <div key={grupo.rotulo ?? `grupo-${i}`} className={cn(i > 0 && "border-t pt-1.5")}>
              {grupo.rotulo ? <p className="px-2.5 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">{grupo.rotulo}</p> : null}
              <ul className="flex flex-col">
                {grupo.itens.map((item) => {
                  const Icone = ICONES[item.icone];
                  const atual = corrente?.href === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setAberto(false)}
                        aria-current={atual ? "page" : undefined}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors outline-none lg:min-h-9",
                          "hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          atual && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                        )}
                      >
                        <Icone className={cn("size-4 shrink-0 text-muted-foreground", atual && "text-primary")} aria-hidden strokeWidth={1.75} />
                        {item.rotulo}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

/** Celular e tablet: na gaveta, "Mais opções" vira uma seção recolhível (aberta se a página atual estiver nela). */
function MaisOpcoesGaveta({ grupos, aoNavegar }: { grupos: GrupoNavegacao[]; aoNavegar: () => void }) {
  const caminho = usePathname();
  const corrente = itemCorrente(caminho, grupos);
  const [aberto, setAberto] = useState(Boolean(corrente));
  return (
    <div className="border-t border-sidebar-border px-3 pt-3 pb-4">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="mais-opcoes-gaveta"
        onClick={() => setAberto((v) => !v)}
        className={cn(ITEM_BARRA, "before:hidden")}
      >
        <Ellipsis className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
        <span className="flex-1 text-left">Mais opções</span>
        <ChevronDown className={cn("size-4 shrink-0 opacity-75 transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto ? (
        <div id="mais-opcoes-gaveta">
          <Navegacao grupos={grupos} aoNavegar={aoNavegar} rotulo="Mais opções" className="gap-4 px-0 pt-3 pb-0" />
        </div>
      ) : null}
    </div>
  );
}

export function CascaTi({
  navegacao,
  usuario,
  faixa,
  children,
}: {
  navegacao: NavegacaoTi;
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <MarcaPortal claro />
        </div>
        {/* Rolagem só de contingência (telas muito baixas); "Mais opções" fica sempre no rodapé. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Navegacao grupos={navegacao.principal} />
        </div>
        {navegacao.maisOpcoes.length > 0 ? (
          <div className="shrink-0 border-t border-sidebar-border p-3">
            <MaisOpcoes grupos={navegacao.maisOpcoes} />
          </div>
        ) : null}
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
                <Navegacao grupos={navegacao.principal} aoNavegar={() => setAberto(false)} />
                {navegacao.maisOpcoes.length > 0 ? (
                  <MaisOpcoesGaveta grupos={navegacao.maisOpcoes} aoNavegar={() => setAberto(false)} />
                ) : null}
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
