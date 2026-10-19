/**
 * DADOS FICTÍCIOS de chamados e tutoriais, em memória até os módulos correspondentes
 * existirem. O inventário, as alocações e os termos já estão no banco (ver inventario.ts).
 */
import { PESSOA, PESSOAS } from "./cadastros";

const p = (i: number) => PESSOAS[i].id;

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
