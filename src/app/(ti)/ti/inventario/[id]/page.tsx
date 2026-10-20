import { ArrowLeft, Building2, CalendarClock, ClipboardCheck, Cpu, History, Images, Keyboard, Laptop, Link2, MemoryStick, PackageCheck, PlugZap, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarData } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { texto } from "@/components/comum/tabela";
import { AcoesFicha } from "@/components/inventario/ficha/acoes-ficha";
import { CarregadoresFicha } from "@/components/inventario/ficha/carregadores-ficha";
import { ComponentesInternos } from "@/components/inventario/ficha/componentes-internos";
import { GaleriaFotos } from "@/components/inventario/ficha/galeria-fotos";
import { InspecoesFicha } from "@/components/inventario/ficha/inspecoes-ficha";
import { formatarDataHora, identificacao, MiniaturaEquipamento } from "@/components/inventario/visual";
import { formatarCapacidade } from "@/lib/componentes";
import { ROTULO_PARTE } from "@/lib/identificacao";
import { ROTULO_CONDICAO } from "@/lib/inspecao";
import { COM_CONFIGURACAO, ROTULO_DESTINO_REMOCAO, ROTULO_MOVIMENTACAO, ROTULO_SITUACAO, type DestinoRemocao, type Situacao } from "@/lib/inventario";
import { lerPessoaOrigem, lerRetorno } from "@/lib/retorno-empresa";
import { cn } from "@/lib/utils";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { ErroNegocio, pode } from "@/server/authz/exigir";
import { exigirEmpresa } from "@/server/modulos/empresa-registros";
import { listarEmpresas } from "@/server/modulos/empresas";
import { catalogoInventario } from "@/server/modulos/categorias";
import { obterEquipamento } from "@/server/modulos/inventario";
import { obterPessoa } from "@/server/modulos/pessoas";

export const metadata = { title: "Equipamento" };

function Secao({
  titulo,
  icone: Icone,
  children,
  className,
  acao,
}: {
  titulo: string;
  icone: typeof Laptop;
  children: React.ReactNode;
  className?: string;
  acao?: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border bg-card shadow-nivel-1", className)} aria-label={titulo}>
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-titulo">
          <Icone className="size-4 text-muted-foreground" aria-hidden />
          {titulo}
        </h2>
        {acao}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Valor ausente aparece como "Não informado": nada é preenchido por suposição. */
function Dado({ rotulo, valor, className }: { rotulo: string; valor?: React.ReactNode; className?: string }) {
  const vazio = valor === undefined || valor === null || valor === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
      <dd className={cn("break-words", vazio ? "text-muted-foreground" : "font-semibold text-titulo")}>{vazio ? "Não informado" : valor}</dd>
    </div>
  );
}

const RESULTADO = { REPARADO: "Reparado", SEM_REPARO: "Sem reparo" } as const;

type Ficha = Awaited<ReturnType<typeof obterEquipamento>>;

/**
 * Proprietária, empresa que usa o equipamento (aluguel vigente) e os históricos de propriedade
 * e de aluguéis — discretos, recolhidos por padrão.
 */
function EmpresaEAluguel({ ficha }: { ficha: Ficha }) {
  const a = ficha.aluguel;
  const historico = ficha.transferenciasEmpresa.length + ficha.alugueis.length;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Dado rotulo="Proprietária" valor={ficha.empresa.nome} />
        <Dado rotulo="Pode ser usado por" valor={a ? a.empresa.nome : ficha.empresa.nome} />
      </dl>
      {a ? (
        <div className="rounded-xl border border-info/25 bg-info-fundo px-3.5 py-2.5 text-[13px]" data-testid="aluguel-vigente">
          <p className="font-semibold text-titulo">
            Alugado para {a.empresa.nome} ({a.empresa.sigla})
          </p>
          <p className="text-muted-foreground">
            Desde {formatarData(a.inicio)}
            {a.devolucaoPrevista ? ` · devolução prevista ${formatarData(a.devolucaoPrevista)}` : ""}
            {a.herdado ? " · acompanha o aluguel do notebook" : ""}
          </p>
        </div>
      ) : null}
      {historico ? (
        <details className="group" data-testid="historico-empresa-aluguel">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-link underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
            Histórico de propriedade e aluguéis ({historico})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {ficha.transferenciasEmpresa.length ? (
              <div>
                <p className="mb-1 text-[12.5px] font-semibold text-muted-foreground">Propriedade</p>
                <ol className="flex flex-col gap-2 border-l pl-3">
                  {ficha.transferenciasEmpresa.map((t) => (
                    <li key={t.id} className="text-[13px]">
                      <p className="text-titulo">
                        {t.de} → {t.para}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {formatarDataHora(t.efetivadaEm)} · {t.realizadaPorNome}
                        {t.motivo ? ` · ${t.motivo}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {ficha.alugueis.length ? (
              <div>
                <p className="mb-1 text-[12.5px] font-semibold text-muted-foreground">Aluguéis</p>
                <ol className="flex flex-col gap-2 border-l pl-3">
                  {ficha.alugueis.map((x) => (
                    <li key={x.id} className="text-[13px]">
                      <p className="flex flex-wrap items-center gap-x-2 text-titulo">
                        {x.empresa.nome}
                        <span className={cn("rounded-sm px-1.5 text-[11px] leading-5 font-medium", x.vigente ? "bg-info-fundo text-info" : "bg-neutro-fundo text-neutro")}>
                          {x.vigente ? "Vigente" : "Encerrado"}
                        </span>
                      </p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {formatarData(x.inicio)} a {x.encerradoEm ? formatarDataHora(x.encerradoEm) : "hoje"}
                        {x.devolucaoPrevista ? ` · prevista ${formatarData(x.devolucaoPrevista)}` : ""} · {x.registradoPorNome} · {x.motivo}
                      </p>
                      {x.encerradoEm ? (
                        <p className="text-[12.5px] text-muted-foreground">
                          Encerrado por {x.encerradoPorNome}: {x.motivoEncerramento}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Ficha individual do equipamento. Fora do menu lateral: aberta pelo Inventário, por Empresas ou por Pessoas. */
export default async function PaginaEquipamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("ativo.ver", { escopoGrupo: true });
  const { id } = await params;
  const sp = await searchParams;

  let ficha;
  try {
    ficha = await obterEquipamento(ator, id);
  } catch (erro) {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  }

  // Contexto de retorno: empresa (com os filtros da aba) ou pessoa. Inválido → Inventário.
  let origem: { href: string; nome: string; trilha: { rotulo: string; href?: string }[] } | null = null;
  const retorno = lerRetorno(texto(sp.empresa), texto(sp.retorno));
  if (retorno && pode(ator, "empresa.ver")) {
    const empresa = await exigirEmpresa(ator, retorno.empresaId).catch(() => null);
    if (empresa) origem = { href: retorno.href, nome: empresa.nome, trilha: [{ rotulo: "Cadastros" }, { rotulo: "Empresas", href: "/ti/cadastros/empresas" }, { rotulo: empresa.nome, href: retorno.href }] };
  }
  const pessoaId = !origem ? lerPessoaOrigem(texto(sp.pessoa)) : null;
  if (pessoaId) {
    const pessoa = await obterPessoa(ator, pessoaId).catch(() => null);
    if (pessoa) {
      const href = `/ti/cadastros/pessoas/${pessoa.id}`;
      origem = { href, nome: pessoa.nome, trilha: [{ rotulo: "Cadastros" }, { rotulo: "Pessoas", href: "/ti/cadastros/pessoas" }, { rotulo: pessoa.nome, href }] };
    }
  }
  const trilha = [...(origem?.trilha ?? [{ rotulo: "Inventário", href: "/ti/inventario" }]), { rotulo: identificacao(ficha) }];

  const podeEditar = pode(ator, "ativo.editar");
  const podeTransicionar = pode(ator, "ativo.transicionar");
  const [empresas, catalogo] = podeEditar
    ? await Promise.all([listarEmpresas(ator), catalogoInventario(ator)])
    : [[], { categorias: [], marcas: [], modelos: [], processadores: [], sistemas: [], memoria: [], podeGerir: false }];
  const configuracao = COM_CONFIGURACAO.includes(ficha.categoria);
  const ehNotebook = ficha.categoria === "NOTEBOOK";
  const componente = ficha.componente;
  const instalacaoAtual = componente?.instalacoes.find((i) => i.vigente) ?? null;
  const aberta = ficha.manutencoes.find((m) => m.aberta);

  return (
    <>
      <nav aria-label="Trilha" className="mb-3 text-[13px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          {trilha.map((t, i) => (
            <li key={`${t.rotulo}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {"href" in t && t.href ? (
                <Link href={t.href} className="rounded-sm hover:text-foreground hover:underline">
                  {t.rotulo}
                </Link>
              ) : (
                <span aria-current={i === trilha.length - 1 ? "page" : undefined} className={i === trilha.length - 1 ? "text-foreground" : undefined}>
                  {t.rotulo}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <MiniaturaEquipamento url={ficha.fotos[0]?.url ?? null} categoria={ficha.categoria} tamanho="lg" className="max-sm:hidden" />
          <div className="min-w-0">
            <h1 className="tabular text-xl leading-7 font-bold sm:text-2xl sm:leading-8">{identificacao(ficha)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-muted-foreground">
              {ficha.nome && ficha.patrimonio ? <span className="tabular font-semibold text-titulo">{ficha.patrimonio}</span> : null}
              <span>
                {ficha.rotuloTipo} · {ficha.marca} {ficha.modelo}
              </span>
              <Estado grupo="ativo" valor={ficha.situacao} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <AcoesFicha
            ficha={ficha}
            empresas={empresas.map((e) => ({ id: e.id, nome: e.nome, sigla: e.sigla, ativa: e.ativa }))}
            catalogo={catalogo}
            pode={{ editar: podeEditar, transicionar: podeTransicionar }}
          />
          <Link
            href={origem?.href ?? "/ti/inventario"}
            className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:h-10"
          >
            <ArrowLeft className="size-4" aria-hidden /> {origem ? `Voltar para ${origem.nome}` : "Voltar para o Inventário"}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Secao titulo="Fotos" icone={Images}>
            <GaleriaFotos fotos={ficha.fotos} />
          </Secao>

          <Secao titulo="Dados cadastrais" icone={Laptop}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:gap-x-6 lg:grid-cols-3">
              <Dado rotulo={componente ? "Identificação" : "Nome do dispositivo"} valor={ficha.nome && <span className="tabular">{ficha.nome}</span>} />
              {componente ? null : <Dado rotulo="Patrimônio" valor={ficha.patrimonio && <span className="tabular">{ficha.patrimonio}</span>} />}
              <Dado rotulo="Número de série" valor={ficha.numeroSerie && <span className="tabular">{ficha.numeroSerie}</span>} />
              <Dado rotulo="Categoria" valor={ficha.rotuloTipo} />
              <Dado rotulo="Marca" valor={ficha.marca} />
              <Dado rotulo="Modelo" valor={ficha.modelo} />
              <Dado
                rotulo="Empresa proprietária"
                valor={
                  pode(ator, "empresa.ver") ? (
                    <Link href={`/ti/cadastros/empresas/${ficha.empresa.id}`} className="text-link underline-offset-4 hover:underline">
                      {ficha.empresa.nome}
                    </Link>
                  ) : (
                    ficha.empresa.nome
                  )
                }
              />
              {componente ? null : (
                <>
                  <Dado rotulo="Data de aquisição" valor={ficha.dataAquisicao ? formatarData(ficha.dataAquisicao) : undefined} />
                  <Dado rotulo="Garantia até" valor={ficha.garantiaAte ? formatarData(ficha.garantiaAte) : undefined} />
                </>
              )}
              <Dado rotulo="Condição de entrada" valor={ficha.condicaoEntrada ? ROTULO_CONDICAO[ficha.condicaoEntrada] : undefined} />
              <Dado rotulo="Situação" valor={<span className="inline-flex items-center gap-2"><Estado grupo="ativo" valor={ficha.situacao} /></span>} />
              <Dado rotulo="Na situação desde" valor={formatarDataHora(ficha.situacaoDesde)} />
              <Dado rotulo="Cadastrado" valor={`${formatarData(ficha.criadoEm)}${ficha.criadoPorNome ? ` · ${ficha.criadoPorNome}` : ""}`} />
              {ficha.observacoes ? <Dado rotulo="Observações" valor={<span className="font-normal whitespace-pre-line">{ficha.observacoes}</span>} className="col-span-2 lg:col-span-3" /> : null}
            </dl>
          </Secao>

          {configuracao ? (
            <Secao titulo="Configuração" icone={Cpu}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:gap-x-6 lg:grid-cols-4">
                <Dado rotulo="Processador" valor={ficha.processador} />
                {/* Notebook: a mesma soma do card de componentes internos (configuração original + peças vinculadas). */}
                <Dado rotulo="Memória RAM" valor={ficha.componentesInternos?.resumo.memoria ?? ficha.memoriaRam} />
                <Dado rotulo="Armazenamento" valor={ficha.componentesInternos?.resumo.armazenamento ?? ficha.armazenamento} />
                <Dado rotulo="Sistema operacional" valor={ficha.sistemaOperacional} />
              </dl>
            </Secao>
          ) : null}

          {componente ? (
            <Secao titulo="Especificação" icone={MemoryStick}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:gap-x-6 lg:grid-cols-4">
                <Dado rotulo="Capacidade" valor={formatarCapacidade(componente.capacidadeGb)} />
                {ficha.categoria === "MEMORIA_RAM" ? <Dado rotulo="Tecnologia" valor={componente.tecnologia} /> : <Dado rotulo="Interface" valor={componente.interfaceConexao} />}
                <Dado rotulo="Formato" valor={componente.formato} />
                {ficha.categoria === "MEMORIA_RAM" ? <Dado rotulo="Frequência" valor={componente.frequenciaMhz ? `${componente.frequenciaMhz} MHz` : undefined} /> : null}
              </dl>
            </Secao>
          ) : null}

          {ficha.componentesInternos ? (
            <Secao titulo="Componentes internos" icone={MemoryStick}>
              <ComponentesInternos
                notebook={{
                  id: ficha.id,
                  rotulo: identificacao(ficha),
                  alocado: ficha.responsavel ? { colaborador: ficha.responsavel.nome, alocacao: ficha.responsavel.alocacao } : null,
                  memoriaRam: ficha.memoriaRam,
                  armazenamento: ficha.armazenamento,
                  componentes: ficha.componentesInternos,
                }}
                pode={{
                  intervir: ficha.situacao !== "BAIXADO" && podeEditar && podeTransicionar,
                  criar: pode(ator, "ativo.criar"),
                  baixar: pode(ator, "ativo.baixar"),
                }}
                catalogo={catalogo}
              />
            </Secao>
          ) : null}

          <Secao titulo="Inspeções técnicas" icone={ClipboardCheck}>
            <InspecoesFicha ficha={ficha} podeInspecionar={podeTransicionar} />
          </Secao>

          <Secao titulo="Histórico de movimentações" icone={History}>
            {ficha.movimentacoes.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sem movimentações.</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l pl-5" data-testid="historico-movimentacoes">
                {ficha.movimentacoes.map((m) => (
                  <li key={m.id} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary dark:bg-link" aria-hidden />
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                      <span className="font-semibold text-titulo">{ROTULO_MOVIMENTACAO[m.tipo] ?? m.tipo}</span>
                      {m.situacaoNova && m.situacaoNova !== m.situacaoAnterior ? (
                        <span className="text-[12.5px] text-muted-foreground">
                          {m.situacaoAnterior ? `${ROTULO_SITUACAO[m.situacaoAnterior as Situacao]} → ` : ""}
                          {ROTULO_SITUACAO[m.situacaoNova as Situacao]}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {formatarDataHora(m.realizadoEm)} · {m.realizadoPorNome}
                      {m.colaboradorNome ? (
                        <>
                          {" · "}
                          {m.colaboradorId ? (
                            <Link href={`/ti/cadastros/pessoas/${m.colaboradorId}`} className="underline-offset-4 hover:underline">
                              {m.colaboradorNome}
                            </Link>
                          ) : (
                            m.colaboradorNome
                          )}
                        </>
                      ) : null}
                    </p>
                    {m.observacao ? <p className="mt-0.5 text-[13px] text-foreground">{m.observacao}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Secao>
        </div>

        {/* No celular, alocação, carregadores e manutenções vêm antes das fotos e do histórico. */}
        <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
          {/* Componente não é alocado a pessoas: mostra onde está instalado. */}
          {componente ? (
            <Secao titulo="Instalação" icone={Link2}>
              {instalacaoAtual ? (
                <p className="text-sm">
                  Instalado em{" "}
                  <Link href={`/ti/inventario/${instalacaoAtual.notebook.id}`} className="tabular font-semibold text-link underline-offset-4 hover:underline">
                    {instalacaoAtual.notebook.nome}
                  </Link>{" "}
                  <span className="text-muted-foreground">desde {formatarDataHora(instalacaoAtual.instaladaEm)}</span>
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground">Não está instalado em notebook.</p>
              )}
              {componente.instalacoes.some((i) => !i.vigente) ? (
                <ul className="mt-3 flex flex-col gap-2 border-t pt-3" aria-label="Instalações anteriores">
                  {componente.instalacoes
                    .filter((i) => !i.vigente)
                    .map((i) => (
                      <li key={i.id} className="text-[12.5px] text-muted-foreground">
                        <span className="tabular font-medium text-foreground">{i.notebook.nome}</span>
                        {i.original ? " (peça original)" : ""} · {formatarDataHora(i.instaladaEm)} até {i.removidaEm ? formatarDataHora(i.removidaEm) : "—"}
                        {i.destino ? ` · ${ROTULO_DESTINO_REMOCAO[i.destino as DestinoRemocao]}` : ""}
                        {i.motivoRemocao ? ` · ${i.motivoRemocao}` : ""}
                      </li>
                    ))}
                </ul>
              ) : null}
            </Secao>
          ) : (
          <Secao titulo="Alocação" icone={PackageCheck}>
            {ficha.responsavel || ficha.reserva ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular font-semibold text-titulo">{ficha.responsavel?.alocacao ?? ficha.reserva?.alocacao}</span>
                  <Estado grupo="alocacao" valor={ficha.responsavel ? "ATIVA" : "RESERVADA"} />
                </span>
                <Link
                  href={`/ti/alocacoes?alocacao=${ficha.responsavel?.alocacaoId ?? ficha.reserva?.alocacaoId}`}
                  className="text-[13px] font-semibold text-link underline-offset-4 hover:underline"
                >
                  Ver em Alocações
                </Link>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Sem alocação vigente.</p>
            )}
            {/* Transferências entre colaboradores são tratadas em Alocações; aqui, só o aviso. */}
            {ficha.transferenciaPendente ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-[13px] text-titulo" data-testid="transferencia-reservada">
                Transferência reservada para <strong>{ficha.transferenciaPendente.colaborador.nome}</strong>
                {ficha.responsavel ? (
                  <Link href={`/ti/alocacoes?alocacao=${ficha.responsavel.alocacaoId}`} className="font-semibold text-link underline-offset-4 hover:underline">
                    Confirmar ou cancelar em Alocações
                  </Link>
                ) : null}
              </p>
            ) : null}
          </Secao>
          )}

          {componente ? null : (
            <Secao titulo="Empresa e aluguel" icone={Building2}>
              <EmpresaEAluguel ficha={ficha} />
            </Secao>
          )}

          {ehNotebook ? (
            <Secao titulo="Carregadores" icone={PlugZap}>
              <CarregadoresFicha ficha={ficha} podeEditar={podeEditar} />
            </Secao>
          ) : null}
          {/* Peça de kit: o kit é só o agrupador; cada peça tem ficha, fotos e histórico próprios. */}
          {ficha.kit ? (
            <Secao titulo={`Kit ${ficha.kit.codigo}`} icone={Keyboard}>
              <ul className="flex flex-col gap-2" data-testid="pecas-do-kit">
                {ficha.kit.partes.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {p.id === ficha.id ? (
                        <span className="tabular font-semibold text-titulo">{p.nome}</span>
                      ) : (
                        <Link href={`/ti/inventario/${p.id}`} className="tabular font-semibold text-link underline-offset-4 hover:underline">
                          {p.nome}
                        </Link>
                      )}
                      <span className="text-[12.5px] text-muted-foreground">{ROTULO_PARTE[p.parte]}</span>
                    </span>
                    <Estado grupo="ativo" valor={p.situacao} />
                  </li>
                ))}
              </ul>
            </Secao>
          ) : null}
          {ficha.notebook ? (
            <Secao titulo="Notebook" icone={Laptop}>
              <p className="text-sm">
                <Link href={`/ti/inventario/${ficha.notebook.id}`} className="tabular font-semibold text-link underline-offset-4 hover:underline">
                  {ficha.notebook.nomeDispositivo}
                </Link>
                {ficha.notebook.patrimonio ? <span className="tabular text-muted-foreground"> · {ficha.notebook.patrimonio}</span> : null}
              </p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Carregador C{ficha.sequenciaCarregador}
                {ficha.desvinculadoEm ? ` · desvinculado em ${formatarDataHora(ficha.desvinculadoEm)}` : ""}
              </p>
            </Secao>
          ) : null}

          <Secao titulo="Manutenções" icone={Wrench}>
            {ficha.manutencoes.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nenhuma manutenção registrada.</p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="manutencoes-equipamento">
                {ficha.manutencoes.map((m) => (
                  <li key={m.id} className={cn("rounded-lg border p-3", m.aberta && "border-manual/40 bg-manual-fundo")}>
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-titulo">{m.motivo}</span>
                      <span className="text-[12px] font-medium text-muted-foreground">{m.aberta ? "Em andamento" : RESULTADO[m.resultado!]}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {formatarDataHora(m.abertaEm)} · {m.abertaPorNome}
                    </p>
                    {m.recolhidoDeNome ? <p className="text-[12.5px] text-muted-foreground">Recolhido de {m.recolhidoDeNome}</p> : null}
                    <p className="mt-1 text-[13px]">{m.observacoes}</p>
                    {m.concluidaEm ? (
                      <p className="mt-1.5 border-t pt-1.5 text-[13px]">
                        <span className="text-muted-foreground">
                          Concluída em {formatarDataHora(m.concluidaEm)} · {m.concluidaPorNome}:{" "}
                        </span>
                        {m.servicoRealizado}
                      </p>
                    ) : null}
                    {m.fotos.length ? (
                      <div className="mt-2">
                        <GaleriaFotos fotos={m.fotos} titulo={`Fotos da manutenção: ${m.motivo}`} compacta />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {aberta ? <p className="sr-only">Manutenção em andamento desde {formatarDataHora(aberta.abertaEm)}.</p> : null}
          </Secao>
        </div>
      </div>
    </>
  );
}
