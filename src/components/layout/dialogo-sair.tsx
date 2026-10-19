"use client";

import { LogOut } from "lucide-react";
import { useState, useTransition } from "react";
import { AlertaFormulario } from "@/components/comum/campos";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { encerrarSessao } from "@/server/acoes/autenticacao";

/**
 * Confirmação antes de encerrar a sessão. Cancelar fecha sem mudar nada e devolve o foco
 * a `retornarFoco`; confirmar chama a saída segura do servidor e navega com recarga completa.
 */
export function DialogoSair({
  aberto,
  aoMudar,
  retornarFoco,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  retornarFoco?: React.RefObject<HTMLElement | null>;
}) {
  const [pendente, iniciar] = useTransition();
  const [falhou, setFalhou] = useState(false);

  function confirmar() {
    if (pendente) return;
    setFalhou(false);
    iniciar(async () => {
      const { ok } = await encerrarSessao();
      // Recarga completa de propósito: limpa o cache do roteador do cliente (ARQUITETURA_TECNICA.md §6.1).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (ok) window.location.assign("/entrar?motivo=encerrada");
      else setFalhou(true);
    });
  }

  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(v) => {
        if (pendente) return; // não fecha no meio da saída
        setFalhou(false);
        aoMudar(v);
      }}
    >
      <AlertDialogContent
        size="sm"
        data-testid="dialogo-sair"
        onEscapeKeyDown={(e) => pendente && e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (retornarFoco?.current) {
            e.preventDefault();
            retornarFoco.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-erro-fundo text-erro">
            <LogOut aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
          <AlertDialogDescription>Tem certeza de que deseja encerrar sua sessão?</AlertDialogDescription>
        </AlertDialogHeader>
        {falhou ? (
          <AlertaFormulario tom="erro">Não foi possível encerrar a sessão. Tente novamente.</AlertaFormulario>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={confirmar}
            carregando={pendente}
            rotuloCarregando="Saindo…"
            data-testid="confirmar-sair"
          >
            Sair da conta
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
