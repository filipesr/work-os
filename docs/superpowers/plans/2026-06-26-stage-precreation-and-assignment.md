# Pré-criação de etapas + atribuição opcional de responsável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pré-criar todas as etapas de uma tarefa como `TaskActiveStage` na criação (etapas iniciais `ACTIVE`, demais `INACTIVE`), permitindo atribuir opcionalmente um responsável a qualquer etapa — tanto na criação (card de pré-visualização) quanto na conclusão de uma etapa (frente A) — usando o campo `assigneeId` já existente como fonte única da verdade.

**Architecture:** Hoje as etapas são criadas sob demanda: `createTask` cria só a 1ª etapa `ACTIVE`, e `activateNextStages` **cria** as próximas ao concluir. Passamos a **pré-criar todas** as etapas na criação da tarefa; `activateNextStages` deixa de criar e passa a **transicionar** linhas existentes (`INACTIVE`→`ACTIVE`/`BLOCKED`), preservando `assigneeId`. Um novo status `INACTIVE` é invisível a todos os consumidores atuais (que filtram por status conhecido), então a pré-criação "falha em segurança". A criação de etapas passa a existir em **um lugar só** (helper compartilhado).

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Prisma 6 (PostgreSQL), Zod 4, next-intl, Vitest 4 (com `prisma` mockado), Radix Select.

## Global Constraints

- **Sessão/estratégia de auth:** database sessions (PrismaAdapter). Não inventar JWT.
- **Permissões:** ações de mutação seguem `requireMemberOrHigher`/`requireAdmin`/`requireManagerOrAdmin` já existentes em `lib/permissions.ts`. Não criar novas.
- **i18n obrigatório:** toda string visível usa next-intl; adicionar chaves em `locales/pt-BR/*.json` **e** `locales/es-ES/*.json`.
- **Sem `any`:** usar tipos `Prisma.*` (o repo zerou `any` nas actions; manter).
- **Validação no servidor:** nunca confiar no front — todo `assigneeId` escolhido para uma etapa deve ser validado como **membro da `defaultTeam` daquela etapa**.
- **Verificação por task:** `pnpm tsc --noEmit` (0 erros) + `pnpm test run` (verde) ao fim de cada task.
- **Status enum:** manter `INACTIVE` **e** `BLOCKED` separados (decisão de produto). `INACTIVE` = ainda não alcançada; `BLOCKED` = alcançada, com dependência pendente.
- **"Minhas etapas":** mostra `ACTIVE` (e, opcionalmente, `BLOCKED`); **nunca** `INACTIVE`.
- **Premissa registrada:** fluxo é AND-join/fork paralelo, sem desvio condicional (XOR) — toda etapa é sempre alcançada, então pré-criar todas é válido. Pular etapa fica para o futuro via um status `SKIPPED` (não implementado aqui).

---

## File Structure

**Schema / migração**

- `prisma/schema.prisma` — adicionar `INACTIVE` ao enum `ActiveStageStatus`.

**Backend (lib/actions)**

- `lib/actions/task.ts` — modificar `createTask`, `createTasksBatch`, `activateNextStages`, `completeStageAndAdvance`, `revertTaskStage`; usar o helper novo.
- `lib/actions/stage-assignment.ts` — **novo**: helpers puros (`isValidStageAssignee`, `parseStageAssignments`) + `createTaskStages(tx, …)` (pré-criação) + `getTeamMembers`.
- `app/actions/templateActions.ts` — `getTemplateStagePreview` passa a incluir `defaultTeam { id, name, members }`.

**UI**

- `components/tasks/CreateTaskForm.tsx` — card de preview com `<select>` de responsável por etapa.
- `components/tasks/AdvanceStageButton.tsx` — no modal, `<select>` de responsável para cada próxima etapa.
- `components/ui/StageAssigneeSelect.tsx` — **novo**: select reutilizável (etapa → membros da equipe).

**i18n**

- `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json` — chaves do seletor de responsável.

**Migração de dados**

- `prisma/backfill-inactive-stages.ts` — **novo**: backfill de linhas `INACTIVE` para tarefas abertas pré-existentes.

**Testes**

- `__tests__/lib/actions/stage-assignment.test.ts` — **novo**.
- `__tests__/lib/actions/task-precreation.test.ts` — **novo**.

---

### Task 1: Adicionar status `INACTIVE` ao enum

**Files:**

- Modify: `prisma/schema.prisma:51-55`

**Interfaces:**

- Produces: valor de enum `ActiveStageStatus.INACTIVE` disponível em `@prisma/client`.

- [ ] **Step 1: Editar o enum**

Em `prisma/schema.prisma`, trocar o bloco do enum por:

```prisma
enum ActiveStageStatus {
  INACTIVE  // Pre-created but not yet reached (no predecessor completed)
  ACTIVE    // Ready to work - all dependencies met
  BLOCKED   // Reached but waiting for remaining dependencies to complete
  COMPLETED // Work finished on this stage
}
```

- [ ] **Step 2: Gerar client + migração**

Run: `pnpm prisma migrate dev --name add_inactive_stage_status`
Expected: migração criada e aplicada; `prisma generate` roda no `postinstall`. Se o ambiente não tiver DB, usar `pnpm prisma generate` e criar a migração SQL manualmente (`ALTER TYPE "ActiveStageStatus" ADD VALUE 'INACTIVE';`).

- [ ] **Step 3: Verificar tipos**

Run: `pnpm tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(stages): add INACTIVE status to ActiveStageStatus enum"
```

---

### Task 2: Helpers puros de atribuição + `getTeamMembers`

**Files:**

- Create: `lib/actions/stage-assignment.ts`
- Test: `__tests__/lib/actions/stage-assignment.test.ts`

**Interfaces:**

- Produces:
  - `type StageWithTeam = { id: string; defaultTeamId: string | null; defaultTeam: { members: { id: string }[] } | null }`
  - `isValidStageAssignee(stage: StageWithTeam, assigneeId: string): boolean` — true se `assigneeId` é membro da `defaultTeam` da etapa.
  - `parseStageAssignments(formData: FormData): Record<string, string>` — lê chaves `assignee:<stageId>` (ignora vazias) → `{ [stageId]: assigneeId }`.
  - `getTeamMembers(teamId: string): Promise<{ id: string; name: string | null; email: string | null }[]>`

- [ ] **Step 1: Escrever os testes (falhando)**

Create `__tests__/lib/actions/stage-assignment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidStageAssignee, parseStageAssignments } from "@/lib/actions/stage-assignment";

const stageWithTeam = {
  id: "s1",
  defaultTeamId: "t1",
  defaultTeam: { members: [{ id: "u1" }, { id: "u2" }] },
};

describe("isValidStageAssignee", () => {
  it("aceita um membro da equipe da etapa", () => {
    expect(isValidStageAssignee(stageWithTeam, "u1")).toBe(true);
  });
  it("rejeita quem não é membro", () => {
    expect(isValidStageAssignee(stageWithTeam, "u9")).toBe(false);
  });
  it("rejeita atribuição quando a etapa não tem equipe", () => {
    expect(isValidStageAssignee({ id: "s2", defaultTeamId: null, defaultTeam: null }, "u1")).toBe(
      false
    );
  });
});

describe("parseStageAssignments", () => {
  it("extrai pares stageId->assigneeId das chaves assignee:", () => {
    const fd = new FormData();
    fd.set("title", "x");
    fd.set("assignee:s1", "u1");
    fd.set("assignee:s2", ""); // vazio = sem atribuição, ignorar
    fd.set("assignee:s3", "u3");
    expect(parseStageAssignments(fd)).toEqual({ s1: "u1", s3: "u3" });
  });
  it("retorna objeto vazio quando não há chaves assignee:", () => {
    const fd = new FormData();
    fd.set("title", "x");
    expect(parseStageAssignments(fd)).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test run __tests__/lib/actions/stage-assignment.test.ts`
Expected: FAIL ("Failed to resolve import ... stage-assignment").

- [ ] **Step 3: Implementar o módulo**

Create `lib/actions/stage-assignment.ts`:

```ts
"use server";

import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

export type StageWithTeam = {
  id: string;
  defaultTeamId: string | null;
  defaultTeam: { members: { id: string }[] } | null;
};

/** True when `assigneeId` belongs to the stage's defaultTeam. Stages without a
 * team cannot be assigned. */
export function isValidStageAssignee(stage: StageWithTeam, assigneeId: string): boolean {
  if (!stage.defaultTeam) return false;
  return stage.defaultTeam.members.some((m) => m.id === assigneeId);
}

/** Reads `assignee:<stageId>` form fields into a { stageId: assigneeId } map,
 * skipping empty values (= "no assignment"). */
export function parseStageAssignments(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("assignee:")) continue;
    const stageId = key.slice("assignee:".length);
    const assigneeId = typeof value === "string" ? value.trim() : "";
    if (stageId && assigneeId) out[stageId] = assigneeId;
  }
  return out;
}

/** Members of a team, for the per-stage assignee selector. */
export async function getTeamMembers(
  teamId: string
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  await requireMemberOrHigher();
  if (!teamId) return [];
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
    },
  });
  return team?.members ?? [];
}
```

> Nota: `isValidStageAssignee` e `parseStageAssignments` são puros, mas o arquivo é `"use server"` por causa de `getTeamMembers`. Funções puras exportadas de um módulo server podem ser importadas normalmente em testes (não fazem I/O).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test run __tests__/lib/actions/stage-assignment.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/stage-assignment.ts __tests__/lib/actions/stage-assignment.test.ts
git commit -m "feat(stages): add assignment validation helpers and getTeamMembers"
```

---

### Task 3: Helper de pré-criação `createTaskStages`

Cria **todas** as etapas do template como `TaskActiveStage` dentro de uma transação: etapas **sem dependências** → `ACTIVE`; demais → `INACTIVE`. Aplica atribuições validadas. Cria `TaskStageLog` **apenas** para as etapas `ACTIVE` iniciais.

**Files:**

- Modify: `lib/actions/stage-assignment.ts`
- Test: `__tests__/lib/actions/task-precreation.test.ts`

**Interfaces:**

- Consumes: `Prisma.TransactionClient` (de `prisma.$transaction`).
- Produces:
  - `createTaskStages(tx, args: { taskId: string; templateId: string; userId: string; assignments?: Record<string, string> }): Promise<void>`
  - Comportamento: lê `templateStage` do template com `dependencies` e `defaultTeam.members`; cada etapa vira `TaskActiveStage` (`ACTIVE` se `dependencies.length === 0`, senão `INACTIVE`); `assigneeId` aplicado só se válido (`isValidStageAssignee`), senão `null`; um `TaskStageLog` (enteredAt=now) por etapa `ACTIVE`.

- [ ] **Step 1: Escrever o teste (falhando)**

Create `__tests__/lib/actions/task-precreation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskStages } from "@/lib/actions/stage-assignment";

function makeTx(stages: any[]) {
  return {
    templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
    taskActiveStage: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

const stages = [
  {
    id: "s1",
    order: 1,
    dependencies: [],
    defaultTeamId: "t1",
    defaultTeam: { members: [{ id: "u1" }] },
  },
  {
    id: "s2",
    order: 2,
    dependencies: [{ id: "d1" }],
    defaultTeamId: "t1",
    defaultTeam: { members: [{ id: "u1" }] },
  },
];

describe("createTaskStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria a etapa sem dependência como ACTIVE e a dependente como INACTIVE", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, { taskId: "task1", templateId: "tmpl1", userId: "creator" });

    const created = tx.taskActiveStage.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toEqual([
      { taskId: "task1", stageId: "s1", status: "ACTIVE", assigneeId: null },
      { taskId: "task1", stageId: "s2", status: "INACTIVE", assigneeId: null },
    ]);
  });

  it("loga apenas as etapas ACTIVE iniciais", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, { taskId: "task1", templateId: "tmpl1", userId: "creator" });
    expect(tx.taskStageLog.create).toHaveBeenCalledTimes(1);
    expect(tx.taskStageLog.create.mock.calls[0][0].data.stageId).toBe("s1");
  });

  it("aplica assignee válido e ignora assignee inválido (não-membro)", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, {
      taskId: "task1",
      templateId: "tmpl1",
      userId: "creator",
      assignments: { s1: "u1", s2: "u9" }, // u9 não é membro -> null
    });
    const created = tx.taskActiveStage.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created[0].assigneeId).toBe("u1");
    expect(created[1].assigneeId).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test run __tests__/lib/actions/task-precreation.test.ts`
Expected: FAIL ("createTaskStages is not a function").

- [ ] **Step 3: Implementar `createTaskStages`**

Append a `lib/actions/stage-assignment.ts`:

```ts
import { Prisma } from "@prisma/client";

/** Pre-creates ALL template stages for a task as TaskActiveStage rows.
 * Stages with no dependencies start ACTIVE; the rest start INACTIVE.
 * Assignments are applied only when valid (assignee ∈ stage.defaultTeam).
 * A TaskStageLog is opened only for the initial ACTIVE stages. */
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: { taskId: string; templateId: string; userId: string; assignments?: Record<string, string> }
): Promise<void> {
  const { taskId, templateId, userId, assignments = {} } = args;

  const stages = await tx.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      defaultTeamId: true,
      dependencies: { select: { id: true } },
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });

  if (stages.length === 0) {
    throw new Error("Template is misconfigured; no stages found.");
  }

  for (const stage of stages) {
    const isStart = stage.dependencies.length === 0;
    const requested = assignments[stage.id];
    const assigneeId = requested && isValidStageAssignee(stage, requested) ? requested : null;

    await tx.taskActiveStage.create({
      data: {
        taskId,
        stageId: stage.id,
        status: isStart ? "ACTIVE" : "INACTIVE",
        assigneeId,
      },
    });

    if (isStart) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: stage.id, enteredAt: new Date(), exitedAt: null, userId },
      });
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test run __tests__/lib/actions/task-precreation.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/stage-assignment.ts __tests__/lib/actions/task-precreation.test.ts
git commit -m "feat(stages): add createTaskStages pre-creation helper"
```

---

### Task 4: `createTask` e `createTasksBatch` usam o helper (frente B — backend)

**Files:**

- Modify: `lib/actions/task.ts:66-114` (createTask), `lib/actions/task.ts:162-188` (createTasksBatch)

**Interfaces:**

- Consumes: `createTaskStages`, `parseStageAssignments` (Task 2/3).
- Produces: `createTask` passa a pré-criar todas as etapas + aplicar atribuições enviadas no form (`assignee:<stageId>`).

- [ ] **Step 1: Importar helpers em `task.ts`**

No topo de `lib/actions/task.ts`, adicionar:

```ts
import { createTaskStages, parseStageAssignments } from "@/lib/actions/stage-assignment";
```

- [ ] **Step 2: Substituir o miolo da transação em `createTask`**

Trocar o bloco `prisma.$transaction` (linhas ~67-114) por:

```ts
const assignments = parseStageAssignments(formData);

const task = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  const newTask = await tx.task.create({
    data: {
      title,
      description: description || null,
      priority: priority || "MEDIUM",
      dueDate,
      status: "BACKLOG",
      projectId,
      assigneeId: null,
    },
  });

  await createTaskStages(tx, {
    taskId: newTask.id,
    templateId,
    userId,
    assignments,
  });

  return newTask;
});
```

(O `findFirst` da "firstStage" e os `create` de `taskActiveStage`/`taskStageLog` saem — agora vivem no helper.)

- [ ] **Step 3: Mesma troca em `createTasksBatch`**

No loop da transação (linhas ~163-187), trocar os `tx.taskActiveStage.create` + `tx.taskStageLog.create` por uma chamada ao helper (sem atribuições no batch):

```ts
for (const projectId of validIds) {
  const task = await tx.task.create({
    data: {
      title,
      description: null,
      priority: "MEDIUM",
      dueDate,
      status: "BACKLOG",
      projectId,
      assigneeId: null,
    },
  });
  await createTaskStages(tx, { taskId: task.id, templateId: input.templateId, userId });
}
```

Remover o `findFirst` de `firstStage` (linhas ~149-153) que ficou sem uso.

- [ ] **Step 4: Verificar tipos e testes**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/task.ts
git commit -m "feat(stages): pre-create all stages on task creation via helper"
```

---

### Task 5: `activateNextStages` — transição em vez de criação (preserva assignee)

**Files:**

- Modify: `lib/actions/task.ts:666-766`
- Test: `__tests__/lib/actions/task-precreation.test.ts` (adicionar describe)

**Interfaces:**

- Produces: `activateNextStages` transiciona `INACTIVE`→`ACTIVE` (deps completas) ou `INACTIVE`→`BLOCKED` (parciais), **sem** tocar `assigneeId`. Tolerante a linha ausente (legado): usa `upsert`.

- [ ] **Step 1: Escrever teste (falhando) do "preserva assignee ao ativar"**

Adicionar em `__tests__/lib/actions/task-precreation.test.ts`:

```ts
import { activateNextStages } from "@/lib/actions/task";

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
    stageDependency: { findMany: vi.fn() },
  },
  prisma: {},
}));

describe("activateNextStages preserva assignee ao ativar", () => {
  it("faz update de status sem incluir assigneeId no data", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;
    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }]) // dependentes de s1
      .mockResolvedValue([]); // checkAllDependenciesComplete -> sem deps
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "INACTIVE",
      assigneeId: "u1",
    });

    await activateNextStages("task1", "s1");

    const updateData = prisma.taskActiveStage.update.mock.calls.at(-1)?.[0]?.data ?? {};
    expect(updateData).toEqual({ status: "ACTIVE" }); // NÃO contém assigneeId
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test run __tests__/lib/actions/task-precreation.test.ts`
Expected: FAIL (hoje a função cria em vez de atualizar; data difere).

- [ ] **Step 3: Reescrever o loop de `activateNextStages`**

Trocar o bloco do `for (const dep of dependentStages)` (linhas ~704-759) por:

```ts
// 3. Para cada dependente, transicionar a linha PRÉ-CRIADA (nunca criar do zero).
for (const dep of dependentStages) {
  const stage = dep.stage;
  const allDepsComplete = await checkAllDependenciesComplete(taskId, stage.id);
  const nextStatus = allDepsComplete ? "ACTIVE" : "BLOCKED";

  const existing = await prisma.taskActiveStage.findUnique({
    where: { taskId_stageId: { taskId, stageId: stage.id } },
  });

  // Já trabalhada/finalizada: não regredir.
  if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED")) {
    continue;
  }

  // Transição preservando assigneeId (NÃO incluir assigneeId no data).
  // upsert cobre tarefas legadas sem a linha pré-criada (backfill tolerante).
  await prisma.taskActiveStage.upsert({
    where: { taskId_stageId: { taskId, stageId: stage.id } },
    update: { status: nextStatus },
    create: { taskId, stageId: stage.id, status: nextStatus },
  });

  if (nextStatus === "ACTIVE") activated.push(stage);
  else blocked.push(stage);
}
```

> Nota: o `update` propositalmente **não** inclui `assigneeId`, preservando quem foi pré-atribuído na criação. O log de etapa continua sendo criado no `completeStageAndAdvance`/fluxo existente — **não** criar log aqui para INACTIVE.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test run __tests__/lib/actions/task-precreation.test.ts && pnpm tsc --noEmit`
Expected: PASS; tsc 0 erros.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/task.ts __tests__/lib/actions/task-precreation.test.ts
git commit -m "feat(stages): activateNextStages transitions pre-created rows, preserves assignee"
```

---

### Task 6: `completeStageAndAdvance` — atribuição opcional das próximas etapas (frente A)

**Files:**

- Modify: `lib/actions/task.ts:802-942` (assinatura + aplicação pós-ativação)

**Interfaces:**

- Consumes: `isValidStageAssignee`, resultado de `activateNextStages` (`{ activated, blocked }`).
- Produces: `completeStageAndAdvance(taskId: string, stageId: string, assignments?: Record<string, string>)`. Após ativar, para cada `stageId` em `assignments` que foi ativado/bloqueado, valida contra a equipe e seta `assigneeId`.

- [ ] **Step 1: Estender a assinatura e aplicar atribuições**

Mudar a assinatura para aceitar `assignments?: Record<string, string>` e, **após** a chamada a `activateNextStages` (linha ~896), inserir:

```ts
const { activated, blocked } = await activateNextStages(taskId, stageId);

// Atribuição opcional das próximas etapas (frente A), validada por equipe.
if (assignments && Object.keys(assignments).length > 0) {
  const nextStages = [...activated, ...blocked]; // cada item tem id + defaultTeam? carregamos membros
  for (const next of nextStages) {
    const requested = assignments[next.id];
    if (!requested) continue;
    const stageTeam = await prisma.templateStage.findUnique({
      where: { id: next.id },
      select: {
        id: true,
        defaultTeamId: true,
        defaultTeam: { select: { members: { select: { id: true } } } },
      },
    });
    if (stageTeam && isValidStageAssignee(stageTeam, requested)) {
      await prisma.taskActiveStage.update({
        where: { taskId_stageId: { taskId, stageId: next.id } },
        data: { assigneeId: requested },
      });
    }
  }
}
```

Adicionar o import no topo (se ainda não houver): `import { isValidStageAssignee } from "@/lib/actions/stage-assignment";`

- [ ] **Step 2: Verificar tipos e testes**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde (a assinatura nova é retrocompatível — `assignments` opcional).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/task.ts
git commit -m "feat(stages): optional next-stage assignment on completeStageAndAdvance"
```

---

### Task 7: `revertTaskStage` — resetar downstream para `INACTIVE`

Com pré-criação, reverter não deve deixar etapas posteriores como `COMPLETED` nem recriar a etapa-alvo (ela já existe). As etapas posteriores à alvo voltam a `INACTIVE`; a alvo volta a `ACTIVE`.

**Files:**

- Modify: `lib/actions/task.ts` (transação de `revertTaskStage`, ~1586-1660)

**Interfaces:**

- Produces: revert reseta linhas `> target.order` para `INACTIVE` (limpando `completedAt`), fecha logs abertos como `REVERTED`, e ativa a alvo (`ACTIVE`).

- [ ] **Step 1: Reescrever a transação de revert**

Substituir o `4b`/`4c` (recriação/reativação da alvo) e o tratamento das etapas atuais por:

```ts
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 4a. Fechar logs abertos das etapas que estavam em andamento e marcá-las como REVERTED.
      for (const activeStage of currentActiveStages) {
        const openLog = await tx.taskStageLog.findFirst({
          where: { taskId, stageId: activeStage.stageId, exitedAt: null },
        });
        if (openLog) {
          await tx.taskStageLog.update({
            where: { id: openLog.id },
            data: { exitedAt: new Date(), status: "REVERTED" },
          });
        }
      }

      // 4b. Resetar TODAS as etapas a partir da alvo (inclusive posteriores) para INACTIVE.
      await tx.taskActiveStage.updateMany({
        where: { taskId, stage: { order: { gt: targetStage.order } } },
        data: { status: "INACTIVE", completedAt: null },
      });

      // 4c. Reativar a etapa-alvo (volta ao backlog: assignee preservado pode confundir → limpa).
      await tx.taskActiveStage.update({
        where: { taskId_stageId: { taskId, stageId: revertToStageId } },
        data: { status: "ACTIVE", assigneeId: null, completedAt: null },
      });

      // 4d. Novo log de entrada na etapa-alvo (em andamento → status null).
      await tx.taskStageLog.create({
        data: { taskId, stageId: revertToStageId, enteredAt: new Date(), exitedAt: null, userId: currentUserId },
      });
```

> Observação: `targetStage` já é carregado antes da transação (via `prisma.templateStage.findUnique`, ~1543). Confirmar que `currentUserId` está em escopo (está — vem de `requireMemberOrHigher`).

- [ ] **Step 2: Verificar tipos e testes**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/task.ts
git commit -m "feat(stages): revert resets downstream stages to INACTIVE"
```

---

### Task 8: Auditar consumidores de leitura de `TaskActiveStage`

Garantir que `INACTIVE` não vaze. A maioria já filtra status; este task confirma e corrige se necessário.

**Files (revisar — modificar só se faltar filtro):**

- `lib/actions/task.ts` — `getMyActiveStages` (~983), `getTeamBacklog` (~1171), `getTasks` filtros (~410-466), `getTaskById` include (~271).
- `components/dashboard/StatsCards.tsx` (counts ~24/31/47).
- `app/[locale]/(protected)/admin/users/page.tsx` e `.../[userId]/page.tsx` (counts/findMany de carga).
- `lib/actions/reporting.ts` — `getCalendarTasks`, `getTeamCurrentLoad`, `getStageDuration`.

- [ ] **Step 1: Listar leituras sem filtro de status**

Run:

```bash
grep -n "taskActiveStage\.\(findMany\|count\|findFirst\|aggregate\)" lib/actions/*.ts components/**/*.tsx "app/[locale]/(protected)/admin/users/"*.tsx "app/[locale]/(protected)/admin/users/[userId]/"*.tsx
```

Expected: inspecionar cada hit. Qualquer um que conte/listе "carga atual", "minhas etapas", "backlog", "ativas" e **não** restrinja `status` deve receber filtro (`status: "ACTIVE"` ou `status: { in: ["ACTIVE","BLOCKED"] }`).

- [ ] **Step 2: Confirmar `getMyActiveStages`**

Abrir `lib/actions/task.ts` em `getMyActiveStages` (~983) e confirmar `where: { assigneeId: userId, status: "ACTIVE" }`. Se a decisão de produto for incluir bloqueadas, trocar para `status: { in: ["ACTIVE", "BLOCKED"] }` (a UI deve então marcar visualmente as `BLOCKED` como "aguardando dependência"). **Decisão registrada:** manter só `ACTIVE` por padrão neste plano.

- [ ] **Step 3: Corrigir leituras sem filtro (se houver)**

Para cada leitura sem filtro encontrada no Step 1, adicionar o filtro de status adequado. (Sem código fixo aqui — depende do que o grep revelar; se nada faltar, registrar "nenhuma correção necessária" no commit.)

- [ ] **Step 4: Verificar**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(stages): ensure all TaskActiveStage reads filter out INACTIVE"
```

---

### Task 9: UI — card de pré-visualização com seletor de responsável (frente B)

**Files:**

- Modify: `app/actions/templateActions.ts:26-38` (`getTemplateStagePreview` inclui equipe + membros)
- Create: `components/ui/StageAssigneeSelect.tsx`
- Modify: `components/tasks/CreateTaskForm.tsx:181-226` (preview vira lista com select por etapa)
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`

**Interfaces:**

- Consumes: `getTeamMembers` (Task 2).
- Produces: `getTemplateStagePreview` retorna `{ id; name; order; defaultTeam: { id; name; members: { id; name; email }[] } | null }[]`. Form envia `assignee:<stageId>` por etapa.

- [ ] **Step 1: Enriquecer `getTemplateStagePreview`**

Substituir o `select` por:

```ts
export async function getTemplateStagePreview(templateId: string) {
  if (!templateId) return [];

  return prisma.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      defaultTeam: {
        select: {
          id: true,
          name: true,
          members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
        },
      },
    },
  });
}
```

- [ ] **Step 2: Criar `StageAssigneeSelect`**

Create `components/ui/StageAssigneeSelect.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

type Member = { id: string; name: string | null; email: string | null };

/** Native <select> that emits `assignee:<stageId>` so it posts with the form.
 * Renders disabled when the stage has no team (nothing to assign to). */
export function StageAssigneeSelect({
  stageId,
  teamName,
  members,
}: {
  stageId: string;
  teamName: string | null;
  members: Member[];
}) {
  const t = useTranslations("tasks.create.assign");

  if (!teamName) {
    return <span className="text-xs text-muted-foreground">{t("noTeam")}</span>;
  }

  return (
    <select
      name={`assignee:${stageId}`}
      defaultValue=""
      aria-label={t("ariaLabel", { team: teamName })}
      className="h-8 rounded-md border border-input-border bg-input px-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary"
    >
      <option value="">{t("unassigned")}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || m.email}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Atualizar o preview no `CreateTaskForm`**

Trocar o `<ol>` (linhas ~217-225) por uma lista que mostra equipe + select:

```tsx
{
  !isPreviewLoading && stagePreview.length > 0 && (
    <ol className="space-y-2">
      {stagePreview.map((stage, index) => (
        <li
          key={stage.id}
          className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
        >
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground">
              {index + 1}. {stage.name}
            </span>
            {stage.defaultTeam && (
              <span className="ml-2 text-xs text-muted-foreground">{stage.defaultTeam.name}</span>
            )}
          </div>
          <StageAssigneeSelect
            stageId={stage.id}
            teamName={stage.defaultTeam?.name ?? null}
            members={stage.defaultTeam?.members ?? []}
          />
        </li>
      ))}
    </ol>
  );
}
```

Adicionar o import no topo do arquivo:

```tsx
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";
```

> O `StagePreviewItem` (tipo derivado de `getTemplateStagePreview`) atualiza automaticamente para incluir `defaultTeam`.

- [ ] **Step 4: Adicionar chaves i18n**

Em `locales/pt-BR/tasks.json`, dentro de `create`, adicionar:

```json
"assign": {
  "unassigned": "Sem responsável",
  "noTeam": "Sem equipe",
  "ariaLabel": "Responsável da etapa (equipe {team})"
}
```

Em `locales/es-ES/tasks.json`, dentro de `create`:

```json
"assign": {
  "unassigned": "Sin responsable",
  "noTeam": "Sin equipo",
  "ariaLabel": "Responsable de la etapa (equipo {team})"
}
```

- [ ] **Step 5: Verificar**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add app/actions/templateActions.ts components/ui/StageAssigneeSelect.tsx components/tasks/CreateTaskForm.tsx locales/pt-BR/tasks.json locales/es-ES/tasks.json
git commit -m "feat(stages): per-stage assignee selector in create task preview"
```

---

### Task 10: UI — atribuir próximas etapas no modal de avanço (frente A)

**Files:**

- Modify: `components/tasks/AdvanceStageButton.tsx` (modal: select por próxima etapa; passar map ao chamar `completeStageAndAdvance`)

**Interfaces:**

- Consumes: `getTeamMembers` (Task 2), `completeStageAndAdvance(taskId, stageId, assignments)` (Task 6).
- Produces: ao confirmar avanço, envia `assignments` `{ [nextStageId]: userId }` coletado dos selects.

- [ ] **Step 1: Carregar membros e renderizar selects no preview do modal**

No `AdvanceStageButton.tsx`, onde o modal já mostra "etapas ativadas/bloqueadas" (preview ~169-201), para cada próxima etapa com `defaultTeam`, buscar membros (via `getTeamMembers(teamId)` em `useEffect`/`useTransition` quando o preview abre) e renderizar um `<select>` controlado, guardando em estado `assignments: Record<string,string>`. Reusar visualmente o `StageAssigneeSelect` (versão controlada: aceitar `value`/`onChange` além do modo `name`).

> Implementação concreta: adicionar a `StageAssigneeSelect` props opcionais `value?: string` e `onChange?: (v: string) => void`; quando fornecidos, vira controlado (sem `name`). Caso contrário, mantém o modo `name` (Task 9).

- [ ] **Step 2: Passar `assignments` na confirmação**

Onde hoje chama `completeStageAndAdvance(taskId, currentStageId)` (~54-56), passar o terceiro argumento `assignments`.

- [ ] **Step 3: Verificar**

Run: `pnpm tsc --noEmit && pnpm test run`
Expected: tsc 0 erros; suíte verde.

- [ ] **Step 4: Commit**

```bash
git add components/tasks/AdvanceStageButton.tsx components/ui/StageAssigneeSelect.tsx
git commit -m "feat(stages): assign next stages from advance-stage modal"
```

---

### Task 11: Backfill de etapas `INACTIVE` para tarefas existentes + verificação final

`activateNextStages` já é tolerante (upsert), mas o backfill deixa as tarefas antigas com o pipeline completo visível e consistente.

**Files:**

- Create: `prisma/backfill-inactive-stages.ts`

- [ ] **Step 1: Escrever o script de backfill**

Create `prisma/backfill-inactive-stages.ts`:

```ts
// Backfill: para cada tarefa não concluída, garante uma TaskActiveStage para
// TODA etapa do template, criando como INACTIVE as que ainda não existem.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: {
      id: true,
      project: { select: { id: true } },
      activeStages: { select: { stageId: true } },
      // template é derivado das etapas existentes; buscamos pelo template das stages atuais
    },
  });

  let created = 0;
  for (const task of tasks) {
    const existing = new Set(task.activeStages.map((s) => s.stageId));
    // Descobrir o template a partir de uma etapa existente
    const anyStage = task.activeStages[0];
    if (!anyStage) continue;
    const stage = await prisma.templateStage.findUnique({
      where: { id: anyStage.stageId },
      select: { templateId: true },
    });
    if (!stage) continue;

    const allStages = await prisma.templateStage.findMany({
      where: { templateId: stage.templateId },
      select: { id: true },
    });

    for (const s of allStages) {
      if (existing.has(s.id)) continue;
      await prisma.taskActiveStage.create({
        data: { taskId: task.id, stageId: s.id, status: "INACTIVE", assigneeId: null },
      });
      created++;
    }
  }
  console.log(`Backfill concluído: ${created} etapas INACTIVE criadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Rodar o backfill (ambiente com DB)**

Run: `pnpm exec ts-node --project prisma/tsconfig.seed.json prisma/backfill-inactive-stages.ts`
Expected: log "Backfill concluído: N etapas INACTIVE criadas." (N ≥ 0).

> Em ambiente sem DB (CI/local sem Postgres), pular este passo — a tolerância (upsert) do Task 5 cobre tarefas antigas em runtime.

- [ ] **Step 3: Verificação final completa**

Run: `pnpm tsc --noEmit && pnpm test run && pnpm lint`
Expected: tsc 0 erros; suíte verde; lint exit 0.

- [ ] **Step 4: Smoke manual (com DB + login admin)**

```
pnpm dev
# 1. Criar tarefa: selecionar template → ver card com etapas + equipe + select de responsável.
#    Atribuir responsável a 1-2 etapas; criar. Conferir no banco que TODAS as etapas existem
#    (1ª ACTIVE, resto INACTIVE) e os assignees aplicados.
# 2. Avançar etapa: no modal, escolher responsável da próxima etapa; confirmar.
#    Conferir que a próxima vira ACTIVE com o assignee escolhido.
# 3. /dashboard e "minhas etapas": confirmar que INACTIVE NÃO aparece; contadores corretos.
# 4. Reverter etapa: conferir que as posteriores voltam a INACTIVE.
```

- [ ] **Step 5: Commit**

```bash
git add prisma/backfill-inactive-stages.ts
git commit -m "chore(stages): add INACTIVE backfill script for existing tasks"
```

---

## Notas de execução / riscos

- **Ordem importa:** Task 1 (enum) antes de tudo. Tasks 2-3 (helpers) antes de 4-6. Task 8 (audit) deve rodar após 4-5 para validar não-vazamento.
- **Retrocompatibilidade de assinatura:** `completeStageAndAdvance` ganha 3º parâmetro opcional — chamadas antigas seguem válidas.
- **Premissa AND-join (sem XOR):** registrada nas Global Constraints; se um dia entrar "pular etapa", criar status `SKIPPED` e tratar no `activateNextStages`/preview (fora deste plano).
- **`assigneeId` é a fonte única da verdade** de atribuição em qualquer etapa/momento — frentes A e B usam a mesma mecânica (set `assigneeId` numa linha existente).
