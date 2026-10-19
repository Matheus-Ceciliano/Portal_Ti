import { Paperclip } from "lucide-react";

/**
 * O portal ainda não tem modelo nem armazenamento de anexos de empresa: nenhum arquivo é
 * listado, pesquisável ou baixável. Estado honesto, sem anexos simulados.
 */
export function AnexosIndisponiveis() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
        <Paperclip className="size-5" />
      </span>
      <p className="font-semibold text-titulo">Anexos ainda não disponíveis</p>
      <p className="mt-1 max-w-[56ch] text-muted-foreground">
        O envio de documentos da empresa (contrato social, cartão CNPJ, alvarás) depende do módulo de documentos, com
        armazenamento privado e controle de acesso, previsto para uma próxima etapa. Nenhum anexo foi registrado.
      </p>
      <p className="mt-3 text-[13px] text-muted-foreground">
        Quando o módulo existir, esta aba terá pesquisa por nome, filtro por tipo e download conforme a permissão.
      </p>
    </div>
  );
}
