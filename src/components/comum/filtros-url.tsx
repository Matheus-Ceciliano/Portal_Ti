"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { BarraFiltros, type DefFiltro } from "@/components/empresas/registros/barra-filtros";

/** Barra de filtros da página completa: o estado fica na URL (tab, busca, filtros, ordenação, página). */
export function FiltrosUrl({
  busca: buscaInicial,
  placeholder,
  rotuloBusca,
  filtros,
  resumo,
  chavesFiltro,
  compacta,
}: {
  busca: string;
  placeholder: string;
  rotuloBusca: string;
  filtros: DefFiltro[];
  resumo: string;
  /** Parâmetros removidos por "Limpar filtros". */
  chavesFiltro: string[];
  compacta?: boolean;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [busca, setBusca] = useState(buscaInicial);
  const [pendente, iniciar] = useTransition();
  // Parâmetros já pedidos e ainda não refletidos na URL: ações rápidas em sequência (ex.:
  // "Limpar filtros" e logo outro filtro) partem deles, sem ressuscitar valores antigos.
  const pedidos = useRef<string | null>(null);
  useEffect(() => {
    pedidos.current = null;
  }, [parametros]);

  function aplicar(mudancas: Record<string, string>) {
    const p = new URLSearchParams(pedidos.current ?? parametros.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("pagina"); // filtro novo começa da primeira página
    pedidos.current = p.toString();
    iniciar(() => router.replace(`${caminho}?${p.toString()}`, { scroll: false }));
  }

  // Pesquisa com atraso curto, para não consultar a cada tecla; só age se diferir da URL.
  useEffect(() => {
    if (busca.trim() === (parametros.get("busca") ?? "")) return;
    const t = setTimeout(() => aplicar({ busca: busca.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a busca dispara
  }, [busca]);

  return (
    <BarraFiltros
      busca={busca}
      aoBuscar={setBusca}
      placeholder={placeholder}
      rotuloBusca={rotuloBusca}
      filtros={filtros}
      aoFiltrar={(chave, valor) => aplicar({ [chave]: valor, ...Object.fromEntries((filtros.find((f) => f.chave === chave)?.limpa ?? []).map((k) => [k, ""])) })}
      aoLimpar={() => {
        setBusca("");
        aplicar(Object.fromEntries([...chavesFiltro, "busca"].map((k) => [k, ""])));
      }}
      resumo={resumo}
      carregando={pendente}
      compacta={compacta}
    />
  );
}
