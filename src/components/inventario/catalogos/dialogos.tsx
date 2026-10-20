"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  FORMATO_CODIGO_NOMENCLATURA,
  FORMATO_FREQUENCIA,
  ROTULO_PADRAO_MEMORIA,
  TIPOS_PADRAO_MEMORIA,
  type MarcaOpcao,
  type ModeloOpcao,
  type PadraoMemoriaOpcao,
  type ProcessadorOpcao,
  type SistemaOpcao,
  type TipoPadraoMemoria,
} from "@/lib/catalogos";
import { normalizarPrefixo } from "@/lib/identificacao";
import { cn } from "@/lib/utils";
import {
  acaoCriarMarca,
  acaoCriarModelo,
  acaoCriarPadraoMemoria,
  acaoCriarProcessador,
  acaoCriarSistema,
  acaoEditarMarca,
  acaoEditarModelo,
  acaoEditarPadraoMemoria,
  acaoEditarProcessador,
  acaoEditarSistema,
} from "@/server/acoes/catalogos";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]");
const SEM_CONEXAO = "Não foi possível falar com o servidor. Tente novamente.";

type Resposta<T> = { ok: true; dados: T; mensagem?: string } | { ok: false; erro: string };
export type CategoriaSimples = { id: string; nome: string; ativa: boolean; tipo?: string };

/**
 * Envio comum dos cadastros de catálogo: erro de campo (duplicidade, formato) junto ao campo
 * indicado por `campoDoErro`; os demais no topo do modal.
 */
function useEnvio<T>(campoDoErro: (erro: string) => string | null) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  async function enviar(acao: () => Promise<Resposta<T>>, aoSalvar: (dados: T, mensagem: string) => void) {
    setEnviando(true);
    setErro(null);
    const r = await acao().catch((): Resposta<T> => ({ ok: false, erro: SEM_CONEXAO }));
    setEnviando(false);
    if (!r.ok) {
      const campo = campoDoErro(r.erro);
      if (campo) setErros({ [campo]: r.erro });
      else setErro(r.erro);
      return false;
    }
    aoSalvar(r.dados, r.mensagem ?? "Salvo.");
    return true;
  }
  return { enviando, erro, erros, setErros, enviar };
}

function Modal({
  titulo,
  descricao,
  testid,
  enviando,
  aoFechar,
  erro,
  rodape,
  children,
}: {
  titulo: string;
  descricao: string;
  testid: string;
  enviando: boolean;
  aoFechar: () => void;
  erro: string | null;
  rodape: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className={CONTEUDO} data-testid={testid} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{descricao}</DialogDescription>
        </DialogHeader>
        {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
        {children}
        <DialogFooter>{rodape}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rodape({ enviando, aoCancelar, rotulo, aoSalvar, cancelar = "Cancelar" }: { enviando: boolean; aoCancelar: () => void; rotulo: string; aoSalvar: () => void; cancelar?: string }) {
  return (
    <>
      <Button variant="secondary" disabled={enviando} onClick={aoCancelar}>
        {cancelar}
      </Button>
      <Button carregando={enviando} rotuloCarregando="Salvando…" onClick={aoSalvar}>
        {rotulo}
      </Button>
    </>
  );
}

function Situacao({ ativa, aoMudar, rotulo }: { ativa: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <label className="flex items-center gap-2.5 text-[13.5px] font-medium text-titulo sm:col-span-2">
      <Checkbox checked={ativa} onCheckedChange={(v) => aoMudar(v === true)} />
      {rotulo}
    </label>
  );
}

/* Marca */

export function DialogoMarca({ marca, aoFechar, aoSalvar }: { marca?: MarcaOpcao | null; aoFechar: () => void; aoSalvar: (m: MarcaOpcao, mensagem: string) => void }) {
  const [nome, setNome] = useState(marca?.nome ?? "");
  const [ativa, setAtiva] = useState(marca?.ativa ?? true);
  const { enviando, erro, erros, setErros, enviar } = useEnvio<MarcaOpcao>((e) => (/marca|nome/i.test(e) ? "nome" : null));
  function salvar() {
    if (!nome.trim()) return setErros({ nome: "Informe o nome da marca." });
    void enviar(() => (marca ? acaoEditarMarca({ id: marca.id, nome, ativa }) : acaoCriarMarca({ nome })), aoSalvar);
  }
  return (
    <Modal
      titulo={marca ? "Editar marca" : "Cadastrar marca"}
      descricao="Nome da marca no catálogo."
      testid="dialogo-marca"
      enviando={enviando}
      aoFechar={aoFechar}
      erro={erro}
      rodape={<Rodape enviando={enviando} aoCancelar={aoFechar} rotulo={marca ? "Salvar marca" : "Cadastrar marca"} aoSalvar={salvar} />}
    >
      <div className="grid gap-4">
        <Campo rotulo="Nome da marca" obrigatorio erro={erros.nome}>
          {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="off" placeholder="Ex.: Dell" autoFocus />}
        </Campo>
        {marca ? <Situacao ativa={ativa} aoMudar={setAtiva} rotulo="Marca ativa" /> : null}
      </div>
    </Modal>
  );
}

/* Modelo */

export function DialogoModelo({
  modelo,
  marcas,
  categorias,
  fixo,
  podeCriarMarca,
  aoNovaMarca,
  aoFechar,
  aoSalvar,
}: {
  modelo?: (ModeloOpcao & { equipamentos?: number }) | null;
  marcas: MarcaOpcao[];
  categorias: CategoriaSimples[];
  /** Aberto pelo cadastro do equipamento: marca e categoria já escolhidas ficam fixas. */
  fixo?: { marcaId: string; categoriaId: string };
  podeCriarMarca?: boolean;
  aoNovaMarca?: (m: MarcaOpcao) => void;
  aoFechar: () => void;
  aoSalvar: (m: ModeloOpcao, mensagem: string) => void;
}) {
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [marcaId, setMarcaId] = useState(fixo?.marcaId ?? modelo?.marcaId ?? "");
  const [categoriaId, setCategoriaId] = useState(fixo?.categoriaId ?? modelo?.categoriaId ?? "");
  const [ativa, setAtiva] = useState(modelo?.ativa ?? true);
  const [criandoMarca, setCriandoMarca] = useState(false);
  const [listaMarcas, setListaMarcas] = useState(marcas);
  const { enviando, erro, erros, setErros, enviar } = useEnvio<ModeloOpcao>((e) => (/modelo/i.test(e) ? "nome" : /marca/i.test(e) ? "marcaId" : /categoria/i.test(e) ? "categoriaId" : null));
  // Com equipamentos vinculados, o modelo não muda de marca nem de categoria.
  const travado = Boolean(fixo) || (modelo?.equipamentos ?? 0) > 0;
  const nomeMarca = listaMarcas.find((m) => m.id === marcaId)?.nome;
  const nomeCategoria = categorias.find((c) => c.id === categoriaId)?.nome;

  function salvar() {
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = "Informe o nome do modelo.";
    if (!marcaId) e.marcaId = "Selecione a marca.";
    if (!categoriaId) e.categoriaId = "Selecione a categoria.";
    setErros(e);
    if (Object.keys(e).length) return;
    void enviar(() => (modelo ? acaoEditarModelo({ id: modelo.id, nome, marcaId, categoriaId, ativa }) : acaoCriarModelo({ nome, marcaId, categoriaId })), aoSalvar);
  }

  return (
    <>
      <Modal
        titulo={modelo ? "Editar modelo" : "Cadastrar modelo"}
        descricao="Modelo de uma marca para uma categoria de equipamento."
        testid="dialogo-modelo"
        enviando={enviando}
        aoFechar={aoFechar}
        erro={erro}
        rodape={<Rodape enviando={enviando} aoCancelar={aoFechar} rotulo={modelo ? "Salvar modelo" : "Cadastrar modelo"} aoSalvar={salvar} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria" obrigatorio erro={erros.categoriaId}>
            {(p) =>
              travado ? (
                <p id={p.id} className="flex h-10 items-center truncate font-semibold text-titulo">
                  {nomeCategoria}
                </p>
              ) : (
                <SelecaoPersonalizada
                  id={p.id}
                  invalido={p["aria-invalid"]}
                  aria-describedby={p["aria-describedby"]}
                  valor={categoriaId}
                  aoMudar={setCategoriaId}
                  opcoes={categorias.filter((c) => c.ativa || c.id === categoriaId).map((c) => ({ valor: c.id, rotulo: c.nome }))}
                  pesquisavel
                />
              )
            }
          </Campo>
          <Campo rotulo="Marca" obrigatorio erro={erros.marcaId}>
            {(p) =>
              travado ? (
                <p id={p.id} className="flex h-10 items-center truncate font-semibold text-titulo">
                  {nomeMarca}
                </p>
              ) : (
                <SelecaoPersonalizada
                  id={p.id}
                  invalido={p["aria-invalid"]}
                  aria-describedby={p["aria-describedby"]}
                  valor={marcaId}
                  aoMudar={setMarcaId}
                  opcoes={listaMarcas.filter((m) => m.ativa || m.id === marcaId).map((m) => ({ valor: m.id, rotulo: m.nome }))}
                  pesquisavel
                  criar={podeCriarMarca ? { aoCriar: () => setCriandoMarca(true) } : undefined}
                />
              )
            }
          </Campo>
          <Campo rotulo="Modelo" obrigatorio erro={erros.nome} className="sm:col-span-2">
            {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="off" placeholder="Ex.: Latitude 5440" autoFocus />}
          </Campo>
          {modelo ? <Situacao ativa={ativa} aoMudar={setAtiva} rotulo="Modelo ativo" /> : null}
        </div>
      </Modal>
      {criandoMarca ? (
        <DialogoMarca
          aoFechar={() => setCriandoMarca(false)}
          aoSalvar={(m) => {
            setListaMarcas((l) => [...l, m]);
            setMarcaId(m.id);
            aoNovaMarca?.(m);
            setCriandoMarca(false);
          }}
        />
      ) : null}
    </>
  );
}

/* Processador */

export function DialogoProcessador({
  processador,
  prefixoNotebook,
  aoFechar,
  aoSalvar,
}: {
  processador?: ProcessadorOpcao | null;
  prefixoNotebook: string;
  aoFechar: () => void;
  aoSalvar: (p: ProcessadorOpcao, mensagem: string) => void;
}) {
  const [modelo, setModelo] = useState(processador?.modelo ?? "");
  const [fabricante, setFabricante] = useState(processador?.fabricante ?? "");
  const [familia, setFamilia] = useState(processador?.familia ?? "");
  const [codigo, setCodigo] = useState(processador?.codigo ?? "");
  const [ativa, setAtiva] = useState(processador?.ativa ?? true);
  const [confirmar, setConfirmar] = useState(false);
  const { enviando, erro, erros, setErros, enviar } = useEnvio<ProcessadorOpcao>((e) => (/código/i.test(e) ? "codigo" : /processador|modelo/i.test(e) && /cadastrado/i.test(e) ? "modelo" : null));
  const c = normalizarPrefixo(codigo);
  const mudaCodigo = Boolean(processador) && c !== (processador!.codigo ?? "");
  const exemplo = c && FORMATO_CODIGO_NOMENCLATURA.test(c) ? `${prefixoNotebook}${c}001` : null;

  function salvar() {
    const e: Record<string, string> = {};
    if (!modelo.trim()) e.modelo = "Informe o modelo do processador.";
    if (c && !FORMATO_CODIGO_NOMENCLATURA.test(c)) e.codigo = "Use de 1 a 3 letras ou números.";
    setErros(e);
    if (Object.keys(e).length) return;
    if (mudaCodigo && !confirmar) return setConfirmar(true);
    const dados = { modelo, fabricante: fabricante || null, familia: familia || null, codigo: c || null };
    void enviar(() => (processador ? acaoEditarProcessador({ ...dados, id: processador.id, ativa, confirmacao: mudaCodigo }) : acaoCriarProcessador(dados)), aoSalvar).then((ok) => {
      if (!ok) setConfirmar(false);
    });
  }

  return (
    <Modal
      titulo={processador ? "Editar processador" : "Cadastrar processador"}
      descricao="Modelo completo e código usado no identificador do notebook."
      testid="dialogo-processador"
      enviando={enviando}
      aoFechar={aoFechar}
      erro={erro}
      rodape={
        <Rodape
          enviando={enviando}
          aoCancelar={() => (confirmar ? setConfirmar(false) : aoFechar())}
          cancelar={confirmar ? "Voltar" : "Cancelar"}
          rotulo={confirmar ? "Confirmar alteração" : processador ? "Salvar processador" : "Cadastrar processador"}
          aoSalvar={salvar}
        />
      }
    >
      {confirmar ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note" data-testid="confirmar-codigo">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden />
          <p className="text-[13.5px] text-titulo">
            {exemplo ? (
              <>
                Os próximos notebooks com <strong>{modelo}</strong> serão identificados como <strong className="tabular">{exemplo}</strong>.
              </>
            ) : (
              <>
                Sem código, notebooks com <strong>{modelo}</strong> não recebem identificador.
              </>
            )}{" "}
            Os já cadastrados mantêm o identificador atual.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Modelo completo" obrigatorio erro={erros.modelo} className="sm:col-span-2">
            {(p) => <Input {...p} value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={80} autoComplete="off" placeholder="Ex.: Intel Core i5-1345U" autoFocus />}
          </Campo>
          <Campo rotulo="Fabricante">
            {(p) => <Input {...p} value={fabricante} onChange={(e) => setFabricante(e.target.value)} maxLength={40} autoComplete="off" placeholder="Ex.: Intel" />}
          </Campo>
          <Campo rotulo="Família">
            {(p) => <Input {...p} value={familia} onChange={(e) => setFamilia(e.target.value)} maxLength={40} autoComplete="off" placeholder="Ex.: Core i5" />}
          </Campo>
          <Campo rotulo="Código no nome do notebook" erro={erros.codigo} ajuda={exemplo ? `Próximos: ${exemplo}` : "Sem código, o notebook não recebe identificador."} className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, ""))}
                maxLength={3}
                autoComplete="off"
                spellCheck={false}
                className="tabular uppercase sm:max-w-40"
                placeholder="Ex.: 5"
              />
            )}
          </Campo>
          {processador ? <Situacao ativa={ativa} aoMudar={setAtiva} rotulo="Processador ativo" /> : null}
        </div>
      )}
    </Modal>
  );
}

/* Sistema operacional */

export function DialogoSistema({
  sistema,
  categorias,
  aoFechar,
  aoSalvar,
}: {
  sistema?: SistemaOpcao | null;
  /** Categorias que têm sistema operacional (notebook, desktop, celular). */
  categorias: CategoriaSimples[];
  aoFechar: () => void;
  aoSalvar: (s: SistemaOpcao, mensagem: string) => void;
}) {
  const [nome, setNome] = useState(sistema?.nome ?? "");
  const [versao, setVersao] = useState(sistema?.versao ?? "");
  const [restritas, setRestritas] = useState<string[]>(sistema?.categoriaIds ?? []);
  const [ativa, setAtiva] = useState(sistema?.ativa ?? true);
  const { enviando, erro, erros, setErros, enviar } = useEnvio<SistemaOpcao>((e) => (/sistema/i.test(e) && /cadastrado/i.test(e) ? "nome" : null));
  const marcar = (id: string, v: boolean) => setRestritas((l) => (v ? [...l, id] : l.filter((x) => x !== id)));

  function salvar() {
    if (!nome.trim()) return setErros({ nome: "Informe o nome do sistema." });
    const dados = { nome, versao: versao || null, categoriaIds: restritas };
    void enviar(() => (sistema ? acaoEditarSistema({ ...dados, id: sistema.id, ativa }) : acaoCriarSistema(dados)), aoSalvar);
  }

  return (
    <Modal
      titulo={sistema ? "Editar sistema operacional" : "Cadastrar sistema operacional"}
      descricao="Nome, versão ou edição e categorias em que aparece."
      testid="dialogo-sistema"
      enviando={enviando}
      aoFechar={aoFechar}
      erro={erro}
      rodape={<Rodape enviando={enviando} aoCancelar={aoFechar} rotulo={sistema ? "Salvar sistema" : "Cadastrar sistema"} aoSalvar={salvar} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio erro={erros.nome}>
          {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="off" placeholder="Ex.: Windows 11" autoFocus />}
        </Campo>
        <Campo rotulo="Versão ou edição">
          {(p) => <Input {...p} value={versao} onChange={(e) => setVersao(e.target.value)} maxLength={40} autoComplete="off" placeholder="Ex.: Pro" />}
        </Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[13px] leading-5 font-semibold text-titulo">Disponível para</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2" data-testid="categorias-sistema">
            {categorias.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[13.5px] text-titulo">
                <Checkbox checked={restritas.includes(c.id)} onCheckedChange={(v) => marcar(c.id, v === true)} />
                {c.nome}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{restritas.length ? "Aparece só nas categorias marcadas." : "Sem marcação, aparece em todas."}</p>
        </fieldset>
        {sistema ? <Situacao ativa={ativa} aoMudar={setAtiva} rotulo="Sistema ativo" /> : null}
      </div>
    </Modal>
  );
}

/* Padrão de memória */

export function DialogoPadraoMemoria({
  padrao,
  tipoInicial,
  aoFechar,
  aoSalvar,
}: {
  padrao?: PadraoMemoriaOpcao | null;
  tipoInicial?: TipoPadraoMemoria;
  aoFechar: () => void;
  aoSalvar: (p: PadraoMemoriaOpcao, mensagem: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoPadraoMemoria | "">(padrao?.tipo ?? tipoInicial ?? "");
  const [valor, setValor] = useState(padrao?.valor ?? "");
  const [ativa, setAtiva] = useState(padrao?.ativa ?? true);
  const { enviando, erro, erros, setErros, enviar } = useEnvio<PadraoMemoriaOpcao>((e) => (/cadastrad|frequência|valor|uso/i.test(e) ? "valor" : null));
  const frequencia = tipo === "FREQUENCIA";

  function salvar() {
    const e: Record<string, string> = {};
    if (!tipo) e.tipo = "Selecione o tipo.";
    if (!valor.trim()) e.valor = "Informe o valor.";
    else if (frequencia && !FORMATO_FREQUENCIA.test(valor.trim())) e.valor = "Informe em MHz, só números (ex.: 3200).";
    setErros(e);
    if (Object.keys(e).length) return;
    void enviar(() => (padrao ? acaoEditarPadraoMemoria({ id: padrao.id, valor, ativa }) : acaoCriarPadraoMemoria({ tipo, valor })), aoSalvar);
  }

  return (
    <Modal
      titulo={padrao ? "Editar padrão de memória" : "Cadastrar padrão de memória"}
      descricao="Tecnologia, formato ou frequência usados na especificação das memórias."
      testid="dialogo-padrao-memoria"
      enviando={enviando}
      aoFechar={aoFechar}
      erro={erro}
      rodape={<Rodape enviando={enviando} aoCancelar={aoFechar} rotulo={padrao ? "Salvar" : "Cadastrar"} aoSalvar={salvar} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" obrigatorio erro={erros.tipo}>
          {(p) =>
            padrao ? (
              <p id={p.id} className="flex h-10 items-center font-semibold text-titulo">
                {ROTULO_PADRAO_MEMORIA[padrao.tipo]}
              </p>
            ) : (
              <SelecaoPersonalizada
                id={p.id}
                invalido={p["aria-invalid"]}
                valor={tipo}
                aoMudar={(v) => setTipo(v as TipoPadraoMemoria)}
                opcoes={TIPOS_PADRAO_MEMORIA.map((t) => ({ valor: t, rotulo: ROTULO_PADRAO_MEMORIA[t] }))}
              />
            )
          }
        </Campo>
        <Campo rotulo={frequencia ? "Frequência (MHz)" : "Valor"} obrigatorio erro={erros.valor}>
          {(p) => (
            <Input
              {...p}
              value={valor}
              onChange={(e) => setValor(frequencia ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value.toUpperCase())}
              inputMode={frequencia ? "numeric" : undefined}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              className="tabular"
              placeholder={frequencia ? "Ex.: 3200" : tipo === "FORMATO" ? "Ex.: SO-DIMM" : "Ex.: DDR5"}
              autoFocus
            />
          )}
        </Campo>
        {padrao ? <Situacao ativa={ativa} aoMudar={setAtiva} rotulo="Padrão ativo" /> : null}
      </div>
    </Modal>
  );
}
