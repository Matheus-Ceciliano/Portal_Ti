/**
 * DADOS FICTÍCIOS de inventário, chamados, termos e tutoriais. Tipados para serem
 * trocados pelos repositórios reais quando os módulos forem implementados.
 */
import { EMPRESAS, PESSOA, PESSOAS } from "./cadastros";

export type SituacaoAtivo = "EM_USO" | "DISPONIVEL" | "AGUARDANDO_ENTREGA" | "EM_MANUTENCAO" | "BAIXADO";

export type AtivoFicticio = {
  id: string;
  patrimonio: string;
  tipo: "Notebook" | "Desktop" | "Monitor" | "Celular" | "Headset" | "Kit teclado e mouse";
  modelo: string;
  numeroSerie: string;
  situacao: SituacaoAtivo;
  empresaId: string;
  responsavelId: string | null;
  desde: string;
};

const [HZE, PBC, RCI, ASA] = EMPRESAS.map((e) => e.id);
const p = (i: number) => PESSOAS[i].id;

export const ATIVOS: AtivoFicticio[] = [
  { id: "at-01", patrimonio: "VLR-004512", tipo: "Notebook", modelo: "Dell Latitude 5440", numeroSerie: "SIM-7K2P9Q1", situacao: "EM_USO", empresaId: HZE, responsavelId: p(3), desde: "2026-03-12" },
  { id: "at-02", patrimonio: "VLR-004513", tipo: "Monitor", modelo: "LG 24MP400 24\"", numeroSerie: "SIM-310ZK88", situacao: "EM_USO", empresaId: HZE, responsavelId: p(3), desde: "2026-03-12" },
  { id: "at-03", patrimonio: "VLR-004530", tipo: "Kit teclado e mouse", modelo: "Logitech MK270", numeroSerie: "SIM-MK27011", situacao: "EM_USO", empresaId: HZE, responsavelId: p(3), desde: "2026-03-12" },
  { id: "at-04", patrimonio: "VLR-004601", tipo: "Notebook", modelo: "Lenovo ThinkPad E14 Gen 6", numeroSerie: "SIM-PF4XZ02", situacao: "EM_USO", empresaId: PBC, responsavelId: p(4), desde: "2026-05-04" },
  { id: "at-05", patrimonio: "VLR-004602", tipo: "Celular", modelo: "Samsung Galaxy A35", numeroSerie: "SIM-R58W3KQ", situacao: "EM_USO", empresaId: PBC, responsavelId: p(4), desde: "2026-05-04" },
  { id: "at-06", patrimonio: "VLR-004377", tipo: "Notebook", modelo: "Dell Latitude 3540", numeroSerie: "SIM-9H1LM07", situacao: "EM_USO", empresaId: ASA, responsavelId: p(0), desde: "2025-11-18" },
  { id: "at-07", patrimonio: "VLR-004378", tipo: "Headset", modelo: "Jabra Evolve2 30", numeroSerie: "SIM-JB30A55", situacao: "EM_USO", empresaId: ASA, responsavelId: p(0), desde: "2025-11-18" },
  { id: "at-08", patrimonio: "VLR-004390", tipo: "Notebook", modelo: "Lenovo ThinkPad E14 Gen 6", numeroSerie: "SIM-PF4XZ19", situacao: "EM_USO", empresaId: ASA, responsavelId: p(1), desde: "2026-01-09" },
  { id: "at-09", patrimonio: "VLR-004644", tipo: "Notebook", modelo: "Dell Latitude 5440", numeroSerie: "SIM-7K2P9R4", situacao: "AGUARDANDO_ENTREGA", empresaId: RCI, responsavelId: p(7), desde: "2026-10-13" },
  { id: "at-10", patrimonio: "VLR-004645", tipo: "Celular", modelo: "Motorola Moto G85", numeroSerie: "SIM-ZY22H0C", situacao: "AGUARDANDO_ENTREGA", empresaId: RCI, responsavelId: p(8), desde: "2026-10-14" },
  { id: "at-11", patrimonio: "VLR-004410", tipo: "Desktop", modelo: "Dell OptiPlex 7010", numeroSerie: "SIM-OP7010B", situacao: "EM_MANUTENCAO", empresaId: PBC, responsavelId: null, desde: "2026-10-02" },
  { id: "at-12", patrimonio: "VLR-004650", tipo: "Notebook", modelo: "Dell Latitude 5440", numeroSerie: "SIM-7K2P9S8", situacao: "DISPONIVEL", empresaId: ASA, responsavelId: null, desde: "2026-09-30" },
  { id: "at-13", patrimonio: "VLR-004651", tipo: "Monitor", modelo: "Dell P2422H 24\"", numeroSerie: "SIM-P2422H3", situacao: "DISPONIVEL", empresaId: ASA, responsavelId: null, desde: "2026-09-30" },
  { id: "at-14", patrimonio: "VLR-004652", tipo: "Celular", modelo: "Samsung Galaxy A35", numeroSerie: "SIM-R58W3M1", situacao: "DISPONIVEL", empresaId: HZE, responsavelId: null, desde: "2026-09-30" },
  { id: "at-15", patrimonio: "VLR-004199", tipo: "Notebook", modelo: "Dell Latitude 3420", numeroSerie: "SIM-3420OLD", situacao: "BAIXADO", empresaId: RCI, responsavelId: null, desde: "2026-08-21" },
  { id: "at-16", patrimonio: "VLR-004588", tipo: "Notebook", modelo: "Lenovo IdeaPad 3", numeroSerie: "SIM-IDP3K21", situacao: "EM_USO", empresaId: RCI, responsavelId: p(9), desde: "2026-04-15" },
  { id: "at-17", patrimonio: "VLR-004589", tipo: "Celular", modelo: "Motorola Moto G85", numeroSerie: "SIM-ZY22G9A", situacao: "EM_USO", empresaId: PBC, responsavelId: p(10), desde: "2026-06-02" },
  { id: "at-18", patrimonio: "VLR-004590", tipo: "Notebook", modelo: "Dell Latitude 3540", numeroSerie: "SIM-9H1LN33", situacao: "EM_USO", empresaId: HZE, responsavelId: p(11), desde: "2026-02-20" },
];

export type PrioridadeChamado = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
export type EstadoChamado = "ABERTO" | "EM_ATENDIMENTO" | "AGUARDANDO_USUARIO" | "RESOLVIDO";

export type ChamadoFicticio = {
  id: string;
  numero: string;
  titulo: string;
  categoria: "Acesso" | "Equipamento" | "E-mail" | "Rede" | "Sistemas";
  prioridade: PrioridadeChamado;
  estado: EstadoChamado;
  solicitanteId: string;
  responsavelId: string | null;
  abertoEm: string;
};

export const CHAMADOS: ChamadoFicticio[] = [
  { id: "ch-01", numero: "CH-2026-0142", titulo: "Notebook não conecta à rede da obra", categoria: "Rede", prioridade: "ALTA", estado: "ABERTO", solicitanteId: p(4), responsavelId: null, abertoEm: "2026-10-15T07:52:00-03:00" },
  { id: "ch-02", numero: "CH-2026-0141", titulo: "Solicitação de acesso à pasta de projetos", categoria: "Acesso", prioridade: "MEDIA", estado: "ABERTO", solicitanteId: p(3), responsavelId: null, abertoEm: "2026-10-14T16:20:00-03:00" },
  { id: "ch-03", numero: "CH-2026-0139", titulo: "Caixa de e-mail cheia", categoria: "E-mail", prioridade: "MEDIA", estado: "EM_ATENDIMENTO", solicitanteId: p(9), responsavelId: PESSOA.estagiario.id, abertoEm: "2026-10-14T10:05:00-03:00" },
  { id: "ch-04", numero: "CH-2026-0137", titulo: "Monitor com faixas na imagem", categoria: "Equipamento", prioridade: "BAIXA", estado: "AGUARDANDO_USUARIO", solicitanteId: p(3), responsavelId: PESSOA.estagiario.id, abertoEm: "2026-10-13T14:41:00-03:00" },
  { id: "ch-05", numero: "CH-2026-0136", titulo: "Erro ao abrir o sistema de medições", categoria: "Sistemas", prioridade: "CRITICA", estado: "EM_ATENDIMENTO", solicitanteId: p(6), responsavelId: PESSOA.supervisora.id, abertoEm: "2026-10-13T09:12:00-03:00" },
  { id: "ch-06", numero: "CH-2026-0133", titulo: "Celular corporativo sem sinal de dados", categoria: "Equipamento", prioridade: "MEDIA", estado: "RESOLVIDO", solicitanteId: p(4), responsavelId: PESSOA.estagiario.id, abertoEm: "2026-10-10T11:30:00-03:00" },
  { id: "ch-07", numero: "CH-2026-0131", titulo: "Instalação do software de orçamento", categoria: "Sistemas", prioridade: "BAIXA", estado: "ABERTO", solicitanteId: p(7), responsavelId: null, abertoEm: "2026-10-09T15:02:00-03:00" },
  { id: "ch-08", numero: "CH-2026-0128", titulo: "Senha do Wi-Fi do escritório regional", categoria: "Rede", prioridade: "BAIXA", estado: "RESOLVIDO", solicitanteId: p(8), responsavelId: PESSOA.supervisora.id, abertoEm: "2026-10-08T08:47:00-03:00" },
  { id: "ch-09", numero: "CH-2026-0126", titulo: "Impressora do almoxarifado offline", categoria: "Equipamento", prioridade: "ALTA", estado: "EM_ATENDIMENTO", solicitanteId: p(10), responsavelId: PESSOA.estagiario.id, abertoEm: "2026-10-07T13:15:00-03:00" },
  { id: "ch-10", numero: "CH-2026-0122", titulo: "Acesso ao Teams da equipe de suprimentos", categoria: "Acesso", prioridade: "MEDIA", estado: "RESOLVIDO", solicitanteId: p(7), responsavelId: PESSOA.supervisora.id, abertoEm: "2026-10-06T10:00:00-03:00" },
];

export type EstadoTermo = "AGUARDANDO_ASSINATURA" | "ASSINADO" | "CANCELADO";

export type TermoFicticio = {
  id: string;
  numero: string;
  tipo: "TER" | "TDV";
  colaboradorId: string;
  ativos: string[];
  estado: EstadoTermo;
  emitidoEm: string;
  disponibilizado: boolean;
};

export const TERMOS: TermoFicticio[] = [
  { id: "tm-01", numero: "TER-2026-0088", tipo: "TER", colaboradorId: p(3), ativos: ["VLR-004512", "VLR-004513", "VLR-004530"], estado: "ASSINADO", emitidoEm: "2026-03-12", disponibilizado: true },
  { id: "tm-02", numero: "TER-2026-0102", tipo: "TER", colaboradorId: p(4), ativos: ["VLR-004601", "VLR-004602"], estado: "ASSINADO", emitidoEm: "2026-05-04", disponibilizado: true },
  { id: "tm-03", numero: "TER-2026-0131", tipo: "TER", colaboradorId: p(7), ativos: ["VLR-004644"], estado: "AGUARDANDO_ASSINATURA", emitidoEm: "2026-10-13", disponibilizado: false },
  { id: "tm-04", numero: "TER-2026-0132", tipo: "TER", colaboradorId: p(8), ativos: ["VLR-004645"], estado: "AGUARDANDO_ASSINATURA", emitidoEm: "2026-10-14", disponibilizado: false },
  { id: "tm-05", numero: "TDV-2026-0019", tipo: "TDV", colaboradorId: p(9), ativos: ["VLR-004199"], estado: "ASSINADO", emitidoEm: "2026-08-21", disponibilizado: true },
  { id: "tm-06", numero: "TDV-2026-0021", tipo: "TDV", colaboradorId: p(5), ativos: ["VLR-004410"], estado: "AGUARDANDO_ASSINATURA", emitidoEm: "2026-10-02", disponibilizado: false },
];

export type TutorialFicticio = {
  id: string;
  titulo: string;
  categoria: "Primeiros passos" | "E-mail e Teams" | "Segurança" | "Equipamentos";
  formato: "Vídeo" | "PDF" | "Artigo";
  duracao: string;
  atualizadoEm: string;
};

export const TUTORIAIS: TutorialFicticio[] = [
  { id: "tu-01", titulo: "Primeiro acesso ao notebook corporativo", categoria: "Primeiros passos", formato: "Vídeo", duracao: "4 min", atualizadoEm: "2026-09-02" },
  { id: "tu-02", titulo: "Configurar o Outlook no celular", categoria: "E-mail e Teams", formato: "PDF", duracao: "3 páginas", atualizadoEm: "2026-08-18" },
  { id: "tu-03", titulo: "Como reconhecer e-mails de phishing", categoria: "Segurança", formato: "Artigo", duracao: "6 min de leitura", atualizadoEm: "2026-09-25" },
  { id: "tu-04", titulo: "Participar de reuniões no Teams pela obra", categoria: "E-mail e Teams", formato: "Vídeo", duracao: "5 min", atualizadoEm: "2026-07-30" },
  { id: "tu-05", titulo: "Cuidados com o equipamento em campo", categoria: "Equipamentos", formato: "PDF", duracao: "2 páginas", atualizadoEm: "2026-06-11" },
  { id: "tu-06", titulo: "Configurar o aplicativo autenticador", categoria: "Segurança", formato: "Artigo", duracao: "4 min de leitura", atualizadoEm: "2026-10-01" },
];
