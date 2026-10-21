"use client";

import { ArrowLeftRight, Building2, CheckCircle2, ChevronDown, ClipboardCheck, Handshake, Pencil, Undo2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Campo } from "@/components/comum/campos";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { DialogoAvaliacaoTecnica } from "@/components/inspecoes/dialogos-inspecao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ehComponente } from "@/lib/componentes";
import { ROTULO_RESULTADO } from "@/lib/inspecao";
import { PODE_IR_PARA_MANUTENCAO, type Situacao } from "@/lib/inventario";
import { cn } from "@/lib/utils";
import { acaoLiberarAvaliacao } from "@/server/acoes/inventario";
import type { FichaEquipamento } from "@/server/modulos/inventario";
import { DialogoEquipamento, type CatalogoCadastro, type EmpresaOpcaoInventario } from "../dialogo-equipamento";
import { DialogoConcluirManutencao, DialogoEnviarManutencao } from "../dialogos-manutencao";
import { identificacao } from "../visual";
import { DialogoAlugarEquipamento, DialogoEncerrarAluguel } from "./dialogos-aluguel";
import { DialogoTransferirEmpresa } from "./dialogos-transferencia";
import { carregadorVinculado, paraTransferencia } from "./transferencia";

/** Ações da ficha (cada uma confere a permissão de novo no servidor). */
export function AcoesFicha({
  ficha,
  empresas,
  catalogo,
  pode,
}: {
  ficha: FichaEquipamento;
  empresas: EmpresaOpcaoInventario[];
  catalogo: CatalogoCadastro;
  pode: { editar: boolean; transicionar: boolean };
}) {
  const [aberto, setAberto] = useState<"editar" | "manutencao" | "concluir" | "inspecao" | "avaliacao" | "empresa" | "alugar" | "encerrar" | null>(null);
  const [chave, setChave] = useState(0);
  const rotulo = identificacao(ficha);
  const aberta = ficha.manutencoes.find((m) => m.aberta);
  const mudar = (qual: typeof aberto) => (v: boolean) => {
    setAberto(v ? qual : null);
    if (!v) setChave((c) => c + 1);
  };
  // Entre empresas: nunca de baixado nem de carregador vinculado (segue o notebook). A
  // transferência entre colaboradores fica em Alocações, no detalhe da alocação ativa.
  const transferivel = ficha.situacao !== "BAIXADO" && !carregadorVinculado(ficha);
  const transferirEmpresa = transferivel && pode.editar;
  // Aluguel entre empresas: do próprio equipamento (o carregador vinculado acompanha o do notebook).
  const aluguelProprio = ficha.aluguel && !ficha.aluguel.herdado ? ficha.aluguel : null;
  const alugar = transferivel && pode.editar && !ehComponente(ficha.categoria) && !ficha.aluguel;
  const encerrarAluguel = pode.editar && Boolean(aluguelProprio);
  const equipamento = paraTransferencia(ficha);
  // Em avaliação: a inspeção técnica vem antes; liberar só depois dela e sem defeito bloqueante.
  const emAvaliacao = ficha.situacao === "DEVOLVIDO_EM_AVALIACAO";
  const pendente = ficha.inspecoes.some((i) => i.estado === "PENDENTE");
  const inspecaoDaAvaliacao = ficha.inspecoes.find((i) => i.estado === "CONCLUIDA" && i.concluidaEm! >= ficha.situacaoDesde) ?? null;
  const liberavel = emAvaliacao && !ficha.desvinculadoEm && !pendente && inspecaoDaAvaliacao !== null && inspecaoDaAvaliacao.resultado !== "INAPTO";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pode.editar ? (
          <Button variant="secondary" onClick={() => setAberto("editar")}>
            <Pencil aria-hidden /> Editar
          </Button>
        ) : null}
        {transferirEmpresa || alugar || encerrarAluguel ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" data-testid="transferir">
                <ArrowLeftRight aria-hidden /> Transferir <ChevronDown aria-hidden className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {transferirEmpresa ? (
                <DropdownMenuItem disabled={Boolean(aluguelProprio)} onSelect={() => setAberto("empresa")}>
                  <Building2 aria-hidden />
                  <span className="flex flex-col">
                    Transferir empresa
                    {aluguelProprio ? <span className="text-[12px] font-normal text-muted-foreground">Alugado: encerre o aluguel antes</span> : null}
                  </span>
                </DropdownMenuItem>
              ) : null}
              {alugar ? (
                <DropdownMenuItem onSelect={() => setAberto("alugar")} data-testid="alugar-empresa">
                  <Handshake aria-hidden /> Alugar para outra empresa
                </DropdownMenuItem>
              ) : null}
              {encerrarAluguel ? (
                <DropdownMenuItem onSelect={() => setAberto("encerrar")} data-testid="encerrar-aluguel">
                  <Undo2 aria-hidden /> Encerrar aluguel
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {pode.transicionar && emAvaliacao ? (
          <Button variant={liberavel ? "secondary" : "default"} onClick={() => setAberto("inspecao")} data-testid="avaliar-equipamento">
            <ClipboardCheck aria-hidden /> {pendente ? "Realizar inspeção" : "Nova inspeção"}
          </Button>
        ) : null}
        {pode.transicionar && liberavel ? (
          <Button onClick={() => setAberto("avaliacao")} data-testid="liberar-equipamento">
            <CheckCircle2 aria-hidden /> Liberar para uso
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
        <DialogoEquipamento key={`e${chave}`} aberto={aberto === "editar"} aoMudar={mudar("editar")} equipamento={ficha} empresas={empresas} catalogo={catalogo} />
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
      {pode.transicionar && emAvaliacao ? (
        <DialogoAvaliacaoTecnica
          key={`i${chave}`}
          aberto={aberto === "inspecao"}
          aoMudar={mudar("inspecao")}
          equipamento={{ id: ficha.id, rotulo }}
        />
      ) : null}
      {liberavel && inspecaoDaAvaliacao ? (
        <DialogoAvaliacao
          key={`a${chave}`}
          aberto={aberto === "avaliacao"}
          aoMudar={mudar("avaliacao")}
          ativoId={ficha.id}
          rotulo={rotulo}
          inspecao={`${inspecaoDaAvaliacao.numero} (${ROTULO_RESULTADO[inspecaoDaAvaliacao.resultado!].toLowerCase()})`}
        />
      ) : null}
      {transferirEmpresa && !aluguelProprio ? (
        <DialogoTransferirEmpresa key={`p${chave}`} aberto={aberto === "empresa"} aoMudar={mudar("empresa")} equipamento={equipamento} empresas={empresas} />
      ) : null}
      {alugar ? <DialogoAlugarEquipamento key={`l${chave}`} aberto={aberto === "alugar"} aoMudar={mudar("alugar")} equipamento={equipamento} empresas={empresas} /> : null}
      {encerrarAluguel && aluguelProprio ? (
        <DialogoEncerrarAluguel key={`x${chave}`} aberto={aberto === "encerrar"} aoMudar={mudar("encerrar")} equipamento={equipamento} aluguel={aluguelProprio} />
      ) : null}
    </>
  );
}

/** Equipamento em avaliação já inspecionado (e mantido em avaliação): a liberação para uso. */
function DialogoAvaliacao({ aberto, aoMudar, ativoId, rotulo, inspecao }: { aberto: boolean; aoMudar: (v: boolean) => void; ativoId: string; rotulo: string; inspecao: string }) {
  const router = useRouter();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!observacao.trim()) {
      setErro("Registre a observação da liberação.");
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
          <DialogTitle>Liberar para uso</DialogTitle>
          <DialogDescription>
            {rotulo} volta a ficar disponível para novas alocações, com base na inspeção {inspecao}.
          </DialogDescription>
        </DialogHeader>
        <Campo rotulo="Observação da liberação" obrigatorio erro={erro ?? undefined}>
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
