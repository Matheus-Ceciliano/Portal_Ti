/**
 * DADOS FICTÍCIOS de desenvolvimento. Nomes, e-mails (domínio reservado .test),
 * CNPJs e patrimônios são inventados. Nada aqui vem das planilhas da TI.
 * Empresas e pessoas são gravadas no banco pelo seed; os demais conjuntos ficam em
 * memória até os módulos correspondentes existirem.
 */

export type EmpresaFicticia = { id: string; nome: string; sigla: string; cnpj: string; cidade: string };

export const EMPRESAS: EmpresaFicticia[] = [
  { id: "a1f0c7e2-0000-4000-8000-000000000001", nome: "Horizonte Engenharia Ltda.", sigla: "HZE", cnpj: "00.111.222/0001-01", cidade: "Belo Horizonte" },
  { id: "a1f0c7e2-0000-4000-8000-000000000002", nome: "Pedra Branca Construções S.A.", sigla: "PBC", cnpj: "00.111.222/0001-02", cidade: "Contagem" },
  { id: "a1f0c7e2-0000-4000-8000-000000000003", nome: "Rio Claro Infraestrutura Ltda.", sigla: "RCI", cnpj: "00.111.222/0001-03", cidade: "Uberlândia" },
  { id: "a1f0c7e2-0000-4000-8000-000000000004", nome: "Atalaia Serviços Administrativos Ltda.", sigla: "ASA", cnpj: "00.111.222/0001-04", cidade: "Belo Horizonte" },
];

export type PessoaFicticia = {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
  empresaId: string;
  perfil?: "ESTAGIARIO_TI" | "SUPERVISOR_TI" | "GESTOR_ADM";
  /** Conta de acesso criada pelo seed (as demais pessoas ficam sem conta). */
  comConta?: boolean;
};

const id = (n: number) => `b2e1d8f3-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [HZE, PBC, RCI, ASA] = EMPRESAS.map((e) => e.id);

export const PESSOAS: PessoaFicticia[] = [
  { id: id(1), nome: "Helena Prado", email: "helena.prado@vallur.test", cargo: "Supervisora de TI", departamento: "Tecnologia da Informação", empresaId: ASA, perfil: "SUPERVISOR_TI", comConta: true },
  { id: id(2), nome: "Ricardo Moura", email: "ricardo.moura@vallur.test", cargo: "Gestor Administrativo", departamento: "Administração", empresaId: ASA, perfil: "GESTOR_ADM", comConta: true },
  { id: id(3), nome: "Lucas Andrade", email: "lucas.andrade@vallur.test", cargo: "Estagiário de TI", departamento: "Tecnologia da Informação", empresaId: ASA, perfil: "ESTAGIARIO_TI", comConta: true },
  { id: id(4), nome: "Ana Beatriz Souza", email: "ana.souza@vallur.test", cargo: "Analista de Planejamento", departamento: "Planejamento", empresaId: HZE, comConta: true },
  { id: id(5), nome: "Carlos Eduardo Lima", email: "carlos.lima@vallur.test", cargo: "Engenheiro Civil", departamento: "Obras", empresaId: PBC, comConta: true },
  { id: id(6), nome: "Fernanda Rocha", email: "fernanda.rocha@vallur.test", cargo: "Assistente Administrativa", departamento: "Administração", empresaId: HZE },
  { id: id(7), nome: "João Pedro Alves", email: "joao.alves@vallur.test", cargo: "Técnico de Segurança do Trabalho", departamento: "SSMA", empresaId: PBC },
  { id: id(8), nome: "Mariana Costa", email: "mariana.costa@vallur.test", cargo: "Compradora", departamento: "Suprimentos", empresaId: RCI },
  { id: id(9), nome: "Rafael Nunes", email: "rafael.nunes@vallur.test", cargo: "Encarregado de Obra", departamento: "Obras", empresaId: RCI },
  { id: id(10), nome: "Tatiane Freitas", email: "tatiane.freitas@vallur.test", cargo: "Analista Financeira", departamento: "Financeiro", empresaId: ASA },
  { id: id(11), nome: "Bruno Carvalho", email: "bruno.carvalho@vallur.test", cargo: "Almoxarife", departamento: "Suprimentos", empresaId: PBC },
  { id: id(12), nome: "Patrícia Gomes", email: "patricia.gomes@vallur.test", cargo: "Coordenadora de RH", departamento: "Recursos Humanos", empresaId: HZE },
];

export const PESSOA = {
  supervisora: PESSOAS[0],
  gestor: PESSOAS[1],
  estagiario: PESSOAS[2],
  colaboradora: PESSOAS[3],
  colaborador: PESSOAS[4],
};

export function nomeDaPessoa(pessoaId: string | null | undefined): string {
  if (!pessoaId) return "—";
  return PESSOAS.find((p) => p.id === pessoaId)?.nome ?? "Pessoa cadastrada no portal";
}
