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
  Pin,
  PinOff,
  PlugZap,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GrupoNavegacao, IconeNavegacao, NavegacaoTi } from "@/server/navegacao";
import { IconeVallur } from "./icone-vallur";
import { MarcaPortal } from "./marca";
import { MenuUsuario, type DadosUsuario } from "./menu-usuario";
import { COOKIE_BARRA_LATERAL } from "./preferencia-barra";

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

const ID_BARRA = "barra-lateral-ti";
/** Recolhida: só ícones (4,5rem). Expandida ou fixada: 15rem. */
const LARGURA = { recolhida: "4.5rem", expandida: "15rem" } as const;
/** Atraso para expandir ao passar o mouse (passagens rápidas não abrem o painel) e para recolher. */
const ATRASO_EXPANDIR = 300;
const ATRASO_RECOLHER = 200;

function ativo(caminho: string, href: string) {
  return href === "/ti" ? caminho === "/ti" : caminho === href || caminho.startsWith(`${href}/`);
}

const ITEM_BARRA = cn(
  "relative flex h-11 w-full items-center gap-3 overflow-hidden rounded-md px-3.5 text-[15px] text-sidebar-foreground transition-colors lg:h-10 lg:text-sm",
  "hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sidebar-ring",
);
const ITEM_BARRA_ATIVO =
  "bg-sidebar-accent font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary";
/** Texto que some na barra recolhida (fica no DOM: leitores de tela e nomes acessíveis continuam). */
const SOME_RECOLHIDA = "transition-opacity duration-200 group-data-[estado=recolhida]/barra:opacity-0";

const itemCorrente = (caminho: string, grupos: GrupoNavegacao[]) => grupos.flatMap((g) => g.itens).find((i) => ativo(caminho, i.href));

function Navegacao({
  grupos,
  aoNavegar,
  rotulo = "Navegação da área de TI",
  className,
  recolhida,
}: {
  grupos: GrupoNavegacao[];
  aoNavegar?: () => void;
  rotulo?: string;
  className?: string;
  /** Só na barra lateral (desktop): recolhida mostra o nome do módulo em dica. */
  recolhida?: boolean;
}) {
  const caminho = usePathname();
  const dicas = recolhida !== undefined;
  return (
    <nav aria-label={rotulo} className={cn("flex flex-col gap-5 px-3 py-4", className)}>
      {grupos.map((grupo, i) => (
        <div key={grupo.rotulo ?? `grupo-${i}`}>
          {grupo.rotulo ? (
            // Recolhida: o rótulo do grupo vira um traço, na mesma altura (os ícones não mudam de lugar).
            <p
              className={cn(
                "relative mb-1 px-3.5 text-[13px] leading-5 font-medium whitespace-nowrap text-sidebar-foreground/75 transition-colors duration-200",
                "before:absolute before:top-1/2 before:left-3.5 before:h-px before:w-5 before:bg-sidebar-foreground/30 before:opacity-0",
                "group-data-[estado=recolhida]/barra:text-transparent group-data-[estado=recolhida]/barra:before:opacity-100",
              )}
            >
              {grupo.rotulo}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {grupo.itens.map((item) => {
              const Icone = ICONES[item.icone];
              const corrente = ativo(caminho, item.href);
              const link = (
                <Link
                  href={item.href}
                  onClick={aoNavegar}
                  aria-current={corrente ? "page" : undefined}
                  className={cn(ITEM_BARRA, corrente && ITEM_BARRA_ATIVO)}
                >
                  <Icone className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
                  <span className={cn("flex-1 whitespace-nowrap", SOME_RECOLHIDA)}>{item.rotulo}</span>
                  {item.contador ? (
                    <>
                      <span
                        className={cn("tabular rounded-sm bg-sidebar-primary px-1.5 text-xs leading-5 font-semibold text-sidebar-primary-foreground", SOME_RECOLHIDA)}
                        aria-label={item.contadorRotulo}
                      >
                        {item.contador}
                      </span>
                      {/* Recolhida: o contador vira um ponto sobre o ícone. */}
                      <span
                        aria-hidden
                        className="absolute top-1.5 left-7 hidden size-2 rounded-full bg-sidebar-primary ring-2 ring-sidebar group-data-[estado=recolhida]/barra:block"
                      />
                    </>
                  ) : null}
                </Link>
              );
              return (
                <li key={item.href}>
                  {dicas ? (
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className={cn(!recolhida && "hidden")}>
                        {item.rotulo}
                        {item.contador ? ` · ${item.contadorRotulo}` : null}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
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
 * Desktop: painel flutuante à direita da barra (não cria rolagem). Abrir o painel mantém a
 * barra expandida, e ele se ancora na borda da barra expandida (não acompanha a animação).
 * Fecha ao clicar fora, com Esc ou ao escolher uma opção.
 */
function MaisOpcoes({
  grupos,
  aberto,
  aoMudar,
  aoNavegar,
  recolhida,
}: {
  grupos: GrupoNavegacao[];
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  aoNavegar: () => void;
  recolhida: boolean;
}) {
  const caminho = usePathname();
  const corrente = itemCorrente(caminho, grupos);
  return (
    <Popover open={aberto} onOpenChange={aoMudar}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="mais-opcoes"
              className={cn(ITEM_BARRA, (corrente || aberto) && ITEM_BARRA_ATIVO, !corrente && "before:hidden")}
            >
              <Ellipsis className="size-5 shrink-0" aria-hidden strokeWidth={1.75} />
              <span className={cn("min-w-0 flex-1 truncate text-left", SOME_RECOLHIDA)}>
                Mais opções
                {corrente ? <span className="font-normal text-white/75"> · {corrente.rotulo}</span> : null}
              </span>
              <ChevronRight className={cn("size-4 shrink-0 opacity-75", "group-data-[estado=recolhida]/barra:opacity-0")} aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className={cn((!recolhida || aberto) && "hidden")}>
          Mais opções{corrente ? ` · ${corrente.rotulo}` : null}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="end"
        // Ancorado no botão (que termina 12 px antes da borda da barra expandida): 8 px depois da barra.
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
                        onClick={() => {
                          aoMudar(false);
                          aoNavegar();
                        }}
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

function salvarPreferencia(fixada: boolean) {
  const seguro = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE_BARRA_LATERAL}=${fixada ? "fixada" : "recolhida"}; path=/; max-age=31536000; samesite=lax${seguro}`;
}

/** Fora da barra, mas parte dela: o painel "Mais opções" e as dicas (renderizados em portal). */
const dentroDosPaineis = (alvo: EventTarget | null) =>
  alvo instanceof Element && Boolean(alvo.closest('[data-slot="popover-content"],[data-slot="tooltip-content"]'));

/**
 * Estado da barra lateral (desktop). Recolhida por padrão; expande por cima do conteúdo
 * (sem empurrá-lo) ao passar o mouse, ao tocar/clicar no logotipo ou com o painel "Mais
 * opções" aberto. Fixada, fica expandida e ocupa espaço no layout; a preferência vai para
 * um cookie (o servidor a lê no próximo carregamento).
 */
function useBarraLateral(
  fixadaInicial: boolean,
  { barra, alternador, fixador }: { barra: React.RefObject<HTMLElement | null>; alternador: React.RefObject<HTMLButtonElement | null>; fixador: React.RefObject<HTMLButtonElement | null> },
) {
  const [fixada, setFixada] = useState(fixadaInicial);
  /** Mouse (ou caneta) sobre a barra, depois do atraso. Toque não conta: usa o botão. */
  const [sobre, setSobre] = useState(false);
  /** Expandida por clique, toque ou teclado: recolhe ao tocar fora, sair com o foco, Esc ou navegar. */
  const [aberta, setAberta] = useState(false);
  const [painel, setPainel] = useState(false);
  const espera = useRef<number | undefined>(undefined);
  const dentro = useRef(false);
  /** Recolhida com Esc (ou pelo logotipo) com o mouse em cima: só volta a expandir depois de sair. */
  const suprimida = useRef(false);
  const ponteiro = useRef<string>("mouse");
  const temporaria = !fixada && (sobre || aberta);
  const expandida = fixada || sobre || aberta || painel;

  const recolher = () => {
    window.clearTimeout(espera.current);
    setSobre(false);
    setAberta(false);
    if (dentro.current) suprimida.current = true;
  };

  useEffect(() => () => window.clearTimeout(espera.current), []);

  // Toque ou clique fora recolhe a expansão aberta por toque/clique.
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (!barra.current?.contains(e.target as Node) && !dentroDosPaineis(e.target)) setAberta(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberta, barra]);

  // Esc recolhe a expansão temporária (com o painel aberto, o Esc fecha só o painel).
  useEffect(() => {
    if (!temporaria || painel) return;
    const teclar = (e: KeyboardEvent) => {
      // Sem olhar defaultPrevented: o Radix o marca ao fechar a dica aberta pelo mesmo Esc.
      if (e.key !== "Escape") return;
      window.clearTimeout(espera.current);
      setSobre(false);
      setAberta(false);
      if (dentro.current) suprimida.current = true;
      // O botão de fixar some na barra recolhida: o foco vai para o logotipo.
      if (document.activeElement === fixador.current) alternador.current?.focus();
    };
    document.addEventListener("keydown", teclar);
    return () => document.removeEventListener("keydown", teclar);
  }, [temporaria, painel, alternador, fixador]);

  const eventos = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      dentro.current = true;
      window.clearTimeout(espera.current);
      if (suprimida.current) return;
      espera.current = window.setTimeout(() => setSobre(true), ATRASO_EXPANDIR);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      dentro.current = false;
      suprimida.current = false;
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => setSobre(false), ATRASO_RECOLHER);
    },
    onBlur: (e: React.FocusEvent) => {
      // Foco saiu da barra (Tab adiante): recolhe a expansão aberta por teclado ou toque.
      const destino = e.relatedTarget as Node | null;
      if (aberta && destino && !e.currentTarget.contains(destino) && !dentroDosPaineis(destino)) setAberta(false);
    },
  };

  return {
    fixada,
    expandida,
    painel,
    eventos,
    setPainel,
    /** Logotipo: expande ou recolhe (toque, clique ou teclado). */
    alternar: () => (expandida ? recolher() : setAberta(true)),
    registrarPonteiro: (e: React.PointerEvent) => {
      ponteiro.current = e.pointerType;
    },
    alternarFixacao: (e: React.MouseEvent) => {
      const novo = !fixada;
      setFixada(novo);
      salvarPreferencia(novo);
      if (novo) {
        setAberta(false);
        return;
      }
      // Desafixada: continua expandida até o mouse sair (ou, por teclado/toque, até o foco sair).
      if (e.detail > 0 && ponteiro.current !== "touch") setSobre(true);
      else setAberta(true);
    },
    /** Ao navegar, a expansão aberta por toque recolhe; a do mouse segue o ponteiro. */
    aoNavegar: () => setAberta(false),
  };
}

export function CascaTi({
  navegacao,
  usuario,
  faixa,
  fixadaInicial = false,
  children,
}: {
  navegacao: NavegacaoTi;
  usuario: DadosUsuario;
  faixa: React.ReactNode;
  /** Preferência salva (cookie lido no servidor). */
  fixadaInicial?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const barra = useRef<HTMLElement>(null);
  const alternador = useRef<HTMLButtonElement>(null);
  const fixador = useRef<HTMLButtonElement>(null);
  const b = useBarraLateral(fixadaInicial, { barra, alternador, fixador });
  const recolhida = !b.expandida;
  return (
    <div className={cn("min-h-dvh", b.fixada ? "lg:pl-60" : "lg:pl-18")}>
      {/* Largura ocupada pela barra (lg+), para quem se posiciona pela área de trabalho (modais). */}
      <style>{`:root{--largura-sidebar:0px}@media (min-width:64rem){:root{--largura-sidebar:${b.fixada ? LARGURA.expandida : LARGURA.recolhida}}}`}</style>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir para o conteúdo
      </a>
      <aside
        id={ID_BARRA}
        ref={barra}
        data-testid="barra-lateral"
        data-estado={recolhida ? "recolhida" : "expandida"}
        data-fixada={b.fixada ? "" : undefined}
        {...b.eventos}
        className={cn(
          "group/barra fixed inset-y-0 left-0 z-20 hidden flex-col overflow-hidden bg-sidebar transition-[width,box-shadow] duration-200 ease-out lg:flex",
          recolhida ? "w-18" : "w-60",
          // Expansão temporária: por cima do conteúdo, com sombra (o conteúdo não se move).
          !recolhida && !b.fixada && "shadow-nivel-2",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border pr-3 pl-4">
          {b.fixada ? (
            <span className="grid size-10 shrink-0 place-items-center text-white">
              <IconeVallur className="h-8 w-auto" />
            </span>
          ) : (
            <button
              type="button"
              ref={alternador}
              onClick={b.alternar}
              aria-expanded={!recolhida}
              aria-controls={ID_BARRA}
              aria-label={recolhida ? "Expandir menu lateral" : "Recolher menu lateral"}
              data-testid="alternar-menu"
              className="grid size-10 shrink-0 place-items-center rounded-md text-white transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sidebar-ring"
            >
              <IconeVallur className="h-8 w-auto" />
            </button>
          )}
          <span className={cn("min-w-0 flex-1 leading-tight whitespace-nowrap text-white", SOME_RECOLHIDA)}>
            <span className="block text-[13px] font-medium opacity-80">Grupo Vallur</span>
            <span className="block text-lg font-semibold">Portal TI</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={fixador}
                onPointerDown={b.registrarPonteiro}
                onClick={b.alternarFixacao}
                aria-pressed={b.fixada}
                aria-label={b.fixada ? "Desafixar menu lateral" : "Fixar menu lateral"}
                data-testid="fixar-menu"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white aria-pressed:text-white",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sidebar-ring",
                  // Recolhida: fora da tela e fora da ordem de tabulação.
                  "group-data-[estado=recolhida]/barra:invisible",
                )}
              >
                {b.fixada ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {b.fixada ? "Desafixar: o menu recolhe e expande ao passar o mouse" : "Fixar o menu expandido"}
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Rolagem só de contingência (telas muito baixas); "Mais opções" fica sempre no rodapé. */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <Navegacao grupos={navegacao.principal} recolhida={recolhida} aoNavegar={b.aoNavegar} />
        </div>
        {navegacao.maisOpcoes.length > 0 ? (
          <div className="relative shrink-0 border-t border-sidebar-border p-3">
            <MaisOpcoes grupos={navegacao.maisOpcoes} aberto={b.painel} aoMudar={b.setPainel} aoNavegar={b.aoNavegar} recolhida={recolhida} />
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
