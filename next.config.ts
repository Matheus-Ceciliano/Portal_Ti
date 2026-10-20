import type { NextConfig } from "next";

/**
 * cacheComponents fica desligado: quase todo o conteúdo depende de quem está logado e
 * a arquitetura proíbe cache compartilhado de dados por usuário (ARQUITETURA_TECNICA.md §6.1).
 */
const cabecalhosSeguranca = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // A suíte E2E usa um diretório próprio para rodar ao lado do servidor de desenvolvimento.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // O selo de desenvolvimento fica à direita para não cobrir "Mais opções" no rodapé da barra lateral.
  devIndicators: { position: "bottom-right" },
  // Fotos de equipamentos e PDF do termo assinado (as fotos chegam reduzidas pelo navegador;
  // o servidor valida tipo, tamanho e quantidade de novo).
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhosSeguranca },
      { source: "/(ti|portal|conta|entrar)/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
