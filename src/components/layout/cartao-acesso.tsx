/** Superfície das telas de acesso (entrar, segundo fator, ativação). */
export function CartaoAcesso({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <>
      <section
        aria-labelledby="titulo-acesso"
        className="rounded-2xl border bg-card p-6 shadow-nivel-1 sm:p-8 dark:border-white/10"
      >
        <h1 id="titulo-acesso" className="text-2xl leading-8 font-bold tracking-[-0.02em]">
          {titulo}
        </h1>
        {descricao ? <div className="mt-1.5 text-[15px] leading-6 text-muted-foreground">{descricao}</div> : null}
        <div className="mt-6">{children}</div>
      </section>
      {rodape ? <div className="mt-5 px-1 text-[13px] leading-5 text-muted-foreground">{rodape}</div> : null}
    </>
  );
}
