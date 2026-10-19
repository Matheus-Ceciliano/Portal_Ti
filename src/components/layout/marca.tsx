import { IconeVallur } from "./icone-vallur";

/** Marca do portal: ícone oficial do Grupo Vallur + nome do produto. */
export function MarcaPortal({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <IconeVallur className={claro ? "h-8 w-auto shrink-0 text-white" : "h-8 w-auto shrink-0 text-marca dark:text-white"} />
      <span className={claro ? "leading-tight text-white" : "leading-tight text-titulo"}>
        <span className="block text-[13px] font-medium opacity-80">Grupo Vallur</span>
        <span className="block text-lg font-semibold">Portal TI</span>
      </span>
    </div>
  );
}
