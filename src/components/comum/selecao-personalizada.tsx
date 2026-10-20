"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { classeControle } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OpcaoSelecao = {
  valor: string;
  rotulo: string;
  /** Observação discreta à direita da opção (ex.: "Em uso"); não aparece no campo. */
  detalhe?: string;
  tomDetalhe?: "erro";
};

function DetalheOpcao({ texto, tom }: { texto?: string; tom?: "erro" }) {
  return texto ? (
    <>
      <span aria-hidden className={cn("ml-auto shrink-0 text-xs font-medium", tom === "erro" ? "text-erro" : "text-muted-foreground")}>
        {texto}
      </span>
      <span className="sr-only">({texto})</span>
    </>
  ) : null;
}

type Props = {
  id?: string;
  valor: string;
  aoMudar: (valor: string) => void;
  opcoes: OpcaoSelecao[];
  /** Rótulo da opção "sem filtro" (ex.: "Todas as situações"). Ausente = não há opção vazia. */
  vazio?: string;
  placeholder?: string;
  /** Lista com busca interna (combobox). Padrão: mais de 8 opções. */
  pesquisavel?: boolean;
  desabilitado?: boolean;
  carregando?: boolean;
  invalido?: boolean;
  /** Realce de filtro aplicado. */
  destacado?: boolean;
  /** Para formulários: envia o valor em um campo oculto com este nome. */
  name?: string;
  /** Ação "+ Criar novo" ao final das opções (abre o cadastro no catálogo). */
  criar?: { rotulo?: string; aoCriar: () => void };
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

/** Item técnico da opção vazia: o Radix Select não aceita valor "" em itens. */
const VAZIO = "__vazio__";
/** Item técnico da ação "+ Criar novo". */
const CRIAR = "__criar__";

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const classeGatilho = (destacado?: boolean) =>
  cn(
    classeControle,
    "flex h-11 cursor-pointer items-center justify-between gap-2 pr-3 pl-3.5 text-left lg:h-10",
    "data-placeholder:text-muted-foreground data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/15",
    "dark:data-[state=open]:border-link dark:data-[state=open]:ring-link/25",
    destacado && "border-primary bg-accent font-semibold text-accent-foreground dark:border-link",
  );

/** Menu flutuante: 12 px de raio, borda discreta, sombra suave e abertura curta (respeita movimento reduzido). */
const classeMenu = cn(
  "z-[60] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-nivel-2 dark:border-white/10",
  "duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.97] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.97]",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none",
);

const classeItem = cn(
  "relative flex min-h-10 cursor-pointer items-center gap-2 rounded-lg py-2 pr-9 pl-3 text-sm text-foreground outline-none select-none lg:min-h-9",
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
);

/** "+ Criar novo": separado das opções por uma linha, em cor de ação. */
const classeCriar = cn(classeItem, "mt-1 font-semibold text-link before:absolute before:inset-x-1 before:-top-[3px] before:h-px before:bg-border");

function IconeFinal({ carregando }: { carregando?: boolean }) {
  return carregando ? (
    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
  ) : (
    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden />
  );
}

/**
 * Seleção personalizada (Radix + cmdk) no lugar do menu nativo do navegador.
 * Listas curtas usam Select (role listbox, digitação para pular a opção); listas longas
 * usam combobox com busca. Ambos funcionam por teclado, dentro de Dialog (portal + camada
 * própria) e com leitor de tela.
 */
export function SelecaoPersonalizada({ pesquisavel, ...props }: Props) {
  return (pesquisavel ?? props.opcoes.length > 8) ? <ComboboxPesquisavel {...props} /> : <SelecaoSimples {...props} />;
}

function SelecaoSimples({
  id,
  valor,
  aoMudar,
  opcoes,
  vazio,
  placeholder = "Selecione",
  desabilitado,
  carregando,
  invalido,
  destacado,
  name,
  className,
  criar,
  ...aria
}: Props) {
  const atual = valor === "" ? (vazio !== undefined ? VAZIO : "") : valor;
  // Texto explícito: aparece já na renderização do servidor, antes de o menu existir.
  const rotuloAtual = valor === "" ? vazio : opcoes.find((o) => o.valor === valor)?.rotulo;
  return (
    <SelectPrimitive.Root
      value={atual}
      onValueChange={(v) => (v === CRIAR ? criar?.aoCriar() : aoMudar(v === VAZIO ? "" : v))}
      disabled={desabilitado || carregando}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={invalido || undefined}
        aria-busy={carregando || undefined}
        className={cn("group", classeGatilho(destacado), className)}
        {...aria}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder}>{rotuloAtual}</SelectPrimitive.Value>
        </span>
        <IconeFinal carregando={carregando} />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(classeMenu, "max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)")}
        >
          <SelectPrimitive.Viewport className="max-h-80 p-1.5">
            {vazio !== undefined ? <ItemSimples valor={VAZIO} rotulo={vazio} /> : null}
            {opcoes.map((o) => (
              <ItemSimples key={o.valor} {...o} />
            ))}
            {criar ? (
              <SelectPrimitive.Item value={CRIAR} className={classeCriar}>
                <Plus className="size-4 shrink-0" aria-hidden />
                <SelectPrimitive.ItemText>{criar.rotulo ?? "Criar novo"}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ) : null}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function ItemSimples({ valor, rotulo, detalhe, tomDetalhe }: OpcaoSelecao) {
  return (
    <SelectPrimitive.Item value={valor} className={cn(classeItem, "data-[state=checked]:font-semibold data-[state=checked]:text-titulo")}>
      <SelectPrimitive.ItemText>{rotulo}</SelectPrimitive.ItemText>
      <DetalheOpcao texto={detalhe} tom={tomDetalhe} />
      <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
        <Check className="size-4 text-primary dark:text-link" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function ComboboxPesquisavel({
  id,
  valor,
  aoMudar,
  opcoes,
  vazio,
  placeholder = "Selecione",
  desabilitado,
  carregando,
  invalido,
  destacado,
  name,
  className,
  criar,
  ...aria
}: Props) {
  const [aberto, setAberto] = useState(false);
  const idMenu = useId();
  const selecionada = opcoes.find((o) => o.valor === valor);
  const texto = selecionada?.rotulo ?? (valor === "" ? vazio : undefined);
  const todas: OpcaoSelecao[] = vazio !== undefined ? [{ valor: VAZIO, rotulo: vazio }, ...opcoes] : opcoes;

  const escolher = (v: string) => {
    aoMudar(v === VAZIO ? "" : v);
    setAberto(false);
  };

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild disabled={desabilitado || carregando}>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={aberto}
            aria-controls={idMenu}
            aria-invalid={invalido || undefined}
            aria-busy={carregando || undefined}
            data-state={aberto ? "open" : "closed"}
            data-placeholder={texto === undefined ? "" : undefined}
            className={cn("group", classeGatilho(destacado), className)}
            {...aria}
          >
            <span className="min-w-0 flex-1 truncate">{texto ?? placeholder}</span>
            <IconeFinal carregando={carregando} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          id={idMenu}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(classeMenu, "w-(--radix-popover-trigger-width) min-w-60 gap-0 p-0 ring-0")}
        >
          <Command
            loop
            label="Pesquisar opções"
            filter={(v, busca, palavras) => (normalizar(`${palavras?.join(" ") ?? ""} ${v}`).includes(normalizar(busca)) ? 1 : 0)}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input
                placeholder="Pesquisar…"
                className="h-11 w-full min-w-0 bg-transparent text-base text-titulo outline-none placeholder:text-muted-foreground/80 md:text-sm lg:h-10"
              />
            </div>
            <Command.List label="Opções" className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className={cn("px-3 text-center text-[13px] text-muted-foreground", criar ? "py-3" : "py-6")}>Nenhuma opção encontrada.</Command.Empty>
              {todas.map((o) => {
                const marcada = o.valor === VAZIO ? valor === "" : o.valor === valor;
                return (
                  <Command.Item
                    key={o.valor}
                    value={o.valor}
                    keywords={[o.rotulo]}
                    onSelect={escolher}
                    className={cn(classeItem, marcada && "font-semibold text-titulo")}
                  >
                    {o.rotulo}
                    <DetalheOpcao texto={o.detalhe} tom={o.tomDetalhe} />
                    {marcada ? (
                      <>
                        <Check className="absolute right-3 size-4 text-primary dark:text-link" aria-hidden />
                        <span className="sr-only">(selecionada)</span>
                      </>
                    ) : null}
                  </Command.Item>
                );
              })}
              {criar ? (
                // Sempre visível, mesmo com a pesquisa sem resultados.
                <Command.Item
                  value={CRIAR}
                  forceMount
                  onSelect={() => {
                    setAberto(false);
                    criar.aoCriar();
                  }}
                  className={classeCriar}
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  {criar.rotulo ?? "Criar novo"}
                </Command.Item>
              ) : null}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={valor} /> : null}
    </>
  );
}
