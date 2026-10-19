"use client";

import { Building2, Eye, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { EstadoVazio } from "@/components/comum/pagina";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatarCnpj } from "@/lib/cnpj";
import type { EmpresaResumo } from "@/server/modulos/empresas";
import { DialogoDetalhesEmpresa } from "./dialogo-detalhes-empresa";
import { DialogoFormularioEmpresa, type EmpresaEditavel } from "./dialogo-formulario-empresa";
import { LogoEmpresa } from "./logo-empresa";
import { SituacaoEmpresa } from "./situacao-empresa";

const th = "h-11 px-4 text-left align-middle text-[13px] font-semibold whitespace-nowrap text-muted-foreground";

/** Ignora cliques que vieram de botões ou links dentro da linha. */
const doControle = (evento: React.MouseEvent) => (evento.target as HTMLElement).closest("button, a, input");

function AcoesEmpresa({
  e,
  podeGerenciar,
  aoVer,
  aoEditar,
  semVer,
}: {
  e: EmpresaResumo;
  podeGerenciar: boolean;
  aoVer: () => void;
  aoEditar: () => void;
  /** No celular o próprio item abre os detalhes; o botão de ver é dispensado. */
  semVer?: boolean;
}) {
  return (
    <div className="flex justify-end gap-1">
      {semVer ? null : (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ver detalhes de ${e.nome}`} onClick={aoVer}>
            <Eye aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ver detalhes</TooltipContent>
      </Tooltip>
      )}
      {podeGerenciar ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${e.nome}`} onClick={aoEditar}>
              <Pencil aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar empresa</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}


export function GestaoEmpresas({
  empresas,
  podeGerenciar,
  armazenamentoDisponivel,
}: {
  empresas: EmpresaResumo[];
  podeGerenciar: boolean;
  armazenamentoDisponivel: boolean;
}) {
  const [detalhes, setDetalhes] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ aberto: boolean; empresa: EmpresaEditavel | null; chave: number }>({
    aberto: false,
    empresa: null,
    chave: 0,
  });

  const abrirFormulario = (empresa: EmpresaEditavel | null) =>
    setFormulario((f) => ({ aberto: true, empresa, chave: f.chave + 1 }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {empresas.length} {empresas.length === 1 ? "empresa cadastrada" : "empresas cadastradas"}
        </p>
        {podeGerenciar ? (
          <Button onClick={() => abrirFormulario(null)} data-testid="cadastrar-empresa">
            <Plus aria-hidden /> Cadastrar empresa
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        {empresas.length === 0 ? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhuma empresa cadastrada"
            descricao="Cadastre a primeira empresa do grupo para vincular pessoas e equipamentos."
            acao={podeGerenciar ? <Button onClick={() => abrirFormulario(null)}>Cadastrar empresa</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Empresas do grupo</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th scope="col" className={`${th} w-16 pl-5`}>Logo</th>
                    <th scope="col" className={th}>Nome da empresa</th>
                    <th scope="col" className={th}>CNPJ</th>
                    <th scope="col" className={`${th} text-right`}>Pessoas ativas</th>
                    <th scope="col" className={th}>Situação</th>
                    <th scope="col" className={`${th} pr-5 text-right`}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {empresas.map((e) => (
                    <tr
                      key={e.id}
                      className="cursor-pointer transition-colors hover:bg-accent/40"
                      onClick={(evento) => !doControle(evento) && setDetalhes(e.id)}
                    >
                      <td className="py-3 pr-2 pl-5">
                        <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetalhes(e.id)}
                          className="rounded-sm text-left font-semibold text-titulo underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                          {e.nome}
                        </button>
                        <span className="block text-[13px] text-muted-foreground">
                          {e.sigla} · {e.cidade}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 whitespace-nowrap text-foreground">{formatarCnpj(e.cnpj)}</td>
                      <td className="tabular px-4 py-3 text-right font-semibold text-titulo">{e.pessoasAtivas}</td>
                      <td className="px-4 py-3">
                        <SituacaoEmpresa ativa={e.ativa} />
                      </td>
                      <td className="py-3 pr-5 pl-4">
                        <AcoesEmpresa e={e} podeGerenciar={podeGerenciar} aoVer={() => setDetalhes(e.id)} aoEditar={() => abrirFormulario(e)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y md:hidden">
              {empresas.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                  <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} />
                  <button type="button" onClick={() => setDetalhes(e.id)} className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="line-clamp-2 font-semibold text-titulo">{e.nome}</span>
                    <span className="tabular block text-[13px] text-muted-foreground">{formatarCnpj(e.cnpj)}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                      <SituacaoEmpresa ativa={e.ativa} />
                      <span className="tabular">{e.pessoasAtivas} pessoas ativas</span>
                    </span>
                  </button>
                  <AcoesEmpresa semVer e={e} podeGerenciar={podeGerenciar} aoVer={() => setDetalhes(e.id)} aoEditar={() => abrirFormulario(e)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <DialogoDetalhesEmpresa
        empresaId={detalhes}
        inicial={empresas.find((e) => e.id === detalhes)}
        aoFechar={() => setDetalhes(null)}
        podeEditar={podeGerenciar}
        aoEditar={(dados) => {
          setDetalhes(null);
          abrirFormulario({ ...dados });
        }}
      />
      <DialogoFormularioEmpresa
        key={formulario.chave}
        aberto={formulario.aberto}
        aoMudar={(aberto) => setFormulario((f) => ({ ...f, aberto }))}
        empresa={formulario.empresa}
        armazenamentoDisponivel={armazenamentoDisponivel}
      />
    </>
  );
}
