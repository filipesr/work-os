# Etapas opcionais por tarefa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que, ao criar uma tarefa, etapas do template sejam deixadas de fora daquela demanda (opcionais vêm desmarcadas; normais vêm marcadas mas desmarcáveis), sem criar nenhuma linha para as excluídas e sem afetar o template compartilhado nem outras tarefas.

**Architecture:** Um flag `TemplateStage.optional` marca etapas opcionais. No form de criação, cada etapa tem checkbox; só as selecionadas viram `TaskActiveStage`. O motor de ativação passa a recomputar a prontidão de todas as etapas **incluídas** por uma função pura (`computeStageReadiness`), tratando pré-requisito **sem linha nesta tarefa** como satisfeito — o que faz o _pass-through_ por etapas excluídas no meio da cadeia. O `upsert` deixa de criar linhas (nunca ressuscita uma etapa excluída).

**Tech Stack:** Next.js 15 (App Router, Server Actions) · Prisma 6 · Vitest · next-intl

## Global Constraints

- Commits direto em `main` (projeto solo, sem branch/PR).
- Testes: `npx vitest run <arquivo>`; lint-staged roda prettier/eslint no commit.
- Nada pode tocar `TemplateStage`/`StageDependency` de forma a afetar outras tarefas — mudanças de exclusão são por-tarefa.
- Mensagem de commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `prisma/schema.prisma` — campo `optional` em `TemplateStage` (+ migração gerada).
- `lib/validations.ts` — `templateStageSchema` ganha `optional`.
- `lib/actions/stage.ts` — create/update persistem `optional`.
- `components/admin/CreateStageForm.tsx`, `components/admin/StagesList.tsx` — checkbox `optional` nos dois forms (+ interface `Stage`).
- `app/actions/templateActions.ts` — `getTemplateStagePreview` retorna `optional`.
- `components/tasks/CreateTaskForm.tsx` — checkbox por etapa no preview.
- `lib/stage-assignment-helpers.ts` — `parseSelectedStages`, `createTaskStages` seletivo, `computeStageReadiness` (pura).
- `lib/actions/task.ts` — `createTask`/`createTasksBatch` passam etapas selecionadas; `activateNextStages` reescrito sobre `computeStageReadiness`.
- `__tests__/lib/actions/activate-next-stages.test.ts`, `__tests__/lib/stage-assignment-helpers.test.ts` (ou equivalente) — testes.

---

## Task 1: Schema — flag `optional` em TemplateStage

**Files:**

- Modify: `prisma/schema.prisma` (model `TemplateStage`, junto a `defaultMediaType`)
- Create: `prisma/migrations/<timestamp>_template_stage_optional/migration.sql` (gerada)

**Interfaces:**

- Produces: coluna `TemplateStage.optional Boolean @default(false)`.

- [ ] **Step 1:** Adicionar o campo ao model `TemplateStage`:

```prisma
  defaultMediaType ArtifactMediaType?
  optional         Boolean           @default(false)
```

- [ ] **Step 2:** Gerar a migração:

Run: `npx prisma migrate dev --name template_stage_optional`
Expected: cria a migração, aplica no DB de dev, regenera o client. Migração aditiva (default false).

- [ ] **Step 3:** Commit.

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(stages): add optional flag to TemplateStage"
```

---

## Task 2: Validação + actions persistem `optional`

**Files:**

- Modify: `lib/validations.ts:112-129` (`templateStageSchema`)
- Modify: `lib/actions/stage.ts:9-57` (create) e `:59-111` (update)

**Interfaces:**

- Consumes: coluna `optional` (Task 1).
- Produces: `templateStageSchema` valida `optional: boolean`; `createTemplateStage`/`updateTemplateStage` gravam `optional`.

- [ ] **Step 1:** Em `templateStageSchema`, adicionar antes de `dependencies`:

```ts
  // Etapa opcional: aparece desmarcada na criação da tarefa. Checkbox → "on"/ausente.
  optional: z.preprocess((v) => v === "on" || v === true, z.boolean()).default(false),
```

- [ ] **Step 2:** Em `createTemplateStage`, incluir no objeto do `safeParse` (após `defaultMediaType`):

```ts
    optional: formData.get("optional") ?? undefined,
```

Desestruturar `optional` de `parsed.data` e adicionar ao `create.data`:

```ts
        defaultMediaType: defaultMediaType ?? null,
        optional,
```

- [ ] **Step 3:** Em `updateTemplateStage`, mesma adição no `safeParse`, na desestruturação e no `update.data` (`optional,`).

- [ ] **Step 4:** Commit.

```bash
git add lib/validations.ts lib/actions/stage.ts
git commit -m "feat(stages): persist optional flag in template stage actions"
```

---

## Task 3: UI de template — checkbox `optional` (criar e editar)

**Files:**

- Modify: `components/admin/CreateStageForm.tsx:140-160` (após o bloco `defaultMediaType`)
- Modify: `components/admin/StagesList.tsx:9-30` (interface `Stage`) e `:106-178` (grid de edição)

**Interfaces:**

- Consumes: actions da Task 2.
- Produces: admin marca/desmarca `optional` por etapa em ambos os forms (evita o bug de reset que já ocorre com `defaultMediaType` no form de edição).

- [ ] **Step 1:** Em `CreateStageForm.tsx`, adicionar dentro do `grid` (após o `<div>` do `defaultMediaType`, antes de fechar o grid):

```tsx
<div className="flex items-end">
  <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
    <input type="checkbox" name="optional" className="h-4 w-4" />
    Etapa opcional
  </label>
</div>
```

- [ ] **Step 2:** Em `StagesList.tsx`, adicionar `optional: boolean;` à interface `Stage` (após `defaultTeamId`).

- [ ] **Step 3:** No grid de edição (`StagesList.tsx`), adicionar após o `<div>` do SLA (`expectedDurationHours`):

```tsx
<div className="flex items-end">
  <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
    <input type="checkbox" name="optional" defaultChecked={stage.optional} className="h-4 w-4" />
    Etapa opcional
  </label>
</div>
```

- [ ] **Step 4:** Verificação manual/typecheck.

Run: `npx tsc --noEmit` (ou o script de typecheck do projeto)
Expected: sem erros (o `optional` já vem do client Prisma via `getWorkflowTemplate`, que usa `include` — scalars automáticos).

- [ ] **Step 5:** Commit.

```bash
git add components/admin/CreateStageForm.tsx components/admin/StagesList.tsx
git commit -m "feat(stages): optional checkbox in template create/edit forms"
```

---

## Task 4: Seleção de etapas na criação da tarefa

**Files:**

- Modify: `app/actions/templateActions.ts:26-45` (`getTemplateStagePreview` retorna `optional`)
- Modify: `components/tasks/CreateTaskForm.tsx:218-243` (checkbox por etapa)
- Modify: `lib/stage-assignment-helpers.ts` (`parseSelectedStages` + `createTaskStages` seletivo)
- Modify: `lib/actions/task.ts:73-94` (`createTask`) e `:153` (`createTasksBatch`)
- Test: `__tests__/lib/stage-assignment-helpers.test.ts`

**Interfaces:**

- Consumes: `optional` no preview.
- Produces:
  - `parseSelectedStages(formData: FormData): Set<string>` — stageIds cujo checkbox `stage:<id>` veio marcado.
  - `createTaskStages(tx, { taskId, templateId, userId, assignments?, selectedStageIds })` — cria linhas só para `selectedStageIds` (ou todas as não-opcionais quando `selectedStageIds` é omitido, p/ batch).

- [ ] **Step 1 (test):** Escrever teste para `parseSelectedStages` e a regra de seleção do `createTaskStages` (mock de `tx`):

```ts
import { describe, it, expect, vi } from "vitest";
import { parseSelectedStages, createTaskStages } from "@/lib/stage-assignment-helpers";

describe("parseSelectedStages", () => {
  it("coleta só os stageIds marcados", () => {
    const fd = new FormData();
    fd.append("stage:s1", "on");
    fd.append("stage:s3", "on");
    fd.append("assignee:s1", "u1");
    const sel = parseSelectedStages(fd);
    expect([...sel].sort()).toEqual(["s1", "s3"]);
  });
});

describe("createTaskStages seleção", () => {
  const stages = [
    { id: "s1", optional: false, order: 1, defaultTeamId: null, defaultTeam: null },
    { id: "s2", optional: true, order: 2, defaultTeamId: null, defaultTeam: null },
    { id: "s3", optional: false, order: 3, defaultTeamId: null, defaultTeam: null },
  ];
  function makeTx() {
    return {
      templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
      taskActiveStage: { create: vi.fn().mockResolvedValue({}) },
      taskStageLog: { create: vi.fn().mockResolvedValue({}) },
    } as any;
  }

  it("cria só as selecionadas; entrada = menor order selecionada", async () => {
    const tx = makeTx();
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      selectedStageIds: new Set(["s2", "s3"]),
    });
    const created = tx.taskActiveStage.create.mock.calls.map((c: any) => c[0].data);
    expect(created.map((d: any) => d.stageId).sort()).toEqual(["s2", "s3"]);
    const s2 = created.find((d: any) => d.stageId === "s2");
    expect(s2.status).toBe("ACTIVE"); // menor order entre selecionadas
  });

  it("sem selectedStageIds inclui só as não-opcionais (batch)", async () => {
    const tx = makeTx();
    await createTaskStages(tx, { taskId: "t1", templateId: "tpl", userId: "u1" });
    const created = tx.taskActiveStage.create.mock.calls.map((c: any) => c[0].data.stageId);
    expect(created.sort()).toEqual(["s1", "s3"]);
  });

  it("lança se nenhuma etapa selecionada", async () => {
    const tx = makeTx();
    await expect(
      createTaskStages(tx, {
        taskId: "t1",
        templateId: "tpl",
        userId: "u1",
        selectedStageIds: new Set(),
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2 (run/fail):** `npx vitest run __tests__/lib/stage-assignment-helpers.test.ts` → FAIL (`parseSelectedStages` inexistente / assinatura antiga).

- [ ] **Step 3 (impl):** Em `lib/stage-assignment-helpers.ts`:

Adicionar helper:

```ts
/** Reads `stage:<stageId>` checkbox fields; returns the set of CHECKED stageIds
 * (unchecked checkboxes are simply absent from FormData). */
export function parseSelectedStages(formData: FormData): Set<string> {
  const out = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith("stage:")) out.add(key.slice("stage:".length));
  }
  return out;
}
```

Reescrever `createTaskStages` para: buscar `optional` no `select`; derivar o conjunto incluído; validar ≥1; entrada = menor `order` incluída:

```ts
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    templateId: string;
    userId: string;
    assignments?: Record<string, string>;
    selectedStageIds?: ReadonlySet<string>;
  }
): Promise<void> {
  const { taskId, templateId, userId, assignments = {}, selectedStageIds } = args;

  const stages = await tx.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      optional: true,
      defaultTeamId: true,
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });
  if (stages.length === 0) throw new Error("Template is misconfigured; no stages found.");

  // Included = explicitly selected (create form) OR, when no selection is given
  // (batch), all NON-optional stages.
  const included = stages.filter((s) =>
    selectedStageIds ? selectedStageIds.has(s.id) : !s.optional
  );
  if (included.length === 0) {
    throw new Error("At least one stage must be included in the task.");
  }

  // Entry = lowest-order INCLUDED stage (stages already sorted asc).
  const startStageId = included[0].id;

  for (const stage of included) {
    const isStart = stage.id === startStageId;
    const requested = assignments[stage.id];
    const assigneeId = requested && isValidStageAssignee(stage, requested) ? requested : null;

    await tx.taskActiveStage.create({
      data: { taskId, stageId: stage.id, status: isStart ? "ACTIVE" : "INACTIVE", assigneeId },
    });
    if (isStart) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: stage.id, enteredAt: new Date(), exitedAt: null, userId },
      });
    }
  }
}
```

- [ ] **Step 4 (run/pass):** `npx vitest run __tests__/lib/stage-assignment-helpers.test.ts` → PASS.

- [ ] **Step 5 (wire actions):** Em `lib/actions/task.ts`:
  - `createTask` (~73): após `const assignments = parseStageAssignments(formData);` adicionar
    `const selectedStageIds = parseSelectedStages(formData);` e passar `selectedStageIds` ao `createTaskStages` (~89). Importar `parseSelectedStages`.
  - `createTasksBatch` (~153): deixar sem `selectedStageIds` (usa default = só não-opcionais). Nenhuma mudança de assinatura necessária.

- [ ] **Step 6 (preview):** Em `app/actions/templateActions.ts`, adicionar `optional: true` ao `select` de `getTemplateStagePreview`.

- [ ] **Step 7 (form):** Em `components/tasks/CreateTaskForm.tsx`, no `<li>` do preview (~220), adicionar um checkbox à esquerda do nome:

```tsx
<div className="flex items-center gap-3 min-w-0">
  <input
    type="checkbox"
    name={`stage:${stage.id}`}
    defaultChecked={!stage.optional}
    className="h-4 w-4 shrink-0"
    aria-label={stage.name}
  />
  <div className="min-w-0">
    <span className="text-sm font-medium text-foreground">
      {index + 1}. {stage.name}
      {stage.optional && <span className="ml-2 text-xs text-muted-foreground">(opcional)</span>}
    </span>
    {stage.defaultTeam && (
      <span className="ml-2 text-xs text-muted-foreground">{stage.defaultTeam.name}</span>
    )}
  </div>
</div>
```

(substitui o `<div className="min-w-0">…</div>` atual; mantém o `<StageAssigneeSelect>` à direita).

- [ ] **Step 8:** Commit.

```bash
git add lib/stage-assignment-helpers.ts lib/actions/task.ts app/actions/templateActions.ts components/tasks/CreateTaskForm.tsx __tests__/lib/stage-assignment-helpers.test.ts
git commit -m "feat(tasks): select which template stages to include on task creation"
```

---

## Task 5: Motor — `computeStageReadiness` (pura) + reescrita de `activateNextStages`

**Files:**

- Modify: `lib/stage-assignment-helpers.ts` (nova função pura `computeStageReadiness`)
- Modify: `lib/actions/task.ts:677-776` (`activateNextStages`)
- Test: `__tests__/lib/stage-assignment-helpers.test.ts` (pura) e `__tests__/lib/actions/activate-next-stages.test.ts` (integração mockada)

**Interfaces:**

- Consumes: linhas incluídas (Task 4) — "etapa sem linha nesta tarefa" = excluída.
- Produces:
  ```ts
  computeStageReadiness(args: {
    stages: { id: string; dependsOnIds: string[] }[];   // TODAS as etapas do template
    includedStageIds: ReadonlySet<string>;              // etapas com linha nesta tarefa
    completedStageIds: ReadonlySet<string>;             // linhas COMPLETED
    statusByStage: ReadonlyMap<string, "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED">;
  }): Map<string, "ACTIVE" | "BLOCKED">
  ```
  Retorna, para cada etapa **incluída** hoje `INACTIVE`/`BLOCKED`, o status recomputado (`ACTIVE` se todos os pré-requisitos satisfeitos; `BLOCKED` se ≥1 pré-requisito incluído ainda pendente). Não inclui etapas sem mudança relevante nem `ACTIVE`/`COMPLETED` (no-regress).

Regra de "pré-requisito satisfeito": `completed OU não-incluído (excluído)`. Uma etapa fica `BLOCKED` (não `INACTIVE`) quando **algum** pré-requisito incluído já está `COMPLETED` mas nem todos — i.e., a etapa já foi "alcançada".

- [ ] **Step 1 (test):** Testes da função pura:

```ts
import { computeStageReadiness } from "@/lib/stage-assignment-helpers";

const linear = [
  { id: "A", dependsOnIds: [] },
  { id: "B", dependsOnIds: ["A"] },
  { id: "C", dependsOnIds: ["B"] },
];

it("pass-through: B excluída → concluir A ativa C", () => {
  const r = computeStageReadiness({
    stages: linear,
    includedStageIds: new Set(["A", "C"]), // B excluída
    completedStageIds: new Set(["A"]),
    statusByStage: new Map([
      ["A", "COMPLETED"],
      ["C", "INACTIVE"],
    ]),
  });
  expect(r.get("C")).toBe("ACTIVE");
});

it("cadeia normal: concluir A ativa B, C fica BLOCKED", () => {
  const r = computeStageReadiness({
    stages: linear,
    includedStageIds: new Set(["A", "B", "C"]),
    completedStageIds: new Set(["A"]),
    statusByStage: new Map([
      ["A", "COMPLETED"],
      ["B", "INACTIVE"],
      ["C", "INACTIVE"],
    ]),
  });
  expect(r.get("B")).toBe("ACTIVE");
  expect(r.get("C")).toBeUndefined(); // nenhum prereq de C concluído → segue INACTIVE
});

it("não regride ACTIVE/COMPLETED", () => {
  const r = computeStageReadiness({
    stages: linear,
    includedStageIds: new Set(["A", "B", "C"]),
    completedStageIds: new Set(["A"]),
    statusByStage: new Map([
      ["A", "COMPLETED"],
      ["B", "ACTIVE"],
      ["C", "INACTIVE"],
    ]),
  });
  expect(r.has("B")).toBe(false);
});

it("prereqs mistos (um excluído, um incluído pendente) → BLOCKED", () => {
  const stages = [
    { id: "A", dependsOnIds: [] },
    { id: "X", dependsOnIds: [] },
    { id: "D", dependsOnIds: ["A", "X"] },
  ];
  const r = computeStageReadiness({
    stages,
    includedStageIds: new Set(["A", "X", "D"]),
    completedStageIds: new Set(["A"]), // X incluída, ainda não concluída
    statusByStage: new Map([
      ["A", "COMPLETED"],
      ["X", "ACTIVE"],
      ["D", "INACTIVE"],
    ]),
  });
  expect(r.get("D")).toBe("BLOCKED");
});
```

- [ ] **Step 2 (run/fail):** `npx vitest run __tests__/lib/stage-assignment-helpers.test.ts` → FAIL (função inexistente).

- [ ] **Step 3 (impl):** Adicionar a função pura:

```ts
export function computeStageReadiness(args: {
  stages: { id: string; dependsOnIds: string[] }[];
  includedStageIds: ReadonlySet<string>;
  completedStageIds: ReadonlySet<string>;
  statusByStage: ReadonlyMap<string, "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED">;
}): Map<string, "ACTIVE" | "BLOCKED"> {
  const { stages, includedStageIds, completedStageIds, statusByStage } = args;
  const satisfied = (id: string) => completedStageIds.has(id) || !includedStageIds.has(id);
  const out = new Map<string, "ACTIVE" | "BLOCKED">();

  for (const stage of stages) {
    if (!includedStageIds.has(stage.id)) continue; // excluída: sem linha
    const cur = statusByStage.get(stage.id);
    if (cur === "ACTIVE" || cur === "COMPLETED") continue; // no-regress

    const allSatisfied = stage.dependsOnIds.every(satisfied);
    if (allSatisfied) {
      out.set(stage.id, "ACTIVE");
    } else {
      // "alcançada" = algum pré-requisito INCLUÍDO já concluído.
      const reached = stage.dependsOnIds.some(
        (id) => includedStageIds.has(id) && completedStageIds.has(id)
      );
      if (reached) out.set(stage.id, "BLOCKED");
    }
  }
  return out;
}
```

- [ ] **Step 4 (run/pass):** `npx vitest run __tests__/lib/stage-assignment-helpers.test.ts` → PASS.

- [ ] **Step 5 (rewrite activateNextStages):** Substituir o corpo (`lib/actions/task.ts:677-776`) por:

```ts
export async function activateNextStages(taskId: string, completedStageId: string) {
  try {
    // 1. Marca a etapa concluída (ACTIVE → COMPLETED).
    await prisma.taskActiveStage.updateMany({
      where: { taskId, stageId: completedStageId, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    // 2. Estado atual das linhas desta tarefa (incluídas).
    const rows = await prisma.taskActiveStage.findMany({
      where: { taskId },
      select: { stageId: true, status: true },
    });
    const includedStageIds = new Set(rows.map((r) => r.stageId));
    const completedStageIds = new Set(
      rows.filter((r) => r.status === "COMPLETED").map((r) => r.stageId)
    );
    const statusByStage = new Map(rows.map((r) => [r.stageId, r.status]));

    // 3. Grafo completo do template (inclui etapas excluídas, sem linha).
    const anchor = await prisma.templateStage.findUnique({
      where: { id: completedStageId },
      select: { templateId: true },
    });
    if (!anchor) return { activated: [], blocked: [] };

    const templateStages = await prisma.templateStage.findMany({
      where: { templateId: anchor.templateId },
      select: {
        id: true,
        name: true,
        dependencies: { select: { dependsOnStageId: true } },
        defaultTeam: { select: { id: true, name: true, members: { select: { id: true } } } },
      },
    });
    const stageById = new Map(templateStages.map((s) => [s.id, s]));

    // 4. Recomputa prontidão (pass-through por excluídas embutido).
    const transitions = computeStageReadiness({
      stages: templateStages.map((s) => ({
        id: s.id,
        dependsOnIds: s.dependencies.map((d) => d.dependsOnStageId),
      })),
      includedStageIds,
      completedStageIds,
      statusByStage,
    });

    // 5. Aplica só as mudanças reais (preserva assigneeId — não incluir no data).
    const activated: (typeof templateStages)[number][] = [];
    const blocked: (typeof templateStages)[number][] = [];
    for (const [stageId, next] of transitions) {
      if (statusByStage.get(stageId) === next) continue; // sem mudança
      await prisma.taskActiveStage.updateMany({
        where: { taskId, stageId },
        data: { status: next },
      });
      const stage = stageById.get(stageId)!;
      if (next === "ACTIVE") activated.push(stage);
      else blocked.push(stage);
    }

    return { activated, blocked };
  } catch (error) {
    console.error("Error activating next stages:", error);
    throw error;
  }
}
```

Garantir o import de `computeStageReadiness` (mesmo módulo `@/lib/stage-assignment-helpers` de onde já vem `areAllPrerequisitesComplete`). Remover o uso de `areAllPrerequisitesComplete` aqui (a nova função o substitui neste caminho; a helper antiga segue usada por `previewNextStages`/`getAvailableNextStages`).

- [ ] **Step 6 (update integration test):** Reescrever `__tests__/lib/actions/activate-next-stages.test.ts` para o novo padrão de queries: mock de `taskActiveStage.updateMany` + `findMany` (retorna as linhas com status), `templateStage.findUnique` (templateId) e `templateStage.findMany` (grafo). Casos: preserva assignee (não escreve `assigneeId`); não regride ACTIVE/COMPLETED; ativa dependente pronto; deixa BLOCKED quando prereq pendente; **pass-through** por etapa excluída (linha ausente) ativa a seguinte.

- [ ] **Step 7 (run/pass):** `npx vitest run __tests__/lib/actions/activate-next-stages.test.ts __tests__/lib/stage-assignment-helpers.test.ts` → PASS.

- [ ] **Step 8:** Commit.

```bash
git add lib/stage-assignment-helpers.ts lib/actions/task.ts __tests__/lib/actions/activate-next-stages.test.ts __tests__/lib/stage-assignment-helpers.test.ts
git commit -m "feat(stages): readiness recompute with pass-through for excluded stages"
```

---

## Task 6: Legado — garantir linhas para tarefas antigas

**Files:**

- Investigate: histórico da pré-criação; existência de tarefas ativas sem linhas `TaskActiveStage`.
- Possibly Create: script/migração de backfill.

**Interfaces:**

- Consumes: semântica nova ("sem linha" = excluída).
- Produces: garantia de que nenhuma tarefa **legada** ativa fique sem linhas (o que, com o `upsert`-create removido, a deixaria travada).

- [ ] **Step 1:** Investigar se o backfill da pré-criação (plano 2026-06-26) já cobriu todas as tarefas. Checar `prisma/migrations` e a data de introdução da pré-criação vs. tarefas existentes.

Run (contra o DB de dev): consulta de diagnóstico — tarefas não `COMPLETED`/`CANCELLED` sem nenhuma `TaskActiveStage`:

```sql
SELECT t.id FROM "Task" t
LEFT JOIN "TaskActiveStage" tas ON tas."taskId" = t.id
WHERE tas.id IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED');
```

- [ ] **Step 2:** Se houver tarefas nessa condição, escrever backfill (script Prisma one-off) que cria as linhas faltantes para **todas** as etapas do template da tarefa, com status derivado do estado atual (entrada ACTIVE, resto INACTIVE/BLOCKED conforme dependências). Se **não** houver, documentar no plano/commit que o legado está coberto e nenhum backfill é necessário.

- [ ] **Step 3:** Commit (script ou nota).

```bash
git add -A
git commit -m "chore(stages): backfill legacy tasks missing active-stage rows (or verify none)"
```

---

## Verificação end-to-end (manual)

1. `pnpm dev`. Como admin, editar um template: marcar 1 etapa como **opcional** (salvar) e conferir que reabre marcada corretamente (sem reset).
2. Criar uma demanda desse template: a etapa opcional aparece **desmarcada**; as normais **marcadas**. Desmarcar uma etapa normal do meio (com dependente depois dela) e marcar a opcional. Criar.
3. Abrir a demanda: a etapa excluída **não aparece** no fluxo. Concluir as etapas em ordem e confirmar que a etapa que vinha **depois** da excluída **ativa normalmente** (pass-through).
4. Testar **retorno** (revert) de etapa: a etapa excluída **não** surge como opção.
5. `npx vitest run` (suite completa) → verde.

## Self-review (coberto)

- Spec §Decisões → Tasks 1-5. §"Semântica de incluída e tarefas legadas" → Task 6. §Testes → Steps de teste em 4 e 5 + verificação manual.
- Sem placeholders: código completo em cada step de código.
- Consistência de tipos: `parseSelectedStages` (Set), `createTaskStages({…, selectedStageIds})`, `computeStageReadiness(args)` usados de forma idêntica em produtores/consumidores.

---

## Resultado da execução (2026-07-06)

Todas as tasks concluídas. Suíte completa verde (199/199); typecheck limpo nos arquivos tocados.

- **Task 6 (legado):** diagnóstico no DB de dev → **0 tarefas ativas sem linhas** `TaskActiveStage`
  (6 tarefas no total). Backfill **não necessário**. Observação para deploy: rodar o mesmo
  diagnóstico em produção antes de publicar; se houver tarefas legadas sem linhas, criar as
  linhas faltantes (o fallback de criação do `activateNextStages` foi removido, então tarefas
  sem linha ficariam travadas).
