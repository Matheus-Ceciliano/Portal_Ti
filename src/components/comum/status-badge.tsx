import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Hand,
  Info,
  Link2,
  Loader,
  Lock,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sistema de estados (DESIGN_SYSTEM.md §11): sempre ícone + texto, nunca só cor.
 * É o elemento visual mais cuidado do produto; o resto da interface fica sóbrio.
 */
export type Tom = "sucesso" | "atencao" | "erro" | "info" | "manual" | "neutro";

const ESTILO: Record<Tom, string> = {
  sucesso: "bg-sucesso-fundo text-sucesso border-sucesso/25",
  atencao: "bg-atencao-fundo text-atencao border-atencao/25",
  erro: "bg-erro-fundo text-erro border-erro/25",
  info: "bg-info-fundo text-info border-info/25",
  manual: "bg-manual-fundo text-manual border-manual/25",
  neutro: "bg-neutro-fundo text-neutro border-neutro/20",
};

export function StatusBadge({
  tom,
  icone: Icone,
  children,
  className,
}: {
  tom: Tom;
  icone?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium whitespace-nowrap",
        ESTILO[tom],
        className,
      )}
    >
      {Icone ? <Icone className="size-3.5" aria-hidden strokeWidth={2.25} /> : null}
      {children}
    </span>
  );
}

type Definicao = { tom: Tom; icone: LucideIcon; rotulo: string };

export const ESTADOS = {
  ativo: {
    DISPONIVEL: { tom: "info", icone: CircleDashed, rotulo: "Disponível" },
    RESERVADO: { tom: "atencao", icone: Clock, rotulo: "Reservado" },
    ALOCADO: { tom: "sucesso", icone: CheckCircle2, rotulo: "Alocado" },
    MANUTENCAO: { tom: "manual", icone: Hand, rotulo: "Em manutenção" },
    INSTALADO: { tom: "info", icone: Link2, rotulo: "Instalado" },
    DEVOLVIDO_EM_AVALIACAO: { tom: "atencao", icone: Info, rotulo: "Devolvido em avaliação" },
    BAIXADO: { tom: "neutro", icone: Ban, rotulo: "Baixado" },
  },
  alocacao: {
    RESERVADA: { tom: "atencao", icone: Clock, rotulo: "Reserva" },
    ATIVA: { tom: "sucesso", icone: CheckCircle2, rotulo: "Alocada" },
    ENCERRADA: { tom: "neutro", icone: CircleDashed, rotulo: "Encerrada" },
    CANCELADA: { tom: "neutro", icone: XCircle, rotulo: "Cancelada" },
  },
  chamado: {
    ABERTO: { tom: "atencao", icone: CircleDashed, rotulo: "Aberto" },
    EM_ATENDIMENTO: { tom: "info", icone: Loader, rotulo: "Em atendimento" },
    AGUARDANDO_USUARIO: { tom: "manual", icone: Hand, rotulo: "Aguardando usuário" },
    RESOLVIDO: { tom: "sucesso", icone: CheckCircle2, rotulo: "Resolvido" },
  },
  prioridade: {
    CRITICA: { tom: "erro", icone: AlertTriangle, rotulo: "Crítica" },
    ALTA: { tom: "atencao", icone: AlertTriangle, rotulo: "Alta" },
    MEDIA: { tom: "neutro", icone: Info, rotulo: "Média" },
    BAIXA: { tom: "neutro", icone: Info, rotulo: "Baixa" },
  },
  termo: {
    RASCUNHO: { tom: "neutro", icone: CircleDashed, rotulo: "Rascunho" },
    EMITIDO: { tom: "info", icone: Info, rotulo: "Emitido" },
    AGUARDANDO_ASSINATURA: { tom: "atencao", icone: Clock, rotulo: "Aguardando assinatura" },
    ASSINADO: { tom: "sucesso", icone: CheckCircle2, rotulo: "Assinado" },
    CANCELADO: { tom: "neutro", icone: XCircle, rotulo: "Cancelado" },
  },
  conta: {
    ATIVA: { tom: "sucesso", icone: CheckCircle2, rotulo: "Ativa" },
    BLOQUEADA: { tom: "erro", icone: Lock, rotulo: "Bloqueada" },
    DESATIVADA: { tom: "neutro", icone: Ban, rotulo: "Desativada" },
    PENDENTE: { tom: "atencao", icone: Clock, rotulo: "Ativação pendente" },
    SEM_CONTA: { tom: "neutro", icone: CircleDashed, rotulo: "Sem conta" },
  },
  colaborador: {
    ATIVO: { tom: "sucesso", icone: CheckCircle2, rotulo: "Ativo" },
    PRE_CADASTRO: { tom: "atencao", icone: Clock, rotulo: "Pré-cadastro" },
    AFASTADO: { tom: "manual", icone: Hand, rotulo: "Afastado" },
    DESLIGADO: { tom: "neutro", icone: Ban, rotulo: "Desligado" },
  },
  auditoria: {
    SUCESSO: { tom: "sucesso", icone: CheckCircle2, rotulo: "Sucesso" },
    NEGADO: { tom: "erro", icone: Ban, rotulo: "Negado" },
    FALHA: { tom: "atencao", icone: AlertTriangle, rotulo: "Falha" },
  },
  saude: {
    OPERACIONAL: { tom: "sucesso", icone: CheckCircle2, rotulo: "Operacional (simulado)" },
    DEGRADADO: { tom: "atencao", icone: AlertTriangle, rotulo: "Degradado (simulado)" },
    INDISPONIVEL: { tom: "erro", icone: XCircle, rotulo: "Indisponível (simulado)" },
  },
} satisfies Record<string, Record<string, Definicao>>;

export function Estado<G extends keyof typeof ESTADOS>({
  grupo,
  valor,
}: {
  grupo: G;
  valor: keyof (typeof ESTADOS)[G];
}) {
  const d = ESTADOS[grupo][valor] as Definicao;
  return (
    <StatusBadge tom={d.tom} icone={d.icone}>
      {d.rotulo}
    </StatusBadge>
  );
}
