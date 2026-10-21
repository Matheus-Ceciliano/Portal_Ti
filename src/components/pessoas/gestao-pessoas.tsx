"use client";

import { Eye, Layers, Pencil, Plus, UserRoundX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FiltrosUrl } from "@/components/comum/filtros-url";
import { CabecalhoPagina, EstadoVazio } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, Paginacao, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { acaoDetalhePessoa } from "@/server/acoes/pessoas";
import type { GrupoLicencaItem } from "@/server/modulos/grupos-licenca";
import type { DetalhePessoa, listarPessoas } from "@/server/modulos/pessoas";
import { AvatarPessoa } from "./avatar-pessoa";
import { DialogoDetalhesPessoa, type PessoaCabecalho } from "./dialogo-detalhes-pessoa";
import { DialogoFormularioPessoa, type EmpresaOpcao, type PessoaEditavel } from "./dialogo-formulario-pessoa";
import { DialogoGruposLicenca } from "./dialogo-grupos-licenca";

type Resultado = Awaited<ReturnType<typeof listarPessoas>>;
type Linha = Resultado["linhas"][number];

const BASE = "/ti/cadastros/pessoas";
const th = "h-11 px-3 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground first:pl-5";
const td = "px-3 py-2.5 align-middle first:pl-5";

/** Ignora cliques que vieram de botões ou links dentro da linha. */
const doControle = (evento: React.MouseEvent) => (evento.target as HTMLElement).closest("button, a, input");

const SITUACOES = [
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "PRE_CADASTRO", rotulo: "Pré-cadastro" },
  { valor: "AFASTADO", rotulo: "Afastado" },
  { valor: "DESLIGADO", rotulo: "Desligado" },
];

function paraEditavel(d: DetalhePessoa): PessoaEditavel {
  const p = d.pessoa;
  return {
    id: p.id,
    nome: p.nome,
    segundoNome: p.segundoNome,
    sobrenomeUtilizado: p.sobrenomeUtilizado,
    empresaId: p.empresa.id,
    cargo: p.cargo,
    departamento: p.departamento,
    situacao: p.situacao,
    grupoLicencaId: p.grupoLicenca?.id ?? null,
    nomeServidorPc: p.nomeServidorPc,
    loginUau: p.loginUau,
    loginMicrosoft: p.loginMicrosoft,
    email: p.email,
    fotoUrl: p.fotoUrl,
    cpf: p.cpf,
  };
}

export function GestaoPessoas({
  resultado,
  editaveis,
  parametros,
  filtrando,
  empresas,
  grupos,
  podeCadastrar,
  podeProvisionar,
  podeGerenciarCatalogo,
}: {
  resultado: Resultado;
  /** Linhas que o ator pode editar (equipe de TI exige perfil administrativo; decidido no servidor). */
  editaveis: string[];
  parametros: Parametros;
  filtrando: boolean;
  empresas: (EmpresaOpcao & { ativa: boolean })[];
  grupos: GrupoLicencaItem[];
  podeCadastrar: boolean;
  podeProvisionar: boolean;
  podeGerenciarCatalogo: boolean;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const [detalhes, setDetalhes] = useState<PessoaCabecalho | null>(null);
  const [formulario, setFormulario] = useState<{ aberto: boolean; pessoa: PessoaEditavel | null; chave: number }>({
    aberto: podeCadastrar && busca.get("cadastrar") === "1",
    pessoa: null,
    chave: 0,
  });
  const [gruposAberto, setGruposAberto] = useState(false);
  const [carregandoEdicao, setCarregandoEdicao] = useState<string | null>(null);

  const abrirCadastro = () => setFormulario((f) => ({ aberto: true, pessoa: null, chave: f.chave + 1 }));
  const abrirEdicao = (d: DetalhePessoa) => {
    setDetalhes(null);
    setFormulario((f) => ({ aberto: true, pessoa: paraEditavel(d), chave: f.chave + 1 }));
  };
  async function editarPelaLinha(id: string) {
    setCarregandoEdicao(id);
    const r = await acaoDetalhePessoa(id).catch(() => null);
    setCarregandoEdicao(null);
    if (!r?.ok) {
      toast.error(r?.erro ?? "Não foi possível carregar a pessoa. Tente novamente.");
      return;
    }
    abrirEdicao(r.dados);
  }
  // ?editar=<id> (ex.: pendência de cadastro no TER) abre a edição da pessoa uma vez.
  const editarUrl = busca.get("editar");
  useEffect(() => {
    if (!editarUrl || !editaveis.includes(editarUrl)) return;
    let ativo = true;
    acaoDetalhePessoa(editarUrl)
      .then((r) => ativo && (r.ok ? abrirEdicao(r.dados) : toast.error(r.erro)))
      .catch(() => ativo && toast.error("Não foi possível carregar a pessoa. Tente novamente."));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o parâmetro da URL dispara
  }, [editarUrl]);
  const mudarFormulario = (aberto: boolean) => {
    // Fechar recria o formulário: nada do cadastro (inclusive a senha, derivada dos campos) fica no estado.
    setFormulario((f) => ({ ...f, aberto, chave: aberto ? f.chave : f.chave + 1 }));
    // ?cadastrar=1 (endereço antigo /nova) e ?editar=<id> só abrem uma vez.
    if (!aberto && (busca.get("cadastrar") || busca.get("editar"))) {
      const p = new URLSearchParams(busca.toString());
      p.delete("cadastrar");
      p.delete("editar");
      router.replace(p.size ? `${caminho}?${p}` : caminho, { scroll: false });
    }
  };

  const ver = (l: Linha) => setDetalhes({ id: l.id, nome: l.nome, cargo: l.cargo, situacao: l.situacao, empresa: l.empresa, fotoUrl: l.fotoUrl });
  const podeEditarLinha = (l: Linha) => editaveis.includes(l.id);
  const { total, totalGeral } = resultado;
  const resumo = filtrando ? `${total} de ${totalGeral} ${totalGeral === 1 ? "pessoa" : "pessoas"}` : `${total} ${total === 1 ? "pessoa" : "pessoas"}`;

  const acoesCabecalho = (
    <div className="flex flex-wrap gap-2">
      {podeGerenciarCatalogo ? (
        <Button variant="secondary" onClick={() => setGruposAberto(true)}>
          <Layers aria-hidden /> Grupos de licença
        </Button>
      ) : null}
      {podeCadastrar ? (
        <Button onClick={abrirCadastro} data-testid="cadastrar-pessoa">
          <Plus aria-hidden /> Cadastrar pessoa
        </Button>
      ) : null}
    </div>
  );

  const acoesLinha = (l: Linha, semVer?: boolean) => (
    <div className="flex justify-end gap-1">
      {semVer ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Ver detalhes de ${l.nome}`} onClick={() => ver(l)}>
              <Eye aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver detalhes</TooltipContent>
        </Tooltip>
      )}
      {podeEditarLinha(l) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${l.nome}`}
              carregando={carregandoEdicao === l.id}
              onClick={() => void editarPelaLinha(l.id)}
            >
              <Pencil aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar pessoa</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );

  return (
    <>
      <CabecalhoPagina titulo="Pessoas" trilha={[{ rotulo: "Cadastros" }, { rotulo: "Pessoas" }]} acoes={acoesCabecalho} />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-nivel-1">
        <div className="border-b p-4 sm:px-5">
          <FiltrosUrl
            busca={parametros.busca ?? ""}
            placeholder="Pesquisar por nome, e-mail, empresa ou cargo"
            rotuloBusca="Pesquisar pessoas"
            chavesFiltro={["empresa", "situacao", "departamento", "grupo"]}
            resumo={resumo}
            filtros={[
              {
                chave: "empresa",
                rotulo: "Empresa",
                todos: "Todas as empresas",
                opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome })),
                valor: parametros.empresa ?? "",
                pesquisavel: true,
              },
              { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: SITUACOES, valor: parametros.situacao ?? "" },
              {
                chave: "departamento",
                rotulo: "Departamento",
                todos: "Todos os departamentos",
                opcoes: resultado.departamentos.map((d) => ({ valor: d, rotulo: d })),
                valor: parametros.departamento ?? "",
                pesquisavel: true,
              },
              {
                chave: "grupo",
                rotulo: "Grupo de licença",
                todos: "Todos os grupos",
                opcoes: grupos.map((g) => ({ valor: g.id, rotulo: g.ativo ? g.nome : `${g.nome} (inativo)` })),
                valor: parametros.grupo ?? "",
              },
            ]}
          />
        </div>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={UserRoundX}
            titulo={filtrando ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada"}
            descricao={filtrando ? "Revise a pesquisa ou limpe os filtros." : "Cadastre a primeira pessoa para começar."}
            acao={!filtrando && podeCadastrar ? <Button onClick={abrirCadastro}>Cadastrar pessoa</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Pessoas cadastradas</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="nome" className={cn(th, "w-[44%] lg:w-[33%]")}>Colaborador</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="empresa" className={cn(th, "w-[28%] lg:w-[25%]")}>Empresa</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="cargo" className={cn(th, "hidden lg:table-cell lg:w-[22%]")}>Cargo</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="situacao" className={cn(th, "w-[16%] lg:w-[12%]")}>Situação</CabecalhoOrdenavel>
                    <th scope="col" className={cn(th, "w-[12%] pr-5 text-right lg:w-[8%]")}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((l) => (
                    <tr key={l.id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={(e) => !doControle(e) && ver(l)}>
                      <td className={td}>
                        <span className="flex min-w-0 items-center gap-3">
                          <AvatarPessoa url={l.fotoUrl} nome={l.nome} />
                          <span className="min-w-0">
                            <button
                              type="button"
                              onClick={() => ver(l)}
                              className="block max-w-full truncate rounded-sm text-left font-semibold text-titulo underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {l.nome}
                            </button>
                            <span className="block truncate text-[12.5px] text-muted-foreground">{l.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className={cn(td, "truncate")} title={l.empresa.nome}>
                        {l.empresa.nome}
                      </td>
                      <td className={cn(td, "hidden truncate lg:table-cell")} title={l.cargo}>
                        {l.cargo || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={td}>
                        <Estado grupo="colaborador" valor={l.situacao} />
                      </td>
                      <td className={cn(td, "pr-5")}>{acoesLinha(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y md:hidden">
              {resultado.linhas.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3.5">
                  <AvatarPessoa url={l.fotoUrl} nome={l.nome} tamanho="md" />
                  <button type="button" onClick={() => ver(l)} className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="block truncate font-semibold text-titulo">{l.nome}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {l.empresa.sigla}
                      {l.cargo ? ` · ${l.cargo}` : ""}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Estado grupo="colaborador" valor={l.situacao} />
                    </span>
                  </button>
                  {acoesLinha(l, true)}
                </li>
              ))}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={total} rotulo="pessoas" />
          </>
        )}
      </div>

      <DialogoDetalhesPessoa inicial={detalhes} aoFechar={() => setDetalhes(null)} aoEditar={abrirEdicao} />
      <DialogoFormularioPessoa
        key={formulario.chave}
        aberto={formulario.aberto}
        aoMudar={mudarFormulario}
        pessoa={formulario.pessoa}
        empresas={empresas.filter((e) => e.ativa || e.id === formulario.pessoa?.empresaId)}
        grupos={grupos}
        podeProvisionar={podeProvisionar}
      />
      {podeGerenciarCatalogo ? <DialogoGruposLicenca aberto={gruposAberto} aoMudar={setGruposAberto} grupos={grupos} /> : null}
    </>
  );
}
