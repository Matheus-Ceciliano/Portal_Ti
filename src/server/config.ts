import { z } from "zod";

/**
 * Configuração validada na inicialização (DA-23). Sem AMBIENTE explícito, a aplicação
 * não inicia. As mensagens de erro citam só o nome da variável, nunca o valor.
 */
const esquema = z
  .object({
    AMBIENTE: z.enum(["DESENVOLVIMENTO", "HOMOLOGACAO", "PRODUCAO"]),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    SENHA_PEPPER: z.string().min(32),
    MODO_INTEGRACOES: z.enum(["SIMULACAO", "ATIVO"]).default("SIMULACAO"),
    TENANTS_ESCRITA_AUTORIZADOS: z.string().default(""),
    /**
     * CPF (DA-11): chave AES-256-GCM e chave do HMAC, separadas (32 bytes em base64url).
     * Sem elas o portal não grava nem revela CPF. Perder a chave de cifra torna o dado irrecuperável.
     */
    CPF_CHAVE_CIFRA: z.string().min(43).optional(),
    CPF_CHAVE_HMAC: z.string().min(43).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.MODO_INTEGRACOES !== "SIMULACAO") {
      ctx.addIssue({
        code: "custom",
        path: ["MODO_INTEGRACOES"],
        message:
          "somente SIMULACAO é aceito: não há conector real implementado nem autorização da TI para o tenant (Q-09)",
      });
    }
    if (c.TENANTS_ESCRITA_AUTORIZADOS.trim() !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["TENANTS_ESCRITA_AUTORIZADOS"],
        message: "deve ficar vazia até registro de autorização da TI (Q-09)",
      });
    }
    if (c.CPF_CHAVE_CIFRA && c.CPF_CHAVE_CIFRA === c.CPF_CHAVE_HMAC) {
      ctx.addIssue({ code: "custom", path: ["CPF_CHAVE_HMAC"], message: "precisa ser diferente da chave de cifra do CPF" });
    }
    if (c.AMBIENTE !== "DESENVOLVIMENTO" && !c.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "fora de desenvolvimento, a URL precisa usar https",
      });
    }
  });

export type Configuracao = z.infer<typeof esquema>;

let cache: Configuracao | undefined;

export function validarConfiguracao(entrada: Record<string, string | undefined>): Configuracao {
  const resultado = esquema.safeParse(entrada);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuração inválida — ${problemas}`);
  }
  return resultado.data;
}

export function obterConfiguracao(): Configuracao {
  cache ??= validarConfiguracao(process.env);
  return cache;
}

export const ROTULO_AMBIENTE: Record<Configuracao["AMBIENTE"], string> = {
  DESENVOLVIMENTO: "Desenvolvimento",
  HOMOLOGACAO: "Homologação",
  PRODUCAO: "Produção",
};
