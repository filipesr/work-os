# Qualidade & retrabalho (defeito-na-origem) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir qualidade e retrabalho process-first: registrar cada reversão como um `ReworkEvent` (interno vs cliente + etapa-origem) e expor first-time-right por etapa e retrabalho por etapa-origem em `/reports/performance`. Informacional, nunca individual.

**Architecture:** Novo modelo append-only `ReworkEvent` (origem = etapa-alvo da reversão; kind interno/cliente escolhido ao reverter). `revertTaskStage` grava o evento na transação existente. Duas funções de reporting process-level segmentáveis por tipo (reusam `workflowTemplateId`). Dois cards no relatório.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma/Postgres, next-intl (pt-BR/es-ES), Vitest.

## Global Constraints

- **Process-first, nunca individual (P2):** métricas por etapa/tipo/processo. `ReworkEvent.byUserId` existe só para auditoria/contexto — NUNCA é agregado em métrica individual, ranking ou pay.
- **Interno ≠ cliente (P5):** o modelo distingue `INTERNAL` de `CLIENT`; não colapsar.
- **Informacional (P1):** nada bloqueia com base nesses números; sem score/ranking.
- **Aditivo:** migração aditiva; comportamento de reversão inalterado além do registro do evento.
- **`"use server"` só exporta funções async** (`reporting.ts`, `task.ts`).
- **i18n:** toda string via `t()`, pt-BR + es-ES em paridade (guard `__tests__/i18n/locale-parity.test.ts`); es-ES real.
- **Gates por tarefa:** `npx tsc --noEmit` 0; `npx vitest run` verde; `npx next build` limpo quando toca UI/rotas.
- **`PerformanceFilters`** já tem `templateId`; `buildStageLogWhere(filters)` já aplica `stageFilter.templateId` (via `stage.templateId`) + date range + project/client.

---

### Task 1: Schema — `ReworkKind` + `ReworkEvent` + migração

**Files:**

- Modify: `prisma/schema.prisma` (novo enum + modelo + 3 relações inversas)
- Create: `prisma/migrations/20260722170000_add_rework_event/migration.sql`

**Interfaces:**

- Produces: `enum ReworkKind`, `model ReworkEvent` (campos: id, at, kind, reason, taskId, sourceStageId, byUserId).

- [ ] **Step 1: Editar o schema**

Adicionar o enum perto dos outros (ex.: após `enum StageLogStatus`):

```prisma
enum ReworkKind {
  INTERNAL // retrabalho pego dentro do processo (gate interno) — desejável
  CLIENT   // rejeição do cliente (escapou) — custosa
}
```

Adicionar o modelo (perto de `TaskStageLog`/`StageTransition`):

```prisma
// ReworkEvent: um registro por reversão de tarefa. Atribui o retorno à
// etapa-ORIGEM (a etapa-alvo da reversão = a que deve refazer, tipicamente onde o
// defeito nasceu) e classifica interno vs cliente. Sinal de PROCESSO (P2/P5),
// nunca individual. Append-only. byUserId é só auditoria — nunca vira métrica de pessoa.
model ReworkEvent {
  id     String     @id @default(cuid())
  at     DateTime   @default(now())
  kind   ReworkKind
  reason String     @db.Text

  taskId String
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)

  sourceStageId String
  sourceStage   TemplateStage @relation("ReworkSource", fields: [sourceStageId], references: [id], onDelete: Cascade)

  byUserId String
  byUser   User   @relation("ReworkBy", fields: [byUserId], references: [id], onDelete: Cascade)

  @@index([sourceStageId, at])
  @@index([taskId])
}
```

Relações inversas (adicionar uma linha em cada modelo):

- `model Task { ... reworkEvents ReworkEvent[] }`
- `model TemplateStage { ... reworkEvents ReworkEvent[] @relation("ReworkSource") }`
- `model User { ... reworkEventsBy ReworkEvent[] @relation("ReworkBy") }`

- [ ] **Step 2: Criar a migração**

```sql
-- prisma/migrations/20260722170000_add_rework_event/migration.sql
-- ReworkEvent: registra cada reversão (retrabalho) atribuída à etapa-origem,
-- interno vs cliente. Aditivo; sem backfill (reversões antigas não têm kind/origem).

CREATE TYPE "ReworkKind" AS ENUM ('INTERNAL', 'CLIENT');

CREATE TABLE "ReworkEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ReworkKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceStageId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,

    CONSTRAINT "ReworkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReworkEvent_sourceStageId_at_idx" ON "ReworkEvent"("sourceStageId", "at");
CREATE INDEX "ReworkEvent_taskId_idx" ON "ReworkEvent"("taskId");

ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_sourceStageId_fkey"
    FOREIGN KEY ("sourceStageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_byUserId_fkey"
    FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerar o client**

Run: `npx prisma generate`
Expected: sucesso; tipos incluem `ReworkEvent`, `ReworkKind`.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run` → verde (regressão).

> Nota: schema/migração não têm teste unitário puro; cobertura por generate + tsc +
> regressão. NÃO rodar `prisma migrate deploy` (o usuário aplica).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): modelo ReworkEvent + enum ReworkKind (P2.T1)"
```

---

### Task 2: `revertTaskStage` grava o evento + UI de origem (interno/cliente)

Ação e seu único consumidor (`RevertStageButton`) mudam juntos — a assinatura nova
e o call-site são atômicos, então ficam na mesma tarefa para manter o gate `tsc` limpo.

**Files:**

- Modify: `lib/actions/task.ts` (`revertTaskStage`)
- Modify: `components/tasks/RevertStageButton.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`
- Test: `__tests__/lib/actions/revert-rework.test.ts`

**Interfaces:**

- Consumes: `ReworkKind` (Task 1).
- Produces: `revertTaskStage(taskId, revertToStageId, comment, kind: ReworkKind)` grava um `ReworkEvent`.

- [ ] **Step 1: Write the failing test (action)**

```ts
// __tests__/lib/actions/revert-rework.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "u1", role: "ADMIN", email: "a@b.c" }),
  requireManagerOrAdmin: vi.fn(),
  getSessionUser: vi.fn(),
}));

const tx = {
  taskStageLog: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
  taskActiveStage: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  taskComment: { create: vi.fn().mockResolvedValue({}) },
  task: { update: vi.fn().mockResolvedValue({}) },
  stageTransition: {
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  },
  reworkEvent: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: { findUnique: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { revertTaskStage } from "@/lib/actions/task";

const db = prisma as unknown as {
  templateStage: { findUnique: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

function setupValidRevert() {
  // target stage order 1 (previous); current active stage order 3 (later) → revert allowed
  db.templateStage.findUnique.mockResolvedValue({
    id: "sTarget",
    order: 1,
    name: "Briefing",
    template: {},
    defaultTeam: null,
  });
  db.taskActiveStage.findMany.mockResolvedValue([
    { stageId: "sNow", assigneeId: "u1", stage: { id: "sNow", order: 3, name: "QC" } },
  ]);
  db.user.findUnique.mockResolvedValue({ role: "ADMIN", name: "Ana" });
}

describe("revertTaskStage — ReworkEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
  });

  it("rejects an invalid kind before touching the database", async () => {
    const res = await revertTaskStage("t1", "sTarget", "motivo válido", "BOGUS" as never);
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(db.templateStage.findUnique).not.toHaveBeenCalled();
  });

  it("writes a ReworkEvent with source = revertToStageId, kind and byUser", async () => {
    setupValidRevert();
    const res = await revertTaskStage("t1", "sTarget", "brief incompleto", "CLIENT");
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(tx.reworkEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.reworkEvent.create.mock.calls[0][0].data).toEqual({
      taskId: "t1",
      sourceStageId: "sTarget",
      kind: "CLIENT",
      reason: "brief incompleto",
      byUserId: "u1",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/revert-rework.test.ts`
Expected: FAIL (`kind` não existe / `reworkEvent.create` nunca chamado).

- [ ] **Step 3: Implementar a action**

Em `lib/actions/task.ts`:

- Import do tipo: adicionar `type ReworkKind` ao import existente de `@prisma/client`
  (ex.: `import { Prisma, type ActiveStageStatus, type ReworkKind } from "@prisma/client";`).
- Assinatura: `export async function revertTaskStage(taskId: string, revertToStageId: string, comment: string, kind: ReworkKind) {`
- Após a validação de `comment` (antes dos reads em paralelo), validar `kind`:

```ts
if (kind !== "INTERNAL" && kind !== "CLIENT") {
  return { error: "Origem do retorno inválida (interno ou cliente)." };
}
```

- Dentro da transação, após o bloco `4c` (reativação da etapa-alvo + `recordStageTransition`), gravar o evento:

```ts
// 4c-bis. Registrar o retrabalho atribuído à etapa-origem (a etapa-alvo).
await tx.reworkEvent.create({
  data: {
    taskId,
    sourceStageId: revertToStageId,
    kind,
    reason: comment.trim(),
    byUserId: currentUserId,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/revert-rework.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar a UI (`RevertStageButton`)**

Em `components/tasks/RevertStageButton.tsx`:

- Estado: `const [kind, setKind] = useState<"INTERNAL" | "CLIENT" | null>(null);`
- No `onSuccess` do `useServerAction`, resetar também: `setKind(null);`
- `handleRevert` exige `kind` e o passa:

```ts
const handleRevert = () => {
  if (!selectedStageId || !comment.trim() || !kind) {
    toast.error(t("validationError"));
    return;
  }
  run(taskId, selectedStageId, comment, kind);
};
```

- Após o bloco do textarea de motivo (o `<div className="mb-6">` do comentário), antes do footer, adicionar o seletor:

```tsx
{
  /* Origem do retorno (interno vs cliente) */
}
<div className="mb-6">
  <label className="block text-sm font-semibold text-foreground mb-2">{t("originLabel")}</label>
  <div className="flex gap-3">
    {(["INTERNAL", "CLIENT"] as const).map((k) => (
      <button
        key={k}
        type="button"
        onClick={() => setKind(k)}
        disabled={isPending}
        aria-pressed={kind === k}
        className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          kind === k
            ? "border-blue-400 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
            : "border-border text-foreground hover:bg-accent"
        }`}
      >
        {t(k === "INTERNAL" ? "originInternal" : "originClient")}
      </button>
    ))}
  </div>
  <p className="text-xs text-muted-foreground mt-1">{t("originHint")}</p>
</div>;
```

- Botão confirmar: incluir `!kind` no `disabled`:

```tsx
                  disabled={isPending || !selectedStageId || !comment.trim() || !kind}
```

- [ ] **Step 6: Chaves i18n em `tasks.json` → `stages.revertModal`**

pt-BR:

```json
        "originLabel": "Origem do retorno",
        "originInternal": "Interno (pego aqui)",
        "originClient": "Cliente (rejeitou)",
        "originHint": "Interno = qualidade pega dentro do processo. Cliente = rejeição após envio."
```

es-ES:

```json
        "originLabel": "Origen del retorno",
        "originInternal": "Interno (detectado aquí)",
        "originClient": "Cliente (rechazó)",
        "originHint": "Interno = calidad detectada dentro del proceso. Cliente = rechazo tras el envío."
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit` → 0 erros (o call-site já passa os 4 args).
Run: `npx vitest run` → verde (inclui o teste da action + paridade i18n).
Run: `npx next build` → limpo (se stale cache falhar import, `rm -rf .next` e rebuild).

- [ ] **Step 8: Commit**

```bash
git add lib/actions/task.ts components/tasks/RevertStageButton.tsx locales/pt-BR/tasks.json locales/es-ES/tasks.json __tests__/lib/actions/revert-rework.test.ts
git commit -m "feat(tasks): reversão grava ReworkEvent + seletor de origem interno/cliente (P2.T2)"
```

---

### Task 3: Reporting — `getReworkBySourceStage` + `getFirstTimeRightByStage`

**Files:**

- Modify: `lib/actions/reporting.ts`
- Test: `__tests__/lib/actions/rework-reporting.test.ts`

**Interfaces:**

- Consumes: `ReworkEvent` (Task 1); `PerformanceFilters` + `buildStageLogWhere` (existentes).
- Produces: `getReworkBySourceStage(filters)`, `getFirstTimeRightByStage(filters)`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/actions/rework-reporting.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { reworkEvent: { findMany: vi.fn() }, taskStageLog: { findMany: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getReworkBySourceStage, getFirstTimeRightByStage } from "@/lib/actions/reporting";

const db = prisma as unknown as {
  reworkEvent: { findMany: ReturnType<typeof vi.fn> };
  taskStageLog: { findMany: ReturnType<typeof vi.fn> };
};

describe("getReworkBySourceStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups by source stage with internal/client split, sorted by total desc", async () => {
    db.reworkEvent.findMany.mockResolvedValue([
      { kind: "CLIENT", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "INTERNAL", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "CLIENT", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "INTERNAL", sourceStage: { id: "s2", name: "Design", template: { name: "Arte" } } },
    ]);
    const rows = await getReworkBySourceStage({});
    expect(rows[0]).toEqual({
      stageId: "s1",
      stageName: "Briefing",
      templateName: "Arte",
      internal: 1,
      client: 2,
      total: 3,
    });
    expect(rows[1].stageId).toBe("s2");
    expect(rows[1].total).toBe(1);
  });
});

describe("getFirstTimeRightByStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes FTR = 1 - reworkedTo/completed, clamped, worst first", async () => {
    // s1: 4 completed, 1 reworked → FTR 0.75 ; s2: 2 completed, 0 reworked → FTR 1
    db.taskStageLog.findMany.mockResolvedValue([
      ...Array.from({ length: 4 }, () => ({
        stageId: "s1",
        stage: { name: "Briefing", template: { name: "Arte" } },
      })),
      ...Array.from({ length: 2 }, () => ({
        stageId: "s2",
        stage: { name: "Design", template: { name: "Arte" } },
      })),
    ]);
    db.reworkEvent.findMany.mockResolvedValue([{ sourceStageId: "s1" }]);
    const rows = await getFirstTimeRightByStage({});
    const s1 = rows.find((r) => r.stageId === "s1")!;
    const s2 = rows.find((r) => r.stageId === "s2")!;
    expect(s1).toEqual({
      stageId: "s1",
      stageName: "Briefing",
      templateName: "Arte",
      completed: 4,
      reworkedTo: 1,
      firstTimeRight: 0.75,
    });
    expect(s2.firstTimeRight).toBe(1);
    expect(rows[0].stageId).toBe("s1"); // worst (lowest FTR) first
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/rework-reporting.test.ts`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar** (adicionar em `lib/actions/reporting.ts`, seção de performance)

```ts
export interface ReworkBySourceStage {
  stageId: string;
  stageName: string;
  templateName: string;
  internal: number;
  client: number;
  total: number;
}

/** Where para ReworkEvent: janela (por `at`) + template (sourceStage.templateId,
 * coerente com buildStageLogWhere) + project/client (task). */
function buildReworkWhere(filters: PerformanceFilters): Prisma.ReworkEventWhereInput {
  const where: Prisma.ReworkEventWhereInput = {};
  if (filters.startDate || filters.endDate) {
    const at: Prisma.DateTimeFilter = {};
    if (filters.startDate) at.gte = filters.startDate;
    if (filters.endDate) at.lte = filters.endDate;
    where.at = at;
  }
  if (filters.templateId) where.sourceStage = { templateId: filters.templateId };
  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;
  return where;
}

/**
 * Retrabalho agrupado por etapa-ORIGEM, com split interno vs cliente. Responde
 * "qual etapa mais injeta defeito a jusante, e está sendo pego dentro (bom) ou
 * escapando pro cliente (custoso)". Sinal de PROCESSO — nunca por pessoa.
 */
export async function getReworkBySourceStage(
  filters: PerformanceFilters = {}
): Promise<ReworkBySourceStage[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const events = await prisma.reworkEvent.findMany({
    where: buildReworkWhere(filters),
    select: {
      kind: true,
      sourceStage: { select: { id: true, name: true, template: { select: { name: true } } } },
    },
  });

  const byStage = new Map<string, ReworkBySourceStage>();
  for (const e of events) {
    const s = e.sourceStage;
    let row = byStage.get(s.id);
    if (!row) {
      row = {
        stageId: s.id,
        stageName: s.name,
        templateName: s.template.name,
        internal: 0,
        client: 0,
        total: 0,
      };
      byStage.set(s.id, row);
    }
    if (e.kind === "INTERNAL") row.internal += 1;
    else row.client += 1;
    row.total += 1;
  }
  return Array.from(byStage.values()).sort((a, b) => b.total - a.total);
}

export interface FirstTimeRightByStage {
  stageId: string;
  stageName: string;
  templateName: string;
  completed: number;
  reworkedTo: number;
  firstTimeRight: number; // 0..1 = 1 − reworkedTo/completed (clamp)
}

/**
 * First-time-right por etapa: das etapas concluídas na janela, fração que NUNCA
 * virou alvo de retorno. Aproximação process-level (razão de janela, não
 * pareamento 1:1 completo↔retorno). Pior (menor FTR) primeiro.
 */
export async function getFirstTimeRightByStage(
  filters: PerformanceFilters = {}
): Promise<FirstTimeRightByStage[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const [completedLogs, reworkEvents] = await Promise.all([
    prisma.taskStageLog.findMany({
      where: { ...buildStageLogWhere(filters), status: "COMPLETED" },
      select: {
        stageId: true,
        stage: { select: { name: true, template: { select: { name: true } } } },
      },
    }),
    prisma.reworkEvent.findMany({
      where: buildReworkWhere(filters),
      select: { sourceStageId: true },
    }),
  ]);

  const reworkByStage = new Map<string, number>();
  for (const e of reworkEvents)
    reworkByStage.set(e.sourceStageId, (reworkByStage.get(e.sourceStageId) ?? 0) + 1);

  const agg = new Map<string, FirstTimeRightByStage>();
  for (const log of completedLogs) {
    let row = agg.get(log.stageId);
    if (!row) {
      row = {
        stageId: log.stageId,
        stageName: log.stage.name,
        templateName: log.stage.template.name,
        completed: 0,
        reworkedTo: 0,
        firstTimeRight: 1,
      };
      agg.set(log.stageId, row);
    }
    row.completed += 1;
  }
  for (const row of agg.values()) {
    row.reworkedTo = reworkByStage.get(row.stageId) ?? 0;
    row.firstTimeRight = Math.max(0, Math.min(1, 1 - row.reworkedTo / row.completed));
  }
  return Array.from(agg.values()).sort((a, b) => a.firstTimeRight - b.firstTimeRight);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/rework-reporting.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run` → verde.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/reporting.ts __tests__/lib/actions/rework-reporting.test.ts
git commit -m "feat(reports): retrabalho por etapa-origem + first-time-right por etapa (P2.T3)"
```

---

### Task 4: Cards em `/reports/performance` + i18n

**Files:**

- Modify: `app/[locale]/(protected)/reports/performance/page.tsx`
- Modify: `locales/pt-BR/reportsPerformance.json`, `locales/es-ES/reportsPerformance.json`

**Interfaces:**

- Consumes: `getReworkBySourceStage`, `getFirstTimeRightByStage` (Task 3); herdam `filters` (o seletor de tipo já segmenta).

- [ ] **Step 1: Importar as funções**

No import de `@/lib/actions/reporting` da página, adicionar `getReworkBySourceStage` e `getFirstTimeRightByStage`.

- [ ] **Step 2: Adicionar as duas seções (Server Components, padrão das existentes — `T` é o tipo já definido no arquivo para `getTranslations`)**

```tsx
async function FirstTimeRightSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const rows = await getFirstTimeRightByStage(filters);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("firstTimeRight.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{t("firstTimeRight.description")}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("firstTimeRight.noData")}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = Math.round(r.firstTimeRight * 100);
              const tone =
                pct >= 85
                  ? "text-emerald-600 dark:text-emerald-400"
                  : pct >= 60
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400";
              return (
                <div key={r.stageId} className="grid grid-cols-3 gap-2 text-sm items-center">
                  <div className="col-span-2">
                    <div className="font-medium truncate">{r.stageName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.templateName} •{" "}
                      {t("firstTimeRight.counts", {
                        completed: r.completed,
                        reworked: r.reworkedTo,
                      })}
                    </div>
                  </div>
                  <div className={`text-right text-lg font-bold ${tone}`}>{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function ReworkBySourceSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const rows = await getReworkBySourceStage(filters);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reworkBySource.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{t("reworkBySource.description")}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reworkBySource.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("reworkBySource.stageHeader")}</div>
              <div className="text-center">{t("reworkBySource.internal")}</div>
              <div className="text-center">{t("reworkBySource.client")}</div>
            </div>
            {rows.map((r) => (
              <div key={r.stageId} className="grid grid-cols-3 gap-2 text-sm items-center">
                <div className="font-medium truncate">{r.stageName}</div>
                <div className="text-center text-emerald-600 dark:text-emerald-400 font-medium">
                  {r.internal}
                </div>
                <div className="text-center text-rose-600 dark:text-rose-400 font-medium">
                  {r.client}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{t("reworkBySource.legend")}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Renderizar as seções (dentro do container principal, junto às demais)**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <Suspense fallback={<CardSkeleton />}>
    <FirstTimeRightSection filters={filters} t={t} />
  </Suspense>
  <Suspense fallback={<CardSkeleton />}>
    <ReworkBySourceSection filters={filters} t={t} />
  </Suspense>
</div>
```

- [ ] **Step 4: Chaves i18n em `reportsPerformance.json`**

pt-BR:

```json
  "firstTimeRight": {
    "title": "First-Time-Right por Etapa",
    "description": "Das etapas concluídas, fração que não voltou para revisão. Alto = entrega certa de primeira.",
    "noData": "Sem dados de retrabalho no período.",
    "counts": "{completed} concluídas · {reworked} retornos"
  },
  "reworkBySource": {
    "title": "Retrabalho por Etapa-Origem",
    "description": "Qual etapa mais gera retorno a jusante — e se está sendo pego dentro (interno) ou escapando ao cliente.",
    "noData": "Sem retrabalho registrado no período.",
    "stageHeader": "Etapa",
    "internal": "Interno",
    "client": "Cliente",
    "legend": "Interno = qualidade pega dentro do processo (bom). Cliente = escapou (custoso). Sinal de processo, não de pessoa."
  }
```

es-ES:

```json
  "firstTimeRight": {
    "title": "First-Time-Right por Etapa",
    "description": "De las etapas completadas, fracción que no volvió a revisión. Alto = entrega correcta a la primera.",
    "noData": "Sin datos de retrabajo en el período.",
    "counts": "{completed} completadas · {reworked} retornos"
  },
  "reworkBySource": {
    "title": "Retrabajo por Etapa-Origen",
    "description": "Qué etapa genera más retorno aguas abajo — y si se detecta dentro (interno) o escapa al cliente.",
    "noData": "Sin retrabajo registrado en el período.",
    "stageHeader": "Etapa",
    "internal": "Interno",
    "client": "Cliente",
    "legend": "Interno = calidad detectada dentro del proceso (bueno). Cliente = escapó (costoso). Señal de proceso, no de persona."
  }
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → 0 erros.
Run: `npx vitest run` → verde (inclui paridade i18n).
Run: `npx next build` → limpo.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(protected)/reports/performance/page.tsx" locales/pt-BR/reportsPerformance.json locales/es-ES/reportsPerformance.json
git commit -m "feat(reports): cards de first-time-right e retrabalho por etapa-origem (P2.T4)"
```

---

## Verificação final (whole-branch)

- `tsc` 0 · `vitest` verde · `next build` limpo · paridade i18n.
- Migração `20260722170000_add_rework_event` pendente de `prisma migrate deploy`.
- Smoke manual: reverter uma tarefa escolhendo interno/cliente → conferir os cards
  "First-time-right" e "Retrabalho por etapa-origem" (por tipo, via o seletor do
  subsistema 1).

## Notas de escopo (fora deste plano)

- Atribuição individual → **nunca** (P2). `byUserId` é só auditoria.
- Inferir interno/cliente por gate-type do template; callout no cockpit → refinamentos futuros.
- Subsistema 3 (visão de pessoas: 4 lentes + evolução auto-referenciada) → spec próprio; usará estes sinais **process-level**.
