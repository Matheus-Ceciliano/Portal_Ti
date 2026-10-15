import type { Metadata, Viewport } from "next";
import "@fontsource-variable/source-sans-3";
import { ProvedorTema } from "@/components/tema/provedor-tema";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Portal TI Vallur", template: "%s · Portal TI Vallur" },
  description: "Portal interno de TI do Grupo Vallur.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17365d" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1626" },
  ],
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ProvedorTema>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="top-right" richColors={false} closeButton />
          </TooltipProvider>
        </ProvedorTema>
      </body>
    </html>
  );
}
