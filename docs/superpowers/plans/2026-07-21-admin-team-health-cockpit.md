# Admin Team-Health Cockpit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a management cockpit to the admin home surfacing three actionable signals — per-person load, aging work, and blocked work — scoped to the manager's teams.

**Architecture:** A new server-only data module `lib/actions/team-health.ts` exposes three functions (`getTeamMemberLoad`, `getAgingStages`, `getBlockedStages`), each `requireManagerOrAdmin()` and team-scoped. Three async Server Components render each signal, mounted above the existing counters in `admin/page.tsx` behind `<Suspense>`. All display logic that carries branching lives in small pure helpers that are unit-tested; the data functions are unit-tested with mocked Prisma/auth; the async JSX shells are verified by build + manual smoke.

**Tech Stack:** Next.js 15 App Router (Server Components), Prisma, next-intl, Tailwind, Vitest.

## Global Constraints

- Prisma import: `import prisma from "@/lib/prisma"` (default export; the module also exports a named `prisma`). — verbatim from existing `lib/actions/reporting.ts:4`.
- RBAC: every exported data function starts with `await requireManagerOrAdmin()` from `@/lib/permissions`. Unauthenticated → throws `"Not Authenticated"`; wrong role → throws `"Access Denied: Insufficient permissions."`.
- i18n: no hardcoded user-facing strings — use `getTranslations("admin.health")`; keep `locales/pt-BR/admin.json` and `locales/es-ES/admin.json` in perfect key parity (enforced by `__tests__/i18n/locale-parity.test.ts`); es-ES must be real Spanish, never `ç/ã/õ/-ção`.
- Constants (declared once in `lib/actions/team-health.ts`): `OVERLOAD_CEILING = 8`, `OVERLOAD_MARGIN = 3`, `IDLE_THRESHOLD = 1`, `DEFAULT_SLA_HOURS = 72`, `AGING_ALERT_RATIO = 1.0`, `QUEUE_LIMIT = 6`.
- Test command: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Never run `next build` inside a task except Task 8.
- Blocked severity uses `activatedAt` as a proxy (no `blockedAt` column exists); precise blocked-duration is Phase 2 (out of scope).

---

### Task 1: Module scaffold — constants, types, `median`, `resolveTeamIds`

**Files:**

- Create: `lib/actions/team-health.ts`
- Test: `__tests__/lib/actions/team-health.test.ts`

**Interfaces:**

- Produces:
  - `median(values: number[]): number`
  - `interface MemberLoad { userId: string; name: string; count: number; onTrack: number; dueSoon: number; overdue: number; overloaded: boolean; idle: boolean }`
  - `interface AgingItem { taskId: string; taskTitle: string; stageName: string; assigneeName: string | null; ageHours: number; slaHours: number; agingRatio: number; dueState: "overdue" | "dueSoon" | "none" }`
  - `interface BlockedItem { taskId: string; taskTitle: string; stageName: string; assigneeName: string | null; ageHours: number; waitingOn: string[] }`
  - `resolveTeamIds(): Promise<string[]>` — ADMIN → all team ids; otherwise the current user's team ids.

- [ ] **Step 1: Write the failing test for `median`**

Create `__tests__/lib/actions/team-health.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
    stageDependency: { findMany: vi.fn() },
    templateStage: { findMany: vi.fn() },
  },
}));
vi.mock("@prisma/client", () => ({
  UserRole: {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    SUPERVISOR: "SUPERVISOR",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER",
  },
}));

import { median } from "@/lib/actions/team-health";

describe("median", () => {
  it("returns 0 for empty", () => expect(median([])).toBe(0));
  it("odd length → middle", () => expect(median([3, 1, 2])).toBe(2));
  it("even length → average of middles", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: FAIL — `median` is not exported / module not found.

- [ ] **Step 3: Create the module with constants, types, `median`, `resolveTeamIds`**

Create `lib/actions/team-health.ts`. **Do NOT add a `"use server"` directive** — this is a server-only data module called directly by Server Components, and a `"use server"` file may export only async functions (it would reject the sync constants and `median`):

```ts
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin, getSessionUser } from "@/lib/permissions";

export const OVERLOAD_CEILING = 8;
export const OVERLOAD_MARGIN = 3;
export const IDLE_THRESHOLD = 1;
export const DEFAULT_SLA_HOURS = 72;
export const AGING_ALERT_RATIO = 1.0;
export const QUEUE_LIMIT = 6;

export interface MemberLoad {
  userId: string;
  name: string;
  count: number;
  onTrack: number;
  dueSoon: number;
  overdue: number;
  overloaded: boolean;
  idle: boolean;
}

export interface AgingItem {
  taskId: string;
  taskTitle: string;
  stageName: string;
  assigneeName: string | null;
  ageHours: number;
  slaHours: number;
  agingRatio: number;
  dueState: "overdue" | "dueSoon" | "none";
}

export interface BlockedItem {
  taskId: string;
  taskTitle: string;
  stageName: string;
  assigneeName: string | null;
  ageHours: number;
  waitingOn: string[];
}

/** Median of a numeric list (0 for empty). Pure helper. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Team ids in scope: all teams for ADMIN, else the current user's teams. */
export async function resolveTeamIds(): Promise<string[]> {
  const user = await getSessionUser();
  if (user.role === "ADMIN") {
    const teams = await prisma.team.findMany({ select: { id: true } });
    return teams.map((t) => t.id);
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { teams: { select: { id: true } } },
  });
  return dbUser?.teams.map((t) => t.id) ?? [];
}
```

> Note: with no `"use server"` directive, exporting sync constants, `median`, and the interfaces is fine, and the components can import `QUEUE_LIMIT` from this module. `getSessionUser`/`requireManagerOrAdmin` come from `@/lib/permissions` (also a plain server-only lib).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/actions/team-health.ts __tests__/lib/actions/team-health.test.ts
git commit -m "feat(team-health): módulo base (constantes, tipos, median, escopo de time)"
```

---

### Task 2: `getTeamMemberLoad`

**Files:**

- Modify: `lib/actions/team-health.ts` (append)
- Test: `__tests__/lib/actions/team-health.test.ts` (append)

**Interfaces:**

- Consumes: `median`, `MemberLoad`, `OVERLOAD_CEILING`, `OVERLOAD_MARGIN`, `IDLE_THRESHOLD`, `resolveTeamIds`, `requireManagerOrAdmin`.
- Produces: `getTeamMemberLoad(teamIds?: string[]): Promise<MemberLoad[]>` — one row per team member, sorted by `count` desc.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/actions/team-health.test.ts`:

```ts
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getTeamMemberLoad } from "@/lib/actions/team-health";

const mockAuth = vi.mocked(auth);
const db = vi.mocked(prisma, true);

function asManager() {
  mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
  db.user.findUnique.mockResolvedValue({ teams: [{ id: "team1" }] } as never);
}

describe("getTeamMemberLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-manager", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    await expect(getTeamMemberLoad()).rejects.toThrow(/Access Denied/i);
  });

  it("flags overloaded (>= ceiling), idle (<= threshold) and buckets by due date", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
    ] as never);
    const overdue = new Date(Date.now() - 5 * 864e5);
    const soon = new Date(Date.now() + 1 * 864e5);
    const far = new Date(Date.now() + 30 * 864e5);
    // Ana: 8 active stages (>= OVERLOAD_CEILING) → overloaded; Bruno: 1 → idle
    db.taskActiveStage.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, () => ({ assigneeId: "a", task: { dueDate: far } })),
      { assigneeId: "a", task: { dueDate: soon } },
      { assigneeId: "a", task: { dueDate: overdue } },
      { assigneeId: "b", task: { dueDate: null } },
    ] as never);

    const rows = await getTeamMemberLoad();
    const ana = rows.find((r) => r.userId === "a")!;
    const bruno = rows.find((r) => r.userId === "b")!;
    expect(ana.count).toBe(8);
    expect(ana.overloaded).toBe(true);
    expect(ana.overdue).toBe(1);
    expect(ana.dueSoon).toBe(1);
    expect(ana.onTrack).toBe(6);
    expect(bruno.count).toBe(1);
    expect(bruno.idle).toBe(true);
    expect(rows[0].userId).toBe("a"); // sorted by count desc
  });

  it("flags relative overload (> median + margin) even below ceiling", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
      { id: "c", name: "Caio" },
    ] as never);
    // counts: Ana 5, Bruno 0, Caio 0 → median 0; 5 >= 0 + 3 → overloaded
    db.taskActiveStage.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ assigneeId: "a", task: { dueDate: null } })) as never
    );
    const rows = await getTeamMemberLoad();
    expect(rows.find((r) => r.userId === "a")!.overloaded).toBe(true);
  });
});
```

Add `beforeEach` to the vitest import at the top of the file: change the first import line to
`import { describe, it, expect, vi, beforeEach } from "vitest";`

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: FAIL — `getTeamMemberLoad` not exported.

- [ ] **Step 3: Implement `getTeamMemberLoad`**

Append to `lib/actions/team-health.ts`:

```ts
export async function getTeamMemberLoad(teamIds?: string[]): Promise<MemberLoad[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const { getDueState } = await import("@/lib/dates");

  const members = await prisma.user.findMany({
    where: { teams: { some: { id: { in: scope } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const memberIds = members.map((m) => m.id);

  const stages = await prisma.taskActiveStage.findMany({
    where: { status: "ACTIVE", assigneeId: { in: memberIds } },
    select: { assigneeId: true, task: { select: { dueDate: true } } },
  });

  const tally = new Map<
    string,
    { count: number; onTrack: number; dueSoon: number; overdue: number }
  >();
  for (const m of members) tally.set(m.id, { count: 0, onTrack: 0, dueSoon: 0, overdue: 0 });
  for (const s of stages) {
    if (!s.assigneeId) continue;
    const b = tally.get(s.assigneeId);
    if (!b) continue;
    b.count++;
    const state = getDueState(s.task.dueDate);
    if (state === "overdue") b.overdue++;
    else if (state === "dueSoon") b.dueSoon++;
    else b.onTrack++;
  }

  const med = median(members.map((m) => tally.get(m.id)!.count));

  return members
    .map((m) => {
      const b = tally.get(m.id)!;
      return {
        userId: m.id,
        name: m.name ?? "—",
        count: b.count,
        onTrack: b.onTrack,
        dueSoon: b.dueSoon,
        overdue: b.overdue,
        overloaded: b.count >= OVERLOAD_CEILING || b.count >= med + OVERLOAD_MARGIN,
        idle: b.count <= IDLE_THRESHOLD,
      };
    })
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/actions/team-health.ts __tests__/lib/actions/team-health.test.ts
git commit -m "feat(team-health): getTeamMemberLoad (carga por pessoa, mediana+teto)"
```

---

### Task 3: `getAgingStages`

**Files:**

- Modify: `lib/actions/team-health.ts` (append)
- Test: `__tests__/lib/actions/team-health.test.ts` (append)

**Interfaces:**

- Consumes: `AgingItem`, `DEFAULT_SLA_HOURS`, `AGING_ALERT_RATIO`, `resolveTeamIds`, `requireManagerOrAdmin`.
- Produces: `getAgingStages(teamIds?: string[]): Promise<AgingItem[]>` — ACTIVE stages past SLA or with a near/overdue due date, sorted by `agingRatio` desc then `dueDate` asc.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { getAgingStages } from "@/lib/actions/team-health";

describe("getAgingStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes items past SLA and applies DEFAULT_SLA when stage has none; sorts by ratio desc", async () => {
    asManager();
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    db.taskActiveStage.findMany.mockResolvedValue([
      // 96h old, SLA 24 → ratio 4
      {
        activatedAt: hoursAgo(96),
        task: { id: "t1", title: "A", dueDate: null },
        stage: { name: "Dev", expectedDurationHours: 24 },
        assignee: { name: "Ana" },
      },
      // 36h old, no SLA → default 72 → ratio 0.5 → excluded (not aging, no due risk)
      {
        activatedAt: hoursAgo(36),
        task: { id: "t2", title: "B", dueDate: null },
        stage: { name: "QC", expectedDurationHours: null },
        assignee: null,
      },
      // 80h old, no SLA → default 72 → ratio ~1.11 → included
      {
        activatedAt: hoursAgo(80),
        task: { id: "t3", title: "C", dueDate: null },
        stage: { name: "SEO", expectedDurationHours: null },
        assignee: null,
      },
    ] as never);

    const items = await getAgingStages();
    expect(items.map((i) => i.taskId)).toEqual(["t1", "t3"]); // t2 excluded, sorted by ratio desc
    expect(items[0].agingRatio).toBeCloseTo(4, 1);
    expect(items[1].slaHours).toBe(72);
  });

  it("includes on-SLA items that are overdue by due date", async () => {
    asManager();
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        activatedAt: new Date(),
        task: { id: "t9", title: "Z", dueDate: new Date(Date.now() - 864e5) },
        stage: { name: "Dev", expectedDurationHours: 999999 },
        assignee: null,
      },
    ] as never);
    const items = await getAgingStages();
    expect(items).toHaveLength(1);
    expect(items[0].dueState).toBe("overdue");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: FAIL — `getAgingStages` not exported.

- [ ] **Step 3: Implement `getAgingStages`**

Append:

```ts
export async function getAgingStages(teamIds?: string[]): Promise<AgingItem[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const { getDueState } = await import("@/lib/dates");
  const now = Date.now();

  const stages = await prisma.taskActiveStage.findMany({
    where: { status: "ACTIVE", stage: { defaultTeamId: { in: scope } } },
    select: {
      activatedAt: true,
      task: { select: { id: true, title: true, dueDate: true } },
      stage: { select: { name: true, expectedDurationHours: true } },
      assignee: { select: { name: true } },
    },
  });

  return stages
    .map((s): AgingItem => {
      const ageHours = (now - s.activatedAt.getTime()) / 3.6e6;
      const slaHours = s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS;
      return {
        taskId: s.task.id,
        taskTitle: s.task.title,
        stageName: s.stage.name,
        assigneeName: s.assignee?.name ?? null,
        ageHours,
        slaHours,
        agingRatio: ageHours / slaHours,
        dueState: getDueState(s.task.dueDate),
      };
    })
    .filter((i) => i.agingRatio >= AGING_ALERT_RATIO || i.dueState !== "none")
    .sort((a, b) => b.agingRatio - a.agingRatio);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/actions/team-health.ts __tests__/lib/actions/team-health.test.ts
git commit -m "feat(team-health): getAgingStages (tempo-na-etapa vs SLA)"
```

---

### Task 4: `getBlockedStages`

**Files:**

- Modify: `lib/actions/team-health.ts` (append)
- Test: `__tests__/lib/actions/team-health.test.ts` (append)

**Interfaces:**

- Consumes: `BlockedItem`, `resolveTeamIds`, `requireManagerOrAdmin`.
- Produces: `getBlockedStages(teamIds?: string[]): Promise<BlockedItem[]>` — BLOCKED stages sorted by `ageHours` desc; `waitingOn` = names of prerequisite stages not yet COMPLETED for that task.

Blocking definition (authoritative, from `lib/actions/stage-assignment.ts`): a stage's prerequisites are `StageDependency` rows where `stageId = <the stage>` → `dependsOnStageId`; a prerequisite is unmet when the task has no COMPLETED `TaskActiveStage` for that `dependsOnStageId`.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { getBlockedStages } from "@/lib/actions/team-health";

describe("getBlockedStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists blocked stages with unmet prerequisites as waitingOn, sorted by age desc", async () => {
    asManager();
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    // blocked stages query
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        {
          stageId: "sQC",
          activatedAt: hoursAgo(10),
          task: { id: "t1", title: "A" },
          stage: { name: "QC" },
          assignee: { name: "Ana" },
        },
        {
          stageId: "sSEO",
          activatedAt: hoursAgo(50),
          task: { id: "t1", title: "A" },
          stage: { name: "SEO" },
          assignee: null,
        },
      ] as never)
      // completed stages for involved tasks
      .mockResolvedValueOnce([{ taskId: "t1", stageId: "sDesign" }] as never);
    // prerequisites: QC depends on Dev (unmet) ; SEO depends on Design (met)
    db.stageDependency.findMany.mockResolvedValue([
      { stageId: "sQC", dependsOnStageId: "sDev" },
      { stageId: "sSEO", dependsOnStageId: "sDesign" },
    ] as never);
    db.templateStage.findMany.mockResolvedValue([
      { id: "sDev", name: "Dev" },
      { id: "sDesign", name: "Design" },
    ] as never);

    const items = await getBlockedStages();
    expect(items.map((i) => i.stageName)).toEqual(["SEO", "QC"]); // 50h before 10h
    const qc = items.find((i) => i.stageName === "QC")!;
    expect(qc.waitingOn).toEqual(["Dev"]); // Dev not completed
    const seo = items.find((i) => i.stageName === "SEO")!;
    expect(seo.waitingOn).toEqual([]); // Design completed
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: FAIL — `getBlockedStages` not exported.

- [ ] **Step 3: Implement `getBlockedStages`**

Append:

```ts
export async function getBlockedStages(teamIds?: string[]): Promise<BlockedItem[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const now = Date.now();

  const blocked = await prisma.taskActiveStage.findMany({
    where: { status: "BLOCKED", stage: { defaultTeamId: { in: scope } } },
    select: {
      stageId: true,
      activatedAt: true,
      task: { select: { id: true, title: true } },
      stage: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
  if (blocked.length === 0) return [];

  const taskIds = [...new Set(blocked.map((b) => b.task.id))];
  const blockedStageIds = [...new Set(blocked.map((b) => b.stageId))];

  const [completedRows, prereqRows] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: { taskId: { in: taskIds }, status: "COMPLETED" },
      select: { taskId: true, stageId: true },
    }),
    prisma.stageDependency.findMany({
      where: { stageId: { in: blockedStageIds } },
      select: { stageId: true, dependsOnStageId: true },
    }),
  ]);

  // task -> set of completed stage ids
  const completedByTask = new Map<string, Set<string>>();
  for (const c of completedRows) {
    const set = completedByTask.get(c.taskId) ?? new Set<string>();
    set.add(c.stageId);
    completedByTask.set(c.taskId, set);
  }
  // blocked stage -> its prerequisite stage ids
  const prereqsByStage = new Map<string, string[]>();
  for (const p of prereqRows) {
    const arr = prereqsByStage.get(p.stageId) ?? [];
    arr.push(p.dependsOnStageId);
    prereqsByStage.set(p.stageId, arr);
  }
  // names for prerequisite stages
  const prereqIds = [...new Set(prereqRows.map((p) => p.dependsOnStageId))];
  const names = prereqIds.length
    ? await prisma.templateStage.findMany({
        where: { id: { in: prereqIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  return blocked
    .map((b): BlockedItem => {
      const completed = completedByTask.get(b.task.id) ?? new Set<string>();
      const waitingOn = (prereqsByStage.get(b.stageId) ?? [])
        .filter((depId) => !completed.has(depId))
        .map((depId) => nameById.get(depId) ?? "—");
      return {
        taskId: b.task.id,
        taskTitle: b.task.title,
        stageName: b.stage.name,
        assigneeName: b.assignee?.name ?? null,
        ageHours: (now - b.activatedAt.getTime()) / 3.6e6,
        waitingOn,
      };
    })
    .sort((a, b) => b.ageHours - a.ageHours);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/lib/actions/team-health.test.ts`
Expected: PASS (all `team-health` tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/actions/team-health.ts __tests__/lib/actions/team-health.test.ts
git commit -m "feat(team-health): getBlockedStages (waitingOn via dependências)"
```

---

### Task 5: Pure display helpers (`formatAge`, `loadSegments`)

**Files:**

- Create: `lib/team-health-format.ts`
- Test: `__tests__/lib/team-health-format.test.ts`

**Interfaces:**

- Produces:
  - `formatAge(hours: number): string` — compact "Xd Yh" / "Yh" (locale-neutral).
  - `loadSegments(row: { count: number; onTrack: number; dueSoon: number; overdue: number }): { key: "overdue" | "dueSoon" | "onTrack"; pct: number }[]` — bar segment percentages (0 when count is 0).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/team-health-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatAge, loadSegments } from "@/lib/team-health-format";

describe("formatAge", () => {
  it("hours only under a day", () => expect(formatAge(5)).toBe("5h"));
  it("days and hours", () => expect(formatAge(50)).toBe("2d 2h"));
  it("whole days", () => expect(formatAge(48)).toBe("2d"));
});

describe("loadSegments", () => {
  it("splits into percentages summing to 100 when count > 0", () => {
    const segs = loadSegments({ count: 4, onTrack: 2, dueSoon: 1, overdue: 1 });
    const total = segs.reduce((s, x) => s + x.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(segs.find((s) => s.key === "overdue")!.pct).toBe(25);
  });
  it("all zero when count is 0", () => {
    const segs = loadSegments({ count: 0, onTrack: 0, dueSoon: 0, overdue: 0 });
    expect(segs.every((s) => s.pct === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/team-health-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/team-health-format.ts`:

```ts
/** Compact age label, locale-neutral: "5h", "2d", "2d 2h". */
export function formatAge(hours: number): string {
  const total = Math.max(0, Math.floor(hours));
  const d = Math.floor(total / 24);
  const h = total % 24;
  if (d === 0) return `${h}h`;
  if (h === 0) return `${d}d`;
  return `${d}d ${h}h`;
}

type LoadRow = { count: number; onTrack: number; dueSoon: number; overdue: number };

/** Bar segments (percent of the person's WIP) ordered overdue → dueSoon → onTrack. */
export function loadSegments(
  row: LoadRow
): { key: "overdue" | "dueSoon" | "onTrack"; pct: number }[] {
  const denom = row.count || 1;
  const pct = (n: number) => (row.count === 0 ? 0 : (n / denom) * 100);
  return [
    { key: "overdue", pct: pct(row.overdue) },
    { key: "dueSoon", pct: pct(row.dueSoon) },
    { key: "onTrack", pct: pct(row.onTrack) },
  ];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/lib/team-health-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/team-health-format.ts __tests__/lib/team-health-format.test.ts
git commit -m "feat(team-health): helpers puros de exibição (formatAge, loadSegments)"
```

---

### Task 6: i18n keys `admin.health.*` (pt-BR + es-ES)

**Files:**

- Modify: `locales/pt-BR/admin.json`, `locales/es-ES/admin.json`
- Test: `__tests__/i18n/locale-parity.test.ts` (existing — must stay green)

- [ ] **Step 1: Add the `health` group to pt-BR**

In `locales/pt-BR/admin.json`, add a `"health"` key inside the top-level object (sibling of `dashboard`):

```json
"health": {
  "title": "Saúde do time",
  "load": {
    "title": "Balanço de carga",
    "empty": "Sem membros no time.",
    "overloaded": "Sobrecarga",
    "idle": "Ocioso",
    "activeStages": "{count} ativas"
  },
  "aging": {
    "title": "Envelhecendo / em risco",
    "empty": "Nada envelhecendo. 🎉",
    "seeAll": "Ver todos",
    "slaMultiple": "{ratio}× o SLA"
  },
  "blocked": {
    "title": "Bloqueados & esperando",
    "empty": "Nada bloqueado. 🎉",
    "waitingOn": "Aguardando: {stages}",
    "waitingGeneric": "Aguardando etapas anteriores"
  }
}
```

- [ ] **Step 2: Add the SAME keys to es-ES (Spanish values)**

In `locales/es-ES/admin.json`, add:

```json
"health": {
  "title": "Salud del equipo",
  "load": {
    "title": "Balance de carga",
    "empty": "Sin miembros en el equipo.",
    "overloaded": "Sobrecarga",
    "idle": "Ocioso",
    "activeStages": "{count} activas"
  },
  "aging": {
    "title": "Envejeciendo / en riesgo",
    "empty": "Nada envejeciendo. 🎉",
    "seeAll": "Ver todos",
    "slaMultiple": "{ratio}× el SLA"
  },
  "blocked": {
    "title": "Bloqueados y esperando",
    "empty": "Nada bloqueado. 🎉",
    "waitingOn": "Esperando: {stages}",
    "waitingGeneric": "Esperando etapas anteriores"
  }
}
```

- [ ] **Step 3: Run the parity guard**

Run: `npx vitest run __tests__/i18n/locale-parity.test.ts`
Expected: PASS (45 tests) — key sets identical, no pt orthography in es-ES.

- [ ] **Step 4: Commit**

```bash
git add locales/pt-BR/admin.json locales/es-ES/admin.json
git commit -m "i18n(admin): chaves admin.health.* (pt+es)"
```

---

### Task 7: The three widget components + skeletons

**Files:**

- Create: `components/admin/TeamLoadBalance.tsx`
- Create: `components/admin/AgingQueue.tsx`
- Create: `components/admin/BlockedQueue.tsx`

**Interfaces:**

- Consumes: `getTeamMemberLoad`/`getAgingStages`/`getBlockedStages` (Task 2–4), `formatAge`/`loadSegments` (Task 5), `QUEUE_LIMIT`, `getTranslations`, `Link`.
- Produces: three default-exported async Server Components rendering each signal.

These are async Server Components (verified by build + manual smoke; their branching logic already lives in the Task-5 helpers and the Task 2–4 functions, which are unit-tested).

- [ ] **Step 1: Create `TeamLoadBalance.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { getTeamMemberLoad } from "@/lib/actions/team-health";
import { loadSegments } from "@/lib/team-health-format";

const SEGMENT_COLOR: Record<"overdue" | "dueSoon" | "onTrack", string> = {
  overdue: "bg-red-500",
  dueSoon: "bg-yellow-500",
  onTrack: "bg-green-500",
};

export default async function TeamLoadBalance() {
  const t = await getTranslations("admin.health.load");
  const rows = await getTeamMemberLoad();

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center gap-3">
              <span className="w-32 truncate text-sm font-medium text-foreground">{r.name}</span>
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
                {loadSegments(r).map((s) => (
                  <div
                    key={s.key}
                    className={SEGMENT_COLOR[s.key]}
                    style={{ width: `${s.pct}%` }}
                  />
                ))}
              </div>
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {t("activeStages", { count: r.count })}
              </span>
              {r.overloaded && (
                <span className="text-xs font-bold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5">
                  {t("overloaded")}
                </span>
              )}
              {r.idle && !r.overloaded && (
                <span className="text-xs font-bold text-gray-600 bg-gray-100 border border-gray-300 rounded px-2 py-0.5">
                  {t("idle")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `AgingQueue.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getAgingStages, QUEUE_LIMIT } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";
import { taskStatusBadgeClass } from "@/lib/status-styles";

export default async function AgingQueue() {
  const t = await getTranslations("admin.health.aging");
  const items = (await getAgingStages()).slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
        <Link
          href="/reports/performance"
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={`${i.taskId}-${i.stageName}`} className="py-2">
              <Link
                href={`/tasks/${i.taskId}`}
                className="block hover:bg-accent rounded-md px-2 py-1 -mx-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {i.taskTitle}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatAge(i.ageHours)} · {t("slaMultiple", { ratio: i.agingRatio.toFixed(1) })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{i.stageName}</span>
                  {i.assigneeName && <span>· {i.assigneeName}</span>}
                  {i.dueState !== "none" && (
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 border ${taskStatusBadgeClass("IN_PROGRESS")}`}
                    >
                      {i.dueState === "overdue" ? "⚠" : "•"}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `BlockedQueue.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getBlockedStages, QUEUE_LIMIT } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";

export default async function BlockedQueue() {
  const t = await getTranslations("admin.health.blocked");
  const items = (await getBlockedStages()).slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={`${i.taskId}-${i.stageName}`} className="py-2">
              <Link
                href={`/tasks/${i.taskId}`}
                className="block hover:bg-accent rounded-md px-2 py-1 -mx-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {i.taskTitle}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatAge(i.ageHours)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{i.stageName}</span>
                  {i.assigneeName && <span> · {i.assigneeName}</span>}
                  <span className="block">
                    {i.waitingOn.length
                      ? t("waitingOn", { stages: i.waitingOn.join(", ") })
                      : t("waitingGeneric")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/admin/TeamLoadBalance.tsx components/admin/AgingQueue.tsx components/admin/BlockedQueue.tsx
git commit -m "feat(admin): componentes do cockpit (carga, aging, bloqueados)"
```

---

### Task 8: Mount the cockpit in the admin home + verify

**Files:**

- Create: `components/admin/AdminHealthSection.tsx`
- Modify: `app/[locale]/(protected)/admin/page.tsx`

**Interfaces:**

- Consumes: the three widgets (Task 7), `Suspense`, `getTranslations`.

- [ ] **Step 1: Create `AdminHealthSection.tsx` (Suspense wrappers + skeleton)**

```tsx
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import TeamLoadBalance from "@/components/admin/TeamLoadBalance";
import AgingQueue from "@/components/admin/AgingQueue";
import BlockedQueue from "@/components/admin/BlockedQueue";

function CardSkeleton() {
  return <div className="bg-card rounded-xl border-2 border-border p-6 h-48 animate-pulse" />;
}

export async function AdminHealthSection() {
  const t = await getTranslations("admin.health");
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-foreground mb-4">{t("title")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <Suspense fallback={<CardSkeleton />}>
            <TeamLoadBalance />
          </Suspense>
        </div>
        <Suspense fallback={<CardSkeleton />}>
          <AgingQueue />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <BlockedQueue />
        </Suspense>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `admin/page.tsx`**

In `app/[locale]/(protected)/admin/page.tsx`, add the import near the other imports:

```tsx
import { AdminHealthSection } from "@/components/admin/AdminHealthSection";
```

Then insert `<AdminHealthSection />` immediately after the header `</div>` and before the `{/* Statistics Grid */}` block (i.e., between line 72 `</div>` and line 74's grid):

```tsx
{
  /* Team-health cockpit */
}
<AdminHealthSection />;

{
  /* Statistics Grid */
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Full test suite + i18n parity**

Run: `npx vitest run`
Expected: all pass (existing suite + new `team-health` and `team-health-format` tests + parity 45).

- [ ] **Step 5: Clean production build**

Run: `rm -rf .next && npx next build`
Expected: "Compiled successfully", 0 "Attempted import error".

- [ ] **Step 6: Manual smoke (end-to-end)**

Start the app (`npm run dev`, port 3100) with a seeded DB, sign in as a MANAGER/ADMIN, open `/admin`, and confirm: the "Saúde do time" section renders above the counters; the load bars show per-person segments with Sobrecarga/Ocioso badges; the aging and blocked queues list up to 6 items with correct links; empty states show when there's no data. Switch locale to es-ES and confirm Spanish labels.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminHealthSection.tsx "app/[locale]/(protected)/admin/page.tsx"
git commit -m "feat(admin): monta cockpit de saúde do time na home admin"
```

---

## Self-Review

**Spec coverage:** §4 metrics → Tasks 2–4 (load/aging/blocked with the exact formulas & constants); §5 data layer → Tasks 1–4; §6 UI (3 blocks + empty states + "ver todos") → Tasks 7–8; §7 architecture (Server Components + Suspense + i18n parity + reuse status-styles/formatters) → Tasks 6–8; §8 phasing (no `blockedAt`, proxy via activatedAt) → Task 4; §9 verification (unit tests, parity, tsc, build, manual smoke) → Tasks 1–8. The spec's "render smoke of the 3 components" is intentionally realized as build + manual smoke (async Server Components aren't RTL-friendly) with the branching display logic unit-tested via `team-health-format` (Task 5) — noted here as the deliberate substitution.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test shows real assertions.

**Type consistency:** `MemberLoad`/`AgingItem`/`BlockedItem` field names are used identically across Tasks 2–4 and the components in Task 7; `loadSegments` row shape matches `MemberLoad`; `QUEUE_LIMIT`/`formatAge`/`taskStatusBadgeClass` referenced in Task 7 are all defined (Tasks 1/5 and existing `lib/status-styles`). `getDueState` returns `"overdue"|"dueSoon"|"none"` (existing `lib/dates.ts`), matching `AgingItem.dueState`.

**Open risk carried from spec:** `waitingOn` cost (extra queries per blocked batch) is bounded by three batched `findMany`s (Task 4), not N+1; if a template's dependency data is missing, `waitingGeneric` is the fallback copy (Task 6).
