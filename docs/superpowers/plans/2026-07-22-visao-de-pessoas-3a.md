# Visão de pessoas — 3a — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visão auto-referenciada de carga/entrega por pessoa — throughput, utilização e carga (WIP+envelhecendo) — no perfil admin (gestor) e no dashboard (a própria pessoa). Nunca comparativo, sem qualidade (é 3b), sem migração.

**Architecture:** Uma camada de dados por pessoa (`lib/actions/person-metrics.ts`) com guard `requireSelfOrManager`; fórmula de utilização extraída como helper puro (`utilizationRatio`) reutilizado por `getHoursByUser` e pela nova `getPersonUtilization`. Throughput visualizado reusando o `ThroughputLine` existente. Superfícies: `/admin/users/[userId]` e `/dashboard`.

**Tech Stack:** Next.js 15 (App Router, Server Components), Prisma/Postgres, next-intl (pt-BR/es-ES), Vitest.

## Global Constraints

- **Auto-referenciado, nunca comparativo (P1/P2):** nada ordena/rankeia pessoas; cada pessoa é vista isolada, contra o próprio histórico.
- **Acesso fail-closed (P1):** as funções por pessoa só retornam se o chamador é a própria pessoa OU manager/admin (`requireSelfOrManager`).
- **Sem qualidade (3a):** nenhuma métrica de qualidade/FTR/retrabalho por pessoa nesta fatia.
- **Informacional (P1/P7):** utilização é faixa **indicativa**; nada bloqueia; sem score/pay.
- **Aditivo, sem migração.** i18n: toda string via `t()`, pt-BR+es-ES em paridade (guard); es-ES real.
- **Gates por tarefa:** `npx tsc --noEmit` 0; `npx vitest run` verde; `npx next build` limpo quando toca UI/rotas.
- Nota: a suíte `__tests__/components/CreateTaskForm.smoke.test.tsx` falha no import (next-auth/pnpm/ESM, pré-existente) — ignorar; contar o resto.

---

### Task 1: `utilizationRatio` puro + refactor de `getHoursByUser` + guard `requireSelfOrManager`

**Files:**

- Modify: `lib/team-health-format.ts` (novo helper puro `utilizationRatio`)
- Modify: `lib/actions/reporting.ts` (`getHoursByUser` usa o helper)
- Modify: `lib/permissions.ts` (novo `requireSelfOrManager`)
- Test: `__tests__/lib/team-health-format.test.ts` (append), `__tests__/lib/permissions-self-or-manager.test.ts`

**Interfaces:**

- Produces: `utilizationRatio(hours, weeklyCapacityHours, periodWeeks): number | null`; `requireSelfOrManager(userId): Promise<user>` (throws se nem self nem manager/admin).

- [ ] **Step 1: Write the failing test (utilizationRatio)**

Append a `__tests__/lib/team-health-format.test.ts`:

```ts
import { utilizationRatio } from "@/lib/team-health-format";

describe("utilizationRatio", () => {
  it("hours ÷ (capacity × weeks)", () => {
    expect(utilizationRatio(60, 40, 2)).toBeCloseTo(0.75); // 60 / 80
  });
  it("null when no capacity, non-positive, or no period", () => {
    expect(utilizationRatio(10, null, 2)).toBeNull();
    expect(utilizationRatio(10, 0, 2)).toBeNull();
    expect(utilizationRatio(10, 40, null)).toBeNull();
    expect(utilizationRatio(10, 40, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run __tests__/lib/team-health-format.test.ts`
Expected: FAIL (`utilizationRatio` não existe).

- [ ] **Step 3: Implementar o helper**

Em `lib/team-health-format.ts`:

```ts
/** Utilização = horas ÷ (capacidade semanal × semanas do período). Null quando
 * não há meta de capacidade ou período válido — indefinido, não 0. Puro. */
export function utilizationRatio(
  hours: number,
  weeklyCapacityHours: number | null,
  periodWeeks: number | null
): number | null {
  if (!weeklyCapacityHours || weeklyCapacityHours <= 0 || !periodWeeks || periodWeeks <= 0) {
    return null;
  }
  return hours / (weeklyCapacityHours * periodWeeks);
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run __tests__/lib/team-health-format.test.ts` → PASS.

- [ ] **Step 5: Refactor `getHoursByUser` para usar o helper**

Em `lib/actions/reporting.ts`, no import de `@/lib/team-health-format` (adicionar `utilizationRatio`), e no laço que calcula utilização dentro de `getHoursByUser`, substituir a expressão inline pela chamada:

```ts
for (const row of Object.values(grouped)) {
  row.utilization = utilizationRatio(row.totalHours, row.weeklyCapacityHours, periodWeeks);
}
```

(remove o `if (row.weeklyCapacityHours && periodWeeks)` — o helper já retorna null nesses casos; `utilization` inicia `null`, então setar null é inócuo).

- [ ] **Step 6: Write the failing test (requireSelfOrManager)**

```ts
// __tests__/lib/permissions-self-or-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireSelfOrManager } from "@/lib/permissions";

const mockAuth = vi.mocked(auth);

describe("requireSelfOrManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the user themselves (any role)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    await expect(requireSelfOrManager("u1")).resolves.toMatchObject({ id: "u1" });
  });
  it("allows a manager/admin viewing someone else", async () => {
    mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
    await expect(requireSelfOrManager("u2")).resolves.toMatchObject({ id: "mgr" });
  });
  it("denies a member viewing someone else (fail-closed)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    await expect(requireSelfOrManager("u2")).rejects.toThrow(/Access Denied/i);
  });
});
```

- [ ] **Step 7: Run → fail**

Run: `npx vitest run __tests__/lib/permissions-self-or-manager.test.ts`
Expected: FAIL (`requireSelfOrManager` não existe).

- [ ] **Step 8: Implementar o guard**

Em `lib/permissions.ts`, após `requireManagerOrAdmin`:

```ts
/**
 * Permite acesso se o chamador é a PRÓPRIA pessoa (`userId`) OU manager/admin.
 * Fail-closed: lança se for outro membro. Base das métricas por pessoa (3a):
 * a pessoa vê o próprio dashboard; o gestor vê /admin/users/[id].
 */
export const requireSelfOrManager = async (userId: string) => {
  const user = await getSessionUser();
  if (user.id === userId) return user;
  return checkRole([UserRole.ADMIN, UserRole.MANAGER]);
};
```

- [ ] **Step 9: Run → pass + regressão**

Run: `npx vitest run __tests__/lib/permissions-self-or-manager.test.ts` → PASS.
Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run` → verde (os testes existentes de `getHoursByUser`/utilização devem continuar passando — a fórmula não mudou).

- [ ] **Step 10: Commit**

```bash
git add lib/team-health-format.ts lib/actions/reporting.ts lib/permissions.ts __tests__/lib/team-health-format.test.ts __tests__/lib/permissions-self-or-manager.test.ts
git commit -m "feat(people): utilizationRatio puro + requireSelfOrManager (3a.T1)"
```

---

### Task 2: `person-metrics` — throughput, workload, utilização por pessoa

**Files:**

- Create: `lib/actions/person-metrics.ts`
- Test: `__tests__/lib/actions/person-metrics.test.ts`

**Interfaces:**

- Consumes: `requireSelfOrManager` + `utilizationRatio` (Task 1); `stageAgingRatio` + `DEFAULT_SLA_HOURS`/`AGING_ALERT_RATIO` (existentes).
- Produces: `getPersonThroughputSeries(userId, weeks?)`, `getPersonWorkload(userId)`, `getPersonUtilization(userId, range)`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/actions/person-metrics.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireSelfOrManager: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { aggregate: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
} from "@/lib/actions/person-metrics";

const db = prisma as unknown as {
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  timeLog: { aggregate: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

describe("getPersonThroughputSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("buckets completed stages into weekly counts (length = weeks)", async () => {
    const DAY = 8.64e7;
    const now = Date.now();
    // one completion ~3 days ago (this week), one ~10 days ago (last week)
    db.taskActiveStage.findMany.mockResolvedValue([
      { completedAt: new Date(now - 3 * DAY) },
      { completedAt: new Date(now - 10 * DAY) },
    ]);
    const rows = await getPersonThroughputSeries("u1", 4);
    expect(rows).toHaveLength(4);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(2);
    // most recent bucket (last) has the 3-day-ago completion
    expect(rows[rows.length - 1].count).toBe(1);
  });
});

describe("getPersonWorkload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts WIP and aging (stageAgingRatio >= 1)", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    db.taskActiveStage.findMany.mockResolvedValue([
      { activatedAt: hoursAgo(100), stage: { expectedDurationHours: 24 } }, // ratio ~4 → aging
      { activatedAt: hoursAgo(1), stage: { expectedDurationHours: 72 } }, // fresh → not aging
    ]);
    expect(await getPersonWorkload("u1")).toEqual({ wip: 2, aging: 1 });
  });
});

describe("getPersonUtilization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes utilization via utilizationRatio; null capacity → null", async () => {
    const from = new Date(Date.now() - 14 * 8.64e7); // 2 weeks
    const to = new Date();
    db.timeLog.aggregate.mockResolvedValue({ _sum: { hoursSpent: 60 } });
    db.user.findUnique.mockResolvedValue({ weeklyCapacityHours: 40 });
    const r = await getPersonUtilization("u1", { from, to });
    expect(r.hours).toBe(60);
    expect(r.weeklyCapacityHours).toBe(40);
    expect(r.utilization).toBeCloseTo(0.75, 1); // 60 / (40*2)

    db.user.findUnique.mockResolvedValue({ weeklyCapacityHours: null });
    const r2 = await getPersonUtilization("u1", { from, to });
    expect(r2.utilization).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run __tests__/lib/actions/person-metrics.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/actions/person-metrics.ts
// Métricas de carga/entrega por pessoa, auto-referenciadas (nunca comparativas).
// NÃO "use server": consumidas por Server Components (perfil admin + dashboard).
// Fail-closed via requireSelfOrManager. SEM qualidade (é 3b).
import prisma from "@/lib/prisma";
import { requireSelfOrManager } from "@/lib/permissions";
import { stageAgingRatio, utilizationRatio } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS, AGING_ALERT_RATIO } from "@/lib/actions/team-health";

const DAY_MS = 8.64e7;

export interface ThroughputPoint {
  weekStart: string; // ISO
  count: number;
}

/** Conclusões da pessoa por semana (últimas `weeks`), bucketizadas por completedAt. */
export async function getPersonThroughputSeries(
  userId: string,
  weeks = 8
): Promise<ThroughputPoint[]> {
  await requireSelfOrManager(userId);
  const now = Date.now();
  const from = new Date(now - weeks * 7 * DAY_MS);
  const rows = await prisma.taskActiveStage.findMany({
    where: { assigneeId: userId, status: "COMPLETED", completedAt: { gte: from } },
    select: { completedAt: true },
  });
  const startDay = Math.floor(from.getTime() / DAY_MS);
  const buckets = new Array(weeks).fill(0);
  for (const r of rows) {
    if (!r.completedAt) continue;
    const idx = Math.floor((Math.floor(r.completedAt.getTime() / DAY_MS) - startDay) / 7);
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets.map((count, w) => ({
    weekStart: new Date((startDay + w * 7) * DAY_MS).toISOString(),
    count,
  }));
}

export interface PersonWorkload {
  wip: number;
  aging: number;
}

/** Carga atual: WIP (etapas ACTIVE atribuídas) + quantas passaram do SLA. */
export async function getPersonWorkload(userId: string): Promise<PersonWorkload> {
  await requireSelfOrManager(userId);
  const now = Date.now();
  const stages = await prisma.taskActiveStage.findMany({
    where: { assigneeId: userId, status: "ACTIVE" },
    select: { activatedAt: true, stage: { select: { expectedDurationHours: true } } },
  });
  let aging = 0;
  for (const s of stages) {
    const ratio = stageAgingRatio(
      s.activatedAt,
      s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      now
    );
    if (ratio >= AGING_ALERT_RATIO) aging++;
  }
  return { wip: stages.length, aging };
}

export interface PersonUtilization {
  hours: number;
  weeklyCapacityHours: number | null;
  utilization: number | null;
}

/** Utilização da pessoa no período (reusa utilizationRatio). Fail-closed. */
export async function getPersonUtilization(
  userId: string,
  range: { from: Date; to: Date }
): Promise<PersonUtilization> {
  await requireSelfOrManager(userId);
  const [agg, user] = await Promise.all([
    prisma.timeLog.aggregate({
      where: { userId, logDate: { gte: range.from, lte: range.to } },
      _sum: { hoursSpent: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyCapacityHours: true } }),
  ]);
  const hours = agg._sum.hoursSpent ?? 0;
  const periodWeeks = Math.max((range.to.getTime() - range.from.getTime()) / (7 * DAY_MS), 1 / 7);
  const weeklyCapacityHours = user?.weeklyCapacityHours ?? null;
  return {
    hours,
    weeklyCapacityHours,
    utilization: utilizationRatio(hours, weeklyCapacityHours, periodWeeks),
  };
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run __tests__/lib/actions/person-metrics.test.ts` → PASS.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → 0 erros. Run: `npx vitest run` → verde.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/person-metrics.ts __tests__/lib/actions/person-metrics.test.ts
git commit -m "feat(people): person-metrics (throughput/workload/utilização) fail-closed (3a.T2)"
```

---

### Task 3: `/admin/users/[userId]` — cards de throughput + utilização + envelhecendo

**Files:**

- Modify: `app/[locale]/(protected)/admin/users/[userId]/page.tsx`
- Modify: `locales/pt-BR/admin.json`, `locales/es-ES/admin.json`

**Interfaces:**

- Consumes: `getPersonThroughputSeries`, `getPersonWorkload`, `getPersonUtilization` (Task 2); `ThroughputLine` (`@/components/reports/FlowCharts`); `monthRangeSaoPaulo`/`currentMonthSaoPaulo` (`@/lib/dates`).

- [ ] **Step 1: Buscar os dados na página**

No `Promise.all` inicial de `UserDetailPage` (ou logo após, mantendo o `userId`), adicionar:

```ts
const { start: monthStart, end: monthEnd } = monthRangeSaoPaulo(currentMonthSaoPaulo());
const [throughput, workload, util] = await Promise.all([
  getPersonThroughputSeries(userId, 8),
  getPersonWorkload(userId),
  getPersonUtilization(userId, { from: monthStart, to: monthEnd }),
]);
```

(imports: `getPersonThroughputSeries, getPersonWorkload, getPersonUtilization` de `@/lib/actions/person-metrics`; `ThroughputLine` de `@/components/reports/FlowCharts`; `monthRangeSaoPaulo, currentMonthSaoPaulo` de `@/lib/dates`.)

- [ ] **Step 2: Renderizar os cards (após a linha de StatCards existente, ~linha 122)**

```tsx
{
  /* Throughput + Utilização (auto-referenciado) */
}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
  <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
    <h2 className="text-lg font-bold text-foreground mb-1">{t("throughputTitle")}</h2>
    <p className="text-xs text-muted-foreground mb-3">{t("selfReferencedNote")}</p>
    {throughput.some((p) => p.count > 0) ? (
      <ThroughputLine points={throughput} label={t("throughputTitle")} />
    ) : (
      <p className="text-sm text-muted-foreground">{t("throughputEmpty")}</p>
    )}
    <p className="mt-2 text-xs text-muted-foreground">
      {t("agingNote", { aging: workload.aging, wip: workload.wip })}
    </p>
  </div>
  <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
    <h2 className="text-lg font-bold text-foreground mb-1">{t("utilizationTitle")}</h2>
    {util.weeklyCapacityHours == null ? (
      <p className="text-sm text-muted-foreground">{t("utilizationNoTarget")}</p>
    ) : (
      (() => {
        const pct = Math.round((util.utilization ?? 0) * 100);
        const tone =
          pct > 90
            ? "text-rose-600 dark:text-rose-400"
            : pct >= 60
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400";
        return (
          <>
            <p className={`text-3xl font-bold ${tone}`}>{pct}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("utilizationDetail", {
                hours: util.hours.toFixed(1),
                capacity: util.weeklyCapacityHours,
              })}
            </p>
          </>
        );
      })()
    )}
  </div>
</div>;
```

- [ ] **Step 3: i18n em `admin.json` → `users.detail`**

pt-BR:

```json
        "throughputTitle": "Throughput (últimas 8 semanas)",
        "selfReferencedNote": "Evolução da própria pessoa — não comparado com colegas.",
        "throughputEmpty": "Sem conclusões no período.",
        "agingNote": "{aging} de {wip} etapas ativas envelhecendo.",
        "utilizationTitle": "Utilização (mês atual)",
        "utilizationNoTarget": "Sem meta de capacidade definida.",
        "utilizationDetail": "{hours}h de {capacity}h/semana previstas"
```

es-ES:

```json
        "throughputTitle": "Throughput (últimas 8 semanas)",
        "selfReferencedNote": "Evolución de la propia persona — no comparado con colegas.",
        "throughputEmpty": "Sin conclusiones en el período.",
        "agingNote": "{aging} de {wip} etapas activas envejeciendo.",
        "utilizationTitle": "Utilización (mes actual)",
        "utilizationNoTarget": "Sin meta de capacidad definida.",
        "utilizationDetail": "{hours}h de {capacity}h/semana previstas"
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → 0. Run: `npx vitest run __tests__/i18n` → paridade verde. Run: `npx next build` → limpo (se stale, `rm -rf .next`).

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/admin/users/[userId]/page.tsx" locales/pt-BR/admin.json locales/es-ES/admin.json
git commit -m "feat(admin): throughput + utilização + envelhecendo no perfil do usuário (3a.T3)"
```

---

### Task 4: `/dashboard` — widget "Minha evolução" (privado)

**Files:**

- Create: `components/dashboard/MyGrowthWidget.tsx`
- Modify: `app/[locale]/(protected)/dashboard/page.tsx`
- Modify: `locales/pt-BR/dashboard.json`, `locales/es-ES/dashboard.json`

**Interfaces:**

- Consumes: `getPersonThroughputSeries`, `getPersonWorkload`, `getPersonUtilization` (Task 2); `ThroughputLine`; date helpers.

- [ ] **Step 1: Criar o widget (Server Component)**

```tsx
// components/dashboard/MyGrowthWidget.tsx
import { getTranslations } from "next-intl/server";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
} from "@/lib/actions/person-metrics";
import { ThroughputLine } from "@/components/reports/FlowCharts";
import { monthRangeSaoPaulo, currentMonthSaoPaulo } from "@/lib/dates";

export async function MyGrowthWidget({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard.growth");
  const { start, end } = monthRangeSaoPaulo(currentMonthSaoPaulo());
  const [throughput, workload, util] = await Promise.all([
    getPersonThroughputSeries(userId, 8),
    getPersonWorkload(userId),
    getPersonUtilization(userId, { from: start, to: end }),
  ]);
  const pct = util.utilization == null ? null : Math.round(util.utilization * 100);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t("selfReferencedNote")}</p>
      {throughput.some((p) => p.count > 0) ? (
        <ThroughputLine points={throughput} label={t("title")} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("throughputEmpty")}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="text-muted-foreground">
          {t("wip", { wip: workload.wip, aging: workload.aging })}
        </span>
        <span className="text-muted-foreground">
          {pct == null ? t("utilizationNoTarget") : t("utilization", { pct })}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar no dashboard**

Em `app/[locale]/(protected)/dashboard/page.tsx`, dentro do bloco de widgets (`<div className="space-y-8">`), adicionar antes ou depois de `MyActiveStagesWidget`:

```tsx
<Suspense fallback={<TableSkeleton rows={2} />}>
  <MyGrowthWidget userId={userId} />
</Suspense>
```

(import: `import { MyGrowthWidget } from "@/components/dashboard/MyGrowthWidget";`)

- [ ] **Step 3: i18n em `dashboard.json` → `growth`**

pt-BR:

```json
  "growth": {
    "title": "Minha evolução",
    "selfReferencedNote": "Sua entrega ao longo do tempo — comparada só com o seu próprio histórico.",
    "throughputEmpty": "Sem conclusões recentes.",
    "wip": "{wip} ativas · {aging} envelhecendo",
    "utilization": "{pct}% de utilização",
    "utilizationNoTarget": "Sem meta de capacidade"
  }
```

es-ES:

```json
  "growth": {
    "title": "Mi evolución",
    "selfReferencedNote": "Tu entrega a lo largo del tiempo — comparada solo con tu propio historial.",
    "throughputEmpty": "Sin conclusiones recientes.",
    "wip": "{wip} activas · {aging} envejeciendo",
    "utilization": "{pct}% de utilización",
    "utilizationNoTarget": "Sin meta de capacidad"
  }
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → verde (paridade incl.). Run: `npx next build` → limpo.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/MyGrowthWidget.tsx "app/[locale]/(protected)/dashboard/page.tsx" locales/pt-BR/dashboard.json locales/es-ES/dashboard.json
git commit -m "feat(dashboard): widget Minha evolução (throughput/utilização/carga, privado) (3a.T4)"
```

---

## Verificação final (whole-branch)

- `tsc` 0 · `vitest` verde · `next build` limpo · paridade i18n · **sem migração**.
- Smoke manual: (a) `/admin/users/[id]` como manager → cards de throughput/utilização/envelhecendo; (b) `/dashboard` como member → "Minha evolução" só do próprio; (c) confirmar que um member NÃO acessa dados de outro (fail-closed).

## Notas de escopo (fora deste plano)

- **3b:** qualidade por pessoa (FTR defeito-only) + `reworkClass` + reclassificação + registro da exceção a P2 na biblioteca.
- Cycle time por pessoa → refinamento futuro.
