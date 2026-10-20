"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import type { MarcaOpcao, ModeloOpcao } from "@/lib/catalogos";
import { DialogoMarca, DialogoModelo, type CategoriaSimples } from "./dialogos";

/** Item do catálogo para o select: ativos e o já escolhido (inativo aparece marcado). */
export const opcoesAtivas = <T extends { id: string; ativa: boolean }>(lista: T[], atual: string, rotulo: (x: T) => string, detalhe?: (x: T) => string | undefined) =>
  lista
    .filter((x) => x.ativa || x.id === atual)
    .map((x) => ({ valor: x.id, rotulo: rotulo(x), detalhe: x.ativa ? detalhe?.(x) : "Inativo" }));

/** Modelo continua válido só se for da marca e da categoria escolhidas. */
export const modeloCompativel = (modelos: ModeloOpcao[], modeloId: string, marcaId: string, categoriaId: string) => {
  const m = modelos.find((x) => x.id === modeloId);
  return Boolean(m && m.marcaId === marcaId && m.categoriaId === categoriaId);
};

/**
 * Marca e modelo pelos catálogos. O modelo depende da categoria e da marca: só aparecem os
 * compatíveis, e "+ Criar novo" cadastra no catálogo sem perder o que já foi preenchido
 * (o item criado entra nas opções e fica selecionado).
 */
export function CamposFabricante({
  categoriaId,
  categoria,
  marcaId,
  modeloId,
  marcas,
  modelos,
  categorias,
  aoMudar,
  aoNovaMarca,
  aoNovoModelo,
  podeCriar,
  erro,
  modeloOpcional,
  classeCampo,
}: {
  /** Categoria do equipamento (vazio = ainda não escolhida). */
  categoriaId: string;
  categoria?: string;
  marcaId: string;
  modeloId: string;
  marcas: MarcaOpcao[];
  modelos: ModeloOpcao[];
  categorias: CategoriaSimples[];
  aoMudar: (v: { marcaId: string; modeloId: string }) => void;
  aoNovaMarca: (m: MarcaOpcao) => void;
  aoNovoModelo: (m: ModeloOpcao) => void;
  podeCriar: boolean;
  erro: (campo: string) => string | undefined;
  modeloOpcional?: boolean;
  classeCampo?: string;
}) {
  const [criando, setCriando] = useState<"marca" | "modelo" | null>(null);
  const compativeis = modelos.filter((m) => m.marcaId === marcaId && m.categoriaId === categoriaId);
  const semBase = !categoriaId || !marcaId;

  return (
    <>
      <Campo rotulo="Marca" obrigatorio erro={erro("marcaId")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={marcaId}
            aoMudar={(v) => aoMudar({ marcaId: v, modeloId: modeloCompativel(modelos, modeloId, v, categoriaId) ? modeloId : "" })}
            opcoes={opcoesAtivas(marcas, marcaId, (m) => m.nome)}
            placeholder="Selecione"
            pesquisavel
            criar={podeCriar ? { aoCriar: () => setCriando("marca") } : undefined}
          />
        )}
      </Campo>
      <Campo rotulo="Modelo" obrigatorio={!modeloOpcional} erro={erro("modeloId")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={modeloId}
            aoMudar={(v) => aoMudar({ marcaId, modeloId: v })}
            opcoes={opcoesAtivas(compativeis, modeloId, (m) => m.nome)}
            placeholder={!categoriaId ? "Selecione a categoria" : !marcaId ? "Selecione a marca" : compativeis.length ? "Selecione" : "Nenhum modelo cadastrado"}
            desabilitado={semBase}
            pesquisavel
            vazio={modeloOpcional && modeloId ? "Sem modelo" : undefined}
            criar={podeCriar && !semBase ? { aoCriar: () => setCriando("modelo") } : undefined}
          />
        )}
      </Campo>

      {criando === "marca" ? (
        <DialogoMarca
          aoFechar={() => setCriando(null)}
          aoSalvar={(m, mensagem) => {
            aoNovaMarca(m);
            aoMudar({ marcaId: m.id, modeloId: "" });
            setCriando(null);
            toast.success(mensagem);
          }}
        />
      ) : null}
      {criando === "modelo" ? (
        <DialogoModelo
          marcas={marcas}
          categorias={categorias.length ? categorias : [{ id: categoriaId, nome: categoria ?? "", ativa: true }]}
          fixo={{ marcaId, categoriaId }}
          aoFechar={() => setCriando(null)}
          aoSalvar={(m, mensagem) => {
            aoNovoModelo(m);
            aoMudar({ marcaId, modeloId: m.id });
            setCriando(null);
            toast.success(mensagem);
          }}
        />
      ) : null}
    </>
  );
}
