/** Marca provisória em texto: logotipo oficial pendente (PM §18, Q-22). */
export function MarcaPortal({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={
          claro
            ? "grid size-9 place-items-center rounded-md bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground"
            : "grid size-9 place-items-center rounded-md bg-sidebar text-lg font-bold text-white"
        }
      >
        V
      </span>
      <span className={claro ? "leading-tight text-white" : "leading-tight text-titulo"}>
        <span className="block text-[13px] font-medium opacity-80">Grupo Vallur</span>
        <span className="block text-lg font-semibold">Portal TI</span>
      </span>
    </div>
  );
}
