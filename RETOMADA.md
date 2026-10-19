# Retomada — Portal TI Vallur

**Atualizado em:** 15/10/2026, ao concluir o prompt "MELHORIA DOS DETALHES DE EMPRESAS".
**Situação:** não há prompt pendente. Todas as alterações estão só na cópia local (sem commit desde `a8be2f3`).

> Sem segredos nem dados pessoais neste arquivo. Credenciais fictícias de desenvolvimento são geradas por `npm run db:reset`.

## 1. O que foi feito (desde o último commit `a8be2f3`, ainda sem commit)

- **Redesign premium** (login, formulários, botões, saída e Empresas):
  - Fonte Plus Jakarta Sans auto-hospedada; escala de raios 6/8/10/12/16 px; sombras e animações com `prefers-reduced-motion`.
  - Componentes: `Button` (variantes + `carregando`), `Input`/`InputComIcone`, `Textarea`, `Selecao`, `CampoBusca`, `CampoSenha`, `AlertaFormulario`, diálogos, menus e abas.
  - Login, segundo fator e ativação com `CartaoAcesso`; painel institucional com prévia ilustrativa.
  - Confirmação "Sair da conta?" (`DialogoSair` + ação `encerrarSessao`).
  - Empresas: tabela com Logo, Nome da empresa, CNPJ, Pessoas ativas, Situação e Ações; cadastro/edição em diálogo; CNPJ numérico e alfanumérico validado no servidor (`src/lib/cnpj.ts`); logotipo validado pelos bytes e guardado em `.data/arquivos` (só desenvolvimento), servido por `/api/empresas/[id]/logo`.
  - Migração `prisma/migrations/20261015131551_empresa_cadastro` (responsável, observações, logo, CNPJ canônico).
- **Modal de detalhes da empresa com tamanho fixo:** 1000 × 750 px no desktop, quase tela cheia no celular; cabeçalho e abas fixos, só o conteúdo da aba rola.
- **Login:** conteúdo da coluna azul centralizado. **Logo oficial:** ícone do Grupo Vallur vetorizado (`src/components/layout/icone-vallur.tsx`) e favicon.
- **Detalhes da empresa (modal + página completa):**
  - Consultas restritas à empresa e com RBAC no servidor: `src/server/modulos/empresa-registros.ts`; ações `acaoResumoEmpresa` e `acaoRegistrosEmpresa` em `src/server/acoes/empresas.ts`.
  - Componentes compartilhados em `src/components/empresas/registros/` (barra de filtros, tabelas, resumo, anexos indisponíveis).
  - Modal reescrito (`src/components/empresas/dialogo-detalhes-empresa.tsx`): busca e filtros por aba, "Ver todos…" e "Abrir página completa".
  - Página `/ti/cadastros/empresas/[id]?tab=…` (fora do menu), com validação em `layout.tsx` (404 real). A lista foi movida para o grupo `(lista)` (mesma URL).
  - Ficha da pessoa aceita `?empresa=` para a trilha de navegação voltar à empresa.
- **Cenário E2E:** empresa fictícia "Volume Testes E2E Ltda." com 40 colaboradores, só no banco de teste.

### Verificações executadas (resultados reais)

- **Vitest:** 60/60.
- **Playwright:** suíte completa 40/40.
- **Lint e typecheck:** sem erros.

## 2. O que falta / dependências

1. **Equipamentos:** não existe tela de detalhes; as linhas levam ao inventário filtrado pelo patrimônio. Equipamentos e alocações ainda vêm de dados fictícios (`src/server/dados-ficticios/operacao.ts`).
2. **Anexos de empresa:** não há modelo nem armazenamento; a aba mostra estado de indisponível.
3. **Decidir a pasta `LOGOS/`:** está fora do Git; os PDFs têm 18–39 MB. Versionar só o necessário ou incluir no `.gitignore`.
4. **Commit/push das alterações locais:** só com autorização.
