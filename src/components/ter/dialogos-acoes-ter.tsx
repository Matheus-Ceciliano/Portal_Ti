"use client";

import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, FileUp, HelpCircle, Info, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { formatarDataHora } from "@/components/comum/pagina";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { Estado } from "@/components/comum/status-badge";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { agoraLocal, localParaIso } from "@/components/inventario/visual";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ASSUNTO_ENVIO, CANAIS_ENVIO, FERRAMENTA_PADRAO, MENSAGEM_ENVIO, ROTULO_CANAL, type CanalEnvio, type ResultadoConferencia } from "@/lib/ter";
import { cn } from "@/lib/utils";
import { acaoAnexarAssinado, acaoCancelarTer, acaoConferirAssinatura, acaoRegistrarEnvio, acaoSubstituirTer, type ResultadoTer } from "@/server/acoes/ter";
import type { DetalheTer } from "@/server/modulos/ter";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]");
const SEM_CONEXAO: ResultadoTer = { ok: false, erro: "Não foi possível falar com o servidor. Tente novamente." };
const PDF_MAXIMO = 10 * 1024 * 1024;

type PropsDialogo = { ter: DetalheTer; aberto: boolean; aoMudar: (v: boolean) => void; aoConcluir: () => void };

/** Sucesso: aviso, fecha e recarrega o detalhe. Falha: mensagem no diálogo. */
function concluir(r: ResultadoTer, aoMudar: (v: boolean) => void, aoConcluir: () => void, setErro: (e: string | null) => void) {
  if (!r.ok) return setErro(r.erro);
  toast.success(r.mensagem);
  aoMudar(false);
  aoConcluir();
}

const hrefPdf = (ter: DetalheTer, baixar = false) => `/api/termos/${ter.id}/pdf?arquivo=emitido${ter.versao ? `&versao=${ter.versao}` : ""}${baixar ? "&baixar=1" : ""}`;

function Cabecalho({ titulo, descricao }: { titulo: string; descricao: React.ReactNode }) {
  return (
    <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogDescription>{descricao}</DialogDescription>
    </DialogHeader>
  );
}

function Resumo({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-5 gap-y-2 rounded-xl border bg-muted/30 px-4 py-3 sm:grid-cols-2">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
          <dd className="font-semibold break-words text-titulo">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Documento que será encaminhado: sempre o PDF já emitido (mesmo número, versão e hash). */
function DocumentoEmitido({ ter }: { ter: DetalheTer }) {
  const v = ter.versoes.find((x) => x.versao === ter.versao);
  return (
    <div className="flex flex-col gap-2 rounded-xl border px-4 py-3">
      <p className="text-[12.5px] text-muted-foreground">Documento</p>
      <p className="font-semibold break-words text-titulo">{v?.nomeArquivo ?? ter.numero}</p>
      <p className="tabular text-[12px] break-all text-muted-foreground">
        Versão {ter.versao} · {v?.paginas ?? "—"} página(s) · SHA-256 {v?.sha256 ?? "—"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={hrefPdf(ter, true)}>
            <Download aria-hidden /> Baixar PDF
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={hrefPdf(ter)} target="_blank" rel="noopener">
            <ExternalLink aria-hidden /> Visualizar
          </a>
        </Button>
      </div>
    </div>
  );
}

function Confirmacao({ marcado, aoMudar, erro, tom = "atencao", children }: { marcado: boolean; aoMudar: (v: boolean) => void; erro?: string | null; tom?: "atencao" | "erro"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-3.5", tom === "erro" ? "border-erro/30 bg-erro-fundo" : "border-atencao/30 bg-atencao-fundo")}>
      <label className="flex items-start gap-2.5 text-[13.5px] font-medium text-titulo">
        <Checkbox checked={marcado} onCheckedChange={(v) => aoMudar(v === true)} aria-invalid={erro ? true : undefined} className="mt-0.5" />
        <span>{children}</span>
      </label>
      {erro ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erro}</p> : null}
    </div>
  );
}

function copiar(texto: string, aviso: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success(aviso))
    .catch(() => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."));
}

/* Envio e reenvio para assinatura */

/**
 * O portal não tem serviço de e-mail: o encaminhamento é feito fora dele (com o PDF emitido)
 * e registrado aqui. O reenvio usa exatamente o mesmo PDF; nada é gerado de novo.
 */
export function DialogoEnvioTer({ ter, aberto, aoMudar, aoConcluir, reenvio }: PropsDialogo & { reenvio: boolean }) {
  const [canal, setCanal] = useState<CanalEnvio>((ter.ultimoEnvio?.canal as CanalEnvio | undefined) ?? "EMAIL");
  const [destinatario, setDestinatario] = useState(ter.ultimoEnvio?.destinatario ?? ter.colaborador.emailCorporativo);
  const [quando, setQuando] = useState(() => agoraLocal());
  const [mensagem, setMensagem] = useState(MENSAGEM_ENVIO);
  const [observacao, setObservacao] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const email = canal === "EMAIL" || canal === "TEAMS";

  async function confirmar() {
    const e: Record<string, string> = {};
    if (!destinatario.trim()) e.destinatario = "Informe o destinatário.";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario.trim())) e.destinatario = "Informe um e-mail válido.";
    if (!quando) e.quando = "Informe quando o documento foi encaminhado.";
    if (!mensagem.trim()) e.mensagem = "Informe a mensagem de encaminhamento.";
    if (!confirmado) e.confirmacao = "Confirme que o encaminhamento foi feito fora do portal.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    const r = await acaoRegistrarEnvio({ termoId: ter.id, reenvio, canal, destinatario: destinatario.trim(), mensagem, enviadoEm: localParaIso(quando), observacao: observacao || null }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, aoMudar, aoConcluir, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-envio-ter">
        <Cabecalho
          titulo={reenvio ? "Reenviar para assinatura" : "Enviar para assinatura"}
          descricao={reenvio ? "O mesmo PDF emitido, com o mesmo número, versão e hash. Nenhum documento novo é gerado." : "Encaminhe o PDF emitido ao colaborador para assinatura pelo GOV.BR."}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-fundo px-3 py-2 text-[13px] text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            O portal não envia e-mails. Baixe o PDF, encaminhe-o fora do portal com a mensagem abaixo e registre aqui o envio.
          </p>
          <Resumo
            itens={[
              ["Colaborador", ter.colaborador.nome],
              ["TER", `${ter.numero} · versão ${ter.versao}`],
              ["Alocação", ter.alocacao?.numero ?? "—"],
              ["E-mail no cadastro", ter.colaborador.emailCorporativo],
              ...(reenvio && ter.ultimoEnvio
                ? ([["Último envio", `${formatarDataHora(ter.ultimoEnvio.enviadoEm)} · ${ROTULO_CANAL[ter.ultimoEnvio.canal as CanalEnvio] ?? ter.ultimoEnvio.canal} · ${ter.ultimoEnvio.destinatario}`]] as [string, string][])
                : []),
            ]}
          />
          <DocumentoEmitido ter={ter} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Canal" obrigatorio>
              {(p) => <SelecaoPersonalizada id={p.id} valor={canal} aoMudar={(v) => setCanal(v as CanalEnvio)} opcoes={CANAIS_ENVIO.map((c) => ({ valor: c, rotulo: ROTULO_CANAL[c] }))} />}
            </Campo>
            <Campo rotulo="Data e hora do encaminhamento" obrigatorio erro={erros.quando}>
              {(p) => <Input {...p} type="datetime-local" value={quando} max={agoraLocal()} onChange={(e) => setQuando(e.target.value)} />}
            </Campo>
            <Campo rotulo={email ? "E-mail de destino" : "Destinatário"} obrigatorio erro={erros.destinatario} ajuda={email ? "Vem do cadastro do colaborador; corrija se necessário." : "Quem recebeu o documento."} className="sm:col-span-2">
              {(p) => <Input {...p} type={email ? "email" : "text"} value={destinatario} onChange={(e) => setDestinatario(e.target.value)} autoComplete="off" />}
            </Campo>
          </div>
          <Campo
            rotulo="Mensagem de encaminhamento"
            obrigatorio
            erro={erros.mensagem}
            etiqueta={
              <Button type="button" variant="ghost" size="sm" onClick={() => copiar(`Assunto: ${ASSUNTO_ENVIO}\n\n${mensagem}`, "Assunto e mensagem copiados.")}>
                <Copy aria-hidden /> Copiar
              </Button>
            }
            ajuda={`Assunto: ${ASSUNTO_ENVIO}`}
          >
            {(p) => <Textarea {...p} value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={9} maxLength={4000} />}
          </Campo>
          <Campo rotulo="Observação">
            {(p) => <Textarea {...p} value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500} />}
          </Campo>
          <Confirmacao marcado={confirmado} aoMudar={setConfirmado} erro={erros.confirmacao}>
            Confirmo que o PDF emitido foi encaminhado por este canal, fora do portal.
          </Confirmacao>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Registrando…" onClick={() => void confirmar()}>
            {reenvio ? "Registrar reenvio" : "Registrar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* PDF assinado */

/** O arquivo é guardado como chegou; o TER só fica assinado depois da conferência. */
export function DialogoAnexarAssinado({ ter, aberto, aoMudar, aoConcluir }: PropsDialogo) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!arquivo) return setErroArquivo("Selecione o PDF assinado.");
    if (arquivo.size > PDF_MAXIMO) return setErroArquivo("O PDF pode ter no máximo 10 MB.");
    if (arquivo.type && arquivo.type !== "application/pdf") return setErroArquivo("Envie o termo assinado em PDF.");
    const dados = new FormData();
    dados.set("termoId", ter.id);
    dados.set("versao", String(ter.versao ?? ""));
    dados.set("pdf", arquivo);
    setEnviando(true);
    setErro(null);
    const r = await acaoAnexarAssinado(dados).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, aoMudar, aoConcluir, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-anexar-assinado">
        <Cabecalho titulo="Anexar PDF assinado" descricao={`${ter.numero} · versão ${ter.versao} · ${ter.colaborador.nome}`} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-fundo px-3 py-2 text-[13px] text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />O arquivo é guardado exatamente como recebido. Anexar não torna o TER assinado: a assinatura ainda precisa ser conferida.
          </p>
          {ter.arquivosAssinados.length ? (
            <p className="text-[13px] text-muted-foreground">
              Já há {ter.arquivosAssinados.length} arquivo(s) recebido(s); um novo envio é registrado à parte e os anteriores continuam guardados.
            </p>
          ) : null}
          <Campo rotulo="PDF assinado (até 10 MB)" obrigatorio erro={erroArquivo ?? undefined} ajuda={`Deve corresponder à versão ${ter.versao} do ${ter.numero}.`}>
            {(p) => (
              <Input
                {...p}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  setErroArquivo(null);
                }}
                data-testid="arquivo-assinado"
              />
            )}
          </Campo>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Enviando…" onClick={() => void confirmar()}>
            <FileUp aria-hidden /> Anexar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Conferência manual */

const RESULTADOS: { valor: ResultadoConferencia; titulo: string; detalhe: string; icone: typeof CheckCircle2 }[] = [
  { valor: "CONFORME", titulo: "Conforme", detalhe: "Assinatura válida, do colaborador, no documento emitido.", icone: CheckCircle2 },
  { valor: "NAO_CONFORME", titulo: "Não conforme", detalhe: "Inválida, divergente ou insuficiente: recusar.", icone: XCircle },
  { valor: "INDETERMINADO", titulo: "Indeterminado", detalhe: "Não foi possível concluir a validação.", icone: HelpCircle },
];

/**
 * Conferência manual pelo validador oficial (VALIDAR, do ITI): o portal não valida a assinatura
 * sozinho. "Conforme" só com o signatário identificado e as correspondências confirmadas.
 */
export function DialogoConferenciaTer({ ter, aberto, aoMudar, aoConcluir }: PropsDialogo) {
  const arquivo = ter.arquivoParaConferir;
  const exigeTi = ter.modelo?.exigeAssinaturaTi ?? false;
  const [resultado, setResultado] = useState<ResultadoConferencia | "">("");
  const [ferramenta, setFerramenta] = useState(FERRAMENTA_PADRAO);
  const [signatario, setSignatario] = useState("");
  const [confereColaborador, setConfereColaborador] = useState(false);
  const [confereDocumento, setConfereDocumento] = useState(false);
  const [assinaturaTi, setAssinaturaTi] = useState(false);
  const [relatorio, setRelatorio] = useState<File | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const e: Record<string, string> = {};
    if (!resultado) e.resultado = "Escolha o resultado da conferência.";
    if (!ferramenta.trim()) e.ferramenta = "Informe a ferramenta usada.";
    if (resultado === "CONFORME") {
      if (!signatario.trim()) e.signatario = "Informe o signatário mostrado pelo validador.";
      if (!confereColaborador) e.confereColaborador = "Confirme a correspondência com o colaborador.";
      if (!confereDocumento) e.confereDocumento = "Confirme a correspondência com o documento emitido.";
      if (exigeTi && !assinaturaTi) e.assinaturaTi = "Confirme também a assinatura do responsável da TI.";
    } else if (resultado && !motivo.trim()) {
      e.motivo = resultado === "NAO_CONFORME" ? "Informe o motivo da recusa." : "Informe por que a validação ficou indeterminada.";
    }
    if (relatorio && relatorio.size > PDF_MAXIMO) e.relatorio = "O relatório pode ter no máximo 10 MB.";
    setErros(e);
    if (Object.keys(e).length || !arquivo) return;
    const dados = new FormData();
    dados.set("termoId", ter.id);
    dados.set("arquivoId", arquivo.id);
    dados.set("resultado", resultado);
    dados.set("ferramenta", ferramenta);
    dados.set("signatario", signatario);
    dados.set("confereColaborador", confereColaborador ? "sim" : "nao");
    dados.set("confereDocumento", confereDocumento ? "sim" : "nao");
    dados.set("assinaturaTiVerificada", assinaturaTi ? "sim" : "nao");
    dados.set("motivo", motivo);
    dados.set("observacoes", observacoes);
    if (relatorio) dados.set("relatorio", relatorio);
    setEnviando(true);
    setErro(null);
    const r = await acaoConferirAssinatura(dados).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, aoMudar, aoConcluir, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-conferencia-ter">
        <Cabecalho titulo="Conferir assinatura" descricao={`${ter.numero} · versão ${ter.versao} · ${ter.colaborador.nome}`} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          {!arquivo ? (
            <AlertaFormulario tom="erro">Não há PDF assinado aguardando conferência.</AlertaFormulario>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-xl border px-4 py-3">
                <p className="text-[12.5px] text-muted-foreground" data-testid="origem-arquivo-conferencia">
                  {arquivo.origem === "PORTAL_COLABORADOR"
                    ? `Enviado pelo colaborador no Portal do Colaborador em ${formatarDataHora(arquivo.recebidoEm)}`
                    : `Recebido pela TI (${arquivo.enviadoPorNome}) em ${formatarDataHora(arquivo.recebidoEm)}`}
                </p>
                <p className="font-semibold break-words text-titulo">{arquivo.nomeOriginal}</p>
                <p className="tabular text-[12px] break-all text-muted-foreground">SHA-256 {arquivo.sha256}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={`/api/termos/${ter.id}/pdf?arquivo=assinado&id=${arquivo.id}&baixar=1`}>
                      <Download aria-hidden /> Baixar arquivo assinado
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden /> Abrir o VALIDAR (ITI)
                    </a>
                  </Button>
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-[13px] text-atencao">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />O portal não valida a assinatura automaticamente. Valide o arquivo no serviço oficial e registre o que foi observado; a aparência da
                rubrica ou o nome do arquivo não comprovam a assinatura.
              </p>
              <fieldset className="min-w-0">
                <legend className="mb-2 text-[13px] font-semibold text-titulo">
                  Resultado<span className="font-medium text-muted-foreground"> *</span>
                </legend>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Resultado da conferência">
                  {RESULTADOS.map(({ valor, titulo, detalhe, icone: Icone }) => {
                    const marcado = resultado === valor;
                    return (
                      <label
                        key={valor}
                        className={cn(
                          // relative: contém o rádio sr-only (o foco nele não rola o diálogo).
                          "relative flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                          marcado ? "border-primary bg-accent/60" : "hover:bg-muted/50",
                        )}
                      >
                        <input
                          type="radio"
                          name="resultado-conferencia"
                          value={valor}
                          checked={marcado}
                          onChange={() => {
                            setResultado(valor);
                            setErros((x) => ({ ...x, resultado: "" }));
                          }}
                          className="sr-only"
                        />
                        <Icone className={cn("mt-0.5 size-4 shrink-0", marcado ? "text-primary" : "text-muted-foreground")} aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-titulo">{titulo}</span>
                          <span className="block text-[12px] leading-4 text-muted-foreground">{detalhe}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {erros.resultado ? <p className="mt-1.5 text-[13px] font-medium text-erro">{erros.resultado}</p> : null}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Ferramenta de validação" obrigatorio erro={erros.ferramenta}>
                  {(p) => <Input {...p} value={ferramenta} onChange={(e) => setFerramenta(e.target.value)} maxLength={200} />}
                </Campo>
                <Campo rotulo="Signatário identificado" obrigatorio={resultado === "CONFORME"} erro={erros.signatario} ajuda="Nome (e CPF, se exibido) que o validador mostra.">
                  {(p) => <Input {...p} value={signatario} onChange={(e) => setSignatario(e.target.value)} maxLength={200} autoComplete="off" />}
                </Campo>
              </div>
              <div className="flex flex-col gap-2">
                <Confirmacao marcado={confereColaborador} aoMudar={setConfereColaborador} erro={erros.confereColaborador}>
                  O signatário corresponde a {ter.colaborador.nome}.
                </Confirmacao>
                <Confirmacao marcado={confereDocumento} aoMudar={setConfereDocumento} erro={erros.confereDocumento}>
                  O arquivo assinado é o {ter.numero}, versão {ter.versao}, com o conteúdo emitido pelo portal (documento completo, sem alterações).
                </Confirmacao>
                {exigeTi ? (
                  <Confirmacao marcado={assinaturaTi} aoMudar={setAssinaturaTi} erro={erros.assinaturaTi}>
                    A assinatura do responsável da TI também foi verificada.
                  </Confirmacao>
                ) : null}
              </div>
              <Campo rotulo="Relatório de validação (PDF, opcional)" erro={erros.relatorio}>
                {(p) => <Input {...p} type="file" accept="application/pdf,.pdf" onChange={(e) => setRelatorio(e.target.files?.[0] ?? null)} />}
              </Campo>
              <Campo
                rotulo="Motivo"
                obrigatorio={resultado === "NAO_CONFORME" || resultado === "INDETERMINADO"}
                erro={erros.motivo}
                ajuda={resultado === "NAO_CONFORME" ? "Aparece para o colaborador no portal: escreva de forma clara, sem dados internos." : undefined}
              >
                {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={1000} />}
              </Campo>
              <Campo rotulo="Observações internas" ajuda="Não aparecem para o colaborador.">
                {(p) => <Textarea {...p} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={1000} />}
              </Campo>
            </>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Registrando…" disabled={!arquivo} onClick={() => void confirmar()}>
            Registrar conferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Cancelamento e nova versão */

/** Cancelar não exclui o TER nem altera a alocação; assinado e conferido exige procedimento administrativo. */
export function DialogoCancelarTer({ ter, aberto, aoMudar, aoConcluir }: PropsDialogo) {
  const assinado = ter.estadoAssinatura === "ASSINADO_CONFERIDO";
  const [motivo, setMotivo] = useState("");
  const [procedimento, setProcedimento] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const e: Record<string, string> = {};
    if (motivo.trim().length < 10) e.motivo = "Informe o motivo do cancelamento (ao menos 10 caracteres).";
    if (assinado && !procedimento.trim()) e.procedimento = "Informe a referência do procedimento administrativo.";
    if (!confirmado) e.confirmacao = "Confirme o cancelamento.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    const r = await acaoCancelarTer({ termoId: ter.id, motivo, procedimento: procedimento || null, confirmacao: true }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, aoMudar, aoConcluir, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-cancelar-ter">
        <Cabecalho titulo="Cancelar TER" descricao="O TER não é excluído: o PDF, os envios e os arquivos assinados continuam no histórico." />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <Resumo
            itens={[
              ["TER", `${ter.numero} · versão ${ter.versao ?? "—"}`],
              ["Colaborador", ter.colaborador.nome],
              ["Alocação", ter.alocacao?.numero ?? "—"],
              ["Situação atual", <Estado key="s" grupo="ter" valor={ter.situacao} />],
            ]}
          />
          {assinado ? (
            <p className="flex items-start gap-2 rounded-lg border border-erro/30 bg-erro-fundo px-3 py-2 text-[13px] text-erro">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              TER assinado e conferido: o cancelamento exige procedimento administrativo autorizado. O documento assinado continua guardado.
            </p>
          ) : null}
          <Campo rotulo="Motivo do cancelamento" obrigatorio erro={erros.motivo}>
            {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} />}
          </Campo>
          {assinado ? (
            <Campo rotulo="Procedimento administrativo" obrigatorio erro={erros.procedimento} ajuda="Ex.: número do chamado ou do processo que autorizou o cancelamento.">
              {(p) => <Input {...p} value={procedimento} onChange={(e) => setProcedimento(e.target.value)} maxLength={200} />}
            </Campo>
          ) : null}
          <Confirmacao marcado={confirmado} aoMudar={setConfirmado} erro={erros.confirmacao} tom="erro">
            Confirmo o cancelamento do {ter.numero}. A alocação e a entrega física não são alteradas; o termo cancelado não pode ser reenviado.
          </Confirmacao>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button variant="destructive" carregando={enviando} rotuloCarregando="Cancelando…" onClick={() => void confirmar()}>
            Cancelar TER
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Correção: nova versão com os dados corrigidos na origem; a anterior fica substituída e guardada. */
export function DialogoSubstituirTer({ ter, aberto, aoMudar, aoConcluir }: PropsDialogo) {
  const assinado = ter.estadoAssinatura === "ASSINADO_CONFERIDO";
  const [motivo, setMotivo] = useState("");
  const [procedimento, setProcedimento] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const e: Record<string, string> = {};
    if (motivo.trim().length < 10) e.motivo = "Descreva o erro corrigido (ao menos 10 caracteres).";
    if (assinado && !procedimento.trim()) e.procedimento = "Informe a referência do procedimento administrativo.";
    if (!confirmado) e.confirmacao = "Confirme a nova versão.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro(null);
    const r = await acaoSubstituirTer({ termoId: ter.id, motivo, procedimento: procedimento || null }).catch(() => SEM_CONEXAO);
    setEnviando(false);
    concluir(r, aoMudar, aoConcluir, setErro);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-substituir-ter">
        <Cabecalho titulo="Nova versão do TER" descricao={`${ter.numero} · versão ${ter.versao} → versão ${(ter.versao ?? 0) + 1}`} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
          {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
          <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-fundo px-3 py-2 text-[13px] text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Corrija antes a informação na origem (por exemplo, no cadastro de Pessoas ou de Empresas). A versão atual fica substituída e guardada; as condições técnicas da entrega não mudam. A nova versão
            precisa ser encaminhada e assinada de novo.
          </p>
          {assinado ? (
            <p className="flex items-start gap-2 rounded-lg border border-erro/30 bg-erro-fundo px-3 py-2 text-[13px] text-erro">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />A assinatura conferida da versão atual não vale para a nova versão.
            </p>
          ) : null}
          <Campo rotulo="Erro corrigido" obrigatorio erro={erros.motivo}>
            {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} />}
          </Campo>
          {assinado ? (
            <Campo rotulo="Procedimento administrativo" obrigatorio erro={erros.procedimento}>
              {(p) => <Input {...p} value={procedimento} onChange={(e) => setProcedimento(e.target.value)} maxLength={200} />}
            </Campo>
          ) : null}
          <Confirmacao marcado={confirmado} aoMudar={setConfirmado} erro={erros.confirmacao}>
            Confirmo a geração da versão {(ter.versao ?? 0) + 1}; a versão {ter.versao} fica substituída.
          </Confirmacao>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-6 py-3">
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Voltar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Gerando…" onClick={() => void confirmar()}>
            Gerar nova versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
