"use client";

import {
  ArrowUpRight,
  Copy,
  Database,
  FlaskConical,
  Hand,
  Laptop,
  Network,
  PackageCheck,
  Truck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatarData } from "@/components/comum/pagina";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarCnpj } from "@/lib/cnpj";
import { cn } from "@/lib/utils";
import type { AbaEmpresa, ResumoEmpresa } from "@/server/modulos/empresa-registros";
import { hrefFicha } from "./tabelas-registros";

/** Filtros levados para a aba de destino (mesmos nomes da URL da página completa). */
export type FiltrosDestino = Record<string, string>;

function copiarCnpj(cnpj: string) {
  navigator.clipboard
    .writeText(formatarCnpj(cnpj))
    .then(() => toast.success("CNPJ copiado."))
    .catch(() => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."));
}

function Bloco({ titulo, origem, children, className }: { titulo: string; origem?: "real" | "ficticio"; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)} aria-label={titulo}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-[13px] font-bold tracking-normal text-titulo">{titulo}</h3>
        {origem ? (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            {origem === "real" ? <Database className="size-3" aria-hidden /> : <FlaskConical className="size-3 text-faixa" aria-hidden />}
            {origem === "real" ? "Banco do portal" : "Dados fictícios"}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type Tom = "sucesso" | "info" | "atencao" | "manual" | "neutro";

/** Cor só no ícone, sem fundo: o indicador fica discreto e o significado não depende da cor. */
const TONS: Record<Tom, string> = {
  sucesso: "text-sucesso",
  info: "text-info",
  atencao: "text-atencao",
  manual: "text-manual",
  neutro: "text-muted-foreground",
};

type Indicador = {
  titulo: string;
  valor: number;
  icone: LucideIcon;
  tom: Tom;
  aba: AbaEmpresa;
  filtros?: FiltrosDestino;
};

/** Indicador compacto: rótulo junto do número; clicar abre a aba com o filtro correspondente. */
function CartaoIndicador({ indicador: i, href, aoAbrir }: { indicador: Indicador; href?: string; aoAbrir?: () => void }) {
  const conteudo = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 font-semibold text-muted-foreground">
        <i.icone className={cn("size-4 shrink-0", TONS[i.tom])} aria-hidden />
        <span className="truncate">{i.titulo}</span>
      </span>
      <span className="tabular text-xl leading-7 font-bold text-titulo sm:text-[22px]">{i.valor}</span>
      <ArrowUpRight
        className="absolute top-2.5 right-2.5 hidden size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none sm:block"
        aria-hidden
      />
    </>
  );
  const classe = cn(
    "group relative flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-1.5 text-left sm:flex-col sm:items-start sm:justify-start sm:gap-0 sm:py-2",
    "transition-[border-color,background-color] duration-150 hover:border-foreground/25 hover:bg-muted/60",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
  );
  const rotulo = `${i.titulo}: ${i.valor}. Abrir ${i.aba === "colaboradores" ? "colaboradores" : "equipamentos"}${i.filtros ? " filtrados" : ""}`;
  return href ? (
    <Link href={href} className={classe} aria-label={rotulo}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={aoAbrir} className={classe} aria-label={rotulo}>
      {conteudo}
    </button>
  );
}

function GradeIndicadores({ indicadores, destino }: { indicadores: Indicador[]; destino: (i: Indicador) => { href?: string; aoAbrir?: () => void } }) {
  return (
    <ul className="grid gap-2 p-2.5 sm:grid-cols-3">
      {indicadores.map((i) => (
        <li key={i.titulo} className="flex">
          <CartaoIndicador indicador={i} {...destino(i)} />
        </li>
      ))}
    </ul>
  );
}

/** Estado de carregamento com a mesma geometria do resumo (evita salto de layout). */
export function ResumoCarregando() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando resumo">
      {[0, 1].map((b) => (
        <div key={b} className="rounded-xl border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="grid gap-2 p-2.5 sm:grid-cols-3">
            {[0, 1, 2].map((c) => (
              <Skeleton key={c} className="h-11 rounded-lg sm:h-[66px]" />
            ))}
          </div>
        </div>
      ))}
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function ResumoDaEmpresa({
  resumo,
  hrefBase,
  aoIrAba,
}: {
  resumo: ResumoEmpresa;
  /** Página completa: os cartões viram links (?tab=&filtros). */
  hrefBase?: string;
  /** Modal: os cartões trocam a aba (e aplicam os filtros). */
  aoIrAba?: (aba: AbaEmpresa, filtros?: FiltrosDestino) => void;
}) {
  const { empresa: e, colaboradores, equipamentos, alocacoes } = resumo;

  const destino = (aba: AbaEmpresa, filtros?: FiltrosDestino) =>
    hrefBase
      ? { href: `${hrefBase}?${new URLSearchParams({ tab: aba, ...filtros })}` }
      : { aoAbrir: () => aoIrAba?.(aba, filtros) };

  const indicadoresPessoas: Indicador[] = colaboradores
    ? [
        { titulo: "Ativos", valor: colaboradores.ativos, icone: UserCheck, tom: "sucesso", aba: "colaboradores", filtros: { situacao: "ATIVO" } },
        { titulo: "Afastados", valor: colaboradores.afastados, icone: Hand, tom: "manual", aba: "colaboradores", filtros: { situacao: "AFASTADO" } },
        { titulo: "Departamentos", valor: colaboradores.departamentos, icone: Network, tom: "neutro", aba: "colaboradores" },
      ]
    : [];
  const indicadoresEquipamentos: Indicador[] = equipamentos
    ? [
        { titulo: "Alocados", valor: equipamentos.alocados, icone: Laptop, tom: "sucesso", aba: "equipamentos", filtros: { situacao: "ALOCADO" } },
        { titulo: "Disponíveis", valor: equipamentos.disponiveis, icone: PackageCheck, tom: "info", aba: "equipamentos", filtros: { situacao: "DISPONIVEL" } },
        { titulo: "Reservados", valor: equipamentos.reservados, icone: Truck, tom: "atencao", aba: "equipamentos", filtros: { situacao: "RESERVADO" } },
      ]
    : [];

  const dados: [string, React.ReactNode][] = [
    ["Razão social", e.nome],
    ["Sigla", e.sigla],
    [
      "CNPJ",
      <span key="cnpj" className="flex items-center gap-1">
        <span className="tabular" data-testid="cnpj-completo">{formatarCnpj(e.cnpj)}</span>
        <Button variant="ghost" size="icon-xs" aria-label="Copiar CNPJ" onClick={() => copiarCnpj(e.cnpj)}>
          <Copy aria-hidden />
        </Button>
      </span>,
    ],
    ["Cidade", e.cidade],
    ["Responsável", e.responsavel ?? "Não informado"],
    ["Cadastrada em", formatarData(e.criadoEm)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco titulo="Colaboradores" origem="real">
        {colaboradores ? (
          <GradeIndicadores indicadores={indicadoresPessoas} destino={(i) => destino(i.aba, i.filtros)} />
        ) : (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Seu perfil não permite consultar colaboradores.</p>
        )}
      </Bloco>
      <Bloco titulo="Equipamentos" origem="real">
        {equipamentos ? (
          <GradeIndicadores indicadores={indicadoresEquipamentos} destino={(i) => destino(i.aba, i.filtros)} />
        ) : (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Seu perfil não permite consultar equipamentos.</p>
        )}
      </Bloco>

      <Bloco titulo="Dados da empresa" origem="real">
        <dl className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:grid-cols-2">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
              <dd className="font-semibold break-words text-titulo">{valor}</dd>
            </div>
          ))}
          {e.observacoes ? (
            <div className="sm:col-span-2">
              <dt className="text-[12.5px] text-muted-foreground">Observações</dt>
              <dd className="whitespace-pre-line text-foreground">{e.observacoes}</dd>
            </div>
          ) : null}
        </dl>
      </Bloco>

      <Bloco titulo="Alocações recentes" origem="real">
        {!alocacoes ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Seu perfil não permite consultar alocações.</p>
        ) : alocacoes.recentes.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma entrega registrada para esta empresa.</p>
        ) : (
          <ol className="divide-y">
            {alocacoes.recentes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-titulo">{a.equipamento}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    <Link href={hrefFicha(a.responsavelId, e.id)} className="underline-offset-4 hover:underline">
                      {a.responsavel}
                    </Link>{" "}
                    · {a.patrimonio}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[12.5px] text-muted-foreground">{a.dataEntrega ? formatarData(a.dataEntrega) : "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </Bloco>
    </div>
  );
}
