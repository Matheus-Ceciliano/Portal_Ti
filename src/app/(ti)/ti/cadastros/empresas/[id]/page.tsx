import { Boxes, History, LayoutGrid, Paperclip, ShieldX, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVazio } from "@/components/comum/pagina";
import { Paginacao, texto, type Parametros } from "@/components/comum/tabela";
import { LogoEmpresa } from "@/components/empresas/logo-empresa";
import { AnexosIndisponiveis } from "@/components/empresas/registros/anexos-indisponiveis";
import {
  OPCOES_PERIODO,
  OPCOES_SITUACAO_ALOCACAO,
  OPCOES_VINCULO,
  OPCOES_SITUACAO_ATIVO,
  OPCOES_SITUACAO_COLABORADOR,
  PLACEHOLDER,
  VAZIO,
  contagem,
} from "@/components/empresas/registros/definicoes";
import { ResumoDaEmpresa } from "@/components/empresas/registros/resumo-empresa";
import {
  SemResultados,
  TabelaColaboradores,
  TabelaEquipamentos,
} from "@/components/empresas/registros/tabelas-registros";
import { SituacaoEmpresa } from "@/components/empresas/situacao-empresa";
import { formatarCnpj } from "@/lib/cnpj";
import { codificarRetorno } from "@/lib/retorno-empresa";
import { cn } from "@/lib/utils";
import type { SituacaoColaborador } from "@/generated/prisma/client";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { ErroAutorizacao, ErroNegocio, pode } from "@/server/authz/exigir";
import { SITUACOES, type Situacao as SituacaoAtivo } from "@/lib/inventario";
import {
  ABAS_EMPRESA,
  listarAlocacoesEmpresa,
  listarColaboradoresEmpresa,
  listarEquipamentosEmpresa,
  obterResumoEmpresa,
  SITUACOES_ALOCACAO_EMPRESA,
  VINCULOS_ALOCACAO,
  type AbaEmpresa,
  type ResumoEmpresa,
  type SituacaoAlocacao,
} from "@/server/modulos/empresa-registros";
import { armazenamentoDisponivel } from "@/server/modulos/empresas";
import { AlocacoesComDetalhes } from "./alocacoes-com-detalhes";
import { BotaoEditarEmpresa } from "./botao-editar";
import { FiltrosUrl } from "@/components/comum/filtros-url";

export const metadata = { title: "Empresa" };

const POR_PAGINA = 15;

const ABAS: { id: AbaEmpresa; rotulo: string; icone: LucideIcon }[] = [
  { id: "visao-geral", rotulo: "Visão geral", icone: LayoutGrid },
  { id: "colaboradores", rotulo: "Colaboradores", icone: Users },
  { id: "equipamentos", rotulo: "Equipamentos", icone: Boxes },
  { id: "alocacoes", rotulo: "Alocações", icone: History },
  { id: "anexos", rotulo: "Anexos", icone: Paperclip },
];

const SITUACOES_COLABORADOR = ["PRE_CADASTRO", "ATIVO", "AFASTADO", "DESLIGADO"] as const;
const SITUACOES_ATIVO = SITUACOES;
const umDe = <T extends string>(lista: readonly T[], valor: string | undefined) => lista.find((v) => v === valor);

function SemAcesso({ oque }: { oque: string }) {
  return (
    <EstadoVazio
      icone={ShieldX}
      titulo={`Sem acesso a ${oque}`}
      descricao="Seu perfil não permite consultar esta informação. Peça a um Supervisor TI ou Gestor ADM."
    />
  );
}

/** Erros de autorização viram estado "sem acesso"; os demais seguem para a página de erro. */
async function ouSemAcesso<T>(consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (erro) {
    if (erro instanceof ErroAutorizacao) return null;
    throw erro;
  }
}

function Painel({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-nivel-1">{children}</section>;
}

export default async function PaginaEmpresa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Acesso direto pela URL: sessão, ativação e ti.acessar (layout) + empresa.ver; empresa validada no servidor.
  const ator = await exigirPaginaTi("empresa.ver");
  const { id } = await params;
  const sp = await searchParams;

  // Sem await: o cabeçalho (que precisa do resumo) e a aba consultam o banco em paralelo.
  // A existência da empresa já foi validada no layout (404 real).
  const resumo = obterResumoEmpresa(ator, id);
  const base = `/ti/cadastros/empresas/${id}`;
  const aba: AbaEmpresa = umDe(ABAS_EMPRESA, texto(sp.tab)) ?? "visao-geral";
  const pagina = Number(texto(sp.pagina)) || 1;
  const busca = texto(sp.busca) ?? "";
  const direcao = texto(sp.direcao) === "desc" ? "desc" : texto(sp.direcao) === "asc" ? "asc" : undefined;

  return (
    <>
      <Topo ator={ator} resumo={resumo} base={base} aba={aba} />

      {aba === "visao-geral" ? <VisaoGeral resumo={resumo} base={base} /> : null}

      {aba === "colaboradores" ? (
        <Colaboradores
          ator={ator}
          empresaId={id}
          base={base}
          busca={busca}
          situacao={umDe(SITUACOES_COLABORADOR, texto(sp.situacao))}
          departamento={texto(sp.departamento)}
          ordenar={umDe(["nome", "cargo", "departamento", "situacao"] as const, texto(sp.ordenar)) ?? "nome"}
          direcao={direcao ?? "asc"}
          pagina={pagina}
        />
      ) : null}

      {aba === "equipamentos" ? (
        <Equipamentos
          ator={ator}
          empresaId={id}
          base={base}
          busca={busca}
          categoria={texto(sp.categoria)}
          situacao={umDe(SITUACOES_ATIVO, texto(sp.situacao))}
          ordenar={umDe(["patrimonio", "modelo", "situacao", "responsavel"] as const, texto(sp.ordenar)) ?? "patrimonio"}
          direcao={direcao ?? "asc"}
          pagina={pagina}
        />
      ) : null}

      {aba === "alocacoes" ? (
        <Alocacoes
          ator={ator}
          empresaId={id}
          base={base}
          busca={busca}
          situacao={umDe(SITUACOES_ALOCACAO_EMPRESA, texto(sp.situacao))}
          vinculo={umDe(VINCULOS_ALOCACAO, texto(sp.vinculo))}
          periodo={umDe(["30", "90", "365"] as const, texto(sp.periodo))}
          direcao={direcao ?? "desc"}
          pagina={pagina}
        />
      ) : null}

      {aba === "anexos" ? (
        <Painel>
          <AnexosIndisponiveis />
        </Painel>
      ) : null}
    </>
  );
}

async function resumoOu404(resumo: Promise<ResumoEmpresa>) {
  try {
    return await resumo;
  } catch (erro) {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  }
}

async function VisaoGeral({ resumo, base }: { resumo: Promise<ResumoEmpresa>; base: string }) {
  return <ResumoDaEmpresa resumo={await resumoOu404(resumo)} hrefBase={base} />;
}

/** Trilha, cabeçalho e navegação por abas (com as contagens do resumo). */
async function Topo({
  ator,
  resumo: resumoPromessa,
  base,
  aba,
}: {
  ator: Awaited<ReturnType<typeof exigirPaginaTi>>;
  resumo: Promise<ResumoEmpresa>;
  base: string;
  aba: AbaEmpresa;
}) {
  const resumo = await resumoOu404(resumoPromessa);
  const e = resumo.empresa;
  return (
    <>
      <nav aria-label="Trilha" className="mb-3 text-[13px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>Cadastros</li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/ti/cadastros/empresas" className="rounded-sm hover:text-foreground hover:underline">
              Empresas
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="truncate text-foreground">
            {e.nome}
          </li>
        </ol>
      </nav>

      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="sm:hidden">
          <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} tamanho="md" />
        </span>
        <span className="hidden sm:block">
          <LogoEmpresa url={e.logoUrl} sigla={e.sigla} nome={e.nome} tamanho="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-7 font-bold sm:text-2xl sm:leading-8">{e.nome}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
            <span className="font-semibold text-titulo">{e.sigla}</span>
            <span className="tabular">{formatarCnpj(e.cnpj)}</span>
            <SituacaoEmpresa ativa={e.ativa} />
            <span className="tabular">
              {e.pessoasAtivas} {e.pessoasAtivas === 1 ? "pessoa ativa" : "pessoas ativas"}
            </span>
          </p>
        </div>
        {pode(ator, "empresa.gerenciar") ? (
          <BotaoEditarEmpresa
            empresa={{
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
            }}
            armazenamentoDisponivel={armazenamentoDisponivel()}
          />
        ) : null}
      </header>

      <nav aria-label="Seções da empresa" className="mb-5 overflow-x-auto">
        <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
          {ABAS.map(({ id: idAba, rotulo, icone: Icone }) => {
            const ativa = idAba === aba;
            const total =
              idAba === "colaboradores"
                ? resumo.colaboradores?.total
                : idAba === "equipamentos"
                  ? resumo.equipamentos?.total
                  : idAba === "alocacoes"
                    ? resumo.alocacoes?.total
                    : undefined;
            return (
              <li key={idAba} className="flex-1 sm:flex-none">
                <Link
                  href={idAba === "visao-geral" ? base : `${base}?tab=${idAba}`}
                  aria-current={ativa ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap transition-colors lg:h-9",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    ativa ? "bg-card text-titulo shadow-nivel-1 dark:ring-1 dark:ring-white/10" : "text-muted-foreground hover:text-titulo",
                  )}
                >
                  <Icone className="size-4" aria-hidden />
                  {rotulo}
                  {total !== undefined ? (
                    <span className="tabular rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">{total}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

type Comum = { ator: Awaited<ReturnType<typeof exigirPaginaTi>>; empresaId: string; base: string; busca: string; pagina: number };

async function Colaboradores({
  ator,
  empresaId,
  base,
  busca,
  situacao,
  departamento,
  ordenar,
  direcao,
  pagina,
}: Comum & { situacao?: SituacaoColaborador; departamento?: string; ordenar: "nome" | "cargo" | "departamento" | "situacao"; direcao: "asc" | "desc" }) {
  const dados = await ouSemAcesso(() =>
    listarColaboradoresEmpresa(ator, empresaId, { busca, situacao, departamento, ordenar, direcao, pagina, porPagina: POR_PAGINA }),
  );
  if (!dados) return <Painel><SemAcesso oque="colaboradores" /></Painel>;
  const parametros: Parametros = { tab: "colaboradores", busca: busca || undefined, situacao, departamento, ordenar, direcao };
  return (
    <Painel>
      <div className="border-b p-4">
        <FiltrosUrl
          key="colaboradores"
          busca={busca}
          placeholder={PLACEHOLDER.colaboradores}
          rotuloBusca="Pesquisar colaboradores"
          chavesFiltro={["situacao", "departamento"]}
          filtros={[
            { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_COLABORADOR, valor: situacao ?? "" },
            {
              chave: "departamento",
              pesquisavel: true,
              rotulo: "Departamento",
              todos: "Todos os departamentos",
              opcoes: dados.departamentos.map((d) => ({ valor: d, rotulo: d })),
              valor: departamento ?? "",
            },
          ]}
          resumo={contagem(dados.itens.length, dados.total, dados.totalEmpresa, ["colaborador", "colaboradores"])}
        />
      </div>
      {dados.itens.length === 0 ? (
        <SemResultados filtrando={Boolean(busca || situacao || departamento)} vazio={VAZIO.colaboradores} />
      ) : (
        <>
          <TabelaColaboradores itens={dados.itens} empresaId={empresaId} ordenacao={{ base, parametros }} />
          <Paginacao base={base} parametros={parametros} pagina={dados.pagina} paginas={dados.paginas} total={dados.total} rotulo="colaboradores" />
        </>
      )}
    </Painel>
  );
}

async function Equipamentos({
  ator,
  empresaId,
  base,
  busca,
  categoria,
  situacao,
  ordenar,
  direcao,
  pagina,
}: Comum & { categoria?: string; situacao?: SituacaoAtivo; ordenar: "patrimonio" | "modelo" | "situacao" | "responsavel"; direcao: "asc" | "desc" }) {
  const dados = await ouSemAcesso(() =>
    listarEquipamentosEmpresa(ator, empresaId, { busca, categoria, situacao, ordenar, direcao, pagina, porPagina: POR_PAGINA }),
  );
  if (!dados) return <Painel><SemAcesso oque="equipamentos" /></Painel>;
  const parametros: Parametros = { tab: "equipamentos", busca: busca || undefined, categoria, situacao, ordenar, direcao };
  return (
    <Painel>
      <div className="border-b p-4">
        <FiltrosUrl
          key="equipamentos"
          busca={busca}
          placeholder={PLACEHOLDER.equipamentos}
          rotuloBusca="Pesquisar equipamentos"
          chavesFiltro={["categoria", "situacao"]}
          filtros={[
            {
              chave: "categoria",
              pesquisavel: true,
              rotulo: "Categoria",
              todos: "Todas as categorias",
              opcoes: dados.categorias,
              valor: categoria ?? "",
            },
            { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_ATIVO, valor: situacao ?? "" },
          ]}
          resumo={contagem(dados.itens.length, dados.total, dados.totalEmpresa, ["equipamento", "equipamentos"])}
        />
      </div>
      {dados.itens.length === 0 ? (
        <SemResultados filtrando={Boolean(busca || categoria || situacao)} vazio={VAZIO.equipamentos} />
      ) : (
        <>
          <TabelaEquipamentos
            itens={dados.itens}
            empresaId={empresaId}
            retorno={codificarRetorno({ ...parametros, pagina: dados.pagina > 1 ? dados.pagina : undefined })}
            ordenacao={{ base, parametros }}
          />
          <Paginacao base={base} parametros={parametros} pagina={dados.pagina} paginas={dados.paginas} total={dados.total} rotulo="equipamentos" />
        </>
      )}
    </Painel>
  );
}

async function Alocacoes({
  ator,
  empresaId,
  base,
  busca,
  situacao,
  vinculo,
  periodo,
  direcao,
  pagina,
}: Comum & { situacao?: SituacaoAlocacao; vinculo?: (typeof VINCULOS_ALOCACAO)[number]; periodo?: "30" | "90" | "365"; direcao: "asc" | "desc" }) {
  const dados = await ouSemAcesso(() =>
    listarAlocacoesEmpresa(ator, empresaId, {
      busca,
      situacao,
      vinculo,
      periodo,
      ordem: direcao === "asc" ? "antigas" : "recentes",
      pagina,
      porPagina: POR_PAGINA,
    }),
  );
  if (!dados) return <Painel><SemAcesso oque="alocações" /></Painel>;
  const parametros: Parametros = { tab: "alocacoes", busca: busca || undefined, situacao, vinculo, periodo, ordenar: "data", direcao };
  return (
    <Painel>
      <div className="border-b p-4">
        <FiltrosUrl
          key="alocacoes"
          busca={busca}
          placeholder={PLACEHOLDER.alocacoes}
          rotuloBusca="Pesquisar alocações"
          chavesFiltro={["situacao", "vinculo", "periodo"]}
          filtros={[
            { chave: "vinculo", rotulo: "Vínculo com a empresa", todos: "Equipamento ou colaborador da empresa", opcoes: OPCOES_VINCULO, valor: vinculo ?? "" },
            { chave: "situacao", rotulo: "Situação", todos: "Todas as situações", opcoes: OPCOES_SITUACAO_ALOCACAO, valor: situacao ?? "" },
            { chave: "periodo", rotulo: "Período", todos: "Todo o período", opcoes: OPCOES_PERIODO, valor: periodo ?? "" },
            {
              chave: "direcao",
              rotulo: "Ordenação por data",
              opcoes: [
                { valor: "desc", rotulo: "Mais recentes" },
                { valor: "asc", rotulo: "Mais antigas" },
              ],
              valor: direcao,
            },
          ]}
          resumo={contagem(dados.itens.length, dados.total, dados.totalEmpresa, ["alocação", "alocações"])}
        />
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          A alocação começa na entrega física do equipamento. A assinatura do TER segue um ciclo próprio e é mostrada à parte.
        </p>
      </div>
      {dados.itens.length === 0 ? (
        <SemResultados filtrando={Boolean(busca || situacao || vinculo || periodo)} vazio={VAZIO.alocacoes} />
      ) : (
        <>
          <AlocacoesComDetalhes
            itens={dados.itens}
            empresaId={empresaId}
            ordenacao={{ base, parametros }}
            pode={{
              confirmar: pode(ator, "alocacao.confirmar_entrega"),
              cancelar: pode(ator, "alocacao.cancelar"),
              devolver: pode(ator, "devolucao.registrar"),
              anexarTer: pode(ator, "termo.anexar_assinado"),
              transferir: pode(ator, "alocacao.criar"),
              avaliar: pode(ator, "ativo.transicionar"),
            }}
          />
          <Paginacao base={base} parametros={parametros} pagina={dados.pagina} paginas={dados.paginas} total={dados.total} rotulo="alocações" />
        </>
      )}
    </Painel>
  );
}
