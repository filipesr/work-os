# Visão de pessoas — 3b — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualidade por pessoa (FTR defeito-only) + reclassificação humana — exceção deliberada a P2 cercada por salvaguardas. Captura de `sourceAssigneeId` na reversão; `reworkClass` (DEFECT/LEGITIMATE); FTR defeito-only no processo E por pessoa; reclassificação só do gestor; Meu foco read-only.

**Architecture:** `ReworkEvent` ganha `reworkClass?` + `sourceAssigneeId?`. A reversão captura o assignee da etapa-alvo. As queries de rework passam a contar só defeito (`reworkClass ≠ LEGITIMATE`, com null contando). Funções por pessoa (`getPersonQuality`, `getPersonReworkEvents`) fail-closed; `classifyReworkEvent` gestor-only. Superfícies em `/admin/users/[id]` (com toggle) e `/dashboard` (read-only).

**Tech Stack:** Next.js 15 (App Router, Server Actions/Components), Prisma/Postgres, next-intl (pt-BR/es-ES), Vitest.

## Global Constraints

- **Auto-referenciado, nunca comparativo (P1/P2):** nada ordena/rankeia/compara pessoas.
- **Defeito-only via reclassificação humana:** não-classificado (null) conta como defeito; `LEGITIMATE` não conta. Predicado explícito `{ OR: [{ reworkClass: null }, { reworkClass: "DEFECT" }] }` (o `not` do Prisma sobre nullable NÃO inclui null).
- **Reclassificação só gestor/admin** (`requireManagerOrAdmin`); leitura por pessoa/gestor (`requireSelfOrManager`); fail-closed.
- **`sourceAssigneeId` NUNCA usado para ranking/comparação** — só FTR auto-referenciado.
- **Aditivo:** migração aditiva; reversão inalterada além da captura.
- **`"use server"` só exporta funções async.** i18n paridade pt-BR/es-ES real.
- **Gates por tarefa:** `tsc --noEmit` 0; `vitest run` verde; `next build` limpo quando toca UI.
- Nota: `__tests__/components/CreateTaskForm.smoke.test.tsx` falha no import (pré-existente) — ignorar; contar o resto.

---

### Task 1: Schema — `ReworkClass` + `reworkClass?` + `sourceAssigneeId?` + migração

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722180000_add_rework_class_and_source_assignee/migration.sql`

- [ ] **Step 1: Editar o schema**

Adicionar o enum (perto de `ReworkKind`):

```prisma
enum ReworkClass {
  DEFECT     // falha de qualidade real (conta contra o FTR)
  LEGITIMATE // mudança legítima (ex.: cliente mudou direção) — NÃO conta
}
```

Em `model ReworkEvent`, adicionar:

```prisma
  // Classificação humana (gestor/admin). Nulo = não-classificado → conta como
  // defeito até revisado (pessimista). LEGITIMATE sai da conta do FTR.
  reworkClass ReworkClass?

  // Quem executou a etapa-origem (assignee capturado na reversão). Base do FTR
  // por pessoa (exceção deliberada a P2 — ver spec). Nulo p/ eventos antigos ou
  // etapa sem assignee. NUNCA usado para ranking/comparação.
  sourceAssigneeId String?
  sourceAssignee   User?   @relation("ReworkSourceAssignee", fields: [sourceAssigneeId], references: [id], onDelete: SetNull)

  @@index([sourceAssigneeId, at])
```

Em `model User`, adicionar a relação inversa:

```prisma
  reworkEventsAsSource ReworkEvent[] @relation("ReworkSourceAssignee")
```

- [ ] **Step 2: Criar a migração**

```sql
-- prisma/migrations/20260722180000_add_rework_class_and_source_assignee/migration.sql
-- 3b: classificação (defeito/legítimo) + quem fez a etapa-origem (para FTR por pessoa).
-- Aditivo; sem backfill (eventos antigos ficam não-classificados e sem sourceAssignee).

CREATE TYPE "ReworkClass" AS ENUM ('DEFECT', 'LEGITIMATE');

ALTER TABLE "ReworkEvent" ADD COLUMN "reworkClass" "ReworkClass";
ALTER TABLE "ReworkEvent" ADD COLUMN "sourceAssigneeId" TEXT;

CREATE INDEX "ReworkEvent_sourceAssigneeId_at_idx" ON "ReworkEvent"("sourceAssigneeId", "at");

ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_sourceAssigneeId_fkey"
    FOREIGN KEY ("sourceAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerar + verificar**

Run: `npx prisma generate` → tipos incluem `ReworkClass`, `reworkClass`, `sourceAssigneeId`.
Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → verde.

> Schema/migração sem teste unitário puro; NÃO rodar `migrate deploy` (o usuário aplica).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): ReworkClass + sourceAssigneeId no ReworkEvent (3b.T1)"
```

---

### Task 2: Reversão captura `sourceAssigneeId` + FTR do processo vira defeito-only

**Files:**

- Modify: `lib/actions/task.ts` (`revertTaskStage`)
- Modify: `lib/actions/reporting.ts` (`buildReworkWhere`)
- Test: `__tests__/lib/actions/revert-rework.test.ts` (append), `__tests__/lib/actions/rework-reporting.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append ao `__tests__/lib/actions/revert-rework.test.ts` (dentro do `describe` existente, o mock de tx já tem `taskActiveStage`; adicionar `findUnique` ao tx e um caso):

- No objeto `tx.taskActiveStage`, garantir `findUnique: vi.fn().mockResolvedValue({ assigneeId: "worker1" })`.
- Novo teste:

```ts
it("captura sourceAssigneeId do assignee da etapa-alvo", async () => {
  setupValidRevert();
  tx.taskActiveStage.findUnique.mockResolvedValue({ assigneeId: "worker1" });
  await revertTaskStage("t1", "sTarget", "motivo", "INTERNAL");
  expect(tx.reworkEvent.create.mock.calls[0][0].data.sourceAssigneeId).toBe("worker1");
});
```

Append ao `__tests__/lib/actions/rework-reporting.test.ts` (novo caso em `getReworkBySourceStage`):

```ts
it("conta não-classificado + DEFECT, exclui LEGITIMATE (defeito-only)", async () => {
  await getReworkBySourceStage({});
  const where = db.reworkEvent.findMany.mock.calls[0][0].where;
  expect(where.OR).toEqual([{ reworkClass: null }, { reworkClass: "DEFECT" }]);
});
```

(o mock de `db.reworkEvent.findMany` já existe no arquivo; se necessário resolver `[]`.)

- [ ] **Step 2: Run → fail**

Run: `npx vitest run __tests__/lib/actions/revert-rework.test.ts __tests__/lib/actions/rework-reporting.test.ts`
Expected: FAIL (sourceAssigneeId ausente; where.OR ausente).

- [ ] **Step 3: Implementar a captura na reversão**

Em `lib/actions/task.ts` `revertTaskStage`, imediatamente ANTES do bloco `// 4c. Reativar a etapa-alvo`:

```ts
// Captura quem executou a etapa-alvo ANTES de limpar o assignee (base do
// FTR por pessoa — exceção deliberada a P2; nunca usado p/ ranking).
const targetInstance = await tx.taskActiveStage.findUnique({
  where: { taskId_stageId: { taskId, stageId: revertToStageId } },
  select: { assigneeId: true },
});
const sourceAssigneeId = targetInstance?.assigneeId ?? null;
```

No `tx.reworkEvent.create` (bloco 4c-bis), adicionar ao `data`:

```ts
          byUserId: currentUserId,
          sourceAssigneeId,
```

- [ ] **Step 4: Implementar o defeito-only em `buildReworkWhere`**

Em `lib/actions/reporting.ts` `buildReworkWhere`, antes do `return where;`:

```ts
// Defeito-only: não-classificado (null) + DEFECT contam; LEGITIMATE não.
// (Prisma `not` sobre nullable não inclui null, por isso o OR explícito.)
where.OR = [{ reworkClass: null }, { reworkClass: "DEFECT" }];
```

- [ ] **Step 5: Run → pass + regressão**

Run: `npx vitest run __tests__/lib/actions/revert-rework.test.ts __tests__/lib/actions/rework-reporting.test.ts` → PASS.
Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → verde.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/task.ts lib/actions/reporting.ts __tests__/lib/actions/revert-rework.test.ts __tests__/lib/actions/rework-reporting.test.ts
git commit -m "feat(rework): captura sourceAssigneeId na reversão + FTR defeito-only (3b.T2)"
```

---

### Task 3: `person-metrics` — `getPersonQuality` + `getPersonReworkEvents`

**Files:**

- Modify: `lib/actions/person-metrics.ts`
- Test: `__tests__/lib/actions/person-metrics.test.ts` (append)

**Interfaces:**

- Consumes: `requireSelfOrManager` (existente); `ReworkEvent`/`sourceAssigneeId` (T1).

- [ ] **Step 1: Write the failing test (append)**

```ts
import { getPersonQuality, getPersonReworkEvents } from "@/lib/actions/person-metrics";

describe("getPersonQuality", () => {
  beforeEach(() => vi.clearAllMocks());
  it("FTR = 1 − defeitos/concluídas; split interno/cliente; null se 0 concluídas", async () => {
    // precisa de count (completed) e findMany (defect returns) mockados
    (db as any).taskActiveStage.count = vi.fn().mockResolvedValue(4);
    (db as any).reworkEvent = { findMany: vi.fn().mockResolvedValue([{ kind: "CLIENT" }]) };
    const r = await getPersonQuality("u1", { from: new Date(0), to: new Date() });
    expect(r).toEqual({
      completed: 4,
      defectReturns: 1,
      firstTimeRight: 0.75,
      internal: 0,
      client: 1,
    });
  });
});

describe("getPersonReworkEvents", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lista retornos da pessoa (sourceAssigneeId), newest first, todas as classes", async () => {
    (db as any).reworkEvent = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          {
            id: "r1",
            at: new Date(0),
            kind: "INTERNAL",
            reason: "x",
            reworkClass: null,
            sourceStage: { name: "Design" },
            task: { title: "Arte 1" },
          },
        ]),
    };
    const rows = await getPersonReworkEvents("u1", 20);
    const arg = (db as any).reworkEvent.findMany.mock.calls[0][0];
    expect(arg.where.sourceAssigneeId).toBe("u1");
    expect(rows[0]).toMatchObject({
      id: "r1",
      taskTitle: "Arte 1",
      sourceStageName: "Design",
      reworkClass: null,
    });
  });
});
```

> Nota ao implementador: adicionar `taskActiveStage.count` e `reworkEvent.findMany` ao mock `@/lib/prisma` do arquivo (no `vi.mock` do topo), não só via `(db as any)`. Ajustar o mock existente para incluir esses métodos.

- [ ] **Step 2: Run → fail** — `npx vitest run __tests__/lib/actions/person-metrics.test.ts` → FAIL.

- [ ] **Step 3: Implementar** (em `lib/actions/person-metrics.ts`)

```ts
// Predicado defeito-only reutilizado (null + DEFECT contam; LEGITIMATE não).
const DEFECT_ONLY = [{ reworkClass: null as const }, { reworkClass: "DEFECT" as const }];

export interface PersonQuality {
  completed: number;
  defectReturns: number;
  firstTimeRight: number | null;
  internal: number;
  client: number;
}

/** Qualidade da pessoa na janela: FTR defeito-only + split interno/cliente.
 * Auto-referenciado (nunca comparativo). Atribuição confundida → tendência+contexto. */
export async function getPersonQuality(
  userId: string,
  range: { from: Date; to: Date }
): Promise<PersonQuality> {
  await requireSelfOrManager(userId);
  const [completed, defects] = await Promise.all([
    prisma.taskActiveStage.count({
      where: {
        assigneeId: userId,
        status: "COMPLETED",
        completedAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.reworkEvent.findMany({
      where: { sourceAssigneeId: userId, at: { gte: range.from, lte: range.to }, OR: DEFECT_ONLY },
      select: { kind: true },
    }),
  ]);
  const internal = defects.filter((d) => d.kind === "INTERNAL").length;
  const client = defects.length - internal;
  const firstTimeRight =
    completed === 0 ? null : Math.max(0, Math.min(1, 1 - defects.length / completed));
  return { completed, defectReturns: defects.length, firstTimeRight, internal, client };
}

export interface PersonReworkItem {
  id: string;
  at: string;
  taskTitle: string;
  sourceStageName: string;
  kind: "INTERNAL" | "CLIENT";
  reason: string;
  reworkClass: "DEFECT" | "LEGITIMATE" | null;
}

/** Retornos atribuídos à pessoa (todas as classes, p/ o gestor reclassificar). */
export async function getPersonReworkEvents(
  userId: string,
  limit = 20
): Promise<PersonReworkItem[]> {
  await requireSelfOrManager(userId);
  const rows = await prisma.reworkEvent.findMany({
    where: { sourceAssigneeId: userId },
    orderBy: { at: "desc" },
    take: limit,
    select: {
      id: true,
      at: true,
      kind: true,
      reason: true,
      reworkClass: true,
      sourceStage: { select: { name: true } },
      task: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    taskTitle: r.task.title,
    sourceStageName: r.sourceStage.name,
    kind: r.kind,
    reason: r.reason,
    reworkClass: r.reworkClass,
  }));
}
```

- [ ] **Step 4: Run → pass + verificar** — focused PASS; `npx tsc --noEmit` 0; `npx vitest run` verde.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/person-metrics.ts __tests__/lib/actions/person-metrics.test.ts
git commit -m "feat(people): getPersonQuality + getPersonReworkEvents defeito-only (3b.T3)"
```

---

### Task 4: Reclassificação — action + toggle + seção Qualidade no `/admin/users/[id]`

**Files:**

- Create: `lib/actions/rework-classify.ts`
- Create: `components/people/ReworkClassifyToggle.tsx`
- Modify: `app/[locale]/(protected)/admin/users/[userId]/page.tsx`
- Modify: `locales/pt-BR/admin.json`, `locales/es-ES/admin.json`
- Test: `__tests__/lib/actions/rework-classify.test.ts`

- [ ] **Step 1: Write the failing test (classifyReworkEvent)**

```ts
// __tests__/lib/actions/rework-classify.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { reworkEvent: { update: vi.fn().mockResolvedValue({}) } },
  prisma: {},
}));
import prisma from "@/lib/prisma";
import { classifyReworkEvent } from "@/lib/actions/rework-classify";
const db = prisma as unknown as { reworkEvent: { update: ReturnType<typeof vi.fn> } };

describe("classifyReworkEvent", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejeita classe inválida sem tocar o banco", async () => {
    const res = await classifyReworkEvent("r1", "BOGUS" as never);
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(db.reworkEvent.update).not.toHaveBeenCalled();
  });
  it("grava a classe", async () => {
    await classifyReworkEvent("r1", "LEGITIMATE");
    expect(db.reworkEvent.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { reworkClass: "LEGITIMATE" },
    });
  });
});
```

- [ ] **Step 2: Run → fail; então implementar a action**

```ts
// lib/actions/rework-classify.ts
"use server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

/** Reclassifica um retorno (defeito vs legítimo). Só gestor/admin — ajusta o FTR
 * (da pessoa e da etapa). A pessoa NÃO reclassifica (evita gaming). */
export async function classifyReworkEvent(
  reworkEventId: string,
  reworkClass: "DEFECT" | "LEGITIMATE"
): Promise<{ error?: string } | void> {
  await requireManagerOrAdmin();
  if (reworkClass !== "DEFECT" && reworkClass !== "LEGITIMATE") {
    return { error: "Classificação inválida." };
  }
  await prisma.reworkEvent.update({ where: { id: reworkEventId }, data: { reworkClass } });
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
}
```

Run o teste → PASS.

- [ ] **Step 3: Componente client `ReworkClassifyToggle`**

```tsx
// components/people/ReworkClassifyToggle.tsx
"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { classifyReworkEvent } from "@/lib/actions/rework-classify";

export default function ReworkClassifyToggle({
  reworkEventId,
  current,
}: {
  reworkEventId: string;
  current: "DEFECT" | "LEGITIMATE" | null;
}) {
  const t = useTranslations("admin.users.quality");
  const router = useRouter();
  const { run, isPending } = useServerAction(classifyReworkEvent, {
    onSuccess: () => router.refresh(),
  });
  return (
    <div className="flex gap-1">
      {(["DEFECT", "LEGITIMATE"] as const).map((c) => (
        <button
          key={c}
          type="button"
          disabled={isPending}
          aria-pressed={current === c}
          onClick={() => run(reworkEventId, c)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium border disabled:opacity-50 ${
            current === c
              ? c === "DEFECT"
                ? "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300"
                : "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {t(c === "DEFECT" ? "classDefect" : "classLegitimate")}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Seção Qualidade em `/admin/users/[userId]/page.tsx`**

Buscar (no bloco de fetches, junto dos de 3a):

```ts
const [quality, reworkItems] = await Promise.all([
  getPersonQuality(userId, { from: monthStart, to: monthEnd }),
  getPersonReworkEvents(userId, 20),
]);
```

(imports: `getPersonQuality, getPersonReworkEvents` de `@/lib/actions/person-metrics`; `ReworkClassifyToggle` de `@/components/people/ReworkClassifyToggle`.)
Renderizar (após os cards de 3a):

```tsx
<div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mt-6">
  <h2 className="text-lg font-bold text-foreground mb-1">{t("qualityTitle")}</h2>
  <p className="text-xs text-muted-foreground mb-4">{t("qualityConfoundNote")}</p>
  <div className="flex flex-wrap gap-6 mb-4">
    <div>
      <div className="text-xs text-muted-foreground">{t("ftrLabel")}</div>
      <div className="text-2xl font-bold">
        {quality.firstTimeRight == null ? "—" : `${Math.round(quality.firstTimeRight * 100)}%`}
      </div>
    </div>
    <div>
      <div className="text-xs text-muted-foreground">{t("defectsLabel")}</div>
      <div className="text-sm">
        {t("defectsSplit", { internal: quality.internal, client: quality.client })}
      </div>
    </div>
  </div>
  {reworkItems.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t("noReturns")}</p>
  ) : (
    <ul className="divide-y divide-border">
      {reworkItems.map((r) => (
        <li key={r.id} className="py-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{r.taskTitle}</div>
            <div className="text-xs text-muted-foreground">
              {r.sourceStageName} · {t(r.kind === "INTERNAL" ? "kindInternal" : "kindClient")}
            </div>
            {r.reason && <div className="text-xs italic text-muted-foreground">“{r.reason}”</div>}
          </div>
          <ReworkClassifyToggle reworkEventId={r.id} current={r.reworkClass} />
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 5: i18n em `admin.json` → `users.quality`** (pt-BR + es-ES, chaves idênticas, es real):
      `qualityTitle`, `qualityConfoundNote` ("Boa parte da variação é do sistema; leia com os motivos, não como nota."), `ftrLabel`, `defectsLabel`, `defectsSplit` ("{internal} interno · {client} cliente"), `noReturns`, `kindInternal`, `kindClient`, `classDefect` ("Defeito"), `classLegitimate` ("Legítimo"). Traduções es reais equivalentes.

- [ ] **Step 6: Verificar** — `tsc` 0; `vitest run __tests__/i18n` paridade; `next build` limpo.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/rework-classify.ts components/people/ReworkClassifyToggle.tsx "app/[locale]/(protected)/admin/users/[userId]/page.tsx" locales/pt-BR/admin.json locales/es-ES/admin.json __tests__/lib/actions/rework-classify.test.ts
git commit -m "feat(admin): seção Qualidade por pessoa + reclassificação (3b.T4)"
```

---

### Task 5: "Meu foco" — qualidade própria (read-only)

**Files:**

- Modify: `components/dashboard/MyGrowthWidget.tsx`
- Modify: `locales/pt-BR/dashboard.json`, `locales/es-ES/dashboard.json`

- [ ] **Step 1: Estender o `MyGrowthWidget`**

Buscar também `getPersonQuality(userId, { from: start, to: end })` e `getPersonReworkEvents(userId, 10)`. Renderizar, abaixo do bloco de 3a, o FTR próprio + a lista de retornos com motivos **sem toggle** (read-only). Estrutura análoga à seção admin, mas sem `ReworkClassifyToggle`.

- [ ] **Step 2: i18n em `dashboard.json` → `growth`** (novas chaves: `qualityTitle`, `ftr`, `noReturns`, `kindInternal`, `kindClient`, e reaproveitar `selfReferencedNote`) — pt-BR + es-ES, es real.

- [ ] **Step 3: Verificar** — `tsc` 0; `vitest run` verde (paridade incl.); `next build` limpo.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/MyGrowthWidget.tsx locales/pt-BR/dashboard.json locales/es-ES/dashboard.json
git commit -m "feat(dashboard): qualidade própria (FTR + retornos, read-only) no Meu foco (3b.T5)"
```

---

### Task 6: Registrar a exceção a P2 na biblioteca

**Files:**

- Modify: `docs/biblioteca-de-conhecimento.md`

- [ ] **Step 1: Registrar a exceção**

Em **§1 P2** (após o "Exige/proíbe"), adicionar uma nota:

> **Exceção registrada (3b):** existe UMA métrica de qualidade ligada à pessoa (FTR
> por pessoa), decisão deliberada e informada do dono do produto, **cercada** por:
> auto-referenciada/nunca comparativa; defeito-only via reclassificação humana
> (gestor); motivos sempre à vista; reclassificação só do gestor; acesso fail-closed;
> zero pay/rank. Fora dessas salvaguardas, P2 continua valendo integralmente.

Em **§5 (anti-features)**, na linha de "Ranking individual", acrescentar: "— exceto o
FTR-por-pessoa **auto-referenciado** da 3b (não é ranking: não compara/ordena pessoas)."

- [ ] **Step 2: Commit**

```bash
git add docs/biblioteca-de-conhecimento.md
git commit -m "docs: registra exceção a P2 (FTR por pessoa, 3b) na biblioteca"
```

---

## Verificação final (whole-branch)

- `tsc` 0 · `vitest` verde · `next build` limpo · paridade i18n.
- Migração `20260722180000_add_rework_class_and_source_assignee` pendente de `prisma migrate deploy`.
- Smoke manual: reverter uma tarefa (com etapa-alvo atribuída) → o retorno aparece no perfil da pessoa; reclassificar como "legítimo" → FTR sobe (pessoa E etapa); a pessoa vê o próprio em Meu foco, sem toggle.

## Notas de escopo (fora deste plano)

- FTR por pessoa vale só a partir da migração (eventos antigos sem `sourceAssigneeId`).
- v2 do subsistema 1 (experiência como largura de banda) → spec próprio.
