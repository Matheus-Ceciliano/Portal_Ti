"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPCOES = [
  { valor: "light", rotulo: "Claro", Icone: Sun },
  { valor: "dark", rotulo: "Escuro", Icone: Moon },
  { valor: "system", rotulo: "Do sistema", Icone: Monitor },
] as const;

const montado = () => true;
const noServidor = () => false;

export function AlternarTema({ className, sobreEscuro = false }: { className?: string; sobreEscuro?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const pronto = useSyncExternalStore(() => () => {}, montado, noServidor);
  const Icone = pronto && resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Tema da interface"
          data-testid="alternar-tema"
          className={cn(sobreEscuro && "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white", className)}
        >
          <Icone className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pronto ? theme : undefined} onValueChange={setTheme}>
          {OPCOES.map(({ valor, rotulo, Icone: I }) => (
            <DropdownMenuRadioItem key={valor} value={valor} data-testid={`tema-${valor}`}>
              <I className="size-4" aria-hidden />
              {rotulo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
