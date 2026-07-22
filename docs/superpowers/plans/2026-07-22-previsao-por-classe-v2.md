# Previsão por classe v2 (experiência como banda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na criação, se o responsável da etapa de entrada tem pouco histórico naquele tipo, a viabilidade usa p95 (banda mais conservadora) + nota. Experiência = largura de banda (Flyvbjerg/P4), nunca nota individual.

**Architecture:** helper puro `confidentDays` + action `getAssigneeTypeExperience`; `StageAssigneeSelect` passa a observar mudança no modo não-controlado; `CreateTaskForm` observa o responsável da entrada e ajusta a banda. Sem migração.

**Tech Stack:** Next.js 15 (App Router, Server Actions/Components), Prisma, next-intl (pt-BR/es-ES), Vitest + RTL.

## Global Constraints

- **Experiência = largura de banda, NUNCA nota (P4/P2):** o sinal só torna a previsão mais conservadora; nunca é score de pessoa, ranking, comparação, nem é armazenado.
- **Informacional (P1):** não bloqueia nada; ajusta um percentil de previsão + nota.
- **Retrocompatível:** a mudança no `StageAssigneeSelect` não pode quebrar seus consumidores atuais (controlado no advance-modal; uncontrolled silencioso no create-form).
- **`"use server"` só exporta funções async.** i18n paridade pt-BR/es-ES real.
- **Sem migração/schema.**
- **Gates por tarefa:** `tsc --noEmit` 0; `vitest run` verde; `next build` limpo quando toca UI.
- Nota: `__tests__/components/CreateTaskForm.smoke.test.tsx` falha no import (pré-existente) — ignorar; contar o resto.

---

### Task 1: `confidentDays` puro + `getAssigneeTypeExperience` action

**Files:**

- Modify: `lib/forecast-feasibility.ts`
- Create: `lib/actions/assignee-experience.ts`
- Test: `__tests__/lib/forecast-feasibility.test.ts` (append), `__tests__/lib/actions/assignee-experience.test.ts`

**Interfaces:**

- Produces: `confidentDays(p85, p95, experienced): number`; `getAssigneeTypeExperience(userId, templateId): Promise<{ completed, experienced }>`; `EXPERIENCE_THRESHOLD`.

- [ ] **Step 1: Write the failing test (confidentDays)**

Append a `__tests__/lib/forecast-feasibility.test.ts`:

```ts
import { confidentDays } from "@/lib/forecast-feasibility";

describe("confidentDays", () => {
  it("experiente → p85; novo → p95", () => {
    expect(confidentDays(9, 14, true)).toBe(9);
    expect(confidentDays(9, 14, false)).toBe(14);
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run __tests__/lib/forecast-feasibility.test.ts` → FAIL.

- [ ] **Step 3: Implementar `confidentDays`**

Em `lib/forecast-feasibility.ts`:

```ts
/** Dias do percentil "confiável" segundo a experiência do responsável no tipo:
 * experiente → p85; novo/desconhecido → p95 (banda mais larga). Puro.
 * Experiência é LARGURA DE BANDA (P4), nunca nota individual. */
export function confidentDays(p85: number, p95: number, experienced: boolean): number {
  return experienced ? p85 : p95;
}
```

- [ ] **Step 4: Run → pass** — focused PASS.

- [ ] **Step 5: Write the failing test (getAssigneeTypeExperience)**

```ts
// __tests__/lib/actions/assignee-experience.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/permissions", () => ({ requireMemberOrHigher: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { taskActiveStage: { count: vi.fn() } }, prisma: {} }));
import prisma from "@/lib/prisma";
import { getAssigneeTypeExperience, EXPERIENCE_THRESHOLD } from "@/lib/actions/assignee-experience";
const db = prisma as unknown as { taskActiveStage: { count: ReturnType<typeof vi.fn> } };

describe("getAssigneeTypeExperience", () => {
  beforeEach(() => vi.clearAllMocks());
  it("experienced quando concluídas >= limiar", async () => {
    db.taskActiveStage.count.mockResolvedValue(EXPERIENCE_THRESHOLD);
    const r = await getAssigneeTypeExperience("u1", "tpl");
    expect(r).toEqual({ completed: EXPERIENCE_THRESHOLD, experienced: true });
    const where = db.taskActiveStage.count.mock.calls[0][0].where;
    expect(where).toEqual({ assigneeId: "u1", status: "COMPLETED", stage: { templateId: "tpl" } });
  });
  it("não experienced abaixo do limiar", async () => {
    db.taskActiveStage.count.mockResolvedValue(EXPERIENCE_THRESHOLD - 1);
    expect((await getAssigneeTypeExperience("u1", "tpl")).experienced).toBe(false);
  });
  it("userId/templateId vazio → false sem tocar o banco", async () => {
    expect(await getAssigneeTypeExperience("", "tpl")).toEqual({
      completed: 0,
      experienced: false,
    });
    expect(db.taskActiveStage.count).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run → fail; implementar a action**

```ts
// lib/actions/assignee-experience.ts
"use server";
import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

export const EXPERIENCE_THRESHOLD = 3; // < isso = "novo neste tipo"

export interface AssigneeTypeExperience {
  completed: number;
  experienced: boolean;
}

/** Experiência da pessoa NAQUELE tipo (template): nº de etapas concluídas.
 * Insumo de LARGURA DE BANDA de previsão (Flyvbjerg/P4) — NUNCA nota/ranking/
 * comparação, nunca armazenado. */
export async function getAssigneeTypeExperience(
  userId: string,
  templateId: string
): Promise<AssigneeTypeExperience> {
  await requireMemberOrHigher();
  if (!userId || !templateId) return { completed: 0, experienced: false };
  const completed = await prisma.taskActiveStage.count({
    where: { assigneeId: userId, status: "COMPLETED", stage: { templateId } },
  });
  return { completed, experienced: completed >= EXPERIENCE_THRESHOLD };
}
```

- [ ] **Step 7: Run → pass + verificar**

Run: `npx vitest run __tests__/lib/forecast-feasibility.test.ts __tests__/lib/actions/assignee-experience.test.ts` → PASS.
Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → verde.

- [ ] **Step 8: Commit**

```bash
git add lib/forecast-feasibility.ts lib/actions/assignee-experience.ts __tests__/lib/forecast-feasibility.test.ts __tests__/lib/actions/assignee-experience.test.ts
git commit -m "feat(forecast): confidentDays + getAssigneeTypeExperience (v2.T1)"
```

---

### Task 2: `StageAssigneeSelect` — onChange no modo não-controlado

**Files:**

- Modify: `components/ui/StageAssigneeSelect.tsx`
- Test: `__tests__/components/StageAssigneeSelect.test.tsx`

**Interfaces:**

- Produces: `StageAssigneeSelect` aceita `onChange` sem `value` (uncontrolled + observável, mantém `name`).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/StageAssigneeSelect.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";

const messages = {
  tasks: {
    create: {
      assign: { noTeam: "Sem time", ariaLabel: "Atribuir {team}", unassigned: "Não atribuído" },
    },
  },
};
function renderSelect(props: Record<string, unknown>) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <StageAssigneeSelect
        stageId="s1"
        teamName="Design"
        members={[{ id: "u1", name: "Ana", email: null }]}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe("StageAssigneeSelect", () => {
  it("uncontrolled + onChange: mantém name E dispara onChange", () => {
    const onChange = vi.fn();
    const { getByRole } = renderSelect({ onChange });
    const select = getByRole("combobox") as HTMLSelectElement;
    expect(select.getAttribute("name")).toBe("assignee:s1"); // ainda submete
    fireEvent.change(select, { target: { value: "u1" } });
    expect(onChange).toHaveBeenCalledWith("u1");
  });

  it("controlado (value+onChange): sem name", () => {
    const onChange = vi.fn();
    const { getByRole } = renderSelect({ value: "u1", onChange });
    expect((getByRole("combobox") as HTMLSelectElement).getAttribute("name")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail** (o atual: uncontrolled não dispara onChange) — `npx vitest run __tests__/components/StageAssigneeSelect.test.tsx` → FAIL.

- [ ] **Step 3: Implementar** — em `components/ui/StageAssigneeSelect.tsx`, trocar o bloco do `<select>` para anexar `onChange` sempre que existir, mantendo `name` quando não-controlado:

```tsx
  const isControlled = value !== undefined && onChange !== undefined;

  return (
    <select
      {...(!isControlled ? { name: `assignee:${stageId}`, defaultValue: "" } : {})}
      {...(isControlled ? { value } : {})}
      {...(onChange ? { onChange: (e) => onChange(e.target.value) } : {})}
      aria-label={t("ariaLabel", { team: teamName })}
      className="h-8 rounded-md border border-input-border bg-input px-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary"
    >
```

(o resto do componente inalterado.)

- [ ] **Step 4: Run → pass + regressão**

Run: `npx vitest run __tests__/components/StageAssigneeSelect.test.tsx` → PASS.
Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → verde (consumidores atuais do select intactos).

- [ ] **Step 5: Commit**

```bash
git add components/ui/StageAssigneeSelect.tsx __tests__/components/StageAssigneeSelect.test.tsx
git commit -m "feat(ui): StageAssigneeSelect observável no modo não-controlado (v2.T2)"
```

---

### Task 3: `CreateTaskForm` — banda por experiência da entrada + i18n

**Files:**

- Modify: `components/tasks/CreateTaskForm.tsx`
- Modify: `locales/pt-BR/tasks.json`, `locales/es-ES/tasks.json`

**Interfaces:**

- Consumes: `confidentDays` (T1), `getAssigneeTypeExperience` (T1), `StageAssigneeSelect` onChange (T2).

- [ ] **Step 1: Estado + p95 no forecast + fetch de experiência**

Em `components/tasks/CreateTaskForm.tsx`:

- Imports: adicionar `confidentDays` a `@/lib/forecast-feasibility`; `getAssigneeTypeExperience` de `@/lib/actions/assignee-experience`; garantir `useEffect` importado.
- No tipo do estado `forecast`, adicionar `p95: number` (o `getTypeForecast` já o retorna; incluir ao `setForecast`).
- Novo estado:

```ts
const [entryAssigneeId, setEntryAssigneeId] = useState<string>("");
const [entryExperienced, setEntryExperienced] = useState<boolean | null>(null);
```

- Em `handleTemplateChange`, ao trocar de template, resetar a entrada: `setEntryAssigneeId(""); setEntryExperienced(null);` (a etapa de entrada muda com o template).
- Efeito para buscar a experiência:

```ts
useEffect(() => {
  if (!entryAssigneeId || !selectedTemplateId) {
    setEntryExperienced(null);
    return;
  }
  let cancelled = false;
  getAssigneeTypeExperience(entryAssigneeId, selectedTemplateId).then((r) => {
    if (!cancelled) setEntryExperienced(r.experienced);
  });
  return () => {
    cancelled = true;
  };
}, [entryAssigneeId, selectedTemplateId]);
```

- [ ] **Step 2: Banda efetiva na viabilidade**

Trocar o cálculo de viabilidade (linhas ~114-121) para usar a banda por experiência:

```ts
const band =
  forecast && forecast.p85 > 0
    ? confidentDays(forecast.p85, forecast.p95, entryExperienced ?? true)
    : 0;
const feasibility =
  forecast && forecast.count > 0 && dueDate
    ? assessFeasibility(daysAvailable, forecast.p50, band)
    : "unknown";
const idealStart =
  band > 0 && dueDate
    ? new Date(new Date(dueDate).getTime() - idealStartOffsetDays(band) * 8.64e7)
    : null;
```

(default `entryExperienced ?? true` → p85 = comportamento v1 quando não há responsável.)

- [ ] **Step 3: Observar o responsável da etapa de entrada**

No `stagePreview.map((stage, index) => ...)`, passar `onChange` ao `StageAssigneeSelect` APENAS da entrada (index 0):

```tsx
<StageAssigneeSelect
  stageId={stage.id}
  teamName={stage.defaultTeam?.name ?? null}
  members={stage.defaultTeam?.members ?? []}
  {...(index === 0 ? { onChange: (v: string) => setEntryAssigneeId(v) } : {})}
/>
```

(as demais etapas continuam sem `onChange` — uncontrolled puro; a entrada mantém `name` e também notifica, por causa da T2.)

- [ ] **Step 4: Nota "novo neste tipo"**

No bloco de viabilidade inline (onde já mostra `feasibility` + summary), acrescentar, quando aplicável:

```tsx
{
  entryAssigneeId && entryExperienced === false && (
    <span className="block">{t("create.feasibility.newToTypeNote")}</span>
  );
}
```

- [ ] **Step 5: i18n em `tasks.json` → `create.feasibility`**

pt-BR: `"newToTypeNote": "Responsável novo neste tipo → previsão mais conservadora (p95)."`
es-ES: `"newToTypeNote": "Responsable nuevo en este tipo → previsión más conservadora (p95)."`

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` → 0. Run: `npx vitest run __tests__/i18n` → paridade verde. Run: `npx next build` → limpo (se stale, `rm -rf .next`).

> A lógica de decisão (`confidentDays`, `assessFeasibility`, `getAssigneeTypeExperience`) já é unit-testada; a fiação é validada por build + smoke manual.

- [ ] **Step 7: Commit**

```bash
git add components/tasks/CreateTaskForm.tsx locales/pt-BR/tasks.json locales/es-ES/tasks.json
git commit -m "feat(tasks): banda de previsão por experiência do responsável da entrada (v2.T3)"
```

---

## Verificação final (whole-branch)

- `tsc` 0 · `vitest` verde · `next build` limpo · paridade i18n · **sem migração**.
- Smoke manual: criar tarefa, escolher tipo + vencimento + responsável da entrada; com responsável NOVO no tipo → veredito usa p95 (mais conservador) + nota; com experiente → p85; sem responsável → p85 (v1).

## Notas de escopo (fora deste plano)

- Encerra o tema "previsibilidade & qualidade em trabalho criativo".
- Refinamento futuro: entrada real respeitando opcional-desmarcada (hoje = `stagePreview[0]`).
