"use client";

import { AlertTriangle, Download, Eye, FileSignature, FileUp, History } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EstadoVazio, formatarData } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MeuTer } from "@/server/modulos/ter-colaborador";
import { DialogoMeuTer, type MeuTerCabecalho } from "./dialogo-meu-ter";

const th = "h-11 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5";
const td = "h-[60px] px-3 py-2 align-middle first:pl-5";
const pdf = (t: MeuTer, baixar = false) => `/api/termos/${t.id}/pdf?arquivo=emitido&versao=${t.versao}${baixar ? "&baixar=1" : ""}`;

/** "+N" com os demais equipamentos no tooltip. */
function Equipamentos({ itens }: { itens: string[] }) {
  const [primeiro, ...outros] = itens;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="tabular truncate font-medium text-titulo">{primeiro ?? "—"}</span>
      {outros.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={`Outros equipamentos: ${outros.join(", ")}`} className="tabular inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-[11.5px] font-semibold text-muted-foreground">
              +{outros.length}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{outros.join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function ComDica({ dica, children }: { dica: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{dica}</TooltipContent>
    </Tooltip>
  );
}

/** Visualizar, Baixar, Anexar assinado e Histórico, sempre nas mesmas posições. */
function Acoes({ t, abrir }: { t: MeuTer; abrir: (t: MeuTer, o?: { enviar?: boolean; historico?: boolean }) => void }) {
  const motivoSemEnvio =
    t.situacao === "AGUARDANDO_CONFERENCIA"
      ? "documento já recebido, aguardando conferência"
      : t.situacao === "ASSINADO_CONFERIDO"
        ? "termo já assinado e conferido"
        : t.situacao === "CANCELADO"
          ? "termo cancelado"
          : "indisponível no momento";
  return (
    <span className="mx-auto grid w-[144px] grid-cols-4 place-items-center" data-testid="acoes-meu-ter">
      <ComDica dica="Visualizar">
        <Button variant="ghost" size="icon-sm" aria-label={`Visualizar ${t.numero}`} onClick={() => abrir(t)}>
          <Eye aria-hidden />
        </Button>
      </ComDica>
      <ComDica dica="Baixar PDF">
        <Button asChild variant="ghost" size="icon-sm">
          <a href={pdf(t, true)} aria-label={`Baixar o PDF do ${t.numero}`}>
            <Download aria-hidden />
          </a>
        </Button>
      </ComDica>
      {t.podeEnviar ? (
        <ComDica dica="Anexar TER assinado">
          <Button variant="ghost" size="icon-sm" className="text-primary dark:text-link" aria-label={`Anexar o ${t.numero} assinado`} onClick={() => abrir(t, { enviar: true })}>
            <FileUp aria-hidden />
          </Button>
        </ComDica>
      ) : (
        <ComDica dica={`Anexar TER assinado: ${motivoSemEnvio}`}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-disabled="true"
            aria-label={`Anexar assinado indisponível: ${motivoSemEnvio}`}
            className="cursor-not-allowed text-muted-foreground/45 hover:bg-transparent hover:text-muted-foreground/45"
            onClick={(e) => e.preventDefault()}
          >
            <FileUp aria-hidden />
          </Button>
        </ComDica>
      )}
      <ComDica dica="Histórico e situação">
        <Button variant="ghost" size="icon-sm" aria-label={`Histórico do ${t.numero}`} onClick={() => abrir(t, { historico: true })}>
          <History aria-hidden />
        </Button>
      </ComDica>
    </span>
  );
}

/**
 * Meus Termos de Responsabilidade: só os TERs do colaborador da sessão. Os que pedem a
 * assinatura dele ficam destacados; cancelados aparecem só para consulta.
 */
export function MeusTermos({ itens }: { itens: MeuTer[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const inicialUrl = busca.get("ter");
  const [aberto, setAberto] = useState<MeuTerCabecalho | null>(() => {
    const t = inicialUrl ? itens.find((x) => x.id === inicialUrl) : null;
    return t ? { id: t.id, numero: t.numero, situacao: t.situacao } : null;
  });
  const abrir = (t: MeuTer, o?: { enviar?: boolean; historico?: boolean }) => setAberto({ id: t.id, numero: t.numero, situacao: t.situacao, enviar: o?.enviar, historico: o?.historico });
  const fechar = () => {
    setAberto(null);
    if (!busca.get("ter")) return;
    const p = new URLSearchParams(busca.toString());
    p.delete("ter");
    router.replace(p.size ? `${caminho}?${p}` : caminho, { scroll: false });
  };

  const pendentes = itens.filter((t) => t.podeEnviar);
  const recusados = pendentes.filter((t) => t.situacao === "ASSINATURA_RECUSADA");

  if (!itens.length) {
    return (
      <div className="rounded-2xl border bg-card shadow-nivel-1">
        <EstadoVazio icone={FileSignature} titulo="Nenhum termo" descricao="Você ainda não possui termos de responsabilidade disponíveis." />
      </div>
    );
  }

  return (
    <>
      {pendentes.length ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-[13.5px] text-atencao" role="status" data-testid="aviso-termos-pendentes">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {pendentes.length === 1 ? "Você tem 1 termo aguardando sua assinatura." : `Você tem ${pendentes.length} termos aguardando sua assinatura.`}
          {recusados.length ? ` ${recusados.length === 1 ? "1 assinatura foi recusada" : `${recusados.length} assinaturas foram recusadas`} pela TI: veja o motivo e envie novamente.` : ""}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="hidden lg:block">
          <table className="w-full table-fixed text-sm" data-testid="tabela-meus-termos">
            <caption className="sr-only">Meus Termos de Responsabilidade</caption>
            <thead className="border-b bg-muted/40">
              <tr>
                <th scope="col" className={cn(th, "w-[17%]")}>
                  Número do TER
                </th>
                <th scope="col" className={cn(th, "w-[15%]")}>
                  Data da entrega
                </th>
                <th scope="col" className={th}>
                  Equipamentos
                </th>
                <th scope="col" className={cn(th, "w-[290px] text-center")}>
                  Situação da assinatura
                </th>
                <th scope="col" className={cn(th, "w-[168px] pr-5 text-center")}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {itens.map((t) => (
                <tr key={t.id} data-situacao={t.situacao} className={cn(t.historico ? "bg-muted/70 text-muted-foreground" : t.podeEnviar ? "bg-atencao-fundo/40" : undefined)}>
                  <td className={cn(td, t.podeEnviar && "border-l-[3px] border-l-atencao")}>
                    <span className={cn("tabular block truncate font-semibold", t.historico ? "text-muted-foreground line-through decoration-1" : "text-titulo")}>{t.numero}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      versão {t.versao}
                      {t.historico ? " · histórico" : t.versoesAnteriores ? " · substitui a anterior" : ""}
                    </span>
                  </td>
                  <td className={cn(td, "tabular whitespace-nowrap")}>{formatarData(t.entregueEm)}</td>
                  <td className={td}>
                    <Equipamentos itens={t.equipamentos} />
                  </td>
                  <td className={cn(td, "text-center")}>
                    <span className="inline-flex justify-center">
                      <Estado grupo="terColaborador" valor={t.situacao} />
                    </span>
                  </td>
                  <td className={cn(td, "pr-5")}>
                    <Acoes t={t} abrir={abrir} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y lg:hidden" data-testid="lista-meus-termos">
          {itens.map((t) => (
            <li key={t.id} className={cn("flex flex-col gap-2 px-4 py-3", t.historico ? "bg-muted/70" : t.podeEnviar ? "border-l-[3px] border-l-atencao bg-atencao-fundo/40" : undefined)} data-situacao={t.situacao}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn("tabular font-semibold", t.historico ? "text-muted-foreground line-through decoration-1" : "text-titulo")}>
                  {t.numero} <span className="font-normal text-muted-foreground no-underline">· versão {t.versao}</span>
                </span>
                <Estado grupo="terColaborador" valor={t.situacao} />
              </span>
              <span className="text-[13px] text-muted-foreground">
                Entrega em {formatarData(t.entregueEm)} · {t.equipamentos.join(", ")}
              </span>
              <span className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => abrir(t)}>
                  <Eye aria-hidden /> Visualizar
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <a href={pdf(t, true)}>
                    <Download aria-hidden /> Baixar
                  </a>
                </Button>
                {t.podeEnviar ? (
                  <Button size="sm" onClick={() => abrir(t, { enviar: true })}>
                    <FileUp aria-hidden /> Anexar assinado
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => abrir(t, { historico: true })}>
                  <History aria-hidden /> Histórico
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <DialogoMeuTer inicial={aberto} aoFechar={fechar} />
    </>
  );
}
