# Segurança do Repositório — Portal TI Vallur

**Etapa:** 0 — Preparação do ambiente
**Data:** 14/10/2026
**Situação:** auditoria executada e controles locais aplicados. **Nenhum `git add`, commit ou push foi executado**, nenhum repositório remoto foi criado e nenhum arquivo da TI foi aberto, movido, alterado ou excluído.
**Base:** `REVISAO_FINAL_FASE_01.md` §7 (R-21, R-23, PA-01), `PLANO_DE_IMPLEMENTACAO.md` §3, `CLAUDE.md` (segurança do repositório).

Nenhum valor sensível (senha, token, CPF, e-mail pessoal, chave) aparece neste documento. As verificações registram apenas contagens, regras e caminhos.

---

## 1. Estado do Git [VERIFICADO]

| Item | Resultado | Comando |
|---|---|---|
| Versão | Git 2.56.0.windows.2 | `git --version` |
| *Branch* | `main`, sem commits | `git status`, `git log` |
| Índice | Vazio (0 arquivos rastreados, 0 preparados) | `git ls-files`, `git diff --cached --name-only` |
| Banco de objetos | 0 objetos, 0 *packs* | `git count-objects -v` |
| Referências, *stash*, remotos | Nenhum | `git for-each-ref`, `git stash list`, `git remote -v` |
| *Hooks* ativos | Nenhum (só os `.sample` padrão); `core.hooksPath` não definido | `ls .git/hooks` |
| Identidade | `user.name` e `user.email` **não configurados** | `git config` |
| Fim de linha | `core.autocrlf=true` na configuração de sistema do Git for Windows; agora sobreposto pelo `.gitattributes` | `git config --show-origin` |

**Conclusão:** nenhum arquivo foi versionado até hoje, então **não há histórico a remediar**. Cópias da pasta fora do Git (sincronização, compartilhamento, *backup* da estação) não foram avaliadas.

---

## 2. Inventário e classificação [VERIFICADO]

O que um `git add` incluiria hoje (`git ls-files --others --exclude-standard`): **18 arquivos**, todos de documentação ou configuração.

| Grupo | Arquivos |
|---|---|
| Documentação | `README.md`, `CLAUDE.md`, `docs/*.md` (11 arquivos, incluindo os quatro desta etapa), `docs/plano-mestre/README.md`, `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md`, `docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.pdf` |
| Configuração | `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, `.mcp.json` |
| Scripts | `scripts/verificar-repositorio.ps1` |

> A contagem de 18 foi feita antes de criar os quatro documentos da Etapa 0 em `docs/`; a lista final está em §6.2.

Arquivos presentes e **ignorados** (não seriam incluídos):

| Arquivo | Classificação (Fase 01, R-21/R-23) | Regra do `.gitignore` |
|---|---|---|
| `docs/SGSI/SGSI - Novo Usuário.xlsx` | Crítico — senhas em texto puro, logins, e-mails | `/docs/SGSI/` |
| `docs/Inventário/Inventário de TI.xlsx` | Crítico — padrões de CPF, coluna de senha, chaves de produto | `/docs/Inventário/` |
| `TER - TDV/TER_VALLUR_v22.html` | Alto — catálogo com padrões de CPF | `/TER - TDV/` |
| `TER - TDV/TDV_VALLUR_v08.html` | Tratar como sensível até revisão da TI | `/TER - TDV/` |
| `docs/SGSI/SGSI - Teams.xlsx` | Médio — e-mails associados a cargos e equipes | `/docs/SGSI/` |
| `docs/dISTRIBUIÇÃO DE CUSTOS/Distribuição de Custos.xlsx` | Médio — e-mails, licenças e rateios | `/docs/dISTRIBUIÇÃO DE CUSTOS/` |
| `.claude/settings.local.json` | Configuração local do Claude Code (sem segredos na varredura) | `.claude/settings.local.json` |

Não foram encontrados no diretório: `.env` com valores, certificados, chaves privadas, *dumps* de banco, cópias de banco, *connection strings* reais. O `SGSI - Senhas.xlsx` citado no PM §14 **não está** no repositório.

---

## 3. Varreduras executadas [VERIFICADO]

| # | Varredura | Escopo | Resultado |
|---|---|---|---|
| 1 | gitleaks 8.30.1 (binário oficial, checksum SHA-256 conferido), modo `dir`, `--redact=100` | Cópia dos 14 arquivos versionáveis do início da etapa + `.claude/settings.local.json` | **0 achados** |
| 2 | gitleaks 8.30.1, modo `dir`, `--redact=100`, `--max-archive-depth 2` | Árvore completa do diretório, inclusive os arquivos ignorados; relatório gravado fora do repositório e descartado, sem exibição de valores | **0 achados** |
| 3 | Varredura própria (contagem, sem imprimir valores): CPF com dígito verificador válido, e-mail, *connection string*, cabeçalho de chave privada, JWT, atribuição de senha/token, chave de produto, GUID; o PDF foi lido por extração de texto (`pypdf` 5.4.0 em ambiente virtual temporário) | Os 14 arquivos versionáveis + `.claude/settings.local.json` | **0 ocorrências** em todas as categorias, inclusive no PDF do Plano Mestre |
| 4 | Scanner da skill `engineering-skills:senior-security` (`secret_scanner.py`) | Arquivos de configuração novos e alterados | **0 achados** |
| 5 | gitleaks 8.30.1 sobre os arquivos novos e alterados nesta etapa | `.env.example`, `.gitattributes`, `.editorconfig`, `.gitignore`, `.mcp.json`, script | **0 achados** |
| 6 | `scripts/verificar-repositorio.ps1 -ExigirGitleaks` | Estado real do repositório | Código 0: nenhum arquivo sensível rastreado, preparado ou incluível; 0 segredos |
| 7 | Teste positivo do script: arquivo temporário com token sintético no formato de *personal access token* do GitHub, removido em seguida | — | Detectado (regra `github-pat`), código 1. O controle funciona |

**Limitações das varreduras:**

- O gitleaks detecta formatos de credenciais e textos de alta entropia. **Não detecta CPF, nomes nem senhas simples em células de planilha.** Os zero achados da varredura 2 **não** significam que os arquivos da TI sejam seguros: a classificação de §2 continua valendo.
- Não foi verificado se o gitleaks abriu o conteúdo interno dos `.xlsx` (formato ZIP) com `--max-archive-depth`.
- O scanner da skill filtra por extensão e **não lê `.md` nem `.env.example`**. Por isso foi usado só como verificação complementar.
- A varredura própria usa expressões regulares e pode ter falsos negativos.

**PDF do Plano Mestre** (limitação registrada na Fase 01, `REVISAO_FINAL_FASE_01.md` §11): o texto extraído tem 13 páginas e similaridade de 94,7% com o `.md` (comparação por palavras). As diferenças vistas são artefatos de extração: cabeçalho "Portal TI Vallur" em cada página, numeração e palavras partidas ("T eams", "T ypescript"). A equivalência é **provável, não certificada**, porque não houve revisão linha a linha. Os metadados do PDF têm apenas título, criador e produtor.

---

## 4. Controles aplicados nesta etapa

| Arquivo | Alteração | Motivo |
|---|---|---|
| `.gitignore` | Acrescentados `CLAUDE.local.md`, chaves SSH (`id_rsa*`, `id_ecdsa*`, `id_ed25519*`), `*.ppk`, `*.kdbx`, `*.ovpn`, `.npmrc`, volumes locais (`.data/`, `pgdata/`, `minio-data/`), estado da CLI do Supabase (`supabase/.temp/`, `supabase/.branches/`), `*.sqlite`, `*.db`. As regras existentes não foram removidas | Fechar categorias de credenciais e cópias de dados ainda não cobertas, antes que o Docker e o Supabase entrem no fluxo. `*.sql` **não** foi ignorado de propósito, porque as migrações do Prisma são `.sql` |
| `.gitattributes` | Novo: LF no repositório, CRLF em scripts Windows, binários marcados | Evitar alterações por fim de linha e diffs de binários |
| `.editorconfig` | Novo | Formatação uniforme entre editores |
| `.env.example` | Novo, somente com nomes e valores de exemplo | Documentar variáveis sem segredos (PM §17.5) |
| `.mcp.json` | `shadcn@latest` → `shadcn@4.21.0` | PC-07: versão fixa do servidor MCP. A 4.21.0 (04/09/2026) é a correção mais recente com mais de duas semanas de publicação |
| `scripts/verificar-repositorio.ps1` | Novo, somente leitura | Verificação antes de cada commit: arquivos sensíveis rastreados, preparados ou incluíveis + gitleaks nos arquivos versionáveis |

Verificação após as alterações: os 7 arquivos sensíveis continuam ignorados (`git check-ignore -v`), `.env.example` não é ignorado, `.env` e `.env.local` são ignorados.

**Escopo dos servidores MCP (PC-07):** `playwright` e `chrome-devtools` estão disponíveis nesta sessão pela configuração do usuário, não pelo `.mcp.json` do projeto. Incluí-los no projeto (com versão fixa) é decisão da TI. Recomendação: incluir, para que toda estação use as mesmas versões na validação visual.

---

## 5. Riscos remanescentes

| ID | Risco | Situação | Medida pendente | Responsável |
|---|---|---|---|---|
| R-21 / R-23 | Planilhas e modelos com CPF, senhas e chaves no diretório do repositório | Mitigado por `.gitignore` e pelo script; **não eliminado** | Decidir a relocação (§8) e produzir versões sanitizadas (Q-01) | TI |
| R-21 | Credenciais presentes nas planilhas | Tratadas como expostas (Fase 01, §7.3) | Troca das senhas: decisão da TI, fora do escopo do projeto | TI |
| SEG-01 | O `.gitignore` não protege contra `git add -f`, cópia da pasta ou sincronização | Aberto | Procedimento de §6 e relocação de §8 | TI |
| SEG-02 | Sem proteção de *push* de segredos no GitHub se o plano não incluir Secret Protection | Aberto | Script local + gitleaks no CI (§7) | TI + desenvolvimento |
| SEG-03 | Varreduras não detectam dados pessoais em planilhas | Limitação de ferramenta | Manter os arquivos fora do versionamento | — |
| SEG-04 | Identidade Git não configurada | Aberto | Configurar antes do primeiro commit | Usuário da estação |

---

## 6. Procedimento do primeiro commit — **aguarda autorização**

Não executado. Sequência obrigatória (`REVISAO_FINAL_FASE_01.md` §7.2), para quando a TI autorizar:

### 6.1 Pré-condições

1. Decisão da TI sobre os originais sensíveis (§8): mover para fora do repositório **ou** confirmar que permanecem ignorados.
2. Identidade Git definida pelo responsável (no repositório):
   `git config user.name "<nome>"` e `git config user.email "<e-mail corporativo>"`.
3. `scripts/verificar-repositorio.ps1 -GitleaksPath <caminho do gitleaks.exe> -ExigirGitleaks` com código 0.

### 6.2 Commit somente com caminhos explícitos

Nunca `git add -A`, `git add .` nem `git add -f`.

```powershell
git add -- .gitignore .gitattributes .editorconfig .env.example .mcp.json README.md CLAUDE.md
git add -- scripts/verificar-repositorio.ps1
git add -- docs/ARQUITETURA_TECNICA.md docs/MODELO_DE_DADOS.md docs/INTEGRACOES.md docs/PERMISSOES_RBAC.md
git add -- docs/DESIGN_SYSTEM.md docs/PLANO_DE_IMPLEMENTACAO.md docs/REVISAO_FINAL_FASE_01.md
git add -- docs/AMBIENTES.md docs/SEGURANCA_REPOSITORIO.md docs/CHECKLIST_ETAPA_0.md docs/RELATORIO_ETAPA_0.md
git add -- docs/plano-mestre/README.md docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.md docs/plano-mestre/PORTAL_TI_VALLUR_PLANO_MESTRE.pdf
git diff --cached --name-only        # conferir: exatamente os 22 arquivos acima
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verificar-repositorio.ps1 -GitleaksPath <caminho> -ExigirGitleaks
git commit -m "docs: documentação da Fase 01 e preparação da Etapa 0"
git ls-files                          # conferir de novo antes de qualquer push
```

No primeiro commit, o Git avisará que CRLF será convertido em LF. É o efeito esperado do `.gitattributes`.

### 6.3 Publicação (etapa separada, também aguarda autorização)

1. Criar o repositório **privado** `vallur-ti-portal` sob **organização** GitHub da empresa (não em conta pessoal).
2. Configurar as proteções de §7 **antes** do primeiro push, quando o plano permitir.
3. `git remote add origin <url>` e `git push -u origin main`.
4. Conferir no GitHub a lista de arquivos publicados contra `git ls-files`.

---

## 7. Estratégia GitHub [DOC-OFICIAL + RECOMENDAÇÃO]

Fatos de documentação oficial consultada em 14/10/2026 (não verificados em conta da empresa; o plano contratado é desconhecido):

| Recurso em repositório **privado** de organização | Free | Team | Enterprise | Fonte |
|---|---|---|---|---|
| Repositórios privados ilimitados | Sim (recursos limitados) | Sim | Sim | https://docs.github.com/en/get-started/learning-about-github/githubs-plans |
| Proteção de *branch* e revisores obrigatórios em PR | Não | Sim | Sim | idem |
| *Rulesets* | Não | Sim | Sim | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets |
| *Secret scanning* e *push protection* | Não | Compra à parte (GitHub Secret Protection, US$ 19 por *committer* ativo/mês) | Compra à parte | https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security |
| *Environments* com revisores obrigatórios | Não | **Não** | Sim | https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments |
| Dependabot alerts | Sim | Sim | Sim | githubs-plans |

Preço do Team na página oficial: US$ 4 por usuário/mês, com nota "first 12 months" não detalhada.

**Estratégia recomendada:**

1. Repositório privado `vallur-ti-portal` em organização da empresa, com no mínimo dois proprietários nominais da TI e acesso por equipe, não por pessoa.
2. **Plano mínimo: Team**, para proteger a `main`: PR obrigatório, 1 revisão aprovada de pessoa diferente do autor, verificações de CI obrigatórias, sem *force push* nem exclusão, histórico linear.
3. Secret Protection: se não for contratado, manter o script local antes de cada commit e o gitleaks no CI (a partir da Etapa 1, com o binário oficial em versão fixa). **A verificar:** se a action oficial `gitleaks-action` exige chave de licença para contas de organização. Se exigir, chamar o binário diretamente.
4. CI (Etapa 1): *lint*, tipos, testes, build, `prisma migrate diff` e gitleaks, com `permissions` mínimas no `GITHUB_TOKEN` e actions fixadas por SHA.
5. **Segredos de produção fora do GitHub.** Sem Enterprise, não há revisores obrigatórios em *environments* de repositório privado. Isso afeta a previsão da DA-23 ("segredos de produção restritos ao ambiente de implantação de produção, com revisores obrigatórios no CI") e reforça o PB-20 (migrações e implantação executadas no host). **Decisão pendente da TI.**
6. Dependabot alerts ativados; atualizações automáticas avaliadas na Etapa 1.
7. Arquivo `CODEOWNERS` e modelo de PR com checklist de segurança, criados na Etapa 1, junto com o código.

---

## 8. Proposta de relocação dos arquivos sensíveis — **aguarda autorização**

Nenhum arquivo foi movido.

| Caminho atual | Destino proposto | Motivo | Impacto nas referências | Autorização necessária |
|---|---|---|---|---|
| `docs/SGSI/` (2 planilhas) | Pasta da TI com acesso restrito, fora do diretório do repositório (ex.: biblioteca SharePoint da TI ou servidor de arquivos), escolhida pela TI | Senhas em texto puro e dados pessoais (R-21, R-23); elimina o risco de `git add -f`, cópia ou sincronização junto com o código | `ARQUITETURA_TECNICA.md` (Q-02, §8), `MODELO_DE_DADOS.md`, `REVISAO_FINAL_FASE_01.md`, `README.md`, `CLAUDE.md` e `.gitignore` citam o caminho; as regras do `.gitignore` podem permanecer como proteção | TI (PA-01) |
| `docs/Inventário/Inventário de TI.xlsx` | Idem | CPFs, senhas e chaves de produto | Etapa 3 usa o arquivo para a carga do inventário (PLANO §6); a carga lerá do local definido pela TI, nunca do repositório | TI |
| `docs/dISTRIBUIÇÃO DE CUSTOS/Distribuição de Custos.xlsx` | Idem | E-mails, licenças e rateios | Referência da Etapa 6 (custos) | TI |
| `TER - TDV/` (2 HTML) | Idem; a versão sanitizada, quando existir, vai para `docs/referencias/` (ARQ §8) | Catálogo com CPFs | Q-01, `MODELO_DE_DADOS.md` §9.4, Etapa 3 | TI |

Até a decisão, os arquivos permanecem onde estão, ignorados pelo Git e verificados pelo script antes de cada commit.
