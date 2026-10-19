"use client";

import { PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { LARGURA_MODAL, MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ehComponente, PREFIXO_COMPONENTE, type TipoComponente } from "@/lib/componentes";
import {
  CATEGORIAS_COMPONENTE,
  CATEGORIAS_EQUIPAMENTO,
  COM_CONFIGURACAO,
  nomeCarregador,
  normalizarIdentificador,
  ROTULO_CATEGORIA,
  TIPOS_FOTO,
  type Categoria,
  type TipoFoto,
} from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoSalvarEquipamento, type EstadoInventario } from "@/server/acoes/inventario";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { anexarFotos, CampoFotos, totalFotos, type FotosSelecionadas } from "./campo-fotos";
import {
  CamposConfiguracao,
  CamposEspecificacao,
  configDasPecas,
  configVazia,
  errosConfiguracao,
  especVazia,
  paraConfiguracao,
  type ConfigFormulario,
  type EspecFormulario,
} from "./campos-componente";

/** Componente: fotos da peça e da etiqueta bastam. */
const FOTOS_COMPONENTE: readonly TipoFoto[] = ["FRONTAL", "ETIQUETA_SERIE", "OUTRA"];

export type EmpresaOpcaoInventario = { id: string; nome: string; sigla: string; ativa: boolean };

function Secao({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-t pt-4 first:border-t-0 first:pt-0", className)}>
      <legend className="float-left mb-3 w-full text-sm font-bold text-titulo">{titulo}</legend>
      <div className="clear-both grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">{children}</div>
    </fieldset>
  );
}

const vazio = (e?: FichaEquipamento | null) => ({
  categoria: (e?.categoria ?? "") as Categoria | "",
  nomeDispositivo: e?.nome ?? "",
  patrimonio: e?.patrimonio ?? "",
  empresaId: e?.empresa.id ?? "",
  marca: e?.marca ?? "",
  modelo: e?.modelo ?? "",
  numeroSerie: e?.numeroSerie ?? "",
  processador: e?.processador ?? "",
  memoriaRam: e?.memoriaRam ?? "",
  armazenamento: e?.armazenamento ?? "",
  sistemaOperacional: e?.sistemaOperacional ?? "",
  dataAquisicao: e?.dataAquisicao ?? "",
  garantiaAte: e?.garantiaAte ?? "",
  observacoes: e?.observacoes ?? "",
  espec: especVazia(e?.componente ?? undefined) as EspecFormulario,
  // Configuração original: editável até a primeira intervenção nos componentes.
  config: (e?.componentesInternos?.estruturada ? configDasPecas(e.componentesInternos.pecas) : configVazia()) as ConfigFormulario,
});

/**
 * Cadastro e edição de equipamento. Os campos de configuração aparecem conforme a categoria;
 * notebook ganha o carregador principal (<nome>C1) na mesma gravação. O envio carrega uma
 * chave única: repetir o mesmo envio não cria outro cadastro.
 */
export function DialogoEquipamento({
  aberto,
  aoMudar,
  equipamento,
  empresas,
  marcas,
  aoSalvar,
  grupo = "equipamentos",
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** Ausente = cadastro; presente = edição. */
  equipamento?: FichaEquipamento | null;
  empresas: EmpresaOpcaoInventario[];
  marcas: string[];
  aoSalvar?: (id: string) => void;
  /** Cadastro: equipamentos ou componentes internos (RAM, SSD, HD). */
  grupo?: "equipamentos" | "componentes";
}) {
  const router = useRouter();
  const edicao = Boolean(equipamento);
  const carregador = equipamento?.categoria === "CARREGADOR";
  const [estado, despachar, pendente] = useActionState<EstadoInventario, FormData>(acaoSalvarEquipamento, {});
  const [f, setF] = useState(() => vazio(equipamento));
  const [fotos, setFotos] = useState<FotosSelecionadas>({});
  const [chave] = useState(() => crypto.randomUUID());
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [errosLocais, setErrosLocais] = useState<Record<string, string>>({});
  const tratado = useRef<EstadoInventario | null>(null);

  const mudar = (parcial: Partial<typeof f>) => {
    setF((a) => ({ ...a, ...parcial }));
    setErrosLocais((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in parcial))));
    setAlterado(true);
  };
  const mudarEspec = (parcial: Partial<EspecFormulario>) => {
    setF((a) => ({ ...a, espec: { ...a.espec, ...parcial } }));
    setErrosLocais((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in parcial))));
    setAlterado(true);
  };
  const mudarConfig = (parcial: Partial<ConfigFormulario>) => {
    setF((a) => ({ ...a, config: { ...a.config, ...parcial } }));
    setErrosLocais((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !["memoriaRam", "armazenamento", "ssdGb", "hdGb"].includes(k))));
    setAlterado(true);
  };
  const categoria = f.categoria || null;
  const componente = categoria ? ehComponente(categoria) : false;
  const configuracao = categoria ? COM_CONFIGURACAO.includes(categoria) : false;
  const notebook = categoria === "NOTEBOOK";
  // Notebook: depois da primeira intervenção, a configuração muda só pelos componentes internos.
  const configEditavel = notebook && equipamento?.componentesInternos?.podeAjustarOriginal !== false;
  const nome = normalizarIdentificador(f.nomeDispositivo);
  const categoriasCadastro = grupo === "componentes" ? CATEGORIAS_COMPONENTE : CATEGORIAS_EQUIPAMENTO;

  useEffect(() => {
    if (!estado.ok || !estado.id || tratado.current === estado) return;
    tratado.current = estado;
    const id = estado.id;
    toast.success(estado.mensagem, edicao ? undefined : { action: { label: "Abrir ficha", onClick: () => router.push(`/ti/inventario/${id}`) } });
    router.refresh();
    aoMudar(false);
    aoSalvar?.(id);
  }, [estado, edicao, aoMudar, aoSalvar, router]);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendente) return; // evita envio duplicado
    const erros: Record<string, string> = {};
    if (!f.categoria) erros.categoria = "Selecione a categoria.";
    if (notebook && !nome) erros.nomeDispositivo = "Informe o nome do dispositivo (ex.: NBI5001).";
    if (!carregador && !componente && !normalizarIdentificador(f.patrimonio)) erros.patrimonio = "Informe o patrimônio.";
    if (componente && !f.espec.capacidadeGb) erros.capacidadeGb = "Informe a capacidade.";
    if (configEditavel) Object.assign(erros, errosConfiguracao(f.config));
    if (!f.empresaId) erros.empresaId = "Selecione a empresa proprietária.";
    if (!f.marca.trim()) erros.marca = "Informe a marca.";
    if (!f.modelo.trim()) erros.modelo = "Informe o modelo.";
    if (f.dataAquisicao && f.garantiaAte && f.garantiaAte < f.dataAquisicao) erros.garantiaAte = "A garantia termina antes da aquisição.";
    setErrosLocais(erros);
    if (Object.keys(erros).length) return;
    const dados = new FormData(evento.currentTarget);
    if (componente) for (const [k, v] of Object.entries(f.espec)) dados.set(k, v);
    const config = configEditavel ? paraConfiguracao(f.config) : null;
    if (config) dados.set("configuracao", JSON.stringify(config));
    anexarFotos(dados, fotos);
    startTransition(() => despachar(dados));
  }

  const solicitarFechar = () => {
    if (pendente) return;
    if (alterado || totalFotos(fotos)) setConfirmarDescarte(true);
    else aoMudar(false);
  };
  const erro = (campo: string) => errosLocais[campo] ?? estado.erros?.[campo];
  const opcoesEmpresas = empresas.filter((e) => e.ativa || e.id === f.empresaId).map((e) => ({ valor: e.id, rotulo: e.nome }));

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : solicitarFechar())}>
        <DialogContent
          className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", LARGURA_MODAL[1050])}
          data-testid="dialogo-equipamento"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>
              {edicao ? `Editar ${equipamento!.nome ?? equipamento!.patrimonio ?? "equipamento"}` : grupo === "componentes" ? "Cadastrar componente" : "Cadastrar equipamento"}
            </DialogTitle>
            <DialogDescription className="sr-only">Dados do equipamento e fotos.</DialogDescription>
          </DialogHeader>

          <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
            {equipamento ? <input type="hidden" name="id" value={equipamento.id} /> : <input type="hidden" name="chaveRequisicao" value={chave} />}
            <input type="hidden" name="categoria" value={f.categoria} />
            <input type="hidden" name="empresaId" value={f.empresaId} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5" data-testid="corpo-formulario-equipamento">
              {estado.erro ? (
                <div className="mb-4">
                  <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
                </div>
              ) : null}
              <div className="flex flex-col gap-5">
                <Secao titulo="Identificação">
                  <Campo rotulo="Categoria" obrigatorio erro={erro("categoria")} className="lg:col-span-3">
                    {(p) =>
                      edicao ? (
                        <p id={p.id} className="flex h-10 items-center font-semibold text-titulo">
                          {ROTULO_CATEGORIA[equipamento!.categoria]}
                        </p>
                      ) : (
                        <SelecaoPersonalizada
                          id={p.id}
                          aria-describedby={p["aria-describedby"]}
                          invalido={p["aria-invalid"]}
                          valor={f.categoria}
                          aoMudar={(v) => mudar({ categoria: v as Categoria })}
                          opcoes={categoriasCadastro.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA[c] }))}
                          placeholder="Selecione"
                        />
                      )
                    }
                  </Campo>
                  {componente ? (
                    // Identificação automática (RAM001, SSD001, HDD001): sem nome nem patrimônio digitados.
                    <Campo rotulo="Identificação" className="lg:col-span-6">
                      {(p) => (
                        <p id={p.id} className="tabular flex h-10 items-center font-semibold text-titulo">
                          {edicao ? equipamento!.nome : <span className="font-normal text-muted-foreground">{PREFIXO_COMPONENTE[categoria as TipoComponente]}… gerado ao salvar</span>}
                        </p>
                      )}
                    </Campo>
                  ) : (
                    <>
                  <Campo
                    rotulo="Nome do dispositivo"
                    obrigatorio={notebook}
                    erro={erro("nomeDispositivo")}
                    ajuda={
                      carregador
                        ? "Definido pelo notebook."
                        : notebook && nome
                          ? (
                              <span className="inline-flex items-center gap-1">
                                <PlugZap className="size-3.5" aria-hidden /> Carregador principal: {edicao ? `${nome}C…` : nomeCarregador(nome, 1)}
                              </span>
                            )
                          : undefined
                    }
                    className="lg:col-span-3"
                  >
                    {(p) => (
                      <Input
                        {...p}
                        name="nomeDispositivo"
                        value={f.nomeDispositivo}
                        onChange={(e) => mudar({ nomeDispositivo: e.target.value.toUpperCase() })}
                        placeholder={notebook ? "Ex.: NBI5001" : undefined}
                        readOnly={carregador}
                        autoComplete="off"
                        spellCheck={false}
                        className="tabular uppercase placeholder:normal-case"
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Patrimônio" obrigatorio={!carregador} erro={erro("patrimonio")} className="lg:col-span-3">
                    {(p) => (
                      <Input
                        {...p}
                        name="patrimonio"
                        value={f.patrimonio}
                        onChange={(e) => mudar({ patrimonio: e.target.value.toUpperCase() })}
                        placeholder="Ex.: VLR-004512"
                        autoComplete="off"
                        spellCheck={false}
                        className="tabular uppercase placeholder:normal-case"
                      />
                    )}
                  </Campo>
                    </>
                  )}
                  {/* Na edição, a empresa só muda pela transferência entre empresas (ficha do equipamento). */}
                  <Campo
                    rotulo="Empresa proprietária"
                    obrigatorio={!equipamento}
                    erro={erro("empresaId")}
                    ajuda={carregador ? "Acompanha o notebook." : equipamento ? "Alterada por Transferir empresa, na ficha." : undefined}
                    className="lg:col-span-3"
                  >
                    {(p) =>
                      equipamento ? (
                        <p id={p.id} className="flex h-10 items-center truncate font-semibold text-titulo">
                          {equipamento!.empresa.nome}
                        </p>
                      ) : (
                        <SelecaoPersonalizada
                          id={p.id}
                          aria-describedby={p["aria-describedby"]}
                          invalido={p["aria-invalid"]}
                          valor={f.empresaId}
                          aoMudar={(v) => mudar({ empresaId: v })}
                          opcoes={opcoesEmpresas}
                          placeholder="Selecione a empresa"
                          pesquisavel
                        />
                      )
                    }
                  </Campo>
                </Secao>

                <Secao titulo="Fabricante">
                  <Campo rotulo="Marca" obrigatorio erro={erro("marca")} className="lg:col-span-4">
                    {(p) => (
                      <>
                        <Input {...p} name="marca" value={f.marca} onChange={(e) => mudar({ marca: e.target.value })} list="marcas-inventario" autoComplete="off" placeholder="Ex.: Dell" />
                        <datalist id="marcas-inventario">
                          {marcas.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </Campo>
                  <Campo rotulo="Modelo" obrigatorio erro={erro("modelo")} className="lg:col-span-4">
                    {(p) => <Input {...p} name="modelo" value={f.modelo} onChange={(e) => mudar({ modelo: e.target.value })} autoComplete="off" placeholder="Ex.: Latitude 5440" />}
                  </Campo>
                  <Campo rotulo="Número de série" erro={erro("numeroSerie")} className="sm:col-span-2 lg:col-span-4">
                    {(p) => (
                      <Input
                        {...p}
                        name="numeroSerie"
                        value={f.numeroSerie}
                        onChange={(e) => mudar({ numeroSerie: e.target.value.toUpperCase() })}
                        autoComplete="off"
                        spellCheck={false}
                        className="tabular uppercase placeholder:normal-case"
                      />
                    )}
                  </Campo>
                </Secao>

                {componente ? (
                  <Secao titulo="Especificação">
                    <CamposEspecificacao tipo={categoria as TipoComponente} valor={f.espec} aoMudar={mudarEspec} erro={erro} classeCampo="lg:col-span-3" />
                  </Secao>
                ) : null}

                {notebook ? (
                  <Secao titulo="Configuração">
                    {(
                      [
                        ["processador", "Processador", "Ex.: Intel Core i5-1345U"],
                        ["sistemaOperacional", "Sistema operacional", "Ex.: Windows 11 Pro"],
                      ] as const
                    ).map(([campo, rotulo, exemplo]) => (
                      <Campo key={campo} rotulo={rotulo} erro={erro(campo)} className="lg:col-span-3">
                        {(p) => <Input {...p} name={campo} value={f[campo]} onChange={(e) => mudar({ [campo]: e.target.value })} autoComplete="off" placeholder={exemplo} />}
                      </Campo>
                    ))}
                    {configEditavel ? (
                      <CamposConfiguracao valor={f.config} aoMudar={mudarConfig} erro={erro} classeCampo="lg:col-span-3" />
                    ) : (
                      <Campo rotulo="Memória e armazenamento" ajuda="Atualizados pelos componentes internos, na ficha." className="sm:col-span-2 lg:col-span-6">
                        {(p) => (
                          <p id={p.id} className="flex min-h-10 items-center font-semibold text-titulo">
                            {equipamento?.componentesInternos?.resumo.texto}
                          </p>
                        )}
                      </Campo>
                    )}
                  </Secao>
                ) : configuracao ? (
                  <Secao titulo="Configuração">
                    {(
                      [
                        ["processador", "Processador", "Ex.: Intel Core i5-1345U"],
                        ["memoriaRam", "Memória RAM", "Ex.: 16 GB"],
                        ["armazenamento", "Armazenamento", "Ex.: SSD 512 GB"],
                        ["sistemaOperacional", "Sistema operacional", "Ex.: Windows 11 Pro"],
                      ] as const
                    ).map(([campo, rotulo, exemplo]) => (
                      <Campo key={campo} rotulo={rotulo} erro={erro(campo)} className="lg:col-span-3">
                        {(p) => <Input {...p} name={campo} value={f[campo]} onChange={(e) => mudar({ [campo]: e.target.value })} autoComplete="off" placeholder={exemplo} />}
                      </Campo>
                    ))}
                  </Secao>
                ) : null}

                {componente ? (
                  <Secao titulo="Observações">
                    <Campo rotulo="Observações" erro={erro("observacoes")} className="sm:col-span-2 lg:col-span-12">
                      {(p) => <Textarea {...p} name="observacoes" value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={2} className="min-h-10" />}
                    </Campo>
                  </Secao>
                ) : (
                <Secao titulo="Aquisição e observações">
                  <Campo rotulo="Data de aquisição" erro={erro("dataAquisicao")} className="lg:col-span-3">
                    {(p) => <Input {...p} type="date" name="dataAquisicao" value={f.dataAquisicao} onChange={(e) => mudar({ dataAquisicao: e.target.value })} />}
                  </Campo>
                  <Campo rotulo="Garantia até" erro={erro("garantiaAte")} className="lg:col-span-3">
                    {(p) => <Input {...p} type="date" name="garantiaAte" value={f.garantiaAte} onChange={(e) => mudar({ garantiaAte: e.target.value })} />}
                  </Campo>
                  <Campo rotulo="Observações" erro={erro("observacoes")} className="sm:col-span-2 lg:col-span-6">
                    {(p) => <Textarea {...p} name="observacoes" value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} rows={2} className="min-h-10" />}
                  </Campo>
                </Secao>
                )}

                <Secao titulo="Fotos">
                  <div className="sm:col-span-2 lg:col-span-12">
                    <CampoFotos
                      tipos={componente ? FOTOS_COMPONENTE : TIPOS_FOTO}
                      valor={fotos}
                      aoMudar={(v) => {
                        setFotos(v);
                        setAlterado(true);
                      }}
                      existentes={equipamento?.fotos}
                      erro={erro("fotos")}
                    />
                  </div>
                </Secao>
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0">
              <Button type="button" variant="secondary" disabled={pendente} onClick={solicitarFechar}>
                Cancelar
              </Button>
              <BotaoPendente pendente={pendente} rotuloPendente="Salvando…">
                {edicao ? "Salvar alterações" : componente || grupo === "componentes" ? "Cadastrar componente" : "Cadastrar equipamento"}
              </BotaoPendente>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent data-testid="confirmar-descarte-equipamento">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>Os dados e as fotos ainda não foram salvos e serão perdidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmarDescarte(false);
                aoMudar(false);
              }}
            >
              Descartar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
