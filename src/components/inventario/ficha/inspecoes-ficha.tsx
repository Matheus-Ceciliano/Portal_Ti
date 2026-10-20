"use client";

import { ClipboardCheck, Hourglass } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/comum/status-badge";
import { ResultadoInspecaoBadge } from "@/components/inspecoes/checklist";
import { DialogoAvaliacaoTecnica, DialogoDetalhesInspecao, exibirResumo, type InspecaoExibida } from "@/components/inspecoes/dialogos-inspecao";
import { Button } from "@/components/ui/button";
import { ROTULO_TIPO_INSPECAO, type TipoInspecao } from "@/lib/inspecao";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { formatarDataHora, identificacao } from "../visual";

/**
 * Inspeções técnicas do equipamento, da mais recente para a mais antiga. A pendente (aberta na
 * entrada em avaliação) aparece primeiro, com a ação de inspecionar; as concluídas só se consultam.
 */
export function InspecoesFicha({ ficha, podeInspecionar }: { ficha: FichaEquipamento; podeInspecionar: boolean }) {
  const [consulta, setConsulta] = useState<InspecaoExibida | null>(null);
  const [inspecionar, setInspecionar] = useState(false);
  const [chave, setChave] = useState(0);
  const emAvaliacao = ficha.situacao === "DEVOLVIDO_EM_AVALIACAO";
  const ordenadas = [...ficha.inspecoes].sort((a, b) => Number(b.estado === "PENDENTE") - Number(a.estado === "PENDENTE"));

  return (
    <>
      {ordenadas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhuma inspeção registrada. A próxima entrega pede a inspeção do equipamento.</p>
      ) : (
        <ul className="flex flex-col divide-y" data-testid="inspecoes-ficha">
          {ordenadas.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              {i.estado === "PENDENTE" ? (
                <div className="flex min-w-0 items-start gap-2.5">
                  <Hourglass className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-titulo">Inspeção pendente</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      Desde {formatarDataHora(i.abertaEm)}
                      {i.motivoAbertura ? ` · ${i.motivoAbertura}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="text-[13.5px] text-titulo">
                    <span className="tabular font-semibold">{i.numero ?? "Inspeção"}</span>
                    <span className="text-muted-foreground"> · {ROTULO_TIPO_INSPECAO[i.tipo as TipoInspecao]}</span>
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {i.estado === "CANCELADA"
                      ? `Cancelada em ${formatarDataHora(i.canceladaEm!)} · ${i.motivoCancelamento}`
                      : `${formatarDataHora(i.concluidaEm!)} · ${i.responsavel}`}
                  </p>
                </div>
              )}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {i.estado === "PENDENTE" ? (
                  podeInspecionar && emAvaliacao ? (
                    <Button size="sm" onClick={() => setInspecionar(true)} data-testid="realizar-inspecao">
                      <ClipboardCheck aria-hidden /> Realizar inspeção
                    </Button>
                  ) : (
                    <StatusBadge tom="atencao">Pendente</StatusBadge>
                  )
                ) : i.estado === "CANCELADA" ? (
                  <StatusBadge tom="neutro">Cancelada</StatusBadge>
                ) : (
                  <>
                    {i.resultado ? <ResultadoInspecaoBadge resultado={i.resultado} /> : null}
                    <Button size="sm" variant="ghost" onClick={() => setConsulta(exibirResumo(i))} aria-label={`Ver respostas da inspeção ${i.numero}`}>
                      Ver respostas
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <DialogoDetalhesInspecao dados={consulta} aberto={Boolean(consulta)} aoMudar={(v) => !v && setConsulta(null)} />
      {podeInspecionar && emAvaliacao ? (
        <DialogoAvaliacaoTecnica
          key={chave}
          aberto={inspecionar}
          aoMudar={(v) => {
            setInspecionar(v);
            if (!v) setChave((c) => c + 1);
          }}
          equipamento={{ id: ficha.id, rotulo: identificacao(ficha) }}
        />
      ) : null}
    </>
  );
}
