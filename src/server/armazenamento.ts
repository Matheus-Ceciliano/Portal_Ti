import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ErroNegocio } from "@/server/authz/exigir";
import { obterConfiguracao } from "@/server/config";

/**
 * Armazenamento privado de arquivos (ARQUITETURA_TECNICA.md §12.2, DA-07). Nesta etapa só
 * existe o adaptador de sistema de arquivos para DESENVOLVIMENTO (pasta .data/, ignorada pelo
 * Git). Fora de desenvolvimento, o envio é recusado até o adaptador S3 ser configurado.
 * Arquivos nunca são servidos diretamente: só por rota que verifica sessão e permissão.
 */
export interface ArmazenamentoArquivos {
  salvar(chave: string, dados: Buffer): Promise<void>;
  ler(chave: string): Promise<Buffer | null>;
  remover(chave: string): Promise<void>;
}

const RAIZ = path.resolve(".data", "arquivos");
const CHAVE_SEGURA = /^[a-z0-9-]+\/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/;

function caminhoSeguro(chave: string): string {
  if (!CHAVE_SEGURA.test(chave)) throw new Error("Chave de arquivo inválida.");
  const destino = path.resolve(RAIZ, chave);
  if (!destino.startsWith(RAIZ + path.sep)) throw new Error("Chave de arquivo inválida.");
  return destino;
}

const armazenamentoLocal: ArmazenamentoArquivos = {
  async salvar(chave, dados) {
    const destino = caminhoSeguro(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, dados, { flag: "wx" });
  },
  async ler(chave) {
    try {
      return await readFile(caminhoSeguro(chave));
    } catch {
      return null;
    }
  },
  async remover(chave) {
    await rm(caminhoSeguro(chave), { force: true });
  },
};

export function armazenamentoDisponivel(): boolean {
  return obterConfiguracao().AMBIENTE === "DESENVOLVIMENTO";
}

export function obterArmazenamento(): ArmazenamentoArquivos {
  if (!armazenamentoDisponivel()) {
    throw new ErroNegocio("O armazenamento de arquivos ainda não está configurado neste ambiente.");
  }
  return armazenamentoLocal;
}

/* Imagens de logotipo */

export const LOGO_TAMANHO_MAXIMO = 512 * 1024;
const TIPOS = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ExtensaoImagem = keyof typeof TIPOS;

/** Detecta o tipo pelo conteúdo (assinatura de bytes), nunca pelo nome ou pelo tipo declarado. SVG é recusado. */
export function detectarImagem(dados: Buffer): { extensao: ExtensaoImagem; tipo: string } | null {
  if (dados.length >= 8 && dados.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extensao: "png", tipo: TIPOS.png };
  }
  if (dados.length >= 3 && dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff) {
    return { extensao: "jpg", tipo: TIPOS.jpg };
  }
  if (dados.length >= 12 && dados.toString("ascii", 0, 4) === "RIFF" && dados.toString("ascii", 8, 12) === "WEBP") {
    return { extensao: "webp", tipo: TIPOS.webp };
  }
  return null;
}

export function validarLogo(dados: Buffer): { extensao: ExtensaoImagem; tipo: string } {
  if (dados.length === 0) throw new ErroNegocio("O arquivo do logotipo está vazio.");
  if (dados.length > LOGO_TAMANHO_MAXIMO) throw new ErroNegocio("O logotipo pode ter no máximo 512 KB.");
  const imagem = detectarImagem(dados);
  if (!imagem) throw new ErroNegocio("Envie o logotipo em PNG, JPG ou WebP.");
  return imagem;
}

/** Nome do arquivo gerado no servidor (aleatório); o nome enviado pelo usuário é descartado. */
export function novaChave(pasta: string, extensao: ExtensaoImagem): string {
  return `${pasta}/${randomUUID()}.${extensao}`;
}

/* PDF (termo assinado) */

export const PDF_TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** PDF de verdade: cabeçalho "%PDF-" e marcador de fim "%%EOF" (o nome e o tipo declarado não valem). */
export function validarPdf(dados: Buffer) {
  if (dados.length === 0) throw new ErroNegocio("O arquivo está vazio.");
  if (dados.length > PDF_TAMANHO_MAXIMO) throw new ErroNegocio("O PDF pode ter no máximo 10 MB.");
  const final = dados.subarray(Math.max(0, dados.length - 2048)).toString("latin1");
  if (dados.toString("latin1", 0, 5) !== "%PDF-" || !final.includes("%%EOF")) throw new ErroNegocio("Envie o termo assinado em PDF.");
}

export const novaChavePdf = (pasta: string) => `${pasta}/${randomUUID()}.pdf`;
