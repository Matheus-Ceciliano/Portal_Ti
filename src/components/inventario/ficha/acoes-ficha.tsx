"use client";

import { ArrowLeftRight, Building2, CheckCircle2, ChevronDown, Pencil, UserRound, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Campo } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { PODE_IR_PARA_MANUTENCAO, PODE_TRANSFERIR_COLABORADOR, type Situacao } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoLiberarAvaliacao } from "@/server/acoes/inventario";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { DialogoEquipamento, type EmpresaOpcaoInventario } from "../dialogo-equipamento";
import { DialogoConcluirManutencao, DialogoEnviarManutencao } from "../dialogos-manutencao";
import { identificacao } from "../visual";
import { DialogoTransferirColaborador, DialogoTransferirEmpresa } from "./dialogos-transferencia";
import { carregadorVinculado, paraTransferencia } from "./transferencia";

/** Por que a transferência de colaborador não está disponível agora (o servidor confere de novo). */
const BLOQUEIO_CURTO: Partial<Record<Situacao, string>> = {
  RESERVADO: "Reservado: use Alocações",
  MANUTENCAO: "Em manutenção",
  DEVOLVIDO_EM_AVALIACAO: "Em avaliação",
};

/** Ações da ficha (cada uma confere a permissão de novo no servidor). */
export function AcoesFicha({
  ficha,
  empresas,
  marcas,
  pode,
}: {
  ficha: FichaEquipamento;
  empresas: EmpresaOpcaoInventario[];
  marcas: string[];
  pode: { editar: boolean; transicionar: boolean; alocar: boolean; entregar: boolean };
}) {
  const [aberto, setAberto] = useState<"editar" | "manutencao" | "concluir" | "avaliacao" | "colaborador" | "empresa" | null>(null);
  const [chave, setChave] = useState(0);
  const rotulo = identificacao(ficha);
  const aberta = ficha.manutencoes.find((m) => m.aberta);
  const mudar = (qual: typeof aberto) => (v: boolean) => {
    setAberto(v ? qual : null);
    if (!v) setChave((c) => c + 1);
  };
  // Transferências: nunca de baixado nem de carregador vinculado (segue o notebook).
  const transferivel = ficha.situacao !== "BAIXADO" && !carregadorVinculado(ficha);
  const transferirColaborador = transferivel && pode.alocar;
  const transferirEmpresa = transferivel && pode.editar;
  const bloqueioColaborador = ficha.transferenciaPendente
    ? "Transferência reservada pendente"
    : PODE_TRANSFERIR_COLABORADOR.includes(ficha.situacao as Situacao)
      ? null
      : (BLOQUEIO_CURTO[ficha.situacao as Situacao] ?? "Indisponível");
  const equipamento = paraTransferencia(ficha);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pode.editar ? (
          <Button variant="secondary" onClick={() => setAberto("editar")}>
            <Pencil aria-hidden /> Editar
          </Button>
        ) : null}
        {transferirColaborador || transferirEmpresa ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" data-testid="transferir">
                <ArrowLeftRight aria-hidden /> Transferir <ChevronDown aria-hidden className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {transferirColaborador ? (
                <DropdownMenuItem disabled={Boolean(bloqueioColaborador)} onSelect={() => setAberto("colaborador")}>
                  <UserRound aria-hidden />
                  <span className="flex flex-col">
                    Transferir colaborador
                    {bloqueioColaborador ? <span className="text-[12px] font-normal text-muted-foreground">{bloqueioColaborador}</span> : null}
                  </span>
                </DropdownMenuItem>
              ) : null}
              {transferirEmpresa ? (
                <DropdownMenuItem onSelect={() => setAberto("empresa")}>
                  <Building2 aria-hidden /> Transferir empresa
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {pode.transicionar && ficha.situacao === "DEVOLVIDO_EM_AVALIACAO" && !ficha.desvinculadoEm ? (
          <Button variant="secondary" onClick={() => setAberto("avaliacao")}>
            <CheckCircle2 aria-hidden /> Concluir avaliação
          </Button>
        ) : null}
        {pode.transicionar && aberta ? (
          <Button onClick={() => setAberto("concluir")}>
            <CheckCircle2 aria-hidden /> Concluir manutenção
          </Button>
        ) : null}
        {pode.transicionar && PODE_IR_PARA_MANUTENCAO.includes(ficha.situacao as Situacao) ? (
          <Button variant={aberta ? "secondary" : "default"} onClick={() => setAberto("manutencao")} data-testid="enviar-manutencao">
            <Wrench aria-hidden /> Enviar para manutenção
          </Button>
        ) : null}
      </div>

      {pode.editar ? (
        <DialogoEquipamento key={`e${chave}`} aberto={aberto === "editar"} aoMudar={mudar("editar")} equipamento={ficha} empresas={empresas} marcas={marcas} />
      ) : null}
      <DialogoEnviarManutencao
        key={`m${chave}`}
        aberto={aberto === "manutencao"}
        aoMudar={mudar("manutencao")}
        equipamento={{ id: ficha.id, rotulo, responsavel: ficha.responsavel ? { nome: ficha.responsavel.nome, alocacao: ficha.responsavel.alocacao } : null }}
      />
      {aberta ? (
        <DialogoConcluirManutencao
          key={`c${chave}`}
          aberto={aberto === "concluir"}
          aoMudar={mudar("concluir")}
          manutencao={{ id: aberta.id, ativoId: ficha.id, rotulo, motivo: aberta.motivo, abertaEm: aberta.abertaEm }}
        />
      ) : null}
      <DialogoAvaliacao key={`a${chave}`} aberto={aberto === "avaliacao"} aoMudar={mudar("avaliacao")} ativoId={ficha.id} rotulo={rotulo} />
      {transferirColaborador && !bloqueioColaborador ? (
        <DialogoTransferirColaborador key={`t${chave}`} aberto={aberto === "colaborador"} aoMudar={mudar("colaborador")} equipamento={equipamento} podeEntregar={pode.entregar} />
      ) : null}
      {transferirEmpresa ? (
        <DialogoTransferirEmpresa key={`p${chave}`} aberto={aberto === "empresa"} aoMudar={mudar("empresa")} equipamento={equipamento} empresas={empresas} />
      ) : null}
    </>
  );
}

/** Equipamento devolvido em avaliação: registra o resultado e volta a ficar disponível. */
function DialogoAvaliacao({ aberto, aoMudar, ativoId, rotulo }: { aberto: boolean; aoMudar: (v: boolean) => void; ativoId: string; rotulo: string }) {
  const router = useRouter();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!observacao.trim()) {
      setErro("Registre o resultado da avaliação.");
      return;
    }
    setEnviando(true);
    const r = await acaoLiberarAvaliacao(ativoId, observacao).catch(() => ({ ok: false as const, erro: "Não foi possível falar com o servidor. Tente novamente." }));
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success(r.mensagem);
    router.refresh();
    aoMudar(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent className={cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]")}>
        <DialogHeader>
          <DialogTitle>Concluir avaliação</DialogTitle>
          <DialogDescription>{rotulo} volta a ficar disponível para novas alocações.</DialogDescription>
        </DialogHeader>
        <Campo rotulo="Resultado da avaliação" obrigatorio erro={erro ?? undefined}>
          {(p) => <Textarea {...p} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: testado, sem avarias" />}
        </Campo>
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button carregando={enviando} rotuloCarregando="Salvando…" onClick={() => void confirmar()}>
            Liberar equipamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
