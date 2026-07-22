# Previsão por classe (reference-class forecasting) — Design

**Subsistema 1 de 3** do tema "Previsibilidade e qualidade em trabalho criativo".
Os outros dois (Qualidade & retrabalho; Visão de pessoas) terão specs próprios.

**Fundamentação:** [pesquisa-medicao-desempenho-criativo.md](../../pesquisa-medicao-desempenho-criativo.md)
(Flyvbjerg/Kahneman — reference-class forecasting; Vacanti — Monte Carlo/percentis;
Austin — medição informacional vs. motivacional).

## Objetivo

Dar previsibilidade ancorada no **histórico do tipo de trabalho** (template):
ao criar uma tarefa, mostrar se o prazo escolhido é viável frente à distribuição
de tarefas semelhantes passadas; e segmentar os relatórios de fluxo por tipo.
Tudo **informacional** — nunca nota, score ou ranking individual.

## Princípios inegociáveis (do estado-da-arte)

- **Outside view:** posicionar a tarefa na distribuição empírica da sua classe
  (tipo), não estimar a tarefa específica bottom-up.
- **Segmentar por classe:** arte, LP e vídeo têm distribuições distintas; um
  número global é enganoso.
- **Percentil = tolerância a risco:** p50 (mediana) vs p85 (compromisso confiável).
- **Informacional, não motivacional:** o sinal informa e não bloqueia; jamais
  vira score de pessoa. Experiência do executor fica **fora do v1** (é v2, e mesmo
  lá entra como _largura de banda_, não nota).

## Escopo v1

Incluído:

1. Modelo: `Task.workflowTemplateId` (dimensão "tipo" consultável).
2. Percentis/forecast segmentáveis por tipo.
3. Checagem de viabilidade ao vivo no formulário de criação.
4. Seletor de tipo no `/reports/performance`.

Explicitamente FORA:

- Experiência do executor como largura de banda → **v2**.
- Classe por cliente/etapa → refinamento futuro.
- Qualquer score composto, ranking, leaderboard ou vínculo a remuneração → **nunca**.

---

## Arquitetura

### Decisão: desnormalizar `Task.workflowTemplateId` (opção A)

Hoje o tipo de uma tarefa é indireto: `Task → TaskActiveStage → TemplateStage →
templateId`. Toda tarefa instancia **um único** template (o `createTaskStages`
cria todas as etapas de um só `templateId`; reversão/avanço não misturam
templates), então o tipo é bem-definido.

Desnormalizamos numa coluna `Task.workflowTemplateId` (aditiva, nullable) porque:

- É uma dimensão que consultamos e **agrupamos** o tempo todo → merece `GROUP BY`
  indexado, não join-através-de-etapas em cada agregação.
- O argumento clássico contra desnormalizar (campo desatualizar) **não se aplica**:
  o template é fixo na criação e nunca muda.

Alternativa considerada (B, derivar por join): sem migração, mas agrupar-por-tipo
vira código de aplicação em vez de `GROUP BY`. Rejeitada em favor da clareza/índice.

### Componente 1 — Modelo de dados

`prisma/schema.prisma` — `model Task`:

```prisma
  // Tipo de trabalho: o template que a tarefa instancia. Denormalizado (fixo na
  // criação) para permitir agregação/segmentação por tipo (reference-class
  // forecasting). Nullable só por causa do backfill de dados antigos.
  workflowTemplateId String?
  workflowTemplate   WorkflowTemplate? @relation(fields: [workflowTemplateId], references: [id], onDelete: SetNull)
```

`model WorkflowTemplate` ganha a relação inversa `tasks Task[]`.

Índice: `@@index([workflowTemplateId, completedAt])` (agregação de tarefas
concluídas por tipo).

**Migração** `add_task_workflow_template`:

- `ALTER TABLE "Task" ADD COLUMN "workflowTemplateId" TEXT;`
- FK para `WorkflowTemplate(id)` `ON DELETE SET NULL`.
- Índice `(workflowTemplateId, completedAt)`.
- **Backfill:** cada tarefa recebe o `templateId` de qualquer uma de suas etapas:
  ```sql
  UPDATE "Task" SET "workflowTemplateId" = sub."templateId"
  FROM (
    SELECT DISTINCT ON (tas."taskId") tas."taskId", ts."templateId"
    FROM "TaskActiveStage" tas
    JOIN "TemplateStage" ts ON ts.id = tas."stageId"
  ) sub
  WHERE "Task".id = sub."taskId";
  ```

**Escrita na criação:** `createTask` e `createTasksForProjects` já têm `templateId`
em escopo — passam `workflowTemplateId: templateId` no `task.create`.

### Componente 2 — Distribuição da classe (percentis/forecast por tipo)

`lib/actions/reporting.ts` — `PerformanceFilters` já tem `templateId`. Aplicá-lo
onde ainda não é honrado (as funções por-etapa — avg time, rework, flow
efficiency, CFD — já filtram via `stageFilter.templateId`; falta o caminho
task-level):

- `buildLeadTimeWhere`: `if (filters.templateId) where.workflowTemplateId = filters.templateId;`
  → cobre `getCycleTimePercentiles`, `dailyThroughputSamples` (logo
  `getThroughputSeries` e as conclusões do `getDeliveryForecast`).
- `buildOpenTaskWhere`: mesma linha → o backlog do `getDeliveryForecast`.
- `getFlowCfdSeries` já usa `stageFilter.templateId` — nada a fazer.

Resultado: um único `templateId` na query segmenta todas as seções de forma
coerente (por-etapa via `stageFilter`, task-level via `workflowTemplateId` — o
mesmo template nas duas).

- **Cold-start:** `getCycleTimePercentiles` já retorna `count`. Adicionar
  `lowConfidence: count < MIN_CLASS_SAMPLES` (const `MIN_CLASS_SAMPLES = 8`). A UI
  mostra os percentis com aviso quando `lowConfidence` (não esconde — decisão do
  usuário).
- Nova server action leve para a criação:
  ```ts
  export async function getTypeForecast(templateId: string): Promise<{
    p50: number;
    p85: number;
    p95: number;
    count: number;
    lowConfidence: boolean;
  }>;
  ```
  (percentis de cycle time em dias das tarefas concluídas daquele template; sem
  os `points` do scatter — payload mínimo).

### Componente 3 — Checagem de viabilidade na criação (ao vivo, informacional)

No formulário de criação (`CreateTaskForm`, client):

- Ao ter **template selecionado + dueDate**, chamar `getTypeForecast(templateId)`
  (debounce ao trocar template; recomputar veredito ao trocar a data sem refetch).
- Helper puro `lib/forecast-feasibility.ts`:
  ```ts
  export type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown";
  export function assessFeasibility(daysAvailable: number, p50: number, p85: number): Feasibility;
  // daysAvailable >= p85 → comfortable; p50..p85 → tight; < p50 → atRisk.
  // count 0 / sem dueDate → unknown.
  export function idealStartOffsetDays(p85: number): number; // = p85 (dias antes do dueDate)
  ```
- Exibição inline (não bloqueia salvar):
  - 🟢 confortável · 🟡 apertado · 🔴 em risco, com os números:
    "Artes deste tipo: p50 4d · **p85 9d** (base 32). Você tem 6 dias."
  - Se `dueDate − p85 < hoje` → acrescenta "início ideal era DD/MM (há Xd)".
  - Se `lowConfidence` → prefixo "base pequena (N=x) — confiança baixa".
  - `unknown` (sem base/sem data) → não mostra veredito.

### Componente 4 — Segmentação no relatório

`/reports/performance`:

- Adicionar um **seletor de tipo** (lista de `WorkflowTemplate`) ao `ReportFilterBar`
  ou como campo próprio, escrevendo `templateId` na query string.
- `parseReportFilters` já lê `templateId`? Se não, incluir. As seções existentes
  (cycle time, forecast, throughput, CFD, eficiência de fluxo) passam a refletir
  o tipo selecionado automaticamente (herdam o `filters.templateId`).

---

## i18n

Namespace `reportsPerformance` (e o namespace do form de criação):

- `cycleTime.lowConfidence` ("base pequena (N={count}) — confiança baixa")
- `create.feasibility.{comfortable,tight,atRisk}` + `create.feasibility.summary`
  ("{type}: p50 {p50}d · p85 {p85}d (base {count})") + `create.feasibility.idealStart`
  ("início ideal era {date} (há {days}d)")
- `filters.type` (rótulo do seletor de tipo)

pt-BR + es-ES, sob o guard de paridade.

## Testes

Puros (sem DB):

- `assessFeasibility` — fronteiras p50/p85, unknown, daysAvailable negativo.
- `idealStartOffsetDays`.
- Reuso de `percentile` (já testado).

Lógica de dados (mock Prisma):

- `getTypeForecast` — cálculo por template, `lowConfidence` no limiar.
- `buildLeadTimeWhere` com `templateId`.

## Verificação

`tsc --noEmit` 0 · `vitest` (novos + regressão) · `next build` limpo · paridade
i18n · migração aditiva aplicável (`prisma migrate deploy`). Sem mudança de
comportamento existente — tudo aditivo/informacional.

## Pendências / próximos subsistemas

- **v2 deste subsistema:** experiência do executor como largura de banda
  (percentil mais conservador p/ quem tem pouco histórico no tipo).
- **Subsistema 2:** Qualidade & retrabalho (evento de aprovação + atribuição à etapa).
- **Subsistema 3:** Visão de pessoas (painel pessoal auto-referenciado + 4 lentes).
