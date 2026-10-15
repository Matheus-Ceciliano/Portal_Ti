# Checklist da Etapa 0 e prontidão para a A-01 — Portal TI Vallur

**Data:** 14/10/2026
**Situação:** avaliação técnica para a revisão da TI. **Este checklist não concede a aprovação A-01**, que cabe ao responsável autorizado da TI Vallur.
**Referência dos critérios:** `PLANO_DE_IMPLEMENTACAO.md` §3 (Etapa 0) e `REVISAO_FINAL_FASE_01.md` §7.2 e §12.3.
**Revisão 01.4 (15/10/2026):** as decisões DT-01 a DT-07 mudaram os itens ligados ao Entra ID. O portal tem autenticação própria, então E-12 e Q-33 deixaram de se aplicar. Também entraram as decisões novas e as revistas que precisam ser aprovadas (DA-24 a DA-27 e DA-02/03/04/08/09/22) e as questões novas da Etapa 1 (Q-36, Q-38, Q-39). Os itens alterados estão marcados com "(01.4)". A avaliação original de 14/10/2026 foi mantida.

Legenda de situação: **Satisfeito** · **Parcialmente satisfeito** · **Não satisfeito** · **Pendente de autorização** · **Não verificado** · **Não aplicável**.

---

## 1. Critérios de aceite da Etapa 0 (PLANO §3)

| # | Critério | Situação | Evidência / motivo |
|---|---|---|---|
| C-1 | Ajustes posteriores à A-00 registrados por escrito | **Parcialmente satisfeito** | A-00 e suas condições registradas em `RELATORIO_ETAPA_0.md` §2. Falta a TI confirmar por escrito quais decisões `DA-nn` foram aprovadas: a A-00 recebida não as enumera, e o PLANO §3 as lista como pré-condição |
| C-2 | Repositório inicial verificado sem dados sensíveis (`REVISAO_FINAL_FASE_01.md` §7.2) | **Parcialmente satisfeito** | Diretório e conjunto versionável verificados (gitleaks, varredura própria, script). O "repositório inicial" (primeiro commit) ainda não existe: **pendente de autorização** |
| C-3 | Ambientes de desenvolvimento acessíveis sem uso de dados reais | **Não satisfeito** | Docker ausente (PostgreSQL 17 local indisponível); projeto Supabase de homologação não criado. Ambos dependem de autorização (`AMBIENTES.md` §2.2, §6.3) |

## 2. Entregas e pré-requisitos técnicos da Etapa 0 (PLANO §3)

| # | Item | Situação | Evidência / motivo |
|---|---|---|---|
| E-1 | Arquivos com dados pessoais ou credenciais fora do versionamento (R-21, R-23) | **Satisfeito** (como ignorados) / **Pendente de autorização** (relocação) | 7 arquivos sensíveis ignorados; nenhum rastreado (`SEGURANCA_REPOSITORIO.md` §2, §8) |
| E-2 | Varredura de segredos antes do primeiro commit | **Satisfeito** | gitleaks 8.30.1: 0 achados; varredura própria: 0 ocorrências (`SEGURANCA_REPOSITORIO.md` §3) |
| E-3 | Primeiro commit só com caminhos explícitos | **Pendente de autorização** | Procedimento e lista de 22 arquivos prontos (`SEGURANCA_REPOSITORIO.md` §6) |
| E-4 | Repositório GitHub privado `vallur-ti-portal` com dono organizacional | **Pendente de autorização** | Não criado |
| E-5 | Proteção da `main` e push | **Pendente de autorização** | Depende do plano GitHub (E-6) |
| E-6 | Confirmar se o plano GitHub oferece proteção de *branch* e de *push* em repositório privado | **Parcialmente satisfeito** | Recursos por plano levantados em documentação oficial (`SEGURANCA_REPOSITORIO.md` §7); o plano contratado pela empresa **não foi verificado** |
| E-7 | Node.js 24 LTS nas máquinas de desenvolvimento (DA-20) | **Satisfeito**, com ressalva | v24.21.0 instalada. Atualizar para a versão de segurança da linha 24 anunciada para 21/10/2026 |
| E-8 | Docker nas máquinas de desenvolvimento | **Não satisfeito** | Ausente; instalação exige administrador (WSL 2), possível reinicialização e decisão de licença; máquina com 7,7 GB de RAM, abaixo dos 8 GB pedidos pelo Docker Desktop |
| E-9 | Confirmar a versão PostgreSQL do projeto Supabase (DA-21) | **Pendente de autorização** | Depende da criação do projeto; a documentação indica 17 por padrão, sem confirmação explícita para projetos hospedados |
| E-10 | Projeto Supabase de homologação | **Pendente de autorização** | Configuração planejada em `AMBIENTES.md` §6.2 |
| E-11 | `tid` do tenant Virta registrado para a trava de ambiente (DA-23) | **Não satisfeito** — depende da TI | A TI informa o `tid` pelo Centro de Administração do Entra; não foi obtido por consulta ao tenant (`AMBIENTES.md` §7) |
| E-12 | App registration de login de desenvolvimento (somente se Q-33 autorizar) | **Não aplicável (01.4)** | O portal não usa login Microsoft (DT-01); Q-33 encerrada. Nenhuma registration foi criada |
| E-13 | Nenhuma app registration com permissão de aplicação no tenant de produção para desenvolvimento ou homologação | **Satisfeito** | Nenhuma operação no tenant |
| E-14 | Respostas às questões da Etapa 1 (Q-15, Q-18, Q-31 d/f; **(01.4)** Q-36, Q-38, Q-39; Q-33 encerrada) | **Não satisfeito** — depende da TI | Bloqueiam o fechamento da Etapa 1, não o início (PLANO §3) |
| E-15 | Versões sanitizadas dos arquivos de referência | **Não aplicável por ora** | "Quando a TI as produzir" (PLANO §3) |

## 3. Checklist de prontidão para a A-01

| Área | Item | Situação | Bloqueia o início da Etapa 1? |
|---|---|---|---|
| Segurança do repositório | Arquivos sensíveis ignorados e verificados; `.gitignore` reforçado; script de verificação testado (positivo e negativo) | **Satisfeito** | — |
| Segurança do repositório | Relocação dos originais e troca das credenciais expostas | **Pendente de autorização** | Não (mitigado), mas recomendado antes do push |
| Git | Repositório local íntegro, sem histórico a remediar; `.gitattributes` e `.editorconfig` | **Satisfeito** | — |
| Git | Identidade configurada, primeiro commit, repositório remoto privado, proteção da `main` | **Pendente de autorização** | **Sim** — a Etapa 1 prevê GitHub Actions e PRs |
| Ambiente de desenvolvimento | Windows, PowerShell, Git, Node 24, npm/npx, Python 3.12, VS Code, Claude Code | **Satisfeito** | — |
| Ferramentas locais | Docker / Docker Compose | **Não satisfeito** | **Sim** — PostgreSQL 17 local e testes de integração |
| Ferramentas locais | gitleaks instalado para uso contínuo | **Parcialmente satisfeito** | Não — usado a partir de pasta temporária; instalação permanente a decidir |
| Documentação | `AMBIENTES.md`, `SEGURANCA_REPOSITORIO.md`, `CHECKLIST_ETAPA_0.md`, `RELATORIO_ETAPA_0.md`, `README.md` | **Satisfeito** | — |
| Compatibilidade tecnológica | Node 24 + Next.js 16 + Prisma 7 + PostgreSQL 17 | **Satisfeito** (documentação oficial) / **Não verificado** (execução) | Não |
| Banco de dados | Estratégia Supabase e PostgreSQL documentada | **Satisfeito** | — |
| Banco de dados | Projeto de homologação, região, plano e versão confirmada | **Pendente de autorização** | Parcial — o critério 5 da Etapa 1 (S-04) precisa do projeto |
| Microsoft Entra ID | Estratégia de autenticação, registrations e simulação documentada | **Satisfeito**, revisto na 01.4: autenticação própria (DA-24 a DA-27) documentada; Entra ID só para integrações (duas registrations) | — |
| Microsoft Entra ID | `tid` do tenant (DA-23) | **Não satisfeito** — depende da TI | Parcial — a trava de ambiente (critério 10 da Etapa 1) precisa do valor |
| Microsoft Entra ID | Q-33 (login real em desenvolvimento) | **Não aplicável (01.4)** — Q-33 encerrada por DT-01 | Não. O login real da Etapa 1 não depende mais do tenant |
| Integrações externas | Classificação e pré-requisitos de cada integração | **Satisfeito** | — |
| Integrações externas | Q-09, Q-24, Q-34 | **Pendente de decisão da TI** | Não |
| Separação de ambientes | Estratégia e regras (DA-23) documentadas | **Satisfeito** | — |
| Gestão de segredos | Estratégia, `.env.example` sem segredos, regras de armazenamento | **Satisfeito** | — |
| Gestão de segredos | Segredos de produção fora do GitHub (plano sem revisores em *environments*) | **Pendente de decisão da TI** | Não |
| Decisões de arquitetura | Aprovação explícita de DA-01, DA-03 a DA-13, DA-15 a DA-23; **(01.4)** também das revistas DA-02 (substituída), DA-03, DA-04, DA-08, DA-09, DA-22 e das novas DA-24 a DA-27 | **Não satisfeito** — depende da TI | **Sim** — a fundação implementa essas decisões |
| Dependências técnicas | Q-15, Q-18, Q-31 (d, f); PB-16 (pooler, `server-only`) | **Não satisfeito** | Não — bloqueiam o fechamento da Etapa 1 |

## 4. Resumo

- **Satisfeitos:** controles locais de segurança do repositório, varredura de segredos, ferramentas da estação (exceto Docker), documentação da Etapa 0, estratégias de banco, Entra ID, integrações, ambientes e segredos.
- **Bloqueios para iniciar a Etapa 1:** (1) aprovação explícita das decisões `DA-nn`, incluindo as revistas e as novas da Revisão 01.4; (2) Docker instalado e licenciado; (3) primeiro commit e repositório GitHub privado autorizados.
- **Necessários para fechar a Etapa 1, sem impedir o início:** projeto Supabase de homologação, `tid` do tenant, Q-15, Q-18, Q-31 (d, f), **(01.4)** Q-36, Q-38, Q-39. Q-33 deixou de se aplicar.
- **(01.4)** `RELATORIO_ETAPA_0.md`, citado em C-1, não existe no repositório. O texto da A-00 e de suas condições precisa ser registrado a partir do documento original da TI.
