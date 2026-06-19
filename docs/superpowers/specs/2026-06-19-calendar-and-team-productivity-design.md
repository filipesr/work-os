# Calendário Gantt + Relatório de Produtividade por Equipe

**Status:** spec aprovado, pendente plano de implementação
**Data:** 2026-06-19
**Autor:** Brainstorm conduzido com Filipe Rezende

## Contexto

O Work OS está prestes a virar piloto interno. Hoje existem três relatórios
(`/reports/live-activity`, `/reports/performance`, `/reports/productivity`) mas
falta uma **visão calendarizada** das tarefas em andamento e métricas
**gerenciais por equipe** que respondam "quem está sobrecarregado", "o que vence
essa semana", "qual equipe está entregando mais", e "qual etapa é o gargalo".

O usuário pediu um Gantt semanal mostrando tarefas em andamento, prazo final,
responsável e tempo restante, e relatórios mais eficientes pra produtividade
por setor/equipe/tarefa. SLA por etapa (campo `expectedDuration` em
`TemplateStage`) foi explicitamente postergado.

A implementação não muda o schema Prisma e reaproveita `lib/actions/reporting.ts`,
permissões existentes (`requireManagerOrAdmin`), e o menu de relatórios.

## Escopo

**Dentro:**

- Página `/reports/calendar` — Gantt semanal navegável agrupado por equipe.
- Página `/reports/team-productivity` — quatro métricas: throughput, carga atual,
  tempo médio por etapa, % no prazo.
- Ajuste no `prisma/demo-seed.ts` pra concentrar dados na semana atual e
  garantir visualização rica.
- Testes unitários nas server actions novas (auth path + lógica de
  agregação).

**Fora:**

- SLA / `expectedDuration` por etapa.
- Drag-and-drop pra reagendar tarefas.
- Exportação CSV/PDF.
- Heatmap diário.
- Relatório por colaborador individual (página própria) — filtro de
  colaborador no Gantt fica, mas página dedicada não.

## Arquitetura

Duas rotas server-component novas em `app/[locale]/(protected)/reports/`:

- `calendar/page.tsx`
- `team-productivity/page.tsx`

Server actions adicionadas ao arquivo existente `lib/actions/reporting.ts`.
Componentes de UI em `components/reports/calendar/` e `components/reports/team-productivity/`.

Sem novas dependências de runtime. Layout do Gantt usa CSS Grid puro
(`grid-template-columns: repeat(7, 1fr)`); nada de biblioteca pesada de Gantt.

Permissão: `requireAnyRole([ADMIN, MANAGER])` em ambas as páginas (mesmo padrão
de `app/[locale]/(protected)/reports/page.tsx`). Os relatórios são adicionados
ao **index `/reports`** como dois cards novos (ao lado de Produtividade,
Performance, Live Activity). A navbar NÃO precisa mudar — o usuário entra em
`/reports` e seleciona o card.

## `/reports/calendar` — Gantt semanal

### URL e estado

`?week=YYYY-MM-DD&team=t1&project=p1&user=u1&showCompleted=1`

- `week` é a **segunda-feira** da semana mostrada (string `YYYY-MM-DD`).
  Default = segunda da semana corrente em `America/Sao_Paulo`.
- Filtros opcionais combinam **com AND** (querystring → server). `team`, `project`,
  `user` ausentes = sem filtro. Sem state persistido no cliente.
- `showCompleted=1` inclui tarefas `COMPLETED` com `completedAt` dentro da
  semana visível.
- `searchParams` async (Next 15).

### Layout visual

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← 15-21 Jun 2026 →  [Equipe ▾] [Projeto ▾] [Colab ▾] ☐ Concluídas   │
├────────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────────────────┤
│            │ Seg │ Ter │ Qua │ Qui │ Sex │ Sáb │ Dom                 │
├────────────┼─────┴─────┴─────┴─────┴─────┴─────┴─────────────────────┤
│ Sem prazo  │ [Tarefa Y — Copy · sem data]                            │
├────────────┼─────────────────────────────────────────────────────────┤
│ Design     │  [Tarefa A — Design • Vence em 3d ]                     │
│            │       [Tarefa B — Design • Atrasada]                    │
├────────────┼─────────────────────────────────────────────────────────┤
│ QC         │            [Tarefa C — QC +2 • Vence em 1d]             │
└────────────┴─────────────────────────────────────────────────────────┘
```

- Coluna esquerda fixa com nome da equipe (label vertical).
- Sete colunas de dia com mesma largura.
- Barras posicionadas via `grid-column: <day-start> / <day-end>`, com `grid-row`
  igual ao índice da equipe.
- Linha "Sem prazo" sempre no topo, só renderiza se houver tarefas.

### Por barra (componente `<TaskBar />`)

- **Texto:** título truncado + badge da etapa ativa principal
- **Badge `+N`** quando há múltiplas etapas ativas (fork), tooltip lista todas
- **Cor de fundo:**
  - cinza-200 (concluída) — só quando `showCompleted=1`
  - vermelho-100 (`dueDate < hoje` e não concluída) — texto "Atrasada há Nd"
  - amarelo-100 (`dueDate − hoje ≤ 2 dias`) — texto "Vence em Nd"
  - verde-100 (resto) — texto "Vence em Nd"
- **Click:** `<Link href={"/tasks/" + id}>` cobrindo a barra
- **aria-label:** "Tarefa X, equipe Y, vence em N dias, etapa Z"

### Server action `getCalendarTasks`

Em `lib/actions/reporting.ts`:

```ts
type CalendarFilters = {
  weekStart: Date; // Monday 00:00
  weekEnd: Date; // Sunday 23:59
  teamId?: string;
  projectId?: string;
  userId?: string;
  showCompleted?: boolean;
};

type CalendarTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  status: TaskStatus;
  project: { id: string; name: string };
  primaryStage: { id: string; name: string } | null;
  extraStageCount: number;
  assignee: { id: string; name: string | null } | null;
  teamId: string | null; // from primaryStage.defaultTeamId
  teamName: string | null;
};

type CalendarBuckets = {
  noDueDate: CalendarTask[];
  byTeam: { teamId: string | null; teamName: string; tasks: CalendarTask[] }[];
};

export async function getCalendarTasks(filters: CalendarFilters): Promise<CalendarBuckets>;
```

Comportamento:

1. `requireManagerOrAdmin()`.
2. Consulta `prisma.task.findMany` com:
   - `include: { project, activeStages: { include: { stage: { include: { defaultTeam } } }, assignee } }`
   - Filtro `status`: incluir `IN_PROGRESS`, `BACKLOG`, `PAUSED`. Se `showCompleted`,
     incluir `COMPLETED` com `completedAt` na semana.
   - Filtro `OR: [{ dueDate: { gte: weekStart, lte: weekEnd } }, { dueDate: null }, ...overlap futuro/passado]`.
   - Filtros opcionais aplicados via `where` adicional (`projectId`,
     `activeStages.some.assigneeId`, `activeStages.some.stage.defaultTeamId`).
3. Pra cada task, calcula `primaryStage` = primeira `ACTIVE` ordenada por
   `stage.order ASC` (estável); se nenhuma `ACTIVE`, fallback pra primeira
   `BLOCKED`. `extraStageCount = total de stages com status ACTIVE ou BLOCKED − 1`.
   `teamId = primaryStage.stage.defaultTeamId` (pode ser `null` → bucket
   "Sem equipe"). Tarefa concluída usa a etapa concluída por último
   (maior `order` com `status='COMPLETED'`) pra atribuição de equipe.
4. Particiona em `noDueDate` e `byTeam` (Map agrupando por `teamId`).
5. Ordena equipes por nome. Dentro da equipe, ordena por `dueDate ASC` com
   `null` no fim (mas no bucket separado já vai pra fora).

### Componentes

```
app/[locale]/(protected)/reports/calendar/
  page.tsx               # server, lê searchParams, chama action, passa props
  loading.tsx            # skeleton de grid
  WeekNavigator.tsx      # client, botões anterior/atual/próximo + label
  CalendarFiltersBar.tsx # client, dropdowns equipe/projeto/colab + toggle

components/reports/calendar/
  CalendarGrid.tsx       # server, recebe buckets, monta grid CSS
  TaskBar.tsx            # server, renderiza uma barra
  weekRange.ts           # helper: parseWeekParam, weekRangeFromMonday
```

### Helpers de data

`lib/dates.ts` (criar):

- `parseWeekParam(input: string | undefined): Date` — retorna segunda da semana corrente se inválido
- `weekRangeFromMonday(monday: Date): { start: Date; end: Date; days: Date[] }` — `start` = 00:00 segunda, `end` = 23:59:59 domingo, `days` = array de 7 datas
- `daysUntil(date: Date, ref = new Date()): number` — diferença em dias arredondada
- Tudo em `America/Sao_Paulo` via `Intl.DateTimeFormat` ou simples ajuste UTC offset; **não introduzir date-fns-tz** se não precisar (já tem `date-fns`).

## `/reports/team-productivity` — métricas gerenciais

### URL e estado

`?period=week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`

- `period=week` (default) → últimos 7 dias
- `period=month` → últimos 30 dias
- `period=custom` → usa `from` e `to`
- searchParams async

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Produtividade por equipe   [Esta semana ▾]  [De ___] [Até ___]    │
├────────────────────────────────────────────────────────────────────┤
│ ╭─────────────────────────╮  ╭───────────────────────────────────╮│
│ │ % no prazo: 78%         │  │ Δ vs período anterior: +5pp       ││
│ ╰─────────────────────────╯  ╰───────────────────────────────────╯│
├────────────────────────────────────────────────────────────────────┤
│ Throughput por equipe                                              │
│ Equipe       │ Concluídas │ Δ período anterior                     │
│ Design       │     14     │ +3                                     │
│ QC           │      9     │ -1                                     │
│ ...                                                                │
├────────────────────────────────────────────────────────────────────┤
│ Carga atual                                                        │
│ [Card Design: 8 em andamento — 5 no prazo · 2 atenção · 1 atrasada]│
│ [Card QC: ...]                                                     │
├────────────────────────────────────────────────────────────────────┤
│ Tempo médio por etapa                                              │
│ Etapa            │ Tempo médio  │ # tarefas que passaram           │
│ Aprovação Copy   │ 4h 12min     │ 23                               │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

Tudo server-rendered. Filtros disparam navegação (Link) — sem state cliente.

### Server actions

Em `lib/actions/reporting.ts`:

```ts
type PeriodRange = { from: Date; to: Date };

export async function getTeamThroughput(range: PeriodRange): Promise<
  {
    teamId: string;
    teamName: string;
    completedCount: number;
    previousCompletedCount: number;
  }[]
>;

export async function getTeamCurrentLoad(): Promise<
  {
    teamId: string;
    teamName: string;
    inProgress: number;
    overdue: number; // dueDate < hoje
    attention: number; // dueDate − hoje <= 2 dias
    onTrack: number;
  }[]
>;

export async function getStageDuration(range: PeriodRange): Promise<
  {
    stageId: string;
    stageName: string;
    templateName: string;
    avgDurationHours: number;
    sampleSize: number;
  }[]
>;

export async function getOnTimeRate(range: PeriodRange): Promise<{
  overall: { onTime: number; total: number; percentage: number };
  previousPercentage: number;
  byTeam: { teamId: string; teamName: string; onTime: number; total: number; percentage: number }[];
}>;
```

### Cálculos

- **Throughput:** `count(task where completedAt ∈ range AND activeStages.some(s => s.status='COMPLETED'))` agrupado pelo `defaultTeamId` da última etapa concluída. Previous = mesmo range deslocado pra trás.
- **Carga atual:** `count(task where status='IN_PROGRESS')` agrupado pelo `defaultTeamId` da etapa ACTIVE atual. Sub-buckets pelo `dueDate`.
- **Tempo médio por etapa:** consulta em `TaskStageLog` com `exitedAt != null AND enteredAt ∈ range`, `avg(exitedAt − enteredAt)` agrupado por `stageId`. Filtra `sampleSize < 3` (joga em "amostra insuficiente").
- **% no prazo:** `count(completedAt ∈ range AND completedAt <= dueDate) / count(completedAt ∈ range AND dueDate != null)`. Tarefas sem dueDate excluídas do denominador. Por equipe usa mesma lógica do throughput pra atribuição de equipe.

Onde Prisma fica feio (joins agregados com defaultTeam da última etapa concluída), usar `$queryRaw` parametrizado.

### Componentes

```
app/[locale]/(protected)/reports/team-productivity/
  page.tsx               # server
  loading.tsx            # skeleton com Suspense por widget
  PeriodSelector.tsx     # client, dropdown + custom date range

components/reports/team-productivity/
  OnTimeRateCard.tsx
  ThroughputTable.tsx
  CurrentLoadGrid.tsx
  StageDurationTable.tsx
```

Cada widget envolve em `<Suspense fallback={...}>` no `page.tsx` pra streaming
progressivo.

## i18n

Adicionar `locales/{pt-BR,es-ES}/reports.json` (ou criar `reportsCalendar.json`
e `reportsTeam.json` seguindo padrão dos outros) com strings novas. Atualizar
`lib/i18n.ts` se criar arquivos.

Atualizar `locales/{pt-BR,es-ES}/common.json` `nav.calendar` e
`nav.teamProductivity`.

## Ajustes no demo seed

`prisma/demo-seed.ts`:

- Subir pra 50% a proporção de tarefas IN_PROGRESS com `dueDate` entre `[hoje, hoje+7d]`.
- Garantir mínimo 5 tarefas IN_PROGRESS por equipe (forçar atribuição se faltar).
- Adicionar 8-10 tarefas com `dueDate < hoje` e status `IN_PROGRESS` (atrasadas pra demonstrar cor vermelha).
- Adicionar 3-5 tarefas IN_PROGRESS sem dueDate pra alimentar linha "Sem prazo".
- Spread os `completedAt` das tarefas concluídas em janela últimos 30d (pra alimentar throughput, % no prazo, tempo médio por etapa). Hoje muitas têm `completedAt: null` ou datas concentradas.

## Acessibilidade

- Grid do Gantt com `role="grid"`, cada linha de equipe com `role="row"` e label.
- Cada `<TaskBar />` envolto em `<a>` com `aria-label` descritivo.
- `WeekNavigator` com botões `aria-label="Semana anterior"` / `"Próxima semana"`.
- Selects de filtro com `<label>` associado.
- Cores nunca sozinhas — sempre acompanhadas de texto ("Atrasada há 2d").

## Loading / error / empty

- `loading.tsx` em ambas as rotas com skeleton do grid e cards.
- `error.tsx` herda de `app/[locale]/(protected)/reports/error.tsx` (já existe).
- Empty state quando filtros retornam zero:
  - Gantt: "Nenhuma tarefa nessa semana com esses filtros. [Limpar filtros]"
  - Produtividade: "Nenhuma tarefa concluída nesse período."

## Testes

`__tests__/lib/actions/reporting.test.ts` (novo):

- 1 teste de auth path (rejeita MEMBER/VIEWER)
- 1 teste de `getOnTimeRate` mockando `prisma.task.findMany` com tarefas
  conhecidas (3 no prazo, 1 atrasada, 1 sem dueDate) → espera 75% (denom = 4)
- 1 teste de `weekRangeFromMonday` com edge case 31/dez → 1/jan
- 1 teste de `parseWeekParam` aceitando undefined / inválido / válido

`__tests__/lib/dates.test.ts` (novo) — helpers de data puros.

E2E: adicionar ao `e2e/smoke.spec.ts` um teste que `/reports/calendar` redireciona
pra signin quando deslogado (mesmo padrão dos existentes).

## Performance

- Gantt: 1 query Prisma só, paginação não necessária (semana tem ~50 tarefas
  no máximo realista no piloto).
- Produtividade: 4 queries paralelas via `Promise.all` no `page.tsx`, cada
  widget renderiza no seu Suspense boundary.
- Sem cache adicional. Usa default `revalidate` do App Router (dinâmico, por
  conta dos searchParams).

## Riscos e mitigações

- **Múltiplas etapas ativas (fork) confundem a atribuição de equipe** — mitigação:
  `primaryStage = primeira ACTIVE`; "+N" badge mostra que tem mais; em casos
  raros a tarefa pode aparecer só na linha de uma equipe. Aceitar trade-off no
  MVP.
- **Tempo médio por etapa com `sampleSize` baixo distorce** — filtrar
  `sampleSize >= 3`, mostrar "Amostra insuficiente" pras outras.
- **Fuso horário** — todas as comparações de "hoje", "semana", "atrasada" usam
  `America/Sao_Paulo`. Sem `date-fns-tz`: helper `nowInSaoPaulo()` em
  `lib/dates.ts` que aplica offset fixo `-03:00` (Brasil não tem mais horário
  de verão). Documentar essa premissa no JSDoc do helper. Se a hospedagem
  trocar pra um TZ que liga DST de novo, trocar pra `Intl.DateTimeFormat` com
  `timeZone: 'America/Sao_Paulo'`.

## Fora de escopo (próximos passos)

- SLA por etapa (campo `expectedDuration`) + métricas baseadas nele
- Drag-and-drop pra reagendar
- Export CSV/PDF
- Notificações de "tarefa atrasada"
- Relatório individual por colaborador (página dedicada)

## Arquivos a tocar

```
NOVO:
  app/[locale]/(protected)/reports/calendar/page.tsx
  app/[locale]/(protected)/reports/calendar/loading.tsx
  app/[locale]/(protected)/reports/calendar/WeekNavigator.tsx
  app/[locale]/(protected)/reports/calendar/CalendarFiltersBar.tsx
  app/[locale]/(protected)/reports/team-productivity/page.tsx
  app/[locale]/(protected)/reports/team-productivity/loading.tsx
  app/[locale]/(protected)/reports/team-productivity/PeriodSelector.tsx
  components/reports/calendar/CalendarGrid.tsx
  components/reports/calendar/TaskBar.tsx
  components/reports/calendar/weekRange.ts
  components/reports/team-productivity/OnTimeRateCard.tsx
  components/reports/team-productivity/ThroughputTable.tsx
  components/reports/team-productivity/CurrentLoadGrid.tsx
  components/reports/team-productivity/StageDurationTable.tsx
  lib/dates.ts
  locales/pt-BR/reportsCalendar.json
  locales/pt-BR/reportsTeam.json
  locales/es-ES/reportsCalendar.json
  locales/es-ES/reportsTeam.json
  __tests__/lib/actions/reporting.test.ts
  __tests__/lib/dates.test.ts

MODIFICADO:
  lib/actions/reporting.ts                              (adiciona 4 funções + getCalendarTasks)
  lib/i18n.ts                                           (carrega novos namespaces)
  locales/pt-BR/reports.json + locales/es-ES/reports.json (entries pros 2 cards novos no index)
  app/[locale]/(protected)/reports/page.tsx             (2 cards novos)
  prisma/demo-seed.ts                                   (ajustes de distribuição)
  e2e/smoke.spec.ts                                     (1 teste de redirect)
```

## Verificação

```bash
pnpm tsc --noEmit          # zero erros
pnpm test                  # 79+ passando (+ ~4 novos)
pnpm demo:reset && pnpm demo:seed
pnpm dev
# - logar como admin
# - visitar /reports/calendar → ver Gantt da semana com 3+ equipes
# - navegar pra semana anterior, próxima
# - aplicar filtro de equipe, ver que outras somem
# - togglear "Mostrar concluídas", ver barras cinzas aparecerem
# - clicar barra → ir pra /tasks/<id>
# - visitar /reports/team-productivity → ver 4 widgets carregando via Suspense
# - mudar período pra "30d", ver métricas mudarem
# - tentar acessar /reports/calendar como MEMBER → redirect/403
```
