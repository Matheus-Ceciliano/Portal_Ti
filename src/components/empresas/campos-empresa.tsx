"use client";

import { Hash, ImageUp, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputComIcone } from "@/components/ui/input";
import { formatarCnpj, normalizarCnpj, problemaCnpj } from "@/lib/cnpj";
import { cn } from "@/lib/utils";

/** CNPJ com máscara progressiva (aceita letras na base) e validação ao sair do campo. */
export function CampoCnpj({
  valorInicial,
  erroServidor,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "value" | "defaultValue"> & {
  valorInicial?: string;
  erroServidor?: string;
}) {
  const [valor, setValor] = useState(valorInicial ? formatarCnpj(valorInicial) : "");
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const erro = erroLocal ?? erroServidor;
  const idErro = useId();

  return (
    <>
      <InputComIcone
        {...props}
        icone={Hash}
        name="cnpj"
        value={valor}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={18}
        placeholder="00.000.000/0000-00"
        className="tabular uppercase"
        aria-invalid={erro ? true : undefined}
        aria-describedby={[erro ? idErro : null, props["aria-describedby"]].filter(Boolean).join(" ") || undefined}
        onChange={(e) => {
          setValor(formatarCnpj(e.target.value));
          if (erroLocal) setErroLocal(null);
        }}
        onBlur={() => setErroLocal(normalizarCnpj(valor) ? problemaCnpj(valor) : null)}
      />
      {erro ? (
        <p id={idErro} role="alert" className="text-[13px] leading-[18px] font-medium text-erro">
          {erro}
        </p>
      ) : null}
    </>
  );
}

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];
const MAXIMO = 512 * 1024;

/**
 * Envio do logotipo com prévia local. A validação aqui é só de experiência: o servidor
 * confere o conteúdo real do arquivo (assinatura de bytes) e o tamanho.
 */
export function CampoLogo({
  urlAtual,
  sigla,
  erroServidor,
  disponivel,
  aoAlterar,
  variante = "logo",
}: {
  urlAtual: string | null;
  /** Texto mostrado sem imagem (sigla da empresa ou iniciais da pessoa). */
  sigla: string;
  erroServidor?: string;
  disponivel: boolean;
  /** Avisado ao escolher ou remover a imagem (o formulário passa a ter alterações). */
  aoAlterar?: () => void;
  /** "logo" (empresa, campos logo/removerLogo) ou "foto" (pessoa, campos foto/removerFoto, redonda). */
  variante?: "logo" | "foto";
}) {
  const foto = variante === "foto";
  const objeto = foto ? "A foto" : "O logotipo";
  const refArquivo = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const id = useId();
  const erro = erroLocal ?? erroServidor;

  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa);
  }, [previa]);

  const exibida = previa ?? (remover ? null : urlAtual);

  function escolher(arquivo: File | undefined) {
    setErroLocal(null);
    if (!arquivo) return;
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      setErroLocal(`Envie ${foto ? "a foto" : "o logotipo"} em PNG, JPG ou WebP.`);
      if (refArquivo.current) refArquivo.current.value = "";
      return;
    }
    if (arquivo.size > MAXIMO) {
      setErroLocal(`${objeto} pode ter no máximo 512 KB.`);
      if (refArquivo.current) refArquivo.current.value = "";
      return;
    }
    setRemover(false);
    setPrevia(URL.createObjectURL(arquivo));
    aoAlterar?.();
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-rotulo`} className="text-[13px] leading-5 font-semibold text-titulo">
        {foto ? "Foto" : "Logotipo"}
      </span>
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "grid size-16 shrink-0 place-items-center overflow-hidden border bg-white dark:border-white/10",
            foto ? "rounded-full" : "rounded-2xl p-1.5",
            !exibida && "border-dashed bg-muted",
          )}
        >
          {exibida ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local ou rota autorizada
            <img src={exibida} alt={foto ? "Prévia da foto" : "Prévia do logotipo"} className={cn("size-full", foto ? "object-cover" : "object-contain")} />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">{sigla.slice(0, 4) || (foto ? "Foto" : "Logo")}</span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={refArquivo}
              id={id}
              type="file"
              name={foto ? "foto" : "logo"}
              accept={TIPOS_ACEITOS.join(",")}
              className="sr-only"
              disabled={!disponivel}
              aria-labelledby={`${id}-rotulo`}
              aria-describedby={`${id}-ajuda`}
              onChange={(e) => escolher(e.target.files?.[0])}
            />
            <Button type="button" variant="secondary" size="sm" disabled={!disponivel} onClick={() => refArquivo.current?.click()}>
              <ImageUp aria-hidden /> {exibida ? "Trocar imagem" : "Escolher imagem"}
            </Button>
            {exibida ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPrevia(null);
                  setRemover(true);
                  if (refArquivo.current) refArquivo.current.value = "";
                  aoAlterar?.();
                }}
              >
                <Trash2 aria-hidden /> Remover
              </Button>
            ) : null}
          </div>
          <p id={`${id}-ajuda`} className="text-[13px] leading-[18px] text-muted-foreground">
            {disponivel
              ? foto
                ? "Opcional. PNG, JPG ou WebP, até 512 KB."
                : "PNG, JPG ou WebP, até 512 KB. Prefira fundo transparente."
              : "Envio de arquivos indisponível: o armazenamento ainda não foi configurado neste ambiente."}
          </p>
        </div>
      </div>
      <input type="hidden" name={foto ? "removerFoto" : "removerLogo"} value={remover ? "sim" : "nao"} />
      {erro ? (
        <p role="alert" className="text-[13px] leading-[18px] font-medium text-erro">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
