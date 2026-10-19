"use client";

import { AlertCircle, Building2, CheckCircle2, Copy, FlaskConical, KeyRound, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertaFormulario, BotaoPendente, Campo, CampoSenha, useFormularioAcao } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { StatusBadge } from "@/components/comum/status-badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, InputComIcone } from "@/components/ui/input";
import {
  calcularIdentificadores,
  calcularSegundoNome,
  calcularSenhaInicial,
  fazParteDoNome,
  faltaParaSenhaInicial,
  MENSAGEM_LOGIN_EM_USO,
  normalizarNome,
  opcoesSobrenome,
} from "@/lib/identificadores";
import { cn } from "@/lib/utils";
import { acaoSalvarPessoa, acaoVerificarIdentificadores, type EstadoPessoa, type ResultadoVerificacao } from "@/server/acoes/pessoas";
import type { CampoIdentificador } from "@/server/modulos/pessoas";

export type EmpresaOpcao = { id: string; nome: string; sigla: string; nomeCurtoSenha: string | null };
export type GrupoOpcao = { id: string; nome: string; dominioLogin: string; dominioEmail: string; ativo: boolean };
export type SituacaoPessoa = "ATIVO" | "PRE_CADASTRO" | "AFASTADO" | "DESLIGADO";

export type PessoaEditavel = {
  id: string;
  nome: string;
  segundoNome: string | null;
  sobrenomeUtilizado: string | null;
  empresaId: string;
  cargo: string;
  departamento: string;
  situacao: SituacaoPessoa;
  grupoLicencaId: string | null;
  nomeServidorPc: string | null;
  loginUau: string | null;
  loginMicrosoft: string | null;
  email: string;
  fotoUrl: string | null;
};

const SITUACOES = [
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "PRE_CADASTRO", rotulo: "Pré-cadastro" },
  { valor: "AFASTADO", rotulo: "Afastado" },
];

const ROTULO: Record<CampoIdentificador, string> = {
  nomeServidorPc: "Nome do servidor/PC",
  loginUau: "Login UAU",
  loginMicrosoft: "Login Microsoft",
  emailCorporativo: "E-mail corporativo",
};

const SEGUNDO_NOME_INDETERMINADO = "Não foi possível determinar pelo nome completo. Informe o segundo nome.";
const TODOS_EM_USO = "Todos os sobrenomes do nome completo geram logins já em uso. Será necessária uma resolução específica pela TI.";
const FALHA_VERIFICACAO = "Não foi possível verificar a disponibilidade dos logins. Tente novamente.";
/** Espera depois da última digitação antes de consultar a disponibilidade. */
const INTERVALO_VERIFICACAO = 400;

type Disponibilidade = "verificando" | "disponivel" | "em-uso" | null;

/** Mensagem de boas-vindas montada só com os campos preenchidos. Prévia: não é enviada nem gravada. */
function mensagemBoasVindas(d: { nome: string; servidorPc: string; loginUau: string; loginPortal: string; senha: string }) {
  const linhas = [
    `Olá, ${d.nome}!`,
    "",
    "Seja bem-vindo(a) ao Grupo Vallur.",
    "",
    "Seus dados de acesso:",
    "",
    d.servidorPc ? `Computador/Servidor: ${d.servidorPc}` : null,
    d.loginUau ? `UAU: ${d.loginUau}` : null,
    `Portal TI Vallur: ${d.loginPortal}`,
    `Senha inicial: ${d.senha}`,
    "",
    "No primeiro acesso ao Portal TI Vallur, utilize a senha inicial para ativar sua conta e configurar sua senha pessoal.",
    "",
    "Em caso de dúvidas, procure a equipe de TI.",
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

function copiar(texto: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success("Mensagem copiada."))
    .catch(() => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."));
}

function MensagemBoasVindas({ texto }: { texto: string }) {
  return (
    <section aria-label="Mensagem de boas-vindas" className="rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-[13px] font-bold text-titulo">Mensagem de boas-vindas</h3>
        <Button type="button" variant="secondary" size="sm" onClick={() => copiar(texto)}>
          <Copy aria-hidden /> Copiar mensagem
        </Button>
      </header>
      <pre className="px-4 py-3 font-sans text-sm leading-6 break-words whitespace-pre-wrap text-foreground" data-testid="mensagem-boas-vindas">
        {texto}
      </pre>
      <p className="border-t px-4 py-2.5 text-[12.5px] text-muted-foreground">
        Prévia: a mensagem não é enviada nem gravada. Computador e UAU dependem da criação das contas nos respectivos sistemas.
      </p>
    </section>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left mb-3 w-full">
        <span className="block text-sm font-bold text-titulo">{titulo}</span>
        {descricao ? <span className="block text-[12.5px] font-normal text-muted-foreground">{descricao}</span> : null}
      </legend>
      <div className="clear-both grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12">{children}</div>
    </fieldset>
  );
}

/** Situação discreta do identificador: verificando, disponível ou em uso no portal. */
function EtiquetaDisponibilidade({ estado }: { estado: Disponibilidade }) {
  if (estado === "verificando") {
    return (
      <StatusBadge tom="neutro" className="text-[11px]">
        Verificando…
      </StatusBadge>
    );
  }
  if (estado === "em-uso") {
    return (
      <StatusBadge tom="erro" icone={AlertCircle} className="text-[11px]">
        Em uso
      </StatusBadge>
    );
  }
  if (estado === "disponivel") {
    return (
      <StatusBadge tom="sucesso" icone={CheckCircle2} className="text-[11px]">
        Disponível
      </StatusBadge>
    );
  }
  return null;
}

/**
 * Identificador calculado pelas fórmulas da planilha. No cadastro: somente leitura, com a
 * disponibilidade ao lado (sem grupo de licença, o e-mail é digitado). Na edição: o valor
 * atual permanece; a proposta só é gravada se for aplicada de forma explícita.
 */
function CampoIdentificadorUi({
  campo,
  ajuda,
  modo,
  atual,
  proposto,
  disponibilidade,
  digitavel,
  aoDigitar,
  aplicado,
  aoAplicar,
  erro,
  className,
}: {
  campo: CampoIdentificador;
  ajuda: string;
  modo: "criar" | "editar";
  atual?: string | null;
  proposto: string;
  disponibilidade: Disponibilidade;
  /** Cadastro sem grupo de licença: o e-mail é informado pela TI. */
  digitavel?: boolean;
  aoDigitar?: (valor: string) => void;
  aplicado?: boolean;
  aoAplicar?: (aplicar: boolean) => void;
  erro?: string;
  className?: string;
}) {
  const id = useId();
  const emUso = disponibilidade === "em-uso";
  const valorCampo = modo === "editar" ? (atual ?? "") : proposto;
  const mudaNaEdicao = modo === "editar" && Boolean(proposto) && proposto !== (atual ?? "");
  // Calculado em uso: etiqueta e borda aqui; a orientação (outro sobrenome) aparece uma vez, no Sobrenome utilizado.
  const mensagem = erro ?? (modo === "criar" && emUso && digitavel ? "Este login já está em uso. Informe outro e-mail." : undefined);
  const emUsoSemMensagem = modo === "criar" && emUso && !mensagem;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] leading-5 font-semibold text-titulo">
          {ROTULO[campo]}
          {campo === "emailCorporativo" && modo === "criar" ? (
            <span className="font-medium text-muted-foreground">
              <span aria-hidden> *</span>
              <span className="sr-only"> (obrigatório)</span>
            </span>
          ) : null}
        </label>
        {modo === "criar" ? <EtiquetaDisponibilidade estado={proposto ? disponibilidade : null} /> : null}
      </div>
      <Input
        id={id}
        value={valorCampo}
        readOnly={!digitavel}
        placeholder={digitavel ? "nome@empresa.com.br" : "—"}
        onChange={(e) => aoDigitar?.(e.target.value)}
        aria-invalid={mensagem || emUsoSemMensagem ? true : undefined}
        aria-describedby={`${id}-ajuda`}
        spellCheck={false}
        autoComplete="off"
        className={cn("tabular", !digitavel && "cursor-default border-dashed bg-muted/50 text-titulo focus-visible:ring-2", campo === "loginUau" && "uppercase")}
      />
      {mudaNaEdicao ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
            emUso ? "border-erro/30 bg-erro-fundo" : aplicado ? "border-primary/40 bg-accent/60" : "bg-muted/40",
          )}
        >
          <span className="text-muted-foreground">{aplicado ? "Será gravado:" : "Proposta:"}</span>
          <code className="tabular min-w-0 break-all font-semibold text-titulo">{proposto}</code>
          {emUso ? <span className="font-medium text-erro">Em uso</span> : null}
          <Button type="button" variant="ghost" size="xs" className="ml-auto" disabled={emUso && !aplicado} onClick={() => aoAplicar?.(!aplicado)}>
            {aplicado ? "Manter atual" : "Aplicar"}
          </Button>
        </div>
      ) : null}
      {mensagem ? (
        <p className="flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-erro">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {mensagem}
        </p>
      ) : null}
      <p id={`${id}-ajuda`} className="text-[12.5px] leading-[17px] text-muted-foreground">
        {emUsoSemMensagem ? <span className="sr-only">Em uso por outra pessoa. </span> : null}
        {ajuda}
      </p>
    </div>
  );
}

export function DialogoFormularioPessoa({
  aberto,
  aoMudar,
  pessoa,
  empresas,
  grupos,
  podeProvisionar,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** Ausente = cadastro; presente = edição. */
  pessoa?: PessoaEditavel | null;
  empresas: EmpresaOpcao[];
  grupos: GrupoOpcao[];
  podeProvisionar: boolean;
  aoSalvar?: (colaboradorId: string) => void;
}) {
  const router = useRouter();
  const edicao = Boolean(pessoa);
  const modo = edicao ? "editar" : "criar";
  const { estado, pendente, aoEnviar } = useFormularioAcao<EstadoPessoa>(acaoSalvarPessoa, {});

  const [f, setF] = useState({
    nome: pessoa?.nome ?? "",
    sobrenome: pessoa?.sobrenomeUtilizado ?? "",
    empresaId: pessoa?.empresaId ?? "",
    cargo: pessoa?.cargo ?? "",
    departamento: pessoa?.departamento ?? "",
    situacao: pessoa?.situacao ?? "ATIVO",
    grupoId: pessoa?.grupoLicencaId ?? "",
    /** Só no cadastro sem grupo de licença. */
    emailInformado: "",
  });
  // Segundo nome digitado pela TI e o nome completo de quando foi digitado; null = calculado.
  const [segundoManual, setSegundoManual] = useState<{ valor: string; nomeBase: string } | null>(() =>
    pessoa?.segundoNome && pessoa.segundoNome !== calcularSegundoNome(pessoa.nome) ? { valor: pessoa.segundoNome, nomeBase: pessoa.nome } : null,
  );
  const [aplicar, setAplicar] = useState<Set<CampoIdentificador>>(new Set());
  const [etapa, setEtapa] = useState<"preencher" | "revisar" | "concluido">("preencher");
  const [verificacao, setVerificacao] = useState<{ chave: string; r: ResultadoVerificacao } | null>(null);
  const [rodada, setRodada] = useState(0);
  const [verificando, setVerificando] = useState(false);
  const [errosLocais, setErrosLocais] = useState<Record<string, string>>({});
  const [criarM365, setCriarM365] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const refCorpo = useRef<HTMLDivElement>(null);
  const refSobrenome = useRef<HTMLDivElement>(null);
  const tratado = useRef<EstadoPessoa | null>(null);

  /** Erro local de cada campo some quando o campo muda. */
  const CAMPO_ERRO: Partial<Record<keyof typeof f, string>> = { nome: "nome", sobrenome: "sobrenomeUtilizado", empresaId: "empresaId", emailInformado: "emailCorporativo" };
  const limparErros = (...chaves: string[]) =>
    setErrosLocais((e) => (chaves.some((c) => c in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !chaves.includes(k))) : e));
  const mudar = (parcial: Partial<typeof f>) => {
    setF((atual) => ({ ...atual, ...parcial }));
    limparErros(...Object.keys(parcial).flatMap((k) => CAMPO_ERRO[k as keyof typeof f] ?? []), "geral");
    setAlterado(true);
  };

  /* Composição de nomes */
  const segundoCalculado = calcularSegundoNome(f.nome);
  const segundoNome = segundoManual?.valor ?? segundoCalculado ?? "";
  const segundoAlterado = segundoManual !== null && normalizarNome(segundoManual.valor) !== (segundoCalculado ?? "");
  // Nome completo mudou depois de uma edição manual que não faz mais parte dele: pergunta antes de substituir.
  const confirmarSegundo =
    segundoManual !== null &&
    segundoAlterado &&
    segundoCalculado !== null &&
    Boolean(normalizarNome(segundoManual.valor)) &&
    f.nome !== segundoManual.nomeBase &&
    !fazParteDoNome(f.nome, segundoManual.valor);
  const editarSegundo = (valor: string) => {
    setSegundoManual({ valor, nomeBase: f.nome });
    limparErros("segundoNome", "senhaInicial", "geral");
    setAlterado(true);
  };

  const opcoesNome = useMemo(() => opcoesSobrenome(f.nome), [f.nome]);
  // Edição de cadastro antigo: o sobrenome gravado continua disponível mesmo fora das opções do nome.
  const legado =
    pessoa?.sobrenomeUtilizado && !opcoesNome.some((o) => o.toLowerCase() === pessoa.sobrenomeUtilizado!.toLowerCase()) ? pessoa.sobrenomeUtilizado : null;
  const opcoes = legado ? [...opcoesNome, legado] : opcoesNome;
  // Só uma opção: não há o que escolher. Se o nome mudar e o sobrenome sair dele, a escolha volta a ficar vazia.
  const sobrenome = opcoes.find((o) => o.toLowerCase() === normalizarNome(f.sobrenome).toLowerCase()) ?? (opcoes.length === 1 ? opcoes[0] : "");

  /* Identificadores (fórmulas da planilha) */
  const grupo = grupos.find((g) => g.id === f.grupoId) ?? null;
  const calculados = useMemo(
    () => (sobrenome ? calcularIdentificadores({ nomeCompleto: f.nome, segundoNome, sobrenomeUtilizado: sobrenome, grupo }) : null),
    [f.nome, segundoNome, sobrenome, grupo],
  );
  const propostos: Record<CampoIdentificador, string> = {
    nomeServidorPc: calculados?.nomeServidorPc ?? "",
    loginUau: calculados && calculados.loginUau.length >= 2 ? calculados.loginUau : "",
    loginMicrosoft: calculados?.loginMicrosoft ?? "",
    emailCorporativo: grupo ? (calculados?.emailCorporativo ?? "") : edicao ? (pessoa?.email ?? "") : normalizarNome(f.emailInformado).toLowerCase(),
  };
  const atuais: Record<CampoIdentificador, string> = {
    nomeServidorPc: pessoa?.nomeServidorPc ?? "",
    loginUau: pessoa?.loginUau ?? "",
    loginMicrosoft: pessoa?.loginMicrosoft ?? "",
    emailCorporativo: pessoa?.email ?? "",
  };
  /** Edição: só os campos aplicados com valor diferente do atual mudam. */
  const aplicados = [...aplicar].filter((c) => propostos[c] && propostos[c] !== atuais[c]);

  // Senha inicial de ativação (fórmula da planilha): derivada dos campos, nunca guardada à parte.
  const empresa = empresas.find((e) => e.id === f.empresaId) ?? null;
  const senhaInicial = edicao ? null : calcularSenhaInicial(empresa?.nomeCurtoSenha, f.nome, segundoNome);
  const faltaSenha = edicao ? null : faltaParaSenhaInicial(empresa?.nomeCurtoSenha, f.nome, segundoNome);

  /* Disponibilidade no banco do portal: consulta depois de uma pausa na digitação. */
  const consulta =
    opcoesNome.length > 0
      ? {
          nome: normalizarNome(f.nome),
          segundoNome: normalizarNome(segundoNome) || undefined,
          sobrenomeUtilizado: sobrenome || undefined,
          grupoLicencaId: f.grupoId || undefined,
          email: !grupo && !edicao && propostos.emailCorporativo ? propostos.emailCorporativo : undefined,
          colaboradorId: pessoa?.id,
        }
      : null;
  const chaveConsulta = consulta ? JSON.stringify([consulta, rodada]) : null;
  useEffect(() => {
    if (!chaveConsulta || !aberto) return;
    let ativa = true;
    const espera = setTimeout(() => {
      void acaoVerificarIdentificadores(JSON.parse(chaveConsulta)[0])
        .catch((): ResultadoVerificacao => ({ ok: false, erro: FALHA_VERIFICACAO }))
        .then((r) => {
          if (ativa) setVerificacao({ chave: chaveConsulta, r });
        });
    }, INTERVALO_VERIFICACAO);
    return () => {
      ativa = false;
      clearTimeout(espera);
    };
  }, [chaveConsulta, aberto]);

  const atualizada = verificacao !== null && verificacao.chave === chaveConsulta;
  const resultado = atualizada && verificacao.r.ok ? verificacao.r : null;
  const falhaVerificacao = atualizada && !verificacao.r.ok ? verificacao.r.erro : null;
  const conflitos = new Set(resultado?.conflitos.map((c) => c.campo) ?? []);
  const sobrenomesEmUso = new Set(resultado?.sobrenomes.filter((s) => s.emUso).map((s) => s.valor.toLowerCase()) ?? []);
  const todosEmUso = !edicao && Boolean(resultado?.sobrenomes.length) && resultado!.sobrenomes.every((s) => s.emUso);
  const disponibilidade = (campo: CampoIdentificador): Disponibilidade =>
    !propostos[campo] || !chaveConsulta || falhaVerificacao ? null : !atualizada ? "verificando" : conflitos.has(campo) ? "em-uso" : "disponivel";
  /** Conflitos que impedem salvar: no cadastro, todos; na edição, só os dos campos aplicados. */
  const bloqueantes = edicao ? aplicados.filter((c) => conflitos.has(c)) : [...conflitos];
  // Sem grupo, o e-mail digitado não depende do sobrenome: o aviso fica no próprio campo.
  const conflitosDoSobrenome = bloqueantes.filter((c) => grupo || c !== "emailCorporativo");

  function alternarAplicar(campo: CampoIdentificador, sim: boolean) {
    setAplicar((a) => {
      const novo = new Set(a);
      if (sim) novo.add(campo);
      else novo.delete(campo);
      return novo;
    });
    setAlterado(true);
  }

  // Resposta do servidor (ajuste de estado durante a renderização): login tomado entre a
  // revisão e a gravação volta ao preenchimento com a disponibilidade consultada de novo.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.ok && !edicao) {
      setEtapa("concluido"); // mostra a mensagem final; a TI conclui quando quiser
    } else if (estado.conflitos?.length) {
      setRodada((r) => r + 1);
      setEtapa("preencher");
    } else if (estado.erros || estado.erro) {
      setEtapa("preencher");
    }
  }

  // Sucesso: efeitos externos (aviso, fechar, atualizar a lista).
  useEffect(() => {
    if (!estado.ok || !estado.colaboradorId || tratado.current === estado) return;
    tratado.current = estado;
    toast.success(estado.mensagem);
    router.refresh();
    if (edicao) {
      aoMudar(false);
      aoSalvar?.(estado.colaboradorId);
    }
  }, [estado, edicao, aoMudar, router, aoSalvar]);

  async function revisar() {
    const erros: Record<string, string> = {};
    const nomePreenchido = normalizarNome(f.nome).length >= 3;
    if (!nomePreenchido) erros.nome = "Informe o nome completo.";
    if (!f.empresaId) erros.empresaId = "Selecione a empresa.";
    if (confirmarSegundo) erros.segundoNome = "Confirme o segundo nome: use o calculado ou mantenha o informado.";
    if (!edicao) {
      if (nomePreenchido && !normalizarNome(segundoNome)) erros.segundoNome = segundoCalculado === null ? SEGUNDO_NOME_INDETERMINADO : "Informe o segundo nome.";
      if (nomePreenchido && !sobrenome) erros.sobrenomeUtilizado = opcoes.length ? "Selecione o sobrenome utilizado." : "Informe o nome completo com o sobrenome.";
      if (!propostos.emailCorporativo) erros.emailCorporativo = "Informe o e-mail corporativo ou escolha um grupo de licença.";
      if (!senhaInicial && !erros.segundoNome) erros.senhaInicial = faltaSenha ?? "Não foi possível calcular a senha inicial.";
    }
    setErrosLocais(erros);
    if (Object.keys(erros).length) return;

    // Verificação final, sem esperar a pausa da digitação.
    let r: ResultadoVerificacao | null = resultado;
    if (consulta && !r) {
      setVerificando(true);
      r = await acaoVerificarIdentificadores(consulta).catch((): ResultadoVerificacao => ({ ok: false, erro: FALHA_VERIFICACAO }));
      setVerificando(false);
      if (chaveConsulta) setVerificacao({ chave: chaveConsulta, r });
    }
    if (r && !r.ok) {
      setErrosLocais({ geral: r.erro });
      return;
    }
    const emConflito = new Set(r?.conflitos.map((c) => c.campo) ?? []);
    if (edicao ? aplicados.some((c) => emConflito.has(c)) : emConflito.size > 0) {
      refSobrenome.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setEtapa("revisar");
    refCorpo.current?.scrollTo({ top: 0 });
  }

  const solicitarFechar = () => {
    if (pendente) return;
    if (etapa === "concluido") aoMudar(false);
    else if (alterado) setConfirmarDescarte(true);
    else aoMudar(false);
  };

  const erro = (campo: string) => errosLocais[campo] ?? estado.erros?.[campo];
  const erroSobrenome = erro("sobrenomeUtilizado") ?? (todosEmUso ? TODOS_EM_USO : conflitosDoSobrenome.length ? MENSAGEM_LOGIN_EM_USO : undefined);
  const empresaNome = empresa?.nome ?? "—";
  const finais: Record<CampoIdentificador, string> = edicao
    ? { ...atuais, ...Object.fromEntries(aplicados.map((c) => [c, propostos[c]])) }
    : propostos;
  const mensagem =
    !edicao && senhaInicial
      ? mensagemBoasVindas({
          nome: normalizarNome(f.nome),
          servidorPc: finais.nomeServidorPc,
          loginUau: finais.loginUau,
          loginPortal: finais.emailCorporativo,
          senha: senhaInicial,
        })
      : null;
  const resumo: [string, string][] = [
    ["Nome completo", normalizarNome(f.nome)],
    ["Segundo nome", normalizarNome(segundoNome) || "—"],
    ["Sobrenome utilizado", sobrenome || "—"],
    ["Empresa", empresaNome],
    ["Cargo", f.cargo.trim() || "—"],
    ["Departamento", f.departamento.trim() || "—"],
    ["Situação", SITUACOES.find((s) => s.valor === f.situacao)?.rotulo ?? f.situacao],
    ["Grupo de licença", grupo?.nome ?? "Sem grupo"],
    ["Nome do servidor/PC", finais.nomeServidorPc || "—"],
    ["Login UAU", finais.loginUau || "—"],
    ["Login Microsoft", finais.loginMicrosoft || "—"],
    ["E-mail corporativo (login do portal)", finais.emailCorporativo || "—"],
  ];

  const semSobrenome = sobrenome ? null : opcoes.length ? "Selecione o sobrenome utilizado." : null;
  const camposIdentificador = (
    [
      ["nomeServidorPc", "Primeiro nome + sobrenome utilizado.", "lg:col-span-4"],
      ["loginUau", "Inicial do nome + inicial do segundo nome + sobrenome, em maiúsculas, até 8 caracteres.", "lg:col-span-4"],
      [
        "loginMicrosoft",
        grupo ? `Servidor/PC em minúsculas, com ponto, + @${grupo.dominioLogin}.` : "Sem grupo de licença: o domínio não é presumido.",
        "lg:col-span-6",
      ],
    ] as const
  ).map(([campo, ajuda, classe]) => (
    <CampoIdentificadorUi
      key={campo}
      campo={campo}
      ajuda={(campo !== "loginMicrosoft" || grupo ? semSobrenome : null) ?? ajuda}
      modo={modo}
      atual={atuais[campo]}
      proposto={propostos[campo]}
      disponibilidade={disponibilidade(campo)}
      aplicado={aplicar.has(campo)}
      aoAplicar={(sim) => alternarAplicar(campo, sim)}
      erro={erro(campo)}
      className={cn("sm:col-span-2", classe)}
    />
  ));

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? aoMudar(true) : solicitarFechar())}>
        <DialogContent
          className={cn(MODAL_CENTRALIZADO, "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", LARGURA_MODAL[1050])}
          data-testid="dialogo-pessoa"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
            <DialogTitle>{etapa === "concluido" ? "Cadastro concluído" : edicao ? `Editar ${pessoa!.nome}` : "Cadastrar pessoa"}</DialogTitle>
            <DialogDescription className={etapa === "revisar" ? undefined : "sr-only"}>
              {etapa === "revisar" ? "Revise os dados antes de confirmar. Nenhuma operação é feita no Microsoft 365." : "Cadastro de pessoa."}
            </DialogDescription>
          </DialogHeader>

          <form id="form-pessoa" onSubmit={(e) => (etapa === "revisar" ? aoEnviar(e) : (e.preventDefault(), void revisar()))} noValidate className="flex min-h-0 flex-1 flex-col">
            {pessoa ? <input type="hidden" name="id" value={pessoa.id} /> : null}
            <input type="hidden" name="nome" value={f.nome} />
            <input type="hidden" name="segundoNome" value={segundoNome} />
            <input type="hidden" name="sobrenomeUtilizado" value={sobrenome} />
            <input type="hidden" name="empresaId" value={f.empresaId} />
            <input type="hidden" name="cargo" value={f.cargo} />
            <input type="hidden" name="departamento" value={f.departamento} />
            {pessoa?.situacao !== "DESLIGADO" ? <input type="hidden" name="situacao" value={f.situacao} /> : null}
            <input type="hidden" name="grupoLicencaId" value={f.grupoId} />
            {!edicao && !grupo ? <input type="hidden" name="emailCorporativo" value={propostos.emailCorporativo} /> : null}
            <input type="hidden" name="aplicar" value={aplicados.join(",")} />

            <div ref={refCorpo} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5" data-testid="corpo-formulario-pessoa">
              {estado.erro && !estado.conflitos?.length ? (
                <div className="mb-4">
                  <AlertaFormulario tom="erro">{estado.erro}</AlertaFormulario>
                </div>
              ) : null}
              {errosLocais.geral || falhaVerificacao ? (
                <div className="mb-4">
                  <AlertaFormulario tom="erro">{errosLocais.geral ?? falhaVerificacao}</AlertaFormulario>
                </div>
              ) : null}

              {/* Preenchimento (fica montado na revisão) */}
              <div className={cn("flex flex-col gap-5", etapa !== "preencher" && "hidden")}>
                <Secao titulo="Identificação">
                  <Campo rotulo="Nome completo" obrigatorio erro={erro("nome")} className="sm:col-span-2 lg:col-span-8">
                    {(p) => (
                      <InputComIcone
                        {...p}
                        icone={UserRound}
                        value={f.nome}
                        onChange={(e) => mudar({ nome: e.target.value })}
                        autoComplete="off"
                        placeholder="Ex.: Maria Fernanda Oliveira"
                        autoFocus={!edicao}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Empresa" obrigatorio erro={erro("empresaId")} className="lg:col-span-4">
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        invalido={p["aria-invalid"]}
                        valor={f.empresaId}
                        aoMudar={(v) => mudar({ empresaId: v })}
                        opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                        placeholder="Selecione a empresa"
                        pesquisavel
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Situação" className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
                    {(p) =>
                      pessoa?.situacao === "DESLIGADO" ? (
                        <p id={p.id} className="flex h-10 items-center text-sm text-muted-foreground">
                          Desligado (o desligamento é um processo próprio)
                        </p>
                      ) : (
                        <SelecaoPersonalizada id={p.id} valor={f.situacao} aoMudar={(v) => mudar({ situacao: v as SituacaoPessoa })} opcoes={SITUACOES} />
                      )
                    }
                  </Campo>
                  <Campo rotulo="Cargo" erro={erro("cargo")} className="lg:col-span-4">
                    {(p) => <Input {...p} value={f.cargo} onChange={(e) => mudar({ cargo: e.target.value })} autoComplete="off" />}
                  </Campo>
                  <Campo rotulo="Departamento" erro={erro("departamento")} className="lg:col-span-4">
                    {(p) => <Input {...p} value={f.departamento} onChange={(e) => mudar({ departamento: e.target.value })} autoComplete="off" />}
                  </Campo>
                </Secao>

                <Secao titulo="Composição de nomes">
                  <Campo
                    rotulo="Segundo nome"
                    obrigatorio={!edicao}
                    erro={erro("segundoNome")}
                    ajuda={normalizarNome(f.nome) && segundoCalculado === null && !segundoManual ? SEGUNDO_NOME_INDETERMINADO : undefined}
                    etiqueta={
                      segundoAlterado ? (
                        <StatusBadge tom="atencao" className="text-[11px]">
                          Alterado
                        </StatusBadge>
                      ) : segundoNome ? (
                        <StatusBadge tom="info" className="text-[11px]">
                          Calculado
                        </StatusBadge>
                      ) : null
                    }
                    className="lg:col-span-6"
                  >
                    {(p) => (
                      <>
                        <div className="flex gap-1.5">
                          <Input {...p} value={segundoNome} onChange={(e) => editarSegundo(e.target.value)} autoComplete="off" spellCheck={false} />
                          {segundoAlterado && segundoCalculado ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Voltar ao segundo nome calculado (${segundoCalculado})`}
                              onClick={() => setSegundoManual(null)}
                            >
                              <RotateCcw aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                        {confirmarSegundo ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-atencao/30 bg-atencao-fundo px-2.5 py-1.5 text-[12.5px]" data-testid="confirmar-segundo-nome">
                            <span className="text-titulo">
                              O nome completo mudou. Usar <strong>{segundoCalculado}</strong>?
                            </span>
                            <span className="ml-auto flex gap-1">
                              <Button type="button" size="xs" variant="secondary" onClick={() => setSegundoManual(null)}>
                                Usar {segundoCalculado}
                              </Button>
                              <Button type="button" size="xs" variant="ghost" onClick={() => setSegundoManual((m) => m && { ...m, nomeBase: f.nome })}>
                                Manter {segundoManual!.valor}
                              </Button>
                            </span>
                          </div>
                        ) : null}
                      </>
                    )}
                  </Campo>
                  <Campo rotulo="Sobrenome utilizado" obrigatorio={!edicao} erro={erroSobrenome} className="lg:col-span-6">
                    {(p) => (
                      <div ref={refSobrenome}>
                        <SelecaoPersonalizada
                          id={p.id}
                          aria-describedby={p["aria-describedby"]}
                          invalido={p["aria-invalid"]}
                          valor={sobrenome}
                          aoMudar={(v) => mudar({ sobrenome: v })}
                          opcoes={opcoes.map((o) =>
                            sobrenomesEmUso.has(o.toLowerCase()) ? { valor: o, rotulo: o, detalhe: "Em uso", tomDetalhe: "erro" as const } : { valor: o, rotulo: o },
                          )}
                          placeholder={opcoes.length ? "Selecione o sobrenome" : "Preencha o nome completo"}
                          desabilitado={!opcoes.length}
                          pesquisavel
                        />
                      </div>
                    )}
                  </Campo>
                </Secao>

                <Secao
                  titulo="Acessos"
                  descricao={edicao ? "Os identificadores atuais só mudam se você aplicar a proposta. Nenhuma conta Microsoft é renomeada." : undefined}
                >
                  <Campo
                    rotulo="Grupo de licença"
                    erro={erro("grupoLicencaId")}
                    ajuda={grupo ? `Login: ${grupo.dominioLogin} · E-mail: ${grupo.dominioEmail}` : "Define os domínios. Não comprova licença atribuída."}
                    className="sm:col-span-2 lg:col-span-4"
                  >
                    {(p) => (
                      <SelecaoPersonalizada
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        valor={f.grupoId}
                        aoMudar={(v) => mudar({ grupoId: v })}
                        vazio="Sem grupo de licença"
                        opcoes={grupos.filter((g) => g.ativo || g.id === f.grupoId).map((g) => ({ valor: g.id, rotulo: g.nome }))}
                      />
                    )}
                  </Campo>
                  {camposIdentificador}
                  <CampoIdentificadorUi
                    campo="emailCorporativo"
                    ajuda={
                      grupo
                        ? (semSobrenome ?? `Servidor/PC em minúsculas, com ponto, + @${grupo.dominioEmail}. É o login do portal.`)
                        : edicao
                          ? "Sem grupo de licença: para mudar o e-mail, escolha um grupo."
                          : "Sem grupo de licença: informe o e-mail. É o login do portal."
                    }
                    modo={modo}
                    atual={atuais.emailCorporativo}
                    proposto={propostos.emailCorporativo}
                    disponibilidade={disponibilidade("emailCorporativo")}
                    digitavel={!edicao && !grupo}
                    aoDigitar={(v) => mudar({ emailInformado: v.trim().toLowerCase() })}
                    aplicado={aplicar.has("emailCorporativo")}
                    aoAplicar={(sim) => alternarAplicar("emailCorporativo", sim)}
                    erro={erro("emailCorporativo")}
                    className="sm:col-span-2 lg:col-span-6"
                  />

                  {edicao ? null : (
                    <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-6">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="senha-inicial" className="text-[13px] leading-5 font-semibold text-titulo">
                          Senha inicial
                        </label>
                        <StatusBadge tom="info" className="text-[11px]">
                          Calculado
                        </StatusBadge>
                      </div>
                      <CampoSenha
                        id="senha-inicial"
                        icone={KeyRound}
                        value={senhaInicial ?? ""}
                        readOnly
                        placeholder="—"
                        senhaDeOutraPessoa
                        aria-describedby="senha-inicial-ajuda"
                        aria-invalid={erro("senhaInicial") ? true : undefined}
                        className="cursor-default border-dashed bg-muted/50"
                      />
                      {erro("senhaInicial") ? (
                        <p className="text-[13px] leading-[18px] font-medium text-erro" role="alert">
                          {erro("senhaInicial")}
                        </p>
                      ) : null}
                      <p id="senha-inicial-ajuda" className="text-[12.5px] leading-[17px] text-muted-foreground">
                        {senhaInicial ? "Senha inicial de ativação." : faltaSenha}
                      </p>
                    </div>
                  )}
                  {!edicao && podeProvisionar ? (
                    <label className="flex items-start gap-3 rounded-lg border border-dashed border-input p-3 sm:col-span-2 lg:col-span-12">
                      <Checkbox name="criarContaMicrosoft" checked={criarM365} onCheckedChange={(v) => setCriarM365(v === true)} className="mt-0.5" />
                      <span>
                        <span className="font-medium text-titulo">Criar a conta Microsoft 365 com a mesma senha</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                          <FlaskConical className="size-3.5 text-faixa" aria-hidden />
                          Integração em modo de simulação: nenhuma conta real é criada.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {!edicao && !podeProvisionar ? (
                    <p className="text-[13px] text-muted-foreground sm:col-span-2 lg:col-span-12">
                      A criação da conta Microsoft 365 exige a permissão de provisionamento. O cadastro fica registrado e quem tem a
                      permissão executa o provisionamento depois.
                    </p>
                  ) : null}
                </Secao>
              </div>

              {etapa === "revisar" ? (
                <section aria-label="Revisão do cadastro" className="flex flex-col gap-4">
                  <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 sm:grid-cols-2">
                    {resumo.map(([rotulo, valor]) => (
                      <div key={rotulo} className="min-w-0">
                        <dt className="text-[12.5px] text-muted-foreground">{rotulo}</dt>
                        <dd className="font-semibold break-words text-titulo">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-sucesso" aria-hidden />
                      {edicao ? "Atualizar o cadastro (a senha e as contas externas não mudam)" : "Registrar a pessoa e criar a conta de acesso ao portal (pendente de ativação)"}
                    </li>
                    {!edicao ? (
                      <li className="flex items-center gap-2">
                        <KeyRound className="size-4 text-sucesso" aria-hidden /> Senha inicial de ativação (gravada só como hash; não vale como senha permanente)
                      </li>
                    ) : null}
                    {criarM365 ? (
                      <li className="flex items-center gap-2">
                        <FlaskConical className="size-4 text-faixa" aria-hidden /> Criar a conta Microsoft 365 (simulação)
                      </li>
                    ) : null}
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="size-4" aria-hidden /> Sem aprovação hierárquica: a confirmação e o registro na auditoria valem como controle.
                    </li>
                  </ul>
                  {mensagem ? <MensagemBoasVindas texto={mensagem} /> : null}
                </section>
              ) : null}

              {etapa === "concluido" ? (
                <section aria-label="Cadastro concluído" className="flex flex-col gap-4">
                  <div role="status" className="flex items-start gap-3 rounded-xl border border-sucesso/25 bg-sucesso-fundo p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sucesso" aria-hidden />
                    <div>
                      <p className="font-semibold text-titulo">Cadastro de {normalizarNome(f.nome)} concluído.</p>
                      <p className="text-[13px] text-muted-foreground">
                        A conta do portal aguarda ativação. Se precisar, copie a mensagem antes de concluir: depois de fechar, a senha não é mais exibida.
                      </p>
                    </div>
                  </div>
                  {mensagem ? <MensagemBoasVindas texto={mensagem} /> : null}
                </section>
              ) : null}
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0">
              {etapa === "concluido" ? (
                <Button type="button" onClick={() => aoMudar(false)}>
                  Concluir
                </Button>
              ) : etapa === "revisar" ? (
                <>
                  <Button type="button" variant="secondary" disabled={pendente} onClick={() => setEtapa("preencher")}>
                    Voltar e editar
                  </Button>
                  <BotaoPendente pendente={pendente} rotuloPendente="Salvando…" disabled={bloqueantes.length > 0}>
                    {edicao ? "Salvar alterações" : "Confirmar cadastro"}
                  </BotaoPendente>
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" disabled={pendente} onClick={solicitarFechar}>
                    Cancelar
                  </Button>
                  <Button type="submit" carregando={verificando} rotuloCarregando="Verificando…">
                    {edicao ? "Revisar alterações" : "Revisar cadastro"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent data-testid="confirmar-descarte-pessoa">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>Os dados preenchidos ainda não foram salvos e serão perdidos.</AlertDialogDescription>
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
