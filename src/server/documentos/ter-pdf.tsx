import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarCpf } from "@/lib/cpf";

/**
 * PDF do TER no layout do modelo FORM-TI-TR-001 (referência TER_VALLUR_v22): cabeçalho com
 * marca, título e metadados; seções com faixa azul. Termo (identificação, empresa e
 * colaborador, resumo, declarações, observações e assinaturas) e anexos de equipamento correm
 * num só fluxo, sem página exclusiva por seção; as evidências fotográficas só existem quando há
 * fotos. A4, cabeçalho e rodapé em todas as páginas, quebra automática (nada é cortado para
 * caber; blocos curtos não se separam). Gerado só no servidor.
 */

/** Instantâneo documental de uma versão (guardado em VersaoTer.dados, sem CPF nem imagens). */
export type DadosTer = {
  /** 1: primeiras emissões; 2: identificador e patrimônio separados, descrição composta, marca de teste. */
  formato: 1 | 2;
  /** Emitido fora de produção: marcado como documento de teste, sem validade como termo oficial. */
  teste?: boolean;
  numero: string;
  versao: number;
  documento: string;
  emitidoEm: string;
  modelo: { codigo: string; revisao: string; titulo: string; declaracoes: string[]; exigeAssinaturaTi: boolean };
  entrega: { evento: string; tipo: string; entregueEm: string; alocacao: string; responsavelTi: string; registradoPor: string; observacoes: string | null };
  empresa: { id: string; nome: string; cnpj: string; temLogo: boolean };
  colaborador: { id: string; nome: string; cpfFinal: string | null; matricula: string | null; cargo: string | null; departamento: string | null; gestor: string | null; email: string };
  equipamentos: EquipamentoTer[];
};

export type EquipamentoTer = {
  anexo: number;
  ativoId: string;
  /** Código do equipamento no portal (NBI4588, NBI4588C1...): a identificação principal. */
  identificador: string;
  /** Patrimônio, só quando informado no cadastro (nunca o identificador no lugar). */
  patrimonio: string | null;
  nomeDispositivo: string | null;
  categoria: string;
  descricao: string;
  especificacao?: string | null;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  proprietaria: { nome: string; cnpj: string };
  aluguel: { locataria: string; inicio: string } | null;
  condicao: string;
  avarias: string[];
  /** Carregador (de qual notebook) ou peça de kit. */
  vinculo: string | null;
  /** Carregador entregue junto com o notebook deste TER (identificador e anexo dele). */
  acompanha?: { identificador: string; anexo: number } | null;
  inspecao: { numero: string; tipo: string; concluidaEm: string | null; responsavel: string | null; resultado: string; observacoes: string | null };
  verificacao: { modo: string; verificadaEm: string; responsavel: string };
  respostas: { grupo: string; pergunta: string; versao: number | null; resposta: string; justificativa: string | null; observacao: string | null; bloqueante: boolean }[];
  semResposta: { grupo: string; pergunta: string; versao: number | null }[];
  acessorios: { nome: string; quantidade: number; identificacao: string; estado: string }[];
  fotos: { id: string; legenda: string }[];
};

export type ImagemPdf = { data: Buffer; format: "png" | "jpg" };
export type RecursosTer = { cpf: string; logo: ImagemPdf | null; fotos: Map<string, ImagemPdf> };

const AZUL = "#0b2f6b";
const CLARO = "#e8eef8";
const GRUPO = "#f3f6fa";
const BORDA = "#b8c3d1";
const TEXTO = "#18202a";
const LINHA_TABELA = "#8a94a0";
const VERMELHO = "#b3261e";
const MM = 2.8346;

// Português sem hifenização automática (a padrão é a do inglês).
Font.registerHyphenationCallback((palavra) => [palavra]);

const s = StyleSheet.create({
  pagina: { paddingTop: 10 * MM, paddingHorizontal: 12 * MM, paddingBottom: 17 * MM, fontFamily: "Helvetica", fontSize: 8.5, color: TEXTO },
  cabecalho: { flexDirection: "row", borderWidth: 1.2, borderColor: "#222", marginBottom: 6 },
  marca: { width: "21%", borderRightWidth: 0.8, borderColor: "#222", padding: 6, alignItems: "center", justifyContent: "center" },
  logo: { maxWidth: "100%", maxHeight: 40, objectFit: "contain" },
  marcaNome: { fontFamily: "Helvetica-Bold", color: AZUL, fontSize: 11, textAlign: "center" },
  marcaSub: { fontSize: 7.5, color: "#555", marginTop: 3, textAlign: "center" },
  titulo: { width: "58%", borderRightWidth: 0.8, borderColor: "#222", padding: 6, alignItems: "center", justifyContent: "center" },
  sgq: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 3, textAlign: "center", color: "#111" },
  meta: { width: "21%", padding: 5, fontSize: 6.8, lineHeight: 1.4, justifyContent: "center" },
  metaRotulo: { fontFamily: "Helvetica-Bold" },
  avisoTeste: { borderWidth: 0.8, borderColor: VERMELHO, color: VERMELHO, fontFamily: "Helvetica-Bold", fontSize: 7.5, textAlign: "center", paddingVertical: 2.5, marginBottom: 4 },
  marcaTeste: {
    position: "absolute",
    top: 390,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 44,
    color: VERMELHO,
    opacity: 0.09,
    transform: "rotate(-32deg)",
  },
  secao: { marginTop: 6, borderWidth: 0.8, borderColor: BORDA, borderRadius: 3 },
  secaoTitulo: { backgroundColor: AZUL, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 4, paddingHorizontal: 6, textTransform: "uppercase", letterSpacing: 0.2 },
  // Sem folga embaixo: numa quebra de página, nada do corpo sobra sozinho na página seguinte.
  secaoCorpo: { paddingTop: 5, paddingHorizontal: 5, paddingBottom: 1 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  campo: { paddingHorizontal: 3, marginBottom: 4 },
  rotulo: { fontFamily: "Helvetica-Bold", fontSize: 6.8, color: "#334155", marginBottom: 1.5 },
  valor: { fontSize: 8.3, borderWidth: 0.6, borderColor: "#cbd5e1", borderRadius: 2, paddingVertical: 2.2, paddingHorizontal: 4, minHeight: 13 },
  ausente: { color: "#6b7280" },
  tabela: { borderWidth: 0.6, borderColor: LINHA_TABELA },
  linha: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: LINHA_TABELA },
  linhaUltima: { flexDirection: "row" },
  th: { backgroundColor: CLARO, color: "#172b4d", fontFamily: "Helvetica-Bold", fontSize: 6.8, paddingVertical: 2.6, paddingHorizontal: 3.5, borderRightWidth: 0.6, borderColor: LINHA_TABELA },
  td: { fontSize: 7.4, lineHeight: 1.28, paddingVertical: 2.4, paddingHorizontal: 3.5, borderRightWidth: 0.6, borderColor: LINHA_TABELA },
  semBorda: { borderRightWidth: 0 },
  grupo: { flexDirection: "row", backgroundColor: GRUPO, borderBottomWidth: 0.6, borderColor: LINHA_TABELA },
  grupoTexto: { fontFamily: "Helvetica-Bold", fontSize: 7.2, color: AZUL, paddingVertical: 2.2, paddingHorizontal: 3.5 },
  discreto: { fontSize: 6.3, color: "#6b7280" },
  bloqueante: { fontSize: 6.3, color: VERMELHO, fontFamily: "Helvetica-Bold" },
  termos: { fontSize: 8.4, lineHeight: 1.42, textAlign: "justify" },
  paragrafo: { marginBottom: 4.5 },
  assinaturas: { flexDirection: "row", marginTop: 10, gap: 24, paddingTop: 30 },
  assinatura: { flex: 1, borderTopWidth: 0.8, borderColor: "#111", paddingTop: 4, alignItems: "center" },
  assinaturaRotulo: { fontSize: 8 },
  assinaturaNome: { fontSize: 7.2, color: "#4b5563", marginTop: 2 },
  rodape: { position: "absolute", left: 12 * MM, right: 12 * MM, bottom: 6 * MM, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderColor: "#c7d0dc", paddingTop: 3, fontSize: 6.8, color: "#4b5563" },
  anexos: { marginTop: 14, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: AZUL, paddingVertical: 4, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10, color: AZUL, letterSpacing: 0.4 },
  anexo: { marginTop: 10 },
  selo: { alignSelf: "flex-start", backgroundColor: AZUL, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginBottom: 1 },
  nota: { fontSize: 7, color: "#475569", marginBottom: 3, lineHeight: 1.3 },
  fotosGrupo: { marginTop: 8 },
  fotosTitulo: { fontFamily: "Helvetica-Bold", fontSize: 8, color: AZUL, borderBottomWidth: 0.8, borderColor: BORDA, paddingBottom: 2, marginBottom: 5 },
  fotos: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  foto: { width: "49%", height: 255, borderWidth: 0.6, borderColor: "#777", padding: 4, marginBottom: 7 },
  fotoArea: { flexGrow: 1, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#e1e5ea" },
  fotoImagem: { width: "100%", height: "100%", objectFit: "contain" },
  fotoLegenda: { fontSize: 7, marginTop: 3 },
});

const RESPOSTA: Record<string, string> = { CONFORME: "Conforme", NAO_CONFORME: "Não conforme", NAO_TESTADO: "Não testado", NAO_SE_APLICA: "Não se aplica" };
const COR_RESPOSTA: Record<string, string> = { CONFORME: "#137333", NAO_CONFORME: VERMELHO, NAO_TESTADO: "#8a5a00", NAO_SE_APLICA: "#475569" };

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const AVISO_TESTE = "DOCUMENTO DE TESTE — emitido fora do ambiente de produção, sem validade como termo oficial";

function Cabecalho({ d, titulo, meta, logo }: { d: DadosTer; titulo: string; meta: [string, string][]; logo: ImagemPdf | null }) {
  return (
    <View fixed>
      <View style={s.cabecalho}>
        <View style={s.marca}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- imagem de PDF (react-pdf), sem texto alternativo */}
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.marcaNome}>{d.empresa.nome.toLocaleUpperCase("pt-BR")}</Text>}
          <Text style={s.marcaSub}>Patrimônio de TI</Text>
        </View>
        <View style={s.titulo}>
          <Text style={s.sgq}>SISTEMA DE GESTÃO DA QUALIDADE</Text>
          <Text style={s.h1}>{titulo}</Text>
        </View>
        <View style={s.meta}>
          {meta.map(([r, v]) => (
            <Text key={r}>
              <Text style={s.metaRotulo}>{r}: </Text>
              {v}
            </Text>
          ))}
        </View>
      </View>
      {d.teste ? <Text style={s.avisoTeste}>{AVISO_TESTE}</Text> : null}
    </View>
  );
}

function Rodape({ d }: { d: DadosTer }) {
  return (
    <>
      {d.teste ? (
        <Text style={s.marcaTeste} fixed>
          DOCUMENTO DE TESTE
        </Text>
      ) : null}
      <View style={s.rodape} fixed>
        <Text>
          {d.modelo.codigo} • Revisão {d.modelo.revisao}
          {d.teste ? " • TESTE" : ""}
        </Text>
        <Text render={({ pageNumber, totalPages }) => `${d.documento} • Página ${pageNumber} de ${totalPages}`} />
      </View>
    </>
  );
}

function Secao({ titulo, children, quebra = true }: { titulo: string; children: React.ReactNode; quebra?: boolean }) {
  return (
    <View style={s.secao} wrap={quebra}>
      <Text style={s.secaoTitulo} minPresenceAhead={36}>
        {titulo}
      </Text>
      <View style={s.secaoCorpo}>{children}</View>
    </View>
  );
}

function Campo({ rotulo, valor, largura }: { rotulo: string; valor: string | null | undefined; largura: string }) {
  return (
    <View style={[s.campo, { width: largura }]} wrap={false}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={valor ? s.valor : [s.valor, s.ausente]}>{valor || "Não informado"}</Text>
    </View>
  );
}

type Coluna = { titulo: string; largura: string };

function Cabecalhos({ colunas }: { colunas: Coluna[] }) {
  return (
    // O cabeçalho da tabela não fica sozinho no fim da página.
    <View style={s.linha} wrap={false} minPresenceAhead={18}>
      {colunas.map((c, i) => (
        <Text key={c.titulo} style={[s.th, { width: c.largura }, i === colunas.length - 1 ? s.semBorda : {}]}>
          {c.titulo}
        </Text>
      ))}
    </View>
  );
}

function Linha({ colunas, celulas, ultima }: { colunas: Coluna[]; celulas: React.ReactNode[]; ultima: boolean }) {
  return (
    <View style={ultima ? s.linhaUltima : s.linha} wrap={false}>
      {celulas.map((celula, i) => (
        <View key={i} style={[s.td, { width: colunas[i].largura }, i === celulas.length - 1 ? s.semBorda : {}]}>
          {typeof celula === "string" ? <Text>{celula}</Text> : celula}
        </View>
      ))}
    </View>
  );
}

function Tabela({ colunas, linhas, vazia }: { colunas: Coluna[]; linhas: React.ReactNode[][]; vazia: string }) {
  return (
    <View style={s.tabela}>
      <Cabecalhos colunas={colunas} />
      {linhas.length ? (
        linhas.map((l, n) => <Linha key={n} colunas={colunas} celulas={l} ultima={n === linhas.length - 1} />)
      ) : (
        <View style={s.linhaUltima}>
          <Text style={[s.td, s.semBorda, s.ausente, { width: "100%" }]}>{vazia}</Text>
        </View>
      )}
    </View>
  );
}

const COLUNAS_CHECKLIST: Coluna[] = [
  { titulo: "Critério", largura: "56%" },
  { titulo: "Resultado", largura: "13%" },
  { titulo: "Justificativa / observação", largura: "31%" },
];

/**
 * Checklist na ordem histórica das respostas, com o grupo técnico registrado em cada pergunta
 * como cabeçalho (repetido só quando o grupo muda). Versão e "bloqueante" aparecem discretos.
 */
function Checklist({ e }: { e: EquipamentoTer }) {
  const itens = [
    ...e.respostas.map((r) => ({ ...r, respondida: true as const })),
    ...e.semResposta.map((r) => ({ ...r, respondida: false as const, resposta: "", justificativa: null, observacao: null, bloqueante: false })),
  ];
  if (!itens.length) {
    return (
      <View style={s.tabela}>
        <Cabecalhos colunas={COLUNAS_CHECKLIST} />
        <Text style={[s.td, s.semBorda, s.ausente]}>Nenhuma resposta registrada.</Text>
      </View>
    );
  }
  const linha = (x: (typeof itens)[number], n: number) => (
    <Linha
      key={n}
      colunas={COLUNAS_CHECKLIST}
      ultima={n === itens.length - 1}
      celulas={[
                <Text key="p">
                  {x.pergunta}
                  {x.bloqueante ? <Text style={s.bloqueante}>{"  "}BLOQUEANTE</Text> : null}
                  {x.versao ? <Text style={s.discreto}>{"  "}v{x.versao}</Text> : null}
                </Text>,
                x.respondida ? (
                  <Text key="r" style={{ color: COR_RESPOSTA[x.resposta] ?? TEXTO, fontFamily: "Helvetica-Bold" }}>
                    {RESPOSTA[x.resposta] ?? x.resposta}
                  </Text>
                ) : (
                  <Text key="r" style={s.ausente}>
                    Não respondida
                  </Text>
                ),
        x.respondida ? [x.justificativa, x.observacao].filter(Boolean).join(" — ") || "—" : "Pergunta opcional deixada sem resposta.",
      ]}
    />
  );
  // Trechos consecutivos do mesmo grupo (a ordem das respostas não muda); o título do grupo
  // fica sempre junto da primeira pergunta dele.
  const trechos: { grupo: string; inicio: number; fim: number }[] = [];
  itens.forEach((x, n) => {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.grupo === x.grupo) ultimo.fim = n;
    else trechos.push({ grupo: x.grupo, inicio: n, fim: n });
  });
  return (
    <View style={s.tabela}>
      <Cabecalhos colunas={COLUNAS_CHECKLIST} />
      {trechos.map((t) => (
        <View key={t.inicio}>
          <View wrap={false}>
            {t.grupo ? (
              <View style={s.grupo}>
                <Text style={s.grupoTexto}>{t.grupo}</Text>
              </View>
            ) : null}
            {linha(itens[t.inicio], t.inicio)}
          </View>
          {itens.slice(t.inicio + 1, t.fim + 1).map((x, i) => linha(x, t.inicio + 1 + i))}
        </View>
      ))}
    </View>
  );
}

function Anexo({ d, e }: { d: DadosTer; e: EquipamentoTer }) {
  return (
    <View style={s.anexo}>
      {/* O selo e a identificação não se separam (o anexo nunca começa sozinho no fim da página). */}
      <View wrap={false}>
      <Text style={s.selo}>
        ANEXO {e.anexo} DE {d.equipamentos.length} — {e.identificador}
      </Text>
      <Secao titulo="Identificação do equipamento" quebra={false}>
        <View style={s.grade}>
          <Campo rotulo="Identificador" valor={e.identificador} largura="25%" />
          {e.patrimonio ? <Campo rotulo="Patrimônio" valor={e.patrimonio} largura="25%" /> : null}
          <Campo rotulo="Categoria" valor={e.categoria} largura="25%" />
          <Campo rotulo="Número de série" valor={e.numeroSerie} largura={e.patrimonio ? "25%" : "50%"} />
          <Campo rotulo="Descrição" valor={e.descricao} largura="50%" />
          <Campo rotulo="Marca" valor={e.marca} largura="20%" />
          <Campo rotulo="Modelo" valor={e.modelo} largura="30%" />
          {e.especificacao ? <Campo rotulo="Especificação" valor={e.especificacao} largura="100%" /> : null}
          <Campo rotulo="Condição na entrega" valor={e.condicao} largura={e.vinculo ? "25%" : "50%"} />
          <Campo rotulo="Local de alocação" valor={null} largura={e.vinculo ? "25%" : "50%"} />
          {e.vinculo ? <Campo rotulo="Vínculo" valor={e.vinculo} largura="50%" /> : null}
          <Campo rotulo="Empresa proprietária" valor={`${e.proprietaria.nome} (CNPJ ${e.proprietaria.cnpj})`} largura={e.aluguel ? "50%" : "100%"} />
          {e.aluguel ? <Campo rotulo="Uso autorizado por aluguel" valor={`${e.aluguel.locataria}, desde ${e.aluguel.inicio}`} largura="50%" /> : null}
          <Campo rotulo="Estado de conservação / avarias preexistentes" valor={e.avarias.length ? e.avarias.join("\n") : "Sem avarias ou ressalvas registradas na inspeção."} largura="100%" />
        </View>
      </Secao>
      </View>
      <Secao titulo="Checklist de recebimento e conservação">
        <Text style={s.nota}>
          Inspeção {e.inspecao.numero} ({e.inspecao.tipo}){e.inspecao.concluidaEm ? `, concluída em ${dataHora(e.inspecao.concluidaEm)}` : ""}
          {e.inspecao.responsavel ? ` por ${e.inspecao.responsavel}` : ""} — resultado: {e.inspecao.resultado}. {e.verificacao.modo} em {dataHora(e.verificacao.verificadaEm)} por {e.verificacao.responsavel}.
        </Text>
        <Checklist e={e} />
        {e.inspecao.observacoes ? <Text style={[s.nota, { marginTop: 4, marginBottom: 0 }]}>Observações da inspeção: {e.inspecao.observacoes}</Text> : null}
      </Secao>
      <Secao titulo="Acessórios inclusos" quebra={false}>
        <Tabela
          vazia="Nenhum acessório registrado nesta entrega."
          colunas={[
            { titulo: "Acessório", largura: "28%" },
            { titulo: "Qtd.", largura: "8%" },
            { titulo: "Identificação / série", largura: "42%" },
            { titulo: "Estado", largura: "22%" },
          ]}
          linhas={e.acessorios.map((a) => [a.nome, String(a.quantidade), a.identificacao, a.estado])}
        />
      </Secao>
    </View>
  );
}

function DocumentoTer({ d, r }: { d: DadosTer; r: RecursosTer }) {
  const metaColaborador: [string, string][] = [
    ["Documento", d.documento],
    ["Colaborador", d.colaborador.nome],
  ];
  const comFotos = d.equipamentos.filter((e) => e.fotos.length);
  return (
    <Document title={d.documento} author="Portal TI Vallur" subject={`${d.modelo.titulo} ${d.numero} v${d.versao}`} creator="Portal TI Vallur" producer="Portal TI Vallur" language="pt-BR">
      {/* Termo: identificação, empresa e colaborador, resumo, declarações, observações e assinaturas, em sequência */}
      <Page size="A4" style={s.pagina}>
        <Cabecalho
          d={d}
          logo={r.logo}
          titulo={d.modelo.titulo}
          meta={[
            ["Modelo", d.modelo.codigo],
            ["Revisão", d.modelo.revisao],
            ["Documento", d.documento],
            ["Emissão", dataHora(d.emitidoEm)],
          ]}
        />
        <Secao titulo="Identificação do documento" quebra={false}>
          <View style={s.grade}>
            <Campo rotulo="Nome do documento" valor={d.documento} largura="66.66%" />
            <Campo rotulo="Data e hora da entrega" valor={dataHora(d.entrega.entregueEm)} largura="33.33%" />
            <Campo rotulo="Número do TER" valor={`${d.numero} (versão ${d.versao})`} largura="33.33%" />
            <Campo rotulo="Alocação" valor={d.entrega.alocacao} largura="33.33%" />
            <Campo rotulo="Evento de entrega" valor={d.entrega.tipo} largura="33.33%" />
          </View>
        </Secao>
        <Secao titulo="Dados da empresa e do colaborador" quebra={false}>
          <View style={s.grade}>
            <Campo rotulo="Empresa responsável" valor={d.empresa.nome} largura="50%" />
            <Campo rotulo="CNPJ" valor={d.empresa.cnpj} largura="50%" />
            <Campo rotulo="Colaborador" valor={d.colaborador.nome} largura="50%" />
            <Campo rotulo="Matrícula" valor={d.colaborador.matricula} largura="25%" />
            <Campo rotulo="CPF" valor={formatarCpf(r.cpf)} largura="25%" />
            <Campo rotulo="Função" valor={d.colaborador.cargo} largura="33.33%" />
            <Campo rotulo="Departamento" valor={d.colaborador.departamento} largura="33.33%" />
            <Campo rotulo="Gestor" valor={d.colaborador.gestor} largura="33.33%" />
            <Campo rotulo="Responsável pela entrega" valor={d.entrega.responsavelTi} largura="100%" />
          </View>
        </Secao>
        <Secao titulo="Resumo dos equipamentos">
          <Tabela
            vazia="Nenhum equipamento."
            colunas={[
              { titulo: "Anexo", largura: "7%" },
              { titulo: "Identificador", largura: "14%" },
              { titulo: "Patrimônio", largura: "13%" },
              { titulo: "Categoria", largura: "16%" },
              { titulo: "Descrição / modelo", largura: "22%" },
              { titulo: "Nº de série", largura: "15%" },
              { titulo: "Condição", largura: "13%" },
            ]}
            linhas={d.equipamentos.map((e) => [
              String(e.anexo),
              e.identificador,
              e.patrimonio ?? "—",
              e.categoria,
              e.acompanha ? `${e.descricao} — acompanha ${e.acompanha.identificador}` : e.descricao,
              e.numeroSerie ?? "—",
              e.condicao,
            ])}
          />
        </Secao>
        <Secao titulo="Declarações">
          <View style={s.termos}>
            {d.modelo.declaracoes.map((p, i) => (
              <Text key={i} style={s.paragrafo} orphans={2} widows={2}>
                {p}
              </Text>
            ))}
          </View>
        </Secao>
        <Secao titulo="Observações gerais" quebra={false}>
          <Text style={d.entrega.observacoes ? undefined : s.ausente}>{d.entrega.observacoes || "Sem observações."}</Text>
        </Secao>
        {/* Espaço da assinatura eletrônica: emitir o documento não significa que ele foi assinado. */}
        <View style={s.assinaturas} wrap={false}>
          <View style={s.assinatura}>
            <Text style={s.assinaturaRotulo}>Assinatura eletrônica do colaborador</Text>
            <Text style={s.assinaturaNome}>{d.colaborador.nome}</Text>
          </View>
          <View style={s.assinatura}>
            <Text style={s.assinaturaRotulo}>Responsável pela entrega / conferência</Text>
            <Text style={s.assinaturaNome}>{d.entrega.responsavelTi}</Text>
          </View>
        </View>
        {/* Anexos de equipamento: em seguida, no mesmo fluxo, um após o outro */}
        {d.equipamentos.length ? (
          <Text style={s.anexos} minPresenceAhead={220}>
            {d.equipamentos.length === 1 ? "ANEXO DE EQUIPAMENTO" : `ANEXOS DE EQUIPAMENTOS (${d.equipamentos.length})`}
          </Text>
        ) : null}
        {d.equipamentos.map((e) => (
          <Anexo key={e.ativoId} d={d} e={e} />
        ))}
        <Rodape d={d} />
      </Page>

      {/* Evidências fotográficas, só quando existem (proporção preservada) */}
      {comFotos.length ? (
        <Page size="A4" style={s.pagina}>
          <Cabecalho d={d} logo={r.logo} titulo="EVIDÊNCIAS FOTOGRÁFICAS" meta={[...metaColaborador, ["Fotos", String(comFotos.reduce((t, e) => t + e.fotos.length, 0))]]} />
          {comFotos.map((e) => (
            <View key={e.ativoId} style={s.fotosGrupo}>
              <Text style={s.fotosTitulo} minPresenceAhead={260}>
                Anexo {e.anexo} — {e.identificador} · {e.fotos.length} foto(s)
              </Text>
              <View style={s.fotos}>
                {e.fotos.map((f) => {
                  const imagem = r.fotos.get(f.id);
                  return (
                    <View key={f.id} style={s.foto} wrap={false}>
                      <View style={s.fotoArea}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- imagem de PDF (react-pdf), descrita pela legenda */}
                        {imagem ? <Image src={imagem} style={s.fotoImagem} /> : <Text style={s.ausente}>Imagem indisponível no armazenamento.</Text>}
                      </View>
                      <Text style={s.fotoLegenda}>{f.legenda}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          <Rodape d={d} />
        </Page>
      ) : null}
    </Document>
  );
}

/** PDF pronto e o número de páginas. */
export async function renderizarTer(d: DadosTer, r: RecursosTer): Promise<{ pdf: Buffer; paginas: number }> {
  const pdf = await renderToBuffer(<DocumentoTer d={d} r={r} />);
  const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  return { pdf, paginas };
}
