import { Plus, Search, UserRoundX } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, EstadoVazio } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { CabecalhoOrdenavel, Paginacao, texto, type Parametros } from "@/components/comum/tabela";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { ROTULO_PERFIL } from "@/server/authz/catalogo";
import { pode } from "@/server/authz/exigir";
import { listarEmpresas, listarPessoas, type FiltroPessoas } from "@/server/modulos/pessoas";

export const metadata = { title: "Pessoas" };

const BASE = "/ti/cadastros/pessoas";
const SITUACOES = ["ATIVO", "PRE_CADASTRO", "AFASTADO", "DESLIGADO"] as const;

export default async function PaginaPessoas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("colaborador.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    empresa: texto(sp.empresa),
    situacao: texto(sp.situacao),
    ordenar: texto(sp.ordenar),
    direcao: texto(sp.direcao),
    pagina: texto(sp.pagina),
  };
  const filtro: FiltroPessoas = {
    busca: parametros.busca,
    empresaId: parametros.empresa,
    situacao: SITUACOES.find((s) => s === parametros.situacao),
    ordenar: (["nome", "empresa", "criadoEm"] as const).find((o) => o === parametros.ordenar),
    direcao: parametros.direcao === "desc" ? "desc" : "asc",
    pagina: Number(parametros.pagina) || 1,
  };
  const [resultado, empresas] = await Promise.all([listarPessoas(ator, filtro), listarEmpresas(ator)]);
  const filtrando = Boolean(parametros.busca || parametros.empresa || parametros.situacao);

  return (
    <>
      <CabecalhoPagina
        titulo="Pessoas"
        descricao="Colaboradores do grupo, com a situação da conta de acesso ao portal e os perfis da equipe de TI."
        trilha={[{ rotulo: "Cadastros" }, { rotulo: "Pessoas" }]}
        acoes={
          pode(ator, "colaborador.criar") ? (
            <Button asChild>
              <Link href={`${BASE}/nova`}>
                <Plus className="size-4" aria-hidden /> Cadastrar pessoa
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="rounded-lg border bg-card shadow-nivel-1">
        <form method="get" role="search" aria-label="Filtrar pessoas" className="grid gap-3 border-b p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[1fr_220px_180px_auto]">
          <div className="relative">
            <label htmlFor="busca" className="sr-only">Buscar por nome, e-mail ou cargo</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="busca" name="busca" type="search" defaultValue={parametros.busca} placeholder="Buscar por nome, e-mail ou cargo" className="pl-9" />
          </div>
          <div>
            <label htmlFor="empresa" className="sr-only">Empresa</label>
            <select id="empresa" name="empresa" defaultValue={parametros.empresa ?? ""} className="h-11 w-full rounded-md border border-input bg-card px-3 text-base lg:h-9 md:text-sm">
              <option value="">Todas as empresas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="situacao" className="sr-only">Situação</label>
            <select id="situacao" name="situacao" defaultValue={parametros.situacao ?? ""} className="h-11 w-full rounded-md border border-input bg-card px-3 text-base lg:h-9 md:text-sm">
              <option value="">Todas as situações</option>
              <option value="ATIVO">Ativo</option>
              <option value="PRE_CADASTRO">Pré-cadastro</option>
              <option value="AFASTADO">Afastado</option>
              <option value="DESLIGADO">Desligado</option>
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variant="outline" className="flex-1 lg:flex-none">Filtrar</Button>
            {filtrando ? (
              <Button asChild variant="ghost">
                <Link href={BASE}>Limpar</Link>
              </Button>
            ) : null}
          </div>
        </form>

        {resultado.linhas.length === 0 ? (
          <EstadoVazio
            icone={UserRoundX}
            titulo={filtrando ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada"}
            descricao={filtrando ? "Revise a busca ou limpe os filtros." : "Cadastre a primeira pessoa para começar."}
          />
        ) : (
          <>
            {/* Tabela no tablet e desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Pessoas cadastradas</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="nome" className="pl-5">Nome</CabecalhoOrdenavel>
                    <CabecalhoOrdenavel base={BASE} parametros={parametros} campo="empresa">Empresa</CabecalhoOrdenavel>
                    <th scope="col" className="h-10 px-4 text-left text-[13px] font-medium text-muted-foreground">Situação</th>
                    <th scope="col" className="h-10 px-4 text-left text-[13px] font-medium text-muted-foreground">Conta de acesso</th>
                    <th scope="col" className="h-10 px-4 text-left text-[13px] font-medium text-muted-foreground">Perfil de TI</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultado.linhas.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/50">
                      <td className="h-11 py-2 pr-4 pl-5">
                        <Link href={`${BASE}/${p.id}`} className="font-medium text-titulo underline-offset-4 hover:underline">
                          {p.nome}
                        </Link>
                        <span className="block text-[13px] text-muted-foreground">{p.cargo} · {p.email}</span>
                      </td>
                      <td className="px-4" title={p.empresa}>{p.empresaSigla}</td>
                      <td className="px-4"><Estado grupo="colaborador" valor={p.situacao} /></td>
                      <td className="px-4">
                        <Estado grupo="conta" valor={!p.conta ? "SEM_CONTA" : p.conta.situacao === "ATIVA" && !p.conta.ativada ? "PENDENTE" : p.conta.situacao} />
                      </td>
                      <td className="px-4">
                        {p.perfis.length ? (
                          <div className="flex flex-wrap gap-1">
                            {p.perfis.map((perfil) => (
                              <StatusBadge key={perfil} tom="info">{ROTULO_PERFIL[perfil]}</StatusBadge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Lista no celular */}
            <ul className="divide-y md:hidden">
              {resultado.linhas.map((p) => (
                <li key={p.id}>
                  <Link href={`${BASE}/${p.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-accent/50">
                    <span className="font-medium text-titulo">{p.nome}</span>
                    <span className="text-[13px] text-muted-foreground">{p.cargo} · {p.empresaSigla}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <Estado grupo="colaborador" valor={p.situacao} />
                      <Estado grupo="conta" valor={!p.conta ? "SEM_CONTA" : p.conta.situacao === "ATIVA" && !p.conta.ativada ? "PENDENTE" : p.conta.situacao} />
                      {p.perfis.map((perfil) => (
                        <StatusBadge key={perfil} tom="info">{ROTULO_PERFIL[perfil]}</StatusBadge>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Paginacao base={BASE} parametros={parametros} pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} rotulo="pessoas" />
          </>
        )}
      </div>
    </>
  );
}
