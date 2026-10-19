import { Ban, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/comum/status-badge";

export function SituacaoEmpresa({ ativa }: { ativa: boolean }) {
  return ativa ? (
    <StatusBadge tom="sucesso" icone={CheckCircle2}>Ativa</StatusBadge>
  ) : (
    <StatusBadge tom="neutro" icone={Ban}>Inativa</StatusBadge>
  );
}
