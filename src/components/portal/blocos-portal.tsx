import { BookOpenText, FileText, Headset, Laptop, Monitor, MousePointer2, Smartphone, Headphones, type LucideIcon } from "lucide-react";
import { EstadoVazio, formatarData, formatarDataHora } from "@/components/comum/pagina";
import { Estado } from "@/components/comum/status-badge";
import type { AtivoFicticio, ChamadoFicticio, TermoFicticio, TutorialFicticio } from "@/server/dados-ficticios/operacao";

const ICONE_TIPO: Record<AtivoFicticio["tipo"], LucideIcon> = {
  Notebook: Laptop,
  Desktop: Monitor,
  Monitor: Monitor,
  Celular: Smartphone,
  Headset: Headphones,
  "Kit teclado e mouse": MousePointer2,
};

export function ListaEquipamentos({ itens }: { itens: AtivoFicticio[] }) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={Laptop}
        titulo="Nenhum equipamento sob sua responsabilidade"
        descricao="Quando a TI entregar um equipamento para você, ele aparece aqui com o termo de entrega."
      />
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((a) => {
        const Icone = ICONE_TIPO[a.tipo];
        return (
          <li key={a.id} className="flex gap-3 rounded-lg border bg-card p-4 shadow-nivel-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground" aria-hidden>
              <Icone className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-titulo">{a.modelo}</p>
              <p className="tabular text-sm text-muted-foreground">
                {a.tipo} · patrimônio {a.patrimonio}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Estado grupo="ativo" valor={a.situacao} />
                <span className="text-[13px] text-muted-foreground">desde {formatarData(a.desde)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ListaChamados({ itens }: { itens: (ChamadoFicticio & { responsavel: string | null })[] }) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={Headset}
        titulo="Você não tem chamados"
        descricao="Precisa de ajuda com equipamento, acesso ou e-mail? A abertura de chamados pelo portal chega com o módulo de suporte; por enquanto, fale com a TI."
      />
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-nivel-1">
      {itens.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="font-medium text-titulo">{c.titulo}</p>
            <p className="tabular text-[13px] text-muted-foreground">
              {c.numero} · aberto em {formatarDataHora(c.abertoEm)}
              {c.responsavel ? ` · com ${c.responsavel}` : ""}
            </p>
          </div>
          <span className="self-start sm:self-center">
            <Estado grupo="chamado" valor={c.estado} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ListaDocumentos({ itens }: { itens: TermoFicticio[] }) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={FileText}
        titulo="Nenhum documento disponível"
        descricao="Os termos de entrega e devolução assinados aparecem aqui quando a TI os disponibiliza."
      />
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-nivel-1">
      {itens.map((t) => (
        <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-titulo">
                {t.tipo === "TER" ? "Termo de entrega" : "Termo de devolução"} {t.numero}
              </p>
              <p className="tabular text-[13px] text-muted-foreground">
                Emitido em {formatarData(t.emitidoEm)} · {t.ativos.join(", ")}
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center">
            <Estado grupo="termo" valor={t.estado} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ListaTutoriais({ itens }: { itens: TutorialFicticio[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((t) => (
        <li key={t.id} className="flex flex-col gap-1 rounded-lg border bg-card p-4 shadow-nivel-1">
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <BookOpenText className="size-4" aria-hidden /> {t.categoria}
          </span>
          <p className="font-semibold text-titulo">{t.titulo}</p>
          <p className="text-sm text-muted-foreground">
            {t.formato} · {t.duracao}
          </p>
        </li>
      ))}
    </ul>
  );
}
