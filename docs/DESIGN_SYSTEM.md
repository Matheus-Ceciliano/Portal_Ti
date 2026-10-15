# Design System — Portal TI Vallur

**Fase:** 01 — Arquitetura e planejamento
**Situação:** **proposta**. Nenhuma tela foi implementada.
**Revisão 01.3 (14/10/2026):** visibilidade de menus e botões a partir das permissões efetivas (§7.1), faixa de ambiente (DA-23, §7.3), avisos de nova digitação da senha (Q-25, §9.2) e versão/hash no painel de aprovação (Q-04, §10.1).
**Revisão 01.4 (15/10/2026):** incorpora as decisões da TI DT-01 a DT-07 (`ARQUITETURA_TECNICA.md` §16.2). Mudanças: login próprio do portal com segundo fator para a TI, sem login Microsoft (DT-01, §10.4, §13); senha inicial informada no cadastro e usada na mesma confirmação (DT-02, §9.2); fim da aprovação hierárquica, com revisão e confirmação pelo executor e confirmação reforçada nas operações destrutivas (DT-03, §9.1, §10.1); item "Aprovações" e etiqueta "Autoaprovação" removidos (§7.1, §11); visões operacional e gerencial (DT-06, §7.4); estados da conta de acesso (§11). As regras substituídas ficam registradas em notas históricas.
**Revisão 01.4 — correções da revisão especializada (15/10/2026) [PROPOSTA]:**
- Senha no assistente vive só em memória até a etapa 5 e é limpa ao sair do assistente, não ao sair da etapa (§9, §9.2).
- Campo da senha de outra pessoa com `autocomplete="new-password"` e verificação no Chrome e no Edge (§9.2, §14.2).
- Reautenticação antes de enviar a senha (§9.2).
- Aviso de expiração da sessão, WCAG 2.2.1 (§10.4).
- Nova tentativa de criação da conta Microsoft começa por verificação sem senha (§9.2).
- Caminho de quem não tem `provisionamento.executar` (§9, §10.1).
- Ativação de perfil de TI com código de uso único (Q-43, §10.4).
- Alertas compensatórios (§10.5).
- Novos estados (§11) e linhas responsivas (§12).

> **Aviso de marca:** cores, tipografia e logotipos oficiais do Grupo Vallur **ainda não foram fornecidos** (PM §21, Q-22). Os tokens abaixo partem da **paleta preliminar** do PM §18, que o próprio PM declara "não é identidade oficial validada". Nada aqui deve ser apresentado como padrão de marca aprovado. Quando a marca oficial chegar, ela substitui os tokens primitivos; os tokens semânticos e os componentes permanecem.

Referências: `ARQUITETURA_TECNICA.md` §6 (arquitetura de frontend), `PERMISSOES_RBAC.md` §5 (o que cada público vê), `CLAUDE.md` (diretrizes obrigatórias de UI/UX).
Ferramentas consultadas nesta fase: skills `ui-ux-pro-max` (busca de sistema de design para "enterprise admin internal IT operations", diretrizes de UX e tipografia) e `frontend-design`. O resultado da busca foi usado como insumo; a paleta sugerida pela skill (azul `#2563EB` com acento laranja) **não foi adotada** porque o PM já define uma paleta preliminar, que prevalece.

---

## 1. Direção visual

**Conceito:** "mesa de operações da TI". Um aplicativo corporativo de trabalho diário, objetivo e denso o suficiente para quem cadastra dezenas de ativos por semana, mas calmo para o colaborador que só quer ver seus equipamentos (PM §18).

| Princípio | Aplicação |
|---|---|
| Estado em primeiro lugar | A informação mais importante de quase toda tela é "em que situação isto está" (solicitação, execução, ativo, termo, chamado). O sistema de estados (§11) é o elemento visual mais cuidado do produto; todo o resto fica sóbrio |
| Azul principal (preliminar, Q-22) como estrutura, não como decoração | O azul principal `#17365D` aparece na navegação e em títulos; o azul de ação `#2764A5` só em elementos interativos. Superfícies são neutras |
| Densidade controlada | Área de TI com tabelas compactas (linhas de 44 px) e formulários em seções; portal do colaborador com mais respiro e textos maiores |
| Hierarquia por tipografia e espaço | Não por cor, sombra ou bordas grossas |
| Sem enfeites | Proibidos: gradientes chamativos, glassmorphism, ilustrações decorativas, animações de entrada em cascata, ícones emoji (`CLAUDE.md`, diretriz nº 10) |
| Linguagem clara | Rótulos em português, em caixa de frase (não MAIÚSCULAS), verbos que dizem o que acontece ("Criar conta e executar", não "Enviar") |

Diferença entre os dois públicos:

| Aspecto | Área de TI (`/ti`) | Portal do colaborador (`/portal`) |
|---|---|---|
| Navegação | Barra lateral azul-institucional | Barra superior clara; navegação inferior no celular |
| Densidade | Compacta | Confortável |
| Conteúdo dominante | Tabelas, formulários, linhas do tempo | Listas curtas e cartões de equipamento/documento |
| Tamanho de texto base | 14 px (desktop) / 16 px (celular) | 16 px |

---

## 2. Tokens de cor

### 2.1 Primitivos (proposta derivada do PM §18)

| Token primitivo | Hex | Origem |
|---|---|---|
| `azul-900` | `#17365D` | **PM §18 — azul principal** |
| `azul-850` | `#22487A` | Proposta (item ativo na barra lateral; em luminosidade fica entre `azul-900` e `azul-800`) |
| `azul-800` | `#1F5189` | Proposta (escurecimento do azul de ação, para *hover*) |
| `azul-700` | `#2764A5` | **PM §18 — azul de ação** |
| `azul-300` | `#8DB4E2` | Proposta (indicador e foco sobre fundo escuro) |
| `azul-200` | `#C7D7EA` | Proposta (texto sobre barra lateral) |
| `azul-50` | `#EAF1F9` | Proposta (fundo de seleção/informação) |
| `cinza-950` | `#101828` | Proposta (títulos) |
| `cinza-700` | `#344054` | **PM §18 — texto** |
| `cinza-600` | `#475467` | Proposta (texto secundário) |
| `cinza-500` | `#667085` | Proposta (texto auxiliar) |
| `cinza-450` | `#7D8799` | Proposta (borda de campos de formulário) |
| `cinza-200` | `#E4E7EC` | Proposta (divisórias) |
| `cinza-100` | `#F2F4F7` | Proposta (fundo neutro de badges, linhas listradas) |
| `cinza-50` | `#F4F6F9` | **PM §18 — fundo** |
| `branco` | `#FFFFFF` | **PM §18 — superfícies** |
| `verde-700` / `verde-50` | `#067647` / `#ECFDF3` | Proposta (sucesso) |
| `ambar-700` / `ambar-50` | `#B54708` / `#FFFAEB` | Proposta (atenção) |
| `vermelho-700` / `vermelho-50` | `#B42318` / `#FEF3F2` | Proposta (erro/destrutivo) |
| `violeta-700` / `violeta-50` | `#6941C6` / `#F4F3FF` | Proposta (ação manual pendente — distingue de "atenção") |

### 2.2 Semânticos (mapeados para as variáveis do shadcn/ui)

Os componentes **nunca** usam hex ou primitivos diretamente; usam estes tokens (CSS variables no `globals.css`, expostas ao Tailwind). Convenção do shadcn/ui com Tailwind CSS v4: variáveis declaradas em `:root` e mapeadas em `@theme inline` (no v4 a barra lateral usa `--sidebar`; no v3 era `--sidebar-background`).

| Token semântico (variável shadcn) | Valor | Uso |
|---|---|---|
| `--background` | `cinza-50` | Fundo da aplicação |
| `--foreground` | `cinza-700` | Texto padrão |
| `--card` / `--popover` | `branco` | Superfícies |
| `--card-foreground` / `--popover-foreground` | `cinza-700` | — |
| `--primary` | `azul-700` | Botão primário, links, seleção |
| `--primary-foreground` | `branco` | Texto sobre primário |
| `--secondary` | `cinza-100` | Botão secundário |
| `--secondary-foreground` | `cinza-700` | — |
| `--muted` | `cinza-100` | Fundos neutros |
| `--muted-foreground` | `cinza-600` | Texto secundário |
| `--accent` | `azul-50` | *Hover* de itens de menu e linhas |
| `--accent-foreground` | `azul-800` | — |
| `--destructive` | `vermelho-700` | Ações destrutivas |
| `--border` | `cinza-200` | Divisórias e contornos de superfícies |
| `--input` | `cinza-450` | Contorno de campos (precisa de 3:1) |
| `--ring` | `azul-700` | Anel de foco |
| `--sidebar` | `azul-900` | Barra lateral da área de TI |
| `--sidebar-foreground` | `azul-200` | Itens da barra lateral |
| `--sidebar-accent` | `azul-850` | Item ativo/*hover* |
| `--sidebar-accent-foreground` | `branco` | — |
| `--sidebar-ring` | `azul-300` | Foco sobre fundo escuro |
| `--sidebar-primary` / `--sidebar-primary-foreground` | `azul-300` / `azul-900` | Destaques dentro da barra lateral (ex.: marca) |
| `--sidebar-border` | `azul-850` | Divisórias da barra lateral |
| `--radius` | `0.5rem` | Base de raio do shadcn/ui; `sm`/`md`/`lg` resultam em 4/6/8 px (§4) |
| `--chart-1` … `--chart-5` | `azul-700`, `azul-900`, `verde-700`, `ambar-700`, `cinza-500` | Gráficos simples do dashboard, sempre com rótulos e tabela alternativa |
| `--titulo` (próprio) | `cinza-950` | Títulos de página e seção |
| `--sucesso`, `--atencao`, `--erro`, `--info`, `--manual`, `--neutro` (+ `-fundo`) | ver §2.1 | Estados (§11) |

### 2.3 Contraste verificado (WCAG 2.2)

Razões calculadas pela fórmula de luminância relativa da WCAG. Mínimos: texto normal 4.5:1; texto grande e componentes de interface 3:1.

| Par (texto / fundo) | Razão | Resultado |
|---|---|---|
| `cinza-700` / `branco` | 10.46 | AA/AAA |
| `cinza-700` / `cinza-50` | 9.66 | AA/AAA |
| `cinza-950` / `branco` | 17.75 | AA/AAA |
| `cinza-600` / `branco` | 7.69 | AA/AAA |
| `cinza-600` / `cinza-50` | 7.10 | AA/AAA |
| `cinza-500` / `branco` | 4.97 | AA (somente texto auxiliar) |
| `branco` / `azul-700` (botão primário) | 6.08 | AA |
| `branco` / `azul-800` (botão primário *hover*) | 8.09 | AA/AAA |
| `azul-700` / `branco` (link) | 6.08 | AA |
| `branco` / `azul-900` (barra lateral) | 12.19 | AA/AAA |
| `azul-200` / `azul-900` (itens da barra lateral) | 8.32 | AA/AAA |
| `branco` / `azul-850` (item ativo) | 9.23 | AA/AAA |
| `azul-300` / `azul-850` (indicador do item ativo, não textual) | 4.29 | ≥ 3:1 |
| `cinza-450` / `branco` (borda de campo) | 3.62 | ≥ 3:1 (componente) |
| `verde-700` / `verde-50` | 5.40 | AA |
| `ambar-700` / `ambar-50` | 5.20 | AA |
| `vermelho-700` / `vermelho-50` | 6.05 | AA |
| `violeta-700` / `violeta-50` | 6.02 | AA |
| `azul-800` / `azul-50` | 7.11 | AA/AAA |
| `cinza-600` / `cinza-100` | 6.98 | AA |
| `branco` / `vermelho-700` (botão destrutivo) | 6.57 | AA |

**Ajustes obrigatórios nos componentes gerados pelo shadcn/ui** (os padrões atuais não atendem a estes tokens):

- Anel de foco: o padrão `focus-visible:ring-[3px] ring-ring/50` usa 50% de opacidade (≈ 2.2:1 sobre branco, abaixo de 3:1). Substituir por `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`, com opacidade total.
- Botão `outline` (nosso `secundario`) e demais controles com contorno: usar `border-input` (`cinza-450`), não `border-border`.

`cinza-200` (divisórias, 1.24:1) é usado **apenas** onde a borda não é necessária para identificar o componente (separação de seções, linhas de tabela). Campos de formulário, caixas de seleção e botões secundários usam `cinza-450`.

### 2.4 Modo escuro

Fora da V1 [PROPOSTA]. Os tokens semânticos permitem adicioná-lo depois sem alterar componentes; quando ocorrer, cada par será recalculado (não inverter cores).

---

## 3. Tipografia

| Papel | Proposta | Motivo |
|---|---|---|
| Família principal | **Source Sans 3** (licença SIL OFL), carregada localmente com `next/font` (sem requisição a serviços externos em tempo de execução) | Humanista, muito legível em tamanhos pequenos, acentuação completa do português, algarismos tabulares, pesos 400–700. Menos genérica que Inter, sem perder sobriedade |
| Identificadores técnicos | Pilha monoespaçada do sistema (`ui-monospace, SFMono-Regular, Consolas, monospace`) | Somente para IDs técnicos (ID de correlação, ID de objeto do Entra) na auditoria e na tela de integrações. Patrimônio, série e números de chamado usam a família principal com algarismos tabulares |
| Algarismos | `font-variant-numeric: tabular-nums` em tabelas, datas, quantidades e números de documento | Colunas alinhadas |

### 3.1 Escala

| Token | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| `texto-titulo-pagina` | 24 / 32 px (20 / 28 no celular) | 600 | Título da página (um por tela, `h1`) |
| `texto-titulo-secao` | 18 / 26 px | 600 | Seções e cabeçalhos de cartão (`h2`) |
| `texto-subtitulo` | 16 / 24 px | 600 | Grupos de formulário (`h3`, `legend`) |
| `texto-corpo` | 16 / 24 px | 400 | Portal do colaborador; textos longos |
| `texto-corpo-compacto` | 14 / 20 px | 400 | Tabelas e formulários da área de TI no desktop |
| `texto-rotulo` | 14 / 20 px | 500 | Rótulos de campo, cabeçalhos de coluna |
| `texto-auxiliar` | 13 / 18 px | 400 | Textos de ajuda, metadados |
| `texto-minimo` | 12 / 16 px | 500 | Somente badges; nunca texto corrido |

Regras: rótulos e títulos em caixa de frase; sem MAIÚSCULAS espaçadas como rótulo decorativo; linhas de texto corrido limitadas a ~75 caracteres; campos de entrada com 16 px no celular (evita *zoom* automático no iOS).

---

## 4. Espaçamento, forma e elevação

| Token | Valor | Uso |
|---|---|---|
| Unidade base | 4 px | Toda medida é múltipla de 4 |
| `espaco-1..12` | 4, 8, 12, 16, 20, 24, 32, 40, 48 px | Escala do Tailwind (`1`=4 px) |
| Espaço entre campos | 16 px (vertical), 24 px (horizontal) | Formulários |
| Espaço entre seções | 32 px | Páginas |
| Margem lateral da página | 16 px (celular), 24 px (tablet), 32 px (desktop) | — |
| Raio | 4 px (badges, campos pequenos), 6 px (botões e campos), 8 px (cartões, diálogos) | Raio cresce com o tamanho do elemento |
| Elevação | Nível 0: sem sombra (padrão); nível 1: `0 1px 2px rgb(16 24 40 / 0.06)` (cartões sobre fundo cinza); nível 2: `0 8px 24px rgb(16 24 40 / 0.12)` (menus, diálogos, gavetas) | Só três níveis |
| Camadas (`z-index`) | conteúdo 0, cabeçalho fixo 10, barra lateral 20, gaveta/overlay 40, diálogo 50, toast 60 | Escala única |
| Movimento | 150 ms (estado de controle), 200 ms (abrir menus/diálogos), saída 70% da entrada; desativado com `prefers-reduced-motion` | Apenas movimento que responde a ação do usuário |

---

## 5. Fundamentos de layout

### 5.1 Pontos de quebra

Pontos padrão do Tailwind: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536. **Viewports de validação obrigatórios: 375, 390, 768 e 1440 px** (ver §14). São pontos de verificação, não as únicas larguras suportadas: o layout deve funcionar em qualquer largura a partir de 320 px. A quebra de 1024 px (`lg`) é um ponto de comportamento do layout (aparecimento da barra lateral), não um ponto de validação obrigatório.

### 5.2 Estrutura da área de TI

```text
Desktop (≥ 1024 px)
┌──────────────┬──────────────────────────────────────────────────────┐
│ Portal TI    │ Início › Colaboradores › Ana Souza       [busca] [Ana]│
│ Vallur       ├──────────────────────────────────────────────────────┤
│              │ Ana Souza                     [Editar] [Nova solicit.]│
│ Início       │ Ativa · Construtora X · Analista                       │
│ Colaboradores│ ┌ Dados ┬ Vínculos ┬ Acesso ┬ Contas ┬ Equip. ┬ Termos ┐│
│ Solicitações │ │                                                    │ │
│ Tarefas m.  4│ │  conteúdo da aba                                   │ │
│ Inventário   │ │                                                    │ │
│ Alocações    │ └────────────────────────────────────────────────────┘ │
│ Termos       │                                                        │
│ Chamados  12 │                                                        │
│ Tutoriais    │                                                        │
│ ──────────   │                                                        │
│ Auditoria    │                                                        │
│ Configurações│                                                        │
└──────────────┴──────────────────────────────────────────────────────┘
  240 px         conteúdo fluido, largura máxima de leitura 1280 px
```

- Revisão 01.4: o item "Aprovações" saiu da barra lateral (DT-03), e a ficha do colaborador ganhou a aba "Acesso" (conta de acesso ao portal: situação, último acesso, MFA configurado e sessões, nunca a senha nem o hash).
- Barra lateral de 240 px em `lg+`; recolhível para trilho de ícones de 64 px. A preferência fica em *cookie* lido no layout do servidor (mesmo padrão `sidebar_state` do shadcn/ui), evitando salto de layout na hidratação.
- Cabeçalho de página: trilha (*breadcrumb*) para níveis ≥ 3, título, metadados de estado e no máximo **uma** ação primária; demais ações em botões secundários ou menu "Mais ações".
- Conteúdo alinhado à esquerda; formulários com largura máxima de 720 px; tabelas ocupam toda a largura.

### 5.3 Estrutura do portal do colaborador

```text
Celular (375–767 px)                 Desktop (≥ 1024 px)
┌───────────────────────────┐        ┌─────────────────────────────────────────────┐
│ Portal TI Vallur     [Ana]│        │ Portal TI Vallur  Início Equipamentos ... [Ana]│
├───────────────────────────┤        ├─────────────────────────────────────────────┤
│ Olá, Ana                  │        │ Meus equipamentos                            │
│ Meus equipamentos (3)     │        │ ┌───────────┐ ┌───────────┐ ┌───────────┐    │
│ ┌───────────────────────┐ │        │ │ Notebook  │ │ Monitor   │ │ Mouse     │    │
│ │ Notebook Dell Latitude│ │        │ └───────────┘ └───────────┘ └───────────┘    │
│ │ Patrimônio 004512     │ │        │ Chamados abertos                             │
│ └───────────────────────┘ │        │ ...                                          │
│ Chamados abertos (1)      │        └─────────────────────────────────────────────┘
├───────────────────────────┤
│ Início Equip. Cham. Docs Tut│  ← navegação inferior (5 itens, ícone + rótulo)
└───────────────────────────┘
```

---

## 6. Padrões de componentes

Todos baseados em shadcn/ui (instalados pelo MCP `shadcn` na Fase 02) e ajustados aos tokens.

| Componente | Base shadcn/ui | Padrão do portal |
|---|---|---|
| Botão | `button` | Variantes: `primario`, `secundario` (variante `outline` ajustada para `border-input`, contorno `cinza-450`), `fantasma` (ações terciárias), `destrutivo`, `link`. Altura 36 px (desktop TI) / 44 px (celular). Estado de carregamento com indicador e rótulo mantido ("Executando…"); desabilitado com atributo semântico |
| Campo de texto | `input`, `label`, `form` | Rótulo visível sempre; ajuda abaixo; erro abaixo ligado por `aria-describedby`; obrigatório marcado com "(obrigatório)" no rótulo |
| Seleção / busca | `select`, `command`, `popover` (combobox) | Combobox com busca para listas > 10 itens (colaboradores, cargos, modelos) |
| Data | `calendar`, `popover` | Formato `dd/mm/aaaa`; digitação permitida |
| Abas | `tabs` | Detalhe de colaborador, ativo, solicitação. Aba ativa refletida na URL |
| Diálogo | `dialog`, `alert-dialog` | `alert-dialog` para confirmações; foco preso; `Esc` fecha |
| Gaveta | `sheet` | Navegação no celular; filtros avançados de tabela |
| Notificação | `sonner` | Confirmação de ação concluída (3–5 s, `aria-live="polite"`), sem roubar foco. Erros que exigem ação **não** usam toast: aparecem na tela |
| Badge de estado | `badge` + componente `StatusBadge` | Sempre ícone + texto (§11) |
| Cartão | `card` | Só quando agrupa um objeto (equipamento, documento, resumo). Não fatiar páginas em cartões idênticos |
| Trilha | `breadcrumb` | Níveis ≥ 3 |
| Linha do tempo | componente próprio `Timeline` | Histórico de vínculos, movimentações de ativo, execuções e chamados |
| Upload | componente próprio `FileDropzone` | Arrastar ou selecionar; botão alternativo ao arraste (WCAG 2.2); progresso; validação de tipo e tamanho antes do envio |
| Checklist de fotos | componente próprio `PhotoChecklist` | Lista dos tipos de foto exigidos (PM §6) com miniatura, estado e captura pela câmera no celular |
| Estado vazio | componente próprio `EmptyState` | Explica o que é a área e oferece a ação seguinte |
| Esqueleto | `skeleton` | Carregamentos > 300 ms; reserva o espaço final (sem salto de layout) |
| Campo de senha transitória | componente próprio `CampoSenhaTransitoria` | Senha inicial de **outra pessoa** (DT-02). Usado na etapa 3 do assistente de cadastro, enviado só na confirmação (etapa 5), e no diálogo de nova tentativa de criação da conta Microsoft (§9.2). [PROPOSTA] O valor fica num `useRef`, fora do React Hook Form (o `register` criaria `name`), e não tem `name` no formulário de rascunho. Nunca é persistido nem reexibido. É limpo após cada tentativa e também ao salvar o rascunho, cancelar, sair do assistente, recarregar a página e no evento `pagehide`, para não ficar no *bfcache* nem na restauração de formulário do navegador (§9). Atributos em §9.2 |
| Revisão e confirmação | componente próprio `PainelConfirmacao` | Etapa final do cadastro e de toda solicitação. Mostra exatamente o que será executado em cada sistema (colaborador, conta de acesso ao portal, conta Microsoft, licença, grupos, caixas, sistemas externos), o preparador e, depois da execução, o executor, a versão e o hash confirmados (§10.1). [PROPOSTA] Envia o **hash do conteúdo exibido** junto com a `chave_confirmacao`; se o servidor detectar diferença, mostra "O cadastro mudou; revise de novo" e recarrega a revisão. Quando a solicitação tem adições e remoções, inclui a seção `ConfirmacaoReforcada` no mesmo painel, com **uma única** reautenticação e sem diálogos empilhados (§9.1). Botão de confirmação fixo no rodapé no celular (§12). Substitui o antigo `PainelAprovacao` (DT-03, nota histórica em §10.1) |
| Confirmação reforçada | componente próprio `ConfirmacaoReforcada` | Operações destrutivas (DT-03): lista do que será removido ou desativado, digitação da contagem ou do identificador (colar permitido) e reautenticação recente (≤ 15 min, Q-15) (§9.1). [PROPOSTA] É o mesmo componente da desativação de conta de acesso e da baixa de ativo. Lista longa com rolagem interna e o campo de digitação sempre visível acima do teclado no celular (§12) |
| Entrada no portal | componente próprio `FormularioEntrada` (sobre `form`, `input`) | E-mail corporativo e senha, mensagem de erro única, gerenciador de senhas permitido (§10.4, §13). Envio por Server Action do portal, que chama a biblioteca no servidor; os códigos de erro da biblioteca nunca chegam ao navegador [PROPOSTA] |
| Segundo fator | componente próprio `DesafioSegundoFator` (sobre `input`) | Código TOTP de 6 dígitos num **único campo** (`inputmode="numeric"`, `autocomplete="one-time-code"`, colar aceito). `input-otp` do shadcn/ui só se colar o código inteiro preencher todas as posições; a disponibilidade não foi verificada. Opção "Usar código de recuperação" (DA-26, §10.4) |
| Configuração do MFA | componente próprio `ConfiguracaoMfa` | QR **gerado localmente** no navegador ou no servidor do portal, nunca por serviço externo; chave em texto como alternativa acessível; confirmação com um código antes de ativar (§10.4). [PROPOSTA] Os códigos de recuperação são exibidos uma única vez, só no estado do cliente: nunca no HTML do Server Component, na URL ou em cache (`no-store`). A tela exige confirmar "Guardei os códigos", e `Esc` não fecha. Há opção de baixar ou imprimir |
| Reautenticação | componente próprio `DialogoReautenticacao` (sobre `dialog`) | Pede a senha e, para perfis de TI, o código TOTP antes de operações de alto risco (§10.4). [PROPOSTA] O diálogo tem seu próprio `<form>`, separado do formulário de origem. No cadastro, a reautenticação é verificada **antes** de a senha inicial sair do navegador (§9.2). Ao confirmar, a ação original continua sem perder o que foi preenchido |
| Aviso de expiração | componente próprio `AvisoExpiracaoSessao` (sobre `alert-dialog`) | [PROPOSTA] "Sua sessão vai expirar em 2 min", com o botão "Continuar", que renova a sessão. Atende a WCAG 2.2, critério 2.2.1 (§10.4) |
| Alertas administrativos | componente próprio `ListaAlertasAdministrativos` | [PROPOSTA] Lista de alertas compensatórios no painel dos administradores (§10.5), com `StatusBadge`, data, ator, alvo e link para o evento de auditoria |
| Editor de perfis e permissões | componente próprio `EditorPermissoes` | Lista perfis e permissões efetivas com a origem de cada uma; restrições obrigatórias, inclusive as que dependem do alvo, aparecem desabilitadas com o motivo (§10.2) |

Ícones: `lucide-react` (dependência padrão do shadcn/ui), traço de 1,5–2 px, tamanhos 16 px (em linha) e 20 px (navegação). Ícone ao lado de texto é decorativo (`aria-hidden`); botão só de ícone tem `aria-label` e dica.

---

## 7. Estrutura de navegação

### 7.1 Área de TI (ordem proposta)

| Grupo | Itens | Contador |
|---|---|---|
| Operação | Início (painel operacional ou gerencial, §7.4), Colaboradores, Solicitações, Tarefas manuais | **Cadastros em rascunho** (colaborador em `PRE_CADASTRO`); **Provisionamentos prontos para executar** (rascunhos de provisionamento de colaboradores já registrados por quem não tem `provisionamento.executar`; só para quem tem a permissão); execuções com falha ou aguardando senha; tarefas atribuídas; alertas administrativos (§10.5, só perfis administrativos) |
| Ativos | Inventário, Alocações (devolução simples na V1; TDV na expansão), Termos | Termos aguardando assinatura |
| Atendimento | Chamados, Tutoriais | Chamados sem responsável |
| Microsoft 365 | Licenças, Caixas compartilhadas, Grupos | — |
| Administração | Empresas (`/ti/empresas`); Catálogos, Perfis de acesso, Integrações e **Segurança** (`/ti/configuracoes/*`; Segurança só com `seguranca.configurar`); Relatórios (exportações existentes até Q-42, `relatorio.ver`); Auditoria | Conectores com falha |

- **Revisão 01.4 (DT-03):** o item "Aprovações" e o contador "Aprovações pendentes" foram removidos, porque nenhum provisionamento exige aprovação hierárquica. Os provisionamentos deixados por quem não tem `provisionamento.executar` aparecem no contador "Provisionamentos prontos para executar" para quem tem a permissão. O contador "Cadastros em rascunho" é separado e conta só os cadastros ainda não registrados. Isso é fila de trabalho, não fila de aprovação [PROPOSTA].
- Itens sem permissão **não aparecem** (experiência), mas a proteção real está no servidor (`PERMISSOES_RBAC.md` §6).
- A visibilidade de menus e botões vem da lista de **permissões efetivas** calculada no servidor por `permissaoEfetiva()` (perfil + permissões individuais − restrições obrigatórias, `PERMISSOES_RBAC.md` §3.10) e entregue ao layout. Ela nunca é deduzida do perfil no cliente, para que concessões individuais (Q-30) e a equivalência entre Supervisor TI e Gestor ADM (Q-07) apareçam de forma idêntica na tela e no servidor.
- Item atual destacado com fundo `--sidebar-accent`, barra de 3 px `azul-300` e `aria-current="page"`.
- Contadores com texto acessível completo ("4 tarefas manuais atribuídas a você").
- "Sair" fica separado no menu do usuário, no topo, não na lista de navegação. O mesmo menu tem **"Minha conta"** (senha, MFA e sessões, §10.4) e, para perfis administrativos, a escolha de visão (§7.4).

### 7.2 Portal do colaborador

Início · Meus equipamentos · Meus chamados · Meus documentos · Tutoriais (5 itens, adequado à navegação inferior). Membros da TI veem um atalho "Área de TI" no menu do usuário. O menu do usuário também leva a **"Minha conta"** (`conta.gerenciar_propria`: alterar a própria senha, ver e encerrar as próprias sessões e, quando houver, configurar o MFA — §10.4). As orientações sobre "sistemas liberados" ao perfil (PM §11) ficam numa seção do Início.

### 7.3 Faixa de ambiente (DA-23)

Fora de produção, os dois layouts exibem no topo uma faixa fixa e não removível (`FaixaAmbiente`) com o nome do ambiente ("Desenvolvimento", "Homologação") e, quando houver, "Integrações simuladas". Cor de alerta da família de estados, texto explícito (nunca só cor) e altura mínima, sem cobrir conteúdo. Em produção a faixa não existe.

### 7.4 Visões operacional e gerencial (DT-06) [DECISÃO-TI; composição PROPOSTA]

A área de TI tem duas experiências sobre **as mesmas permissões**. A diferença é só de prioridade visual e de página inicial; nunca limita autorização (DT-05, DT-06).

| Aspecto | Visão operacional (padrão do Supervisor TI e do Estagiário TI) | Visão gerencial (padrão do Gestor ADM) |
|---|---|---|
| Página inicial (`/ti`) | **Painel operacional**: filas de trabalho — cadastros em rascunho, execuções com falha ou aguardando senha, tarefas manuais, chamados sem responsável, TER aguardando assinatura | **Painel gerencial**: indicadores — ativos por situação e por empresa, chamados por estado, provisionamentos por período e por executor, falhas de integração, eventos críticos de auditoria, acessos administrativos recentes; atalhos para Auditoria e Relatórios |
| Ordem dos grupos na navegação | Operação, Ativos, Atendimento, Microsoft 365, Administração | Início, Relatórios e Auditoria em destaque; depois os mesmos grupos da visão operacional |
| Ações disponíveis | As das permissões efetivas | **As mesmas**: o Gestor ADM pode cadastrar, executar provisionamento, alterar perfis etc. quando precisar |

- A escolha "Visão operacional / Visão gerencial" fica no menu do usuário. O padrão vem do perfil, e qualquer perfil administrativo pode trocar. A preferência **não** é dado de autorização: menus e botões continuam vindo das permissões efetivas (§7.1).
- [PROPOSTA] Detalhes da preferência de visão:
  - **Onde fica:** guardada por pessoa (`conta_acesso.id`), no servidor, e lida no layout. Assim ela não vaza entre usuários que dividem o mesmo computador. Um *cookie* só pode servir de cache, ligado à sessão e apagado ao sair.
  - **Padrão para quem tem os dois perfis administrativos:** visão gerencial, se tiver `GESTOR_ADM`.
  - **Depois de entrar:** o destino é sempre `/ti`, e o layout resolve qual visão mostrar.
  - **Troca:** grupo de opções acessível no menu (`DropdownMenuRadioGroup`, com `aria-checked`).
  - **Navegação na visão gerencial:** Relatórios e Auditoria sobem para o topo **sem duplicar itens**.
- Quem só tem `ESTAGIARIO_TI` vê a visão operacional; os indicadores do painel gerencial que exigem permissão que ele não tem (ex.: `relatorio.exportar` sem concessão) não aparecem.
- Os indicadores e relatórios definitivos dependem de Q-42. Até lá, o painel gerencial usa só os indicadores acima, e "Relatórios" se limita às exportações já existentes. Gráficos seguem os tokens `--chart-*`, sempre com rótulos e tabela alternativa (§2.2).

---

## 8. Tabelas administrativas

Base: TanStack Table + componente `DataTable` único (`CLAUDE.md`, diretriz nº 9).

| Capacidade | Padrão |
|---|---|
| Paginação | No servidor; 25 linhas por padrão (10/25/50/100); total de registros exibido |
| Ordenação | No servidor; cabeçalho clicável com `aria-sort`; uma coluna por vez (V1) |
| Busca | Campo de busca no topo com *debounce* de 300 ms; busca em campos indexados definidos por tabela |
| Filtros | Filtros principais visíveis (ex.: situação, empresa, classe); demais em gaveta "Filtros"; filtros ativos mostrados como chips removíveis |
| Estado na URL | Página, ordenação, busca e filtros em *query string* — links compartilháveis e "voltar" preserva o estado. Busca e filtros atualizam a URL com `router.replace` (sem criar entrada no histórico a cada tecla); a paginação usa `push` |
| Colunas | Visibilidade configurável; preferência guardada localmente |
| Ações por linha | Menu "Ações" (`dropdown-menu`) na última coluna; o link real para o detalhe fica na célula principal (nome, patrimônio ou número); clicar no restante da linha é só um atalho adicional para mouse, sem interferir em caixas de seleção e menus |
| Ações em lote | Seleção por caixa de seleção + barra de ações que aparece acima da tabela (ex.: exportar, atribuir chamados) |
| Densidade | Linhas de 44 px (padrão TI); cabeçalho fixo ao rolar |
| Números | Alinhados à direita, `tabular-nums` |
| Texto longo | Quebra de linha preferida; quando truncado, texto completo em dica acessível por teclado |
| Estados | Carregando (esqueleto de linhas), vazio (mensagem + ação), sem resultado de filtro ("Nenhum ativo com esses filtros" + "Limpar filtros"), erro (mensagem + "Tentar novamente") |
| Exportação | CSV das colunas visíveis, respeitando permissões; nunca CPF |
| Celular (< 768 px) | Tabela vira **lista de cartões** com 3–4 campos principais e menu de ações; filtros em gaveta. Tabelas de auditoria mantêm rolagem horizontal dentro do contêiner, com primeira coluna fixa |

---

## 9. Formulários

Base: React Hook Form + Zod (o mesmo esquema valida no servidor).

| Regra | Padrão |
|---|---|
| Estrutura | Seções com `fieldset`/`legend` (ex.: "Dados pessoais", "Vínculo", "Acesso ao portal e conta Microsoft", "Sistemas e acessos") |
| Layout | 1 coluna no celular; até 2 colunas a partir de `md` para campos curtos relacionados |
| Validação | Ao sair do campo e no envio; nunca a cada tecla |
| Erros | Mensagem específica abaixo do campo ("Informe um CPF com 11 dígitos"), não genérica. Após envio com erros: resumo no topo com links para os campos e foco no resumo |
| Ajuda | Texto de ajuda persistente abaixo de campos complexos (ex.: "Sugerido a partir da convenção da TI; confira homônimos") |
| Máscaras | CPF, CNPJ, telefone com máscara e teclado numérico (`inputmode="numeric"`) |
| Autopreenchimento | Atributos `autocomplete` corretos. Exceção: a senha inicial é de outra pessoa e não deve ser salva no navegador do operador. Ela usa `autocomplete="new-password"` e os atributos de exclusão de gerenciadores (§9.2), num formulário sem campo de usuário, com mostrar/ocultar e colar permitido. Chrome e Edge podem ignorar essas indicações, então "sem oferta de salvar" é esforço máximo verificado por teste (§14.2) [PROPOSTA]. No login e em "Minha conta" a senha é do próprio usuário, e o gerenciador de senhas é **permitido** (§13) |
| Envio | Botão com rótulo da ação:<br>• quem tem `provisionamento.executar`: **"Criar conta e executar"**;<br>• quem não tem: **"Registrar colaborador e acesso ao portal"**. Isso registra o colaborador e a conta de acesso, com chave de idempotência própria, e deixa o provisionamento como rascunho para quem tem a permissão (§10.1) [PROPOSTA].<br>O botão fica desabilitado e com indicador durante o envio. A confirmação leva uma `chave_confirmacao` única: um duplo envio não cria duas execuções, e o reenvio depois de falha de rede sem resposta devolve o resultado já gravado, em vez de erro |
| Alterações não salvas | Aviso ao sair com alterações. Como o App Router não oferece evento de bloqueio de navegação, a implementação combina `beforeunload` (recarregar/fechar aba), um componente de link/roteador protegido usado nos formulários e verificação em `onOpenChange` de diálogos e gavetas |
| Rascunho | Cadastro salvo como `RASCUNHO` no servidor (não no navegador, por conter dados pessoais), com o colaborador em `PRE_CADASTRO`. O rascunho é serializado por **lista explícita de campos**. **O rascunho nunca contém senha**: salvar o rascunho limpa o campo e mostra "A senha foi descartada; informe-a de novo antes de confirmar" [PROPOSTA] |
| Fluxo em etapas | Cadastro em etapas com indicador de progresso ("Etapa 3 de 5 — Acesso ao portal e conta Microsoft" no celular): **1 Dados → 2 Vínculo → 3 Acesso ao portal e conta Microsoft (e-mail sugerido, senha inicial, licença) → 4 Sistemas e acessos → 5 Revisão e confirmação**. Voltar sem perder dados. Depois da execução, a tela mostra o resultado individual de cada integração e oferece "Continuar com equipamentos e TER".<br>[PROPOSTA de interação; a regra de não persistir é DT-02]<br>• O assistente é **um único Client Component**, com a etapa refletida na URL (`?etapa=`, via `history.pushState`), de modo que trocar de etapa não desmonta o componente.<br>• A senha fica só em memória (`useRef`) e só é enviada na confirmação (etapa 5).<br>• Ela é limpa **ao sair do assistente** (não ao sair da etapa 3), ao salvar o rascunho, cancelar, recarregar a página, no evento `pagehide` e depois de cada tentativa.<br>• Na revisão aparece como "Senha inicial: informada (não exibida)".<br>• Se a senha estiver vazia, a etapa 5 bloqueia a confirmação e leva de volta à etapa 3 |
| Concorrência | Se outra pessoa alterou o registro (bloqueio otimista), mensagem com opção de recarregar |

### 9.1 Prevenção de ações acidentais

| Nível | Exemplo | Padrão |
|---|---|---|
| Reversível | Salvar rascunho | Sem confirmação; toast "Rascunho salvo" |
| Relevante | Cancelar alocação, despublicar tutorial | `alert-dialog` com consequência descrita e botão com verbo específico ("Cancelar alocação") |
| Crítico | Confirmar provisionamento: cadastro com criação de conta, alterações de licença, grupos, caixas e acessos externos, aplicação de regras do Teams (DT-03) | `PainelConfirmacao` mostrando exatamente o que será executado em cada sistema (colaborador, conta de acesso ao portal, conta Microsoft, licença, grupos, caixas, sistemas externos), com aviso de que a execução é imediata e não passa por aprovação. Botão "Criar conta e executar" ou "Executar alterações". Reautenticação recente (≤ 15 min, §10.4). A confirmação pelo próprio executor não é aprovação hierárquica. Se a solicitação também tiver remoções, a seção `ConfirmacaoReforcada` aparece **dentro** do mesmo painel, com uma única reautenticação [PROPOSTA] |
| Crítico | Confirmar entrega física (Q-27), reprocessar execução, cancelar solicitação com efeitos já aplicados, corrigir solicitação em execução (nova versão) | `alert-dialog` com resumo do efeito: itens, colaborador e data/hora da entrega; motivo obrigatório no reprocessamento; lista dos efeitos já aplicados; aviso "A correção cria uma nova versão; as ações não concluídas da versão anterior serão canceladas e as novas só serão executadas depois que você confirmar" |
| Crítico | Conceder permissão individual sensível (inclusive `provisionamento.executar` a um Estagiário), atribuir perfil administrativo | Diálogo com justificativa obrigatória, resumo do efeito ("Ana passará a poder criar contas Microsoft 365 e executar provisionamento") e reautenticação |
| Crítico | Credenciais e acesso de outra pessoa: redefinir senha do portal, redefinir MFA, bloquear ou desbloquear conta de acesso, encerrar sessões | Diálogo com o efeito descrito ("Todas as sessões de Ana serão encerradas"), motivo obrigatório e reautenticação. A nova senha é informada no `CampoSenhaTransitoria` e nunca exibida depois. Quando o alvo tem perfil de TI e o ator não tem perfil administrativo, a ação não aparece (restrição obrigatória, §10.2) |
| Crítico, destrutivo (confirmação reforçada, DT-03) | Remover licença, remover de grupo, revogar acesso a caixa compartilhada, bloquear em sistema externo, remoções do Teams, desligamento | `ConfirmacaoReforcada`, exigida **sempre que houver remoção** (inclusive no Teams; um limite de quantidade só agrava a confirmação, nunca a dispensa):<br>• lista completa do que será removido ou desativado;<br>• digitação da contagem ("Digite 12 para confirmar a remoção de 12 pessoas") ou do identificador (e-mail do colaborador), com colar permitido;<br>• motivo obrigatório;<br>• reautenticação recente (≤ 15 min) |
| Crítico e irreversível | Baixar ativo, cancelar termo assinado, revogar perfil administrativo (Supervisor TI ou Gestor ADM), desativar conta de acesso | Justificativa obrigatória e confirmação digitada (ex.: patrimônio do ativo, e-mail da conta). Baixa de ativo e desativação de conta usam o mesmo `ConfirmacaoReforcada` [PROPOSTA]. A regra do último administrador bloqueia revogação, bloqueio, afastamento ou desativação que deixariam o portal sem administrador ativo, com mensagem explicando o motivo |

### 9.2 Senha inicial (DT-02)

> **Histórico:** até a Revisão 01.3, a senha digitada na preparação era descartada e pedida de novo depois da aprovação (Q-25). A DT-02 (15/10/2026) substituiu essa regra: a TI informa a senha no cadastro, e ela é usada imediatamente na confirmação.

| Momento | Padrão de interface |
|---|---|
| Etapa 3 do cadastro | Campo "Senha inicial" (`CampoSenhaTransitoria`: `type="password"`, mostrar/ocultar, colar permitido). Ajuda persistente: "A senha não é salva nem exibida depois. O portal guarda só uma versão irreversível (hash) para o login do colaborador. Entregue a senha ao colaborador pelo canal definido pela TI, nunca por planilha." Indicação da política de senha (comprimento mínimo, Q-39) validada ao sair do campo e no servidor, sem ecoar o valor |
| Atributos do campo da senha de outra pessoa [PROPOSTA] | `autocomplete="new-password"` (Chrome e Edge ignoram `autocomplete="off"` em campo de senha e poderiam preencher a senha **do próprio operador**, salva para o login da mesma origem). Mais os atributos de exclusão de extensões gerenciadoras: `data-1p-ignore`, `data-lpignore="true"` e `data-bwignore`. Esses atributos só valem para extensões; o gerenciador nativo do navegador pode ainda oferecer salvar, então a ausência da oferta é **esforço máximo verificado por teste** no Chrome e no Edge (§14.2), não garantia |
| Senha do Microsoft 365 | Caixa "Usar a mesma senha no Microsoft 365", **marcada por padrão** (DT-02). Desmarcada, aparece um segundo campo "Senha inicial do Microsoft 365", com o mesmo comportamento. Texto de ajuda junto à caixa: "Recomendado: usar senhas diferentes. Depois da criação, as senhas do portal e do Microsoft 365 são independentes" (R-24). **No caminho de quem não tem `provisionamento.executar`, a caixa e o segundo campo não aparecem**: quem executar depois informará a senha do Microsoft 365, e o servidor rejeita qualquer senha do Microsoft 365 enviada nesse caminho [PROPOSTA] |
| Gerador [PROPOSTA] | Botão "Gerar senha aleatória", que gera no navegador (gerador criptográfico) e preenche o campo visível por mostrar/ocultar. A TI decide se o oferece (R-22, R-24). Não copia para a área de transferência por padrão; se a TI copiar, a ajuda avisa que o histórico e a sincronização da área de transferência do sistema podem guardar a senha |
| Revisão e confirmação | `PainelConfirmacao` mostra "Senha inicial: informada (não exibida)" e se o Microsoft 365 usará a mesma senha ou outra. [PROPOSTA] Ao entrar na etapa 5, uma Server Action **sem senha** verifica sessão, reautenticação recente e permissões efetivas. Se a reautenticação estiver vencida, abre o `DialogoReautenticacao` (formulário próprio) **antes** de qualquer envio da senha. A senha só sai do navegador num envio único, na confirmação. Se mesmo assim algo falhar no servidor, a senha é descartada sem chamada externa e a tela orienta o próximo passo |
| Execução | Botão "Criar conta e executar" em estado de carregamento durante a chamada; nenhum outro envio possível. Ao terminar, o campo é esvaziado e o painel mostra o resultado de cada integração: conta de acesso ao portal criada; conta Microsoft criada, recusada ou pendente; ações seguintes em fila. Falha de rede sem resposta: "Verificar resultado" reenvia com a mesma `chave_confirmacao` e recebe o resultado já gravado, sem nova execução |
| Falha da conta Microsoft depois da conta do portal | Mensagem junto ao resultado: "A conta de acesso ao portal foi criada. A conta Microsoft não foi criada: <causa>." Se a causa for recusa ou falha definida, acrescenta: "A próxima tentativa exigirá digitar a senha do Microsoft 365 novamente." A execução fica com a etiqueta "Aguardando senha para nova tentativa" na lista, no painel de execução e no contador do painel operacional. Nada é excluído automaticamente |
| Nova tentativa [PROPOSTA] | Diálogo "Tentar criar a conta Microsoft novamente" (`provisionamento.executar` e reautenticação), com o resumo da versão confirmada (nome, UPN, licença). Antes de mostrar o campo de senha, o servidor confirma permissão e versão vigente e **verifica no Microsoft 365, sem senha**, se a conta já existe com o marcador do portal:<br>• **Conta encontrada:** a ação é concluída sem pedir senha, e o diálogo mostra "A conta já existia. A senha informada na confirmação continua valendo no Microsoft 365."<br>• **Conta não encontrada:** o campo de senha aparece.<br>• **Algo falhou:** o campo nem é exibido.<br>O resultado de uma tentativa anterior de criação pode ter chegado ao Microsoft 365 mesmo sem resposta. Por isso a verificação vem antes, para a TI não entregar ao colaborador uma senha que não vale |
| Senha recusada pela política do tenant | "A Microsoft recusou a senha pela política do tenant. Informe outra senha." A senha nunca é reexibida nem incluída em notificação |
| Autorização expirada | Mensagem específica ("Sua sessão precisa ser confirmada" / "A solicitação foi corrigida; revise a nova versão") e caminho de correção; a senha digitada é descartada |
| Acessibilidade | Erros anunciados com `role="alert"` em texto genérico, sem conteúdo sensível; foco volta ao campo de senha após falha |

---

## 10. Feedback e estados de tela

| Situação | Padrão |
|---|---|
| Carregamento de página | Esqueleto com a forma do conteúdo final |
| Ação em andamento | Botão em estado de carregamento |
| Processo assíncrono (execução de provisionamento) | Painel de execução com uma linha por ação: sistema, ação, estado, tentativas, última atualização, ação disponível ("Reprocessar", "Abrir tarefa manual" ou, só depois de falha ou interrupção da criação da conta Microsoft, "Tentar de novo" — que primeiro verifica sem senha se a conta já existe, §9.2); atualização automática a cada 5 s enquanto houver ação não terminal (TanStack Query). Resposta 401 no *polling* leva a `/entrar?motivo=encerrada` [PROPOSTA] |
| Sucesso | Toast curto com o mesmo verbo da ação ("Conta criada e provisionamento iniciado") |
| Erro recuperável | Mensagem junto ao contexto com causa e caminho ("A Microsoft recusou a senha: ela não atende à política do tenant. Informe outra senha.") |
| Erro inesperado | Mensagem genérica + código de correlação para suporte |
| Sem permissão | Página "Você não tem acesso a esta área" com caminho de volta; nunca tela em branco |
| Não encontrado | 404 próprio, sem confirmar a existência de registros de terceiros |
| Vazio | Explicação + ação ("Nenhum equipamento alocado a você. Se recebeu um equipamento, abra um chamado.") |

---

### 10.1 Confirmação e executor (DT-03)

> **Histórico:** até a Revisão 01.3, esta seção descrevia o painel de aprovação, o marcador "Autoaprovação" e o aviso de autoaprovação (Q-04). A DT-03 (15/10/2026) removeu a aprovação hierárquica de todo provisionamento; o painel de aprovação e o marcador deixaram de existir.

- Toda solicitação mostra, no `PainelConfirmacao`, **Preparado por** (quem montou o rascunho), **Executado por** (quem confirmou), data e hora da confirmação e a versão confirmada.
- A versão é identificada como "Versão 2 · hash 3f2c9a1b4e7d" (12 caracteres em fonte monoespaçada), com as alterações em relação à versão anterior e os efeitos já aplicados por versões anteriores. "Confirmar" envia a `chave_confirmacao` e o **hash do conteúdo exibido** na revisão (identificadores externos já resolvidos antes da revisão). Se a solicitação ou o cadastro mudaram entre a revisão e a confirmação, o servidor recusa, e a tela informa "O cadastro mudou; revise de novo" e recarrega a revisão [PROPOSTA].
- Lista de solicitações e auditoria mostram a etiqueta neutra **"Executado por <nome>"** (família neutra, ícone `user-check` + texto), informação de rastreabilidade e não alerta. Preparador e executor podem ser a mesma pessoa, e isso **não** é marcado como exceção: a confirmação do próprio executor não é aprovação (DT-03).
- Para quem não tem `provisionamento.executar`, o botão "Criar conta e executar" não aparece. Em seu lugar há **"Registrar colaborador e acesso ao portal"**, que passa pelo mesmo `PainelConfirmacao`, e o texto "A execução do provisionamento requer permissão individual de provisionamento. O provisionamento ficará disponível para quem tem essa permissão." Se uma tentativa chegar ao servidor, a resposta é a mensagem de sem permissão.
- [PROPOSTA] Quem tem a permissão abre o item em "Provisionamentos prontos para executar". A tela mostra:
  - os dados cadastrais **somente para leitura**, porque já foram confirmados no registro;
  - o campo "Senha inicial do Microsoft 365", sem a opção "mesma senha", já que quem executa não conhece a senha do portal.
  Depois o fluxo segue o mesmo `PainelConfirmacao`.

### 10.2 Perfis e permissões individuais (Q-07, Q-30, DT-05, DT-07)

- A tela de uma pessoa mostra seus perfis e a lista de **permissões efetivas**, cada uma com a origem: "Perfil Supervisor TI" ou "Concessão individual — por <nome>, em <data>, válida até <data>".
- Permissões bloqueadas por restrição obrigatória aparecem desabilitadas com o motivo em texto ("Estagiários não alteram perfis administrativos", "Estagiários não alteram regras de segurança"), nunca apenas por cor.
- **Restrições que dependem do alvo:** na ficha de quem tem perfil de TI, quem não tem perfil administrativo não vê as ações de redefinir senha, redefinir MFA, bloquear, desbloquear, encerrar sessões, editar dados de identificação e desligar. Se a ação for consultada (ex.: por um link), a mensagem é "Somente Supervisor TI ou Gestor ADM podem alterar o acesso de membros da TI".
- Um Estagiário TI sem a concessão vê, na etapa de revisão do cadastro e nas solicitações, a indicação "Requer permissão individual de provisionamento" (DT-07), em vez de botões desabilitados sem explicação.
- Conceder e revogar exigem justificativa, confirmação e reautenticação (§9.1); o histórico de concessões fica visível na mesma tela. Ninguém concede permissão a si mesmo pela interface: o editor não oferece a própria pessoa como alvo para quem não tem perfil administrativo.
- Supervisor TI e Gestor ADM veem os mesmos controles (Q-07, DT-05), qualquer que seja a visão escolhida (§7.4).

### 10.3 Alocação e assinatura do TER (Q-27)

- Alocação e TER aparecem como **dois indicadores separados**, nunca combinados: "Alocação: Ativa — entregue em <data>" e "TER: Aguardando assinatura".
- O painel da TI tem o contador "TER aguardando assinatura", que leva à lista filtrada.
- No portal do colaborador, o equipamento aparece em "Meus equipamentos" desde a entrega; o documento aparece em "Meus documentos" quando disponibilizado, com seu próprio estado.

### 10.4 Autenticação e conta (DT-01; mecanismo DA-24 a DA-27 PROPOSTA)

Telas do grupo `(publico)` e de "Minha conta". Mesmos tokens e componentes do restante do produto: tela simples, centrada, sem ilustração decorativa (§1).

| Tela | Padrão |
|---|---|
| Entrar (`/entrar`) | Título "Entrar no Portal TI Vallur"; campos "E-mail corporativo" (`type="email"`, `autocomplete="username"`, `autocapitalize="none"`, `spellcheck="false"`) e "Senha" (`autocomplete="current-password"`, mostrar/ocultar, colar permitido, aviso de Caps Lock ativado); botão "Entrar". **Não existe** botão "Entrar com Microsoft" (DT-01). Erro único, junto ao formulário: "E-mail ou senha inválidos." Nunca indica se o e-mail existe, se a conta está bloqueada ou se o colaborador está desligado. [PROPOSTA] No erro, o e-mail é mantido, a senha é limpa e o foco vai ao alerta. `/entrar?motivo=expirada` e `/entrar?motivo=encerrada` mostram, acima do formulário, "Sua sessão terminou por inatividade" ou "Sua sessão foi encerrada" |
| Muitas tentativas | Mensagem **igual para qualquer e-mail**, exista a conta ou não: "Muitas tentativas. Tente novamente mais tarde." (DA-27). Sem contagem regressiva nem texto que revele o estado da conta |
| Segundo fator (`/entrar/segundo-fator`) | Depois da senha, para quem tem **MFA configurado**: "Informe o código do aplicativo autenticador" (`DesafioSegundoFator`) e o link "Usar código de recuperação". Sem opção "Lembrar este dispositivo" para perfis de TI (DA-26). [PROPOSTA] A rota, aberta sem desafio pendente, volta a `/entrar`; código já usado é recusado com a mesma mensagem de código inválido |
| Ativação de perfil de TI (`/conta/ativar`) [PROPOSTA, Q-43] | Quando a pessoa recebe perfil de TI (ou depois de ter o MFA redefinido), o perfil aparece como **"Perfil de TI pendente de ativação"** e não dá acesso a `/ti`. No próximo acesso, a pessoa vai a `/conta/ativar`, em 3 passos: 1 informar o **código de ativação de uso único** recebido do administrador que atribuiu o perfil, entregue fora do portal; 2 definir a própria senha (`autocomplete="new-password"`); 3 configurar o MFA (`ConfiguracaoMfa`). Só então o perfil passa a valer. Texto claro: "O código de ativação foi entregue pela TI. Se você não o recebeu, procure quem atribuiu o seu perfil." |
| Configurar MFA (`/conta/mfa`) | Obrigatória para quem tem perfil de TI ativo e ainda não configurou. É a **única rota** que essa sessão acessa, além de sair: o acesso a `/ti` leva direto a ela. Em 3 passos: 1 escanear o QR ou digitar a chave; 2 confirmar com um código; 3 guardar os códigos de recuperação (`ConfiguracaoMfa`: exibição única, confirmação "Guardei os códigos"). Membro da TI não tem opção de desativar o próprio MFA; a redefinição é feita por administrador (DA-26) |
| Minha conta (`/conta`, `/conta/sessoes`) | Seções:<br>• **"Senha":** alterar exige a senha atual; aviso "As outras sessões serão encerradas"; `autocomplete="new-password"` no campo novo.<br>• **"Verificação em duas etapas":** situação do MFA; gerar novos códigos de recuperação, que exige reautenticação [PROPOSTA].<br>• **"Sessões":** lista com dispositivo resumido, último uso, marca **"Esta sessão"** e "Encerrar"; cartões no celular.<br>Todas as operações passam por casos de uso do portal (permissão, reautenticação, auditoria), não por rotas da biblioteca chamadas pelo navegador [PROPOSTA] |
| Reautenticação | `DialogoReautenticacao` sobre a tela atual, com formulário próprio: "Confirme sua identidade para continuar", com senha e, para perfis de TI, código TOTP. Ao confirmar, a ação continua sem perder o que foi preenchido; ao cancelar, nada é executado |
| Aviso de expiração [PROPOSTA] | `AvisoExpiracaoSessao` 2 min antes do fim da inatividade (30 min na área de TI, Q-15): "Sua sessão vai expirar em 2 min", botão "Continuar", que renova a sessão. Cobre o preenchimento longo do assistente de cadastro, que não gera requisições (WCAG 2.2, critério 2.2.1) |
| Sessão expirada | [PROPOSTA] Server Actions e rotas `/api` com sessão vencida devolvem um **erro tipado de sessão**, sem redirecionar. A tela então abre, no lugar, o diálogo de entrada ou de reautenticação, sem perder o que foi preenchido (exceto a senha inicial, que é descartada). Na navegação comum, `/entrar?motivo=expirada` volta ao endereço de origem depois do login, apenas se for rota interna do portal |
| Conta bloqueada ou sem acesso | Depois do login, quando o servidor recusa: a mesma mensagem genérica do login. Na sessão já aberta, um bloqueio encerra a sessão e leva a `/entrar?motivo=encerrada` ("Sua sessão foi encerrada. Procure a TI se precisar de ajuda."), sem expor o motivo |
| Saída | [PROPOSTA] "Sair" e a revogação de sessão terminam com **navegação completa** (`window.location`), não navegação do roteador, para limpar o cache do roteador do Next.js e do TanStack Query |
| Aviso ao titular [PROPOSTA] | No primeiro acesso depois de uma redefinição de senha ou de MFA feita por outra pessoa, faixa informativa: "Sua senha foi redefinida por <nome> em <data>. Se você não pediu, procure a TI." (§10.5) |
| Recuperação de senha (`/entrar/recuperar`) | **Desligada até Q-37**: a rota não fica disponível, e a tela de entrada mostra "Esqueceu a senha? Procure a equipe de TI." Quando habilitada, a tela pede o e-mail e responde sempre "Se o e-mail estiver cadastrado, enviaremos instruções" |
| Redefinição pela TI | Na aba "Acesso" da ficha do colaborador: "Redefinir senha", com `CampoSenhaTransitoria`, motivo e reautenticação. Aviso: "Todas as sessões de <nome> serão encerradas. A senha não será exibida depois; entregue-a pelo canal definido pela TI" |
| Troca no primeiro acesso | Não exigida até Q-36. Se a TI decidir exigir, a tela "Defina sua nova senha" aparece logo após o login, antes de qualquer outra página |

Todas as mensagens de autenticação usam `role="alert"` e texto que diz o que fazer, sem expor dados de terceiros (§13).

### 10.5 Alertas administrativos compensatórios (R-26) [PROPOSTA]

Como não há aprovação hierárquica (DT-03), o painel dos administradores (Supervisor TI e Gestor ADM, nas duas visões) mostra alertas sobre operações sensíveis feitas por outras pessoas. O canal é a própria interface até a decisão de Q-35 e Q-37.

| Alerta | Gatilho |
|---|---|
| Perfil administrativo atribuído | `perfil.atribuir` de `SUPERVISOR_TI` ou `GESTOR_ADM` |
| Permissão de provisionamento concedida | Concessão individual de `provisionamento.executar` |
| Regra de segurança alterada | `seguranca.configurar` |
| Credencial de membro da TI redefinida | Redefinição de senha ou de MFA de quem tem perfil de TI |
| Operação destrutiva em volume | Confirmação reforçada acima do limite definido com a TI |

- Cada alerta mostra ator, alvo, data e link para o evento de auditoria, com `StatusBadge` da família "Atenção". O alerta é marcado como visto por pessoa e não some do histórico de auditoria.
- O titular de uma conta cuja senha ou MFA foi redefinido por outra pessoa recebe aviso no próximo acesso (§10.4).
- O contador do item "Início" inclui os alertas não vistos ("3 alertas administrativos não vistos").

## 11. Sistema de estados (elemento de assinatura do produto)

Todo estado é exibido com **ícone + texto + cor** (nunca só cor). Há seis famílias visuais:

| Família | Cor (texto/fundo) | Ícone (lucide) | Sentido |
|---|---|---|---|
| Neutro | `cinza-600` / `cinza-100` | `circle-dashed` | Ainda não começou, encerrado sem efeito ou fora de uso |
| Em curso | `azul-800` / `azul-50` | `clock` | Em andamento pela TI ou pelo sistema |
| Atenção | `ambar-700` / `ambar-50` | `hourglass` | Aguarda alguém fora da ação atual |
| Ação manual | `violeta-700` / `violeta-50` | `hand` | Exige trabalho manual da TI |
| Sucesso | `verde-700` / `verde-50` | `circle-check` | Concluído ou em uso regular |
| Erro | `vermelho-700` / `vermelho-50` | `circle-alert` | Falhou ou foi recusado |

O mapeamento é feito por **(domínio, código)**, porque o mesmo código pode ter sentidos diferentes em domínios distintos (ex.: `ATIVO` como situação de colaborador × `ATIVO` como modo de conector):

| Domínio (`MODELO_DE_DADOS.md`) | Neutro | Em curso | Atenção | Ação manual | Sucesso | Erro |
|---|---|---|---|---|---|---|
| Colaborador (§4.5) | `PRE_CADASTRO`, `DESLIGADO` | — | `AFASTADO` | — | `ATIVO` | — |
| Empresa (§4.1) | `INATIVA` | — | — | — | `ATIVA` | — |
| Solicitação (§6.6) | `RASCUNHO`, `CANCELADA` | `EM_EXECUCAO` | `CONCLUIDA_COM_PENDENCIAS` | — | `CONCLUIDA` | — |
| Conta de acesso (§5) | `DESATIVADA`, (sem conta de acesso — Q-40) | — | `BLOQUEADA`, (bloqueio temporário por tentativas) | — | `ATIVA` | — |
| MFA da conta (§5) [PROPOSTA] | — | — | (pendente — obrigatório), (perfil de TI pendente de ativação — Q-43) | — | (configurado) | — |
| Sessão (§5.2) [PROPOSTA] | (encerrada) | — | — | — | (ativa) | — |
| Execução (§6.5) | `BLOQUEADO`, `CANCELADO` | `PENDENTE`, `EM_EXECUCAO` | — | `AGUARDANDO_ACAO_MANUAL` | `CONCLUIDO` | `FALHOU` |
| Conta externa (§7) | `DESATIVADA`, `DESCONHECIDA` | — | `BLOQUEADA` | — | `ATIVA` | — |
| Conector — modo de execução (§7) | `DESATIVADO` | `SIMULACAO` | — | — | `ATIVO` | — |
| Conector — validação (§7) | — | — | `PENDENTE` | — | `CONFIRMADA` | — |
| Ativo (§8.2) | `BAIXADO` | `RESERVADO` | `DEVOLVIDO_EM_AVALIACAO`, `MANUTENCAO` | — | `DISPONIVEL`, `ALOCADO` | — |
| Alocação (§8.5) | `RASCUNHO`, `ENCERRADA`, `CANCELADA` | — | — | — | `ATIVA` | — |
| Devolução (§8.6) | `RASCUNHO`, `CANCELADA` | — | — | — | `REGISTRADA` | — |
| Manutenção (§8.8) | `CANCELADA` | (aberta, sem resultado) | — | — | `REPARADO` | `SEM_REPARO` |
| Termo TER/TDV (§9.3) | `RASCUNHO`, `CANCELADO` | `EMITIDO` | `AGUARDANDO_ASSINATURA` | — | `ASSINADO` | — |
| Chamado (§10.1) | `FECHADO` | `ABERTO`, `TRIAGEM`, `EM_ATENDIMENTO` | `AGUARDANDO_COLABORADOR`, `AGUARDANDO_TERCEIRO` | — | `RESOLVIDO` | — |
| Tutorial (§10.2) | `RASCUNHO`, `DESPUBLICADO` | — | `INDISPONIVEL` | — | `PUBLICADO` | — |
| Tarefa manual (§6.7) | — | (atribuída, sem resultado) | (sem responsável) | — | `REALIZADA` | `NAO_REALIZADA` |
| Tarefa assíncrona (§6.8) | — | `PENDENTE`, `EM_EXECUCAO` | — | — | `CONCLUIDA` | `FALHOU` |

- Rótulos exibidos em português legível ("Aguardando ação manual"), nunca o código do enum.
- Execuções em modo `SIMULACAO` recebem, além do estado, a etiqueta neutra "Simulado".
- Solicitações confirmadas recebem a etiqueta neutra "Executado por <nome>" (§10.1). Execuções da criação da conta Microsoft que esperam nova digitação da senha recebem a etiqueta "Aguardando senha para nova tentativa" (§9.2).
- Rótulos derivados (entre parênteses na tabela; não são enums do banco) [PROPOSTA]:
  - **Conta de acesso:** "Sem conta de acesso" (colaborador sem `conta_acesso`, Q-40); "Bloqueio temporário por tentativas" (DA-27), separado de `BLOQUEADA` porque vence sozinho e não exige ação da TI.
  - **MFA:** "Configurado"; "Pendente (obrigatório)"; "Perfil de TI pendente de ativação" (Q-43).
  - **Sessão:** "Ativa" e "Encerrada".
- **Histórico (Revisão 01.4, DT-03):** os estados de solicitação `AGUARDANDO_APROVACAO`, `APROVADA` e `REJEITADA` e a etiqueta "Autoaprovação" foram removidos com a aprovação hierárquica.
- O componente `StatusBadge` recebe `(dominio, codigo)` e resolve rótulo, ícone e cor a partir de um único mapa. Um teste unitário percorre todos os enums do esquema Prisma e falha se algum par não estiver mapeado.
- Ícones de estado não giram (sem animação contínua), salvo o indicador de carregamento real de um botão.

---

## 12. Comportamento responsivo

| Elemento | 375 e 390 px (celular) | 768 px (tablet) | 1024 px (comportamento; não é ponto obrigatório) | 1440 px (desktop) |
|---|---|---|---|---|
| Navegação TI | Barra superior + gaveta (`sheet`) | Trilho de ícones 64 px, expansível sobre o conteúdo | Barra lateral 240 px | Barra lateral 240 px |
| Navegação colaborador | Barra inferior com 5 itens e `padding-bottom: env(safe-area-inset-bottom)` (`viewport-fit=cover`) | Barra superior | Barra superior | Barra superior |
| Margens laterais | 16 px | 24 px | 32 px | 32 px; conteúdo até 1280 px |
| Cabeçalho de página | Título em até 2 linhas; ação primária em largura total abaixo; secundárias no menu "Mais" | Título + ação primária na mesma linha | Idem | Idem |
| Tabelas | Lista de cartões | Tabela com colunas prioritárias; demais ocultáveis | Tabela completa | Tabela completa |
| Formulários | 1 coluna; botões em largura total, fixos no rodapé em fluxos longos (com espaço reservado e margem `env(safe-area-inset-bottom)`) | 2 colunas para campos curtos | 2 colunas | 2 colunas, largura máx. 720 px |
| Detalhe com abas | Abas roláveis horizontalmente com indicação de continuidade | Abas | Abas | Abas + painel lateral de resumo |
| Dashboard | Indicadores empilhados, listas curtas de pendências | 2 colunas | 3 colunas | 3–4 colunas |
| Fotos (checklist) | Captura direta pela câmera; uma foto por linha | Grade 2 colunas | Grade 3–4 colunas | Grade 4 colunas |
| Diálogos | Ocupam a largura útil (margens de 16 px), rolagem interna, botões empilhados com a ação principal por último | Largura máx. 560 px, centralizados | Idem | Idem |
| Cartões | Uma coluna, largura total | 2 colunas | 3 colunas | 3–4 colunas |
| Visualização de documentos (TER/TDV, PDF) | Botão "Abrir PDF" (visualizador do sistema) em vez de visualização embutida; metadados e estado acima | Visualização embutida com altura limitada e opção de abrir em nova aba | Embutida | Embutida, com painel de metadados ao lado |
| Telas públicas (entrar, segundo fator, ativação, MFA) [PROPOSTA] | Sem cartão: formulário direto sobre o fundo, largura total com margens de 16 px; botão em largura total | Cartão centralizado, largura máx. 400 px | Idem | Idem |
| Assistente de cadastro [PROPOSTA] | Indicador compacto "Etapa 3 de 5 — <nome da etapa>"; botões "Voltar" e "Continuar" fixos no rodapé | Indicador com os 5 passos nomeados | Idem | Idem |
| Painel de confirmação [PROPOSTA] | Resumo por sistema em seções recolhíveis; botão de confirmação fixo no rodapé, com espaço reservado e `env(safe-area-inset-bottom)` | Resumo em 2 colunas | Idem | Resumo ao lado da lista de efeitos |
| Confirmação reforçada [PROPOSTA] | Lista longa com rolagem interna (altura limitada); campo de digitação e botão sempre visíveis acima do teclado virtual | Idem, sem teclado fixo | Idem | Idem |
| Sessões (Minha conta) [PROPOSTA] | Cartões, um por sessão, com "Esta sessão" destacada | Tabela | Tabela | Tabela |
| Estouro de conteúdo | Textos longos, IDs e e-mails quebram linha (`overflow-wrap: anywhere`); nenhuma rolagem horizontal da página | Idem | Idem | Idem |
| Alvos de toque | ≥ 44 × 44 px | ≥ 44 × 44 px | ≥ 24 × 24 px (WCAG 2.2) | ≥ 24 × 24 px |
| Acessibilidade | Foco visível e não encoberto pela barra inferior; zoom de 200% sem perda de função | Idem | Idem | Idem |

Sem rolagem horizontal da página em nenhuma largura (exceto dentro de contêineres de tabela explicitamente roláveis). Usar `min-h-dvh` em vez de `100vh`.

---

## 13. Acessibilidade (meta: WCAG 2.2 nível AA)

| Requisito | Implementação |
|---|---|
| Contraste | Pares do §2.3; nenhum texto abaixo de 4.5:1 |
| Teclado | Toda função operável por teclado; ordem de tabulação igual à visual; atalho "Pular para o conteúdo" |
| Foco | Anel de 2 px `--ring` com afastamento de 2 px; sobre fundo escuro `--sidebar-ring`; nunca removido; não encoberto por cabeçalhos fixos |
| Semântica | Um `h1` por página; níveis sem saltos; `nav`, `main`, `header` |
| Formulários | `label` associado; erros com `aria-describedby` e resumo com foco; `aria-invalid` |
| Anúncios | Toasts e atualizações de estado de execução em região `aria-live="polite"` com frase completa ("Licença atribuída a Ana Souza") |
| Troca de rota | Foco movido para o título da nova página |
| Arraste | Upload por arraste sempre com botão alternativo |
| Movimento | `prefers-reduced-motion` remove transições não essenciais |
| Zoom | Layout funcional com 200% de zoom e texto ampliado; *zoom* nunca bloqueado |
| Tabelas | `th` com `scope`; `aria-sort`; legenda descritiva |
| Autenticação | Login próprio do portal (DT-01) conforme WCAG 2.2, critério 3.3.8 (autenticação acessível): sem CAPTCHA nem teste cognitivo; colar permitido; gerenciador de senhas **permitido** no login e em "Minha conta" (`autocomplete="username"`, `current-password`, `new-password` e `one-time-code` no segundo fator); mostrar/ocultar senha. Exceção: o campo da senha inicial de **outra pessoa** (cadastro, redefinição pela TI) permite colar e usa `autocomplete="new-password"` com os atributos de exclusão de gerenciadores; a ausência de oferta de salvar é esforço máximo verificado por teste (§9.2, §14.2) |
| Limite de tempo | WCAG 2.2, critério 2.2.1: aviso antes do fim da sessão por inatividade, com opção de continuar (`AvisoExpiracaoSessao`, §10.4) [PROPOSTA] |
| Mensagens de segurança | Negações, autorização expirada e falhas de senha são anunciadas (`role="alert"`) com texto claro e caminho de correção, sem expor dados sensíveis nem a existência de registros de terceiros |
| Idioma | `lang="pt-BR"`; datas e números em formato brasileiro |

---

## 14. Critérios de qualidade visual e validação por viewport

### 14.1 Critérios de qualidade (revisão de cada tela)

1. Usa somente tokens semânticos; nenhum hex ou espaçamento arbitrário no código da tela.
2. Uma única ação primária visível por tela.
3. Estados exibidos pelo `StatusBadge` (ícone + texto).
4. Estados de carregamento, vazio, erro e sem permissão implementados.
5. Rótulos em caixa de frase, verbos específicos, mensagens de erro com causa e correção.
6. Alinhamento à grade de 4 px; espaçamentos consistentes com §4.
7. Nenhum gradiente, desfoque decorativo, sombra fora dos três níveis ou animação de entrada.
8. Parece parte do mesmo produto que as telas já aprovadas (comparação lado a lado).

### 14.2 Validação obrigatória com Playwright (Fase 02 em diante)

Viewports obrigatórios (padronizados na Etapa 01.1 e no `CLAUDE.md`): **375 × 812**, **390 × 844**, **768 × 1024** e **1440 × 900**.

| Verificação | Como |
|---|---|
| Sem rolagem horizontal da página | `document.documentElement.scrollWidth <= window.innerWidth` em cada viewport |
| Navegação adequada à largura | Gaveta em 375/390; trilho em 768; barra lateral em 1440 |
| Tabela → cartões abaixo de 768 | Captura de tela e verificação de presença do componente |
| Alvos de toque | Elementos interativos ≥ 44 px em 375/390/768 |
| Foco visível | Navegação por `Tab` em fluxo principal com captura de tela |
| Contraste | Auditoria automatizada de acessibilidade (axe) sem violações de contraste |
| Console | Sem erros no console (MCP `chrome-devtools`) |
| Estabilidade de layout | CLS < 0,1 na carga das telas principais |
| Fluxos críticos | Login com senha e segundo fator (perfil de TI) e configuração do MFA no primeiro acesso; ativação de perfil de TI com código de uso único (Q-43); mensagem genérica de login inválido e de muitas tentativas; cadastro completo até "Criar conta e executar", com resultado por integração; falha simulada da conta Microsoft e nova tentativa (primeiro sem senha, conta encontrada → concluída sem pedir senha; conta não encontrada → nova digitação); reautenticação antes de operação de alto risco e antes do envio da senha inicial; Estagiário TI sem concessão vendo "Registrar colaborador e acesso ao portal", sem a opção "mesma senha", e "Requer permissão individual de provisionamento"; executor abrindo "Provisionamentos prontos para executar"; confirmação reforçada de remoção, inclusive combinada com adições no mesmo painel; visões operacional e gerencial com os mesmos botões para Supervisor TI e Gestor ADM; alocação na entrega até TER emitido; colaborador vendo apenas os próprios equipamentos |
| Senha inicial no assistente [PROPOSTA] | A senha não aparece em nenhuma requisição antes da etapa 5 (inspeção da rede); salvar o rascunho, recarregar e `pagehide` limpam o campo; voltar da etapa 5 para a 3 mantém a senha enquanto o assistente estiver aberto |
| Oferta de salvar senha de outra pessoa [PROPOSTA] | No Chrome e no Edge (Playwright com perfil persistente), confirmar que o campo da senha inicial não é preenchido com a senha do operador e que não aparece oferta de salvar ao confirmar; registrar o resultado, pois é esforço máximo e não garantia |
| Expiração da sessão [PROPOSTA] | Com a inatividade reduzida no ambiente de teste, o aviso aparece antes do fim, "Continuar" renova a sessão, e Server Action com sessão vencida abre o diálogo de entrada sem perder o preenchido (exceto a senha) |
| Telas novas nos quatro viewports [PROPOSTA] | Entrar, segundo fator, ativação, configuração do MFA, Minha conta (sessões em cartões no celular), assistente com indicador "Etapa n de 5", painel de confirmação com botão fixo, confirmação reforçada com lista longa |

Capturas de referência aprovadas por tela ficam versionadas para comparação visual nas etapas seguintes.

---

## 15. Próximos passos do design system (após aprovação)

1. Receber a identidade visual oficial (Q-22) e ajustar os tokens primitivos.
2. Criar a Skill `vallur-design-system` a partir deste documento e do Plano Mestre (conforme `CLAUDE.md`).
3. Na Fase 02: instalar componentes shadcn/ui pelo MCP, configurar tokens no `globals.css` e construir a página de referência de componentes antes das telas de negócio.
