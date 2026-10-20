/**
 * Preferência da barra lateral da área de TI: "fixada" (sempre expandida) ou recolhida
 * (padrão). Fica em cookie para o servidor desenhar o estado certo desde o primeiro quadro.
 * Módulo sem "use client": o layout (servidor) e a casca (cliente) importam a mesma chave.
 */
export const COOKIE_BARRA_LATERAL = "vallur_barra_lateral";

export const barraFixada = (valor: string | undefined) => valor === "fixada";
