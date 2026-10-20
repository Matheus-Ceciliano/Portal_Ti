"use client";

import { Campo } from "@/components/comum/campos";
import { SelecaoPersonalizada } from "@/components/comum/selecao-personalizada";
import type { PadraoMemoriaOpcao, TipoPadraoMemoria } from "@/lib/catalogos";
import { CAPACIDADES, FORMATOS, formatarCapacidade, INTERFACES, TECNOLOGIAS_RAM, type TipoArmazenamento, type TipoComponente } from "@/lib/componentes";

/* Especificação de uma peça (RAM, SSD, HD) */

export type EspecFormulario = { capacidadeGb: string; tecnologia: string; interfaceConexao: string; formato: string; frequenciaMhz: string };

export const especVazia = (e?: Partial<Record<keyof EspecFormulario, string | number | null>>): EspecFormulario => ({
  capacidadeGb: e?.capacidadeGb ? String(e.capacidadeGb) : "",
  tecnologia: (e?.tecnologia as string) ?? "",
  interfaceConexao: (e?.interfaceConexao as string) ?? "",
  formato: (e?.formato as string) ?? "",
  frequenciaMhz: e?.frequenciaMhz ? String(e.frequenciaMhz) : "",
});

/** Capacidades sugeridas do tipo; um valor já gravado fora da lista continua disponível. */
function opcoesCapacidade(tipo: TipoComponente, atual: string) {
  const lista = [...CAPACIDADES[tipo]];
  const n = Number(atual);
  if (atual && Number.isInteger(n) && n > 0 && !lista.includes(n)) lista.push(n);
  return lista.sort((a, b) => a - b).map((c) => ({ valor: String(c), rotulo: formatarCapacidade(c) }));
}

const opcoes = (lista: readonly string[]) => lista.map((v) => ({ valor: v, rotulo: v }));

/**
 * Opções de um padrão de memória do catálogo (aba Memórias): os ativos e o valor já gravado,
 * mesmo inativo ou fora do catálogo. Sem catálogo, a lista padrão do portal.
 */
export function opcoesPadrao(memoria: PadraoMemoriaOpcao[] | undefined, tipo: TipoPadraoMemoria, atual: string, padrao: readonly string[] = []) {
  const lista = memoria
    ? memoria.filter((p) => p.tipo === tipo && (p.ativa || p.valor === atual)).map((p) => ({ valor: p.valor, rotulo: tipo === "FREQUENCIA" ? `${p.valor} MHz` : p.valor }))
    : opcoes(padrao);
  if (atual && !lista.some((o) => o.valor === atual)) lista.push({ valor: atual, rotulo: tipo === "FREQUENCIA" ? `${atual} MHz` : atual });
  return lista;
}

/** Capacidade, tecnologia (RAM) ou interface (SSD/HD), formato e frequência (RAM). */
export function CamposEspecificacao({
  tipo,
  valor,
  aoMudar,
  erro,
  classeCampo,
  padroes,
}: {
  tipo: TipoComponente;
  valor: EspecFormulario;
  aoMudar: (parcial: Partial<EspecFormulario>) => void;
  erro: (campo: string) => string | undefined;
  classeCampo?: string;
  /** Padrões de memória do catálogo (tecnologia, formato e frequência). */
  padroes?: PadraoMemoriaOpcao[];
}) {
  const memoria = tipo === "MEMORIA_RAM";
  return (
    <>
      <Campo rotulo="Capacidade" obrigatorio erro={erro("capacidadeGb")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={valor.capacidadeGb}
            aoMudar={(v) => aoMudar({ capacidadeGb: v })}
            opcoes={opcoesCapacidade(tipo, valor.capacidadeGb)}
            placeholder="Selecione"
          />
        )}
      </Campo>
      {memoria ? (
        <Campo rotulo="Tecnologia" erro={erro("tecnologia")} className={classeCampo}>
          {(p) => (
            <SelecaoPersonalizada
              id={p.id}
              valor={valor.tecnologia}
              aoMudar={(v) => aoMudar({ tecnologia: v })}
              opcoes={opcoesPadrao(padroes, "TECNOLOGIA", valor.tecnologia, TECNOLOGIAS_RAM)}
              vazio="Não informada"
            />
          )}
        </Campo>
      ) : (
        <Campo rotulo="Interface" erro={erro("interfaceConexao")} className={classeCampo}>
          {(p) => <SelecaoPersonalizada id={p.id} valor={valor.interfaceConexao} aoMudar={(v) => aoMudar({ interfaceConexao: v })} opcoes={opcoes(INTERFACES[tipo])} vazio="Não informada" />}
        </Campo>
      )}
      <Campo rotulo="Formato" erro={erro("formato")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            valor={valor.formato}
            aoMudar={(v) => aoMudar({ formato: v })}
            opcoes={memoria ? opcoesPadrao(padroes, "FORMATO", valor.formato, FORMATOS.MEMORIA_RAM) : opcoes(FORMATOS[tipo])}
            vazio="Não informado"
          />
        )}
      </Campo>
      {memoria ? (
        <Campo rotulo="Frequência" erro={erro("frequenciaMhz")} className={classeCampo}>
          {(p) => (
            <SelecaoPersonalizada
              id={p.id}
              aria-describedby={p["aria-describedby"]}
              invalido={p["aria-invalid"]}
              valor={valor.frequenciaMhz}
              aoMudar={(v) => aoMudar({ frequenciaMhz: v })}
              opcoes={opcoesPadrao(padroes, "FREQUENCIA", valor.frequenciaMhz)}
              vazio="Não informada"
            />
          )}
        </Campo>
      ) : null}
    </>
  );
}

/* Configuração original do notebook (só especificação) */

export type ConfigFormulario = {
  ramGb: string;
  ramTecnologia: string;
  armazenamento: "" | "SSD" | "HD" | "AMBOS";
  ssdGb: string;
  ssdInterface: string;
  hdGb: string;
  hdInterface: string;
};

export const configVazia = (): ConfigFormulario => ({ ramGb: "", ramTecnologia: "", armazenamento: "", ssdGb: "", ssdInterface: "", hdGb: "", hdInterface: "" });

type PecaOriginal = { tipo: TipoComponente; capacidadeGb: number; tecnologia: string | null; interfaceConexao: string | null };

/** Formulário a partir das peças da configuração (uma memória e até um SSD e um HD). */
export function configDasPecas(pecas: PecaOriginal[]): ConfigFormulario {
  const c = configVazia();
  const ram = pecas.filter((p) => p.tipo === "MEMORIA_RAM");
  if (ram.length) {
    c.ramGb = String(ram.reduce((s, p) => s + p.capacidadeGb, 0));
    c.ramTecnologia = ram.find((p) => p.tecnologia)?.tecnologia ?? "";
  }
  const ssd = pecas.find((p) => p.tipo === "SSD");
  const hd = pecas.find((p) => p.tipo === "HD");
  if (ssd) Object.assign(c, { ssdGb: String(ssd.capacidadeGb), ssdInterface: ssd.interfaceConexao ?? "" });
  if (hd) Object.assign(c, { hdGb: String(hd.capacidadeGb), hdInterface: hd.interfaceConexao ?? "" });
  c.armazenamento = ssd && hd ? "AMBOS" : ssd ? "SSD" : hd ? "HD" : "";
  return c;
}

/** Valor enviado ao servidor; nulo quando nada foi informado. */
export function paraConfiguracao(c: ConfigFormulario) {
  const discos: { tipo: TipoArmazenamento; capacidadeGb: string; interfaceConexao: string | null }[] = [];
  if (c.armazenamento === "SSD" || c.armazenamento === "AMBOS") discos.push({ tipo: "SSD", capacidadeGb: c.ssdGb, interfaceConexao: c.ssdInterface || null });
  if (c.armazenamento === "HD" || c.armazenamento === "AMBOS") discos.push({ tipo: "HD", capacidadeGb: c.hdGb, interfaceConexao: c.hdInterface || null });
  const memoria = c.ramGb ? { capacidadeGb: c.ramGb, tecnologia: c.ramTecnologia || null } : null;
  return memoria || discos.length ? { memoria, armazenamento: discos } : null;
}

/** Erros de preenchimento da configuração (o servidor valida de novo). */
export function errosConfiguracao(c: ConfigFormulario): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.ramGb && c.ramTecnologia) e.memoriaRam = "Informe a capacidade total da memória.";
  if ((c.armazenamento === "SSD" || c.armazenamento === "AMBOS") && !c.ssdGb) e.ssdGb = "Informe a capacidade do SSD.";
  if ((c.armazenamento === "HD" || c.armazenamento === "AMBOS") && !c.hdGb) e.hdGb = "Informe a capacidade do HD.";
  return e;
}

const ARMAZENAMENTO = [
  { valor: "SSD", rotulo: "SSD" },
  { valor: "HD", rotulo: "HD" },
  { valor: "AMBOS", rotulo: "SSD e HD" },
];

/** Memória total e armazenamento (SSD, HD ou ambos) como saíram de fábrica: nenhuma peça é criada. */
export function CamposConfiguracao({
  valor,
  aoMudar,
  erro,
  classeCampo,
  padroes,
}: {
  valor: ConfigFormulario;
  aoMudar: (parcial: Partial<ConfigFormulario>) => void;
  erro: (campo: string) => string | undefined;
  classeCampo?: string;
  padroes?: PadraoMemoriaOpcao[];
}) {
  const ssd = valor.armazenamento === "SSD" || valor.armazenamento === "AMBOS";
  const hd = valor.armazenamento === "HD" || valor.armazenamento === "AMBOS";
  const capacidade = (tipo: TipoComponente, atual: string) => opcoesCapacidade(tipo, atual);
  return (
    <>
      <Campo rotulo="Memória RAM" erro={erro("memoriaRam")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            invalido={p["aria-invalid"]}
            valor={valor.ramGb}
            aoMudar={(v) => aoMudar({ ramGb: v })}
            opcoes={capacidade("MEMORIA_RAM", valor.ramGb)}
            vazio="Não informada"
          />
        )}
      </Campo>
      <Campo rotulo="Tecnologia da memória" className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            valor={valor.ramTecnologia}
            aoMudar={(v) => aoMudar({ ramTecnologia: v })}
            opcoes={opcoesPadrao(padroes, "TECNOLOGIA", valor.ramTecnologia, TECNOLOGIAS_RAM)}
            vazio="Não informada"
          />
        )}
      </Campo>
      <Campo rotulo="Armazenamento" erro={erro("armazenamento")} className={classeCampo}>
        {(p) => (
          <SelecaoPersonalizada
            id={p.id}
            valor={valor.armazenamento}
            aoMudar={(v) => aoMudar({ armazenamento: v as ConfigFormulario["armazenamento"] })}
            opcoes={ARMAZENAMENTO}
            vazio="Não informado"
          />
        )}
      </Campo>
      {ssd ? (
        <>
          <Campo rotulo="Capacidade do SSD" obrigatorio erro={erro("ssdGb")} className={classeCampo}>
            {(p) => (
              <SelecaoPersonalizada
                id={p.id}
                aria-describedby={p["aria-describedby"]}
                invalido={p["aria-invalid"]}
                valor={valor.ssdGb}
                aoMudar={(v) => aoMudar({ ssdGb: v })}
                opcoes={capacidade("SSD", valor.ssdGb)}
                placeholder="Selecione"
              />
            )}
          </Campo>
          <Campo rotulo="Interface do SSD" className={classeCampo}>
            {(p) => <SelecaoPersonalizada id={p.id} valor={valor.ssdInterface} aoMudar={(v) => aoMudar({ ssdInterface: v })} opcoes={opcoes(INTERFACES.SSD)} vazio="Não informada" />}
          </Campo>
        </>
      ) : null}
      {hd ? (
        <>
          <Campo rotulo="Capacidade do HD" obrigatorio erro={erro("hdGb")} className={classeCampo}>
            {(p) => (
              <SelecaoPersonalizada
                id={p.id}
                aria-describedby={p["aria-describedby"]}
                invalido={p["aria-invalid"]}
                valor={valor.hdGb}
                aoMudar={(v) => aoMudar({ hdGb: v })}
                opcoes={capacidade("HD", valor.hdGb)}
                placeholder="Selecione"
              />
            )}
          </Campo>
          <Campo rotulo="Interface do HD" className={classeCampo}>
            {(p) => <SelecaoPersonalizada id={p.id} valor={valor.hdInterface} aoMudar={(v) => aoMudar({ hdInterface: v })} opcoes={opcoes(INTERFACES.HD)} vazio="Não informada" />}
          </Campo>
        </>
      ) : null}
    </>
  );
}
