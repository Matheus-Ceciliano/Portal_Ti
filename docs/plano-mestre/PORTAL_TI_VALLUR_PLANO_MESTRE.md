# Portal TI Vallur

**Documento mestre de escopo, arquitetura e tecnologias**  
**Repositório:** `vallur-ti-portal`  
**Versão:** 1.2 — 15 de outubro de 2026  
**Status:** requisitos levantados; implementação ainda não iniciada.

> **Finalidade:** servir como referência única para o desenvolvimento do Portal TI Vallur, inclusive no Claude Code. Diferencia decisões confirmadas de recomendações técnicas e integrações ainda pendentes de validação.

> **Versão 1.2 (15/10/2026):** incorpora as decisões da TI **DT-01 a DT-07** (autenticação própria do portal, senha inicial definida pela TI, provisionamento sem aprovação hierárquica, equivalência entre Supervisor TI e Gestor ADM, experiência gerencial do Gestor ADM e limites do Estagiário TI). Os trechos alterados estão marcados com **(v1.2)**; o texto substituído está em §25. Registro completo das decisões em `docs/ARQUITETURA_TECNICA.md` §16.2.
>
> **O PDF desta pasta (`PORTAL_TI_VALLUR_PLANO_MESTRE.pdf`) corresponde à versão 1.1 e está DESATUALIZADO.** Ele não foi regenerado. Em caso de divergência, prevalece este arquivo `.md`.

## 1. Visão geral

O Portal TI Vallur será uma plataforma corporativa centralizada para todas as empresas do Grupo Vallur, que usam um **único tenant Microsoft 365**. A TI administrará colaboradores, criação de contas, acessos corporativos, ativos, entregas, documentos, chamados, tutoriais e auditoria. Cada colaborador poderá consultar apenas seus próprios equipamentos, documentos disponibilizados, chamados e conteúdos de ajuda autorizados.

O sistema será responsivo (desktop, notebook, tablet e celular). O desenvolvimento começará localmente; a hospedagem definitiva poderá ser na VPS da Virta, após avaliação técnica.

**Decisão central:** o Portal Vallur será a fonte oficial dos dados organizacionais (empresa, cargo, departamento e gestor). **(v1.2)** O portal tem **autenticação própria** (tela de login própria, e-mail corporativo e senha configurada pela TI, sessões próprias), independente do Microsoft 365 (DT-01, §24). O Microsoft Entra ID permanece a fonte de identidade e autenticação das **contas Microsoft 365**, que o portal provisiona por integração.

## 2. Mapa de módulos e prioridades

| Módulo | Escopo | Fase |
|---|---|---|
| Dashboard | Indicadores de ativos, chamados e pendências | V1 |
| Empresas | Cadastro de empresas e vínculo dos colaboradores | V1 |
| Colaboradores | Cadastro, identidade, cargos e histórico | V1 |
| Microsoft 365 | Provisionamento, licença, e-mail, grupos e caixas postais | V1 |
| ~~Aprovações~~ | **(v1.2) Removido** (DT-03): não há aprovação hierárquica de provisionamento. A revisão, a confirmação explícita e a rastreabilidade passam a fazer parte de "Microsoft 365" e "Auditoria" | — |
| Inventário | Ativos, acessórios, manutenção e fotografias | V1 |
| Alocações | Entregas, responsáveis e histórico | V1 |
| TER | Emissão, evidências e PDF assinado | V1 |
| Chamados | Abertura, atendimento, anexos e SLA | V1 |
| Central de Tutoriais | Vídeos, PDFs e links do OneDrive da TI | V1 |
| Portal do colaborador | Meus equipamentos, chamados, documentos e tutoriais | V1 |
| Auditoria | Eventos administrativos e integrações | V1 |
| Diário de Obra | Contas, perfis e obras | Conector a validar |
| D4Sign | Contas e permissões | Conector a validar |
| Unividade/UCS Online | Usuários e acessos à plataforma de aprendizagem | Conector a validar |
| Microsoft Teams | Regras de grupos por empresa e cargo | Expansão |
| TDV | Devolução e vistoria | Expansão |
| Custos e licenças | Licenças, custos e rateio por empresa | Expansão |
| Desligamentos | Desativação de acessos e recolhimento de ativos | Expansão |

**Nota:** V1 significa escopo planejado, não algo já implementado. Projetar entidades e integrações para expansão futura, sem antecipar desnecessariamente todas as telas.

## 3. Colaboradores e fonte de dados

A TI cadastrará no portal: nome, sobrenome (inclusive forma desejada no e-mail), empresa, cargo, departamento, gestor, endereço corporativo, identificador do Entra, situação e dados necessários de identificação. CPF e informações sensíveis só estarão disponíveis na área administrativa de TI, conforme a matriz de permissões.

**Transferências entre empresas:** deverão manter o vínculo anterior, datas, cargos e autorizações históricas, sem sobrescrever o passado.

### Processo de admissão (v1.2 — DT-02, DT-03, DT-07)

1. A TI abre a tela de cadastro de colaborador.
2. Informa nome, sobrenome, empresa, cargo e departamento (e gestor).
3. O portal sugere o e-mail corporativo conforme a convenção da TI e verifica possíveis duplicidades.
4. A TI informa a senha inicial (usada no acesso ao portal e, se a TI quiser, a mesma na conta Microsoft 365).
5. Seleciona manualmente a licença Microsoft 365.
6. Seleciona os sistemas adicionais necessários.
7. Revisa os dados apresentados.
8. Confirma a operação (confirmação explícita; não é aprovação hierárquica).
9. O portal registra o colaborador e sua conta de acesso ao portal.
10. O backend executa as operações de provisionamento autorizadas para quem confirmou.
11. O portal registra o resultado individual de cada integração.
12. A TI continua com equipamentos, acessórios e evidências fotográficas; o portal gera o TER, assinado externamente pelo GOV.BR; o PDF assinado é anexado à alocação; tutoriais são recomendados ao colaborador.

**(v1.2)** A criação de colaboradores e de contas Microsoft 365 **não depende de aprovação** de Supervisor TI ou Gestor ADM (DT-03). Ficam mantidos: confirmação explícita antes da execução, validação dos dados, permissão de provisionamento verificada no backend, prevenção de duplicidade, idempotência e tratamento de falhas, auditoria completa com registro do executor e confirmação adicional para operações destrutivas. O Estagiário TI só executa provisionamento se tiver a permissão individual correspondente (DT-07, §12).

**Princípio operacional:** operações devem ser idempotentes quando viável; uma falha na D4Sign, por exemplo, não deve recriar a conta Microsoft já criada. Guardar ID externo, status, erro sanitizado e opção de repetição autorizada. **(v1.2)** Se o Microsoft 365 falhar depois da criação do colaborador no portal, o portal registra o estado parcial, impede duplicidade e permite recuperação controlada; nenhum registro é eliminado automaticamente.

## 4. Microsoft 365, Entra ID e e-mails

### Funcionalidades confirmadas

- ~~Entrada no portal com identidade Microsoft Entra ID.~~ **(v1.2)** A entrada no portal **não** usa a identidade Microsoft: o portal tem autenticação própria (DT-01, §24). O Entra ID continua sendo o diretório das contas Microsoft 365.
- Criação e atualização de contas **(v1.2) sem aprovação hierárquica**, com confirmação explícita, permissão de provisionamento e auditoria (DT-03).
- Geração/sugestão de endereço de e-mail segundo convenções da TI.
- Seleção **manual** de licenças Microsoft 365.
- Gerenciamento de grupos e acessos autorizados.
- Caixa postal individual, criação de caixa compartilhada quando solicitada e concessão de acesso a caixas compartilhadas existentes.
- Conferência do estado de cada solicitação e trilha de auditoria.

A TI informará a senha inicial **(v1.2) no formulário de cadastro, e ela é usada imediatamente na execução** (DT-02). Ela pode ser a mesma da conta do portal. **Não armazenar senhas em banco, logs, telemetria, backups aplicacionais ou histórico; não devolvê-las por interfaces de consulta.** A senha de criação poderá existir apenas transitoriamente na operação segura de provisionamento, transmitida somente por integração de backend autorizada; se uma nova tentativa ocorrer depois do fim da requisição original, a senha é pedida novamente. Validar políticas reais do tenant e as exigências do Microsoft Graph.

**(v1.2)** Depois da criação, a senha do Microsoft 365 e a do portal são **independentes**: alterar uma não altera a outra. É proibido sincronizar senhas por métodos não oficiais, autenticar no Microsoft por trás da tela do portal (fluxo ROPC) ou consultar senhas existentes no Entra ID.

Usar o identificador imutável do objeto Entra como chave de integração; nunca usar apenas o e-mail como identificador permanente. **(v1.2)** Esse identificador não é a chave de login nem o identificador principal da conta do portal, que mantém identidade interna própria. Os fluxos que alteram licenças, caixas compartilhadas e grupos deverão checar permissões efetivas e ~~registrar aprovações~~ **(v1.2) registrar o executor e a confirmação; remoções exigem confirmação reforçada**.

## 5. Integrações corporativas adicionais

### Diário de Obra

- URL informada pela TI: `https://web.diariodeobra.app/`.
- Futuro conector: criar/atualizar/desativar usuários, configurar perfil e vincular obras.
- **Pendente:** confirmar com o fornecedor a existência e disponibilidade de API oficial de provisionamento. Até isso ocorrer, usar tarefa manual auditada.

### D4Sign

- Integração desejada: criação de usuários, gerenciamento de acessos e bloqueios.
- Há APIs públicas para outras operações, mas **não está confirmado** endpoint oficial de criação de usuários disponível à Vallur. Validar API, SCIM ou procedimento homologado com o fornecedor.
- Não substituir automaticamente o fluxo de assinatura do TER pelo GOV.BR.

### Unividade / UCS Online — Senior

- URL informada: `https://ucsonline.senior.com.br/lms/`.
- A documentação do produto Konviva menciona integração de usuários, inclusive rotas `POST /action/api/integrarUsuario`, `PUT /action/api/integrarUsuario` e integração em lote; **a disponibilidade dessas rotas para o ambiente UCS Online contratado ainda requer confirmação**.
- Preparar mapeamento de login, e-mail, cargo, unidade, perfil, situação e eventualmente trilhas/cursos, conforme as funções efetivamente habilitadas.
- Prever alternativa por CSV/manual se a integração oficial não puder ser habilitada.

### Padrão comum para conectores

Cada conector deve ter implementação isolada, autenticação por servidor, ambiente de homologação quando disponível, tratamento de limites de uso, logs sem segredos, identificadores externos e status como `pendente`, `em_execucao`, `concluido`, `falhou` e `aguardando_acao_manual`.

## 6. Inventário e ativos

Classes iniciais: **notebook, monitor, impressora, mouse, teclado, carregador, mousepad e outros**. Alguns acessórios podem ser geridos por quantidade e outros por identificação individual quando necessário.

Informações: patrimônio, número de série (se aplicável), tipo, fabricante, modelo, empresa, condição, situação, colaborador responsável, local, histórico, observações, manutenção, custo de compra e garantia (os campos financeiros não são obrigatórios).

Estados típicos: disponível, reservado, alocado, manutenção, devolvido em avaliação, baixado. Definir transições válidas e garantir que um bem serializado não seja atribuído simultaneamente a duas pessoas.

### Evidências fotográficas

Para notebooks: etiqueta traseira, tela, teclado, tampa superior, parte inferior, laterais e carregador. As fotos serão associadas tanto ao cadastro do ativo quanto ao evento específico de entrega/devolução, conservando a evidência histórica pertinente.

## 7. TER — Termo de Entrega e Responsabilidade

Referência fornecida: `TER_VALLUR_v22.html`. Preservar, após análise, os textos e critérios válidos do modelo utilizado pela TI.

Fluxo: selecionar colaborador e empresa; escolher ativos/acessórios; registrar condição/checklist/fotos; emitir PDF; encaminhar à assinatura pelo GOV.BR; receber PDF assinado; arquivar junto ao registro da alocação. A assinatura será externa; **não alegar integração oficial de assinatura GOV.BR sem validá-la**.

Estados sugeridos: rascunho, emitido, aguardando_assinatura, assinado, cancelado. O portal do colaborador mostrará documentos atuais disponibilizados, sem necessidade de disponibilizar todos os TER históricos.

## 8. TDV — Termo de Devolução e Vistoria

Referência fornecida: `TDV_VALLUR_v08.html`. Módulo planejado para expansão, mas contemplado no modelo de dados desde o começo.

Registrar motivo, itens devolvidos, acessórios, checklist, estado de conservação, avarias/ausências, fotos, assinatura quando aplicável e devolução ao estoque ou manutenção, sem destruir alocações anteriores.

## 9. Chamados de suporte — V1

Colaborador poderá abrir e acompanhar chamados com título, descrição, categoria, prioridade e anexos. A TI poderá atribuir responsável, alterar situação, comentar, controlar SLA, encerrar e auditar o atendimento.

Categorias iniciais: Microsoft 365; equipamentos; sistemas corporativos; rede e conectividade; acessos e permissões; instalação e configuração; outros.

Estados sugeridos: aberto, triagem, em_atendimento, aguardando_colaborador, aguardando_terceiro, resolvido, fechado. Tempos de SLA e regras de escalonamento ainda precisam ser acordados. Exibir artigos relacionados antes e durante a abertura do chamado.

## 10. Central de Tutoriais — V1

Fonte atual: **pasta no OneDrive da TI**. Formatos: vídeos, PDF, Word, imagens e links.

Capacidades: categorias por produto, pesquisa, destaques, tutoriais recomendados por acesso/cargo, publicação administrada pela TI, exibição/reprodução respeitando permissões do Microsoft 365 e atalho para abrir chamado.

**Segurança:** acesso ao portal não concede automaticamente acesso a todos os arquivos do OneDrive da TI. Autorizar somente conteúdos publicados para o público correspondente. Para médio prazo, avaliar biblioteca SharePoint corporativa em vez de depender de uma conta individual de OneDrive.

## 11. Portal do colaborador

Após entrar no portal **(v1.2) com o e-mail corporativo e a senha do portal** (§24), o colaborador verá apenas: **meus equipamentos**, **meus chamados**, **meus documentos disponibilizados** e **tutoriais**. Também poderá obter orientações sobre sistemas liberados ao seu perfil. Não terá acesso a registros, equipamentos ou documentos de outras pessoas.

## 12. Perfis, ~~aprovações~~ permissões e auditoria

| Permissão | Estagiário TI | Supervisor TI | Gestor ADM |
|---|---|---|---|
| Cadastrar e atualizar colaborador | Sim | Sim | Sim |
| ~~Aprovar criação de contas~~ **(v1.2)** Executar provisionamento (criar contas Microsoft 365, licenças, grupos, caixas, sistemas) — sem aprovação hierárquica | **Somente com permissão individual** concedida por Supervisor TI ou Gestor ADM (DT-07) | Sim | Sim |
| Inventário e TER/TDV | Sim | Sim | Sim |
| Atender chamados e administrar tutoriais | Sim | Sim | Sim |
| Consultar CPF e auditoria | Sim | Sim | Sim |
| Alterar perfis administrativos e permissões | Não | ~~A definir~~ **Sim (v1.2)** | Sim |
| **(v1.2)** Conceder privilégios a si mesmo | Não | — (já possui autoridade administrativa) | — (idem) |
| **(v1.2)** Alterar regras de segurança | Não | Sim | Sim |

Haverá também o perfil **Colaborador**, separado da equipe de TI: usa o portal de autosserviço e vê somente seus equipamentos, documentos, chamados e tutoriais autorizados, sem acesso a dados administrativos.

**(v1.2) Relação entre os perfis (DT-04 a DT-07):**

- **Supervisor TI e Gestor ADM não têm relação hierárquica** e possuem **permissões administrativas equivalentes**: ambos administram perfis e permissões e concedem e removem perfis administrativos, inclusive um ao outro.
- A diferença entre eles é **só de experiência de interface**: o Supervisor TI tem foco operacional; o Gestor ADM tem foco gerencial (dashboards, indicadores, consultas, relatórios e auditoria), podendo fazer alterações administrativas quando necessário. Essa diferença não limita a autorização.
- O **Estagiário TI** executa as operações diárias (colaboradores, inventário, alocações, TER, TDV e chamados), não modifica perfis administrativos, não concede privilégios a si mesmo nem a outros e não altera regras de segurança.
- Permissões individuais continuam possíveis, mas nunca ultrapassam as restrições obrigatórias de segurança; alterações de permissões são auditadas; a aplicação impede a remoção acidental de todos os administradores ativos; alterações críticas exigem confirmação e autenticação recente.

Registrar eventos de operações críticas: quem, quando, objeto, tipo de ação, resultado, identificador de correlação e ~~referência à aprovação~~ **(v1.2) executor e referência à confirmação**. Auditoria deverá ser somente leitura pela interface, com proteção contra adulteração, políticas de retenção e controle estrito de acesso; nenhum administrador pode eliminar registros de auditoria.

## 13. Teams, desligamento e custos — expansão

**Teams:** aproveitar conceitos do `TeamsReport.zip`, com regras de filiação por empresa/cargo, exceções individuais e prévia de alterações ~~para aprovação~~ **(v1.2) com confirmação explícita (reforçada para remoções)** antes da aplicação. Conferir cuidadosamente exclusões de grupos/canais.

**Desligamento:** processo controlado de desativação de contas e acessos, recuperação de ativos, TDV e preservação de evidências e históricos legais.

**Custos:** aproveitar o modelo da planilha `Distribuição de Custos.xlsx` para licenças, despesas por empresa, rateios, alocações e histórico.

## 14. Materiais fornecidos pela TI

| Arquivo | Papel no projeto |
|---|---|
| `TER_VALLUR_v22.html` | Modelo de termo de entrega |
| `TDV_VALLUR_v08.html` | Modelo de devolução e vistoria |
| `TeamsReport.zip` | Ferramenta existente de permissões Teams |
| `Inventário de TI.xlsx` | Inventário, alocação e manutenção |
| `Distribuição de Custos.xlsx` | Custos/licenças e rateios |
| `SGSI - Senhas.xlsx` | Referência de processo, **não** fonte de senhas a importar |
| `SGSI - Novo Usuário.xlsx` | Processo e convenções atuais de admissão |

Rever consistência, duplicidades e dados pessoais antes de qualquer carga. **Não importar senhas existentes para a aplicação.**

## 15. Linguagens e tecnologias recomendadas

| Categoria | Tecnologia | Finalidade |
|---|---|---|
| Linguagem principal | **TypeScript** | Frontend, backend e serviços |
| Interface | **Next.js + React** | Portal web responsivo |
| Estilo | **Tailwind CSS** | Design consistente |
| Componentes | **shadcn/ui + componentes próprios** | Formulários, tabelas e navegação |
| Banco de dados | **PostgreSQL** | Registros transacionais e históricos |
| Banco inicial hospedado | **Supabase (PostgreSQL)** | Ambiente inicial de desenvolvimento/testes |
| ORM/migrações | **Prisma** | Modelagem e versionamento do esquema |
| SQL | **SQL** | Consultas e operações de banco |
| Autenticação | ~~**Microsoft Entra ID**~~ **(v1.2) Autenticação própria do portal** com biblioteca consolidada compatível com Next.js, TypeScript, Prisma e PostgreSQL (proposta técnica em `ARQUITETURA_TECNICA.md`, DA-24) | Login com e-mail corporativo e senha, hash Argon2id, sessões próprias, MFA para a TI; **não** Supabase Auth; **não** SSO Microsoft |
| Microsoft 365 | **Microsoft Graph** (autenticação de aplicação, permissões mínimas e segregadas) | Contas, grupos, licenças e arquivos autorizados |
| Formulários | **React Hook Form + Zod** | Entrada e validação de dados |
| Tabelas | **TanStack Table** | Tabelas avançadas e filtros |
| Dados assíncronos | **TanStack Query** | Cache e sincronização de interface |
| Testes de unidade | **Vitest** | Regras e componentes |
| Testes de ponta a ponta | **Playwright** | Fluxos reais de navegação |
| Execução | **Node.js** | Runtime TypeScript/Next.js |
| Arquivos | **Storage privado com adaptador** | Fotos, PDFs, TER e anexos |
| Processamento assíncrono | **Redis + BullMQ (quando necessário)** | Provisionamentos, retries e filas |
| Contêineres | **Docker** | Desenvolvimento e implantação repetíveis |
| Versionamento | **Git + GitHub privado** | Código-fonte `vallur-ti-portal` |
| Automação | **GitHub Actions** | Testes e implantação |
| Desenvolvimento | **VS Code + Claude Code** | Editor e assistência de programação |
| Legado opcional | **PowerShell** | Reaproveitamento controlado de scripts Teams |

Linguagens do projeto: TypeScript (principal), SQL, HTML/CSS (pela interface React), JSON (contratos/configuração) e PowerShell opcional. Não há exigência de Python, Java ou PHP como linguagem principal.

## 16. Arquitetura de aplicação

```text
Navegador (colaborador / TI)
    |
Next.js + React + TypeScript (interface)
    |
Backend seguro (rotas/API + regras de negócio + RBAC + auditoria)
    |                       |
Prisma -> PostgreSQL        Conectores externos
(Supabase inicialmente)     - Microsoft Graph
    |                       - Konviva / UCS Online [a habilitar]
Arquivos privados            - Diário de Obra [a confirmar]
(adapter de storage)         - D4Sign [a confirmar]
                            - OneDrive / SharePoint
```

O backend será responsável pela autorização e por ações administrativas: **não executar provisionamento Microsoft nem liberar dados sensíveis a partir de chamadas diretas do navegador ao banco**. Isolar conectores de fornecedores, regras de domínio e mecanismos de armazenamento.

### Estrutura inicial sugerida do repositório

```text
vallur-ti-portal/
  docs/
    PORTAL_TI_VALLUR_PLANO_MESTRE.md
  src/
    app/                 # Páginas e rotas Next.js
    components/          # Componentes visuais
    features/            # Colaboradores, inventário, chamados etc.
    server/              # API, serviços, permissões e auditoria
    integrations/        # Microsoft, Senior, Diário de Obra, D4Sign
    lib/                 # Utilitários e validadores
  prisma/
    schema.prisma
    migrations/
  tests/
  public/
  .env.example          # Sem segredos reais
```

## 17. Supabase agora; banco da empresa depois

**Sim, é viável migrar**, porque o Supabase usa PostgreSQL. A estratégia é utilizar o Supabase sobretudo como banco gerenciado inicial, evitando dependências difíceis de substituir.

**Diretrizes obrigatórias para facilitar a troca:**

1. Usar Prisma + PostgreSQL padrão e versionar migrações.
2. ~~Manter autenticação no Microsoft Entra ID~~ **(v1.2)** Manter a autenticação própria do portal no PostgreSQL da aplicação (contas, hashes e sessões migram junto com o banco), sem dependência estrutural do Supabase Auth.
3. Não acoplar regras de negócio a Edge Functions exclusivas do Supabase.
4. Encapsular armazenamento de arquivos em uma interface substituível; o backup do PostgreSQL **não** equivale ao backup dos objetos no Storage.
5. Centralizar parâmetros em variáveis de ambiente, sem segredos no Git.
6. Preparar backup/restauração e testes de integridade antes de dados reais.

**Plano de migração futuro:** levantar PostgreSQL compatível no ambiente Virta; exportar esquema/dados; restaurar; migrar os objetos do armazenamento separadamente; validar usuários, anexos, termos, fotos e integrações; alterar configurações; homologar e executar corte controlado para evitar perda de alterações.

**Ressalva:** ainda não sabemos qual banco e quais recursos existem na VPS da Virta. Se o destino for SQL Server ou MySQL, a migração será mais trabalhosa e exigirá transformação de dados e alterações na aplicação.

## 18. Experiência visual e design system

**Direção:** aplicativo corporativo operacional, objetivo, sólido e consistente; evitar estética de protótipo genérico gerado por IA.

Paleta preliminar (não é identidade oficial validada): azul principal `#17365D`, azul de ação `#2764A5`, fundo `#F4F6F9`, superfícies `#FFFFFF`, texto `#344054`.

Padrões: navegação lateral no desktop; menu compacto no celular; tabelas com filtros e paginação; formulários com validação explícita; ações destrutivas com confirmação; estados vazios e de erro; navegação por teclado; contraste legível; experiência fluida em celular e tablet. Criar um design system local em vez de estilos isolados por tela.

## 19. Segurança, LGPD e operação

- ~~Login Microsoft~~ **(v1.2)** Login próprio do portal (§24), validação de sessão e autorização no backend.
- Perfis de TI limitam acesso a dados pessoais; colaborador vê somente informações próprias.
- ~~Aprovação por Supervisor TI ou Gestor ADM antes de criação de contas.~~ **(v1.2)** Confirmação explícita, permissão de provisionamento e autenticação recente antes de criar contas; confirmação reforçada em operações destrutivas (DT-03).
- **(v1.2)** MFA obrigatório planejado para os integrantes da TI; proteção contra força bruta e enumeração de contas.
- Senhas e chaves de APIs jamais registradas em logs ou em histórico.
- Segredos mantidos em ambiente seguro, não no GitHub.
- Auditoria de mudanças relevantes e tentativas críticas.
- Armazenamento privado de fotos, PDFs e anexos; URLs temporárias quando aplicável.
- Política de retenção, backup, restauração, criptografia e resposta a incidentes a definir na homologação.
- Separação entre ambientes de desenvolvimento, teste e produção; evitar uso de dados pessoais reais em testes sem necessidade.
- Testes automatizados e revisão de segurança antes de integração em produção.

## 20. Plano de entrega por etapas

1. **Fundação:** repositório, padrões, Next.js, banco, ~~login Entra~~ **login próprio e MFA da TI (v1.2)**, perfis e auditoria.
2. **Colaboradores e Microsoft:** empresas, cadastros, ~~aprovações~~, contas **(provisionamento sem aprovação, v1.2)**, licenças e caixas postais.
3. **Inventário e TER:** importação de dados, ativos, acessórios, fotos, alocação, documento e PDF assinado.
4. **Suporte e conhecimento:** chamados, portal do colaborador, tutoriais do OneDrive.
5. **Conectores adicionais:** Senior/Konviva, Diário de Obra e D4Sign conforme documentação e contrato.
6. **Expansão:** TDV, regras Teams, desligamentos e custos.
7. **Homologação/implantação:** testes, migração controlada, backups, infraestrutura e publicação.

Cada etapa deverá conter critérios de aceite, testes, revisão de permissões e documentação mínima antes de ser considerada concluída.

## 21. Pendências e validações externas

| Tema | Necessidade |
|---|---|
| Microsoft 365 | Permissões Graph, políticas de senha, licenças e comportamento de caixas compartilhadas |
| Diário de Obra | API de criação/atualização de usuários e perfis/obras |
| D4Sign | API/SCIM ou mecanismo oficial para provisionamento de contas |
| Unividade/UCS Online | Habilitação, autenticação e recursos efetivos do conector Konviva |
| Teams | Catálogo definitivo de regras por empresa/cargo e exceções |
| Chamados | SLA, horários e escalonamento |
| OneDrive | Pasta exata, escopo de compartilhamento e conteúdo público ao colaborador |
| VPS Virta | Sistema operacional, banco, recursos, backups e requisitos de implantação |
| LGPD | Prazo de retenção, base legal e governança dos dados |
| Marca | Logotipos, cores e identidade visual final |

## 22. Regras para implementação com Claude Code

1. Ler este documento antes de iniciar cada módulo e preservar decisões confirmadas.
2. Não inventar endpoints, credenciais, recursos de plano ou integrações externas.
3. ~~Exigir fluxo de aprovação para provisionamentos sensíveis.~~ **(v1.2)** Exigir, para provisionamentos, confirmação explícita, permissão verificada no backend, autenticação recente e auditoria; confirmação reforçada para operações destrutivas. Não há aprovação hierárquica (DT-03).
4. Construir primeiro regras de negócio e permissões, depois telas.
5. Nunca expor credenciais nem dados de outros colaboradores no navegador.
6. Implementar migrações de banco e testes relevantes com cada alteração.
7. Preservar o histórico de movimentação de ativos, empresas e acessos.
8. Usar componentes visuais reutilizáveis e design system uniforme.
9. Tratar erros parciais nas integrações sem duplicar objetos externos.
10. Não executar operações reais em produção sem configuração explícita e autorização.

## 23. Fontes e referências técnicas

- Microsoft Graph: https://learn.microsoft.com/graph/overview
- Microsoft identity platform: https://learn.microsoft.com/entra/identity-platform/
- Supabase — documentação: https://supabase.com/docs
- Prisma — documentação: https://www.prisma.io/docs
- Next.js — documentação: https://nextjs.org/docs
- (v1.2) OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- (v1.2) NIST SP 800-63B-4 (autenticadores e senhas): https://pages.nist.gov/800-63-4/sp800-63b.html
- Konviva/UCS Online: documentação e habilitação devem ser solicitadas à Senior para o ambiente contratado.
- D4Sign API: https://docapi.d4sign.com.br/
- Diário de Obra: https://web.diariodeobra.app/

---

**Conclusão:** o Grupo Vallur terá um portal corporativo único para admissão, identidades, acessos, equipamentos, TER, chamados e conteúdos de ajuda. A stack proposta é **Next.js + React + TypeScript + Tailwind CSS + shadcn/ui + Prisma + PostgreSQL no Supabase inicialmente + autenticação própria do portal (v1.2) + integração com Microsoft Entra ID e Microsoft Graph**. O projeto será desenvolvido localmente, com arquitetura preparada para a futura infraestrutura da Virta e com conectores externos habilitados apenas após validação técnica.

## 24. Autenticação e contas do portal (v1.2)

Decisões da TI de 15/10/2026 (DT-01 e DT-02; registro em `ARQUITETURA_TECNICA.md` §16.2). Detalhamento técnico proposto em `ARQUITETURA_TECNICA.md` §9.

**Regras confirmadas**

- O portal tem tela de login própria e **não** usa login Microsoft (SSO).
- O login do colaborador é o seu **e-mail corporativo**.
- A TI configura a senha durante o cadastro. A senha inicial pode ser a mesma informada para criar a conta Microsoft 365.
- O colaborador entra com as credenciais configuradas pela TI.
- O portal mantém suas próprias sessões e seu próprio controle de autenticação.
- A conta local fica vinculada ao cadastro interno do colaborador. O Microsoft Entra Object ID continua armazenado para integrações, quando disponível, mas não é o identificador principal da conta do portal.
- Depois da criação, a senha do portal e a do Microsoft 365 são independentes (§4). Sem sincronização de senhas, sem ROPC, sem consulta de senhas no Entra ID.
- Supabase Auth não é usado sem nova decisão explícita da TI.

**Segurança obrigatória**

- Biblioteca de autenticação consolidada, compatível com Next.js, TypeScript, Prisma e PostgreSQL.
- Somente hashes seguros das senhas do portal, preferencialmente Argon2id; nunca senha em texto puro.
- Senhas nunca em logs, auditoria, filas, arquivos temporários persistentes ou ferramentas de monitoramento.
- Proteção contra força bruta e enumeração de contas.
- MFA obrigatório planejado para os integrantes da TI.
- Cookies `HttpOnly`, `Secure` e `SameSite` adequados; encerramento seguro de sessões.
- Recuperação e redefinição de senhas.
- Autenticação recente para operações administrativas de alto risco.
- Bloqueio das contas do portal no desligamento ou na revogação de acesso.
- Alteração de e-mail sem duplicar identidades.

**Pendente de decisão da TI** (questões em `ARQUITETURA_TECNICA.md` §16): troca obrigatória da senha no primeiro acesso (Q-36 — **não** é requisito confirmado); canal de e-mail para a recuperação de senha pelo próprio colaborador (Q-37); detalhes do MFA (Q-38); política de senha do portal (Q-39); contas do portal para colaboradores já existentes (Q-40); colaborador sem e-mail corporativo (Q-41); indicadores da visão gerencial (Q-42); ativação do perfil de TI pelo próprio titular, com senha própria e MFA (Q-43).

**Risco reconhecido:** reutilizar a senha inicial do Microsoft 365 no portal faz com que quem conhece uma conheça a outra até a primeira troca, e quem cadastra conhece as duas. Mitigações recomendadas em `ARQUITETURA_TECNICA.md` (R-24).

## 25. Histórico de versões

| Versão | Data | Alteração |
|---|---|---|
| 1.1 | 14/10/2026 | Versão de referência da Fase 01 (também disponível em PDF) |
| 1.2 | 15/10/2026 | Decisões DT-01 a DT-07. Substituído: entrada no portal pela identidade Microsoft Entra ID (§1, §4, §11, §15, §17.2, §19, §20); aprovação de Supervisor TI ou Gestor ADM antes da criação de contas e o módulo "Aprovações" (§2, §3 passo 4, §4, §12, §13, §19, §20, §22.3); "Alterar perfis administrativos — Supervisor TI: A definir" (§12, passa a "Sim", conforme a decisão Q-07 de 14/10/2026). Acrescentado: §24 (autenticação e contas do portal) e este histórico. O PDF não foi regenerado e permanece na versão 1.1 |
