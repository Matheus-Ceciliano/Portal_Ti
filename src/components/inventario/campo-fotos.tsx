"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FOTOS_POR_ENVIO, ROTULO_FOTO, type TipoFoto } from "@/lib/inventario";
import { reduzirImagem } from "@/lib/imagem-cliente";
import { cn } from "@/lib/utils";

export type FotoLocal = { id: string; arquivo: File; url: string };
export type FotosSelecionadas = Partial<Record<TipoFoto, FotoLocal[]>>;

export const totalFotos = (f: FotosSelecionadas) => Object.values(f).reduce((s, l) => s + (l?.length ?? 0), 0);

/** Acrescenta as fotos ao envio, nos campos "foto_<TIPO>" que o servidor lê. */
export function anexarFotos(dados: FormData, fotos: FotosSelecionadas, campo = (tipo: string) => `foto_${tipo}`) {
  for (const [tipo, lista] of Object.entries(fotos)) for (const f of lista ?? []) dados.append(campo(tipo), f.arquivo);
}

/** Libera as prévias (object URLs) ao descartar o formulário. */
export function liberarFotos(fotos: FotosSelecionadas) {
  for (const lista of Object.values(fotos)) for (const f of lista ?? []) URL.revokeObjectURL(f.url);
}

/**
 * Fotos por tipo (nenhuma é obrigatória). As imagens são reduzidas no navegador antes do envio;
 * o servidor confere tipo, tamanho e quantidade de novo. Fotos já gravadas aparecem para
 * consulta; na edição do cadastro, quem pode tratar evidências marca as que devem sair
 * (a remoção vale ao salvar e preserva o registro).
 */
export function CampoFotos({
  tipos,
  valor,
  aoMudar,
  existentes = [],
  erro,
  compacto,
  rotulo = "Fotos",
  removidas = [],
  aoRemoverExistente,
  aoDesfazerRemocoes,
}: {
  tipos: readonly TipoFoto[];
  valor: FotosSelecionadas;
  aoMudar: (proximo: FotosSelecionadas) => void;
  existentes?: { id: string; tipo: string; url: string }[];
  /** Fotos gravadas marcadas para sair ao salvar. */
  removidas?: string[];
  aoRemoverExistente?: (id: string) => void;
  aoDesfazerRemocoes?: () => void;
  erro?: string;
  /** Um só tipo, em linha (manutenção, devolução). */
  compacto?: boolean;
  rotulo?: string;
}) {
  const [processando, setProcessando] = useState<TipoFoto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const idErro = useId();
  // Prévias liberadas ao desmontar.
  const atual = useRef(valor);
  useEffect(() => {
    atual.current = valor;
  }, [valor]);
  useEffect(() => () => liberarFotos(atual.current), []);

  async function adicionar(tipo: TipoFoto, arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const livres = FOTOS_POR_ENVIO - totalFotos(valor);
    const escolhidos = [...arquivos].slice(0, Math.max(0, livres));
    setAviso(arquivos.length > escolhidos.length ? `Até ${FOTOS_POR_ENVIO} fotos por envio.` : null);
    if (!escolhidos.length) return;
    setProcessando(tipo);
    const reduzidos = await Promise.all(escolhidos.map(reduzirImagem));
    setProcessando(null);
    const novos = reduzidos.map((arquivo) => ({ id: crypto.randomUUID(), arquivo, url: URL.createObjectURL(arquivo) }));
    aoMudar({ ...valor, [tipo]: [...(valor[tipo] ?? []), ...novos] });
  }

  function remover(tipo: TipoFoto, id: string) {
    const lista = valor[tipo] ?? [];
    const alvo = lista.find((f) => f.id === id);
    if (alvo) URL.revokeObjectURL(alvo.url);
    aoMudar({ ...valor, [tipo]: lista.filter((f) => f.id !== id) });
  }

  const mensagem = erro ?? aviso;
  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-label={rotulo} aria-describedby={mensagem ? idErro : undefined}>
      <ul className={cn("grid gap-2.5", compacto ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
        {tipos.map((tipo) => (
          <Tipo
            key={tipo}
            tipo={tipo}
            fotos={valor[tipo] ?? []}
            existentes={existentes.filter((e) => e.tipo === tipo && !removidas.includes(e.id))}
            processando={processando === tipo}
            aoAdicionar={(arquivos) => void adicionar(tipo, arquivos)}
            aoRemover={(id) => remover(tipo, id)}
            aoRemoverExistente={aoRemoverExistente}
            compacto={compacto}
          />
        ))}
      </ul>
      {removidas.length ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground" role="status" data-testid="fotos-a-remover">
          {removidas.length === 1 ? "1 foto será removida ao salvar." : `${removidas.length} fotos serão removidas ao salvar.`}
          {aoDesfazerRemocoes ? (
            <button type="button" onClick={aoDesfazerRemocoes} className="font-semibold text-link underline-offset-4 hover:underline">
              Desfazer
            </button>
          ) : null}
        </p>
      ) : null}
      {mensagem ? (
        <p id={idErro} className={cn("text-[13px] leading-[18px]", erro ? "font-medium text-erro" : "text-muted-foreground")}>
          {mensagem}
        </p>
      ) : null}
    </div>
  );
}

function Tipo({
  tipo,
  fotos,
  existentes,
  processando,
  aoAdicionar,
  aoRemover,
  aoRemoverExistente,
  compacto,
}: {
  tipo: TipoFoto;
  fotos: FotoLocal[];
  existentes: { id: string; url: string }[];
  processando: boolean;
  aoAdicionar: (arquivos: FileList | null) => void;
  aoRemover: (id: string) => void;
  aoRemoverExistente?: (id: string) => void;
  compacto?: boolean;
}) {
  const id = useId();
  const rotulo = ROTULO_FOTO[tipo];
  const quantidade = fotos.length + existentes.length;
  return (
    <li className={cn("flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2.5", quantidade > 0 && "border-primary/30")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12.5px] font-semibold text-titulo">{compacto ? "Fotos (opcional)" : rotulo}</span>
        {quantidade ? <span className="tabular text-[12px] text-muted-foreground">{quantidade}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {existentes.map((e, i) => (
          <span key={e.id} className="relative">
            <a href={e.url} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- rota privada com sessão */}
              <img src={e.url} alt={`${rotulo} (já gravada)`} className="size-12 rounded-md border object-cover" loading="lazy" />
            </a>
            {aoRemoverExistente ? (
              <button
                type="button"
                onClick={() => aoRemoverExistente(e.id)}
                aria-label={`Remover ${rotulo.toLowerCase()} gravada, foto ${i + 1}`}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground shadow-nivel-1 hover:text-erro focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
        {fotos.map((f, i) => (
          <span key={f.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local antes do envio */}
            <img src={f.url} alt={`${rotulo}, foto ${i + 1}`} className="size-12 rounded-md border object-cover" />
            <button
              type="button"
              onClick={() => aoRemover(f.id)}
              aria-label={`Remover ${rotulo.toLowerCase()}, foto ${i + 1}`}
              className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground shadow-nivel-1 hover:text-erro focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <label
          htmlFor={id}
          className={cn(
            // relative: contém o input sr-only (o foco nele não rola o diálogo).
            "relative grid size-12 cursor-pointer place-items-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
          )}
        >
          {processando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          <span className="sr-only">Adicionar foto: {rotulo}</span>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            data-tipo-foto={tipo}
            onChange={(e) => {
              aoAdicionar(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </li>
  );
}
