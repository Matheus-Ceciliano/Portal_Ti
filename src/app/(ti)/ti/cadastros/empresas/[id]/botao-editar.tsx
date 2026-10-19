"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { DialogoFormularioEmpresa, type EmpresaEditavel } from "@/components/empresas/dialogo-formulario-empresa";
import { Button } from "@/components/ui/button";

/** Reutiliza o diálogo de edição da lista de Empresas (sem duplicar o formulário). */
export function BotaoEditarEmpresa({ empresa, armazenamentoDisponivel }: { empresa: EmpresaEditavel; armazenamentoDisponivel: boolean }) {
  const [estado, setEstado] = useState({ aberto: false, chave: 0 });
  return (
    <>
      <Button variant="secondary" onClick={() => setEstado((e) => ({ aberto: true, chave: e.chave + 1 }))}>
        <Pencil aria-hidden /> Editar
      </Button>
      <DialogoFormularioEmpresa
        key={estado.chave}
        aberto={estado.aberto}
        aoMudar={(aberto) => setEstado((e) => ({ ...e, aberto }))}
        empresa={empresa}
        armazenamentoDisponivel={armazenamentoDisponivel}
      />
    </>
  );
}
