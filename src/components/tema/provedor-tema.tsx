"use client";

import { ThemeProvider } from "next-themes";

/** Tema claro/escuro com preferência persistida no navegador (chave "vallur-tema"). */
export function ProvedorTema({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="vallur-tema" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
