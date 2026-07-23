# Arquitetura de Informação — diagnóstico, mapa e roteiro de reorganização

> **O que é este documento.** Um **inventário tela‑a‑tela** do workos com (a) o fluxo e a
> importância de cada informação, ancorados nos princípios da
> [biblioteca de conhecimento](./biblioteca-de-conhecimento.md) (P1–P8); (b) como os
> componentes se conectam e de onde são importados; e (c) um **mapa de realocação** +
> **roadmap** para reorganizar a informação nas telas certas.
>
> **O que NÃO é.** Não é design visual (tipografia, cor, espaçamento, layout fino). É
> **arquitetura de informação**: o que mora onde, com que prioridade, e por quê. É
> exatamente o insumo que uma ferramenta externa de UX (ou um designer) recebe para
> propor o visual — sem reabrir _o que_ cada tela precisa mostrar.
>
> **Método.** 4 varreduras paralelas independentes (core/trabalho, admin+cockpit,
> relatórios, shell/navegação), cada uma lendo as páginas e seguindo os imports 1 nível.
> Achados convergentes entre clusters estão marcados como estruturais.
>
> **Base de decisão.** Cada realocação cita o(s) princípio(s) e o **import de origem**,
> para que a implementação seja mecânica, não interpretativa.

---

## 0. Sumário executivo — os problemas estruturais (ranqueados)

1. **A navegação primária é 100% redundante.** A navbar tem só 3 links (`/dashboard`,
   `/admin/clients`, `/reports/calendar/monthly`) e **os três já existem no dropdown**.
   O topo não carrega nenhum destino único. Todo o resto do app está amontoado num
   **dropdown-tudo de 12+ itens** misturando conta + 6 relatórios + CRUD admin + ajuda +
   deck de marketing + tema + sair. Esse é o "menu confuso". _(§1)_
2. **A tela de trabalho do colaborador (`/tasks`) é órfã** — existe, é o ponto do app
   (P6/P7), mas **não é linkada de lugar nenhum** na shell. `/projects` e o hub `/reports`
   também estão desligados. _(§1)_
3. **Três superfícies paralelas de "lista de etapas"** com tabelas e KPIs divergentes:
   dashboard (`StatsCards`+`ActiveStagesTable`), `/tasks` (`MyStagesKPIs`+`MyStagesTable`)
   e o Kanban do projeto. Mesmos dados, 3 tabelas, 3 interações, **contadores calculados
   separadamente** (risco de divergir — fere P6). _(§2, §3)_
4. **Análises de pessoa espalhadas e sobrepostas.** `MyGrowthWidget` (no dashboard),
   `/admin/users/[id]` (relatório completo enterrado no CRUD, importando `ThroughputLine`
   dos relatórios) e `/reports/user/[id]` mostram as mesmas métricas por pessoa em 3
   lugares. _(§2, §3)_
5. **`/reports/team-productivity` e `/reports/performance` se sobrepõem forte** (throughput
   e duração por etapa em ambos, com dois sistemas visuais) → candidatos a **fusão**.
   _(§2, §3)_
6. **Conteúdo operacional (escrita) dentro de "relatórios" (análise):** calendário
   (semanal reagenda por drag) e live‑activity/TV. `/reports/calendar` e
   `/reports/calendar/monthly` são **uma feature em dois zooms** vendida como dois cards;
   `/reports/live-activity` e `/tv` são a **mesma coisa em duas UIs**. _(§2, §3)_
7. **Três barras de filtro incompatíveis** (`ReportFilterBar`, `PeriodSelector`,
   `CalendarFiltersBar`) + três conjuntos de skeleton + mapas de cor de status/prioridade
   **triplicados** (`lib/status-styles` existe mas metade das telas rola o seu). _(§3)_
8. **Configurações partidas** (tema no dropdown, idioma no `/account`) e **dois caminhos
   de logout** divergentes. _(§1, §3)_
9. **Cockpit `/admin` sobrecarregado**: 5 contadores + checklist de 7 passos + 8 cards
   vivos + nav + storage — e a **rotina (`WeeklyReview`) linka para relatórios cujos
   sinais já estão renderizados inline logo abaixo** (duplicação). _(§2)_
10. **Vazamentos de P8 (bilíngue) e dívidas de código na shell** (literais hardcoded em
    `user-menu`, `SignOutButton`, `signin`, `/tv`; server actions inline duplicando
    `lib/actions`; 3 modais artesanais vs o `Dialog` primitivo). _(§3, §4)_

---

## 1. Navegação — o "menu confuso"

### 1.1 Mapa atual

**Navbar** (`components/navbar.tsx`, server) — no máximo 3 links:

| Rótulo    | Destino                     | Gate          | Observação          |
| --------- | --------------------------- | ------------- | ------------------- |
| Dashboard | `/dashboard`                | tem time      | **dup** do dropdown |
| Eventos   | `/reports/calendar/monthly` | ADMIN/MANAGER | **dup** do dropdown |
| Clientes  | `/admin/clients`            | ADMIN/MANAGER | **dup** do dropdown |

Para um **colaborador sem time**, a navbar fica vazia (só o avatar).

**UserMenu** (`components/user-menu.tsx`, client) — todo o resto, em 5 blocos empilhados:
`Minha Conta` (Configurações) · `Relatórios` (Horas, Gargalos, Atividade ao Vivo,
Calendário, Eventos⚠, Produtividade) · `Visão Geral` (Admin Dashboard, Dashboard⚠,
Clientes⚠, Tarefas) · _(ADMIN, sem rótulo)_ (Equipes, Usuários, Fluxos) · `Help`
(Central de Ajuda, Apresentação) · tema · sair.

### 1.2 Problemas concretos

- **Redundância total do topo:** `/dashboard`, `/admin/clients`, `/reports/calendar/monthly`
  aparecem na navbar **e** no dropdown.
- **Um dropdown fazendo 5 trabalhos:** prefs de conta + análises read‑only + CRUD destrutivo
  - ajuda + deck de marketing + tema + **sair (destrutivo)** no mesmo plano, com frequências,
    públicos e riscos completamente diferentes.
- **Órfãos:** `/tasks` (fila do colaborador — **primária pra quem executa**), `/projects`,
  e o hub `/reports` não são alcançáveis pela shell.
- **Rótulos que não revelam escopo:** "Calendário" vs "Eventos" (dois zooms do calendário);
  "Horas" vs "Produtividade" vs "Gargalos" (três relatórios, sem dizer self/time); "Dashboard"
  vs "Admin Dashboard" (duas "casas"). Fere a legibilidade por classe (P3/P4).
- **Prefs partidas:** tema no dropdown, idioma no `/account`.
- **Gating inline duplicado** entre `navbar.tsx` e `user-menu.tsx` (propenso a drift).

### 1.3 Proposta de navegação primária (nível de IA, não visual)

Agrupar por **trabalho‑a‑ser‑feito** e **persona**, com uma **barra primária persistente**
e um **menu de avatar enxuto** (só conta/ajuda/tema/sair). O visual fino fica para a etapa
de design.

**Colaborador (MEMBER):**

- **Início** → `/dashboard` (meu foco, exceções, backlog do time)
- **Meu Trabalho** → `/tasks` _(hoje órfão — expor)_ + acesso às suas etapas
- _Avatar:_ Conta, Ajuda, Tema, Sair

**Gestor/Admin (MANAGER/ADMIN):**

- **Cockpit** → `/admin` (saúde do time; a casa do gestor)
- **Demandas** → `/admin/tasks` (+ criar) · e a fila pessoal `/tasks`
- **Entregas** → Clientes (`/admin/clients`) · Projetos (`/projects` / lista a criar)
- **Relatórios** → landing no hub `/reports`, com os relatórios **renomeados por escopo**
  ("Minhas Horas" vs "Produtividade da Equipe", "Calendário Semanal" vs "Mensal/Eventos")
- **Administração** _(ADMIN)_ → Usuários, Equipes, Fluxos de Trabalho
- _Avatar:_ Conta (**+ tema e idioma juntos aqui**), Ajuda, Sair

Princípios do reagrupamento: (1) **um destino, um lugar** (elimina as 3 duplicações);
(2) **separar leitura (relatórios) de escrita (CRUD/ops)**; (3) **expor `/tasks`**;
(4) **tirar tema/deck/sair do meio das ferramentas**; (5) **rótulos que revelam escopo**.

---

## 2. Telas — propósito, fluxo, importância e componentes

Formato por tela: **propósito · acesso · fluxo e prioridade da informação (ancorado em
princípio) · componentes (nome · import · papel) · problemas de IA**. Telas triviais estão
agrupadas.

### 2.1 Núcleo de trabalho (colaborador)

#### `/dashboard` — cockpit pessoal diário

- **Acesso:** autenticado com time (sem time → tela de aviso). Sem gate de papel.
- **Fluxo/prioridade:** "o que faço agora e o que está em risco?" — **KPIs de exceção →
  minhas etapas ativas → backlog do time (pull) → minha evolução (privada, ao fim)**.
  Ordem correta (P6 exceção‑primeiro; P2 auto‑referenciado, nunca comparado).
- **Componentes:**
  - `StatsCards` · `components/dashboard/StatsCards.tsx` · 5 KPIs (ativas/envelhecendo/risco/concluídas‑semana/horas‑hoje)
  - `MyActiveStagesWidget` + `TeamBacklogWidget` · `components/dashboard/ActiveStagesWidget.tsx` · WIP próprio + backlog reivindicável
  - `ActiveStagesTable` · `components/dashboard/ActiveStagesTable.tsx` · tabela 8 colunas compartilhada pelos 2 widgets
  - `MyGrowthWidget` · `components/dashboard/MyGrowthWidget.tsx` · throughput + utilização + FTR + retrabalho (privado); usa `ThroughputLine` de `components/reports/FlowCharts`
- **Problemas:** `StatsCards` **refaz uma query própria** sobre as mesmas linhas de
  `getMyActiveStages` (risco de o número do header divergir da lista — fere P6);
  `ActiveStagesTable` com 8 colunas (idade‑criação + idade‑minha lado a lado) é pesada para
  um "olhar rápido"; `MyGrowthWidget` mistura métricas de fluxo e de qualidade num card
  denso e é **analítico** numa tela operacional _(→ realocar, §3)_.

#### `/tasks` — fila de etapas do colaborador _(hoje órfã na navegação)_

- **Acesso:** autenticado. Toggle mine/all client‑side.
- **Fluxo/prioridade:** filtrar (mine vs all, status, data) → ler KPIs → varrer tabela →
  clicar para detalhe read‑only. Ordem "estreitar → varrer" correta.
- **Componentes:** `MyStagesPageClient` · `components/my-stages/MyStagesPageClient.tsx`
  (orquestra) → `MyStagesFilters` · `MyStagesKPIs` · `MyStagesTable` · `StageDetailModal`
  (todos em `components/my-stages/`).
- **Problemas:** **`MyStagesKPIs` duplica `StatsCards`** e **`MyStagesTable` duplica
  `ActiveStagesTable`** — mesmos dados, contadores separados, interações divergentes
  (modal aqui vs link no dashboard). Candidato a **unificação canônica** _(§3)_.

#### `/tasks/[taskId]` — superfície de execução de uma tarefa

- **Acesso:** ver = autenticado; **ações gated server‑side** (assignee da etapa ativa ou
  ADMIN/MANAGER/SUPERVISOR); time logs só ADMIN/MANAGER.
- **Fluxo/prioridade:** entender (título/cliente/status/descrição) → discutir (comentários)
  → agir (start/stop, avançar/reverter/concluir) → anexar. Coluna esquerda = contexto;
  direita = ação.
- **Componentes (via `TaskDetailView` · `components/tasks/TaskDetailView.tsx`, **382 linhas**):**
  `WorkflowHistoryModal`, `CommentsList`, `AddCommentForm`, `ActivityButton`,
  `TaskActionsMenu`, `TimeLogsList` (todos `components/tasks/*`); `UnifiedArtifactsPanel`
  (`components/artifacts/`); `StorageBreakdown` (`components/nas/`).
- **Problemas:** `TaskDetailView` é o client mais pesado do núcleo e **rola seus próprios
  mapas `priorityConfig`/`statusConfig`** em vez de `lib/status-styles` (inconsistência de
  estilo com dashboard/my‑stages); back‑link vai para `/projects/{id}` mas o rótulo é
  `backToTasks`; **`StorageBreakdown` (bytes por mídia) numa tela de "fazer a tarefa"** é
  ruído de infra _(→ realocar, §3)_.

#### `/projects/[projectId]` — Kanban do projeto

- **Acesso:** autenticado; carrega `teamIds` só para o filtro "meu time".
- **Fluxo/prioridade:** filtros → colunas por ordem de etapa (inclui vazias — revela lacunas,
  P6) → cards leves que delegam detalhe.
- **Componentes:** `KanbanBoard` · `KanbanFilters` · `TaskCard` (todos `components/projects/`).
- **Problemas:** header **hardcoded pt‑BR** (`Cliente: …` — fere P8); board **read‑only**
  (avançar só no detalhe — descasamento de affordance); `TaskCard` **não mostra aging/blocked**,
  justamente a tela onde revelar exceção seria mais útil (P6 fraco aqui).

### 2.2 Gestão — cockpit e CRUD (`/admin/*`)

#### `/admin` — cockpit de saúde do time _(a tela mais rica)_

- **Acesso:** MANAGER+ (layout). Cada card busca seus dados em `lib/actions/team-health.ts`.
- **Fluxo/prioridade:** triagem diária/semanal — contadores (contexto) → rotina + 1:1
  atrasados → **a restrição (onde agir primeiro)** → carga do time → filas de envelhecendo
  e bloqueados → violações de WIP → burnout. Fortemente P6/ToC.
- **Cards (via `AdminHealthSection` · `components/admin/AdminHealthSection.tsx`):**
  `WeeklyReview` (`components/admin/WeeklyReview.tsx`), `OneOnOneCadence`→`OneOnOneCard`,
  `SystemConstraint`, `TeamLoadBalance`→`TeamLoadBalanceClient` (**258 linhas**), `AgingQueue`,
  `BlockedQueue`, `WipLimits`, `BurnoutSignals` (todos `components/admin/*`); mais contadores
  inline `StatCard` (definido **na própria página**, colide de nome com
  `components/admin/StatCard.tsx`), `NavItem` inline (rail de navegação), e `StorageBreakdown`.
- **Problemas:** **sobrecarga** (9 cards + checklist + 5 contadores + nav + storage numa
  rota); **dois `StatCard` de mesmo nome e APIs diferentes**; **contadores decorativos**
  acima de cards de alto sinal (compete com P6); **`WeeklyReview` linka para `/reports/*`
  cujos sinais já estão renderizados inline abaixo** (duplicação de navegação);
  `TeamLoadBalanceClient` faz 3 trabalhos (medidor + filtros + drawer) em 258 linhas.

#### `/admin/tasks` · `/admin/tasks/[taskId]` · `/admin/tasks/new`

- **Acesso:** MANAGER+.
- **Fluxo:** lista filtrável de demandas → detalhe/ciclo de vida → criação.
- **Componentes‑chave:** `TaskFilters` (`components/tasks/`), `Pagination` (`components/ui/`);
  detalhe usa `TaskLifecycleActions`/`AdvanceStageButton`/`RevertStageButton`/…,
  `UnifiedArtifactsPanel`, `StorageBreakdown`, `TimeLogsList`; criação usa `CreateTaskForm`
  (`components/tasks/`) que por sua vez importa `quick-create/*`.
- **Problemas:** **tabela inline grande** com **mapas de cor status/prioridade duplicados**
  (reaparecem no detalhe e no projeto); `/admin/tasks/[taskId]` (399 linhas) tem **query
  Prisma crua no corpo da página** (deveria ser `lib/actions`) e blocos inline (pipeline,
  histórico, comentários) que pediam componentes; `formatDate`/`firstParam` copiados entre
  páginas.

#### `/admin/users` · `/admin/users/[userId]`

- **Acesso:** **ADMIN‑only** (`requireAdmin` nas queries).
- **Fluxo:** diretório (achar/ordenar/editar papel‑time‑capacidade) → **dossiê analítico da
  pessoa**.
- **Componentes:** `UserFilters` (modal, `useUrlFilters`), `EditUserButton` (**modal
  artesanal**, 212 linhas); detalhe usa `StatCard` (`components/admin/`), `ThroughputLine`
  (**importado dos relatórios**), `ReworkClassifyToggle` (`components/people/`) + 2 tabelas
  inline.
- **Problemas:** `/admin/users/[userId]` (**344 linhas**) **mistura CRUD com um relatório
  analítico completo** (throughput/utilização/qualidade/retrabalho) — é um mini‑relatório
  morando no CRUD, e **sobrepõe `/reports/user/[id]`** _(→ reconciliar, §3)_; `EditUserButton`
  rola modal próprio em vez do `Dialog` primitivo.

#### `/admin/clients` (+ `[clientId]`) · `/admin/projects/[projectId]` · `/admin/teams` (+ `[teamId]`) · `/admin/templates` (+ `[templateId]`)

- **Acesso:** clients/projects MANAGER+; teams/templates listagem MANAGER+ mas
  teams **ADMIN‑only** nas queries.
- **Fluxo:** listas simples (criar + tabela + excluir) → detalhes editáveis com sub‑recursos
  (projetos, membros, etapas, artefatos, storage).
- **Problemas estruturais:** **4 layouts de lista independentes** (clients/teams/templates/users)
  reimplementam o mesmo padrão; **server actions inline** em `/admin/clients` e `/admin/teams`
  **duplicam `lib/actions/client|team`** (com `updateClient`/`updateTeam` inline **mortos**);
  **3 modais artesanais** (`EditUserButton`, `ManageTeamMembers`, + o `Dialog` usado por
  outros); **P8 vazando** (`ProjectStatusFilter` "Todos/Pendentes/Concluídos" e "Artefatos"
  hardcoded); **não existe `/admin/projects` (lista)** — projetos só via cliente; template
  editor usa namespace i18n `template.*` (todos os outros `admin.*`) e estilo de card
  divergente. O subtree do editor de fluxo (`CreateStageForm`/`StagesList`/`StageEditForm`/
  `WorkflowVisualization`/`Dependency*`) é **coeso** — não mexer.

### 2.3 Relatórios (`/reports/*`)

- **Acesso:** MANAGER+ (layout) — porém **re‑checado redundantemente** em quase toda página.
- **`/reports` (hub):** cards de navegação (`ReportCard`) + picker de colaborador
  (`UserReportPicker`). Guia explica só 3 dos 6 relatórios (drift). _(nunca é linkado da shell)_
- **`/reports/performance` (865 linhas):** cycle‑time percentis + `CycleScatter` (SVG inline,
  100+ linhas), Monte Carlo, throughput+CFD (`FlowCharts`), gargalos, eficiência de fluxo,
  e **4 visões de qualidade espalhadas** (rework table, by‑source, FTR, quality issues).
  Forte P3/P5/P6. **Problema:** ~12 seções inline **page‑private** (nada reusável — o cockpit
  não consegue mostrar um resumo de fluxo); `CycleScatter` devia morar em `FlowCharts.tsx`.
- **`/reports/productivity`:** horas por usuário/projeto/cliente/etapa + **banda de utilização
  que colore indivíduos** (>90% rose / 60‑90% emerald / <60% amber) — **tensão com P2/P7**
  (o próprio comentário admite benchmark não verificado). 4 seções "horas por X" quase idênticas.
- **`/reports/team-productivity`:** on‑time, throughput, carga, SLA por etapa — **por time**
  (P2‑ok). **Usa filtro (`PeriodSelector`) e estilo de card diferentes** do resto. **Sobrepõe
  fortemente `/reports/performance`** (throughput e duração por etapa em ambos) _(→ fundir, §3)_;
  `CurrentLoadGrid` (carga ao vivo) sobrepõe o `TeamBacklogWidget` do dashboard.
- **`/reports/calendar` + `/calendar/monthly`:** **uma feature em dois zooms** (semanal com
  drag‑to‑reschedule; mensal com feriados/aniversários). Operacional (escrita) dentro de
  "relatórios". Terceira barra de filtro (`CalendarFiltersBar`, `useUrlFilters`). Nav mensal
  reinventada em vez de reusar `WeekNavigator`. _(→ fundir + mover, §3)_
- **`/reports/live-activity`:** board de presença em tempo real (335 linhas, card inline
  "Pokémon"). `DEFAULT_HIDDEN_TEAMS` **hardcoded em inglês** (fere P8). Sabor de vigilância
  (tensão P1/P2). **Mesma coisa que `/tv`** em outra UI _(→ fundir, §3)_.
- **`/reports/user/[userId]`:** relatório de um indivíduo (horas/etapas/on‑time). **Sem UI de
  mês** (só `?month=`). **Ranqueia pessoa** (maior tensão P2 do cluster) e **duplica
  `/admin/users/[id]`** _(→ reconciliar, §3)_.

### 2.4 Shell e telas de apoio

- **`/account`:** dossiê read‑only + `LanguageSwitcher` + `SignOutButton`. **2 caminhos de
  logout divergentes** (aqui `next-auth/react`; no menu `signOutAction`); "Sair (Logout)"
  hardcoded; `metadata.title="Conta"` literal. **Tema deveria vir para cá** (ao lado do idioma).
- **`/help` (+3 guias):** hub + `GuideView`/`HelpFigure` (`components/help/`), copy 100% em
  `help.json`. Rótulo de menu "Help" hardcoded vs página "Central de Ajuda"; `HelpFigure`
  com aria pt‑BR hardcoded (P8). Guias sem deep‑link "experimentar".
- **`/tv`:** wallboard de presença (dark, sem nav). **⚠ Fora de `PROTECTED_PATHS`** — só a
  API guarda os dados (revisar segurança). Sobrepõe `/reports/live-activity`. Relógio/labels
  hardcoded (P8).
- **`/next` ("Apresentação", ícone `GitBranch`):** deck de onboarding **público**
  (`components/task-flow/`), linkado da home pública **e** do menu autenticado sob "Help";
  deep‑linka para relatórios protegidos. **Crise de identidade de nome** (rota `/next` +
  rótulo "Apresentação" + ícone de branch + nome "task-flow"). `Escape` joga o usuário para
  `/` (fora do app).
- **`/auth/signin` · `/`:** login Google; home pública. Linha de termos hardcoded (P8);
  signin sempre redireciona para `/` ignorando o `callbackUrl` (deep‑link → login perde o alvo).

---

## 3. Mapa de realocação (o roteiro)

Três tipos de movimento: **MOVER** (componente vai para outra tela), **UNIFICAR** (dois
componentes viram um canônico), **FUNDIR** (duas telas viram uma). Cada linha marca a
**origem** para a implementação ser mecânica.

### 3.1 MOVER — componente na tela errada

| Componente                                                       | Import de origem                                                                                                             | Aparece hoje em                                                                             | Destino proposto                                                                     | Motivo (princípio)                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `MyGrowthWidget`                                                 | `components/dashboard/MyGrowthWidget.tsx`                                                                                    | `/dashboard`                                                                                | tela pessoal de evolução (nova, `/reports/user/[self]` ou `/dashboard?tab=evolução`) | Analítico/reflexivo compete com o "fazer agora" (P1/P3)            |
| `StorageBreakdown`                                               | `components/nas/StorageBreakdown.tsx`                                                                                        | `/admin`, `/tasks/[id]`, `/admin/tasks/[id]`, `/admin/clients/[id]`, `/admin/projects/[id]` | só `/admin/clients/[id]` e `/admin/projects/[id]` (visão de capacidade)              | Bytes por mídia é infra/capacidade, não trabalho da tarefa (P6/P7) |
| Analytics de pessoa (throughput/utilização/qualidade/retrabalho) | inline em `app/[locale]/(protected)/admin/users/[userId]/page.tsx` + `ThroughputLine` de `components/reports/FlowCharts.tsx` | `/admin/users/[id]` (CRUD)                                                                  | seção "Pessoas" dos relatórios, reconciliada com `/reports/user/[id]`                | Relatório não deve morar no CRUD; unifica a visão por pessoa (P2)  |
| `CurrentLoadGrid`                                                | `components/reports/team-productivity/CurrentLoadGrid.tsx`                                                                   | `/reports/team-productivity`                                                                | cockpit `/admin` (carga ao vivo é ops, não histórico)                                | Exceção‑primeiro ao vivo (P6); sobrepõe `TeamBacklogWidget`        |
| `CycleScatter` (SVG inline)                                      | inline em `.../reports/performance/page.tsx`                                                                                 | `/reports/performance`                                                                      | `components/reports/FlowCharts.tsx` (co‑locar com os outros SVGs)                    | Coesão; torna reusável para um resumo no cockpit                   |
| Toggle de **tema**                                               | `components/user-menu.tsx`                                                                                                   | dropdown                                                                                    | `/account` (ao lado de `LanguageSwitcher`)                                           | Config mora na tela de config (junto com idioma)                   |

### 3.2 UNIFICAR — duplicação a colapsar num canônico

| Duplicatas                     | Imports atuais                                                                                                              | Canônico proposto                                                      | Motivo                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| Tabela de etapas ativas        | `components/dashboard/ActiveStagesTable.tsx` **vs** `components/my-stages/MyStagesTable.tsx`                                | uma `StageList` compartilhada (colunas configuráveis, interação única) | Mesmos dados, 3 interações; contadores podem divergir (P6/P2) |
| KPIs pessoais                  | `components/dashboard/StatsCards.tsx` **vs** `components/my-stages/MyStagesKPIs.tsx`                                        | um `PersonalKPIs` derivado da **mesma** fetch da lista                 | Contador único e coerente (P6)                                |
| Mapas de cor status/prioridade | inline em `TaskDetailView.tsx`, `TaskCard.tsx`, `/admin/tasks/page.tsx`, `/admin/projects/[id]/page.tsx`                    | `lib/status-styles` (já existe) → `StatusBadge` em `components/ui/`    | Uma linguagem visual de status (consistência)                 |
| Barras de filtro               | `components/reports/ReportFilterBar.tsx`, `.../team-productivity/PeriodSelector.tsx`, `.../calendar/CalendarFiltersBar.tsx` | um sistema de filtro sobre `lib/hooks/useUrlFilters`                   | 3 modelos mentais → 1                                         |
| Skeletons                      | `components/reports/skeletons.tsx`, `SectionSkeleton` (team‑prod), `components/dashboard/DashboardSkeleton.tsx`             | um conjunto compartilhado                                              | DRY                                                           |
| Modais                         | `EditUserButton`, `ManageTeamMembers` (artesanais)                                                                          | `components/ui/dialog` (+ `ConfirmActionButton` já existente)          | Consistência/a11y (memória: shared foundations)               |
| Listas CRUD simples            | `/admin/clients`, `/admin/teams`, `/admin/templates`                                                                        | um `SimpleEntityCrudList`                                              | 4 layouts → 1                                                 |
| Server actions inline          | inline em `/admin/clients`, `/admin/teams`                                                                                  | `lib/actions/client                                                    | team` (já existem)                                            | Remove duplicação/código morto |
| Logout                         | `components/auth/SignOutButton.tsx` (next-auth/react) **vs** `signOutAction`                                                | um componente sobre `signOutAction`                                    | Um caminho de sessão                                          |

### 3.3 FUNDIR — telas a colapsar

| Telas                                                       | Motivo                                                                         | Resultado proposto                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `/reports/team-productivity` **⊂** `/reports/performance`   | throughput e duração‑por‑etapa em ambos; on‑time compartilhado com user report | um "Fluxo & Entrega" por time/tipo, com um sistema visual          |
| `/reports/calendar` **+** `/reports/calendar/monthly`       | uma feature em dois zooms                                                      | um "Calendário" com toggle semana/mês; nav única (`WeekNavigator`) |
| `/reports/live-activity` **+** `/tv`                        | mesma data, duas UIs                                                           | uma feature de presença com "modo TV"; mover para ops/cockpit      |
| `/reports/user/[id]` **+** analytics de `/admin/users/[id]` | mesma pessoa, métricas repetidas                                               | uma visão "Pessoa" (reports), linkada do CRUD                      |

> **Guarda de princípio (não regredir).** Ao reorganizar, **não** transformar as superfícies
> de pessoa (`user report`, utilização colorida, live‑activity) em ranking/comparação — P1/P2/P7.
> A utilização deve permanecer **faixa indicativa**; a qualidade por pessoa mantém as
> salvaguardas da exceção 3b (auto‑referenciada, motivos à vista, reclassificação só do gestor).

---

## 4. Roadmap priorizado (impacto ÷ esforço)

**Fase 0 — IA global de navegação (maior impacto, esforço baixo/médio).**
Reestruturar navbar + avatar‑menu por persona (§1.3); **expor `/tasks`**; eliminar as 3
duplicações; renomear rótulos por escopo; mover **tema** para `/account`; centralizar o
gating de papel num único módulo. _(Só toca `navbar.tsx`, `user-menu.tsx`, `/account`,
`LanguageSwitcher`.)_

**Fase 1 — Unificar duplicação de base (esforço médio, remove risco de incoerência).**
`StatusBadge` sobre `lib/status-styles` (mata os mapas triplicados); **uma `StageList` +
`PersonalKPIs`** canônicos (dashboard + `/tasks`); um sistema de filtro; um conjunto de
skeleton; migrar os 3 modais e as listas CRUD para os primitivos/`lib/actions` (remove
código morto e P8‑leaks de passagem).

**Fase 2 — Realocações de componente (§3.1).**
`MyGrowthWidget` → evolução pessoal; `StorageBreakdown` só em cliente/projeto; `CycleScatter`
→ `FlowCharts`; `CurrentLoadGrid` → cockpit. Cada um com origem já marcada.

**Fase 3 — Fusões de tela (§3.3).**
team‑productivity → performance; calendário semana/mês; live‑activity/TV; reconciliar as
duas visões por pessoa. Aliviar o cockpit (`/admin`): tirar contadores decorativos e a
redundância `WeeklyReview`↔cards.

**Transversal (contínuo).**
Fechar vazamentos de P8 (literais em `user-menu`, `SignOutButton`, `signin`, `/tv`,
`ProjectStatusFilter`, `HelpFigure`, `metadata.title`s); revisar segurança de `/tv`
(fora de `PROTECTED_PATHS`); resolver o `callbackUrl` perdido no signin; definir 1 nome
para o deck (`/next`).

---

## 5. Como usar este documento

- **Para a ferramenta externa de UX / designer:** §1.3 (nav proposta), §2 (o que cada tela
  precisa mostrar e em que ordem) e §3 (o que sai/entra em cada tela) são o briefing. O
  visual fino é deles; a arquitetura de informação está fechada aqui.
- **Para a implementação:** §3 é o roteiro (origem→destino por componente); §4 é a ordem.
  Cada movimento cita import de origem para ser mecânico.
- **Manutenção:** ao mover/renomear uma superfície, atualizar o §3 da
  [biblioteca de conhecimento](./biblioteca-de-conhecimento.md) (mapa de defesa) para a
  tela não perder seu vínculo com o princípio que a justifica.

---

## 6. Checklist de geração & revisão de telas

Registro vivo das telas geradas pela ferramenta externa (a partir dos prompts de
[prompts-de-geracao-de-telas.md](./prompts-de-geracao-de-telas.md)) e da revisão contra o
brief + os princípios. Preencher conforme cada tela chega.

**Legenda:** ⬜ não gerada · 🟡 gerada, revisão pendente · ✅ de acordo · 🔧 ajustes pendentes.

| #   | Tela                           | Status | Resumo da revisão                                                                                                                                                     |
| --- | ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Navegação global               | 🔧     | Persona‑aware; avatar enxuto (tema+idioma juntos, sair separado); sem duplicação — resolve o "menu confuso". 1 correção: submenu Relatórios incompleto/fora do §3.    |
| 1   | Início / dashboard pessoal     | 🔧     | Fiel ao brief (exceção‑primeiro, tom informacional, aging vs SLA, KPIs coerentes com a lista). 3 ajustes finos abaixo.                                                |
| 2   | Meu Trabalho (`/tasks`)        | 🔧     | **Reusou** o padrão do Início (filtros + 6 KPIs + tabela clicável), números coerentes. Reconciliar 1 divergência: célula de AGING (texto aqui vs barra no dashboard). |
| 3   | Detalhe da tarefa              | ⬜     | —                                                                                                                                                                     |
| 4   | Minha Evolução                 | ⬜     | —                                                                                                                                                                     |
| 5   | Kanban do projeto              | ⬜     | —                                                                                                                                                                     |
| 6   | Cockpit (`/admin`)             | ⬜     | —                                                                                                                                                                     |
| 7   | Demandas (lista/detalhe/criar) | ⬜     | —                                                                                                                                                                     |
| 8   | Fluxo & Entrega (fundido)      | ⬜     | —                                                                                                                                                                     |
| 9   | Horas & Utilização             | ⬜     | —                                                                                                                                                                     |
| 10  | Pessoas (por pessoa)           | ⬜     | —                                                                                                                                                                     |
| 11  | Calendário (unificado)         | ⬜     | —                                                                                                                                                                     |
| 12  | Presença ao vivo (+ modo TV)   | ⬜     | —                                                                                                                                                                     |
| 13  | Clientes (lista/detalhe)       | ⬜     | —                                                                                                                                                                     |
| 14  | Projetos (lista nova/detalhe)  | ⬜     | —                                                                                                                                                                     |
| 15  | Usuários (CRUD)                | ⬜     | —                                                                                                                                                                     |
| 16  | Equipes                        | ⬜     | —                                                                                                                                                                     |
| 17  | Fluxos de trabalho (editor)    | ⬜     | —                                                                                                                                                                     |
| 18  | Conta                          | ⬜     | —                                                                                                                                                                     |
| 19  | Ajuda                          | ⬜     | —                                                                                                                                                                     |
| 20  | Login / Home pública           | ⬜     | —                                                                                                                                                                     |

### Log de revisão

#### Tela 0 — Navegação global · revisado 2026‑07‑23 · 🔧

**De acordo:**

- Barra primária persona‑aware (visão ADMIN): `Cockpit` (ativo) · `Demandas` · `Entregas ▾`
  (Clientes, Projetos) · `Relatórios ▾` · `Administração ▾` (Usuários, Equipes, Fluxos de
  Trabalho) — exatamente o §1.3.
- **Avatar enxuto:** nome + papel · Minha Conta · Ajuda · **Tema** e **Idioma juntos aqui** ·
  **Sair** separado/destrutivo (vermelho). Resolve as "prefs partidas" e tira o sair do meio das
  ferramentas.
- Sem duplicação barra↔menu; item ativo destacado; ícones consistentes; marca "nexo".

**Ajustar:**

1. **Submenu Relatórios incompleto e fora do §3:** mostra só "Produtividade da Equipe" +
   "Mensal / Eventos". "Produtividade da Equipe" deveria estar **fundida** em "Fluxo & Entrega"
   (§3). Lista‑alvo do submenu (ou landing no hub `/reports`): **Fluxo & Entrega · Horas &
   Utilização · Pessoas · Calendário / Eventos · Presença ao vivo**.
2. **Visão MEMBER não verificada:** o print é da barra do ADMIN (Marina = Administrador(a)).
   Falta ver a de colaborador — deve mostrar só `Início` + `Meu Trabalho`.
3. **Acesso do gestor ao trabalho pessoal:** Cockpit é a casa do gestor (ok), mas confirmar onde
   ele alcança a própria fila (`/tasks`) — dentro de `Demandas` ou item próprio.

**Carregar para a próxima:** ao pedir a correção do submenu Relatórios, entregar a lista‑alvo
completa e reforçar o merge team‑productivity → Fluxo & Entrega (§3.3).

#### Tela 1 — Início / dashboard pessoal · revisado 2026‑07‑23 · 🔧

**De acordo:**

- Ordem exceção‑primeiro (KPIs → Meu foco → Backlog do time) — P6.
- Aviso de WIP com tom **informacional** ("Sem pressa, só um lembrete") — P1/P7 no registro certo.
- Aging vs SLA visível (barra + "SLA estourado"; vermelho/âmbar/verde) e badges de status.
- **Coerência KPI ↔ lista:** ativas=5, envelhecendo=1 (âmbar), em risco=2 (atrasada+bloqueada) batem com a tabela.
- Backlog pull com "Reivindicar" por etapa sem responsável.

**Ajustar:**

1. **Aging em etapa BLOQUEADA:** hoje mostra barra verde (18h/48h). Bloqueio é exceção por si;
   o relógio relevante é o de **espera**, não o de trabalho. Neutralizar/mutar a barra quando
   `status = bloqueada` (ou trocar por "bloqueada há Xh").
2. **Coerência é contrato de implementação:** a tela hardcodou um snapshot coerente; ao plugar
   dados reais, os **KPIs precisam derivar da MESMA consulta** que monta a lista (senão divergem).
3. **Faltam provas:** validar **tema escuro** e **es‑ES** (P8) — não verificáveis por 1 screenshot.

**Carregar para a próxima:** ao gerar **Meu Trabalho (`/tasks`)**, pedir explicitamente para
**reusar o mesmo padrão de lista "Meu foco" + faixa de KPIs** (só trocando os filtros) — é a
unificação do §3 (evitar recriar uma tabela divergente).

#### Tela 2 — Meu Trabalho (`/tasks`) · revisado 2026‑07‑23 · 🔧

**De acordo — a unificação do §3 aconteceu:**

- Reusa o padrão do Início: filtros (Escopo Minhas/Do time · pills de status · range de vencimento
  · Limpar) + **6 KPIs** (Total, Ativas, Bloqueadas, Concluídas, Atrasadas, Horas) + tabela
  clicável ("clique na linha para o detalhe").
- Colunas coerentes (TAREFA · ETAPA · STATUS · AGING · VENCIMENTO · Horas hoje); coluna extra
  "Horas hoje" é ok (colunas configuráveis por contexto — previsto no brief).
- **Números coerentes:** Total 7 = 2 concluídas + 4 ativas (a _Atrasada_ conta como ativa +
  flag de atraso) + 1 bloqueada; Atrasadas=1 é contagem transversal. Bate com a lista.

**Ajustar (reconciliação cross‑tela, não bug da tela):**

1. **Célula de AGING divergiu do dashboard.** Aqui é **texto colorido** "Xh / SLA" sem barra;
   no Início é **barra colorida** + número. Definir **UMA** célula de aging canônica e usá‑la nas
   duas telas — é exatamente o alvo do §3 (um componente, não dois parecidos). Escolher: barra
   (mais escaneável) ou texto (mais compacto).
2. **Confirmar o alvo do clique:** o brief pede **detalhe read‑only** (painel/modal), **não** a
   tela de tarefa editável (essa tem as ações). O chevron sugere navegação — verificar que abre a
   versão só‑leitura.
