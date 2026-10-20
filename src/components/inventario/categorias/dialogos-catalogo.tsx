"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { AlertaFormulario, Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import { MODAL_CENTRALIZADO } from "@/components/empresas/posicao-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DIGITOS_MAXIMO, DIGITOS_MINIMO, exemploRegra, FORMATO_PREFIXO, normalizarPrefixo } from "@/lib/identificacao";
import { cn } from "@/lib/utils";
import { acaoCriarCategoria, acaoEditarCategoria } from "@/server/acoes/categorias";
import type { CategoriaCatalogo } from "@/server/modulos/categorias";

const CONTEUDO = cn(MODAL_CENTRALIZADO, "w-[calc(100%-1rem)] sm:max-w-[520px]");
const SEM_CONEXAO = "Não foi possível falar com o servidor. Tente novamente.";
const OPCOES_DIGITOS = Array.from({ length: DIGITOS_MAXIMO - DIGITOS_MINIMO + 1 }, (_, i) => String(i + DIGITOS_MINIMO)).map((d) => ({ valor: d, rotulo: `${d} dígitos` }));

/** Categorias que nunca ficam sem abreviação (o identificador é obrigatório). */
const exigePrefixo = (c: CategoriaCatalogo | null) => !c || !c.sistema || ["PROCESSADOR", "KIT"].includes(c.regra) || ["MEMORIA_RAM", "SSD", "HD"].includes(c.tipo);

/**
 * Categoria: nome, abreviação, dígitos e situação. Mudar a abreviação ou os dígitos vale
 * para os próximos equipamentos (os existentes mantêm o identificador) e pede confirmação.
 */
export function DialogoCategoria({
  aoFechar,
  aoSalvar,
  categoria,
}: {
  aoFechar: () => void;
  aoSalvar: (c: CategoriaCatalogo, mensagem: string) => void;
  /** Ausente = criar. */
  categoria?: CategoriaCatalogo | null;
}) {
  const edicao = Boolean(categoria);
  const carregador = categoria?.regra === "CARREGADOR";
  const [nome, setNome] = useState(categoria?.nome ?? "");
  const [prefixo, setPrefixo] = useState(categoria?.prefixo ?? "");
  const [digitos, setDigitos] = useState(String(categoria?.digitos && categoria.digitos >= DIGITOS_MINIMO ? categoria.digitos : 3));
  const [ativa, setAtiva] = useState(categoria?.ativa ?? true);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const p = normalizarPrefixo(prefixo);
  const mudaGeracao = edicao && !carregador && (p !== (categoria!.prefixo ?? "") || Number(digitos) !== categoria!.digitos);
  const regraNova = categoria && (categoria.regra === "SEQUENCIAL" || categoria.regra === "NENHUMA") ? (p ? "SEQUENCIAL" : "NENHUMA") : (categoria?.regra ?? "SEQUENCIAL");
  const exemplo = p && FORMATO_PREFIXO.test(p) ? exemploRegra(regraNova, p, Number(digitos)) : null;

  async function salvar() {
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = "Informe o nome da categoria.";
    if (!carregador) {
      if (!p && exigePrefixo(categoria ?? null)) e.prefixo = "Informe a abreviação.";
      else if (p && !FORMATO_PREFIXO.test(p)) e.prefixo = "Use de 2 a 6 letras, sem números, espaços ou acentos.";
    }
    setErros(e);
    if (Object.keys(e).length) return;
    if (mudaGeracao && !confirmar) {
      setConfirmar(true);
      return;
    }
    setEnviando(true);
    setErro(null);
    const r = await (edicao
      ? acaoEditarCategoria({ id: categoria!.id, nome, prefixo: carregador ? null : p || null, digitos: Number(digitos), ativa, confirmacao: mudaGeracao })
      : acaoCriarCategoria({ nome, prefixo: p, digitos: Number(digitos), ativa })
    ).catch(() => ({ ok: false as const, erro: SEM_CONEXAO }));
    setEnviando(false);
    if (!r.ok) {
      setConfirmar(false);
      if (/abreviação|prefixo/i.test(r.erro)) setErros({ prefixo: r.erro });
      else if (/nome/i.test(r.erro)) setErros({ nome: r.erro });
      else setErro(r.erro);
      return;
    }
    aoSalvar(r.dados, r.mensagem ?? "Categoria salva.");
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className={CONTEUDO} data-testid="dialogo-categoria" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{edicao ? "Editar categoria" : "Criar categoria"}</DialogTitle>
          <DialogDescription className="sr-only">Nome, abreviação e sequência do identificador.</DialogDescription>
        </DialogHeader>
        {erro ? <AlertaFormulario tom="erro">{erro}</AlertaFormulario> : null}
        {confirmar ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-atencao/30 bg-atencao-fundo p-4" role="note" data-testid="confirmar-abreviacao">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-atencao" aria-hidden />
            <p className="text-[13.5px] text-titulo">
              Os próximos equipamentos de <strong>{nome}</strong> serão identificados como <strong className="tabular">{exemplo ?? "sem identificação automática"}</strong>. Os já
              cadastrados mantêm o identificador atual.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da categoria" obrigatorio erro={erros.nome} className="sm:col-span-2">
              {(pp) => <Input {...pp} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="off" placeholder="Ex.: Webcam" />}
            </Campo>
            <Campo
              rotulo="Abreviação"
              obrigatorio={!carregador && exigePrefixo(categoria ?? null)}
              erro={erros.prefixo}
              ajuda={carregador ? "Nome do notebook + .C (NBI5001.C1)." : exemplo ? `Próximos: ${exemplo}` : undefined}
            >
              {(pp) => (
                <Input
                  {...pp}
                  value={carregador ? "" : prefixo}
                  onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, ""))}
                  maxLength={6}
                  disabled={carregador}
                  autoComplete="off"
                  spellCheck={false}
                  className="tabular uppercase placeholder:normal-case"
                  placeholder={carregador ? "—" : "Ex.: WCM"}
                />
              )}
            </Campo>
            <Campo rotulo="Dígitos da sequência">
              {(pp) => <SelecaoPersonalizada id={pp.id} valor={digitos} aoMudar={setDigitos} opcoes={OPCOES_DIGITOS} desabilitado={carregador} />}
            </Campo>
            <label className="flex items-center gap-2.5 text-[13.5px] font-medium text-titulo sm:col-span-2">
              <Checkbox checked={ativa} onCheckedChange={(v) => setAtiva(v === true)} disabled={carregador} />
              Categoria ativa
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" disabled={enviando} onClick={() => (confirmar ? setConfirmar(false) : aoFechar())}>
            {confirmar ? "Voltar" : "Cancelar"}
          </Button>
          <Button carregando={enviando} rotuloCarregando="Salvando…" onClick={() => void salvar()}>
            {confirmar ? "Confirmar alteração" : edicao ? "Salvar categoria" : "Criar categoria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
