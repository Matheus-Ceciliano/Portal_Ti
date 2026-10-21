/**
 * Catálogo de permissões versionado em código (PERMISSOES_RBAC.md §3 e §3.9).
 * Supervisor TI e Gestor ADM têm conjuntos idênticos (Q-07, DT-05).
 * O Estagiário só recebe provisionamento com concessão individual (DT-07).
 */

export const PERFIS_TI = ["ESTAGIARIO_TI", "SUPERVISOR_TI", "GESTOR_ADM"] as const;
export type PerfilTi = (typeof PERFIS_TI)[number];
export const PERFIS_ADMINISTRATIVOS: readonly PerfilTi[] = ["SUPERVISOR_TI", "GESTOR_ADM"];

export const ROTULO_PERFIL: Record<PerfilTi | "COLABORADOR", string> = {
  COLABORADOR: "Colaborador",
  ESTAGIARIO_TI: "Estagiário TI",
  SUPERVISOR_TI: "Supervisor TI",
  GESTOR_ADM: "Gestor ADM",
};

type Definicao = {
  descricao: string;
  /** Concedível individualmente a quem tem perfil de TI (marca "I" da matriz). */
  concedivel?: boolean;
};

export const CATALOGO = {
  "portal.acessar": { descricao: "Acessar o portal do colaborador" },
  "ti.acessar": { descricao: "Acessar a área de TI" },
  "dashboard.ver": { descricao: "Ver o painel operacional ou gerencial" },
  "relatorio.ver": { descricao: "Ver relatórios" },
  "relatorio.exportar": { descricao: "Exportar relatórios", concedivel: true },
  "empresa.ver": { descricao: "Ver empresas" },
  "empresa.gerenciar": { descricao: "Gerenciar empresas", concedivel: true },
  "catalogo.gerenciar": { descricao: "Gerenciar catálogos", concedivel: true },
  "catalogo.gerenciar_grupos": { descricao: "Gerenciar o catálogo de grupos permitidos" },
  "colaborador.ver": { descricao: "Ver colaboradores" },
  "colaborador.criar": { descricao: "Cadastrar colaboradores" },
  "colaborador.editar": { descricao: "Editar colaboradores sem perfil de TI" },
  "colaborador.editar_equipe_ti": { descricao: "Editar dados de membros da TI" },
  "colaborador.vinculo_registrar": { descricao: "Registrar transferências e mudanças de cargo" },
  "colaborador.cpf_revelar": { descricao: "Revelar CPF" },
  "colaborador.vincular_identidade": { descricao: "Vincular identidade Microsoft" },
  "carga.importar": { descricao: "Importar carga inicial", concedivel: true },
  "solicitacao.ver": { descricao: "Ver solicitações" },
  "execucao.ver": { descricao: "Ver execuções" },
  "solicitacao.criar": { descricao: "Criar rascunho de solicitação" },
  "solicitacao.editar": { descricao: "Editar rascunho de solicitação" },
  "solicitacao.cancelar": { descricao: "Cancelar solicitação" },
  "provisionamento.executar": { descricao: "Confirmar e executar provisionamento", concedivel: true },
  "execucao.reprocessar": { descricao: "Reprocessar execução com falha", concedivel: true },
  "tarefa_manual.ver": { descricao: "Ver tarefas manuais" },
  "tarefa_manual.assumir": { descricao: "Assumir tarefas manuais" },
  "tarefa_manual.concluir": { descricao: "Concluir tarefas manuais" },
  "licenca.ver": { descricao: "Ver licenças Microsoft 365" },
  "grupo.ver": { descricao: "Ver grupos Microsoft 365" },
  "caixa_compartilhada.ver": { descricao: "Ver caixas compartilhadas" },
  "licenca.sincronizar": { descricao: "Sincronizar SKUs (somente leitura no tenant)" },
  "ativo.ver": { descricao: "Ver ativos" },
  "ativo.criar": { descricao: "Cadastrar ativos" },
  "ativo.editar": { descricao: "Editar ativos" },
  "ativo.transicionar": { descricao: "Mudar a situação de ativos" },
  "ativo.baixar": { descricao: "Dar baixa em ativos" },
  "estoque.movimentar": { descricao: "Movimentar estoque" },
  "alocacao.criar": { descricao: "Criar alocação" },
  "alocacao.confirmar_entrega": { descricao: "Confirmar entrega" },
  "alocacao.cancelar": { descricao: "Cancelar alocação" },
  "devolucao.registrar": { descricao: "Registrar devolução" },
  "evidencia.enviar": { descricao: "Enviar evidências" },
  "evidencia.ver": { descricao: "Ver evidências" },
  "termo.emitir": { descricao: "Emitir TER/TDV" },
  "termo.cancelar": { descricao: "Cancelar ou substituir termo" },
  "termo.anexar_assinado": { descricao: "Anexar termo assinado" },
  "termo.enviar": { descricao: "Registrar envio e reenvio do termo para assinatura" },
  "termo.conferir_assinatura": { descricao: "Conferir a assinatura do termo", concedivel: true },
  "termo.modelo_gerenciar": { descricao: "Gerenciar modelos documentais" },
  "termo.ver": { descricao: "Ver termos" },
  "termo.baixar": { descricao: "Baixar termos" },
  "termo.disponibilizar": { descricao: "Disponibilizar termo ao colaborador" },
  "chamado.criar": { descricao: "Abrir chamados" },
  "chamado.ver": { descricao: "Ver chamados" },
  "chamado.comentar": { descricao: "Comentar chamados" },
  "chamado.comentar_interno": { descricao: "Comentar internamente" },
  "chamado.ver_interno": { descricao: "Ver comentários internos" },
  "chamado.atender": { descricao: "Atender chamados" },
  "chamado.anexar": { descricao: "Anexar arquivos a chamados" },
  "chamado.vincular_ativo": { descricao: "Vincular ativo a chamado" },
  "sla.configurar": { descricao: "Configurar SLA", concedivel: true },
  "tutorial.ver": { descricao: "Ver tutoriais" },
  "tutorial.gerenciar": { descricao: "Gerenciar tutoriais" },
  "tutorial.publicar": { descricao: "Publicar tutoriais" },
  "auditoria.ver": { descricao: "Consultar auditoria" },
  "auditoria.exportar": { descricao: "Exportar auditoria", concedivel: true },
  "perfil.ver": { descricao: "Ver perfis" },
  "permissao_individual.ver": { descricao: "Ver permissões individuais" },
  "perfil.atribuir": { descricao: "Atribuir perfis" },
  "perfil.revogar": { descricao: "Revogar perfis" },
  "permissao_individual.gerenciar": { descricao: "Conceder e revogar permissões individuais" },
  "integracao.ver": { descricao: "Ver estado das integrações" },
  "integracao.configurar": { descricao: "Configurar integrações", concedivel: true },
  "conta_acesso.ver": { descricao: "Ver contas de acesso" },
  "conta_acesso.criar": { descricao: "Criar conta de acesso com senha inicial" },
  "conta_acesso.redefinir_senha": { descricao: "Redefinir senha de outra pessoa" },
  "conta_acesso.bloquear": { descricao: "Bloquear conta de acesso" },
  "conta_acesso.desbloquear": { descricao: "Desbloquear conta de acesso" },
  "conta_acesso.encerrar_sessoes": { descricao: "Encerrar sessões de outra pessoa" },
  "conta_acesso.redefinir_mfa": { descricao: "Redefinir MFA" },
  "conta.gerenciar_propria": { descricao: "Gerenciar a própria conta" },
  "seguranca.configurar": { descricao: "Configurar regras de segurança" },
  "teams.regra_gerenciar": { descricao: "Gerenciar regras do Teams" },
  "desligamento.executar": { descricao: "Executar desligamento", concedivel: true },
} as const satisfies Record<string, Definicao>;

export type Permissao = keyof typeof CATALOGO;
export const TODAS_PERMISSOES = Object.keys(CATALOGO) as Permissao[];

export function ehConcedivel(permissao: string): permissao is Permissao {
  return permissao in CATALOGO && (CATALOGO[permissao as Permissao] as Definicao).concedivel === true;
}

/** Permissões do perfil implícito Colaborador, sempre com escopo PROPRIO. */
export const PERMISSOES_COLABORADOR: readonly Permissao[] = [
  "portal.acessar",
  "colaborador.ver",
  "ativo.ver",
  "evidencia.ver",
  "termo.ver",
  "termo.baixar",
  // Só nos próprios TERs, pelo Portal do Colaborador (escopo PROPRIO; a TI confere a assinatura).
  "termo.anexar_assinado",
  "chamado.criar",
  "chamado.ver",
  "chamado.comentar",
  "chamado.anexar",
  "chamado.vincular_ativo",
  "tutorial.ver",
  "conta.gerenciar_propria",
];

const PERMISSOES_ESTAGIARIO: readonly Permissao[] = [
  "portal.acessar",
  "ti.acessar",
  "dashboard.ver",
  "relatorio.ver",
  "empresa.ver",
  "colaborador.ver",
  "colaborador.criar",
  "colaborador.editar",
  "colaborador.vinculo_registrar",
  "colaborador.cpf_revelar",
  "solicitacao.ver",
  "execucao.ver",
  "solicitacao.criar",
  "solicitacao.editar",
  "solicitacao.cancelar",
  "tarefa_manual.ver",
  "tarefa_manual.assumir",
  "tarefa_manual.concluir",
  "licenca.ver",
  "grupo.ver",
  "caixa_compartilhada.ver",
  "licenca.sincronizar",
  "ativo.ver",
  "ativo.criar",
  "ativo.editar",
  "ativo.transicionar",
  "ativo.baixar",
  "estoque.movimentar",
  "alocacao.criar",
  "alocacao.confirmar_entrega",
  "alocacao.cancelar",
  "devolucao.registrar",
  "evidencia.enviar",
  "evidencia.ver",
  "termo.emitir",
  "termo.cancelar",
  "termo.anexar_assinado",
  "termo.enviar",
  "termo.ver",
  "termo.baixar",
  "termo.disponibilizar",
  "chamado.criar",
  "chamado.ver",
  "chamado.comentar",
  "chamado.comentar_interno",
  "chamado.ver_interno",
  "chamado.atender",
  "chamado.anexar",
  "chamado.vincular_ativo",
  "tutorial.ver",
  "tutorial.gerenciar",
  "tutorial.publicar",
  "auditoria.ver",
  "perfil.ver",
  "permissao_individual.ver",
  "integracao.ver",
  "conta_acesso.ver",
  "conta_acesso.criar",
  "conta_acesso.redefinir_senha",
  "conta_acesso.bloquear",
  "conta_acesso.desbloquear",
  "conta_acesso.encerrar_sessoes",
  "conta.gerenciar_propria",
  "teams.regra_gerenciar",
];

/** Perfis administrativos: todas as permissões do catálogo, com conjuntos idênticos. */
const PERMISSOES_ADMINISTRATIVAS: readonly Permissao[] = TODAS_PERMISSOES;

export const MATRIZ: Record<PerfilTi, ReadonlySet<Permissao>> = {
  ESTAGIARIO_TI: new Set(PERMISSOES_ESTAGIARIO),
  SUPERVISOR_TI: new Set(PERMISSOES_ADMINISTRATIVAS),
  GESTOR_ADM: new Set(PERMISSOES_ADMINISTRATIVAS),
};

/** Restrições obrigatórias sempre aplicadas a quem não é administrativo ou é Estagiário (§3.10, itens 1–5 e 7). */
export const RESTRITAS_SEMPRE: ReadonlySet<Permissao> = new Set<Permissao>([
  "perfil.atribuir",
  "perfil.revogar",
  "permissao_individual.gerenciar",
  "colaborador.vincular_identidade",
  "seguranca.configurar",
  "conta_acesso.redefinir_mfa",
  "catalogo.gerenciar_grupos",
  "colaborador.editar_equipe_ti",
]);

/** Restrições que dependem do alvo (§3.10, item 6). Sem alvo informado, a permissão é negada. */
export const RESTRITAS_POR_ALVO: ReadonlySet<Permissao> = new Set<Permissao>([
  "conta_acesso.criar",
  "conta_acesso.redefinir_senha",
  "conta_acesso.bloquear",
  "conta_acesso.desbloquear",
  "conta_acesso.encerrar_sessoes",
  "desligamento.executar",
  "provisionamento.executar",
  "execucao.reprocessar",
]);

/** Também restritas quando o alvo é o próprio ator (autoprovisionamento). */
export const AUTOPROVISIONAMENTO: ReadonlySet<Permissao> = new Set<Permissao>([
  "provisionamento.executar",
  "execucao.reprocessar",
]);
