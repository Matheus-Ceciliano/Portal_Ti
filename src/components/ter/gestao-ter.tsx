"use client";

import { AlertTriangle, Ban, CheckCircle2, ChevronDown, Download, Eye, FileClock, FileSignature, FileText, FlaskConical, History, MoreHorizontal, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import { CabecalhoPagina, EstadoVazio, formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, hrefCom, Paginacao, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { acoesDoTer, ROTULO_SITUACAO_TER, SITUACOES_TER, type AcaoTer, type SituacaoTer } from "@/lib/ter";
import { cn } from "@/lib/utils";
import type { LinhaTer, ResultadoTers } from "@/server/modulos/ter";
import { DialogoDetalhesTer, type AbaTer, type TerCabecalho } from "./dialogo-detalhes-ter";
import { DialogoModeloTer } from "./dialogo-modelo-ter";

const BASE = "/ti/documentos/ter";
const th = "h-11 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5";
/** Altura fixa: todas as linhas iguais, conteúdo em até duas linhas. */
const td = "h-[60px] px-3 py-2 align-middle first:pl-5";
const FUNDO_CANCELADO = "bg-muted/90 dark:bg-muted/55";

/** Operações do menu "Mais opções", na ordem do fluxo (cancelar fica por último, separado). */
const ROTULO_ACAO_LINHA: Record<AcaoTer, string> = {
  gerar: "Gerar novamente",
  enviar: "Enviar para assinatura",
  reenviar: "Reenviar para assinatura",
  anexar: "Anexar PDF assinado",
  conferir: "Conferir assinatura",
  substituir: "Nova versão (substituir)",
  cancelar: "Cancelar TER",
};

type Ver = (l: LinhaTer, opcoes?: { acao?: AcaoTer; aba?: AbaTer }) => void;

/** "+N" com os demais equipamentos no tooltip. */
function Mais({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Outros equipamentos: ${itens.join(", ")}`}
          className="tabular inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-[11.5px] font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          +{itens.length}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{itens.join(", ")}</TooltipContent>
    </Tooltip>
  );
}

function Equipamentos({ l }: { l: LinhaTer }) {
  const [primeiro, ...outros] = l.equipamentos;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="tabular truncate font-medium text-titulo">{primeiro ?? "—"}</span>
      <Mais itens={outros} />
    </span>
  );
}

/** Botão de ícone com o nome da ação no tooltip. */
function ComDica({ dica, children }: { dica: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{dica}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Ações da linha em três posições fixas — Visualizar, Baixar, Mais opções —, iguais em todas as
 * linhas (canceladas e registros anteriores também). Sem PDF, "Baixar" fica indisponível, com o
 * motivo no tooltip e no nome acessível; nada se desloca.
 */
function AcoesLinha({ l, acoes, ver }: { l: LinhaTer; acoes: ResultadoTers["acoes"]; ver: Ver }) {
  const d = acoesDoTer(l, acoes);
  const operacoes = (Object.keys(ROTULO_ACAO_LINHA) as AcaoTer[]).filter((a) => d[a] && a !== "cancelar");
  return (
    <span className="mx-auto grid w-[104px] grid-cols-3 place-items-center" data-testid="acoes-ter">
      <ComDica dica="Visualizar">
        <Button variant="ghost" size="icon-sm" aria-label={`Visualizar ${l.numero}`} onClick={() => ver(l)}>
          <Eye aria-hidden />
        </Button>
      </ComDica>
      {d.pdf && l.hrefPdf ? (
        <ComDica dica="Baixar PDF">
          <Button asChild variant="ghost" size="icon-sm">
            <a href={`${l.hrefPdf}${l.hrefPdf.includes("?") ? "&" : "?"}baixar=1`} aria-label={`Baixar o PDF do ${l.numero}`}>
              <Download aria-hidden />
            </a>
          </Button>
        </ComDica>
      ) : (
        <ComDica dica={`Baixar PDF: ${l.semPdf ?? "sem permissão para baixar"}`}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-disabled="true"
            aria-label={`Baixar PDF indisponível: ${l.semPdf ?? "sem permissão para baixar"}`}
            className="cursor-not-allowed text-muted-foreground/45 hover:bg-transparent hover:text-muted-foreground/45"
            onClick={(e) => e.preventDefault()}
          >
            <Download aria-hidden />
          </Button>
        </ComDica>
      )}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Mais opções do ${l.numero}`}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Mais opções</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" collisionPadding={12} className="w-64">
          {d.pdf && l.hrefPdf ? (
            <DropdownMenuItem asChild>
              <a href={l.hrefPdf} target="_blank" rel="noopener">
                <FileText className="size-4" aria-hidden /> Visualizar PDF
              </a>
            </DropdownMenuItem>
          ) : null}
          {operacoes.map((a) => (
            <DropdownMenuItem key={a} onSelect={() => ver(l, { acao: a })}>
              {ROTULO_ACAO_LINHA[a]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => ver(l, { aba: "documento" })}>
            <FileSignature className="size-4" aria-hidden /> Documento e versões
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ver(l, { aba: "historico" })}>
            <History className="size-4" aria-hidden /> Histórico
          </DropdownMenuItem>
          {d.cancelar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => ver(l, { acao: "cancelar" })} className="text-destructive focus:text-destructive">
                <Ban className="size-4" aria-hidden /> {ROTULO_ACAO_LINHA.cancelar}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function GestaoTer({ resultado, parametros, filtrando }: { resultado: ResultadoTers; parametros: Parametros; filtrando: boolean }) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const [modelo, setModelo] = useState(false);
  const inicialUrl = busca.get("ter");
  const [detalhe, setDetalhe] = useState<TerCabecalho | null>(() => {
    if (!inicialUrl) return null;
    const l = resultado.linhas.find((x) => x.id === inicialUrl);
    return { id: inicialUrl, numero: l?.numero ?? "TER", colaborador: l?.colaborador.nome ?? "", situacao: l?.situacao ?? "AGUARDANDO_ENVIO" };
  });
  const ver: Ver = (l, o) => setDetalhe({ id: l.id, numero: l.numero, colaborador: l.colaborador.nome, situacao: l.situacao, acao: o?.acao ?? null, aba: o?.aba });
  const fechar = () => {
    setDetalhe(null);
    if (!busca.get("ter")) return;
    const p = new URLSearchParams(busca.toString());
    p.delete("ter");
    router.replace(p.size ? `${caminho}?${p}` : caminho, { scroll: false });
  };

  const i = resultado.indicadores;
  const indicadores: { titulo: string; valor: number; icone: LucideIcon; tom: string; situacao?: SituacaoTer }[] = [
    { titulo: "Total de TERs", valor: i.total, icone: FileSignature, tom: "text-info" },
    { titulo: "Aguardando assinatura", valor: i.aguardandoAssinatura, icone: FileClock, tom: "text-atencao", situacao: "AGUARDANDO_ASSINATURA" },
    { titulo: "Aguardando conferência", valor: i.aguardandoConferencia, icone: ShieldCheck, tom: "text-manual", situacao: "AGUARDANDO_CONFERENCIA" },
    { titulo: "Assinados e conferidos", valor: i.assinados, icone: CheckCircle2, tom: "text-sucesso", situacao: "ASSINADO_CONFERIDO" },
    { titulo: "Cancelados", valor: i.cancelados, icone: Ban, tom: "text-muted-foreground", situacao: "CANCELADO" },
  ];
  const resumo = filtrando ? `${resultado.total} de ${resultado.totalGeral} TERs` : `${resultado.total} ${resultado.total === 1 ? "TER" : "TERs"}`;
  const ordem: Parametros = { ...parametros, ordenar: parametros.ordenar ?? "numero", direcao: parametros.ordenar ? parametros.direcao : "desc" };
  const opcoesSituacao = SITUACOES_TER.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO_TER[s] }));

  return (
    <>
      <CabecalhoPagina
        titulo="TER: termos de entrega"
        descricao="Termos de Entrega, Guarda e Responsabilidade gerados automaticamente na entrega física. Assinatura pelo GOV.BR, fora do portal, com conferência pela TI."
        trilha={[{ rotulo: "Documentos" }, { rotulo: "TER" }]}
        acoes={
          <Button variant="secondary" onClick={() => setModelo(true)} data-testid="modelo-ter">
            <FileText aria-hidden /> Modelo do documento
          </Button>
        }
      />

      {resultado.ambienteTeste ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-[13px] text-atencao" data-testid="aviso-ambiente-teste">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          Ambiente fora de produção: os PDFs emitidos aqui saem marcados como documento de teste, sem validade como termo oficial.
        </p>
      ) : null}

      <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="indicadores-ter">
        {indicadores.map((c) => {
          const ativo = Boolean(c.situacao) && parametros.situacao === c.situacao;
          return (
            <li key={c.titulo} className="flex">
              <Link
                href={hrefCom(BASE, { ...parametros, pagina: undefined }, { situacao: ativo || !c.situacao ? undefined : c.situacao })}
                aria-label={`${c.titulo}: ${c.valor}. ${c.situacao ? "Filtrar a lista" : "Mostrar todos"}`}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-foreground/25 hover:bg-muted/60",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
                  ativo && "border-primary bg-accent/70 dark:border-link",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 font-semibold text-muted-foreground">
                  <c.icone className={cn("size-4 shrink-0", c.tom)} aria-hidden />
                  <span className="truncate">{c.titulo}</span>
                </span>
                <span className="tabular text-lg leading-6 font-bold text-titulo">{c.valor}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {i.pendencias > 0 ? (
        <Link
          href={hrefCom(BASE, {}, { situacao: "PENDENTE_CADASTRO" })}
          className="mb-4 flex items-center gap-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-[13px] font-medium text-atencao hover:underline"
          data-testid="aviso-pendencias-ter"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {i.pendencias === 1 ? "1 TER sem PDF" : `${i.pendencias} TERs sem PDF`} por pendência de cadastro ou erro na geração. Ver os pendentes
          <ChevronDown className="size-4 -rotate-90" aria-hidden />
        </Link>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b p-4 sm:px-5">
          <FiltrosUrl
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por TER, alocação, colaborador ou equipamento"
            rotuloBusca="Pesquisar TERs"
            chavesFiltro={["empresa", "periodo", "situacao"]}
            resumo={resumo}
            filtros={[
              { chave: "empresa", rotulo: "Empresa", todos: "Todas as empresas", opcoes: resultado.empresas.map((e) => ({ valor: e.id, rotulo: e.nome })), valor: parametros.empresa ?? "", pesquisavel: true },
              {
                chave: "periodo",
                rotulo: "Período de emissão",
                todos: "Qualquer período",
                opcoes: [
                  { valor: "7", rotulo: "Últimos 7 dias" },
                  { valor: "30", rotulo: "Últimos 30 dias" },
                  { valor: "90", rotulo: "Últimos 90 dias" },
                  { valor: "365", rotulo: "Últimos 12 meses" },
                ],
                valor: parametros.periodo ?? "",
              },
              { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: opcoesSituacao, valor: parametros.situacao ?? "" },
            ]}
          />
        </div>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={FileSignature}
            titulo={filtrando ? "Nenhum TER encontrado" : "Nenhum TER emitido"}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : "O TER é gerado automaticamente quando uma alocação tem a entrega física confirmada."}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm" data-testid="tabela-ter">
                <caption className="sr-only">Termos de entrega (TER)</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <CabecalhoOrdenavel base={BASE} parametros={ordem} campo="numero" className={cn(th, "w-[19%] lg:w-[12%]")}>
                      TER
                    </CabecalhoOrdenavel>
                    <th scope="col" className={cn(th, "hidden lg:table-cell lg:w-[10%]")}>
                      Alocação
                    </th>
                    <CabecalhoOrdenavel base={BASE} parametros={ordem} campo="colaborador" className={th}>
                      Colaborador
                    </CabecalhoOrdenavel>
                    <th scope="col" className={cn(th, "hidden xl:table-cell xl:w-[7%]")}>
                      Empresa
                    </th>
                    <th scope="col" className={cn(th, "w-[20%] lg:w-[15%]")}>
                      Equipamentos
                    </th>
                    <CabecalhoOrdenavel base={BASE} parametros={ordem} campo="emissao" className={cn(th, "hidden lg:table-cell lg:w-[9%]")}>
                      Emissão
                    </CabecalhoOrdenavel>
                    <th scope="col" className={cn(th, "w-[196px] text-center")}>
                      Situação
                    </th>
                    <th scope="col" className={cn(th, "w-[128px] pr-5 text-center")}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((l) => {
                    const cancelado = l.situacao === "CANCELADO";
                    return (
                      <tr
                        key={l.id}
                        data-situacao={l.situacao}
                        className={cn("cursor-pointer transition-colors", cancelado ? cn(FUNDO_CANCELADO, "text-muted-foreground hover:bg-muted dark:hover:bg-muted/70") : "hover:bg-accent/40")}
                        onClick={(e) => !(e.target as HTMLElement).closest("a,button,[tabindex],[role=menuitem]") && ver(l)}
                      >
                        <td className={td}>
                          <span className={cn("tabular block truncate font-semibold whitespace-nowrap", cancelado ? "text-muted-foreground line-through decoration-1" : "text-titulo")} title={l.numero}>
                            {l.numero}
                          </span>
                          {l.versao && l.versao > 1 ? <span className="block text-[12px] text-muted-foreground">versão {l.versao}</span> : null}
                        </td>
                        <td className={cn(td, "hidden lg:table-cell")}>
                          {l.alocacao ? (
                            <Link href={`/ti/alocacoes?alocacao=${l.alocacao.id}`} className="tabular block truncate whitespace-nowrap underline-offset-4 hover:underline" title={l.alocacao.numero}>
                              {l.alocacao.numero}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={td}>
                          <Link href={`/ti/cadastros/pessoas/${l.colaborador.id}`} className={cn("block truncate font-medium underline-offset-4 hover:underline", cancelado ? "text-foreground/75" : "text-titulo")}>
                            {l.colaborador.nome}
                          </Link>
                          {l.arquivoPeloPortal ? (
                            <span className="block truncate text-[12.5px] font-medium text-manual" data-testid="enviado-pelo-portal">
                              PDF enviado pelo colaborador
                            </span>
                          ) : (
                            <span className="block truncate text-[12.5px] text-muted-foreground xl:hidden">{l.empresa?.sigla ?? "—"}</span>
                          )}
                        </td>
                        <td className={cn(td, "hidden xl:table-cell")}>
                          <span className="block truncate" title={l.empresa?.nome}>
                            {l.empresa?.sigla ?? "—"}
                          </span>
                        </td>
                        <td className={td}>
                          <Equipamentos l={l} />
                        </td>
                        <td className={cn(td, "tabular hidden text-[13px] whitespace-nowrap lg:table-cell")}>{l.emitidoEm ? formatarData(l.emitidoEm) : <span className="text-muted-foreground">—</span>}</td>
                        <td className={cn(td, "text-center")}>
                          <span className="inline-flex items-center justify-center" data-testid="situacao-ter">
                            <Estado grupo="ter" valor={l.situacao} />
                          </span>
                        </td>
                        <td className={cn(td, "pr-5")}>
                          <AcoesLinha l={l} acoes={resultado.acoes} ver={ver} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden" data-testid="lista-ter">
              {resultado.linhas.map((l) => {
                const cancelado = l.situacao === "CANCELADO";
                return (
                  <li key={l.id} className={cn("flex items-stretch", cancelado && FUNDO_CANCELADO)} data-situacao={l.situacao}>
                    <button type="button" onClick={() => ver(l)} className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pr-2 pl-4 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn("tabular font-semibold", cancelado ? "text-muted-foreground line-through decoration-1" : "text-titulo")}>{l.numero}</span>
                        <Estado grupo="ter" valor={l.situacao} />
                      </span>
                      <span className={cn("truncate text-[13.5px]", cancelado ? "text-foreground/75" : "text-titulo")}>
                        {l.colaborador.nome} <span className="text-muted-foreground">· {l.empresa?.sigla ?? "—"}</span>
                      </span>
                      <span className="truncate text-[12.5px] text-muted-foreground">
                        {l.alocacao?.numero ?? "—"} · {l.equipamentos.join(", ")}
                      </span>
                      <span className="tabular text-[12.5px] text-muted-foreground">{l.emitidoEm ? `Emitido em ${formatarDataHora(l.emitidoEm)}` : (l.semPdf ?? "PDF não emitido")}</span>
                    </button>
                    <span className="flex shrink-0 items-center pr-2">
                      <AcoesLinha l={l} acoes={resultado.acoes} ver={ver} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} rotulo="TERs" />
          </>
        )}
      </div>

      <DialogoDetalhesTer inicial={detalhe} aoFechar={fechar} />
      <DialogoModeloTer aberto={modelo} aoMudar={setModelo} />
    </>
  );
}
