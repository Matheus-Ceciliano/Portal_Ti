# vallur-ti-portal

Portal TI do Grupo Vallur.

> **Status (15/10/2026):** Etapa 1 iniciada: aplicação Next.js executável localmente, com autenticação própria
> (Better Auth 1.7.7 + Argon2id), ativação segura da senha inicial, RBAC no servidor, painéis com dados fictícios e
> integrações Microsoft 365/Teams **somente simuladas**. Decisões da TI DT-01 a DT-07 aplicadas.

## Como executar (desenvolvimento, sem Docker)

Requisitos: Node.js 24. O PostgreSQL 17 roda a partir de binários locais (`embedded-postgres`).

```bash
npm install
npm run preparar     # gera .env local com segredos aleatórios (não sobrescreve)
npm run db           # terminal 1: PostgreSQL local em localhost:54329 (manter aberto)
npm run db:migrar    # terminal 2: aplica as migrações
npm run db:seed      # dados fictícios; mostra UMA vez as senhas iniciais e códigos de ativação
npm run dev          # http://localhost:3000
```

Para recomeçar do zero: `npm run db:reset` (apaga o banco de **desenvolvimento**; execute você mesmo).

Verificações: `npm run lint`, `npm run typecheck`, `npm test` (unitários + integração no banco de teste) e
`npm run test:e2e` (Playwright com o Google Chrome instalado; sobe um servidor próprio na porta 3100).

## Estrutura

```
vallur-ti-portal/
├── CLAUDE.md                      # Instruções e diretrizes de UI/UX para o Claude Code
├── .mcp.json                      # Servidor MCP do shadcn/ui (escopo do projeto)
├── scripts/
│   └── verificar-repositorio.ps1  # Verificação de arquivos sensíveis antes de commits
└── docs/
    ├── plano-mestre/              # Plano Mestre v1.2 (fonte da verdade; o PDF é a v1.1, desatualizado)
    ├── ARQUITETURA_TECNICA.md     # Decisões (DA-nn, DT-nn), riscos (R-nn), questões (Q-nn)
    ├── MODELO_DE_DADOS.md
    ├── INTEGRACOES.md
    ├── PERMISSOES_RBAC.md
    ├── DESIGN_SYSTEM.md
    ├── PLANO_DE_IMPLEMENTACAO.md  # Etapas e pontos de aprovação de etapa (A-00 a A-08)
    ├── REVISAO_FINAL_FASE_01.md   # Revisão final da Fase 01 e atualização consolidada (§14)
    ├── AMBIENTES.md               # Etapa 0: ambientes e estação de desenvolvimento
    ├── SEGURANCA_REPOSITORIO.md   # Etapa 0: auditoria e controles do repositório
    └── CHECKLIST_ETAPA_0.md       # Etapa 0: prontidão para a A-01
```

## Arquivos que não são versionados

As planilhas da TI (`docs/SGSI/`, `docs/Inventário/`, `docs/dISTRIBUIÇÃO DE CUSTOS/`) e os modelos `TER - TDV/` contêm dados pessoais e credenciais. Eles estão no `.gitignore` e ficam apenas na cópia local até a TI produzir versões sanitizadas (riscos R-21 e R-23 em `docs/ARQUITETURA_TECNICA.md`).

## Próximos passos

1. A TI aprova por escrito as decisões de arquitetura revistas (DA-02, DA-03, DA-04, DA-08, DA-09 e DA-22) e as novas (DA-24 a DA-27), e responde às questões que bloqueiam a Etapa 1 (`docs/REVISAO_FINAL_FASE_01.md` §14).
2. Concluir a Etapa 0: primeiro commit e repositório privado, Docker e projeto Supabase de homologação, todos com autorização (`docs/CHECKLIST_ETAPA_0.md`).
3. Etapa 1 (fundação), somente após a aprovação A-01.
