import { ChevronRight, Eye, PackageSearch, SearchX, UserRound } from "lucide-react";
import Link from "next/link";
import { EstadoVazio, formatarData } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { BadgeTer } from "@/components/inventario/visual";
import { CabecalhoOrdenavel, type Parametros } from "@/components/comum/tabela";
import { hrefFichaEquipamento } from "@/lib/retorno-empresa";
import { cn } from "@/lib/utils";
import type { AlocacaoEmpresa, ColaboradorEmpresa, EquipamentoEmpresa } from "@/server/modulos/empresa-registros";

/**
 * Tabelas de registros da empresa, usadas no modal (consulta rápida) e na página completa.
 * Ordenação por cabeçalho só existe na página (prop `ordenacao`, estado na URL).
 */
type Ordenacao = { base: string; parametros: Parametros };

const th = "h-10 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4";
const td = "px-3 py-2.5 align-middle first:pl-4 last:pr-4";

function Cabecalho({ campo, ordenacao, children, className }: { campo?: string; ordenacao?: Ordenacao; children: React.ReactNode; className?: string }) {
  if (ordenacao && campo) {
    return (
      <CabecalhoOrdenavel base={ordenacao.base} parametros={ordenacao.parametros} campo={campo} className={cn(th, "h-10", className)}>
        {children}
      </CabecalhoOrdenavel>
    );
  }
  return (
    <th scope="col" className={cn(th, className)}>
      {children}
    </th>
  );
}

const linkAcao =
  "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-link transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export const hrefFicha = (colaboradorId: string, empresaId: string) => `/ti/cadastros/pessoas/${colaboradorId}?empresa=${empresaId}`;

export function SemResultados({ filtrando, vazio }: { filtrando: boolean; vazio: { titulo: string; descricao: string } }) {
  return filtrando ? (
    <EstadoVazio icone={SearchX} titulo="Nenhum registro encontrado" descricao="Revise a pesquisa ou limpe os filtros." />
  ) : (
    <EstadoVazio icone={PackageSearch} titulo={vazio.titulo} descricao={vazio.descricao} />
  );
}

/* Colaboradores */

export function TabelaColaboradores({
  itens,
  empresaId,
  ordenacao,
}: {
  itens: ColaboradorEmpresa[];
  empresaId: string;
  ordenacao?: Ordenacao;
}) {
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Colaboradores da empresa</caption>
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[24%]" />
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <Cabecalho campo="nome" ordenacao={ordenacao}>Colaborador</Cabecalho>
              <Cabecalho campo="cargo" ordenacao={ordenacao}>Cargo</Cabecalho>
              <Cabecalho campo="departamento" ordenacao={ordenacao}>Departamento</Cabecalho>
              <Cabecalho campo="situacao" ordenacao={ordenacao}>Situação</Cabecalho>
              <Cabecalho className="text-right">Ações</Cabecalho>
            </tr>
          </thead>
          <tbody className="divide-y">
            {itens.map((c) => (
              <tr key={c.id} className="group transition-colors hover:bg-accent/40">
                <td className={td}>
                  <Link href={hrefFicha(c.id, empresaId)} className="block truncate font-semibold text-titulo underline-offset-4 group-hover:underline focus-visible:underline focus-visible:outline-none">
                    {c.nome}
                  </Link>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{c.email}</span>
                </td>
                <td className={cn(td, "truncate")} title={c.cargo}>{c.cargo}</td>
                <td className={cn(td, "truncate")} title={c.departamento}>{c.departamento}</td>
                <td className={td}>
                  <Estado grupo="colaborador" valor={c.situacao} />
                </td>
                <td className={cn(td, "text-right")}>
                  <Link href={hrefFicha(c.id, empresaId)} className={linkAcao} aria-label={`Abrir ficha de ${c.nome}`}>
                    Ficha <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {itens.map((c) => (
          <li key={c.id}>
            <Link href={hrefFicha(c.id, empresaId)} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden>
                <UserRound className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-titulo">{c.nome}</span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {c.cargo} · {c.departamento}
                </span>
              </span>
              <Estado grupo="colaborador" valor={c.situacao} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/* Equipamentos */

export function TabelaEquipamentos({
  itens,
  empresaId,
  retorno,
  ordenacao,
}: {
  itens: EquipamentoEmpresa[];
  empresaId: string;
  /** Parâmetros da tela atual (aba, pesquisa, filtros, ordenação, página) para o "Voltar" da ficha. */
  retorno: string;
  ordenacao?: Ordenacao;
}) {
  const ficha = (id: string) => hrefFichaEquipamento(id, { empresaId, retorno });
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Equipamentos da empresa</caption>
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[19%]" />
            <col className="w-[22%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <Cabecalho campo="modelo" ordenacao={ordenacao}>Equipamento</Cabecalho>
              <Cabecalho campo="patrimonio" ordenacao={ordenacao}>Patrimônio</Cabecalho>
              <Cabecalho campo="responsavel" ordenacao={ordenacao}>Responsável</Cabecalho>
              <Cabecalho campo="situacao" ordenacao={ordenacao}>Situação</Cabecalho>
              <Cabecalho className="text-right">Ações</Cabecalho>
            </tr>
          </thead>
          <tbody className="divide-y">
            {itens.map((a) => (
              <tr key={a.id} className="group transition-colors hover:bg-accent/40">
                <td className={td}>
                  <Link
                    href={ficha(a.id)}
                    title={`${a.marca} ${a.modelo}`}
                    className="block truncate rounded-sm font-semibold text-titulo underline-offset-4 group-hover:underline hover:text-link focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {a.marca} {a.modelo}
                  </Link>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {a.tipo}
                    {a.nome ? ` · ${a.nome}` : ""}
                  </span>
                </td>
                <td className={td}>
                  <span className="tabular block font-medium text-titulo">{a.patrimonio ?? "—"}</span>
                  {a.numeroSerie ? <span className="tabular block truncate text-[12.5px] text-muted-foreground">Série {a.numeroSerie}</span> : null}
                </td>
                <td className={cn(td, "truncate")}>
                  {a.responsavel ?? <span className="text-muted-foreground">Sem responsável</span>}
                </td>
                <td className={td}>
                  <Estado grupo="ativo" valor={a.situacao} />
                </td>
                <td className={cn(td, "text-right")}>
                  <Link href={ficha(a.id)} className={linkAcao} aria-label={`Abrir ficha do equipamento ${a.patrimonio ?? a.nome ?? a.modelo}`}>
                    Ficha <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {itens.map((a) => (
          <li key={a.id}>
            <Link href={ficha(a.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-titulo">
                  {a.marca} {a.modelo}
                </span>
                <span className="tabular block truncate text-[13px] text-muted-foreground">
                  {a.patrimonio ?? a.nome ?? "—"} · {a.responsavel ?? "Sem responsável"}
                </span>
              </span>
              <Estado grupo="ativo" valor={a.situacao} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/* Alocações */

export { BadgeTer } from "@/components/inventario/visual";

const SITUACAO: Record<AlocacaoEmpresa["situacao"], React.ReactNode> = {
  ENTREGUE: <Estado grupo="ativo" valor="ALOCADO" />,
  RESERVA: <Estado grupo="ativo" valor="RESERVADO" />,
  ENCERRADA: <Estado grupo="alocacao" valor="ENCERRADA" />,
};

export function SituacaoAlocacao({ situacao }: { situacao: AlocacaoEmpresa["situacao"] }) {
  return SITUACAO[situacao];
}

/** Cliques em links e botões da linha não abrem o detalhe (cada um tem sua ação). */
const doControle = (evento: React.MouseEvent) => (evento.target as HTMLElement).closest("a,button") !== null;

export function TabelaAlocacoes({
  itens,
  empresaId,
  ordenacao,
  aoVer,
}: {
  itens: AlocacaoEmpresa[];
  empresaId: string;
  ordenacao?: Ordenacao;
  /** Página completa: a linha e o botão "Ver detalhes" abrem o modal da alocação. */
  aoVer?: (alocacaoId: string) => void;
}) {
  const entrega = (a: AlocacaoEmpresa) =>
    a.dataEntrega ? (
      <span className="tabular font-medium text-titulo">{formatarData(a.dataEntrega)}</span>
    ) : (
      <span className="text-muted-foreground">Reserva · prevista para {formatarData(a.dataReferencia)}</span>
    );
  const botaoVer = (a: AlocacaoEmpresa) =>
    aoVer ? (
      <button
        type="button"
        onClick={() => aoVer(a.id)}
        className={linkAcao}
        aria-label={`Ver detalhes da alocação de ${a.patrimonio} para ${a.responsavel}`}
      >
        <Eye className="size-3.5" aria-hidden /> Detalhes
      </button>
    ) : null;
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Alocações de equipamentos da empresa</caption>
          <colgroup>
            <col className={aoVer ? "w-[27%]" : "w-[30%]"} />
            <col className={aoVer ? "w-[20%]" : "w-[22%]"} />
            <col className={aoVer ? "w-[16%]" : "w-[18%]"} />
            <col className={aoVer ? "w-[13%]" : "w-[15%]"} />
            <col className={aoVer ? "w-[13%]" : "w-[15%]"} />
            {aoVer ? <col className="w-[11%]" /> : null}
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <Cabecalho>Equipamento</Cabecalho>
              <Cabecalho>Responsável</Cabecalho>
              <Cabecalho campo="data" ordenacao={ordenacao}>Entrega</Cabecalho>
              <Cabecalho>Situação</Cabecalho>
              <Cabecalho>Termo (TER)</Cabecalho>
              {aoVer ? <Cabecalho className="text-right">Ações</Cabecalho> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {itens.map((a) => (
              <tr
                key={a.id}
                className={cn("transition-colors hover:bg-accent/40", aoVer && "cursor-pointer")}
                onClick={aoVer ? (evento) => !doControle(evento) && aoVer(a.id) : undefined}
              >
                <td className={td}>
                  <span className="block truncate font-semibold text-titulo" title={a.equipamento}>{a.equipamento}</span>
                  <span className="tabular block text-[12.5px] text-muted-foreground">{a.patrimonio}</span>
                </td>
                <td className={cn(td, "truncate")}>
                  <Link href={hrefFicha(a.responsavelId, empresaId)} className="font-medium text-titulo underline-offset-4 hover:underline">
                    {a.responsavel}
                  </Link>
                </td>
                <td className={cn(td, "text-[13px]")}>{entrega(a)}</td>
                <td className={td}>
                  <SituacaoAlocacao situacao={a.situacao} />
                </td>
                <td className={td}>
                  <BadgeTer estado={a.ter} />
                </td>
                {aoVer ? <td className={cn(td, "text-right")}>{botaoVer(a)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {itens.map((a) => (
          <li
            key={a.id}
            className={cn("flex flex-col gap-2 px-4 py-3", aoVer && "cursor-pointer hover:bg-accent/40")}
            onClick={aoVer ? (evento) => !doControle(evento) && aoVer(a.id) : undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-titulo">{a.equipamento}</span>
                <span className="tabular block text-[13px] text-muted-foreground">
                  {a.patrimonio} · {a.responsavel}
                </span>
              </span>
              <SituacaoAlocacao situacao={a.situacao} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span>Entrega: {entrega(a)}</span>
              <BadgeTer estado={a.ter} />
            </div>
            {aoVer ? <div className="-mx-2 -mb-1">{botaoVer(a)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
