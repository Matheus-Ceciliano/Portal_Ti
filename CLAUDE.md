# Portal TI Vallur (`vallur-ti-portal`)

Portal interno de TI do Grupo Vallur.

## Fonte da verdade

- **Plano Mestre**: `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md`, versão 1.2. Regras de negócio, permissões, fluxos e identidade visual vêm dele. O PDF da mesma pasta é a versão 1.1 e está **desatualizado**; prevalece o `.md`.
- **Decisões da TI posteriores à A-00** (`DT-01` a `DT-07`, 15/10/2026, registradas em `docs/ARQUITETURA_TECNICA.md` §16.2): o portal tem **autenticação própria** (sem login Microsoft/SSO, sem ROPC, sem sincronizar senhas, sem Supabase Auth); a senha inicial é definida pela TI no cadastro; **não há aprovação hierárquica** em nenhum provisionamento (confirmação explícita, permissão no backend e auditoria continuam obrigatórias); Supervisor TI e Gestor ADM têm autoridade equivalente e experiências de interface diferentes; o Estagiário TI só provisiona com permissão individual e nunca altera perfis, permissões ou regras de segurança.
- Não invente regras de negócio, permissões, fluxos ou tokens de design que não estejam no Plano Mestre ou em decisão aprovada da TI. Pergunte.
- Documentos da Fase 01 (propostas, aguardando a aprovação A-00): `docs/ARQUITETURA_TECNICA.md` (decisões `DA-nn`, riscos `R-nn`, questões `Q-nn`), `docs/MODELO_DE_DADOS.md`, `docs/INTEGRACOES.md`, `docs/PERMISSOES_RBAC.md`, `docs/DESIGN_SYSTEM.md`, `docs/PLANO_DE_IMPLEMENTACAO.md` e `docs/REVISAO_FINAL_FASE_01.md`. Nenhuma etapa começa sem a aprovação anterior.
- A Skill `vallur-design-system` será criada a partir do Plano Mestre, e não antes.

## Segurança do repositório

- Não versionar materiais da TI com dados pessoais ou credenciais (planilhas em `docs/SGSI/`, `docs/Inventário/`, `docs/dISTRIBUIÇÃO DE CUSTOS/` e os modelos em `TER - TDV/`). Não abrir nem reproduzir seu conteúdo sem necessidade; nunca usar `git add -f` neles.
- O tenant Microsoft 365 Virta é de produção: nenhuma operação real (criar, alterar ou excluir usuários, grupos, licenças ou caixas) sem autorização explícita da TI (Q-09), nem leitura de dados reais do tenant a partir de ambiente não produtivo (Q-34).

## Stack de interface

- React + Tailwind CSS + componentes shadcn/ui (o MCP `shadcn` está configurado em `.mcp.json`).
- Os demais detalhes da stack vêm do Plano Mestre (§15): Next.js (App Router), TypeScript, Prisma, PostgreSQL (Supabase inicialmente), autenticação própria do portal (biblioteca proposta em `docs/ARQUITETURA_TECNICA.md`, DA-24) e Microsoft Entra ID/Graph somente para as integrações. As versões propostas estão em `docs/ARQUITETURA_TECNICA.md` §13.3.1.

## Diretrizes obrigatórias de UI/UX

O Portal TI Vallur deve ter aparência de software corporativo premium, com foco em eficiência operacional, consistência, acessibilidade e facilidade de uso.

Antes de criar ou modificar uma tela:

1. Consultar as Skills `frontend-design`, `ui-ux-pro-max` e `vallur-design-system`, quando disponíveis.
2. Seguir a identidade visual definida no documento mestre do projeto.
3. Priorizar interfaces adequadas a sistemas administrativos, evitando o visual genérico de dashboards produzidos automaticamente por IA.
4. Utilizar componentes reutilizáveis baseados em shadcn/ui, Tailwind CSS e React.
5. Padronizar tipografia, espaçamento, cores, ícones, tabelas, botões, formulários, estados e mensagens.
6. Construir interfaces totalmente responsivas para desktop, tablet e celular.
7. Considerar acessibilidade, contraste, navegação por teclado e estados de foco.
8. Criar formulários claros, com validações, mensagens de erro e prevenção de ações acidentais.
9. Em tabelas administrativas, oferecer filtros, busca, ordenação, paginação e ações contextuais quando necessário.
10. Não adicionar gradientes chamativos, glassmorphism, animações excessivas ou elementos meramente decorativos.
11. Testar as funcionalidades e realizar revisão visual utilizando Playwright antes de considerar a tela concluída.
12. Não modificar regras de negócio, permissões ou fluxos definidos no Plano Mestre apenas para simplificar a interface.

Cada tela deve parecer parte do mesmo produto, mantendo o padrão visual e funcional do Grupo Vallur.

## Verificação de telas

- Revisão visual e funcional: MCP `playwright`, testando nas larguras obrigatórias de celular (375 e 390), tablet (768) e desktop (1440).
- Console, rede e performance: MCP `chrome-devtools`.
- Os scripts Python da skill `webapp-testing` são opcionais e exigem `pip install playwright`.
