"use client";

import { ChevronDown, LayoutDashboard, LogOut, Monitor, UserRound } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { acaoTrocarVisao } from "@/server/acoes/administracao";
import { sair } from "@/server/acoes/autenticacao";

export type DadosUsuario = {
  nome: string;
  email: string;
  perfis: string[];
  visao?: "OPERACIONAL" | "GERENCIAL";
  podeTrocarVisao?: boolean;
  atalho?: { href: string; rotulo: string };
};

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function MenuUsuario({ usuario }: { usuario: DadosUsuario }) {
  const [pendente, iniciar] = useTransition();

  function trocarVisao(valor: string) {
    const dados = new FormData();
    dados.set("visao", valor);
    iniciar(() => acaoTrocarVisao(dados));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2 lg:h-9" data-testid="menu-usuario" aria-label={`Menu de ${usuario.nome}`}>
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
          >
            {iniciais(usuario.nome)}
          </span>
          <span className="hidden max-w-[16ch] truncate text-sm font-medium text-titulo sm:inline">{usuario.nome}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-semibold text-titulo">{usuario.nome}</p>
          <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{usuario.perfis.join(", ")}</p>
        </DropdownMenuLabel>
        {usuario.podeTrocarVisao ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Visão do painel</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={usuario.visao} onValueChange={trocarVisao}>
                <DropdownMenuRadioItem value="OPERACIONAL" disabled={pendente} data-testid="visao-operacional">
                  <Monitor className="size-4" aria-hidden />
                  Operacional
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="GERENCIAL" disabled={pendente} data-testid="visao-gerencial">
                  <LayoutDashboard className="size-4" aria-hidden />
                  Gerencial
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {usuario.atalho ? (
          <DropdownMenuItem asChild>
            <Link href={usuario.atalho.href}>
              <UserRound className="size-4" aria-hidden />
              {usuario.atalho.rotulo}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => iniciar(() => sair())}
          data-testid="sair"
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
