"use client";

import { ExternalLink, Pencil, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarCnpj } from "@/lib/cnpj";
import { codificarRetorno } from "@/lib/retorno-empresa";
import { acaoRegistrosEmpresa, acaoResumoEmpresa, type RespostaRegistros } from "@/server/acoes/empresas";
import type { AbaEmpresa, ResumoEmpresa } from "@/server/modulos/empresa-registros";
import type { EmpresaEditavel } from "./dialogo-formulario-empresa";
import { LogoEmpresa } from "./logo-empresa";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "./posicao-modal";
import { AnexosIndisponiveis } from "./registros/anexos-indisponiveis";
import { BarraFiltros, type DefFiltro } from "./registros/barra-filtros";
import {
  OPCOES_PERIODO,
  OPCOES_SITUACAO_ALOCACAO,
  OPCOES_VINCULO,
  OPCOES_SITUACAO_ATIVO,
  OPCOES_SITUACAO_COLABORADOR,
  PLACEHOLDER,
  VAZIO,
  contagem,
} from "./registros/definicoes";
import { ResumoCarregando, ResumoDaEmpresa, type FiltrosDestino } from "./registros/resumo-empresa";
import { SemResultados, TabelaAlocacoes, TabelaColaboradores, TabelaEquipamentos } from "./registros/tabelas-registros";
import { SituacaoEmpresa } from "./situacao-empresa";

type AbaModal = "resumo" | "colaboradores" | "equipamentos" | "alocacoes" | "anexos";
type AbaLista = "colaboradores" | "equipamentos" | "alocacoes";
type Filtros = Record<AbaLista, Record<string, string>>;

/** Consulta rápida no modal; a página completa tem paginação e ordenação por coluna. */
const LIMITE_MODAL = 10;

/** A Server Action rejeita (TypeError "Failed to fetch") quando o servidor não responde. */
const FALHA_CONEXAO = "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.";

function ErroComNovaTentativa({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <AlertaFormulario tom="erro">{mensagem}</AlertaFormulario>
      <Button type="button" variant="secondary" size="sm" onClick={aoTentar}>
        <RotateCw aria-hidden /> Tentar novamente
      </Button>
    </div>
  );
}

const FILTROS_INICIAIS: Filtros = {
  colaboradores: { busca: "", situacao: "", departamento: "" },
  equipamentos: { busca: "", categoria: "", situacao: "" },
  alocacoes: { busca: "", situacao: "", vinculo: "", periodo: "", ordem: "recentes" },
};

const ROTULO_VER_TODOS: Record<AbaLista, string> = {
  colaboradores: "Ver todos os colaboradores",
  equipamentos: "Ver todos os equipamentos",
  alocacoes: "Ver todas as alocações",
};

const NOMES: Record<AbaLista, [string, string]> = {
  colaboradores: ["colaborador", "colaboradores"],
  equipamentos: ["equipamento", "equipamentos"],
  alocacoes: ["alocação", "alocações"],
};

/** Leva os filtros do modal para a página completa (estado na URL). */
function hrefPagina(id: string, aba: AbaLista | null, filtros?: Record<string, string>) {
  const p = new URLSearchParams();
  if (aba) p.set("tab", aba);
  for (const [k, v] of Object.entries(filtros ?? {})) {
    if (!v) continue;
    if (k === "ordem") {
      if (v === "antigas") p.set("direcao", "asc");
    } else p.set(k, v);
  }
  const q = p.toString();
  return `/ti/cadastros/empresas/${id}${q ? `?${q}` : ""}`;
}

/** Dados que a lista já tem: o cabeçalho aparece na hora, sem esperar o servidor. */
type EmpresaCabecalho = EmpresaEditavel & { pessoasAtivas: number };

type RespostaResumo = Awaited<ReturnType<typeof acaoResumoEmpresa>>;

export function DialogoDetalhesEmpresa({
  empresaId,
  inicial,
  aoFechar,
  aoEditar,
  podeEditar,
}: {
  empresaId: string | null;
  inicial?: EmpresaCabecalho;
  aoFechar: () => void;
  aoEditar: (dados: EmpresaEditavel) => void;
  podeEditar: boolean;
}) {
  return (
    <Dialog open={Boolean(empresaId)} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        // Tamanho fixo: não depende da aba nem da quantidade de registros (substitui grid,
        // max-h, sm:max-w-lg e a rolagem do diálogo inteiro definidos no Dialog padrão).
        // Centralização real nos dois eixos (na área de trabalho quando há menu lateral);
        // larguras em % (não vw) para não somar a barra de rolagem; altura limitada à área visível.
        className={[
          MODAL_CENTRALIZADO,
          "flex flex-col gap-0 overflow-hidden p-0",
          "h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none sm:max-w-none",
          "sm:h-[min(750px,90dvh)] sm:max-h-[90dvh]",
          LARGURA_MODAL[1000],
        ].join(" ")}
        data-testid="dialogo-detalhes-empresa"
      >
        {empresaId ? <Conteudo key={empresaId} empresaId={empresaId} inicial={inicial} aoEditar={aoEditar} podeEditar={podeEditar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  empresaId,
  inicial,
  aoEditar,
  podeEditar,
}: {
  empresaId: string;
  inicial?: EmpresaCabecalho;
  aoEditar: (dados: EmpresaEditavel) => void;
  podeEditar: boolean;
}) {
  const [resumo, setResumo] = useState<ResumoEmpresa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaModal>("resumo");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  // Cada aba guarda a última resposta e a chave (filtros + tentativa) que a gerou.
  const [registros, setRegistros] = useState<Partial<Record<AbaLista, { chave: string; resposta: RespostaRegistros }>>>({});
  const [carregando, iniciar] = useTransition();
  // Incrementar refaz as consultas ("Tentar novamente").
  const [tentativa, setTentativa] = useState(0);
  const tentarNovamente = () => {
    setErro(null);
    setTentativa((t) => t + 1);
  };
  // Uma consulta por abertura: o StrictMode (dev) executa o efeito duas vezes e reaproveita a mesma promessa.
  const pedidoResumo = useRef<{ chave: string; promessa: Promise<RespostaResumo> } | null>(null);

  useEffect(() => {
    let ativo = true;
    const chave = `${empresaId}:${tentativa}`;
    if (pedidoResumo.current?.chave !== chave) pedidoResumo.current = { chave, promessa: acaoResumoEmpresa(empresaId) };
    pedidoResumo.current.promessa
      .then((r) => {
        if (!ativo) return;
        if (r.ok) setResumo(r.dados);
        else setErro(r.erro);
      })
      .catch(() => {
        if (ativo) setErro(FALHA_CONEXAO);
      });
    return () => {
      ativo = false;
    };
  }, [empresaId, tentativa]);

  const abaLista = aba === "colaboradores" || aba === "equipamentos" || aba === "alocacoes" ? aba : null;
  const filtrosAba = abaLista ? filtros[abaLista] : null;

  // Consulta no servidor (empresa, permissão e filtros validados lá), com atraso curto na digitação.
  const chaveAba = filtrosAba ? `${JSON.stringify(filtrosAba)}:${tentativa}` : null;
  const jaCarregada = abaLista !== null && registros[abaLista]?.chave === chaveAba;

  useEffect(() => {
    // Voltar a uma aba com os mesmos filtros reutiliza a resposta já recebida.
    if (!abaLista || !filtrosAba || !chaveAba || jaCarregada) return;
    const temporizador = setTimeout(
      () => {
        iniciar(async () => {
          const limpos = Object.fromEntries(Object.entries(filtrosAba).filter(([, v]) => v));
          let r: RespostaRegistros;
          try {
            r = await acaoRegistrosEmpresa(empresaId, { aba: abaLista, ...limpos, porPagina: LIMITE_MODAL });
          } catch {
            // Sem isto, a rejeição dentro da transição derrubaria a página inteira.
            r = { ok: false, erro: FALHA_CONEXAO };
          }
          setRegistros((atual) => ({ ...atual, [abaLista]: { chave: chaveAba, resposta: r } }));
        });
      },
      filtrosAba.busca ? 250 : 0,
    );
    return () => clearTimeout(temporizador);
  }, [empresaId, abaLista, filtrosAba, chaveAba, jaCarregada]);

  const alterar = (chave: string, valor: string) => {
    if (abaLista) setFiltros((f) => ({ ...f, [abaLista]: { ...f[abaLista], [chave]: valor } }));
  };
  /** Atalhos e cartões do resumo: troca a aba e, quando houver, aplica o filtro do indicador. */
  const irParaAba = (destino: AbaEmpresa, filtrosDestino?: FiltrosDestino) => {
    if (destino === "colaboradores" || destino === "equipamentos" || destino === "alocacoes") {
      if (filtrosDestino) setFiltros((f) => ({ ...f, [destino]: { ...FILTROS_INICIAIS[destino], ...filtrosDestino } }));
      setAba(destino);
    } else setAba(destino === "visao-geral" ? "resumo" : destino);
  };
  const limpar = () => {
    if (abaLista) setFiltros((f) => ({ ...f, [abaLista]: FILTROS_INICIAIS[abaLista] }));
  };

  const e: EmpresaCabecalho | undefined = resumo?.empresa ?? inicial;

  if (!e || (erro && !resumo)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>{erro ? "Não foi possível abrir a empresa" : "Carregando empresa…"}</DialogTitle>
          <DialogDescription className="sr-only">Detalhes da empresa selecionada.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <ErroComNovaTentativa mensagem={erro} aoTentar={tentarNovamente} />
        ) : (
          <div className="flex items-center gap-4" aria-busy="true">
            <Skeleton className="size-16 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const editar = () =>
    aoEditar({
      id: e.id,
      nome: e.nome,
      sigla: e.sigla,
      cnpj: e.cnpj,
      cidade: e.cidade,
      ativa: e.ativa,
      responsavel: e.responsavel,
      nomeCurtoSenha: e.nomeCurtoSenha,
      observacoes: e.observacoes,
      logoUrl: e.logoUrl,
    });
  const contadores: Partial<Record<AbaModal, number | undefined>> = {
    colaboradores: resumo?.colaboradores?.total,
    equipamentos: resumo?.equipamentos?.total,
    alocacoes: resumo?.alocacoes?.total,
  };

  return (
    <>
      {/* Cabeçalho fixo */}
      <div className="flex shrink-0 items-start gap-3 border-b py-4 pr-14 pl-5 sm:gap-4 sm:pt-5 sm:pr-16 sm:pb-4 sm:pl-6">
        <span className="sm:hidden">
          <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} tamanho="md" />
        </span>
        <span className="hidden sm:block">
          <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} tamanho="lg" />
        </span>
        <DialogHeader className="min-w-0 flex-1 gap-1">
          <DialogTitle className="leading-7">{e.nome}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-titulo">{e.sigla}</span>
              <span className="tabular">{formatarCnpj(e.cnpj)}</span>
              <SituacaoEmpresa ativa={e.ativa} />
              <span className="tabular">{e.pessoasAtivas} pessoas ativas</span>
            </div>
          </DialogDescription>
          {podeEditar ? (
            <Button variant="secondary" size="sm" onClick={editar} className="mt-1.5 self-start sm:hidden">
              <Pencil aria-hidden /> Editar empresa
            </Button>
          ) : null}
        </DialogHeader>
        {podeEditar ? (
          <Button variant="secondary" onClick={editar} className="hidden self-start sm:inline-flex">
            <Pencil aria-hidden /> Editar empresa
          </Button>
        ) : null}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaModal)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
        {/* Abas fixas */}
        <div className="shrink-0 overflow-hidden border-b px-5 py-2.5 sm:px-6">
          <TabsList
            aria-label="Seções da empresa"
            className="h-auto w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden"
          >
            {(
              [
                ["resumo", "Resumo"],
                ["colaboradores", "Colaboradores"],
                ["equipamentos", "Equipamentos"],
                ["alocacoes", "Alocações"],
                ["anexos", "Anexos"],
              ] as const
            ).map(([valor, rotulo]) => (
              <TabsTrigger key={valor} value={valor} className="flex-none">
                {rotulo}
                {contadores[valor] !== undefined ? (
                  <span className="tabular rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground" aria-label={`, ${contadores[valor]}`}>
                    {contadores[valor]}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Só esta área rola */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="conteudo-aba">
          <TabsContent value="resumo">
            {resumo ? <ResumoDaEmpresa resumo={resumo} aoIrAba={irParaAba} /> : <ResumoCarregando />}
          </TabsContent>
          {(["colaboradores", "equipamentos", "alocacoes"] as const).map((lista) => (
            <TabsContent key={lista} value={lista} className="flex flex-col gap-3">
              <ListaDaAba
                aba={lista}
                empresaId={e.id}
                filtros={filtros[lista]}
                resposta={registros[lista]?.resposta}
                carregando={carregando && abaLista === lista}
                aoFiltrar={alterar}
                aoLimpar={limpar}
                aoTentarNovamente={tentarNovamente}
              />
            </TabsContent>
          ))}
          <TabsContent value="anexos">
            <AnexosIndisponiveis />
          </TabsContent>
        </div>
      </Tabs>

      {/* Rodapé fixo: só ações que precisam ficar sempre visíveis */}
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        {abaLista ? (
          <Button asChild variant="secondary">
            <Link href={hrefPagina(e.id, abaLista, filtros[abaLista])}>{ROTULO_VER_TODOS[abaLista]}</Link>
          </Button>
        ) : null}
        {/* No celular, "Ver todos…" já abre a página completa na aba certa: um botão só. */}
        <Button asChild className={abaLista ? "hidden sm:inline-flex" : undefined}>
          <Link href={hrefPagina(e.id, null)}>
            <ExternalLink aria-hidden /> Abrir página completa
          </Link>
        </Button>
      </div>
    </>
  );
}

function ListaDaAba({
  aba,
  empresaId,
  filtros,
  resposta,
  carregando,
  aoFiltrar,
  aoLimpar,
  aoTentarNovamente,
}: {
  aba: AbaLista;
  empresaId: string;
  filtros: Record<string, string>;
  resposta: RespostaRegistros | undefined;
  carregando: boolean;
  aoFiltrar: (chave: string, valor: string) => void;
  aoLimpar: () => void;
  aoTentarNovamente: () => void;
}) {
  const ok = resposta?.ok ? resposta : null;
  const defs: DefFiltro[] =
    aba === "colaboradores"
      ? [
          { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_COLABORADOR, valor: filtros.situacao },
          {
            chave: "departamento",
            pesquisavel: true,
            rotulo: "Departamento",
            todos: "Todos os departamentos",
            opcoes: ok?.aba === "colaboradores" ? ok.dados.departamentos.map((d) => ({ valor: d, rotulo: d })) : [],
            valor: filtros.departamento,
          },
        ]
      : aba === "equipamentos"
        ? [
            {
              chave: "categoria",
              pesquisavel: true,
              rotulo: "Categoria",
              todos: "Todas as categorias",
              opcoes: ok?.aba === "equipamentos" ? ok.dados.categorias : [],
              valor: filtros.categoria,
            },
            { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_ATIVO, valor: filtros.situacao },
          ]
        : [
            { chave: "vinculo", rotulo: "Vínculo com a empresa", todos: "Equipamento ou colaborador da empresa", opcoes: OPCOES_VINCULO, valor: filtros.vinculo ?? "" },
            { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_ALOCACAO, valor: filtros.situacao },
            { chave: "periodo", rotulo: "Período", todos: "Todo o período", opcoes: OPCOES_PERIODO, valor: filtros.periodo },
            {
              chave: "ordem",
              rotulo: "Ordenação por data",
              opcoes: [
                { valor: "recentes", rotulo: "Mais recentes" },
                { valor: "antigas", rotulo: "Mais antigas" },
              ],
              valor: filtros.ordem,
            },
          ];

  const filtrando = Boolean(filtros.busca || filtros.situacao || filtros.departamento || filtros.categoria || filtros.periodo || filtros.vinculo);

  return (
    <>
      <BarraFiltros
        busca={filtros.busca}
        aoBuscar={(v) => aoFiltrar("busca", v)}
        placeholder={PLACEHOLDER[aba]}
        rotuloBusca={`Pesquisar ${NOMES[aba][1]}`}
        filtros={defs}
        aoFiltrar={aoFiltrar}
        aoLimpar={aoLimpar}
        carregando={carregando}
        resumo={ok ? contagem(ok.dados.itens.length, ok.dados.total, ok.dados.totalEmpresa, NOMES[aba]) : "Carregando…"}
      />
      <div className={carregando ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {resposta && !resposta.ok ? (
          <ErroComNovaTentativa mensagem={resposta.erro} aoTentar={aoTentarNovamente} />
        ) : !ok ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : ok.dados.itens.length === 0 ? (
          <div className="rounded-xl border">
            <SemResultados filtrando={filtrando} vazio={VAZIO[aba]} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {ok.aba === "colaboradores" ? (
              <TabelaColaboradores itens={ok.dados.itens} empresaId={empresaId} />
            ) : ok.aba === "equipamentos" ? (
              <TabelaEquipamentos itens={ok.dados.itens} empresaId={empresaId} retorno={codificarRetorno({ tab: "equipamentos", ...filtros })} />
            ) : (
              <TabelaAlocacoes itens={ok.dados.itens} empresaId={empresaId} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
