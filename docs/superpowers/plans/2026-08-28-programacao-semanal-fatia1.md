# Programação semanal — fatia 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao gestor uma mesa semanal (pessoa × dia) onde ele distribui etapas, enxerga o espaço
livre de cada um e é avisado de agendamentos que não vão acontecer.

**Architecture:** Quatro campos em `TaskActiveStage` guardam dia, ordem e janela fixa. Uma função
pura monta a fila de um dia aplicando três regras (agendado é fixo, liberado respeita a ordem
manual, não liberado fica visível e é pulado) e separa os conflitos. A tela lê tudo por uma action
só e escreve por ações explícitas — **sem arrastar nesta fatia**, por decisão registrada.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma/PostgreSQL, next-intl v4 (pt-BR +
es-ES), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-28-programacao-semanal-design.md`

## Global Constraints

- **Bilíngue obrigatório:** toda string nova entra em `locales/pt-BR/*.json` **e**
  `locales/es-ES/*.json`. Existe teste de paridade; espanhol tem de ser espanhol de verdade.
- **Mensagens de erro de Server Action vêm do dicionário**, nunca fixas no código:
  `const t = await getTranslations("errors.<ns>")`.
- **Comentários explicam o PORQUÊ**, em português, no tom do repositório.
- **Testes de Server Action precisam do mock de next-intl** (sob jsdom o next-intl resolve para o
  build de cliente e `getTranslations` lança):
  ```ts
  vi.mock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((k: string) => k),
  }));
  ```
- **Nenhuma nota de aderência da pessoa.** Nenhuma tela agrega, soma ou compara "planejado vs
  realizado" por pessoa. O envelhecimento POR ETAPA (`stageAgingRatio`) é permitido e vem de
  `lib/team-health-format.ts` — **consumir**, nunca reimplementar.
- **Sem biblioteca de drag-and-drop.** Programar é por diálogo; reordenar é por setas.
- **Verificação de cada task:** `npx tsc --noEmit -p tsconfig.json` limpo e `npx vitest run` verde.
- **Commits direto na `main`** (projeto solo, sem branch/PR).
- **Migrations:** SQL escrito à mão em `prisma/migrations/<timestamp>_<nome>/migration.sql`, com
  comentário explicando a decisão. **Não** rodar `migrate deploy` — o banco é produção e a aplicação
  é decisão do usuário.

## File Structure

| Arquivo                                                            | Responsabilidade                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `lib/planning/day-queue.ts` (novo)                                 | Função pura: monta a fila de um dia e separa conflitos          |
| `lib/planning/stage-reference.ts` (novo)                           | Duração de referência por etapa (p50 observado, SLA como queda) |
| `lib/actions/week-planning.ts` (novo)                              | Leitura da semana + ações de programar/mover/reordenar/tirar    |
| `app/[locale]/(protected)/planning/week/page.tsx` (novo)           | A tela: grade, capacidade, conflitos                            |
| `app/[locale]/(protected)/planning/week/ScheduleDialog.tsx` (novo) | Diálogo "programar" (pessoa + dia)                              |
| `app/[locale]/(protected)/planning/week/OrderControls.tsx` (novo)  | Setas de reordenar dentro do dia                                |

---

### Task 1: Os quatro campos em `TaskActiveStage`

**Files:**

- Modify: `prisma/schema.prisma` (model `TaskActiveStage`)
- Create: `prisma/migrations/20260828160000_add_stage_planning_fields/migration.sql`

**Interfaces:**

- Consumes: nada
- Produces: `plannedDate`, `plannedOrder`, `scheduledStart`, `scheduledEnd` no Prisma Client

- [ ] **Step 1: Adicionar os campos ao schema**

Em `prisma/schema.prisma`, dentro de `model TaskActiveStage`, logo depois do bloco de `instructions`:

```prisma
  // --- Programação semanal (docs/superpowers/specs/2026-08-28-programacao-semanal-design.md) ---
  // O DIA é guardado, não calculado: a referência de capacidade é semanal e quem distribui é o
  // gestor — o sistema não tem escala cadastrada e não sabe quem trabalha sábado.
  //
  // Rolagem e antecipação NÃO precisam de job: a fila de hoje é "não concluído com plannedDate <=
  // hoje", então o que não foi feito ontem aparece hoje por consequência; e quando o dia acaba, a
  // tela puxa os próximos por (plannedDate, plannedOrder).
  //
  // Não existe tabela de agenda de propósito: sem histórico de plano, o sistema NÃO CONSEGUE
  // calcular nota de aderência da pessoa ("cumpriu 60%") nem que alguém peça depois.
  plannedDate  DateTime? // o dia em que deve ser feito — escrito pelo gestor
  plannedOrder Int? // posição dentro do dia — escrita pela pessoa

  // Janela fixa: agendamento de pessoa, lugar ou equipamento. É a ÚNICA parte com hora, porque
  // aqui a realidade tem hora (a locação é às 14h) — não é estimativa apresentada como verdade.
  // Item com janela nunca é reordenado nem pulado; se a etapa não estiver liberada, vira CONFLITO
  // em destaque para o gestor resolver.
  scheduledStart DateTime?
  scheduledEnd   DateTime?

  @@index([assigneeId, plannedDate])
```

O `@@index` vai junto dos índices que já existem no model.

- [ ] **Step 2: Escrever a migration**

```sql
-- Programação semanal: dia + ordem, e a janela fixa dos itens agendados.
--
-- Tudo anulável e sem backfill: demanda existente simplesmente não está programada, que é a
-- verdade. Preencher retroativamente inventaria um plano que ninguém fez.
--
-- O índice serve à consulta que a tela faz o tempo todo: "o que a pessoa X tem no dia Y".
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedDate" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedOrder" INTEGER;
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledStart" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledEnd" TIMESTAMP(3);

CREATE INDEX "TaskActiveStage_assigneeId_plannedDate_idx"
  ON "TaskActiveStage"("assigneeId", "plannedDate");
```

- [ ] **Step 3: Gerar o client e conferir**

Run: `npx prisma format --schema prisma/schema.prisma && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(programação): campos de dia, ordem e janela fixa na etapa"
```

---

### Task 2: A fila do dia (função pura) — o coração

**Files:**

- Create: `lib/planning/day-queue.ts`
- Test: `__tests__/lib/planning/day-queue.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `type QueueItemInput = { id: string; available: boolean; plannedOrder: number; referenceHours: number; scheduledStart: Date | null }`
  - `type QueueKind = "scheduled" | "runnable" | "waiting" | "conflict"`
  - `type QueueSlot = { kind: QueueKind; item: QueueItemInput }`
  - `buildDayQueue(items: QueueItemInput[]): { slots: QueueSlot[]; usedHours: number; nextRunnableId: string | null; conflicts: QueueItemInput[] }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/day-queue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";

// Esta função decide o que cada pessoa vê como "o que fazer agora". Erra em silêncio: nenhuma tela
// quebra se a ordem sair errada — só a pessoa trabalha na coisa errada, ou o gestor deixa de ver um
// agendamento que não vai acontecer.

function item(over: Partial<QueueItemInput> & { id: string }): QueueItemInput {
  return {
    available: true,
    plannedOrder: 0,
    referenceHours: 1,
    scheduledStart: null,
    ...over,
  };
}

describe("buildDayQueue — ordem manual", () => {
  it("respeita a ordem da pessoa entre itens liberados", () => {
    const r = buildDayQueue([
      item({ id: "b", plannedOrder: 2 }),
      item({ id: "a", plannedOrder: 1 }),
    ]);
    expect(r.slots.map((s) => s.item.id)).toEqual(["a", "b"]);
    expect(r.slots.every((s) => s.kind === "runnable")).toBe(true);
  });

  it("soma as horas de referência do que é executável", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, referenceHours: 2 }),
      item({ id: "b", plannedOrder: 2, referenceHours: 1.5 }),
    ]);
    expect(r.usedHours).toBeCloseTo(3.5, 5);
  });
});

describe("buildDayQueue — etapa não liberada", () => {
  it("fica visível na posição escolhida, marcada como esperando", () => {
    // Ela não some: a pessoa pôs ali de propósito, e some seria perder a intenção.
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false }),
      item({ id: "b", plannedOrder: 2 }),
    ]);
    expect(r.slots.map((s) => [s.item.id, s.kind])).toEqual([
      ["a", "waiting"],
      ["b", "runnable"],
    ]);
  });

  it("é PULADA: a próxima liberada é a que se faz agora", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false }),
      item({ id: "b", plannedOrder: 2 }),
    ]);
    expect(r.nextRunnableId).toBe("b");
  });

  it("não consome capacidade — não dá para ocupar o dia com o que não pode ser feito", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false, referenceHours: 8 }),
      item({ id: "b", plannedOrder: 2, referenceHours: 2 }),
    ]);
    expect(r.usedHours).toBeCloseTo(2, 5);
  });

  it("dia inteiro sem nada liberado não tem próximo", () => {
    const r = buildDayQueue([item({ id: "a", plannedOrder: 1, available: false })]);
    expect(r.nextRunnableId).toBeNull();
  });
});

describe("buildDayQueue — item agendado", () => {
  it("liberado e agendado entra como agendado, e conta as horas", () => {
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
        referenceHours: 3,
      }),
    ]);
    expect(r.slots[0].kind).toBe("scheduled");
    expect(r.usedHours).toBeCloseTo(3, 5);
  });

  it("agendado e NÃO liberado é CONFLITO, nunca 'waiting'", () => {
    // O equipamento está reservado e a etapa anterior não terminou. Pular em silêncio esconderia
    // justamente o que estraga o dia de gravação.
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        available: false,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
      }),
    ]);
    expect(r.slots[0].kind).toBe("conflict");
    expect(r.conflicts.map((c) => c.id)).toEqual(["a"]);
  });

  it("conflito não é o próximo a fazer nem consome capacidade", () => {
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        available: false,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
        referenceHours: 4,
      }),
      item({ id: "b", plannedOrder: 2, referenceHours: 1 }),
    ]);
    expect(r.nextRunnableId).toBe("b");
    expect(r.usedHours).toBeCloseTo(1, 5);
  });

  it("um agendado liberado é o próximo, mesmo com liberado antes dele", () => {
    // Compromisso marcado tem prioridade sobre a ordem manual — é o que "interrompe o concorrente"
    // significa na prática, do ponto de vista de quem olha a fila.
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1 }),
      item({ id: "b", plannedOrder: 2, scheduledStart: new Date("2026-08-31T14:00:00Z") }),
    ]);
    expect(r.nextRunnableId).toBe("b");
  });
});

describe("buildDayQueue — dia vazio", () => {
  it("devolve tudo zerado sem quebrar", () => {
    const r = buildDayQueue([]);
    expect(r).toEqual({ slots: [], usedHours: 0, nextRunnableId: null, conflicts: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/day-queue.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/planning/day-queue"`

- [ ] **Step 3: Implementar**

Criar `lib/planning/day-queue.ts`:

```ts
/**
 * Monta a fila de UM dia de UMA pessoa a partir dos itens que ela tem programados.
 *
 * Função pura, separada da consulta, porque é aqui que mora a regra e é aqui que o erro é
 * silencioso: nenhuma tela quebra se a ordem sair errada — só a pessoa trabalha na coisa errada, ou
 * o gestor deixa de ver um agendamento que não vai acontecer.
 *
 * As três regras da spec, e só elas:
 *   1. Item com janela fixa não é reordenado nem pulado.
 *   2. Item liberado respeita a ordem manual da pessoa.
 *   3. Item não liberado fica VISÍVEL na posição escolhida e é pulado — a próxima liberada é a que
 *      se faz agora. Não some: sumir perderia a intenção de quem o pôs ali.
 */

export type QueueItemInput = {
  id: string;
  /** A etapa está liberada para execução (status ACTIVE). Programar não libera. */
  available: boolean;
  plannedOrder: number;
  referenceHours: number;
  /** Preenchido só nos itens com compromisso marcado. */
  scheduledStart: Date | null;
};

export type QueueKind =
  | "scheduled" // agendado e liberado: acontece na hora dele
  | "runnable" // liberado, entra na vez pela ordem manual
  | "waiting" // não liberado: visível, pulado, não consome capacidade
  | "conflict"; // agendado E não liberado: problema do gestor, nunca pulado em silêncio

export type QueueSlot = { kind: QueueKind; item: QueueItemInput };

export function buildDayQueue(items: QueueItemInput[]): {
  slots: QueueSlot[];
  usedHours: number;
  nextRunnableId: string | null;
  conflicts: QueueItemInput[];
} {
  const ordenados = [...items].sort((a, b) => a.plannedOrder - b.plannedOrder);

  const slots: QueueSlot[] = ordenados.map((item) => {
    const agendado = item.scheduledStart !== null;
    if (agendado && !item.available) return { kind: "conflict", item };
    if (agendado) return { kind: "scheduled", item };
    return { kind: item.available ? "runnable" : "waiting", item };
  });

  // Só o que pode ser executado ocupa o dia. Deixar `waiting` e `conflict` somarem encheria a
  // agenda de alguém com trabalho que ninguém consegue começar.
  const executavel = slots.filter((s) => s.kind === "scheduled" || s.kind === "runnable");
  const usedHours = executavel.reduce((soma, s) => soma + s.item.referenceHours, 0);

  // Compromisso marcado vem antes da ordem manual: é o que "interrompe o concorrente" significa
  // para quem olha a fila e quer saber o que fazer agora.
  const proximo =
    executavel.find((s) => s.kind === "scheduled") ?? executavel.find((s) => s.kind === "runnable");

  return {
    slots,
    usedHours,
    nextRunnableId: proximo?.item.id ?? null,
    conflicts: slots.filter((s) => s.kind === "conflict").map((s) => s.item),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/day-queue.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/day-queue.ts __tests__/lib/planning/day-queue.test.ts
git commit -m "feat(programação): fila do dia com agendado, liberado e não liberado"
```

---

### Task 3: Duração de referência por etapa

**Files:**

- Create: `lib/planning/stage-reference.ts`
- Test: `__tests__/lib/planning/stage-reference.test.ts`

**Interfaces:**

- Consumes: `percentile` de `@/lib/stats`
- Produces:
  - `const MIN_REFERENCE_SAMPLES = 5`
  - `type StageReference = { hours: number; source: "observed" | "declared" }`
  - `resolveStageReference(durationsHours: number[], declaredHours: number | null): StageReference`
  - `getStageReferences(stageIds: string[]): Promise<Map<string, StageReference>>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/stage-reference.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MIN_REFERENCE_SAMPLES, resolveStageReference } from "@/lib/planning/stage-reference";

// A referência é o número que a pessoa usa para se organizar e que o gestor usa para ver espaço
// livre. De onde ele vem muda o que a tela promete: observado é o que ACONTECE; declarado é o que
// alguém achou quando cadastrou a etapa. A tela precisa saber qual dos dois está mostrando.

describe("resolveStageReference", () => {
  it("usa o p50 observado quando há amostra suficiente", () => {
    const durations = [1, 2, 3, 4, 5];
    const r = resolveStageReference(durations, 10);
    expect(r).toEqual({ hours: 3, source: "observed" });
  });

  it("cai no declarado quando a amostra é pequena", () => {
    // Percentil de duas observações não é referência, é anedota.
    const r = resolveStageReference([1, 9], 4);
    expect(r).toEqual({ hours: 4, source: "declared" });
  });

  it("cai no declarado quando não há observação nenhuma", () => {
    expect(resolveStageReference([], 2)).toEqual({ hours: 2, source: "declared" });
  });

  it("percentil, não média — a distribuição é enviesada (P3)", () => {
    // Uma etapa que quase sempre leva 1h e uma vez levou 40h: a média diria ~7h e encheria a
    // agenda de todo mundo; a mediana diz 1h, que é o que costuma acontecer.
    const r = resolveStageReference([1, 1, 1, 1, 40], 3);
    expect(r.hours).toBe(1);
    expect(r.source).toBe("observed");
  });

  it("sem observação e sem declarado devolve zero declarado, não quebra", () => {
    // Etapa sem SLA não deveria existir (o cadastro exige), mas dado antigo pode não ter.
    expect(resolveStageReference([], null)).toEqual({ hours: 0, source: "declared" });
  });

  it("o mínimo de amostra é 5", () => {
    expect(MIN_REFERENCE_SAMPLES).toBe(5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/stage-reference.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/planning/stage-reference"`

- [ ] **Step 3: Implementar**

Criar `lib/planning/stage-reference.ts`:

```ts
import "server-only";

import prisma from "@/lib/prisma";
import { percentile } from "@/lib/stats";

/**
 * Quanto uma etapa costuma levar — o número que a pessoa usa para se organizar e o gestor para ver
 * espaço livre.
 *
 * Percentil e não média: a biblioteca de conhecimento lista média como anti-feature de duração
 * (P3, distribuição enviesada). Uma etapa que quase sempre leva 1h e uma vez levou 40h tem média de
 * 7h — que encheria a agenda de todo mundo com um número que quase nunca acontece.
 */

/** Abaixo disto, percentil é anedota e não referência: cai no valor declarado. */
export const MIN_REFERENCE_SAMPLES = 5;

export type StageReference = {
  hours: number;
  /** `observed` = medido; `declared` = o SLA que alguém cadastrou. A tela MOSTRA a diferença. */
  source: "observed" | "declared";
};

/** Puro, para o teste alcançar a regra sem banco. */
export function resolveStageReference(
  durationsHours: number[],
  declaredHours: number | null
): StageReference {
  if (durationsHours.length >= MIN_REFERENCE_SAMPLES) {
    return { hours: percentile(durationsHours, 0.5), source: "observed" };
  }
  return { hours: declaredHours ?? 0, source: "declared" };
}

/**
 * Referência de várias etapas de uma vez. Uma consulta para todas, e não uma por etapa: a mesa
 * semanal mostra dezenas de itens, e o N+1 aqui apareceria como tela lenta sem causa óbvia.
 */
export async function getStageReferences(stageIds: string[]): Promise<Map<string, StageReference>> {
  const out = new Map<string, StageReference>();
  if (stageIds.length === 0) return out;

  const [stages, logs] = await Promise.all([
    prisma.templateStage.findMany({
      where: { id: { in: stageIds } },
      select: { id: true, expectedDurationHours: true },
    }),
    // Só log FECHADO tem duração. `status: COMPLETED` exclui as reversões, que medem uma tentativa
    // interrompida e não o tempo típico da etapa.
    prisma.taskStageLog.findMany({
      where: { stageId: { in: stageIds }, exitedAt: { not: null }, status: "COMPLETED" },
      select: { stageId: true, enteredAt: true, exitedAt: true },
    }),
  ]);

  const porEtapa = new Map<string, number[]>();
  for (const log of logs) {
    if (!log.exitedAt) continue;
    const horas = (log.exitedAt.getTime() - log.enteredAt.getTime()) / 3.6e6;
    const lista = porEtapa.get(log.stageId);
    if (lista) lista.push(horas);
    else porEtapa.set(log.stageId, [horas]);
  }

  for (const stage of stages) {
    out.set(
      stage.id,
      resolveStageReference(porEtapa.get(stage.id) ?? [], stage.expectedDurationHours)
    );
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/stage-reference.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (6 testes), tsc limpo

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stage-reference.ts __tests__/lib/planning/stage-reference.test.ts
git commit -m "feat(programação): duração de referência por etapa (p50 observado, SLA como queda)"
```

---

### Task 4: Leitura da semana

**Files:**

- Create: `lib/actions/week-planning.ts`
- Test: `__tests__/lib/actions/week-planning-read.test.ts`

**Interfaces:**

- Consumes: `buildDayQueue`, `QueueItemInput` (Task 2); `getStageReferences` (Task 3);
  `mondayOfWeek`, `formatISODate` de `@/lib/dates`; `requireManagerOrAdmin` de `@/lib/permissions`
- Produces:
  - `const DEFAULT_WEEKLY_HOURS = 45`
  - `const DAY_VISUAL_HOURS = 8`
  - `getWeekPlanning(mondayISO: string, teamId?: string): Promise<WeekPlanning>` com
    `WeekPlanning = { days: string[]; people: PersonWeek[]; pool: PoolItem[] }`,
    `PersonWeek = { userId: string; name: string; weeklyHours: number; usedHours: number; byDay: Record<string, DayView> }`,
    `DayView = { slots: QueueSlot[]; usedHours: number; nextRunnableId: string | null }`,
    `PoolItem = { id: string; taskTitle: string; stageName: string; clientName: string; referenceHours: number }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/actions/week-planning-read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { getWeekPlanning, DEFAULT_WEEKLY_HOURS } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
};

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    assigneeId: "u1",
    status: "ACTIVE",
    plannedDate: new Date("2026-08-31T00:00:00Z"), // segunda
    plannedOrder: 1,
    scheduledStart: null,
    scheduledEnd: null,
    stage: { name: "Edição" },
    task: { title: "Vídeo", project: { client: { name: "ACME" } } },
    ...over,
  };
}

describe("getWeekPlanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findMany.mockResolvedValue([{ id: "u1", name: "Ana", weeklyCapacityHours: 40 }]);
    (getStageReferences as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["s1", { hours: 2, source: "observed" }]])
    );
  });

  it("devolve os seis dias da semana, de segunda a sábado", async () => {
    // Sábado é coluna normal: o sistema não tem escala, então quem decide é o gestor.
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.days).toHaveLength(6);
    expect(r.days[0]).toBe("2026-08-31");
    expect(r.days[5]).toBe("2026-09-05");
  });

  it("agrupa os itens da pessoa por dia, com a referência aplicada", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([stageRow()]);
    const r = await getWeekPlanning("2026-08-31");
    const ana = r.people[0];
    expect(ana.byDay["2026-08-31"].slots).toHaveLength(1);
    expect(ana.byDay["2026-08-31"].usedHours).toBeCloseTo(2, 5);
  });

  it("usa a capacidade da pessoa; sem ela, cai no padrão", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: "Ana", weeklyCapacityHours: 40 },
      { id: "u2", name: "Bruno", weeklyCapacityHours: null },
    ]);
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people.find((p) => p.userId === "u1")!.weeklyHours).toBe(40);
    expect(r.people.find((p) => p.userId === "u2")!.weeklyHours).toBe(DEFAULT_WEEKLY_HOURS);
  });

  it("etapa não liberada não conta nas horas da semana", async () => {
    // Mesma regra da fila do dia, agora no acumulado: não dá para ocupar a semana de alguém com
    // trabalho que ainda não pode começar.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ id: "as1", plannedOrder: 1, status: "INACTIVE" }),
      stageRow({ id: "as2", plannedOrder: 2 }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].usedHours).toBeCloseTo(2, 5);
  });

  it("item atrasado de semana anterior aparece no primeiro dia visível", async () => {
    // Sem isto, trabalho planejado e não feito sumiria da tela na virada da semana.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ plannedDate: new Date("2026-08-20T00:00:00Z") }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].byDay["2026-08-31"].slots).toHaveLength(1);
  });

  it("o poço traz etapas ativas e sem dono", async () => {
    db.taskActiveStage.findMany.mockImplementation((args: { where?: Record<string, unknown> }) =>
      args.where?.assigneeId === null
        ? Promise.resolve([stageRow({ id: "livre", assigneeId: null, plannedDate: null })])
        : Promise.resolve([])
    );
    const r = await getWeekPlanning("2026-08-31");
    expect(r.pool.map((p) => p.id)).toEqual(["livre"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/week-planning-read.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/week-planning"`

- [ ] **Step 3: Implementar a leitura**

Criar `lib/actions/week-planning.ts`:

```ts
"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput, type QueueSlot } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";

/**
 * Mesa semanal do gestor: pessoa × dia.
 *
 * A capacidade que vale é a SEMANAL. O dia tem uma régua visual (8h) só para dar noção de quanto
 * já pegou — não é meta nem trava, porque o sistema não tem escala cadastrada e não sabe quem
 * trabalha sábado ou meio período. Quem distribui é o gestor.
 */

/** Referência semanal de quem não tem `weeklyCapacityHours` preenchido. */
export const DEFAULT_WEEKLY_HOURS = 45;

/** Régua VISUAL do dia. Não é meta: ver o comentário acima. */
export const DAY_VISUAL_HOURS = 8;

export type DayView = { slots: QueueSlot[]; usedHours: number; nextRunnableId: string | null };

export type PersonWeek = {
  userId: string;
  name: string;
  weeklyHours: number;
  usedHours: number;
  byDay: Record<string, DayView>;
};

export type PoolItem = {
  id: string;
  taskTitle: string;
  stageName: string;
  clientName: string;
  referenceHours: number;
};

export type WeekPlanning = { days: string[]; people: PersonWeek[]; pool: PoolItem[] };

/** Segunda a sábado. Sábado é coluna normal — recebe se o gestor colocar. */
function weekDays(mondayISO: string): string[] {
  const base = Date.parse(`${mondayISO}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => formatISODate(new Date(base + i * 86_400_000)));
}

export async function getWeekPlanning(mondayISO: string, teamId?: string): Promise<WeekPlanning> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const inicio = new Date(`${days[0]}T00:00:00Z`);
  const fim = new Date(`${days[5]}T23:59:59Z`);

  const [people, programados, livres] = await Promise.all([
    prisma.user.findMany({
      where: teamId ? { teams: { some: { id: teamId } } } : {},
      select: { id: true, name: true, weeklyCapacityHours: true },
      orderBy: { name: "asc" },
    }),
    prisma.taskActiveStage.findMany({
      where: {
        // `lte: fim` sem piso inferior de propósito: item planejado para ANTES desta semana e não
        // concluído precisa continuar aparecendo, senão trabalho atrasado sumiria da tela na virada
        // da semana — o pior tipo de perda, porque é silenciosa. Ele é realocado para o primeiro dia
        // visível logo abaixo.
        plannedDate: { not: null, lte: fim },
        status: { not: "COMPLETED" },
        ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
      },
      select: {
        id: true,
        stageId: true,
        assigneeId: true,
        status: true,
        plannedDate: true,
        plannedOrder: true,
        scheduledStart: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
    }),
    // O poço: etapas liberadas, sem dono e ainda não programadas.
    prisma.taskActiveStage.findMany({
      where: { assigneeId: null, status: "ACTIVE", plannedDate: null },
      select: {
        id: true,
        stageId: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
      take: 200,
    }),
  ]);

  const referencias = await getStageReferences([
    ...new Set([...programados.map((p) => p.stageId), ...livres.map((l) => l.stageId)]),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  const porPessoaEDia = new Map<string, Map<string, QueueItemInput[]>>();
  const primeiroDia = days[0];
  for (const row of programados) {
    if (!row.assigneeId || !row.plannedDate) continue;
    const planejado = formatISODate(row.plannedDate);
    // Atrasado de semanas anteriores entra no primeiro dia visível. É a rolagem da spec aplicada à
    // mesa do gestor: o item não some, aparece onde ainda dá para agir sobre ele.
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const daPessoa = porPessoaEDia.get(row.assigneeId) ?? new Map<string, QueueItemInput[]>();
    const doDia = daPessoa.get(dia) ?? [];
    doDia.push({
      id: row.id,
      // Programar NÃO libera: só a etapa ACTIVE pode ser executada.
      available: row.status === "ACTIVE",
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      scheduledStart: row.scheduledStart,
    });
    daPessoa.set(dia, doDia);
    porPessoaEDia.set(row.assigneeId, daPessoa);
  }

  const peopleOut: PersonWeek[] = people.map((u) => {
    const byDay: Record<string, DayView> = {};
    let usedHours = 0;
    for (const dia of days) {
      const itens = porPessoaEDia.get(u.id)?.get(dia) ?? [];
      const fila = buildDayQueue(itens);
      byDay[dia] = {
        slots: fila.slots,
        usedHours: fila.usedHours,
        nextRunnableId: fila.nextRunnableId,
      };
      usedHours += fila.usedHours;
    }
    return {
      userId: u.id,
      name: u.name ?? "",
      weeklyHours: u.weeklyCapacityHours ?? DEFAULT_WEEKLY_HOURS,
      usedHours,
      byDay,
    };
  });

  return {
    days,
    people: peopleOut,
    pool: livres.map((l) => ({
      id: l.id,
      taskTitle: l.task.title,
      stageName: l.stage.name,
      clientName: l.task.project.client.name,
      referenceHours: horasDe(l.stageId),
    })),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/week-planning-read.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (7 testes), tsc limpo

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/week-planning-read.test.ts
git commit -m "feat(programação): leitura da semana por pessoa e dia"
```

---

### Task 5: Ações de programar, mover, reordenar e tirar

**Files:**

- Modify: `lib/actions/week-planning.ts`
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/week-planning-write.test.ts`

**Interfaces:**

- Consumes: o mesmo módulo da Task 4
- Produces:
  - `scheduleStage(input: { activeStageId: string; userId: string; dateISO: string }): Promise<{ success: true } | { error: string }>`
  - `unscheduleStage(activeStageId: string): Promise<{ success: true } | { error: string }>`
  - `moveStageOrder(activeStageId: string, direction: "up" | "down"): Promise<{ success: true } | { error: string }>`

- [ ] **Step 1: Chaves de erro nos dois locales**

Em `locales/pt-BR/errors.json`, namespace novo `weekPlanning`:

```json
"weekPlanning": {
  "stageNotFound": "Etapa não encontrada.",
  "alreadyAssigned": "Esta etapa já tem responsável. Remaneje pela própria etapa.",
  "completedStage": "Etapa concluída não entra na programação.",
  "invalidDate": "Informe uma data válida.",
  "scheduleFailed": "Erro ao programar a etapa.",
  "reorderFailed": "Erro ao reordenar."
}
```

Em `locales/es-ES/errors.json`:

```json
"weekPlanning": {
  "stageNotFound": "Etapa no encontrada.",
  "alreadyAssigned": "Esta etapa ya tiene responsable. Reasígnala desde la propia etapa.",
  "completedStage": "Una etapa cerrada no entra en la programación.",
  "invalidDate": "Introduce una fecha válida.",
  "scheduleFailed": "Error al programar la etapa.",
  "reorderFailed": "Error al reordenar."
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `__tests__/lib/actions/week-planning-write.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({ getStageReferences: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn() },
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn(),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { scheduleStage, unscheduleStage, moveStageOrder } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
};

describe("scheduleStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.taskActiveStage.aggregate.mockResolvedValue({ _max: { plannedOrder: 2 } });
  });

  it("programa etapa livre: grava dia, ordem no fim e o responsável", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    const r = await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" });
    expect(r).toEqual({ success: true });
    const data = db.taskActiveStage.update.mock.calls[0][0].data;
    expect(data.assigneeId).toBe("u1");
    expect(data.plannedOrder).toBe(3); // entra no fim do dia
    expect(formatUTC(data.plannedDate)).toBe("2026-08-31");
  });

  it("programa etapa AINDA NÃO liberada — programar não é executar", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "INACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa etapa concluída", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "COMPLETED",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "completedStage",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa puxar etapa que já é de outra pessoa", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "outro",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "alreadyAssigned",
    });
  });

  it("reprogramar quem JÁ é da pessoa é permitido — é mover de dia", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-09-01" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa data malformada, sem escrever", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    expect(await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "31/08" })).toEqual({
      error: "invalidDate",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

describe("unscheduleStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limpa dia e ordem, e devolve a etapa ao poço", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(await unscheduleStage("as1")).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      plannedDate: null,
      plannedOrder: null,
      assigneeId: null,
    });
  });
});

describe("moveStageOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("troca a ordem com o vizinho de cima", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 2,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as1", plannedOrder: 1 },
      { id: "as2", plannedOrder: 2 },
    ]);
    expect(await moveStageOrder("as2", "up")).toEqual({ success: true });
    // Duas escritas: cada um assume a posição do outro.
    expect(db.taskActiveStage.update).toHaveBeenCalledTimes(2);
  });

  it("subir o primeiro não faz nada e não é erro", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
    });
    db.taskActiveStage.findMany.mockResolvedValue([{ id: "as1", plannedOrder: 1 }]);
    expect(await moveStageOrder("as1", "up")).toEqual({ success: true });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

function formatUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts`
Expected: FAIL — as três funções ainda não existem

- [ ] **Step 4: Implementar as ações**

Acrescentar ao fim de `lib/actions/week-planning.ts`:

```ts
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Põe a etapa no dia de alguém. Programar ATRIBUI — inclusive etapa ainda não liberada, que é
 *  trabalho com dono à espera de liberar. Etapa de outra pessoa não é puxável por aqui: remanejar
 *  responsável é decisão da própria etapa, não efeito colateral de arrastar na agenda. */
export async function scheduleStage(input: {
  activeStageId: string;
  userId: string;
  dateISO: string;
}) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  if (!DATE_ONLY.test(input.dateISO)) return { error: t("invalidDate") };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: input.activeStageId },
    select: { id: true, assigneeId: true, status: true },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.status === "COMPLETED") return { error: t("completedStage") };
  if (row.assigneeId && row.assigneeId !== input.userId) return { error: t("alreadyAssigned") };

  const plannedDate = new Date(`${input.dateISO}T00:00:00Z`);

  // Entra no FIM do dia: quem chega depois não fura a ordem que a pessoa já montou.
  const ultimo = await prisma.taskActiveStage.aggregate({
    where: { assigneeId: input.userId, plannedDate },
    _max: { plannedOrder: true },
  });

  try {
    await prisma.taskActiveStage.update({
      where: { id: input.activeStageId },
      data: {
        assigneeId: input.userId,
        plannedDate,
        plannedOrder: (ultimo._max.plannedOrder ?? 0) + 1,
      },
    });
  } catch (error) {
    console.error("scheduleStage error:", error);
    return { error: t("scheduleFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}

/** Tira da programação e devolve ao poço. O `assigneeId` sai junto: manter o dono sem dia deixaria
 *  a etapa presa a alguém e invisível no poço — o pior dos dois mundos. */
export async function unscheduleStage(activeStageId: string) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: { id: true, assigneeId: true, status: true },
  });
  if (!row) return { error: t("stageNotFound") };

  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      data: { plannedDate: null, plannedOrder: null, assigneeId: null },
    });
  } catch (error) {
    console.error("unscheduleStage error:", error);
    return { error: t("scheduleFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}

/** Sobe ou desce um item dentro do dia, trocando de posição com o vizinho. Troca em vez de
 *  renumerar tudo: duas escritas em vez de N, e a ordem dos outros não muda por tabela. */
export async function moveStageOrder(activeStageId: string, direction: "up" | "down") {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const alvo = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: { id: true, assigneeId: true, plannedDate: true, plannedOrder: true },
  });
  if (!alvo || !alvo.assigneeId || !alvo.plannedDate) return { error: t("stageNotFound") };

  const doDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: alvo.assigneeId,
      plannedDate: alvo.plannedDate,
      status: { not: "COMPLETED" },
    },
    select: { id: true, plannedOrder: true },
    orderBy: { plannedOrder: "asc" },
  });

  const i = doDia.findIndex((x) => x.id === activeStageId);
  const j = direction === "up" ? i - 1 : i + 1;
  // Fora da lista não é erro: a seta simplesmente não tem para onde ir.
  if (i < 0 || j < 0 || j >= doDia.length) return { success: true as const };

  try {
    await prisma.taskActiveStage.update({
      where: { id: doDia[i].id },
      data: { plannedOrder: doDia[j].plannedOrder },
    });
    await prisma.taskActiveStage.update({
      where: { id: doDia[j].id },
      data: { plannedOrder: doDia[i].plannedOrder },
    });
  } catch (error) {
    console.error("moveStageOrder error:", error);
    return { error: t("reorderFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (9 testes), tsc limpo

- [ ] **Step 6: Commit**

```bash
git add lib/actions/week-planning.ts locales __tests__/lib/actions/week-planning-write.test.ts
git commit -m "feat(programação): ações de programar, tirar e reordenar"
```

---

### Task 6: A tela da semana

**Files:**

- Create: `app/[locale]/(protected)/planning/week/page.tsx`
- Create: `app/[locale]/(protected)/planning/week/ScheduleDialog.tsx`
- Create: `app/[locale]/(protected)/planning/week/OrderControls.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`
- Modify: `lib/navigation.ts` (item de menu)

**Interfaces:**

- Consumes: `getWeekPlanning`, `scheduleStage`, `unscheduleStage`, `moveStageOrder`,
  `DAY_VISUAL_HOURS`, `DEFAULT_WEEKLY_HOURS` (Tasks 4 e 5); `mondayOfWeek`, `parseWeekParam`,
  `formatISODate` de `@/lib/dates`; `useServerAction` de `@/lib/hooks/useServerAction`
- Produces: rota `/planning/week`

- [ ] **Step 1: Chaves de tradução nos dois locales**

Em `locales/pt-BR/planning.json`, na raiz, o namespace `week`:

```json
"week": {
  "kicker": "Planejamento",
  "title": "Programação da semana",
  "subtitle": "Distribua as etapas entre as pessoas e veja onde ainda há espaço.",
  "poolTitle": "Disponíveis",
  "poolEmpty": "Nenhuma etapa livre no momento.",
  "conflictsTitle": "Agendamentos que não vão acontecer",
  "conflictsHelp": "Estas etapas têm hora marcada mas ainda não foram liberadas. Libere a etapa anterior, remarque, ou troque o responsável.",
  "weekOf": "Semana de {date}",
  "capacity": "{used}h de {total}h",
  "dayRuler": "régua de {hours}h — referência visual, não meta",
  "estimated": "estimativa",
  "waiting": "não liberada",
  "scheduled": "agendada",
  "schedule": "Programar",
  "unschedule": "Tirar da semana",
  "moveUp": "Subir",
  "moveDown": "Descer",
  "dialogTitle": "Programar etapa",
  "dialogPerson": "Pessoa",
  "dialogDay": "Dia",
  "dialogSubmit": "Programar",
  "scheduled_toast": "Etapa programada.",
  "unscheduled_toast": "Etapa devolvida ao poço.",
  "noCapacity": "Sem capacidade semanal cadastrada — usando o padrão de {hours}h."
}
```

Em `locales/es-ES/planning.json`:

```json
"week": {
  "kicker": "Planificación",
  "title": "Programación de la semana",
  "subtitle": "Reparte las etapas entre las personas y mira dónde queda espacio.",
  "poolTitle": "Disponibles",
  "poolEmpty": "No hay ninguna etapa libre ahora mismo.",
  "conflictsTitle": "Citas que no van a ocurrir",
  "conflictsHelp": "Estas etapas tienen hora fijada pero aún no se han liberado. Libera la etapa anterior, cambia la cita o cambia de responsable.",
  "weekOf": "Semana del {date}",
  "capacity": "{used}h de {total}h",
  "dayRuler": "regla de {hours}h: referencia visual, no objetivo",
  "estimated": "estimación",
  "waiting": "no liberada",
  "scheduled": "con cita",
  "schedule": "Programar",
  "unschedule": "Quitar de la semana",
  "moveUp": "Subir",
  "moveDown": "Bajar",
  "dialogTitle": "Programar etapa",
  "dialogPerson": "Persona",
  "dialogDay": "Día",
  "dialogSubmit": "Programar",
  "scheduled_toast": "Etapa programada.",
  "unscheduled_toast": "Etapa devuelta a la reserva.",
  "noCapacity": "Sin capacidad semanal registrada: se usa el valor por defecto de {hours}h."
}
```

- [ ] **Step 2: O diálogo de programar**

Criar `app/[locale]/(protected)/planning/week/ScheduleDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { scheduleStage } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Programar por diálogo, não arrastando.
 *
 *  Não há biblioteca de drag no projeto, e arrastar é a parte que os testes menos alcançam. Numa
 *  grade larga de pessoas × dias, escolher de uma lista é mais preciso que mirar uma célula — e a
 *  fatia 2, que é onde arrastar de fato importa, nasce podendo adotá-lo por cima disto. */
export function ScheduleDialog({
  activeStageId,
  label,
  people,
  days,
}: {
  activeStageId: string;
  label: string;
  people: { id: string; name: string }[];
  days: string[];
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [dateISO, setDateISO] = useState(days[0] ?? "");

  const { run, isPending } = useServerAction(scheduleStage, {
    successMessage: t("scheduled_toast"),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" />
          {t("schedule")}
        </Button>
      }
      title={t("dialogTitle")}
      description={label}
      formId="schedule-stage-form"
      submitLabel={t("dialogSubmit")}
      isPending={isPending}
    >
      <form
        id="schedule-stage-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run({ activeStageId, userId, dateISO });
        }}
      >
        <div>
          <FieldLabel htmlFor="sd-person" required>
            {t("dialogPerson")}
          </FieldLabel>
          <select
            id="sd-person"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="sd-day" required>
            {t("dialogDay")}
          </FieldLabel>
          <select
            id="sd-day"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </form>
    </FormDialog>
  );
}
```

- [ ] **Step 3: As setas de reordenar**

Criar `app/[locale]/(protected)/planning/week/OrderControls.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { moveStageOrder, unscheduleStage } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Reordenar por setas e tirar da semana. Sem arrastar nesta fatia — ver ScheduleDialog. */
export function OrderControls({ activeStageId }: { activeStageId: string }) {
  const t = useTranslations("planning.week");
  const router = useRouter();

  const mover = useServerAction(moveStageOrder, { onSuccess: () => router.refresh() });
  const tirar = useServerAction(unscheduleStage, {
    successMessage: t("unscheduled_toast"),
    onSuccess: () => router.refresh(),
  });

  const btn =
    "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        className={btn}
        disabled={mover.isPending}
        aria-label={t("moveUp")}
        title={t("moveUp")}
        onClick={() => mover.run(activeStageId, "up")}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={mover.isPending}
        aria-label={t("moveDown")}
        title={t("moveDown")}
        onClick={() => mover.run(activeStageId, "down")}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={tirar.isPending}
        aria-label={t("unschedule")}
        title={t("unschedule")}
        onClick={() => tirar.run(activeStageId)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: A página**

Criar `app/[locale]/(protected)/planning/week/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import {
  getWeekPlanning,
  DAY_VISUAL_HOURS,
  DEFAULT_WEEKLY_HOURS,
} from "@/lib/actions/week-planning";
import { mondayOfWeek, parseWeekParam, formatISODate, formatDisplayDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScheduleDialog } from "./ScheduleDialog";
import { OrderControls } from "./OrderControls";

export const metadata: Metadata = { title: "Programação da semana" };

export default async function WeekPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; team?: string | string[] }>;
}) {
  const [t, sp] = await Promise.all([getTranslations("planning.week"), searchParams]);
  const monday = mondayOfWeek(parseWeekParam(sp.week));
  const teamId = Array.isArray(sp.team) ? sp.team[0] : sp.team;

  const plan = await getWeekPlanning(formatISODate(monday), teamId);
  const pessoas = plan.people.map((p) => ({ id: p.userId, name: p.name }));

  // Conflito é a primeira coisa que o gestor precisa ver: agendamento que não vai acontecer só
  // aparece a tempo se estiver no topo.
  const conflitos = plan.people.flatMap((p) =>
    plan.days.flatMap((d) =>
      p.byDay[d].slots
        .filter((s) => s.kind === "conflict")
        .map((s) => ({ person: p.name, day: d, id: s.item.id }))
    )
  );

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
      />

      {conflitos.length > 0 && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-subtle p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-danger">{t("conflictsTitle")}</p>
              <p className="mt-1 text-sm text-foreground/80">{t("conflictsHelp")}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                {conflitos.map((c) => (
                  <li key={c.id}>
                    {c.person} · {c.day}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]">
        <SectionCard bodyClassName="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                  ·
                </th>
                {plan.days.map((d) => (
                  <th
                    key={d}
                    className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground"
                  >
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.people.map((p) => (
                <tr key={p.userId} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("capacity", { used: p.usedHours.toFixed(1), total: p.weeklyHours })}
                    </p>
                    {p.weeklyHours === DEFAULT_WEEKLY_HOURS && (
                      <p className="text-xs text-warning">
                        {t("noCapacity", { hours: DEFAULT_WEEKLY_HOURS })}
                      </p>
                    )}
                  </td>
                  {plan.days.map((d) => {
                    const dia = p.byDay[d];
                    return (
                      <td key={d} className="px-4 py-3">
                        {/* A régua de 8h é VISUAL e a tela diz isso — número em barra vira meta na
                            cabeça de quem olha, mesmo sem ninguém ter decidido isso. */}
                        <p
                          className="mb-1 text-xs text-muted-foreground"
                          title={t("dayRuler", { hours: DAY_VISUAL_HOURS })}
                        >
                          {dia.usedHours.toFixed(1)}h / {DAY_VISUAL_HOURS}h
                        </p>
                        <ul className="space-y-1">
                          {dia.slots.map((s) => (
                            <li
                              key={s.item.id}
                              className={`rounded border px-2 py-1 text-xs ${
                                s.kind === "conflict"
                                  ? "border-danger/40 bg-danger-subtle text-danger"
                                  : s.kind === "waiting"
                                    ? "border-border bg-muted/40 text-muted-foreground"
                                    : "border-border bg-card text-foreground"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {s.kind === "waiting" && `(${t("waiting")}) `}
                                  {s.kind === "scheduled" && `(${t("scheduled")}) `}
                                  {s.item.referenceHours.toFixed(1)}h
                                </span>
                                <OrderControls activeStageId={s.item.id} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title={t("poolTitle")} bodyClassName="space-y-2 p-4">
          {plan.pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("poolEmpty")}</p>
          ) : (
            plan.pool.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{item.taskTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {item.clientName} · {item.stageName} · {item.referenceHours.toFixed(1)}h
                </p>
                <div className="mt-2">
                  <ScheduleDialog
                    activeStageId={item.id}
                    label={`${item.taskTitle} · ${item.stageName}`}
                    people={pessoas}
                    days={plan.days}
                  />
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Item de menu**

Em `lib/navigation.ts`, no grupo de planejamento, inserir **antes** da linha de `cobertura`:

```ts
      { id: "programacao", labelKey: "programacao", href: "/planning/week", icon: CalendarClock },
```

Importar `CalendarClock` de `lucide-react` junto dos outros ícones já importados no arquivo.

A chave `programacao` entra no mesmo arquivo de locale e no mesmo namespace onde vivem `cobertura` e
`datas` — descubra qual é procurando por `"cobertura"` nos locales, e acrescente lá:
`"programacao": "Programação"` em pt-BR e `"programacao": "Programación"` em es-ES.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run build`
Expected: tsc limpo, suíte verde (a paridade de locales precisa passar), build compilando

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(protected)/planning/week" locales lib/navigation.ts
git commit -m "feat(programação): mesa semanal do gestor com poço e conflitos"
```

---

### Task 7: Documentação

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/biblioteca-de-conhecimento.md`

**Interfaces:**

- Consumes: a rota `/planning/week` (Task 6)
- Produces: nada

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar a subseção
(MESCLAR — não sobrescrever as que já existem):

```markdown
#### Programação semanal (fatia 1)

- **Mesa semanal do gestor** (`/planning/week`): pessoa × dia, com o espaço livre de cada um e o
  poço de etapas disponíveis. O mapa de vagos é a própria mesa — a célula já mostra o quanto o dia
  pegou.
- **O dia é guardado, a rolagem é leitura.** A fila de hoje é "não concluído com data <= hoje", então
  o que não foi feito ontem aparece hoje sem job nenhum; e quem termina o dia puxa o próximo. A folga
  se acumula no fim da semana, que é o objetivo: o ganho de eficiência é de quem trabalhou.
- **Agendamento que não vai acontecer aparece no topo.** Etapa com hora marcada e ainda não liberada
  não é reordenada em silêncio — vira conflito em destaque, porque quem descobre no dia já perdeu a
  locação.
- **Não existe nota de aderência**, e o modelo a torna impossível: sem histórico de plano, não há o
  que comparar. O envelhecimento POR ETAPA continua sendo o sinal, e é sobre o trabalho, não sobre
  quem o fez.
```

- [ ] **Step 2: Biblioteca de conhecimento**

Em `docs/biblioteca-de-conhecimento.md`, na seção `## 4. Decisões de arquitetura registradas (ADRs)`,
acrescentar ao final da lista:

```markdown
- **Programação semanal sem histórico de plano** — o dia e a ordem vivem em campos de
  `TaskActiveStage`, não numa tabela de agenda. Uma tabela guardaria o que foi planejado, e histórico
  de plano é o insumo exato da nota de aderência ("cumpriu 60% da semana"), que P1/P2 proíbem. Sem
  ele o cálculo é impossível, e a garantia deixa de depender de disciplina. _(P1/P2)_
- **Fila ordenada, não grade de horários** — a unidade da programação é ordem, e a hora é referência
  derivada da classe (P4). Hora fixa existe só onde a realidade a impõe: agendamento de pessoa, lugar
  ou equipamento. É o que separa esta feature do que o P7 proíbe. A régua de 8h no dia é declarada na
  própria tela como visual, não meta. _(P4/P7)_
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx vitest run && npx prettier --check CHANGELOG.md docs/biblioteca-de-conhecimento.md`
Expected: verde

```bash
git add CHANGELOG.md docs/biblioteca-de-conhecimento.md
git commit -m "docs(programação): changelog e as duas decisões na biblioteca"
```

---

## Fora deste plano

- Arrastar (decisão registrada: fatia 1 sem drag; a fatia 2 pode adotá-lo por cima)
- "Minha semana" — a tela da pessoa (fatia 2)
- Carga por cliente (fatia 3)
- Edição das janelas fixas (`scheduledStart`/`scheduledEnd`) por interface — os campos existem e são
  lidos; quem os preenche por enquanto é o banco. Entra quando houver a tela de agendamento.
- Aplicar a migration em produção: decisão do usuário, feita fora do plano
