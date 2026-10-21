/**
 * Posição dos modais grandes de Empresas. A partir de lg o menu lateral (recolhido ou fixado;
 * largura em --largura-sidebar, definida pela casca da TI, 15rem quando ausente) ocupa a
 * esquerda e quase não escurece sob o overlay; centralizar na janela inteira deixa o modal
 * visualmente deslocado e por cima do menu. Por isso, em lg+, o centro horizontal é o da área
 * de trabalho (à direita do menu) e a largura não invade o menu. Abaixo de lg (sem menu fixo)
 * o modal fica centralizado na janela.
 * As classes ficam escritas por extenso para o Tailwind gerá-las.
 */
export const MODAL_CENTRALIZADO = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-[calc(50%_+_var(--largura-sidebar,15rem)_/_2)]";

/** Larguras: até o valor nominal, sem passar da janela (sm) nem da área de trabalho (lg+). */
export const LARGURA_MODAL = {
  1000: "sm:w-[min(1000px,calc(100%-2rem))] lg:w-[min(1000px,calc(100%_-_var(--largura-sidebar,15rem)_-_2rem))]",
  1050: "sm:max-w-[min(1050px,calc(100%-2rem))] lg:max-w-[min(1050px,calc(100%_-_var(--largura-sidebar,15rem)_-_2rem))]",
  900: "sm:w-[min(900px,calc(100%-2rem))] lg:w-[min(900px,calc(100%_-_var(--largura-sidebar,15rem)_-_2rem))]",
} as const;
