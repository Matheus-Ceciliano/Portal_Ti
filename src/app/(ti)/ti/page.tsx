import { ArrowUpRight, Inbox, PackageCheck } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, EstadoVazio, Secao, formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { FaixaIndicadores, Legenda, TabelaBarras } from "@/components/painel/blocos";
import { ListaEventos, TabelaSimples, td, th } from "@/components/painel/tabelas";
import { Button } from "@/components/ui/button";
import { exigirPaginaTi } from "@/server/auth/pagina";
import type { Ator } from "@/server/authz/ator";
import { pode } from "@/server/authz/exigir";
import { obterEstadoIntegracoes, obterPainelTi } from "@/server/modulos/consultas";

export const metadata = { title: "Dashboard" };

type Painel = Awaited<ReturnType<typeof obterPainelTi>>;

const ROTULO_ESTADO_CHAMADO = {
  ABERTO: "Abertos",
  EM_ATENDIMENTO: "Em atendimento",
  AGUARDANDO_USUARIO: "Aguardando usuário",
  RESOLVIDO: "Resolvidos",
} as const;
const ROTULO_PRIORIDADE = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" } as const;

export default async function PaginaDashboard() {
  const ator = await exigirPaginaTi("dashboard.ver");
  const painel = await obterPainelTi(ator);
  const primeiroNome = ator.nome.split(" ")[0];

  return ator.visao === "GERENCIAL" ? (
    <PainelGerencial painel={painel} nome={primeiroNome} ator={ator} />
  ) : (
    <PainelOperacional painel={painel} nome={primeiroNome} ator={ator} />
  );
}

async function PainelOperacional({ painel, nome, ator }: { painel: Painel; nome: string; ator: Ator }) {
  const integracoes = pode(ator, "integracao.ver") ? await obterEstadoIntegracoes(ator) : null;
  const { real, inventario, ficticio } = painel;
  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard operacional"
        descricao={`Olá, ${nome}. Filas de trabalho da equipe de TI.`}
        acoes={
          pode(ator, "colaborador.criar") ? (
            <Button asChild>
              <Link href="/ti/cadastros/pessoas/nova">Cadastrar pessoa</Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        <FaixaIndicadores
          itens={[
            { rotulo: "Pessoas ativas", valor: real.pessoasAtivas, origem: "real" },
            { rotulo: "Contas aguardando ativação", valor: real.contasPendentes, origem: "real", destaque: "atencao" },
            { rotulo: "Equipamentos alocados", valor: inventario.ativosAlocados, origem: "real" },
            { rotulo: "Chamados abertos", valor: ficticio.chamadosAbertos, origem: "ficticio" },
            { rotulo: "Termos aguardando assinatura", valor: inventario.termosPendentes, origem: "real", destaque: "atencao" },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-3">
          <Secao
            titulo="Chamados sem responsável"
            descricao="Do mais recente para o mais antigo. Atribua um responsável a cada um."
            simulado
            className="xl:col-span-2"
            acoes={
              <Button asChild variant="outline" size="sm">
                <Link href="/ti/chamados">Ver chamados</Link>
              </Button>
            }
          >
            {ficticio.chamadosSemResponsavel.length === 0 ? (
              <EstadoVazio icone={Inbox} titulo="Fila vazia" descricao="Todos os chamados abertos têm responsável." />
            ) : (
              <TabelaSimples legenda="Chamados sem responsável">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className={th}>Chamado</th>
                    <th className={th}>Solicitante</th>
                    <th className={th}>Prioridade</th>
                    <th className={th}>Aberto em</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ficticio.chamadosSemResponsavel.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>
                        <span className="tabular block text-[13px] text-muted-foreground">{c.numero}</span>
                        <span className="text-titulo">{c.titulo}</span>
                      </td>
                      <td className={td}>{c.solicitante}</td>
                      <td className={td}>
                        <Estado grupo="prioridade" valor={c.prioridade} />
                      </td>
                      <td className={`${td} tabular whitespace-nowrap`}>{formatarDataHora(c.abertoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaSimples>
            )}
          </Secao>

          <Secao
            titulo="Entregas de equipamento pendentes"
            acoes={
              <Button asChild variant="outline" size="sm">
                <Link href="/ti/alocacoes?situacao=RESERVADA">Ver reservas</Link>
              </Button>
            }
          >
            {inventario.reservas.length === 0 ? (
              <EstadoVazio icone={PackageCheck} titulo="Nada a entregar" descricao="Não há equipamentos reservados aguardando entrega." />
            ) : (
              <ul className="divide-y">
                {inventario.reservas.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/ti/alocacoes?alocacao=${a.alocacaoId}`} className="font-medium text-titulo underline-offset-4 hover:underline">
                        {a.modelo}
                      </Link>
                      <span className="tabular text-[13px] text-muted-foreground">{a.patrimonio}</span>
                    </div>
                    <span className="text-[13px] text-muted-foreground">
                      Para {a.colaborador}
                      {a.previstaPara ? `, prevista para ${formatarData(a.previstaPara)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {integracoes ? (
            <Secao
              titulo="Integrações"
              descricao="Adaptadores em modo de simulação. Nenhuma chamada ao tenant."
              acoes={
                <Button asChild variant="outline" size="sm">
                  <Link href="/ti/integracoes">Detalhes</Link>
                </Button>
              }
            >
              <ul className="divide-y">
                {integracoes.saude.map((s) => (
                  <li key={s.sistema} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="font-medium text-titulo">{s.sistema}</span>
                    <Estado grupo="saude" valor={s.estado} />
                  </li>
                ))}
              </ul>
            </Secao>
          ) : null}
          <Secao
            titulo="Atividade recente"
            descricao="Eventos reais gravados na auditoria do portal."
            className={integracoes ? "xl:col-span-2" : "xl:col-span-3"}
            acoes={
              pode(ator, "auditoria.ver") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/ti/auditoria">Auditoria completa</Link>
                </Button>
              ) : null
            }
          >
            <ListaEventos eventos={real.eventosRecentes} />
          </Secao>
        </div>
      </div>
    </>
  );
}

function PainelGerencial({ painel, nome, ator }: { painel: Painel; nome: string; ator: Ator }) {
  const { real, inventario, ficticio } = painel;
  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard gerencial"
        descricao={`Olá, ${nome}. Visão consolidada do grupo para acompanhamento e decisão.`}
        acoes={
          pode(ator, "auditoria.ver") ? (
            <Button asChild variant="outline">
              <Link href="/ti/auditoria">
                Abrir auditoria <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        <FaixaIndicadores
          itens={[
            { rotulo: "Pessoas ativas", valor: real.pessoasAtivas, origem: "real" },
            { rotulo: "Empresas do grupo", valor: real.empresasAtivas, origem: "real" },
            { rotulo: "Acessos negados (7 dias)", valor: real.negacoesUltimos7Dias, origem: "real", destaque: "atencao" },
            { rotulo: "Equipamentos alocados", valor: inventario.ativosAlocados, origem: "real" },
            { rotulo: "Chamados em aberto", valor: ficticio.chamadosAbertos, origem: "ficticio" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Secao titulo="Pessoas ativas por empresa" descricao="Dados do cadastro do portal.">
            <TabelaBarras
              legenda="Pessoas ativas por empresa"
              colunas={["Empresa", "Pessoas ativas"]}
              linhas={real.pessoasPorEmpresa.map((e) => ({ rotulo: e.nome, valor: e.total }))}
            />
          </Secao>
          <Secao titulo="Distribuição de equipamentos" descricao="Alocados e disponíveis por empresa proprietária.">
            <Legenda
              itens={[
                { cor: "bg-chart-1", rotulo: "Alocados" },
                { cor: "bg-chart-3", rotulo: "Disponíveis" },
              ]}
            />
            <TabelaBarras
              legenda="Equipamentos alocados e disponíveis por empresa"
              colunas={["Empresa", "Alocados + disponíveis"]}
              linhas={inventario.equipamentosPorEmpresa.map((e) => ({
                rotulo: e.nome,
                valor: e.alocados,
                secundario: e.disponiveis,
              }))}
            />
          </Secao>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Secao titulo="Carga de suporte" descricao="Chamados por situação e prioridade dos que estão em aberto." simulado>
            <div className="grid sm:grid-cols-2 sm:divide-x">
              <TabelaBarras
                legenda="Chamados por situação"
                colunas={["Situação", "Chamados"]}
                linhas={ficticio.chamadosPorEstado.map((c) => ({ rotulo: ROTULO_ESTADO_CHAMADO[c.estado], valor: c.total }))}
              />
              <TabelaBarras
                legenda="Chamados em aberto por prioridade"
                colunas={["Prioridade", "Chamados"]}
                linhas={ficticio.chamadosPorPrioridade.map((c) => ({ rotulo: ROTULO_PRIORIDADE[c.prioridade], valor: c.total }))}
              />
            </div>
          </Secao>
          <Secao titulo="Ações operacionais pendentes" descricao="O que depende da equipe para avançar.">
            <ul className="divide-y">
              <ItemPendencia rotulo="Contas aguardando ativação pelo titular" valor={real.contasPendentes} real />
              <ItemPendencia rotulo="Termos aguardando assinatura" valor={inventario.termosPendentes} real />
              <ItemPendencia rotulo="Equipamentos reservados aguardando entrega" valor={inventario.totalReservados} real />
              <ItemPendencia rotulo="Chamados sem responsável" valor={ficticio.chamadosSemResponsavel.length} />
              <ItemPendencia rotulo="Equipamentos em manutenção" valor={inventario.ativosEmManutencao} real />
            </ul>
          </Secao>
        </div>

        <Secao titulo="Eventos de auditoria recentes" descricao="Eventos reais. Negações indicam tentativas sem permissão.">
          <ListaEventos eventos={real.eventosRecentes} />
        </Secao>
      </div>
    </>
  );
}

function ItemPendencia({ rotulo, valor, real }: { rotulo: string; valor: number; real?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <span>
        {rotulo}
        <span className="block text-xs text-muted-foreground">{real ? "Banco do portal" : "Dado fictício"}</span>
      </span>
      <span className={`tabular text-lg font-semibold ${valor > 0 ? "text-titulo" : "text-muted-foreground"}`}>{valor}</span>
    </li>
  );
}
