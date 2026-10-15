# Revisão Final da Fase 01 — Portal TI Vallur

**Fase:** 01 — Arquitetura e planejamento
**Data:** 14/10/2026 (Revisão 01.3)
**Situação:** relatório de prontidão para a aprovação **A-00**. Este documento **não é** a aprovação: ela cabe ao responsável autorizado da TI Vallur. Nenhuma atividade da Etapa 0 foi iniciada.
**Plano Mestre oficial:** `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md` (versão 1.1, 14/10/2026), com PDF na mesma pasta. Citado como **PM §n**.

> Primeira versão deste arquivo. Os seis documentos técnicos já o citavam desde a Revisão 01.1, mas ele não existia no repositório. As referências foram ajustadas à numeração abaixo.

> **Revisão 01.4 (15/10/2026) — atualização consolidada.** As §1 a §13 registram a revisão de 14/10/2026 e foram mantidas como histórico. A §14 registra as decisões da TI **DT-01 a DT-07** (autenticação própria do portal, senha inicial definida pela TI, nenhum provisionamento com aprovação hierárquica, Supervisor TI e Gestor ADM equivalentes e sem hierarquia, experiência gerencial do Gestor ADM, limites do Estagiário TI) e o resultado da revisão especializada feita depois delas. **Onde as §1 a §13 citam login Microsoft Entra ID, aprovação, autoaprovação, Q-04, Q-25 ou Q-33 como regra vigente, prevalece a §14.**

---

## 1. Resumo executivo

**Recomendação: APROVÁVEL COM CONDIÇÕES** (§13).

- A arquitetura de fundação está definida e coerente com o Plano Mestre v1.1 e com as decisões aprovadas pela TI: Q-04, Q-07, Q-25, Q-27 e Q-30. A pilha prevista é Next.js 16, React, TypeScript, Tailwind, shadcn/ui, Prisma 7, PostgreSQL 17 (Supabase no início, migrável) e Microsoft Entra ID.
- **Q-09 continua pendente.** Na inspeção da TI no Entra, apareceu somente o tenant de produção **Virta** (`virtaeng.onmicrosoft.com`, Entra ID P1) entre os diretórios acessíveis à conta consultada. Ele é compartilhado por todas as empresas do grupo. Isso não prova que não exista outro tenant.
- Q-09 **não bloqueia** a Etapa 0 nem a fundação. Bloqueia apenas a validação real de provisionamento (I-02 e I-03) e, por consequência, a aprovação A-03 e a habilitação em produção (I-04).
- Para reduzir o risco de um tenant só, criamos a **trava de ambiente** (DA-23). Ela impede que uma configuração não produtiva escreva no tenant de produção.
- As revisões especializadas acharam **três caminhos para contornar as restrições obrigatórias de Q-30** e várias contradições entre documentos. Os três contornos e as contradições já foram **corrigidos** (§6). Itens de desenho detalhado ficaram classificados para as etapas certas (§9).
- **Risco de segurança mais sério:** o diretório de trabalho tem arquivos com CPFs, senhas em texto puro e chaves de produto.
  - O repositório não tem nenhum commit, então **não houve exposição pelo Git**.
  - O `.gitignore` foi reforçado.
  - Mesmo assim, o primeiro commit exige as precauções de §7.2.
- Nenhuma operação foi feita em tenant, banco ou sistema externo. Não houve instalação de dependências nem criação de código ou de credenciais. Também não houve commit, push ou publicação.

---

## 2. Documentos analisados

| Documento | Situação após esta revisão |
|---|---|
| `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md` | Lido integralmente; fonte primária (v1.1). Não alterado |
| `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.pdf` | Localizado (13 páginas). A equivalência textual com o `.md` **não foi verificada** (§11) |
| `docs/ARQUITETURA_TECNICA.md` | Lido integralmente; atualizado (Revisão 01.3) |
| `docs/MODELO_DE_DADOS.md` | Lido integralmente; atualizado |
| `docs/INTEGRACOES.md` | Lido integralmente; atualizado |
| `docs/PERMISSOES_RBAC.md` | Lido integralmente; atualizado |
| `docs/DESIGN_SYSTEM.md` | Lido nas seções afetadas e revisado por agente especializado; atualizado |
| `docs/PLANO_DE_IMPLEMENTACAO.md` | Lido integralmente; atualizado |
| `CLAUDE.md` | Aponta corretamente para o Plano Mestre. Atualizado: remove a condição obsoleta, aponta os documentos da Fase 01 e acrescenta regras de segurança do repositório |
| `README.md` | Desatualizado; reescrito |
| `.gitignore` | Revisado e reforçado (§7.2) |
| `.mcp.json` | Revisado; não alterado (§9, PC-07) |
| `TER - TDV/TER_VALLUR_v22.html`, `TDV_VALLUR_v08.html` | Não reabertos. A análise estrutural é de 14/10 (`MODELO_DE_DADOS.md` §9.4). Nesta revisão só foram contados padrões sensíveis, sem leitura de valores (§7.1) |
| Planilhas em `docs/SGSI/`, `docs/Inventário/`, `docs/dISTRIBUIÇÃO DE CUSTOS/` | Não abertas. Apenas contagem automatizada de categorias sensíveis, sem exibir valores (§7.1) |

Não há outros registros de decisão, riscos ou revisões além dos que estão dentro de `ARQUITETURA_TECNICA.md` (§14 riscos, §15 decisões, §16 questões).

---

## 3. Estado das decisões arquiteturais

| Situação | Decisões |
|---|---|
| Confirmadas pelo Plano Mestre | DA-02 (Entra ID como única autoridade; sem Supabase Auth), DA-14 (integração não confirmada = tarefa manual auditada) |
| Propostas, aguardando A-00 | DA-01, DA-03 a DA-13, DA-15 a DA-22 |
| **Nova proposta (Revisão 01.3)** | **DA-23** — trava de ambiente: `AMBIENTE` obrigatório; ambiente gravado no banco; lista vazia de tenants autorizados para escrita fora de produção; recusa de inicialização em combinação proibida; nenhuma credencial de aplicação do tenant de produção fora de produção (`ARQUITETURA_TECNICA.md` §13.1.1) |
| Propostas novas dentro de decisões existentes (exigem aprovação junto com A-00) | `ESTAGIARIO_TI` não coexiste com perfil administrativo (`PERMISSOES_RBAC.md` §3.10); concessões individuais só valem com perfil de TI ativo; carga inicial só propõe vínculos de identidade e recusa vincular `oid` a registro com perfil de TI ativo; papel `portal_selo`; identificadores externos resolvidos no conteúdo aprovado |

Versões propostas (DA-17, DA-18, DA-20, DA-21) foram reverificadas em documentação oficial (§10.2).

---

## 4. Decisões de negócio confirmadas

Todas aprovadas pela TI Vallur em 14/10/2026 e verificadas nesta revisão em todos os documentos.

| ID | Decisão | Onde está refletida | Verificação |
|---|---|---|---|
| **Q-04** — Autoaprovação | Supervisor TI e Gestor ADM podem aprovar solicitações que eles mesmos prepararam. O Estagiário prepara, mas nunca aprova. Preparador e aprovador ficam registrados, e a autoaprovação é marcada na auditoria. A aprovação vale para uma versão imutável (hash), e alterar depois exige nova aprovação. Não há segundo aprovador obrigatório | ARQ §7.2, §11.3; MODELO §6.2, §6.4, §6.6, §11.1; RBAC §4.2; DESIGN §10.1; PLANO §5 (critérios 3, 7a, 10) | OK, com correções: faltava a transição de nova versão a partir de `APROVADA`/`EM_EXECUCAO`; rótulos de "uma decisão por versão" corrigidos para DECISÃO-TI; painel exibe versão e hash |
| **Q-07** — Autoridade administrativa | Supervisor TI e Gestor ADM têm autoridade equivalente: ambos atribuem, alteram e removem perfis administrativos, inclusive `GESTOR_ADM` | RBAC §2, §3.7, §8; MODELO §5.1; PLANO §4 (critério 3) | OK. Nenhum texto preserva a restrição antiga. Testes acrescentados (Gestor revoga Gestor; Supervisor revoga Supervisor) |
| **Q-25** — Senha inicial transitória | A senha digitada na preparação é descartada, e a solicitação vai para aprovação sem ela. Na execução, um usuário autorizado digita de novo; o uso é transitório e a senha é descartada após a tentativa. Toda nova tentativa exige nova digitação. Nunca é persistida | ARQ §11.4; INTEGRACOES §2.6; MODELO §1, §6.5, §6.7; DESIGN §9.2; PLANO S-03 | OK, com reforços: campo não oferecido ao gerenciador de senhas; `POST /users` em chamada única sem retentativa automática; tratamento de erros do framework; avisos de "será pedida de novo" na interface; proibição de reaproveitar a senha em outros conectores |
| **Q-27** — Alocação na entrega física | O ativo fica `ALOCADO` na entrega física. A assinatura do TER tem estado próprio e pode ficar pendente sem desfazer a alocação | MODELO §8.3, §8.5, §9.3, §12; ARQ §12.1; DESIGN §10.3; PLANO §6 (critério 1a) | OK, com correção: o responsável atual deriva somente de alocação `ATIVA`, porque itens em rascunho são reserva |
| **Q-30** — Permissões individuais | Permissões sensíveis podem ser concedidas individualmente, mas nunca contornam restrições obrigatórias. Aplicação no backend, com auditoria | RBAC §3.9, §3.10, §9; MODELO §5.3; ARQ §10.1 | **Corrigido** — três contornos fechados (§6, item 1) |

Q-04, Q-07 e Q-30 não se contradizem. As restrições obrigatórias só alcançam quem tem `ESTAGIARIO_TI` ou não tem perfil administrativo, e não reduzem a autoridade de Supervisor TI e Gestor ADM. A autoaprovação vale apenas para esses dois perfis.

---

## 5. Atualização Q-09

**Fatos informados pela TI** (inspeção no Centro de Administração do Microsoft Entra):

| Atributo | Informação confirmada |
|---|---|
| Nome do tenant corporativo | Virta |
| Domínio principal | `virtaeng.onmicrosoft.com` |
| Licenciamento do diretório | Microsoft Entra ID P1 |
| Estrutura | Todas as empresas do Grupo Vallur usam o mesmo tenant |
| Troca de diretório | Somente **Virta** apareceu entre os diretórios acessíveis à conta consultada |

**Interpretação:** nenhum tenant de testes dedicado foi identificado **entre os diretórios acessíveis à conta inspecionada**. Isso **não prova** que a organização não tenha outro tenant. O tenant Virta é de produção e não é tratado como ambiente de testes.

**Situação:** **PENDENTE — ambiente seguro de testes de integração Microsoft 365 ainda não definido.**

**O que fica bloqueado e o que não fica** (`INTEGRACOES.md` §13.1):

| Pode avançar sem Q-09 | Bloqueado por Q-09 |
|---|---|
| Toda a Etapa 0; toda a fundação (Etapa 1); desenvolvimento dos conectores em `SIMULACAO`; testes de contrato, reconciliação, fila e concorrência; fluxo Q-25 com conector simulado; trava de ambiente | I-02 (Graph com escrita real), I-03 (Exchange PowerShell), testes reais de Teams; por consequência A-03 e I-04 |

**Dependências relacionadas, que não são Q-09:**
- **Q-33.** O login real em desenvolvimento exigiria registrar um app de login, com escopos delegados mínimos, no tenant de produção. Isso só pode acontecer com autorização explícita.
- **Q-34 (nova).** Ambientes não produtivos não leem dados reais do tenant até que haja decisão.

**Opções para decidir Q-09** (nenhuma aprovada; detalhes em `INTEGRACOES.md` §13.2):
1. Tenant de testes dedicado (recomendada).
2. Confirmar, com conta de maior alcance, se já existe outro tenant.
3. Uso controlado do tenant de produção, com isolamento. Não autorizado e não proposto como padrão.
4. Validar somente em produção. Não recomendado.

O sandbox do Microsoft 365 Developer Program tem elegibilidade restrita (assinantes Visual Studio Professional/Enterprise, parceiros elegíveis ou clientes Premier/Unified), conforme a documentação oficial.

**O que o P1 implica** (documentação oficial; nada testado no tenant):
- Disponível: Acesso Condicional para usuários e unidades administrativas.
- **Não incluído:** Acesso Condicional para identidades de carga de trabalho. Exige Workload Identities Premium.
- Licenciamento por grupo: não verificado.

---

## 6. Problemas encontrados e correções

### 6.1 Correções de segurança e de regra de negócio

| # | Problema | Origem | Correção | Arquivos |
|---|---|---|---|---|
| 1a | Pessoa com `ESTAGIARIO_TI` **e** perfil administrativo aprovaria, contrariando Q-30 | Revisão de segurança | Restrição obrigatória também dispara com `ESTAGIARIO_TI` ativo e prevalece sobre a soma de perfis; os dois perfis não coexistem (PROPOSTA; Q-31 f) | RBAC §3.10; ARQ §10.1, §16 |
| 1b | Permissões individuais continuavam valendo após a perda do perfil de TI | Revisão de backend | Só contam com perfil de TI ativo; revogação do último perfil revoga as concessões, com auditoria | RBAC §3.9, §3.10; ARQ §10.1 |
| 1c | `carga.importar` (concedível a Estagiário) gravaria `entra_object_id`, contornando `colaborador.vincular_identidade` | Revisão de segurança | Carga apenas propõe vínculos; gravação exige quem tem `vincular_identidade`; carga não mexe em perfis | RBAC §3.3, §3.10; MODELO §14.3 |
| 2 | Edição de solicitação aprovada ou em execução não tinha transição para nova aprovação (Q-04) | Revisões de backend e arquitetura | Transições `APROVADA`/`EM_EXECUCAO → AGUARDANDO_APROVACAO`; regras de nova versão; critério de aceite testável | MODELO §6.6; PLANO §5 |
| 3 | Risco de segunda conta Microsoft quando nova versão corrige o UPN | Revisão de backend | `verificarEstado()` da criação de conta consulta primeiro o `oid` vinculado e o marcador do portal | INTEGRACOES §2.5 |
| 4 | Edição do catálogo após a aprovação mudaria o efeito executado (Q-04) | Revisão de segurança | Identificadores externos resolvidos no conteúdo aprovado; worker compara antes de executar; grupos proibidos na configuração de implantação | MODELO §6.2 |
| 5 | Caminhos residuais da senha (Q-25): gerenciador de senhas, retentativa automática, log do framework | Revisão de segurança | Ver §4 (Q-25) | ARQ §11.4; DESIGN §9, §9.2, §13; PLANO S-03 |
| 6 | Interface sem aviso de nova digitação da senha após a aprovação | Revisão de frontend | Avisos na revisão, no toast de aprovação, em falhas; etiqueta "Aguardando senha inicial" | DESIGN §9.2 |
| 7 | Menus derivados do perfil no cliente divergiriam das permissões individuais | Revisão de frontend | Visibilidade a partir das permissões efetivas calculadas no servidor | DESIGN §7.1 |
| 8 | `auth_time` (reautenticação) é declaração opcional no Entra ID | Revisão de segurança; verificado em documentação oficial | Configurar a declaração; token sem `auth_time` é recusado. *Obsoleto na Revisão 01.4: não há login Entra; a reautenticação é própria (ARQ §9.3 atual)* | ARQ §9.3 |
| 9 | Cache compartilhado de dados por usuário não estava proibido | Revisão de segurança | Regras de cache e teste E2E com dois usuários | ARQ §6.1 |
| 10 | Aplicação poderia gravar selos falsos na auditoria; âncoras regraváveis | Revisão de segurança | Papel `portal_selo`; âncoras com credencial separada, só de acréscimo | MODELO §11.2 |
| 11 | Bootstrap do primeiro administrador sem salvaguardas | Revisão de segurança | Execução única, `oid` prévio, evento `SISTEMA`, checagem de ambiente. *Revisão 01.4: o bootstrap não exige mais `oid` e cria a conta de acesso com senha lida sem eco (ARQ §9.6)* | ARQ §9.6 |
| 12 | Escopo do Exchange admitia papel de alcance amplo | Revisão M365 | Somente grupo de função personalizado limitado a caixas compartilhadas | INTEGRACOES §3 |

### 6.2 Q-09, ambientes e repositório

| # | Problema | Correção | Arquivos |
|---|---|---|---|
| 13 | Q-09 sem os fatos da inspeção; tenant chamado "Vallur" | Registro da inspeção; tenant Virta; opções de decisão; implicações do P1 | ARQ §5.1, §9.1, §13.1, §14 (R-02), §16; INTEGRACOES §0, §13; PLANO §14 |
| 14 | Nenhum mecanismo impedia escrita no tenant de produção por erro de configuração | DA-23 (§3) e critério de aceite 10 da Etapa 1 | ARQ §13.1.1, §15; PLANO §4; DESIGN §7.3 |
| 15 | Etapa 0 previa "app registrations de desenvolvimento (login **e automação**)", o que no único tenant conhecido significaria credenciais de produção em desenvolvimento | Somente app de login delegado, se Q-33 autorizar; nenhuma permissão de aplicação no tenant de produção | PLANO §3; ARQ §13.1 |
| 16 | Etapa 0 listava Q-09 como pré-requisito | Q-09 movida para onde bloqueia (I-02/I-03) | PLANO §3 |
| 17 | Etapa 2 e carga inicial liam o tenant real a partir de homologação | Q-34; leitura real só em produção após A-06, salvo decisão | PLANO §5; MODELO §14.3; ARQ §16 |
| 18 | Selagem da auditoria na Etapa 1 dependia de fila e worker previstos só na Etapa 2 | Núcleo da fila, worker mínimo e agendador movidos para a Etapa 1 | PLANO §4 |
| 19 | Etapa 0 previa "arquivos de referência no repositório", em conflito com R-21 | Repositório sem dados pessoais; versões sanitizadas quando a TI produzir | PLANO §3 |
| 20 | `.gitignore` não cobria os arquivos sensíveis | Reforçado e verificado com `git check-ignore` (§7.2) | `.gitignore` |
| 21 | `CLAUDE.md` com condição obsoleta; `README.md` desatualizado | Atualizados | `CLAUDE.md`, `README.md` |

### 6.3 Consistência e referências

| # | Problema | Correção |
|---|---|---|
| 22 | `REVISAO_FINAL_FASE_01.md` citado em todos os documentos, mas inexistente | Este arquivo; referências ajustadas (§6, §7.2, §8–9, §10.2, §12) |
| 23 | R-01 apontava a análise do TER para este arquivo | Aponta para `MODELO_DE_DADOS.md` §9.4 |
| 24 | Prisma 8 RC: `npm install prisma` sem versão instala o CLI do 8, segundo a documentação oficial | Fixação explícita de `prisma@7` e `@prisma/client@7` (ARQ §13.3.1) |
| 25 | Node 24 entra em LTS de manutenção em 20/10/2026 | Texto ajustado; a escolha continua válida até 30/04/2028 (ARQ §13.3.1) |
| 26 | MODELO recomendava índices parciais por recurso *Preview* e, quatro linhas depois, SQL manual | Padrão proposto: (b) SQL manual com verificação no CI; (a) só se `partialIndexes` sair de *Preview* (MODELO §12) |
| 27 | Rótulos de Q-04 marcados como PROPOSTA | Corrigidos para DECISÃO-TI (RBAC §4.2; MODELO §12) |
| 28 | Rótulo de transição do ativo e responsável atual (Q-27) | MODELO §8.2, §8.3 |
| 29 | Auditoria sem `ambiente` e sem marca de aprovador = alvo (Q-31 a) | MODELO §6.4, §11.1 |
| 30 | `server-only` incompatível com o worker em Node puro | Registrado como ponto a resolver na Etapa 1 (ARQ §7.1) |
| 31 | Rótulo Mermaid com `<` | Substituído por texto (INTEGRACOES §1.3) |
| 32 | Paleta descrita como "institucional" | "preliminar, Q-22" (DESIGN §1) |

Novos identificadores: DA-23, R-23, Q-34, Q-35 (canal de alertas), itens (e) e (f) da Q-31.

---

## 7. Riscos de segurança

### 7.1 Exposição do repositório

**Estado do Git (verificado):**
- A branch `main` não tem commits.
- O índice está vazio e o banco de objetos também (`git count-objects`: 0).
- Não há remotos nem *stash*.

**Consequência:** nenhum arquivo foi rastreado, e **não há histórico a remediar**. Isso não cobre cópias fora do Git (pastas copiadas, sincronizadas ou compartilhadas), que não foram avaliadas.

**Arquivos sensíveis no diretório de trabalho.** Contagem automatizada; nenhum valor foi lido nem reproduzido. Os padrões de CPF consideram dígitos verificadores válidos, então falsos positivos são possíveis.

| Arquivo | Categorias encontradas | Risco |
|---|---|---|
| `docs/SGSI/SGSI - Novo Usuário.xlsx` | Coluna de senhas iniciais e logins; e-mails | **Crítico** — senhas em texto puro (R-21, R-22) |
| `docs/Inventário/Inventário de TI.xlsx` | Aba de colaboradores com ~21 padrões compatíveis com CPF; aba de logins de ferramentas de IA com coluna de senha; padrões de chave de produto; e-mails | **Crítico** — CPFs e credenciais (R-21, R-23) |
| `TER - TDV/TER_VALLUR_v22.html` | ~20 padrões distintos compatíveis com CPF (catálogo de colaboradores embutido) | **Alto** — dados pessoais (R-21) |
| `TER - TDV/TDV_VALLUR_v08.html` | Nenhum padrão de CPF identificado. Os termos sensíveis encontrados parecem rótulos de formulário | Tratar como sensível até revisão da TI |
| `docs/SGSI/SGSI - Teams.xlsx` | ~114 e-mails associados a cargos e equipes; vínculos externos | **Médio** — dados pessoais (R-23) |
| `docs/dISTRIBUIÇÃO DE CUSTOS/Distribuição de Custos.xlsx` | ~57 e-mails associados a licenças e rateios; vínculos externos | **Médio** — dados pessoais e financeiros (R-23) |
| `SGSI - Senhas.xlsx` (citado no PM §14) | **Não está no repositório** | — |
| `.env`, chaves, certificados, *connection strings* | Nenhum encontrado | — |
| Arquivos que seriam versionados (`docs/*.md`, `CLAUDE.md`, `README.md`, `.mcp.json`, `.gitignore`) | Nenhum CPF, e-mail pessoal, token ou chave privada encontrado | — |

### 7.2 Precauções antes do primeiro commit

O `.gitignore` agora cobre:
- as pastas dos materiais da TI;
- `*.xlsx`, `*.xls`, `*.xlsm`, `*.csv` (exceto fixtures de teste) e `*.zip`;
- modelos TER/TDV;
- certificados e chaves (`*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.cer`, `*.crt`, `*.jks`);
- *dumps* e cópias de banco;
- artefatos de teste que guardam sessão.

Verificado com `git check-ignore`. Os únicos arquivos que um `git add` incluiria são os 14 documentos e configurações (os `.md` de `docs/` e `docs/plano-mestre/`, o PDF do Plano Mestre, `CLAUDE.md`, `README.md`, `.mcp.json` e `.gitignore`).

**O `.gitignore` não torna os arquivos seguros para publicação**: não impede `git add -f`, não cobre cópia da pasta e não removeria um arquivo que já estivesse rastreado.

Sequência obrigatória (PLANO §3):
1. Mover os originais para fora do repositório, em local controlado pela TI, ou confirmar que continuam ignorados.
2. Fazer uma varredura de segredos no diretório (ex.: gitleaks; a ferramenta **não** foi instalada nesta fase).
3. Fazer o primeiro commit com caminhos explícitos, nunca `git add -A`.
4. Revisar `git status` e `git ls-files` antes do push.
5. Criar o repositório privado com dono organizacional e só então fazer o push.
6. Confirmar se o plano GitHub contratado oferece proteção de branch, proteção de push de segredos e revisores obrigatórios em *environments* de implantação em repositório privado. Se não oferecer, manter a varredura no *pre-commit* e no CI.

### 7.3 Credenciais

- As senhas e logins presentes nas planilhas devem ser **tratados como expostos**. Trocar senhas cabe à TI e está fora do escopo desta fase; nenhuma credencial foi alterada.
- O procedimento atual de senha inicial é previsível e registrado em planilha (R-22). O portal não gera nem guarda senhas (Q-25). A recomendação é exigir troca no primeiro acesso (Q-03).
- Credenciais de aplicação: certificados, sem segredos (DA-09). As de produção nunca chegam a ambientes não produtivos (DA-23).

### 7.4 Acesso administrativo

- Os três contornos de Q-30 foram corrigidos (§6.1).
- **Riscos que continuam:**
  - A autoaprovação reduz a segregação de funções. É uma decisão aprovada (R-20), mitigada por marcação, filtro e revisão periódica.
  - Quem informa a senha inicial conhece a senha da nova conta (Q-31 e).
  - Permissões de aplicação do Graph (`User.Create`, `LicenseAssignment.ReadWrite.All`, `GroupMember.ReadWrite.All`) valem para o tenant inteiro (R-03). Usar unidades administrativas para proteger contas privilegiadas é opção a avaliar na Etapa 2 (PB-17).
- `User.Create` foi confirmado como permissão de aplicação de menor privilégio para `POST /users` na documentação oficial.

### 7.5 Proteção de dados

- CPF cifrado com HMAC (DA-11).
- Escopo `PROPRIO` aplicado na consulta, com 404 para registros de terceiros.
- Auditoria imutável com cadeia de hash e âncora externa.
- Storage privado com URLs curtas e arquivos sem dono negados.
- Pendências:
  - LGPD (Q-17) bloqueia a carga de dados reais.
  - O login de desenvolvimento no tenant de produção (Q-33) traria nomes e `oid` reais ao banco de desenvolvimento; isso exige registro da exceção na autorização.
  - A memória do processo web durante a criação da conta é minimizada, não eliminada (R-07).

---

## 8. Pendências bloqueadoras da Etapa 0 (Categoria A)

Só estão aqui as pendências que impedem **começar com segurança** a preparação e a fundação.

| ID | Descrição | Área | Impacto técnico | Prioridade | Ação necessária | Responsável | Dependência de aprovação | Bloqueia |
|---|---|---|---|---|---|---|---|---|
| PA-01 | Arquivos com CPFs, senhas e chaves no diretório do repositório (R-21, R-23) | Repositório | Um commit descuidado exporia dados pessoais e credenciais | Crítica | Seguir §7.2 antes do primeiro commit; a TI decide onde guardar os originais | TI | Não | A criação do repositório e o primeiro commit (atividades da Etapa 0) |
| PA-02 | Aprovação formal das decisões propostas (DA-01, DA-03 a DA-13, DA-15 a DA-23) e das propostas novas de §3 | Arquitetura | Sem ela não há base aprovada para a fundação | Alta | Aprovar ou ajustar por escrito | TI Vallur | **A-00** | A Etapa 0 inteira |

Mais nenhuma questão aberta bloqueia a Etapa 0. **Q-09 não é bloqueio da Etapa 0** (§5).

---

## 9. Pendências não bloqueadoras e dependências futuras

### 9.1 Categoria B — bloqueiam um módulo, integração ou marco específico

| ID | Descrição | Área | Impacto | Prioridade | Ação | Responsável | Aprovação | Bloqueia |
|---|---|---|---|---|---|---|---|---|
| PB-01 | **Q-09** — ambiente seguro de testes Microsoft 365 | Integração M365 | Sem validação real de escrita | Alta | Decidir uma opção de `INTEGRACOES.md` §13.2 até o fim da Etapa 2 | TI | Decisão escrita da TI | I-02, I-03, A-03, I-04 |
| PB-02 | **Q-33** — app de login de desenvolvimento no tenant de produção | Autenticação | Sem login real em desenvolvimento | Média | Autorizar ou não; se sim, nas condições da DA-23 | TI | Autorização explícita | Critério 1 da Etapa 1 e A-02 |
| PB-03 | **Q-34** — leitura de dados reais do tenant fora de produção | Integração M365 / LGPD | Ensaio de carga e duplicidade só simulados | Média | Decidir | TI | Decisão da TI | Ensaio real da carga inicial (Etapa 2) |
| PB-04 | Q-15, Q-18, Q-31 (d, f) | Fundação | Parâmetros e premissas provisórias em uso | Média | Responder | TI | — | Fechamento da Etapa 1 (não o início) |
| PB-05 | Q-02, Q-03, Q-05, Q-10, Q-23, Q-28, Q-31 (a, c, e) | Colaboradores e M365 | Regras de e-mail, senha, grupos e marcador | Alta | Responder antes da Etapa 2 | TI | — | Etapa 2 |
| PB-06 | Q-01 (aprovar análise do TER; versões sem dados pessoais), Q-12, Q-13, Q-19, Q-26, Q-32 | Inventário e TER | TER não pode ser implementado | Alta | Responder | TI | Aprovação da análise | Etapa 3 (TER) |
| PB-07 | Q-11, Q-14 | Tutoriais e chamados | Tutoriais e SLA | Média | Responder | TI | — | Etapa 4 |
| PB-08 | Q-24 | Diário de Obra, D4Sign, Konviva | Automação só após confirmação; até lá, tarefa manual | Média | Contatos e contratos com fornecedores | TI + fornecedores | A-07 por conector | Etapa 5 |
| PB-09 | Q-08, Q-16, Q-17, Q-29, Q-35 | Infraestrutura, LGPD, operação | Produção, backup, retenção, antimalware, alertas | Alta | Responder | TI (+ jurídico em Q-17) | A-06 | Etapa 7a; Q-17 bloqueia qualquer carga real |
| PB-10 | Tabela única do estado agregado da solicitação (`AGUARDANDO_ACAO_MANUAL` não deve virar "concluída com pendências") — BE-03 | Backend | Estado exibido incorreto | Média | Detalhar no desenho da Etapa 2 | Desenvolvimento | — | Etapa 2 |
| PB-11 | Onde fica o rascunho da solicitação e permissão `solicitacao.devolver` — BE-04 | Backend / RBAC | Fluxo de rascunho indefinido | Média | Detalhar | Desenvolvimento | Inclusão no catálogo | Etapa 2 |
| PB-12 | Gatilhos de imutabilidade para todas as tabelas somente-inserção, não só auditoria — BE-05 | Banco | Imutabilidade só declarada | Média | Incluir nas migrações com teste | Desenvolvimento | — | Etapas 1–3 |
| PB-13 | Definição única de autoaprovação e canonicalização do hash (ex.: RFC 8785) — BE-08 | Backend | Divergência de cálculo | Baixa | Fixar no desenho | Desenvolvimento | — | Etapa 2 |
| PB-14 | Cancelamento durante execução e transições `FALHOU`/`EM_EXECUCAO → CANCELADO` — BE-09, ARQ-03 | Backend | Comportamento indefinido em corrida | Média | Detalhar | Desenvolvimento | — | Etapa 2 |
| PB-15 | Endurecer a fila: limite de tentativas na recuperação de arrendamento, renovação de arrendamento, concorrência por sistema, limite para resultado desconhecido — ARQ-02 | Backend | Laço infinito ou execução duplicada | Alta | Detalhar e testar | Desenvolvimento | — | Etapa 2 |
| PB-16 | `server-only` × worker; modo do pooler (transação × sessão) — ARQ-04, ARQ-05 | Fundação | Worker pode não iniciar; conexões | Média | Decidir no início da Etapa 1 | Desenvolvimento | — | Etapa 1 |
| PB-17 | Proteção de contas privilegiadas contra permissões de aplicação (unidades administrativas) e reconciliação diária com o log de auditoria do Entra — M365-02, M365-03 | Segurança M365 | Credencial comprometida afeta o tenant | Média | Avaliar com a TI | TI + desenvolvimento | — | Etapa 2 / I-04 |
| PB-18 | Monitoramento e alertas (saúde do worker, fila parada, selagem, âncoras, backups, certificados, revelações de CPF) — OPS-04 | Operação | I-04 exige "monitoramento ativo" sem definição | Alta | Desenhar; batimento do worker e alerta de selagem já na Etapa 1 | Desenvolvimento + TI (Q-35) | A-06 | Etapa 7a |
| PB-19 | Backup e restauração: executor do `pg_dump`, credencial de backup fora da aplicação, modo somente leitura no corte, restauração completa — OPS-05 | Operação | Restauração pode quebrar a cadeia de auditoria | Média | Detalhar | Desenvolvimento + TI | — | Etapa 7a (S-09) |
| PB-20 | Migrações executadas no host de implantação, sem credencial de dono no CI — OPS-06 | DevOps | Credencial privilegiada no GitHub | Média | Detalhar | Desenvolvimento | — | Etapas 1 e 7a |

### 9.2 Categoria C — não bloqueantes

| ID | Descrição | Ação |
|---|---|---|
| PC-01 | Q-06 (CPF e auditoria para Estagiário), Q-20 (confirmação formal do local do PM), Q-21 (escopo por empresa), Q-22 (marca oficial), Q-31 (b) | Responder quando conveniente; premissas atuais seguem o PM |
| PC-02 | Chromium herda variáveis de ambiente do worker (ARQ-08) | Ambiente mínimo ou contêiner próprio de renderização (Etapa 3) |
| PC-03 | Extensões do Supabase ficam no esquema `extensions` (ARQ-09) | Calcular hashes na aplicação; documentar `search_path` |
| PC-04 | Diagramas: pequenas omissões (worker → storage; topologia sem antimalware e backup; atalho no ciclo da ação) (ARQ-10) | Ajustar ao detalhar as etapas |
| PC-05 | Alvo de toque de 36 px × 44 px abaixo de `lg` (FE-05) | Ajustar tokens na Etapa 1 |
| PC-06 | Teste de "todos os enums" pegaria enums que não são de estado (QA-06) | Usar lista explícita |
| PC-07 | `.mcp.json` usa `shadcn@latest` sem versão fixa; os MCPs `playwright` e `chrome-devtools` citados no `CLAUDE.md` não estão no `.mcp.json` do projeto (podem estar na configuração do usuário) | Fixar versão e decidir o escopo dos MCPs na Etapa 0 (não alterado nesta revisão) |
| PC-08 | A instrução da Fase 01 (`REQ-PROMPT`) não está versionada | Versionar uma cópia sem dados sensíveis, se a TI quiser rastreabilidade |
| PC-09 | Confirmações para ações críticas: entrega física, reprocessar, cancelar com efeitos, nova versão (FE-03) | Incluídas no DESIGN §9.1; validar no protótipo |

---

## 10. Verificações realizadas

### 10.1 Atividades

| Verificação | Como foi feita | Resultado |
|---|---|---|
| Localização do Plano Mestre | Inspeção de `docs/plano-mestre/` | `PORTAL_TI_VALLUR_PLANO_MESTRE.md` (v1.1) e `.pdf` (13 páginas) |
| `CLAUDE.md` aponta o PM correto | Leitura | Correto |
| Estado do Git e histórico | `git ls-files`, `git diff --cached`, `git count-objects -v`, `git for-each-ref`, `git stash list`, `git remote -v` | Sem commits, objetos, remotos ou *stash* |
| Arquivos sensíveis | Script próprio que **conta** padrões (CPF com dígito verificador, e-mail, chave de produto, palavras-chave) por arquivo e por aba, sem imprimir valores | §7.1 |
| `.gitignore` | `git check-ignore -v` e `git ls-files --others --exclude-standard` | Sensíveis ignorados; restam 14 arquivos versionáveis, sem dados sensíveis na varredura (o PDF não foi varrido por falta de extração de texto) |
| Referências entre documentos | Script que confere `DOC §n` e `PM §n` contra os títulos reais e a existência dos arquivos citados | Rodado depois das edições; resultado em §10.3 |
| Identificadores | Script que confere DA, Q e R usados × definidos | Todos os usados estão definidos (DA: 23, Q: 35, R: 23) |
| Revisão de arquitetura e DevOps | Agente com as skills `engineering-skills:senior-architect` e `engineering-skills:senior-devops` | Achados ARQ-01 a ARQ-10 e OPS-01 a OPS-07 |
| Revisão de segurança e Microsoft 365 | Agente com as skills `engineering-skills:senior-security` e `engineering-skills:ms365-tenant-manager` | Achados SEC-01 a SEC-11 e M365-01 a M365-06 |
| Revisão de backend, QA e frontend | Agente com as skills `engineering-skills:senior-backend`, `engineering-skills:senior-qa` e `engineering-skills:senior-frontend` | Achados BE-01 a BE-10, QA-01 a QA-07, FE-01 a FE-08 |
| Fatos de plataforma | Documentação oficial (nodejs.org, nextjs.org, prisma.io, postgresql.org, supabase.com, learn.microsoft.com) | §10.2 |
| Diagramas Mermaid | Inspeção da sintaxe dos blocos Mermaid (16 no total) e da coerência com o texto (agente de arquitetura) | Sintaxe plausível; um rótulo corrigido; omissões em PC-04 |

Os agentes registraram que as skills carregaram sem erro. Eles trabalharam em paralelo às edições, por isso parte dos números de linha citados se refere a estados intermediários dos documentos. Todos os achados foram conferidos pelo conteúdo antes de qualquer correção.

### 10.2 Versões e compatibilidade (documentação oficial, 14/10/2026)

| Item | Fato verificado | Fonte |
|---|---|---|
| Node.js 24 | LTS ativa até 20/10/2026; manutenção até 30/04/2028 | https://nodejs.org/en/about/previous-releases |
| Node.js 26 | Vira LTS em 28/10/2026; não consta nas versões suportadas pelo Prisma 7 | idem; https://www.prisma.io/docs/orm/reference/system-requirements |
| Node.js 22 / 20 | 22: fim em 30/04/2027; 20: fora de suporte desde 30/04/2026 | idem |
| Next.js | 16.4 é a mais recente (06/10/2026); série 16 em LTS ativa; Node mínimo 20.9; `middleware` renomeado para `proxy` | https://nextjs.org/blog ; https://nextjs.org/support-policy ; https://nextjs.org/docs/app/guides/upgrading/version-16 |
| Prisma 7 | Linha estável; Node `^20.19`, `^22.12`, `^24`; PostgreSQL 9.6 a 18; *driver adapter* obrigatório; `partialIndexes` em *Preview* | https://www.prisma.io/docs/orm/release-status ; https://www.prisma.io/docs/orm/v7/reference/supported-databases |
| Prisma 8 | *Release candidate*; `npm install prisma` sem versão já instala o CLI do 8; a doc orienta `prisma@7` | https://www.prisma.io/docs/orm/release-status |
| PostgreSQL | 14: fim em 12/11/2026; 17: 08/11/2029; 18: 14/11/2030; 19 em beta | https://www.postgresql.org/support/versioning/ |
| Supabase | "Postgres 17 is what we currently default to" (post de 18/05/2026, sobre auto-hospedagem — ver §11) | https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change |
| Graph — criar usuário | Permissão de aplicação de menor privilégio: `User.Create` | https://learn.microsoft.com/en-us/graph/api/user-post-users?view=graph-rest-1.0 |
| Graph — grupos | Grupos de distribuição e de segurança habilitados para e-mail: somente leitura no Graph | https://learn.microsoft.com/en-us/graph/api/resources/groups-overview |
| Exchange | Admin API (preview) não cria caixas compartilhadas nem concede FullAccess/SendAs; "RBAC for Applications" cobre acesso a dados por Graph/EWS, não cmdlets administrativos | https://learn.microsoft.com/en-us/exchange/reference/admin-api-overview ; https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac |
| Entra ID — `auth_time` | Declaração opcional, precisa ser configurada | https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference |
| Entra ID P1 | Acesso Condicional para usuários e unidades administrativas incluídos; Acesso Condicional para identidades de carga de trabalho exige Workload Identities Premium | https://learn.microsoft.com/en-us/entra/fundamentals/licensing ; https://learn.microsoft.com/en-us/entra/identity/conditional-access/workload-identity |
| M365 Developer Program | Sandbox com elegibilidade restrita | https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-faq |

**Conclusão:** Node 24 + Next.js 16 + Prisma 7 + PostgreSQL 17 é uma combinação compatível e suportada. Ressalvas: fixar `prisma@7`; reavaliar Node 26 somente quando o Prisma passar a suportá-lo.

### 10.3 Revalidação após as edições

Depois de concluir as edições, o script de referências e de identificadores foi executado de novo:
- todas as referências `DOC §n` e `PM §n` existem;
- todos os DA, Q e R citados estão definidos;
- todos os arquivos citados existem.

Uma revisão independente final foi feita por agente com a skill `engineering-skills:senior-qa`, sobre o estado já editado. Resultado:
- nenhum defeito crítico ou alto;
- Q-04, Q-07, Q-25, Q-27 e Q-30 consistentes em todos os documentos;
- nenhum dado pessoal ou segredo nos arquivos versionáveis;
- 12 ajustes médios ou baixos, todos aplicados: papel `portal_selo` também na arquitetura, ressalva da DA-09 fora de produção, classificação da A-00 no plano, redação de Q-09 sem sugerir que não exista outro tenant, rótulos de PROPOSTA e contagem das barreiras da DA-23.

Depois desses ajustes, o script de referências foi executado de novo, sem erros. A única exceção é intencional: o caminho antigo `docs/PORTAL_TI_VALLUR_PLANO_MESTRE.md` aparece em `ARQUITETURA_TECNICA.md` §8 justamente para registrar que ele não existe.

---

## 11. Limitações das verificações

| Item | Situação |
|---|---|
| Renderização dos diagramas Mermaid | **Não verificada.** Exigiria instalar ferramenta (proibido nesta fase); só houve inspeção de sintaxe |
| Equivalência entre o PDF e o `.md` do Plano Mestre | **Não verificada.** Não há ferramenta de extração de texto de PDF disponível; o `.md` foi tratado como texto oficial |
| Conteúdo das planilhas e dos HTML | Não lido. Só contagens por expressões regulares, com possibilidade de falsos positivos e negativos. A conclusão de §7.1 vale como indício, não como inventário completo |
| Varredura de segredos com ferramenta dedicada (ex.: gitleaks) | **Não executada.** Não está instalada e instalar é proibido; substituída por varredura própria limitada |
| Tenant Virta | Nenhuma inspeção própria. Os fatos de §5 foram informados pela TI |
| Versão PostgreSQL padrão dos projetos novos do Supabase | Indício oficial (post sobre auto-hospedagem), não confirmação. Conferir no painel do projeto (DA-21) |
| Requisito de licença do licenciamento por grupo | Não verificado (páginas oficiais divergentes); não é usado na proposta |
| Recursos do plano GitHub (proteção de branch e de push em repositório privado) | Não verificados; ficam para a Etapa 0 |
| Cópias dos arquivos sensíveis fora do Git | Não avaliadas |
| Testes automatizados, Playwright e revisão visual | Não aplicáveis: não há código nem telas nesta fase |

---

## 12. Checklist de aprovação A-00

### 12.1 Requisitos atendidos nesta revisão

- [x] Plano Mestre v1.1 localizado e lido (`docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md`)
- [x] Os seis documentos técnicos inspecionados e atualizados
- [x] `CLAUDE.md` verificado e atualizado
- [x] Q-04, Q-07, Q-25, Q-27 e Q-30 refletidas de forma consistente (§4)
- [x] Q-09 registra os fatos da inspeção sem afirmar que não existe outro tenant, e permanece **pendente** (§5)
- [x] Autenticação, RBAC e aprovações coerentes; três contornos de Q-30 corrigidos
- [x] Senha inicial sem caminho de persistência controlado pela aplicação (limite de memória reconhecido, R-07)
- [x] Alocação e assinatura do TER independentes
- [x] Integrações classificadas em confirmado, não confirmado e proposto (`INTEGRACOES.md` §12), sem endpoints inventados
- [x] Arquivos sensíveis identificados; `.gitignore` revisado e reforçado; histórico Git verificado (sem commits)
- [x] Referências cruzadas revalidadas
- [x] Revisões especializadas executadas com as skills disponíveis
- [x] Pendências separadas em A, B e C
- [x] Nenhuma operação proibida executada

### 12.2 Pendente — a cargo da TI Vallur

- [ ] Aprovar ou ajustar por escrito DA-01, DA-03 a DA-13 e DA-15 a DA-23, e as propostas novas de §3 (PA-02)
- [ ] Decidir onde ficam os originais das planilhas e modelos e tratar as credenciais nelas como expostas (PA-01; §7.3)
- [ ] Registrar formalmente a aprovação A-00 e a autorização para iniciar a Etapa 0

### 12.3 Condições propostas para a aprovação

1. **Repositório:** nenhum commit antes de cumprir §7.2.
2. **Microsoft 365:**
   - nenhuma app registration com permissão de aplicação no tenant Virta para desenvolvimento ou homologação;
   - nenhuma escrita, e nenhuma leitura de dados reais fora de produção (Q-34), sem autorização específica;
   - o app de login de desenvolvimento só com autorização (Q-33).
3. **Q-09:** permanece pendente e precisa ser decidida até o fim da Etapa 2. Até lá, os conectores ficam em `SIMULACAO` e a trava de ambiente (DA-23) faz parte da fundação.
4. **Dados reais:** nenhuma carga de dados pessoais reais antes de Q-17.

---

## 13. Recomendação de prontidão

**Classificação: APROVÁVEL COM CONDIÇÕES.**

**Justificativa:**
- **Fundação definida.** Arquitetura, modelo de dados, RBAC, integrações, design system e plano estão completos para a fundação. Eles são coerentes com o PM v1.1 e com as cinco decisões aprovadas (§4), e as contradições encontradas foram corrigidas (§6).
- **Nenhum bloqueio crítico de arquitetura ou segurança sem tratamento.**
  - Os contornos de Q-30 foram fechados.
  - O risco de um único tenant de produção foi convertido em salvaguardas de projeto (DA-23) e em dependência localizada (Q-09 → I-02/I-03).
  - A exposição de dados sensíveis está identificada, não ocorreu no Git e tem procedimento definido (§7.2).
- **Pendências classificadas.** Só duas pendências bloqueiam a Etapa 0 (§8), e as duas dependem de ação da TI, não de mais arquitetura. As demais têm etapa e responsável (§9).
- **Por que não "aprovável" sem condições:**
  - PA-01 exige uma ação concreta antes do primeiro commit.
  - Q-09 e Q-33 limitam atividades que normalmente fariam parte das Etapas 1 e 2.
  - Há propostas novas (DA-23 e os reforços de RBAC) que ainda precisam de aprovação.

**Importante:**
- Esta recomendação **não** constitui a aprovação A-00. A aprovação formal é do responsável autorizado da TI Vallur.
- Mesmo com a A-00, a Etapa 0 **não** começa sem autorização explícita.

---

## 14. Revisão 01.4 — atualização consolidada de autenticação, cadastro e permissões (15/10/2026)

### 14.1 Origem e escopo

- **Origem:** instrução de atualização consolidada da TI recebida na sessão de 15/10/2026, com duas confirmações feitas na mesma sessão:
  - a aprovação foi removida de **todo** o provisionamento (criação, alterações em contas existentes, Teams e desligamento), não só da admissão;
  - a permissão de provisionamento do Estagiário TI é **concessão individual**, não padrão do perfil.
- **Escopo:** somente documentação. Nada foi implementado: nenhuma aplicação criada, nenhuma migração, nenhuma alteração no Supabase ou no tenant Virta, nenhuma dependência instalada, nenhum commit ou push.

### 14.2 Decisões substituídas e novas regras

| Decisão nova | Regra | Substitui ou afeta |
|---|---|---|
| **DT-01** | Autenticação própria do portal: login próprio com e-mail corporativo e senha, sessões próprias, sem SSO Microsoft; `entra_object_id` só para integrações | PM v1.1 §1, §4, §11, §15, §17.2, §19, §20; DA-02 (substituída); DA-03 e DA-09 (revistas); Q-33 (encerrada) |
| **DT-02** | Senha inicial definida pela TI no cadastro e usada na hora. Pode ser a mesma do Microsoft 365. Depois, as senhas são independentes. Sem ROPC, sem sincronização, sem ler senhas do Entra. O portal guarda só o hash | Q-25 (substituída); DA-08 (revista) |
| **DT-03** | Nenhum provisionamento depende de aprovação hierárquica. Ficam: confirmação explícita, permissão no backend, auditoria com executor e confirmação reforçada nas operações destrutivas | Q-04 (substituída); módulo Aprovações removido da V1; R-20 (encerrado) |
| **DT-04** | Supervisor TI e Gestor ADM sem relação hierárquica | Reafirma Q-07 |
| **DT-05** | Autoridade administrativa equivalente | Reafirma Q-07; PM §12 "A definir" passa a "Sim" |
| **DT-06** | Gestor ADM com experiência gerencial (painéis, indicadores, relatórios, auditoria), sem limitação de autorização | Novo |
| **DT-07** | Estagiário TI faz a operação diária. Provisiona só com permissão individual. Não altera perfis, permissões nem regras de segurança e não concede privilégios a si mesmo | Q-30 (mantida; restrições revistas); Q-31 (c) |

Registro completo em `ARQUITETURA_TECNICA.md` §16.2. Plano Mestre atualizado para a **versão 1.2**: o texto substituído está riscado e marcado com "(v1.2)", e o histórico de versões está no PM §25. **O PDF do Plano Mestre não foi regenerado: continua na v1.1 e está marcado como desatualizado.**

### 14.3 Decisões de arquitetura propostas e revistas (aguardam aprovação)

| ID | Situação | Conteúdo |
|---|---|---|
| DA-24 | Nova | Better Auth 1.7.x com versão exata fixada. Superfície mínima: entrar, sair e segundo fator. Política de sessão aplicada pelo portal. Cadastro público desativado. Prova de conceito na Etapa 1, com critério de saída e alternativa (R-27) |
| DA-25 | Nova | Argon2id com `@node-rs/argon2`, parâmetros do OWASP, *pepper* fora do banco e política de senha (Q-39) |
| DA-26 | Nova | MFA TOTP obrigatório para perfis de TI. Sem "lembrar dispositivo". Código TOTP repetido recusado. O próprio membro da TI não desativa o MFA. Ativação do perfil de TI com código de uso único (Q-43) |
| DA-27 | Nova | Limitador por (e-mail, IP) e por IP antes do hash, atraso progressivo, mensagem única, semáforo do Argon2id e desbloqueio de emergência |
| DA-02 | Substituída | Por DT-01 |
| DA-03, DA-04, DA-08, DA-09, DA-22 | Revistas | MSAL só para tokens de aplicação; sem grupo Entra como pré-requisito; criação síncrona na própria confirmação; duas app registrations; avaliação de permissão com alvo obrigatório |

### 14.4 Documentos alterados

| Arquivo | Alteração |
|---|---|
| `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md` | Versão 1.2. Ajustes em §1, §2, §3, §4, §11, §12, §13, §15, §17, §19, §20, §22 e §23. Novas §24 (autenticação e contas do portal) e §25 (histórico de versões) |
| `docs/plano-mestre/README.md` | PDF marcado como v1.1, desatualizado |
| `docs/ARQUITETURA_TECNICA.md` | Revisão 01.4: glossário, stack, fronteiras, rotas, §9 reescrita, §10, §11 (provisionamento sem aprovação), §13, riscos R-24 a R-27, DA-24 a DA-27, Q-36 a Q-43, §16.2 (DT-01 a DT-07), rastreabilidade |
| `docs/MODELO_DE_DADOS.md` | Novas tabelas: `conta_acesso`, `credencial_senha`, `fator_mfa`, `codigo_recuperacao`, `token_verificacao`, `limite_tentativa`. `sessao` revista. §6 sem aprovação: tabela `aprovacao` removida, versão = conteúdo confirmado com `chave_confirmacao`. Auditoria e restrições atualizadas |
| `docs/PERMISSOES_RBAC.md` | Perfis conforme DT-04 a DT-07; matriz consolidada por tipo de operação (§3.0); contas de acesso e segurança (§3.7a); restrições obrigatórias com alvo; §4 sem aprovação; testes |
| `docs/INTEGRACOES.md` | Sem login Entra; duas app registrations; criação de conta com a senha do cadastro; reconciliação sem senha; Teams sem aprovação; Q-37 (canal de e-mail) |
| `docs/PLANO_DE_IMPLEMENTACAO.md` | Etapas 0, 1, 2, 4, 6 e 7a e marcos S-01, S-02 e S-03 revistos; o login real deixa de depender do tenant |
| `docs/DESIGN_SYSTEM.md` | Sem Aprovações; telas de autenticação; assistente de cadastro com senha inicial; confirmação e confirmação reforçada; visões operacional e gerencial; estados |
| `docs/AMBIENTES.md`, `docs/CHECKLIST_ETAPA_0.md` | Itens do Entra ID e Q-33 marcados como não aplicáveis; decisões a aprovar |
| `CLAUDE.md`, `README.md` | Fonte da verdade (PM v1.2, DT-01 a DT-07), stack e status |

`docs/SEGURANCA_REPOSITORIO.md`, `.gitignore`, `.env.example` e `scripts/` não foram alterados. Nenhum arquivo binário foi alterado.

### 14.5 Revisão especializada

Cinco revisões independentes, somente de leitura, cada uma com a sua skill. As cinco registraram que a skill carregou. Depois delas houve uma rodada de correções em todos os documentos técnicos.

| Revisão | Skill | Achados | Principais pontos e tratamento |
|---|---|---|---|
| Arquitetura | `engineering-skills:senior-architect` | ARQ-01 a ARQ-12 | Rotas da biblioteca fora da autorização → superfície mínima e casos de uso próprios (DA-24). Política de sessão × biblioteca → divisão explícita e prova de conceito (R-27). Concorrência na nova versão, hash do conteúdo revisado, diagramas, restauração de backup |
| Segurança | `engineering-skills:senior-security` | SEC-01 a SEC-10 | **Crítico:** tomada de conta de quem depois recebe perfil de TI (quem conhece a senha inicial cadastra o próprio TOTP) → `conta_acesso.criar` restrita por alvo e ativação do perfil de TI com senha própria e MFA via código de uso único (**Q-43**). Autoprovisionamento do Estagiário → restrição por alvo em `provisionamento.executar` e `catalogo.gerenciar_grupos`. Também: DoS contra administradores, MFA desativável pelo próprio usuário, alvo com falha aberta, concorrência no último administrador, alertas compensatórios, *pepper* |
| Backend | `engineering-skills:senior-backend` | BE-01 a BE-10 | **Reconciliação sem senha** depois de *timeout*: evita entregar ao colaborador uma senha que não vale. Concorrência e idempotência. UPN corrigido × e-mail de login. Caminho de quem cadastra sem permissão de provisionamento. Estados `CANCELADA` e `motivo_espera`. Revogação de sessão por exclusão |
| Frontend | `engineering-skills:senior-frontend` | FE-01 a FE-13 | Senha mantida até a etapa 5 (antes era "limpa ao sair da etapa", o que é contraditório). `autocomplete` real dos navegadores. Reautenticação antes de enviar a senha. Aviso de expiração (WCAG 2.2.1). Rotas de MFA. Visões por conta. Estados e responsividade |
| QA e consistência | `engineering-skills:senior-qa` | QA-01 a QA-13 | **Nenhuma regra residual de aprovação hierárquica nem de login Microsoft.** Lacunas de critérios e testes (bootstrap, cadastro público, cookies, métricas, independência de senhas) acrescentadas ao plano |

Nenhuma correção reabriu as decisões DT-01 a DT-07. As correções que acrescentam restrições derivadas de DT-07 ficaram como **propostas que a TI confirma** (§14.9):
- `colaborador.editar_equipe_ti` e `catalogo.gerenciar_grupos` restritas ao perfil administrativo;
- provisionamento negado ao Estagiário quando o alvo é ele mesmo ou um membro da TI;
- ativação do perfil de TI pelo titular (Q-43);
- validade obrigatória da concessão de provisionamento.

### 14.6 Riscos técnicos não resolvidos

| ID | Risco | Situação |
|---|---|---|
| R-24 | Reutilizar a senha inicial do Microsoft 365 no portal | Mitigado parcialmente: senha separada recomendada, gerador, *pepper*, MFA para a TI, Q-43. Dependem da TI: troca no primeiro acesso (Q-03, Q-36) e canal de entrega da senha ao colaborador |
| R-25 | Superfície da autenticação própria; perda do MFA e do Acesso Condicional do tenant no acesso ao portal | Mitigado por DA-24 a DA-27. Verificação real só na Etapa 1 |
| R-26 | Provisionamento sem segunda verificação | Controles compensatórios (permissão, confirmação reforçada, reautenticação, alertas, auditoria). Risco residual aceito pela decisão DT-03 |
| R-27 | Encaixe do Better Auth no modelo do portal; compatibilidade com Next.js 16 e Prisma 7 **não verificada** em execução | Prova de conceito com critério de saída e alternativa na Etapa 1 |
| R-07 | A senha fica na memória do processo web durante a confirmação, agora para dois usos | Minimizado, não eliminado |
| — | O histórico de avisos de segurança do Better Auth foi consultado em agregadores públicos, não nos avisos oficiais | Conferir no GitHub ao fixar a versão |

### 14.7 Verificações executadas

| Verificação | Como | Resultado |
|---|---|---|
| Referências cruzadas e identificadores | Script próprio, que confere `DOC §n`/`PM §n` contra os títulos reais, DA/Q/R/DT usados × definidos e os arquivos citados | Ver §14.7.1 |
| Regras antigas de aprovação hierárquica | Busca de `aprovador`, `solicitacao.aprovar`, `AGUARDANDO_APROVACAO`, `autoaprova`, `executar_conta`, "após a aprovação" e "mediante aprovação" em todos os `.md`, excluindo trechos marcados como históricos | Ver §14.7.1 |
| Regras antigas de login Microsoft | Busca de `SSO`, `OIDC`, `auth_time`, `MSAL`/`msal` e "Entrar com Microsoft" | Ver §14.7.1 |
| Q-04 e Q-25 como fundamento de regra vigente | Busca fora dos trechos históricos | Ver §14.7.1 |
| Consistência entre documentos | Revisão de QA (§14.5) | Nenhum resíduo de aprovação ou SSO; Q-36 a Q-42 com o mesmo significado; nomes de tabelas e permissões coerentes |
| Fatos de bibliotecas | Registro npm (15/10/2026): `better-auth` 1.7.9, `@node-rs/argon2` 2.2.2, `next-auth` 5 ainda em beta. Documentação oficial do Better Auth (e-mail e senha, sessões, 2FA, limitador), do Auth.js (Credentials), OWASP Password Storage e NIST SP 800-63B-4 | Usados em DA-24 a DA-27 |

#### 14.7.1 Resultado após as correções

Execução final em 15/10/2026, depois da rodada de correções:

- **Identificadores:**
  - todos os usados estão definidos em `ARQUITETURA_TECNICA.md`: DA 27, Q 43, R 27 e DT 7;
  - todas as referências `DOC §n` e `PM §n` existem;
  - todos os arquivos citados existem, com uma exceção: `RELATORIO_ETAPA_0.md`, registrado como pendência (§14.8). O nome `MAIUSCULAS_COM_SUBLINHADO.md`, que a busca também aponta, é um exemplo de convenção em `AMBIENTES.md`, não um arquivo.
- **Regras antigas de aprovação hierárquica e de login Microsoft:**
  - **nenhuma regra vigente encontrada**;
  - as seis ocorrências que restam fora dos trechos históricos são negações explícitas (ex.: "Não existe fila de aprovação nem aprovador", "não usa login Microsoft (SSO)", "`@azure/msal-node` … não faz login de usuários").
- **Q-04 e Q-25:** só aparecem como "substituída" ou em texto histórico; nenhuma regra vigente se apoia nelas.
- **Termos introduzidos pelas correções:** Q-43, R-27, `catalogo.gerenciar_grupos`, `motivo_espera`, `conta_acesso.criar`, `chave_confirmacao`, `/conta/ativar`, *pepper* e `pg_advisory_xact_lock` aparecem nos documentos responsáveis. O antigo `provisionamento.executar_conta` só aparece como nome histórico.

### 14.8 Impacto no projeto

**Etapa 0:**
- O app de login de desenvolvimento (E-12) e a Q-33 deixam de existir.
- A A-01 passa a depender também da aprovação escrita das DA revistas (DA-02, DA-03, DA-04, DA-08, DA-09, DA-22) e das novas (DA-24 a DA-27).
- O `RELATORIO_ETAPA_0.md`, citado pelo checklist, **não existe**. O texto da A-00 e de suas condições precisa ser registrado a partir do documento original da TI.
- Docker, primeiro commit e repositório privado continuam pendentes de autorização.

**Etapa 1:**
- Ganha a autenticação própria completa: contas, hash, sessões, MFA, limitador, redefinição pela TI, bootstrap e procedimento de emergência.
- Ganha a prova de conceito da biblioteca.
- O login real **não depende mais do tenant Virta**: o critério 1 e a A-02 deixam de ser bloqueados pela Q-33.
- Questões que bloqueiam o fechamento: Q-15, Q-18, Q-31 (d, f), Q-36, Q-38, Q-39 e Q-43.

**Etapa 2:**
- Sem aprovações; os critérios de aceite foram reescritos (provisionamento direto, caminho do Estagiário, reconciliação sem senha, confirmação reforçada).
- Q-09 continua bloqueando só I-02 e I-03.

**Etapas 4 e 7a:**
- Q-42 (visão gerencial) e Q-37 (canal de e-mail para a recuperação de senha e os alertas).

### 14.9 Pendências que exigem decisão da TI

1. Aprovar ou ajustar por escrito as DA revistas e as novas (§14.3).
2. Responder às questões novas:
   - Q-36: troca da senha no primeiro acesso ao portal;
   - Q-37: canal de e-mail;
   - Q-38: detalhes do MFA;
   - Q-39: política de senha do portal;
   - Q-40: contas do portal para colaboradores já existentes;
   - Q-41: colaborador sem e-mail corporativo;
   - Q-42: indicadores e relatórios da visão gerencial;
   - Q-43: ativação do perfil de TI pelo titular.
3. Confirmar as propostas derivadas de DT-07 listadas em §14.5.
4. Definir o canal de entrega da senha inicial ao colaborador (R-24) e, de preferência, exigir senhas diferentes ou a troca no primeiro acesso nos dois sistemas (Q-03, Q-36).
5. Registrar a A-00 em `RELATORIO_ETAPA_0.md`.
6. Regerar o PDF do Plano Mestre, se ele precisar circular.

### 14.10 Limitações

- A compatibilidade de Better Auth com Next.js 16 e Prisma 7, a forma como a biblioteca guarda tokens e segredos TOTP e os nomes exatos de suas opções **não foram verificados em execução**: dependem da prova de conceito da Etapa 1.
- Os diagramas Mermaid não foram renderizados; só a sintaxe foi inspecionada.
- O PDF do Plano Mestre não foi regenerado nem comparado.
- Nenhum teste automatizado ou Playwright se aplica: não há código nem telas.
