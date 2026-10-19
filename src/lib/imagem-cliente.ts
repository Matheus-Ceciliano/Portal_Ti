/**
 * Redução de fotos no navegador antes do envio (celulares geram arquivos de vários MB).
 * O lado maior fica em até 1.600 px, em JPEG. Se o navegador não conseguir processar,
 * a foto segue original: o servidor valida tipo e tamanho de novo.
 */
const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;
const SEM_REDUCAO_ATE = 400 * 1024;

export async function reduzirImagem(arquivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return arquivo;
  try {
    const imagem = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
    if (escala === 1 && arquivo.size <= SEM_REDUCAO_ATE) {
      imagem.close();
      return arquivo;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    const contexto = canvas.getContext("2d");
    if (!contexto) return arquivo;
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}
