import {
  FileCheck2,
  FileClock,
  FileQuestion,
  FileText,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  Mouse,
  HardDrive,
  MemoryStick,
  Package,
  PcCase,
  PlugZap,
  Printer,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge, type Tom } from "@/components/comum/status-badge";
import type { Categoria } from "@/lib/inventario";
import { cn } from "@/lib/utils";

/** Peças visuais do inventário, compartilhadas por lista, ficha, alocações e empresas. */

export const ICONE_CATEGORIA: Record<Categoria, LucideIcon> = {
  NOTEBOOK: Laptop,
  DESKTOP: PcCase,
  MONITOR: Monitor,
  CELULAR: Smartphone,
  IMPRESSORA: Printer,
  CARREGADOR: PlugZap,
  TECLADO: Keyboard,
  MOUSE: Mouse,
  KIT_TECLADO_MOUSE: Keyboard,
  HEADSET: Headphones,
  OUTRO: Package,
  MEMORIA_RAM: MemoryStick,
  SSD: HardDrive,
  HD: HardDrive,
};

const TAMANHOS = { sm: "size-9 rounded-lg", md: "size-11 rounded-lg", lg: "size-14 rounded-xl" } as const;
const ICONES = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

/** Miniatura da foto principal; sem foto, o ícone da categoria (nada de imagem genérica). */
export function MiniaturaEquipamento({
  url,
  categoria,
  tamanho = "sm",
  className,
}: {
  url: string | null;
  categoria: Categoria;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const Icone = ICONE_CATEGORIA[categoria];
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão; next/image não repassa os cookies
    <img src={url} alt="" loading="lazy" decoding="async" className={cn("shrink-0 border bg-muted object-cover", TAMANHOS[tamanho], className)} />
  ) : (
    <span className={cn("grid shrink-0 place-items-center border bg-muted/60 text-muted-foreground", TAMANHOS[tamanho], className)} aria-hidden>
      <Icone className={ICONES[tamanho]} />
    </span>
  );
}

type EstadoTer = "RASCUNHO" | "EMITIDO" | "AGUARDANDO_ASSINATURA" | "ASSINADO" | "CANCELADO";

const TER: Record<EstadoTer, { tom: Tom; icone: LucideIcon; rotulo: string }> = {
  RASCUNHO: { tom: "neutro", icone: FileText, rotulo: "TER em rascunho" },
  EMITIDO: { tom: "info", icone: FileText, rotulo: "TER emitido" },
  AGUARDANDO_ASSINATURA: { tom: "atencao", icone: FileClock, rotulo: "TER aguardando" },
  ASSINADO: { tom: "sucesso", icone: FileCheck2, rotulo: "TER assinado" },
  CANCELADO: { tom: "neutro", icone: FileQuestion, rotulo: "TER cancelado" },
};

/** Situação do TER, sempre separada da entrega física (Q-27). */
export function BadgeTer({ estado, className }: { estado: EstadoTer | null; className?: string }) {
  if (!estado) {
    return (
      <StatusBadge tom="neutro" icone={FileQuestion} className={className}>
        Sem TER
      </StatusBadge>
    );
  }
  const d = TER[estado];
  return (
    <StatusBadge tom={d.tom} icone={d.icone} className={className}>
      {d.rotulo}
    </StatusBadge>
  );
}

/** Identificação principal do equipamento: nome do dispositivo ou patrimônio. */
export const identificacao = (e: { nome?: string | null; patrimonio?: string | null; modelo?: string }) => e.nome ?? e.patrimonio ?? e.modelo ?? "Equipamento";

export function formatarDataHora(valor: string | Date) {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** "AAAA-MM-DDTHH:MM" no horário de Brasília, para campos datetime-local. */
export function agoraLocal(data = new Date()) {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data);
  return partes.replace(" ", "T");
}

/** Valor de datetime-local (horário de Brasília) → ISO com fuso explícito. */
export const localParaIso = (valor: string) => (valor ? `${valor}:00-03:00` : "");
