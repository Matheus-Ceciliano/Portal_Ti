# Ambientes e padrões de desenvolvimento — Portal TI Vallur

**Etapa:** 0 — Preparação do ambiente
**Data:** 14/10/2026
**Situação:** documento de preparação. Descreve o que foi **verificado** na estação de desenvolvimento e o que está **planejado** para os ambientes. Nenhum recurso externo foi criado: nenhum projeto Supabase, nenhuma app registration, nenhum repositório remoto.
**Revisão 01.4 (15/10/2026):** ajustado à autenticação própria do portal (DT-01). O portal não usa login Microsoft, então não existe app registration de login e Q-33 deixou de se aplicar. O Entra ID fica restrito às integrações. Alterações nas §1, §6.4 e §7.
**Fontes:** Plano Mestre (`PM §n`), `ARQUITETURA_TECNICA.md` (§13, DA-nn, Q-nn), `INTEGRACOES.md`, `PLANO_DE_IMPLEMENTACAO.md` §3. Fatos de fornecedores foram consultados em documentação oficial em 14/10/2026, por resumo automatizado das páginas; números críticos (preços, limites) devem ser reconferidos na contratação.

Rótulos usados: **[VERIFICADO]** executado ou observado nesta etapa; **[DOC-OFICIAL]** lido em documentação do fornecedor, não testado; **[PLANEJADO]** configuração proposta, ainda não executada; **[PENDENTE-TI]** decisão ou autorização da TI; **[RECOMENDAÇÃO]** sugestão técnica sem aprovação.

---

## 1. Situação resumida

| Ambiente | Banco | Entra ID (só integrações — DT-01) | Conectores | Dados | Situação em 14/10/2026 |
|---|---|---|---|---|---|
| Desenvolvimento local | PostgreSQL 17 em Docker (DA-21) | Nenhuma app registration. O login é o próprio do portal, com contas fictícias criadas no banco local (Revisão 01.4; Q-33 não se aplica) | `SIMULACAO` | Fictícios | **Bloqueado**: Docker não instalado (§2.2) |
| Homologação | Projeto Supabase dedicado | App registrations só em tenant de testes autorizado (Q-09) | `SIMULACAO`; `ATIVO` só em tenant de testes autorizado | Fictícios ou anonimizados | **Pendente de autorização**: projeto não criado (§6) |
| Produção | Supabase de produção → VPS Virta (Q-08) | Tenant Virta | `ATIVO` só após A-06 | Reais | Fora do escopo da Etapa 0 (Etapa 7a) |

A estratégia de ambientes é a de `ARQUITETURA_TECNICA.md` §13.1, com a trava de ambiente da DA-23 (§13.1.1). Este documento não a altera.

---

## 2. Estação de desenvolvimento

### 2.1 Ferramentas verificadas [VERIFICADO]

Verificação feita em 14/10/2026 com comandos de versão no PowerShell 5.1 e no Git Bash, na sessão do usuário, **sem privilégio de administrador**.

| # | Ferramenta | Situação | Versão detectada | Método | Compatibilidade e observações | Ação recomendada |
|---|---|---|---|---|---|---|
| 1 | Windows | Instalado | Windows 11 Pro 10.0.26200 (build 26200), 64 bits | `Get-CimInstance Win32_OperatingSystem` | Atende ao mínimo do Docker Desktop (Windows 11 23H2, build 22631) [DOC-OFICIAL] | — |
| 2 | PowerShell | Instalado | Windows PowerShell 5.1.26100; PowerShell 7 (`pwsh`) **ausente** | `$PSVersionTable` | Suficiente para os scripts da Etapa 0. O `pwsh` só será necessário na imagem Linux do worker (ponte Exchange, `INTEGRACOES.md` §3), não na estação | Nenhuma agora |
| 3 | Git | Instalado | 2.56.0.windows.2 | `git --version` | `core.autocrlf=true` na configuração de sistema; o `.gitattributes` passa a definir LF (§5.1). **`user.name` e `user.email` não configurados**: um commit falharia | Configurar a identidade antes do primeiro commit autorizado (`SEGURANCA_REPOSITORIO.md` §6) |
| 4 | Node.js | Instalado | v24.21.0 | `node --version` | Linha 24 em LTS ativa até 20/10/2026 e em manutenção até 30/04/2028; atende Next.js 16 e Prisma 7 (`^24.0.0`) [DOC-OFICIAL]. A v24.22.0 saiu em 14/10/2026, e o projeto Node.js anunciou versões de segurança (gravidade alta) para as linhas 22, 24 e 26 em **21/10/2026** | Manter a v24.21.0 por ora; atualizar para a versão de segurança da linha 24 após 21/10/2026, antes da Etapa 1. A instalação fica em `C:\Program Files\nodejs` e a atualização provavelmente exige administrador |
| 5 | npm | Instalado | 11.19.0 | `npm --version` | Acompanha o Node | — |
| 6 | npx | Instalado | 11.19.0 | `npx --version` | Usado pelo MCP `shadcn` | — |
| 7 | Python 3.12 | Instalado | 3.12.10 (`python`, `py -3.12`) | `python --version`, `py -0p` | Opcional (skill `webapp-testing`). `python3` aponta para o atalho da Microsoft Store (`WindowsApps`), não para a instalação 3.12 | Usar `python` ou `py` |
| 8 | Docker | **Ausente** | — | `Get-Command docker`; `C:\Program Files\Docker` inexistente | Necessário ao PostgreSQL 17 local e aos testes de integração (`PLANO_DE_IMPLEMENTACAO.md` §13) | Ver §2.2 — exige autorização |
| 9 | Docker Compose | **Ausente** | — | `Get-Command docker-compose` | Viria com o Docker Desktop (`docker compose`) | Idem |
| 10 | Claude Code | Instalado | 2.1.299 | `claude --version` | — | — |
| 11 | Visual Studio Code | Instalado | 1.141.1 (x64) | `code --version` | — | — |

Outros fatos observados: **WSL não instalado** (`wsl --status`); hipervisor ativo (`HypervisorPresent = True`); **7,7 GB de RAM**; 268 GB livres em `C:`; `winget` 1.29 disponível; `gh` (GitHub CLI), `psql`, CLI do Supabase e `az` ausentes. Nenhuma dessas ferramentas é necessária na Etapa 0.

### 2.2 Docker: bloqueio e opções [PENDENTE-TI]

O Docker **não foi instalado**. A instalação não cumpre as condições desta etapa para instalação autônoma:

| Requisito | Situação |
|---|---|
| Administrador | O Docker Desktop pode ser instalado por usuário, mas **habilitar o WSL 2 exige administrador** uma vez por máquina [DOC-OFICIAL]. A sessão atual não é administradora |
| Reinicialização | `wsl --install` pode exigir reinicialização [DOC-OFICIAL] |
| Memória | O Docker Desktop pede **8 GB de RAM** [DOC-OFICIAL]; a máquina tem 7,7 GB. O ambiente previsto (PostgreSQL, Next.js em modo de desenvolvimento, Playwright/Chromium) tende a ficar no limite |
| Licença | O Docker Desktop é gratuito para empresas com **menos de 250 funcionários e menos de US$ 10 milhões de receita anual**; acima disso, exige assinatura paga [DOC-OFICIAL]. O porte do Grupo Vallur não foi verificado |

Fonte: https://docs.docker.com/desktop/setup/install/windows-install/ ; https://docs.docker.com/subscription/desktop-license/

Opções para decisão da TI (nenhuma aprovada):

| Opção | Licença | Exige | Observações |
|---|---|---|---|
| A — Docker Desktop | Gratuita só abaixo dos limites acima | Administrador (WSL 2), possível reinicialização | Opção prevista no PM §15 e no plano |
| B — Podman Desktop | Apache-2.0 | WSL 2 ou Hyper-V; administrador e reinicialização para habilitá-los; 6 GB para a máquina Podman | Compatível com imagens OCI; `compose` por ferramenta adicional |
| C — Rancher Desktop | Apache-2.0 | WSL 2 previamente instalado; serviço privilegiado exige administrador; recomenda 8 GB e 4 CPUs | — |

Fontes: https://podman-desktop.io/docs/installation/windows-install ; https://docs.rancherdesktop.io/getting-started/installation/

**[RECOMENDAÇÃO]** A TI confirma o enquadramento da licença do Docker Desktop. Se ele for gratuito para o grupo, a opção A é a mais simples. Se não for, a opção B evita o custo de licença. Em qualquer caso: instalação por um administrador, avaliação de aumento de memória (16 GB recomendados para a Etapa 1) e imagem **`postgres:17.11`** fixada (última correção da série 17 no Docker Hub em 14/10/2026). Uma instalação nativa do PostgreSQL 17 no Windows não é proposta, porque os testes de integração preveem PostgreSQL em contêiner (`PLANO_DE_IMPLEMENTACAO.md` §13).

### 2.3 Ferramenta de varredura de segredos [VERIFICADO]

O gitleaks **8.30.1** (licença MIT, https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) foi baixado da página oficial de releases, conferido pelo SHA-256 publicado em `gitleaks_8.30.1_checksums.txt` e executado a partir de uma pasta temporária da sessão. Ele **não foi instalado** no sistema nem adicionado ao `PATH`. Para uso contínuo, a TI decide entre:

- instalação por usuário (binário oficial em pasta do usuário, conferido pelo checksum; a disponibilidade de pacote no `winget` não foi verificada);
- execução no CI.

O script `scripts/verificar-repositorio.ps1` aceita o caminho do executável (`-GitleaksPath`).

---

## 3. Estratégia de ambientes

### 3.1 Regras de separação [PLANEJADO — ARQ §13.1, DA-23]

| Tema | Regra |
|---|---|
| Identificação | Variável `AMBIENTE` obrigatória (`DESENVOLVIMENTO`, `HOMOLOGACAO`, `PRODUCAO`), validada na inicialização. `NODE_ENV` não identifica ambiente |
| Banco | Um banco por ambiente. Desenvolvimento local em Docker; um projeto Supabase por ambiente remoto. A tabela `portal.instalacao` grava o ambiente na criação do banco e impede que uma configuração aponte para o banco de outro ambiente |
| Tenant Microsoft 365 | Fora de produção, nenhuma credencial com permissão de aplicação no tenant Virta. `TENANTS_ESCRITA_AUTORIZADOS` vazia por padrão |
| Conectores | `SIMULACAO` em desenvolvimento e homologação; proibido em produção |
| Dados | Desenvolvimento: só fictícios. Homologação: fictícios ou anonimizados. Nenhuma carga de dados pessoais reais antes de Q-17 |
| Acesso | Desenvolvimento: o próprio desenvolvedor. Homologação: equipe de desenvolvimento e TI, com contas nominais. Produção: somente pessoas designadas pela TI, sem acesso de leitura ao banco a partir de estações de desenvolvimento |
| Logs | JSON estruturado com `AMBIENTE` e `correlationId`; lista de bloqueio de campos (`password`, `senha`, `token`, `secret`, `cpf` etc. — ARQ §7.4); nenhum dado pessoal em log de desenvolvimento |
| Implantação | Fora da Etapa 0. Produção depende de A-06; destino (Supabase ou VPS) depende de Q-08 |

### 3.2 Dados de teste [PLANEJADO]

- Somente dados fictícios (PM §19). Nomes, CPFs e e-mails gerados por utilitários de teste, com CPFs válidos sinteticamente, mas não pertencentes a pessoas reais.
- Domínio de e-mail de teste não roteável (ex.: `example.com`, RFC 2606), nunca os domínios do grupo.
- As planilhas da TI e os modelos TER/TDV com dados pessoais **não** servem de base para *seeds* nem *fixtures*. Versões sanitizadas dependem da TI (Q-01).

---

## 4. Segredos e configuração

| Ambiente | Onde ficam os segredos | Quem acessa |
|---|---|---|
| Desenvolvimento | Arquivo `.env` local (ignorado pelo Git), só com credenciais do banco local e de serviços de teste | O desenvolvedor |
| Homologação | Cofre ou variáveis do host de homologação; nunca em arquivos versionados | Desenvolvimento e TI designados |
| Produção | Cofre ou variáveis do host de produção | Somente a TI designada |

Regras:

1. O `.env.example` contém **somente nomes e valores de exemplo**. Hoje tem só as variáveis já definidas na documentação (`AMBIENTE`, `TENANTS_ESCRITA_AUTORIZADOS`, `DATABASE_URL`, `DIRECT_URL`). As demais entram na Etapa 1, junto com o esquema Zod da configuração.
2. Nenhum segredo de produção em estação de desenvolvimento, no CI de *pull requests* ou em homologação (DA-23).
3. Credenciais de aplicação do Entra ID por **certificado**, sem segredo de cliente (DA-09). A chave privada nunca entra no repositório (`*.pem`, `*.key`, `*.pfx` estão no `.gitignore`).
4. Senhas e *connection strings* **nunca** são coladas em chats, tickets, documentos ou mensagens, inclusive em conversas com o assistente de IA. A TI as gera no painel do provedor e as guarda no cofre de senhas da TI.
5. Rotação: ao suspeitar de exposição, ao desligar quem teve acesso e antes do vencimento de certificados. Procedimento detalhado na Etapa 7a (`PLANO_DE_IMPLEMENTACAO.md` §8, critério 4).
6. **GitHub:** em repositório privado, *environments* com revisores obrigatórios só existem no plano Enterprise [DOC-OFICIAL]. Por isso a recomendação é **não guardar segredos de produção no GitHub** enquanto o plano não for definido e manter migrações e implantação executadas a partir do host (PB-20). Detalhes em `SEGURANCA_REPOSITORIO.md` §7.

---

## 5. Convenções de repositório e de engenharia

As convenções abaixo são **[RECOMENDAÇÃO]** para aprovação na A-01, exceto quando citam documento já existente. Elas não alteram regras de negócio.

### 5.1 Formatação e arquivos [VERIFICADO — arquivos criados nesta etapa]

| Item | Convenção |
|---|---|
| Codificação | UTF-8 sem BOM (`.editorconfig`). Exceção: scripts `.ps1` com texto acentuado precisariam de BOM no Windows PowerShell 5.1; o script da Etapa 0 usa apenas ASCII |
| Fim de linha | LF no repositório e na cópia de trabalho (`.gitattributes`, `* text=auto eol=lf`); CRLF em `.ps1`, `.cmd`, `.bat`. Os arquivos atuais estão em CRLF e serão normalizados para LF no primeiro commit |
| Indentação | 2 espaços; 4 em PowerShell |
| Binários | PDF, imagens, fontes, `.zip`, `.xlsx`, `.docx` marcados como binários |
| Formatador e *lint* | Prettier e ESLint (configuração padrão do Next.js 16), definidos na Etapa 1. Nenhuma ferramenta foi instalada agora |

### 5.2 Nomes, pastas e módulos

| Item | Convenção | Base |
|---|---|---|
| Estrutura de pastas | A de `ARQUITETURA_TECNICA.md` §8 (`src/app`, `src/features`, `src/server`, `src/integrations`, `src/worker`, `prisma`, `tests`) | ARQ §8 |
| Idioma | Domínio em português, sem acentos em identificadores (`colaborador`, `solicitacao`, `alocacao`); termos do *framework* em inglês | Glossário ARQ §1.1 |
| Arquivos | `kebab-case` para arquivos e pastas (`data-table.tsx`, `verificar-repositorio.ps1`); componentes React exportados em `PascalCase` | Padrão do shadcn/ui |
| Variáveis de ambiente | `MAIUSCULAS_COM_SUBLINHADO`. Nomes padronizados por bibliotecas permanecem como são (`DATABASE_URL`, `DIRECT_URL`); os do projeto ficam em português sem acentos (`AMBIENTE`, `TENANTS_ESCRITA_AUTORIZADOS`) | ARQ §13.1.1 |
| Fronteiras | Navegador → Server Actions/Route Handlers → serviços de domínio (`src/server/modulos`) → Prisma; conectores só em `src/integrations`, sem tipos do fornecedor fora do conector; worker sem dependência do processo web | ARQ §7, P9 |
| Documentação | `docs/` em `MAIUSCULAS_COM_SUBLINHADO.md`, em pt-BR, com identificadores `DA-nn`, `R-nn`, `Q-nn` | Convenção da Fase 01 |

### 5.3 Git

| Item | Convenção |
|---|---|
| *Branch* principal | `main`, protegida (exige plano GitHub Team ou superior em repositório privado — `SEGURANCA_REPOSITORIO.md` §7) |
| *Branches* de trabalho | `tipo/descricao-curta` (ex.: `feat/login-portal`, `docs/etapa-0`) |
| Mensagens de commit | Conventional Commits em pt-BR: `tipo(escopo): resumo no imperativo` (ex.: `feat(inventario): registra movimentação na entrega`). Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build` |
| Inclusão de arquivos | Sempre por caminho explícito; nunca `git add -A` nem `git add -f` sobre material da TI (`CLAUDE.md`) |
| Antes de cada commit | `scripts/verificar-repositorio.ps1` (e, a partir da Etapa 1, o mesmo controle no CI) |

### 5.4 Erros, testes, revisão e segurança

| Tema | Convenção | Base |
|---|---|---|
| Tratamento de erros | Tabela de tipos de erro, `sanitizarErro()` único e ID de correlação na mensagem genérica | ARQ §7.3 |
| Testes | Vitest (domínio, banco, conectores com *fixtures*), Playwright (fluxos e visual), dados só fictícios; conectores nunca chamam serviços reais no CI | PLANO §13 |
| Revisão de código | Todo *pull request* revisado por pessoa diferente do autor; marcos S-01 a S-09 com checklist assinado por revisor diferente do autor | PLANO §11 |
| Segurança | Autorização no servidor em toda Server Action e Route Handler; nenhum segredo em log; dependências fixadas com versão exata (`prisma@7`) | ARQ §3, DA-17 |
| UI/UX | Diretrizes do `CLAUDE.md`; critérios de `DESIGN_SYSTEM.md` §14.1; validação com Playwright em 375, 390, 768 e 1440 px | DESIGN §14 |
| Acessibilidade | WCAG 2.2 nível AA | DESIGN §13 |

---

## 6. PostgreSQL e Supabase

### 6.1 Capacidades verificadas em documentação oficial [DOC-OFICIAL]

| # | Tema | Fato | Fonte |
|---|---|---|---|
| 1 | Projeto | Desenvolvimento local com banco local; **um projeto Supabase separado para homologação** e outro para produção | https://supabase.com/docs/guides/deployment/managing-environments |
| 2 | Região | Há região **sa-east-1 (São Paulo)**. A região **não pode ser alterada** depois da criação: mudar exige novo projeto e migração | https://supabase.com/docs/guides/platform/regions ; https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z |
| 3 | Versão do PostgreSQL | "Postgres 17 is what we currently default to on the Supabase platform" — afirmação em changelog sobre auto-hospedagem (18/05/2026). **Não há página oficial que confirme a versão de projetos hospedados novos** | https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change |
| 4 | Plano Free | Até 2 projetos ativos; **pausa após 1 semana de inatividade**; banco de 500 MB; storage de 1 GB; **sem backups diários**, sem PITR, sem *branching* | https://supabase.com/pricing |
| 5 | Plano Pro | A partir de US$ 25/mês com US$ 10 de crédito de computação (1 instância Micro); cada projeto Micro adicional custa cerca de US$ 10/mês; 8 GB de banco por projeto; **7 dias de backups diários**; não pausa | https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/compute-and-disk |
| 6 | PITR | Complemento pago (Pro ou superior), a partir de US$ 100/mês para 7 dias, e exige computação Small ou maior | https://supabase.com/docs/guides/platform/backups |
| 7 | Backup e Storage | "Database backups do not include objects you store via the Storage API" — o backup do banco não cobre os arquivos | https://supabase.com/docs/guides/platform/backups |
| 8 | Conexões | Conexão direta `db.<ref>.supabase.co:5432` **somente IPv6**, salvo o complemento IPv4 (Pro ou superior, cerca de US$ 4/mês). O Supavisor em modo sessão (`:5432`) e em modo transação (`:6543`) aceita IPv4 em todos os planos; o modo transação não aceita *prepared statements* | https://supabase.com/docs/guides/database/connecting-to-postgres ; https://supabase.com/docs/guides/platform/ipv4-address |
| 9 | Restrição de rede | *Network Restrictions* valem só para o Postgres e o pooler, **não** para as APIs HTTPS (Data API, Storage, Auth). Exigem listar faixas IPv4 e IPv6. Os planos que oferecem o recurso **não estão indicados** na página | https://supabase.com/docs/guides/platform/network-restrictions |
| 10 | SSL | *SSL Enforcement* recusa clientes Postgres sem TLS; vem **desligado** por padrão | https://supabase.com/docs/guides/platform/ssl-enforcement |
| 11 | Data API | Pode ser desligada no painel. Desde 30/05/2026, tabelas novas em `public` não são expostas automaticamente em projetos novos; em 30/10/2026 a regra vale para todos | https://supabase.com/docs/guides/api/securing-your-api ; https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically |
| 12 | Prisma | Guia oficial: usuário de banco dedicado ao Prisma; `prisma.config.ts`; *driver adapter* `@prisma/adapter-pg`. Em servidor de longa duração, `DATABASE_URL` no pooler em modo sessão; em *serverless*, modo transação com `?pgbouncer=true` e `DIRECT_URL` para migrações | https://supabase.com/docs/guides/database/prisma |
| 13 | Prisma 7 | Node `^20.19`, `^22.12` ou `^24`; PostgreSQL 9.6 a 18 | https://www.prisma.io/docs/orm/reference/system-requirements |
| 14 | Conformidade | SOC 2 Tipo 2 (relatório para planos Team/Enterprise); DPA publicado. **A página de segurança não cita a LGPD** | https://supabase.com/security ; https://supabase.com/legal/dpa |

### 6.2 Configuração planejada para a homologação [PLANEJADO]

| Item | Proposta |
|---|---|
| Projeto | `vallur-ti-portal-homologacao`, em organização Supabase da empresa (não em conta pessoal), com membros nominais |
| Região | `sa-east-1` (São Paulo) [RECOMENDAÇÃO: menor latência e dados no Brasil; a decisão sobre residência cabe à TI e ao jurídico — Q-17] |
| Versão | Confirmar a versão major no painel logo após a criação e registrar em DA-21 (17 esperado; 18 também é compatível) |
| Esquema | `portal` dedicado; `public` vazio; **Data API desligada**; `REVOKE ALL ON SCHEMA portal FROM anon, authenticated, public` (DA-06) |
| Papéis | `portal_owner`, `portal_app`, `portal_leitura`, `portal_selo` e papel de anonimização (ARQ §13.3), criados por migração na Etapa 1 |
| Rede | *SSL Enforcement* ligado. *Network Restrictions* restritas aos IPs do host de homologação, se o plano permitir. Para migrações a partir de estação sem IPv6, usar o pooler em modo sessão (IPv4) |
| Pooler | Modo (sessão × transação) para o processo web definido na Etapa 1 (PB-16). O guia do Supabase indica modo sessão para servidores de longa duração, e a ARQ §13.3 previa modo transação: a escolha precisa ser registrada |
| Supabase Auth, Edge Functions, Realtime | Não usados (DA-02, DA-06) |
| Credenciais | Senha do banco gerada no painel pela TI e guardada no cofre da TI; chaves `anon`/`service_role` e chaves S3 nunca no navegador nem no repositório |
| Backup | No Free não há backup diário. Mesmo com dados fictícios, testar `pg_dump` lógico desde a homologação (ARQ §13.4) |
| *Branching* | Não proposto (custo por hora e complexidade); projetos separados bastam |

### 6.3 Decisões pendentes e ações que aguardam autorização [PENDENTE-TI]

| ID | Item | Observação |
|---|---|---|
| SUP-01 | Autorizar a criação do projeto de homologação, incluindo conta ou organização Supabase da empresa e responsável | Ação externa; não executada |
| SUP-02 | Plano da homologação: Free (sem custo, mas pausa por inatividade e sem backup) ou Pro (custo mensal) | Decisão de custo |
| SUP-03 | Região do projeto (recomendada: `sa-east-1`) | Imutável após a criação |
| SUP-04 | Confirmar a versão do PostgreSQL no painel (DA-21) | Depende de SUP-01 |
| SUP-05 | Plano e região da produção, PITR e retenção de backups (Q-08, Q-16) | Etapa 7a |
| SUP-06 | Avaliação jurídica do DPA da Supabase quanto à LGPD (Q-17) | Antes de qualquer dado real |

### 6.4 Portabilidade

Mantida a estratégia do PM §17 e da ARQ §13.5: somente recursos padrão do PostgreSQL, Prisma com migrações versionadas, storage atrás de adaptador S3, autenticação própria do portal no PostgreSQL da aplicação, sem Supabase Auth (DT-01; antes da Revisão 01.4: "autenticação no Entra ID"). Como o backup do banco não inclui os arquivos do Storage (§6.1, item 7), a cópia independente dos objetos continua obrigatória.

---

## 7. Microsoft Entra ID

**Situação:** nenhuma operação no tenant Virta foi feita na Etapa 0. Nenhuma app registration, nenhum consentimento, nenhuma leitura de contas.

| Tema | Abordagem planejada | Base |
|---|---|---|
| Autenticação no portal | **Revisão 01.4:** não usa o Entra ID (DT-01). O login é próprio do portal (e-mail corporativo e senha, Argon2id, sessões no PostgreSQL, MFA para a TI), com a biblioteca proposta na DA-24. MSAL Node serve só para obter tokens de aplicação dos conectores. *Planejado antes: OIDC com MSAL Node e chave `oid` + `tid`* | ARQ §9, DA-03, DA-24 |
| Identificador do tenant (`tid`) | A TI informa o `tid` do tenant Virta a partir do Centro de Administração do Microsoft Entra (Visão geral → ID do locatário). Ele **não é inferido do domínio** (ARQ §13.1.1). Será a constante `TENANT_PRODUCAO_ID` no código (não é segredo) | DA-23 — **pendente** |
| App registrations | **Duas por ambiente** (Revisão 01.4): Web (aplicativo) e Worker (aplicativo), ambas com certificado. A registration de Login deixou de existir (DT-01) | DA-09 |
| Desenvolvimento | **Nenhuma app registration** no tenant Virta. O login próprio funciona com contas fictícias no banco local. *Antes da Revisão 01.4: app de login somente se a TI autorizasse (Q-33, hoje encerrada)* | ARQ §13.1.1 |
| Produção | Registrations de produção criadas na Etapa 7a, com consentimento administrativo após A-06 | PLANO §8 |
| Microsoft Graph | Permissões de aplicação de menor privilégio por operação (`User.Create`, `LicenseAssignment.ReadWrite.All`, `GroupMember.ReadWrite.All`), somente no tenant de produção para produção e em tenant de testes autorizado (Q-09) para validação | INTEGRACOES §2 |
| Simulação | Conectores em `SIMULACAO`, com *fixtures* montadas da documentação oficial, inclusive erros (400, 403, 429 com `Retry-After`, *timeout* após envio) | INTEGRACOES §13.2 |
| Prevenção de escrita acidental | Trava de ambiente em quatro barreiras (DA-23); nenhuma credencial de aplicação do tenant de produção fora de produção | ARQ §13.1.1 |
| Testes futuros com escrita real | I-02 e I-03, somente no ambiente definido em Q-09 e com autorização específica para cada teste | PLANO §12 |

Dependências que permanecem abertas, com a definição registrada em `ARQUITETURA_TECNICA.md` §16:

- **Q-09** — Existe tenant Microsoft 365 de testes? **Pendente**: ambiente seguro de testes de integração ainda não definido. A inspeção da TI mostrou apenas o tenant Virta (`virtaeng.onmicrosoft.com`, Entra ID P1) entre os diretórios acessíveis à conta consultada, o que não prova a inexistência de outro tenant. Não bloqueia as Etapas 0 e 1.
- ~~**Q-33** — Onde registrar o app de login de desenvolvimento/homologação e quem autoriza o registro.~~ **Encerrada (DT-01, 15/10/2026)**: não se aplica, porque o portal não usa login Microsoft. O login real da Etapa 1 não depende mais do tenant.
- **Q-34** — Ambientes não produtivos podem ler dados do tenant de produção com permissão de aplicação? Até decisão: **não**.

---

## 8. Integrações externas

Classificação pedida para a Etapa 0: **(1)** documentada e confirmada; **(2)** documentada, mas não habilitada nem testada no ambiente Vallur; **(3)** não confirmada; **(4)** inicialmente manual. Nenhuma integração é classe (1): nada foi testado em ambiente do grupo. O detalhamento técnico (operações, permissões, erros, idempotência) está em `INTEGRACOES.md` e não é repetido aqui.

| Integração | Classe | Finalidade (PM) | Operações esperadas | Pré-requisitos de autenticação e permissão | Configuração por ambiente | Pendente | Contingência manual |
|---|---|---|---|---|---|---|---|
| Microsoft Graph | **2** | Contas, licenças, grupos (PM §4) | Criar usuário, licença, grupos de segurança/M365, ler SKUs | Registrations Web e Worker com certificado e consentimento; tenant de testes (Q-09) | `SIMULACAO` fora de produção; `ATIVO` só após I-02 (teste) e I-04 (produção) | Q-09, Q-03, Q-10, Q-23; menor permissão para atualizar atributos | Tarefa manual auditada |
| Exchange Online | **2 → 4** | Caixas compartilhadas e permissões (PM §4) | `New-Mailbox -Shared`, FullAccess, SendAs | `Exchange.ManageAsApp` + grupo de função personalizado com escopo de gravação; `pwsh` no worker | Manual na V1; ponte PowerShell após I-03 | Q-09, Q-10; escopo restrito a caixas compartilhadas verificado em I-03 | Tarefa manual no Centro de Administração do Exchange |
| Microsoft Teams | **2** (expansão) | Regras por empresa/cargo (PM §13) | Incluir/remover membros de equipes e canais | Permissões `TeamMember.*`/`ChannelMember.*` | Etapa 6 | Catálogo de regras; endpoints de remoção | Fluxo atual do `TeamsReport` |
| Diário de Obra | **3 → 4** | Usuários, perfis e obras (PM §5) | A confirmar com o fornecedor | Desconhecida | — | API oficial, autenticação e ambiente de testes (Q-24) | Tarefa manual (modo padrão) |
| D4Sign | **2** (bloquear/desbloquear) / **3** (criar usuário) **→ 4** | Usuários e bloqueios (PM §5) | `users/list`, `users/check`, `users/block`, `users/unblock` | `tokenAPI` e `cryptKey` na *query string*, só no worker, com redação de URL nos logs | Manual até I-06 | Criação de usuário e permissões (Q-24) | Tarefa manual no painel D4Sign |
| Unividade / UCS Online (Konviva) | **3 → 4** | Usuários da plataforma de aprendizagem (PM §5) | `integrarUsuario` (citado no PM; não encontrado em documentação pública) | Cabeçalho `Authorization: KONVIVA <token>` (artigo público da Senior); `/api_doc/` do ambiente contratado | Manual/CSV até I-05 | Habilitação no ambiente contratado (Q-24) | Exportação CSV ou tarefa manual |
| OneDrive da TI (tutoriais) | **2** | Central de Tutoriais (PM §10) | Listar e abrir conteúdos publicados | Alternativa A (DA-12): sem permissão de aplicação ampla; o colaborador abre com a própria identidade | Etapa 4 | Pasta, conta proprietária e público (Q-11) | Tutorial do tipo `LINK` |

Expectativas comuns (INTEGRACOES §1.2 e §9): erro sanitizado; *timeout* por chamada; retentativa só em falhas transitórias, com recuo exponencial e `Retry-After`; `verificarEstado()` antes de toda escrita; reprocessamento autorizado com os mesmos parâmetros aprovados; procedimento manual sempre disponível.

**Preparação de configuração na Etapa 0:** nenhuma variável de conector foi criada. Os nomes das variáveis de modo de cada conector (DA-15) e das credenciais serão definidos na Etapa 1, no esquema de configuração. Nenhum conector foi implementado.
