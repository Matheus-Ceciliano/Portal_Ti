import { ArrowLeft, CalendarClock, Cpu, History, Images, Laptop, PackageCheck, PlugZap, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarData } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import { texto } from "@/components/comum/tabela";
import { AcoesFicha } from "@/components/inventario/ficha/acoes-ficha";
import { CarregadoresFicha } from "@/components/inventario/ficha/carregadores-ficha";
import { AvisoTransferenciaReservada } from "@/components/inventario/ficha/dialogos-transferencia";
import { paraTransferencia } from "@/components/inventario/ficha/transferencia";
import { GaleriaFotos } from "@/components/inventario/ficha/galeria-fotos";
import { formatarDataHora, identificacao, MiniaturaEquipamento } from "@/components/inventario/visual";
import { COM_CONFIGURACAO, ROTULO_CATEGORIA, ROTULO_MOVIMENTACAO, ROTULO_SITUACAO, type Situacao } from "@/lib/inventario";
import { lerPessoaOrigem, lerRetorno } from "@/lib/retorno-empresa";
import { cn } from "@/lib/utils";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { ErroNegocio, pode } from "@/server/authz/exigir";
import { exigirEmpresa } from "@/server/modulos/empresa-registros";
import { listarEmpresas } from "@/server/modulos/empresas";
import { obterEquipamento, opcoesInventario } from "@/server/modulos/inventario";
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
  // Encerrar a custódia de quem está com o equipamento equivale a registrar a devolução dele.
  const podeEntregar = pode(ator, "alocacao.confirmar_entrega") && (!ficha.responsavel || pode(ator, "devolucao.registrar"));
  const [empresas, opcoes] = podeEditar ? await Promise.all([listarEmpresas(ator), opcoesInventario(ator)]) : [[], { marcas: [] }];
  const configuracao = COM_CONFIGURACAO.includes(ficha.categoria);
  const ehNotebook = ficha.categoria === "NOTEBOOK";
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
                {ROTULO_CATEGORIA[ficha.categoria]} · {ficha.marca} {ficha.modelo}
              </span>
              <Estado grupo="ativo" valor={ficha.situacao} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <AcoesFicha
            ficha={ficha}
            empresas={empresas.map((e) => ({ id: e.id, nome: e.nome, sigla: e.sigla, ativa: e.ativa }))}
            marcas={opcoes.marcas}
            pode={{ editar: podeEditar, transicionar: podeTransicionar, alocar: pode(ator, "alocacao.criar"), entregar: podeEntregar }}
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
              <Dado rotulo="Nome do dispositivo" valor={ficha.nome && <span className="tabular">{ficha.nome}</span>} />
              <Dado rotulo="Patrimônio" valor={ficha.patrimonio && <span className="tabular">{ficha.patrimonio}</span>} />
              <Dado rotulo="Número de série" valor={ficha.numeroSerie && <span className="tabular">{ficha.numeroSerie}</span>} />
              <Dado rotulo="Categoria" valor={ROTULO_CATEGORIA[ficha.categoria]} />
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
              <Dado rotulo="Data de aquisição" valor={ficha.dataAquisicao ? formatarData(ficha.dataAquisicao) : undefined} />
              <Dado rotulo="Garantia até" valor={ficha.garantiaAte ? formatarData(ficha.garantiaAte) : undefined} />
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
                <Dado rotulo="Memória RAM" valor={ficha.memoriaRam} />
                <Dado rotulo="Armazenamento" valor={ficha.armazenamento} />
                <Dado rotulo="Sistema operacional" valor={ficha.sistemaOperacional} />
              </dl>
            </Secao>
          ) : null}

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
          {/* Entrega, responsável e TER são consultados em Alocações; aqui só a referência. */}
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
            {ficha.transferenciaPendente ? (
              <AvisoTransferenciaReservada
                equipamento={paraTransferencia(ficha)}
                transferencia={ficha.transferenciaPendente}
                pode={{ confirmar: podeEntregar && pode(ator, "devolucao.registrar"), cancelar: pode(ator, "alocacao.cancelar") }}
              />
            ) : null}
          </Secao>

          {ehNotebook ? (
            <Secao titulo="Carregadores" icone={PlugZap}>
              <CarregadoresFicha ficha={ficha} podeEditar={podeEditar} />
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
