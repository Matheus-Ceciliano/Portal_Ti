import { FlaskConical } from "lucide-react";
import { ROTULO_AMBIENTE, obterConfiguracao } from "@/server/config";

/** Faixa fixa fora de produção (DESIGN_SYSTEM.md §7.3). Texto explícito, nunca só cor. */
export function FaixaAmbiente() {
  const { AMBIENTE } = obterConfiguracao();
  if (AMBIENTE === "PRODUCAO") return null;
  return (
    <div
      role="note"
      data-testid="faixa-ambiente"
      className="flex min-h-8 items-center justify-center gap-2 border-b border-faixa/20 bg-faixa-fundo px-4 py-1 text-center text-[13px] leading-[18px] font-medium text-faixa"
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        {ROTULO_AMBIENTE[AMBIENTE]}: dados fictícios e integrações Microsoft simuladas. Nenhuma operação real é executada.
      </span>
    </div>
  );
}
