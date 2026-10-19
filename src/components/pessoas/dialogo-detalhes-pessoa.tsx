"use client";

import { Database, ExternalLink, FileCheck2, FileClock, FileQuestion, FileText, FlaskConical, History, KeyRound, Laptop, PackageOpen, Pencil, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import { EstadoVazio, formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado, StatusBadge } from "@/components/comum/status-badge";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { BadgeTer } from "@/components/empresas/registros/tabelas-registros";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hrefFichaEquipamentoDaPessoa } from "@/lib/retorno-empresa";
import { cn } from "@/lib/utils";
import { acaoDetalhePessoa } from "@/server/acoes/pessoas";
import type { DetalhePessoa, DocumentoPessoa, EquipamentoPessoa } from "@/server/modulos/pessoas";
import { DialogoSenha } from "./acoes-pessoa";
import { AvatarPessoa } from "./avatar-pessoa";

type Resposta = Awaited<ReturnType<typeof acaoDetalhePessoa>>;
type Aba = "resumo" | "acessos" | "equipamentos" | "alocacoes" | "documentos";

/** O que a lista já sabe: o cabeçalho aparece na hora, sem esperar o servidor. */
export type PessoaCabecalho = {
  id: string;
  nome: string;
  cargo: string;
  situacao: "ATIVO" | "PRE_CADASTRO" | "AFASTADO" | "DESLIGADO";
  empresa: { nome: string };
  fotoUrl: string | null;
};

function Bloco({ titulo, origem, children, className }: { titulo: string; origem?: "real" | "ficticio"; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card", className)} aria-label={titulo}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-[13px] font-bold text-titulo">{titulo}</h3>
        {origem ? (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            {origem === "real" ? <Database className="size-3" aria-hidden /> : <FlaskConical className="size-3 text-faixa" aria-hidden />}
            {origem === "real" ? "Banco do portal" : "Dados fictícios"}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Situação de um termo com o tipo no rótulo (TER ou TDV). */
function BadgeTermo({ tipo, estado }: { tipo: "TER" | "TDV"; estado: DocumentoPessoa["estado"] }) {
  const d =
    estado === "ASSINADO"
      ? { tom: "sucesso" as const, icone: FileCheck2, texto: "assinado" }
      : estado === "AGUARDANDO_ASSINATURA"
        ? { tom: "atencao" as const, icone: FileClock, texto: "aguardando assinatura" }
        : estado === "EMITIDO" || estado === "RASCUNHO"
          ? { tom: "info" as const, icone: FileClock, texto: estado === "EMITIDO" ? "emitido" : "em rascunho" }
          : { tom: "neutro" as const, icone: FileQuestion, texto: "cancelado" };
  return (
    <StatusBadge tom={d.tom} icone={d.icone}>
      {tipo} {d.texto}
    </StatusBadge>
  );
}

function Dados({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:grid-cols-2">
      {itens.map(([rotulo, valor]) => {
        const vazio = valor === null || valor === undefined || valor === "";
        return (
          <div key={rotulo} className="min-w-0">
            <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
            <dd className={cn("break-words", vazio ? "text-muted-foreground" : "font-semibold text-titulo")}>{vazio ? "Não informado" : valor}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function DialogoDetalhesPessoa({
  inicial,
  aoFechar,
  aoEditar,
}: {
  inicial: PessoaCabecalho | null;
  aoFechar: () => void;
  aoEditar?: (detalhe: DetalhePessoa) => void;
}) {
  return (
    <Dialog open={Boolean(inicial)} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent
        className={cn(
          MODAL_CENTRALIZADO,
          "flex flex-col gap-0 overflow-hidden p-0",
          "h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none sm:max-w-none",
          "sm:h-[min(750px,90dvh)] sm:max-h-[90dvh]",
          LARGURA_MODAL[1000],
        )}
        data-testid="dialogo-detalhes-pessoa"
      >
        {inicial ? <Conteudo key={inicial.id} inicial={inicial} aoEditar={aoEditar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ inicial, aoEditar }: { inicial: PessoaCabecalho; aoEditar?: (d: DetalhePessoa) => void }) {
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<Aba>("resumo");
  const [senhaAberta, setSenhaAberta] = useState(false);
  // Uma consulta por abertura, mesmo com o efeito executado duas vezes no StrictMode (dev).
  const pedido = useRef<{ chave: string; promessa: Promise<Resposta> } | null>(null);

  useEffect(() => {
    let ativo = true;
    const chave = `${inicial.id}:${tentativa}`;
    if (pedido.current?.chave !== chave) pedido.current = { chave, promessa: acaoDetalhePessoa(inicial.id) };
    pedido.current.promessa
      .then((r) => ativo && setResposta(r))
      .catch(() => ativo && setResposta({ ok: false, erro: "Não foi possível falar com o servidor. Verifique a conexão e tente novamente." }));
    return () => {
      ativo = false;
    };
  }, [inicial.id, tentativa]);

  const d = resposta?.ok ? resposta.dados : null;
  const p = d?.pessoa;
  const nome = p?.nome ?? inicial.nome;
  const cargo = p?.cargo ?? inicial.cargo;

  const contadores: Partial<Record<Aba, number>> = d
    ? {
        equipamentos: d.equipamentos.entregues.length + d.equipamentos.reservados.length,
        alocacoes: d.equipamentos.entregues.length + d.equipamentos.reservados.length + d.documentos.filter((x) => x.tipo === "TDV").length,
        documentos: d.documentos.length,
      }
    : {};

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b py-4 pr-14 pl-5 sm:gap-4 sm:pl-6">
        <span className="sm:hidden">
          <AvatarPessoa url={p?.fotoUrl ?? inicial.fotoUrl} nome={nome} tamanho="md" />
        </span>
        <span className="hidden sm:block">
          <AvatarPessoa url={p?.fotoUrl ?? inicial.fotoUrl} nome={nome} tamanho="lg" />
        </span>
        <DialogHeader className="min-w-0 flex-1 gap-1">
          <DialogTitle className="leading-7">{nome}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-titulo">{p?.empresa.nome ?? inicial.empresa.nome}</span>
              {cargo ? <span>{cargo}</span> : null}
              <Estado grupo="colaborador" valor={p?.situacao ?? inicial.situacao} />
            </div>
          </DialogDescription>
          {d?.permissoes.editar ? (
            <Button variant="secondary" size="sm" onClick={() => aoEditar?.(d)} className="mt-1.5 self-start sm:hidden">
              <Pencil aria-hidden /> Editar
            </Button>
          ) : null}
        </DialogHeader>
        {d?.permissoes.editar ? (
          <Button variant="secondary" onClick={() => aoEditar?.(d)} className="hidden self-start sm:inline-flex">
            <Pencil aria-hidden /> Editar
          </Button>
        ) : null}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
        <div className="shrink-0 overflow-hidden border-b px-5 py-2.5 sm:px-6">
          <TabsList aria-label="Seções da pessoa" className="h-auto w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden">
            {(
              [
                ["resumo", "Resumo"],
                ["acessos", "Acessos"],
                ["equipamentos", "Equipamentos"],
                ["alocacoes", "Alocações"],
                ["documentos", "Documentos"],
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="conteudo-aba-pessoa">
          {resposta && !resposta.ok ? (
            <div className="flex flex-col items-start gap-3">
              <AlertaFormulario tom="erro">{resposta.erro}</AlertaFormulario>
              <Button type="button" variant="secondary" size="sm" onClick={() => (setResposta(null), setTentativa((t) => t + 1))}>
                <RotateCw aria-hidden /> Tentar novamente
              </Button>
            </div>
          ) : !d || !p ? (
            <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando dados da pessoa">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <TabsContent value="resumo">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Bloco titulo="Dados cadastrais" origem="real">
                    <Dados
                      itens={[
                        ["Nome completo", p.nome],
                        ["Empresa", p.empresa.nome],
                        ["Cargo", p.cargo],
                        ["Departamento", p.departamento],
                        ["Situação", <Estado key="s" grupo="colaborador" valor={p.situacao} />],
                        ["Cadastrada em", formatarData(p.criadoEm)],
                      ]}
                    />
                  </Bloco>
                  <Bloco titulo="Identificação de acesso" origem="real">
                    <Dados
                      itens={[
                        ["Segundo nome", p.segundoNome],
                        ["Sobrenome utilizado", p.sobrenomeUtilizado],
                        ["Nome do servidor/PC", p.nomeServidorPc],
                        ["Login UAU", p.loginUau ? <span key="u" className="tabular">{p.loginUau}</span> : null],
                      ]}
                    />
                  </Bloco>
                </div>
              </TabsContent>

              <TabsContent value="acessos">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Bloco titulo="Microsoft 365 (cadastro local)" origem="real">
                    <Dados
                      itens={[
                        ["Login Microsoft", p.loginMicrosoft ? <span key="l" className="tabular break-all">{p.loginMicrosoft}</span> : null],
                        ["E-mail corporativo", <span key="e" className="tabular break-all">{p.email}</span>],
                        ["Grupo de licença (local)", p.grupoLicenca?.nome],
                        ["Identidade Microsoft", p.identidadeMicrosoftVinculada ? "Vinculada" : "Não vinculada"],
                      ]}
                    />
                    <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground">
                      O grupo de licença é uma categoria local: não comprova licença atribuída no Microsoft 365.
                    </p>
                  </Bloco>
                  <Bloco titulo="Conta de acesso ao portal" origem="real">
                    <Dados
                      itens={[
                        ["Situação da conta", <Estado key="c" grupo="conta" valor={d.conta?.situacao ?? "SEM_CONTA"} />],
                        ["Login do portal", d.conta ? <span key="lp" className="tabular break-all">{p.email}</span> : null],
                        [
                          "Senha pessoal",
                          d.conta ? (d.conta.senhaPessoalDefinidaEm ? `Definida em ${formatarData(d.conta.senhaPessoalDefinidaEm)}` : "Ainda vale a senha inicial da TI") : null,
                        ],
                        ["Último acesso", d.conta ? (d.conta.ultimoAcessoEm ? formatarDataHora(d.conta.ultimoAcessoEm) : "Nunca acessou") : null],
                      ]}
                    />
                    <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
                      {d.permissoes.redefinirSenha ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setSenhaAberta(true)}>
                          <KeyRound aria-hidden /> Redefinir senha do portal
                        </Button>
                      ) : null}
                      <span className="text-[12.5px] text-muted-foreground">Senhas nunca são exibidas nem recuperáveis.</span>
                    </div>
                  </Bloco>
                </div>
                {d.permissoes.redefinirSenha ? (
                  <DialogoSenha colaboradorId={p.id} nome={p.nome} aberto={senhaAberta} fechar={() => setSenhaAberta(false)} />
                ) : null}
              </TabsContent>

              <TabsContent value="equipamentos">
                <AbaEquipamentos pessoaId={d.pessoa.id} entregues={d.equipamentos.entregues} reservados={d.equipamentos.reservados} />
              </TabsContent>

              <TabsContent value="alocacoes">
                <AbaAlocacoes detalhe={d} />
              </TabsContent>

              <TabsContent value="documentos">
                {d.documentos.length === 0 ? (
                  <div className="rounded-xl border">
                    <EstadoVazio icone={FileText} titulo="Nenhum documento" descricao="Não há TER, TDV ou outro documento registrado para esta pessoa." />
                  </div>
                ) : (
                  <Bloco titulo="Termos (TER e TDV)" origem="real">
                    <ul className="divide-y">
                      {d.documentos.map((doc) => (
                        <li key={doc.numero} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">
                            <span className="tabular block font-semibold text-titulo">{doc.numero}</span>
                            <span className="block text-[12.5px] text-muted-foreground">
                              {doc.tipo === "TER" ? "Termo de entrega e responsabilidade" : "Termo de devolução"} ·{" "}
                              {doc.emitidoEm ? `emitido em ${formatarData(doc.emitidoEm)}` : "recebido assinado"} · {doc.ativos.join(", ")}
                            </span>
                            <span className="block text-[12.5px] text-muted-foreground">
                              Assinatura: {doc.estado === "ASSINADO" ? (doc.assinadoEm ? formatarData(doc.assinadoEm) : "data não informada") : "pendente"}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <BadgeTermo tipo={doc.tipo} estado={doc.estado} />
                            {doc.temPdf ? (
                              <a href={`/api/termos/${doc.id}/pdf`} target="_blank" rel="noopener" className="text-[13px] font-semibold text-link underline-offset-4 hover:underline">
                                Abrir PDF
                              </a>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Bloco>
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <DialogFooter className="mx-0 mb-0 shrink-0 px-5 py-3 sm:px-6">
        <Button asChild variant="secondary">
          <Link href={`/ti/cadastros/pessoas/${inicial.id}`}>
            <ExternalLink aria-hidden /> Abrir ficha completa
          </Link>
        </Button>
      </DialogFooter>
    </>
  );
}

function ListaEquipamentos({ itens, rotuloData, pessoaId }: { itens: EquipamentoPessoa[]; rotuloData: string; pessoaId: string }) {
  return (
    <ul className="divide-y">
      {itens.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden>
              <Laptop className="size-4" />
            </span>
            <span className="min-w-0">
              <Link
                href={hrefFichaEquipamentoDaPessoa(e.id, pessoaId)}
                className="block truncate font-semibold text-titulo underline-offset-4 hover:text-link hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {e.nomeDispositivo ?? e.modelo}
              </Link>
              <span className="tabular block text-[12.5px] text-muted-foreground">
                {e.tipo} · {e.patrimonio}
                {e.numeroSerie ? ` · série ${e.numeroSerie}` : ""}
                {e.nomeDispositivo ? ` · ${e.modelo}` : ""}
              </span>
            </span>
          </span>
          <span className="tabular text-[12.5px] text-muted-foreground">
            {rotuloData} {formatarData(e.data)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AbaEquipamentos({ entregues, reservados, pessoaId }: { entregues: EquipamentoPessoa[]; reservados: EquipamentoPessoa[]; pessoaId: string }) {
  if (entregues.length === 0 && reservados.length === 0) {
    return (
      <div className="rounded-xl border">
        <EstadoVazio icone={Laptop} titulo="Nenhum equipamento" descricao="Esta pessoa não tem equipamentos entregues nem reservados." />
      </div>
    );
  }
  const notebooks = entregues.filter((e) => e.tipo === "Notebook");
  const outros = entregues.filter((e) => e.tipo !== "Notebook");
  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Notebook entregue" origem="real">
        {notebooks.length ? <ListaEquipamentos itens={notebooks} rotuloData="Entregue em" pessoaId={pessoaId} /> : <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhum notebook entregue.</p>}
      </Bloco>
      <Bloco titulo="Outros equipamentos entregues" origem="real">
        {outros.length ? <ListaEquipamentos itens={outros} rotuloData="Entregue em" pessoaId={pessoaId} /> : <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhum outro equipamento.</p>}
      </Bloco>
      {reservados.length ? (
        <Bloco titulo="Reservados, aguardando entrega" origem="real">
          <ListaEquipamentos itens={reservados} rotuloData="Prevista para" pessoaId={pessoaId} />
          <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground">
            Reserva não é entrega: a pessoa só passa a responder pelo equipamento na entrega física.
          </p>
        </Bloco>
      ) : null}
    </div>
  );
}

function AbaAlocacoes({ detalhe }: { detalhe: DetalhePessoa }) {
  const eventos = [
    ...detalhe.equipamentos.entregues.map((e) => ({ chave: `e-${e.id}`, data: e.data, tipo: "entrega" as const, e })),
    ...detalhe.equipamentos.reservados.map((e) => ({ chave: `r-${e.id}`, data: e.data, tipo: "reserva" as const, e })),
  ].sort((a, b) => b.data.localeCompare(a.data));
  const devolucoes = detalhe.documentos.filter((d) => d.tipo === "TDV");

  if (eventos.length === 0 && devolucoes.length === 0) {
    return (
      <div className="rounded-xl border">
        <EstadoVazio icone={History} titulo="Nenhuma alocação" descricao="Não há entregas, reservas ou devoluções registradas para esta pessoa." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Bloco titulo="Entregas e reservas" origem="real">
        <ul className="divide-y">
          {eventos.map(({ chave, tipo, e }) => (
            <li key={chave} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-semibold text-titulo">{e.modelo}</span>
                <span className="tabular block text-[12.5px] text-muted-foreground">
                  {e.patrimonio} · {tipo === "entrega" ? `entrega física em ${formatarData(e.data)}` : `reserva para ${formatarData(e.data)}, entrega pendente`} ·{" "}
                  <Link href={`/ti/alocacoes?alocacao=${e.alocacao.id}`} className="underline-offset-4 hover:underline">
                    {e.alocacao.numero}
                  </Link>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Estado grupo="ativo" valor={tipo === "entrega" ? "ALOCADO" : "RESERVADO"} />
                <BadgeTer estado={e.ter?.estado ?? null} />
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground">
          A situação do TER é independente da entrega física: um equipamento entregue pode ter o termo pendente.
        </p>
      </Bloco>
      <Bloco titulo="Devoluções" origem="real">
        {devolucoes.length ? (
          <ul className="divide-y">
            {devolucoes.map((t) => (
              <li key={t.numero} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-titulo">
                    <PackageOpen className="mr-1.5 inline size-4 text-muted-foreground" aria-hidden />
                    {t.ativos.join(", ")}
                  </span>
                  <span className="tabular block text-[12.5px] text-muted-foreground">
                    Registrada pelo {t.numero}
                    {t.emitidoEm ? `, emitido em ${formatarData(t.emitidoEm)}` : ""}
                  </span>
                </span>
                <BadgeTermo tipo="TDV" estado={t.estado} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma devolução registrada.</p>
        )}
      </Bloco>
    </div>
  );
}
