# Previsão por classe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Previsibilidade por reference-class forecasting: previsão de cycle time segmentada por tipo de trabalho (template) e checagem de viabilidade ao vivo na criação da tarefa — informacional, nunca nota individual.

**Architecture:** Desnormalizar `Task.workflowTemplateId` (tipo consultável). Estender os relatórios existentes (percentis/Monte Carlo já prontos) para filtrar por tipo. Nova server action leve `getTypeForecast` + helper puro de viabilidade consumido no `CreateTaskForm`.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma/Postgres, next-intl (pt-BR/es-ES), Vitest.

## Global Constraints

- **Informacional, nunca motivacional:** nenhum sinal deste plano bloqueia ações, vira score composto, ranking ou vínculo a pagamento (princípio de Austin).
- **Aditivo:** nenhuma mudança de comportamento existente; migração aditiva/nullable.
- **i18n:** toda string via `t()`, pt-BR + es-ES em paridade (guard `__tests__/i18n/locale-parity.test.ts`).
- **Gates por tarefa:** `npx tsc --noEmit` 0 erros; `npx vitest run` verde; `npx next build` limpo quando a tarefa toca UI/rotas.
- **`getCycleTimePercentiles` já retorna** `{ count, p50, p85, p95, points }`; `lib/stats.percentile(values, p)` já existe e é testado.
- **`reporting.ts` tem `"use server"`** — só exporta async functions (server actions).

---

### Task 1: Helper puro de viabilidade (`lib/forecast-feasibility.ts`)

**Files:**

- Create: `lib/forecast-feasibility.ts`
- Test: `__tests__/lib/forecast-feasibility.test.ts`

**Interfaces:**

- Produces: `type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown"`; `assessFeasibility(daysAvailable: number, p50: number, p85: number): Feasibility`; `idealStartOffsetDays(p85: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/forecast-feasibility.test.ts
import { describe, it, expect } from "vitest";
import { assessFeasibility, idealStartOffsetDays } from "@/lib/forecast-feasibility";

describe("assessFeasibility", () => {
  it("unknown when no class data (p85 <= 0)", () => {
    expect(assessFeasibility(10, 0, 0)).toBe("unknown");
  });
  it("comfortable when days available >= p85", () => {
    expect(assessFeasibility(9, 4, 9)).toBe("comfortable");
    expect(assessFeasibility(12, 4, 9)).toBe("comfortable");
  });
  it("tight between p50 and p85", () => {
    expect(assessFeasibility(6, 4, 9)).toBe("tight");
    expect(assessFeasibility(4, 4, 9)).toBe("tight"); // exactly p50
  });
  it("atRisk below p50 (incl. past-due negative days)", () => {
    expect(assessFeasibility(3, 4, 9)).toBe("atRisk");
    expect(assessFeasibility(-2, 4, 9)).toBe("atRisk");
  });
});

describe("idealStartOffsetDays", () => {
  it("rounds p85 up, floored at 0", () => {
    expect(idealStartOffsetDays(8.2)).toBe(9);
    expect(idealStartOffsetDays(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/forecast-feasibility.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forecast-feasibility.ts
// Pure feasibility check for reference-class forecasting: compares the days
// AVAILABLE until a chosen due date against the class (work-type) distribution.
// Informational only — never a score. Verdict tiers mirror the p50/p85 percentiles.

export type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown";

/**
 * `daysAvailable` = dueDate − today (may be negative if past due). p50/p85 are
 * the class cycle-time percentiles in days. `unknown` when the class has no
 * usable distribution (p85 <= 0).
 *   available >= p85 → comfortable · available >= p50 → tight · else → atRisk
 */
export function assessFeasibility(daysAvailable: number, p50: number, p85: number): Feasibility {
  if (p85 <= 0) return "unknown";
  if (daysAvailable >= p85) return "comfortable";
  if (daysAvailable >= p50) return "tight";
  return "atRisk";
}

/** Days before the due date the work would ideally start to hit p85. */
export function idealStartOffsetDays(p85: number): number {
  return Math.max(0, Math.ceil(p85));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/forecast-feasibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forecast-feasibility.ts __tests__/lib/forecast-feasibility.test.ts
git commit -m "feat(forecast): helper puro de viabilidade por classe (P1.T1)"
```

---

### Task 2: Schema `Task.workflowTemplateId` + migração + escrita na criação

**Files:**

- Modify: `prisma/schema.prisma` (models `Task`, `WorkflowTemplate`)
- Create: `prisma/migrations/20260722160000_add_task_workflow_template/migration.sql`
- Modify: `lib/actions/task.ts:82-92` (createTask) e `lib/actions/task.ts:155-165` (createTasksForProjects)

**Interfaces:**

- Produces: coluna/relação `Task.workflowTemplateId` consultável e escrita na criação.

- [ ] **Step 1: Editar o schema**

Em `model Task`, após `activityLogs`/`stageTransitions`:

```prisma
  // Tipo de trabalho: o template que a tarefa instancia. Denormalizado (fixo na
  // criação) p/ agregação/segmentação por tipo (reference-class forecasting).
  // Nullable só por causa do backfill de dados antigos.
  workflowTemplateId String?
  workflowTemplate   WorkflowTemplate? @relation(fields: [workflowTemplateId], references: [id], onDelete: SetNull)

  @@index([workflowTemplateId, completedAt])
```

Em `model WorkflowTemplate`, adicionar a relação inversa:

```prisma
  tasks Task[]
```

- [ ] **Step 2: Criar a migração**

```sql
-- prisma/migrations/20260722160000_add_task_workflow_template/migration.sql
-- Denormaliza o tipo de trabalho (template) no Task, para reference-class forecasting.

ALTER TABLE "Task" ADD COLUMN "workflowTemplateId" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_workflowTemplateId_fkey"
  FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_workflowTemplateId_completedAt_idx"
  ON "Task"("workflowTemplateId", "completedAt");

-- Backfill: cada tarefa herda o templateId de qualquer uma de suas etapas
-- (todas as etapas de uma tarefa pertencem a um único template).
UPDATE "Task" SET "workflowTemplateId" = sub."templateId"
FROM (
  SELECT DISTINCT ON (tas."taskId") tas."taskId", ts."templateId"
  FROM "TaskActiveStage" tas
  JOIN "TemplateStage" ts ON ts.id = tas."stageId"
) sub
WHERE "Task".id = sub."taskId";
```

- [ ] **Step 3: Regenerar o client**

Run: `npx prisma generate`
Expected: sucesso, tipos incluem `workflowTemplateId`.

- [ ] **Step 4: Escrever o campo na criação**

Em `lib/actions/task.ts` `createTask`, no `tx.task.create` (linha ~82), adicionar ao `data`:

```ts
        projectId,
        assigneeId: null,
        workflowTemplateId: templateId,
```

Em `createTasksForProjects`, no `tx.task.create` (linha ~155), adicionar ao `data`:

```ts
        projectId,
        assigneeId: null,
        workflowTemplateId: input.templateId,
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: 0 erros.
Run: `npx vitest run` (regressão — nenhum teste deve quebrar)
Expected: verde.

> Nota: a escrita na criação é uma linha dentro de uma transação com auth; não há
> teste unitário puro viável. Cobertura por `tsc` + build + smoke manual (criar
> tarefa e conferir `workflowTemplateId` preenchido). A migração é validada por
> `prisma migrate deploy` no ambiente do usuário.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/actions/task.ts
git commit -m "feat(schema): Task.workflowTemplateId + backfill + escrita na criação (P1.T2)"
```

---

### Task 3: `reporting.ts` — filtro por tipo, `lowConfidence` e `getTypeForecast`

**Files:**

- Modify: `lib/actions/reporting.ts` (`buildLeadTimeWhere`, `buildOpenTaskWhere`, `CycleTimePercentiles`, `getCycleTimePercentiles`, + novo `getTypeForecast` e const `MIN_CLASS_SAMPLES`)
- Test: `__tests__/lib/actions/type-forecast.test.ts`

**Interfaces:**

- Consumes: `Task.workflowTemplateId` (Task 2); `percentile` (`lib/stats`).
- Produces: `getTypeForecast(templateId: string): Promise<{ p50: number; p85: number; p95: number; count: number; lowConfidence: boolean }>`; `CycleTimePercentiles` ganha `lowConfidence: boolean`; `MIN_CLASS_SAMPLES` exportado.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/actions/type-forecast.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { task: { findMany: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getTypeForecast, MIN_CLASS_SAMPLES } from "@/lib/actions/reporting";

const db = vi.mocked(prisma, true);
const daysAgo = (createdOffset: number, completedOffset: number) => ({
  createdAt: new Date(Date.now() - createdOffset * 8.64e7),
  completedAt: new Date(Date.now() - completedOffset * 8.64e7),
});

describe("getTypeForecast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty class → zeros + lowConfidence", async () => {
    db.task.findMany.mockResolvedValue([] as never);
    expect(await getTypeForecast("tpl")).toEqual({
      p50: 0,
      p85: 0,
      p95: 0,
      count: 0,
      lowConfidence: true,
    });
  });

  it("filters completed tasks by workflowTemplateId", async () => {
    db.task.findMany.mockResolvedValue([daysAgo(4, 0)] as never);
    await getTypeForecast("tplX");
    const arg = db.task.findMany.mock.calls[0][0];
    expect(arg.where.workflowTemplateId).toBe("tplX");
    expect(arg.where.completedAt).toEqual({ not: null });
  });

  it("computes day percentiles and flags lowConfidence under the threshold", async () => {
    // 3 tasks, each 4 days cycle → all percentiles ~4; 3 < MIN_CLASS_SAMPLES
    db.task.findMany.mockResolvedValue([daysAgo(4, 0), daysAgo(6, 2), daysAgo(5, 1)] as never);
    const r = await getTypeForecast("tpl");
    expect(r.count).toBe(3);
    expect(Math.round(r.p50)).toBe(4);
    expect(r.lowConfidence).toBe(MIN_CLASS_SAMPLES > 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/type-forecast.test.ts`
Expected: FAIL (`getTypeForecast`/`MIN_CLASS_SAMPLES` não existem).

- [ ] **Step 3: Implementar**

Em `lib/actions/reporting.ts`:

a) Import (topo, junto dos demais):

```ts
import { percentile } from "@/lib/stats";
```

(já importado — confirmar; se não, adicionar.)

b) `buildLeadTimeWhere` — antes do `return where;`:

```ts
if (filters.templateId) where.workflowTemplateId = filters.templateId;
```

c) `buildOpenTaskWhere` — antes do `return where;`:

```ts
if (filters.templateId) where.workflowTemplateId = filters.templateId;
```

d) Const + interface. Adicionar perto do topo da seção de performance:

```ts
export const MIN_CLASS_SAMPLES = 8;
```

Em `interface CycleTimePercentiles`, adicionar campo:

```ts
lowConfidence: boolean;
```

e) `getCycleTimePercentiles` — no early-return de lista vazia e no retorno final, incluir `lowConfidence`:

```ts
  // early return:
  return { count: 0, p50: 0, p85: 0, p95: 0, points: [], lowConfidence: true };
  // final return: adicionar
    lowConfidence: tasks.length < MIN_CLASS_SAMPLES,
```

f) Nova server action (após `getCycleTimePercentiles`):

```ts
/**
 * Lightweight reference-class forecast for ONE work type (template): cycle-time
 * percentiles (days) over that template's completed tasks. Powers the live
 * feasibility check on the task-creation form. Informational only.
 */
export async function getTypeForecast(templateId: string): Promise<{
  p50: number;
  p85: number;
  p95: number;
  count: number;
  lowConfidence: boolean;
}> {
  await requireManagerOrAdmin();
  if (!templateId) return { p50: 0, p85: 0, p95: 0, count: 0, lowConfidence: true };

  const tasks = await prisma.task.findMany({
    where: { workflowTemplateId: templateId, completedAt: { not: null } },
    select: { createdAt: true, completedAt: true },
  });
  if (tasks.length === 0) return { p50: 0, p85: 0, p95: 0, count: 0, lowConfidence: true };

  const days = tasks.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 8.64e7);
  return {
    p50: percentile(days, 0.5),
    p85: percentile(days, 0.85),
    p95: percentile(days, 0.95),
    count: tasks.length,
    lowConfidence: tasks.length < MIN_CLASS_SAMPLES,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/type-forecast.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar regressão + tipos**

Run: `npx tsc --noEmit` → 0 erros (nota: o novo campo `lowConfidence` em `CycleTimePercentiles` é consumido na Task 5; a página ainda compila pois só lê campos existentes).
Run: `npx vitest run` → verde.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/reporting.ts __tests__/lib/actions/type-forecast.test.ts
git commit -m "feat(reports): filtro por tipo, lowConfidence e getTypeForecast (P1.T3)"
```

---

### Task 4: Viabilidade ao vivo no `CreateTaskForm` + i18n

**Files:**

- Modify: `components/tasks/CreateTaskForm.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`

**Interfaces:**

- Consumes: `getTypeForecast` (Task 3); `assessFeasibility`, `idealStartOffsetDays` (Task 1).

- [ ] **Step 1: Adicionar estado + fetch + cálculo no `CreateTaskForm`**

Imports:

```ts
import { getTypeForecast } from "@/lib/actions/reporting";
import { assessFeasibility, idealStartOffsetDays } from "@/lib/forecast-feasibility";
import { useLocale } from "next-intl";
```

Estado (dentro do componente):

```ts
const locale = useLocale();
const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
const [dueDate, setDueDate] = useState<string>("");
const [forecast, setForecast] = useState<{
  p50: number;
  p85: number;
  count: number;
  lowConfidence: boolean;
} | null>(null);
```

Estender `handleTemplateChange` para também guardar o id e buscar o forecast:

```ts
const handleTemplateChange = (templateId: string) => {
  setSelectedTemplateId(templateId);
  if (!templateId) {
    setStagePreview([]);
    setForecast(null);
    return;
  }
  startPreviewTransition(async () => {
    const [stages, f] = await Promise.all([
      getTemplateStagePreview(templateId),
      getTypeForecast(templateId),
    ]);
    setStagePreview(stages);
    setForecast(f);
  });
};
```

Cálculo derivado (antes do `return`):

```ts
const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
const daysAvailable = dueDate
  ? Math.ceil((new Date(dueDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 8.64e7)
  : NaN;
const feasibility =
  forecast && forecast.count > 0 && dueDate
    ? assessFeasibility(daysAvailable, forecast.p50, forecast.p85)
    : "unknown";
const idealStart =
  forecast && forecast.p85 > 0 && dueDate
    ? new Date(new Date(dueDate).getTime() - idealStartOffsetDays(forecast.p85) * 8.64e7)
    : null;
const idealStartPassed = idealStart
  ? idealStart.getTime() < new Date().setHours(0, 0, 0, 0)
  : false;
const fmtDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" });
```

- [ ] **Step 2: Renderizar o bloco de viabilidade + tornar o dueDate controlado**

Trocar o input de data (linha ~265) para controlado:

```tsx
<Input
  type="date"
  id="dueDate"
  name="dueDate"
  value={dueDate}
  onChange={(e) => setDueDate(e.target.value)}
/>
```

Logo abaixo do input de data, adicionar o bloco (não bloqueia o submit):

```tsx
{
  feasibility !== "unknown" && selectedTemplate && forecast && (
    <div
      className={`mt-2 rounded-md border p-2 text-xs ${
        feasibility === "comfortable"
          ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
          : feasibility === "tight"
            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
      }`}
    >
      <span className="font-semibold">{t(`create.feasibility.${feasibility}`)}</span>{" "}
      {t("create.feasibility.summary", {
        type: selectedTemplate.name,
        p50: forecast.p50.toFixed(0),
        p85: forecast.p85.toFixed(0),
        count: forecast.count,
        days: Number.isFinite(daysAvailable) ? daysAvailable : 0,
      })}
      {forecast.lowConfidence && (
        <span className="block">
          {t("create.feasibility.lowConfidence", { count: forecast.count })}
        </span>
      )}
      {idealStartPassed && idealStart && (
        <span className="block">
          {t("create.feasibility.idealStart", { date: fmtDate.format(idealStart) })}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Adicionar chaves i18n (pt-BR e es-ES)**

Em `locales/pt-BR/tasks.json`, dentro de `create`:

```json
      "feasibility": {
        "comfortable": "Prazo confortável",
        "tight": "Prazo apertado",
        "atRisk": "Prazo em risco",
        "summary": "{type}: p50 {p50}d · p85 {p85}d (base {count}). Você tem {days}d.",
        "lowConfidence": "Base pequena (N={count}) — confiança baixa.",
        "idealStart": "Início ideal seria {date}."
      }
```

Em `locales/es-ES/tasks.json`, dentro de `create`:

```json
      "feasibility": {
        "comfortable": "Plazo cómodo",
        "tight": "Plazo ajustado",
        "atRisk": "Plazo en riesgo",
        "summary": "{type}: p50 {p50}d · p85 {p85}d (base {count}). Tienes {days}d.",
        "lowConfidence": "Base pequeña (N={count}) — confianza baja.",
        "idealStart": "El inicio ideal sería {date}."
      }
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run __tests__/i18n` → paridade 45/45 (ou o total vigente).
Run: `npx next build` → limpo.

> Nota: a lógica de decisão já é unit-testada na Task 1; a fiação de UI é validada
> por build + smoke manual (selecionar tipo + data e ver o veredito ao vivo).

- [ ] **Step 5: Commit**

```bash
git add components/tasks/CreateTaskForm.tsx locales/pt-BR/tasks.json locales/es-ES/tasks.json
git commit -m "feat(tasks): viabilidade de prazo ao vivo por classe na criação (P1.T4)"
```

---

### Task 5: Seletor de tipo no `/reports/performance` + `parseReportFilters` + `lowConfidence` no card

**Files:**

- Modify: `lib/reports/filters.ts` (`parseReportFilters` → incluir `templateId`)
- Modify: `components/reports/ReportFilterBar.tsx` (seletor de tipo opt-in)
- Modify: `app/[locale]/(protected)/reports/performance/page.tsx` (passar `templateId` + habilitar seletor + aviso lowConfidence no card de cycle time)
- Modify: `locales/pt-BR/reportsPerformance.json`, `locales/es-ES/reportsPerformance.json`
- Test: `__tests__/lib/reports/filters.test.ts`

**Interfaces:**

- Consumes: `filters.templateId` → `workflowTemplateId` (Task 3); `getTemplatesForSelect` (existente); `CycleTimePercentiles.lowConfidence` (Task 3).

- [ ] **Step 1: Write the failing test (parseReportFilters)**

```ts
// __tests__/lib/reports/filters.test.ts
import { describe, it, expect } from "vitest";
import { parseReportFilters } from "@/lib/reports/filters";

describe("parseReportFilters", () => {
  it("reads templateId when present", () => {
    const r = parseReportFilters({ templateId: "tpl1" });
    expect(r.templateId).toBe("tpl1");
    expect(r.hasFilters).toBe(true);
  });
  it("templateId undefined when absent or empty", () => {
    expect(parseReportFilters({}).templateId).toBeUndefined();
    expect(parseReportFilters({ templateId: "" }).templateId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/reports/filters.test.ts`
Expected: FAIL (`templateId` não existe no retorno).

- [ ] **Step 3: Implementar `parseReportFilters`**

Em `lib/reports/filters.ts`, dentro de `parseReportFilters`:

```ts
const templateId =
  typeof params.templateId === "string" && params.templateId ? params.templateId : undefined;
```

Incluir no `hasFilters`:

```ts
const hasFilters = Boolean(rawMonth || teamId || clientId || projectId || templateId);
```

Incluir no retorno:

```ts
return {
  rawMonth,
  monthStr,
  teamId,
  clientId,
  projectId,
  templateId,
  startDate,
  endDate,
  hasFilters,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/reports/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Seletor de tipo (opt-in) no `ReportFilterBar`**

Em `components/reports/ReportFilterBar.tsx`:

- Import: `import { getTemplatesForSelect } from "@/lib/actions/task";`
- Props: adicionar `templateId?: string;` e `includeTemplate?: boolean;`
- No `Promise.all`, buscar templates só quando pedido:

```ts
const [t, locale, teams, clients, projects, templates] = await Promise.all([
  getTranslations(namespace),
  getLocale(),
  getTeamsForFilter(),
  getClients(),
  getProjectsForSelect(),
  includeTemplate ? getTemplatesForSelect() : Promise.resolve([]),
]);
```

- No `key` do form, incluir `templateId`:

```tsx
          key={`${month}|${teamId ?? ""}|${clientId ?? ""}|${projectId ?? ""}|${templateId ?? ""}`}
```

- Após o bloco de `projectId`, renderizar o seletor de tipo quando `includeTemplate`:

```tsx
{
  includeTemplate && (
    <div className="min-w-[160px] flex-1">
      <label htmlFor="templateId" className="block text-sm font-semibold text-foreground mb-2">
        {t("filters.type")}
      </label>
      <select
        id="templateId"
        name="templateId"
        defaultValue={templateId ?? ""}
        className={SELECT_CLASS}
      >
        <option value="">{t("filters.allTypes")}</option>
        {templates.map((tp) => (
          <option key={tp.id} value={tp.id}>
            {tp.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 6: Ligar na página de performance + aviso lowConfidence**

Em `app/[locale]/(protected)/reports/performance/page.tsx`:

- `parseReportFilters` já é chamado; extrair `templateId`:

```ts
const { monthStr, teamId, clientId, projectId, templateId, startDate, endDate, hasFilters } =
  parseReportFilters(params);
```

- Incluir no objeto `filters`:

```ts
const filters: PerformanceFilters = { startDate, endDate, teamId, clientId, projectId, templateId };
```

- Passar props ao `ReportFilterBar`:

```tsx
<ReportFilterBar
  basePath="/reports/performance"
  namespace="reportsPerformance"
  months={months}
  month={monthStr}
  teamId={teamId}
  clientId={clientId}
  projectId={projectId}
  templateId={templateId}
  includeTemplate
  hasFilters={hasFilters}
/>
```

- No `CycleTimeSection`, quando `cycle.count > 0 && cycle.lowConfidence`, mostrar um aviso acima do grid de percentis:

```tsx
{
  cycle.lowConfidence && (
    <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
      {t("cycleTime.lowConfidence", { count: cycle.count })}
    </p>
  );
}
```

- [ ] **Step 7: Chaves i18n (pt-BR e es-ES)**

Em `locales/pt-BR/reportsPerformance.json`:

- em `filters`: `"type": "Tipo",` e `"allTypes": "Todos os tipos",`
- em `cycleTime`: `"lowConfidence": "Base pequena (N={count}) — confiança baixa.",`

Em `locales/es-ES/reportsPerformance.json`:

- em `filters`: `"type": "Tipo",` e `"allTypes": "Todos los tipos",`
- em `cycleTime`: `"lowConfidence": "Base pequeña (N={count}) — confianza baja.",`

> Verificado: `reportsPerformance` já tem o bloco `filters`; productivity usa
> namespace distinto (`reportsProductivity`), então essas chaves só afetam a
> página de performance. Paridade é por-namespace, logo basta adicioná-las em
> pt-BR e es-ES de `reportsPerformance`.

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run` → verde (inclui paridade i18n).
Run: `npx next build` → limpo.

- [ ] **Step 9: Commit**

```bash
git add lib/reports/filters.ts components/reports/ReportFilterBar.tsx "app/[locale]/(protected)/reports/performance/page.tsx" locales/pt-BR/reportsPerformance.json locales/es-ES/reportsPerformance.json __tests__/lib/reports/filters.test.ts
git commit -m "feat(reports): seletor de tipo + aviso de baixa confiança no /reports/performance (P1.T5)"
```

---

## Verificação final (whole-branch)

- `npx tsc --noEmit` 0 erros · `npx vitest run` verde · `npx next build` limpo · paridade i18n.
- Migração `20260722160000` pendente de `prisma migrate deploy` no ambiente do usuário.
- Smoke manual: (a) criar tarefa escolhendo tipo + data → veredito ao vivo; (b) `/reports/performance` com seletor de tipo segmentando as seções; (c) tipo com poucas conclusões → aviso de baixa confiança.

## Notas de escopo (fora deste plano)

- Experiência do executor como largura de banda → **v2** deste subsistema.
- Subsistema 2 (Qualidade & retrabalho) e 3 (Visão de pessoas) → specs próprios.
