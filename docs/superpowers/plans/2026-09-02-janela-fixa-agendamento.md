# Janela fixa do agendamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o gestor passa a marcar a hora de um compromisso na mesa semanal, e o sistema impede que dois compromissos da mesma pessoa se atropelem — acendendo, de quebra, o bloco de conflitos que nunca acendeu.

**Architecture:** toda a matemática (que faixa um item ocupa, quem colide com quem, quem vence, qual o próximo horário livre) mora numa função pura nova, `lib/planning/stage-window.ts`. A escrita é uma ação nova (`setStageWindow`) que ancora a hora no dia da própria coluna, e a mesma trava é chamada por `scheduleStage` na transferência. Nenhuma sobreposição chega ao banco, então `QueueKind` e as duas telas não mudam de forma.

**Tech Stack:** Next.js 15 (Server Actions), Prisma/PostgreSQL, next-intl v4, Tailwind, vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-janela-fixa-agendamento-design.md`

## Global Constraints

- **Sem migração.** `TaskActiveStage.scheduledStart` e `scheduledEnd` já existem, anuláveis. Nenhuma tarefa deste plano toca `prisma/schema.prisma`.
- **Duas convenções de tempo, nunca misturadas.** `plannedDate` é meia-noite de São Paulo codificada em UTC (`formatISODate(plannedDate)` devolve o dia direto). `scheduledStart`/`scheduledEnd` são instantes reais. A ponte entre elas é `realInstant()` de `lib/dates.ts` — nunca aritmética de fuso escrita à mão.
- **Toda string de tela passa por `t()`**, e entra em `locales/pt-BR/*.json` **e** `locales/es-ES/*.json` na mesma tarefa. O teste de paridade (`__tests__/i18n/locale-parity.test.ts`) falha se um locale ficar para trás, e o es-ES precisa ser espanhol de verdade.
- **A tela explica, o servidor garante.** Toda regra validada na interface é validada de novo na Server Action — o precedente é `scheduleStage`, que lista só o time efetivo E recusa de novo no servidor.
- **Rodar antes de commitar:** `npx vitest run <arquivo>` na tarefa, e `npx tsc --noEmit` antes do commit final de cada tarefa.
- **Prioridade** é o enum `TaskPriority` do Prisma: `LOW` < `MEDIUM` < `HIGH` < `URGENT`.

### Desvio da spec, deliberado

A spec diz que `getWeekPlanning` passaria a carregar `task.priority`. **Não carrega, e não precisa:** o veredito roda no servidor, dentro de `setStageWindow`, que faz a própria consulta e devolve a prioridade da ocupante no payload do conflito. Carregar prioridade em toda a grade seria dado que ninguém lê. A leitura ganha `scheduledEnd` (Task 13), esse sim necessário na tela.

---

### Task 1: A faixa que um item ocupa

**Files:**

- Create: `lib/planning/stage-window.ts`
- Test: `__tests__/lib/planning/stage-window.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `type WindowInput = { scheduledStart: Date | null; scheduledEnd: Date | null; referenceHours: number }`, `type Range = { start: Date; end: Date }`, `const NO_REFERENCE_MS = 3_600_000`, `function occupiedRange(item: WindowInput): Range | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { occupiedRange } from "@/lib/planning/stage-window";

const AS_14H = new Date("2026-09-04T17:00:00.000Z"); // 14h em São Paulo

describe("occupiedRange", () => {
  it("sem hora marcada, não ocupa nada", () => {
    // Item da fila normal: quem manda nele é a ordem manual, não o relógio.
    expect(
      occupiedRange({ scheduledStart: null, scheduledEnd: null, referenceHours: 3 })
    ).toBeNull();
  });

  it("com fim declarado, o compromisso manda", () => {
    // A locação vai das 14h às 16h. A referência da etapa (3h) não tem voto: o que foi combinado
    // com o estúdio é o que ocupa a agenda.
    const r = occupiedRange({
      scheduledStart: AS_14H,
      scheduledEnd: new Date("2026-09-04T19:00:00.000Z"),
      referenceHours: 3,
    });
    expect(r).toEqual({ start: AS_14H, end: new Date("2026-09-04T19:00:00.000Z") });
  });

  it("sem fim declarado, a faixa é o range estimado da etapa", () => {
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 3 });
    expect(r?.end).toEqual(new Date("2026-09-04T20:00:00.000Z")); // 14h + 3h
  });

  it("etapa sem referência nenhuma ocupa 1h por convenção", () => {
    // Faixa de duração zero não colidiria com nada e a trava inteira viraria decorativa.
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 0 });
    expect(r?.end).toEqual(new Date("2026-09-04T18:00:00.000Z")); // 14h + 1h
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/planning/stage-window"`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * A matemática da janela fixa: que faixa cada compromisso ocupa, quem colide com quem, quem vence
 * e para onde vai o perdedor.
 *
 * Pura e separada das ações porque é aqui que o erro é silencioso: nada quebra se a faixa sair
 * errada — só duas pessoas aparecem no mesmo estúdio às 14h.
 */

/** Etapa sem referência nenhuma. Ver `occupiedRange`. */
export const NO_REFERENCE_MS = 3_600_000;

export type WindowInput = {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  /** Horas de referência da ETAPA (`lib/planning/stage-reference.ts`), não do que foi combinado. */
  referenceHours: number;
};

export type Range = { start: Date; end: Date };

/**
 * A faixa ocupada, em três casos:
 *
 *   1. fim declarado → é ele, porque é o compromisso real;
 *   2. sem fim → início + referência da etapa, o "range estimado necessário";
 *   3. sem fim e sem referência → 1h de convenção, dita na tela.
 *
 * O caso 3 existe porque uma faixa de duração zero não colidiria com nada, e a trava de
 * sobreposição inteira viraria decorativa para toda etapa sem amostra nem SLA.
 *
 * Usar a referência aqui não é apresentar estimativa como verdade (P7): ela não promete nada a
 * ninguém e não aparece como compromisso na tela — serve só para detectar que dois compromissos vão
 * se atropelar. A promessa continua sendo o início, que é o que foi combinado.
 */
export function occupiedRange(item: WindowInput): Range | null {
  if (!item.scheduledStart) return null;
  if (item.scheduledEnd) return { start: item.scheduledStart, end: item.scheduledEnd };
  const duracao = item.referenceHours > 0 ? item.referenceHours * 3_600_000 : NO_REFERENCE_MS;
  return { start: item.scheduledStart, end: new Date(item.scheduledStart.getTime() + duracao) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stage-window.ts __tests__/lib/planning/stage-window.test.ts
git commit -m "feat(janela): a faixa que um compromisso ocupa"
```

---

### Task 2: Colisão entre faixas

**Files:**

- Modify: `lib/planning/stage-window.ts`
- Test: `__tests__/lib/planning/stage-window.test.ts`

**Interfaces:**

- Consumes: `Range` da Task 1.
- Produces: `function rangesOverlap(a: Range, b: Range): boolean`, `function collidingWith<T extends { range: Range }>(nova: Range, ocupadas: T[]): T[]`.

- [ ] **Step 1: Write the failing test**

```ts
// (adicionar ao mesmo arquivo, importando rangesOverlap e collidingWith)
const faixa = (deISO: string, ateISO: string): Range => ({
  start: new Date(deISO),
  end: new Date(ateISO),
});

describe("rangesOverlap", () => {
  it("encostar não é colidir", () => {
    // 14h–16h e 16h–17h convivem: a segunda começa quando a primeira acaba. Tratar a borda como
    // colisão proibiria a agenda cheia e legítima — dois compromissos em sequência.
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const b = faixa("2026-09-04T19:00:00Z", "2026-09-04T20:00:00Z");
    expect(rangesOverlap(a, b)).toBe(false);
    expect(rangesOverlap(b, a)).toBe(false);
  });

  it("um minuto de invasão já é colisão", () => {
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const b = faixa("2026-09-04T18:59:00Z", "2026-09-04T20:00:00Z");
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it("faixa contida dentro da outra colide", () => {
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T21:00:00Z");
    const b = faixa("2026-09-04T18:00:00Z", "2026-09-04T19:00:00Z");
    expect(rangesOverlap(a, b)).toBe(true);
  });
});

describe("collidingWith", () => {
  it("devolve só quem está no caminho, preservando o objeto de origem", () => {
    // O chamador precisa saber QUEM colide (demanda, etapa, prioridade), não só que colide.
    const nova = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const ocupadas = [
      { id: "a", range: faixa("2026-09-04T13:00:00Z", "2026-09-04T15:00:00Z") },
      { id: "b", range: faixa("2026-09-04T18:00:00Z", "2026-09-04T20:00:00Z") },
      { id: "c", range: faixa("2026-09-04T19:00:00Z", "2026-09-04T21:00:00Z") },
    ];
    expect(collidingWith(nova, ocupadas).map((o) => o.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: FAIL — `rangesOverlap is not a function` (import não resolvido).

- [ ] **Step 3: Write minimal implementation**

```ts
/** Duas faixas se atropelam? Encostar NÃO é colidir: 14h–16h e 16h–17h convivem, e tratar a borda
 *  como conflito proibiria a agenda cheia e legítima. */
export function rangesOverlap(a: Range, b: Range): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Quem, entre os já ocupados, está no caminho da faixa nova. Devolve os objetos de origem — o
 *  chamador precisa dizer ao gestor QUAL demanda está ali, não só que existe uma. */
export function collidingWith<T extends { range: Range }>(nova: Range, ocupadas: T[]): T[] {
  return ocupadas.filter((o) => rangesOverlap(nova, o.range));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stage-window.ts __tests__/lib/planning/stage-window.test.ts
git commit -m "feat(janela): colisão entre faixas, com a borda que não colide"
```

---

### Task 3: O veredito da prioridade

**Files:**

- Modify: `lib/planning/stage-window.ts`
- Test: `__tests__/lib/planning/stage-window.test.ts`

**Interfaces:**

- Consumes: nada das tarefas anteriores.
- Produces: `function canOverride(nova: TaskPriority, ocupante: TaskPriority): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import type { TaskPriority } from "@prisma/client";
// (importar canOverride)

describe("canOverride", () => {
  it("prioridade maior ocupa o horário", () => {
    expect(canOverride("HIGH", "MEDIUM")).toBe(true);
    expect(canOverride("MEDIUM", "LOW")).toBe(true);
    expect(canOverride("URGENT", "HIGH")).toBe(true);
  });

  it("menor ou igual não ocupa", () => {
    // Empate não passa: sem uma diferença declarada por quem classificou as duas demandas, o
    // sistema não tem critério — e inventar um seria decidir no lugar do gestor.
    expect(canOverride("LOW", "HIGH")).toBe(false);
    expect(canOverride("MEDIUM", "MEDIUM")).toBe(false);
    expect(canOverride("HIGH", "HIGH")).toBe(false);
  });

  it("urgente contra urgente PASSA — é o único efeito da segunda metade da regra", () => {
    // `URGENT` já é o topo do enum, então "maior que a ocupante" nunca autorizaria este caso.
    // A regra tem duas metades exatamente para ele: duas urgentes, e o desempate é de quem
    // classificou as duas como urgentes.
    expect(canOverride("URGENT", "URGENT")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: FAIL — `canOverride is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { TaskPriority } from "@prisma/client";

const RANK: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

/**
 * A nova pode ocupar um horário já comprometido?
 *
 * Duas metades, e a segunda não é redundante: `URGENT` já é o topo do enum, então "maior que a
 * ocupante" nunca autorizaria urgente contra urgente — e é justamente esse o caso que ela libera.
 * Empate em qualquer outro nível não passa.
 */
export function canOverride(nova: TaskPriority, ocupante: TaskPriority): boolean {
  return RANK[nova] > RANK[ocupante] || nova === "URGENT";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stage-window.ts __tests__/lib/planning/stage-window.test.ts
git commit -m "feat(janela): o veredito da prioridade, com urgente contra urgente"
```

---

### Task 4: O primeiro horário livre

**Files:**

- Modify: `lib/planning/stage-window.ts`
- Test: `__tests__/lib/planning/stage-window.test.ts`

**Interfaces:**

- Consumes: `Range`, `rangesOverlap`.
- Produces: `function firstFreeStart(desde: Date, duracaoMs: number, ocupadas: Range[]): Date`.

- [ ] **Step 1: Write the failing test**

```ts
// (importar firstFreeStart)
const H = 3_600_000;

describe("firstFreeStart", () => {
  it("sem nada no caminho, é o próprio instante", () => {
    const desde = new Date("2026-09-04T19:00:00Z");
    expect(firstFreeStart(desde, 2 * H, [])).toEqual(desde);
  });

  it("pula uma terceira janela que estava no meio", () => {
    // Adiar a ocupante não pode trocar uma colisão por outra: se às 16h já existe outro
    // compromisso, o "primeiro livre" é depois DELE.
    const desde = new Date("2026-09-04T19:00:00Z"); // 16h SP
    const ocupadas = [
      { start: new Date("2026-09-04T19:00:00Z"), end: new Date("2026-09-04T20:00:00Z") },
    ];
    expect(firstFreeStart(desde, 2 * H, ocupadas)).toEqual(new Date("2026-09-04T20:00:00Z"));
  });

  it("pula janelas encadeadas, uma atrás da outra", () => {
    const desde = new Date("2026-09-04T19:00:00Z");
    const ocupadas = [
      { start: new Date("2026-09-04T20:00:00Z"), end: new Date("2026-09-04T21:00:00Z") },
      { start: new Date("2026-09-04T19:00:00Z"), end: new Date("2026-09-04T20:00:00Z") },
    ];
    // Fora de ordem de propósito: quem chama monta a lista pela consulta, não ordenada.
    expect(firstFreeStart(desde, H, ocupadas)).toEqual(new Date("2026-09-04T21:00:00Z"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: FAIL — `firstFreeStart is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * O primeiro instante, a partir de `desde`, em que uma faixa de `duracaoMs` não encosta em nenhuma
 * das já ocupadas. Serve à saída "adiar a ocupante": empurrar para o fim da nova não basta, porque
 * pode haver um terceiro compromisso logo ali — e trocar uma colisão por outra seria pior que não
 * oferecer a saída.
 *
 * NÃO inventa fim de expediente: o workos não tem escala cadastrada (a barra de 8h do dia é régua
 * visual, e a spec da fatia 1 diz isso). "Livre" significa sem outra janela, não dentro de um turno
 * que o sistema não conhece.
 */
export function firstFreeStart(desde: Date, duracaoMs: number, ocupadas: Range[]): Date {
  const ordenadas = [...ocupadas].sort((a, b) => a.start.getTime() - b.start.getTime());
  let inicio = desde;
  for (const o of ordenadas) {
    const candidata = { start: inicio, end: new Date(inicio.getTime() + duracaoMs) };
    if (rangesOverlap(candidata, o)) inicio = o.end;
  }
  return inicio;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/planning/stage-window.test.ts`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stage-window.ts __tests__/lib/planning/stage-window.test.ts
git commit -m "feat(janela): o primeiro horário livre, pulando quem já está lá"
```

---

### Task 5: `setStageWindow` grava a hora, ancorada no dia da coluna

**Files:**

- Modify: `lib/actions/week-planning.ts` (nova export ao lado de `unscheduleStage`)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json` (namespace `weekPlanning`)
- Test: Create `__tests__/lib/actions/stage-window-write.test.ts`

**Interfaces:**

- Consumes: `occupiedRange` (Task 1) ainda não; esta tarefa só grava.
- Produces:

```ts
export async function setStageWindow(input: {
  activeStageId: string;
  /** "HH:MM" no relógio de São Paulo. `null` limpa a janela. */
  startTime: string | null;
  /** "HH:MM" opcional. Ignorado quando `startTime` é nulo. */
  endTime?: string | null;
}): Promise<{ success: true } | { error: string }>;
```

**Nota de desenho:** a ação **não recebe data**. O dia vem do `plannedDate` da própria linha, o que torna o invariante estrutural em vez de validado: é impossível gravar um compromisso de quinta num item que está na coluna de quarta.

- [ ] **Step 1: Write the failing test**

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
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { setStageWindow } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

/** Linha programada para 04/09, sem compromisso ainda. `plannedDate` é meia-noite SP codificada em
 *  UTC — a mesma convenção que `scheduleStage` grava. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: null,
    scheduledEnd: null,
    task: { priority: "MEDIUM", title: "Reels institucional" },
    stage: { name: "Gravação" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.taskActiveStage.findMany.mockResolvedValue([]);
  vi.mocked(getStageReferences).mockResolvedValue(
    new Map([["s1", { hours: 3, source: "observed" }]])
  );
});

describe("setStageWindow", () => {
  it("grava a hora como INSTANTE REAL do dia da coluna", async () => {
    // 14h em São Paulo é 17h UTC. Gravar "14:00" cru deixaria o compromisso três horas adiantado,
    // e o erro só apareceria na borda do dia — o mesmo que o comentário de `realInstant` descreve.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });

    expect(r).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: new Date("2026-09-04T17:00:00.000Z"),
      scheduledEnd: null,
    });
  });

  it("grava o fim quando informado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "16:30" });

    expect(db.taskActiveStage.update.mock.calls[0][0].data.scheduledEnd).toEqual(
      new Date("2026-09-04T19:30:00.000Z")
    );
  });

  it("startTime nulo limpa a janela inteira", async () => {
    // Desmarcar o compromisso é a mesma porta, sem uma segunda ação: o fim nunca sobrevive ao
    // início, senão sobraria uma janela sem começo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({
        scheduledStart: new Date("2026-09-04T17:00:00Z"),
        scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      })
    );

    await setStageWindow({ activeStageId: "as1", startTime: null });

    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: FAIL — `setStageWindow is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `lib/actions/week-planning.ts`, importar `realInstant` de `@/lib/dates` (junto de `formatISODate`) e acrescentar:

```ts
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "14:00" no relógio de São Paulo → instante real, ancorado no dia de `plannedDate`.
 *
 *  `plannedDate` guarda meia-noite SP codificada em UTC, então `formatISODate` devolve o dia SP
 *  direto. Montar o instante em cima dele é o que torna o invariante ESTRUTURAL: não existe caminho
 *  para gravar um compromisso num dia diferente da coluna em que o item está. */
function instanteNoDia(plannedDate: Date, hhmm: string): Date {
  return realInstant(new Date(`${formatISODate(plannedDate)}T${hhmm}:00.000Z`));
}

/**
 * Marca (ou desmarca) o compromisso de uma etapa já programada.
 *
 * Não recebe data de propósito — ver `instanteNoDia`. `startTime` nulo limpa os dois campos: uma
 * janela com fim e sem começo não significa nada.
 */
export async function setStageWindow(input: {
  activeStageId: string;
  startTime: string | null;
  endTime?: string | null;
}) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: input.activeStageId },
    select: {
      id: true,
      assigneeId: true,
      status: true,
      stageId: true,
      plannedDate: true,
      task: { select: { priority: true, title: true } },
      stage: { select: { name: true } },
    },
  });
  if (!row) return { error: t("stageNotFound") };

  if (input.startTime === null) {
    await prisma.taskActiveStage.update({
      where: { id: input.activeStageId },
      data: { scheduledStart: null, scheduledEnd: null },
    });
    revalidatePath("/planning/week");
    return { success: true as const };
  }

  const inicio = instanteNoDia(row.plannedDate as Date, input.startTime);
  const fim = input.endTime ? instanteNoDia(row.plannedDate as Date, input.endTime) : null;

  await prisma.taskActiveStage.update({
    where: { id: input.activeStageId },
    data: { scheduledStart: inicio, scheduledEnd: fim },
  });

  revalidatePath("/planning/week");
  return { success: true as const };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/stage-window-write.test.ts
git commit -m "feat(janela): a ação que marca a hora, ancorada no dia da coluna"
```

---

### Task 6: As recusas de `setStageWindow`

**Files:**

- Modify: `lib/actions/week-planning.ts`
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/stage-window-write.test.ts`

**Interfaces:**

- Consumes: `setStageWindow` da Task 5.
- Produces: chaves novas em `errors.weekPlanning`: `windowNeedsDay`, `invalidTime`, `windowEndBeforeStart`.

- [ ] **Step 1: Write the failing test**

```ts
describe("setStageWindow — recusas", () => {
  it("etapa sem dia não recebe compromisso", async () => {
    // "Quinta às 14h" precisa da quinta. Sem `plannedDate` não há dia em que ancorar a hora, e o
    // item nem aparece numa coluna da grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ plannedDate: null }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "windowNeedsDay" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("etapa concluída não recebe compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ status: "COMPLETED" }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "completedStage" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("hora fora do formato é recusada, sem tentar gravar", async () => {
    // Vem de `<input type="time">`, mas a ação é chamável direto — a tela explica, o servidor
    // garante.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    for (const hora of ["25:00", "14h", "", "9:00"]) {
      const r = await setStageWindow({ activeStageId: "as1", startTime: hora });
      expect(r).toEqual({ error: "invalidTime" });
    }
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim antes do início é recusado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "16:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim IGUAL ao início é recusado — janela de duração zero não ocupa nada", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: FAIL — grava mesmo assim; os `expect` de erro recebem `{ success: true }`.

- [ ] **Step 3: Write minimal implementation**

Dentro de `setStageWindow`, depois do bloco que limpa e antes de montar o instante:

```ts
if (row.status === "COMPLETED") return { error: t("completedStage") };
// O dia é a âncora da hora: sem ele o compromisso não tem onde existir, e o item nem está numa
// coluna da grade.
if (!row.plannedDate) return { error: t("windowNeedsDay") };
if (!HORA.test(input.startTime)) return { error: t("invalidTime") };
if (input.endTime && !HORA.test(input.endTime)) return { error: t("invalidTime") };
```

E depois de calcular `inicio`/`fim`:

```ts
// Duração zero não ocuparia nada e a trava de sobreposição viraria decorativa para esta linha.
if (fim && fim.getTime() <= inicio.getTime()) return { error: t("windowEndBeforeStart") };
```

Chaves novas (pt-BR):

```json
"windowNeedsDay": "Marque o dia antes da hora: o compromisso é \"quinta às 14h\".",
"invalidTime": "Informe uma hora válida, no formato 14:00.",
"windowEndBeforeStart": "O fim precisa vir depois do início."
```

es-ES:

```json
"windowNeedsDay": "Marca el día antes de la hora: el compromiso es \"jueves a las 14h\".",
"invalidTime": "Indica una hora válida, con el formato 14:00.",
"windowEndBeforeStart": "El fin tiene que ser posterior al inicio."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts __tests__/i18n`
Expected: PASS (8 testes de janela + a paridade de locales)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/stage-window-write.test.ts locales
git commit -m "feat(janela): as recusas — sem dia, concluída, hora inválida, fim antes do início"
```

---

### Task 7: A trava de sobreposição em `setStageWindow`

**Files:**

- Modify: `lib/actions/week-planning.ts`
- Test: `__tests__/lib/actions/stage-window-write.test.ts`

**Interfaces:**

- Consumes: `occupiedRange`, `collidingWith`, `canOverride`, `firstFreeStart` (Tasks 1–4).
- Produces:

```ts
export type WindowOccupant = {
  activeStageId: string;
  taskTitle: string;
  stageName: string;
  priority: TaskPriority;
  /** Instantes reais, em ISO — a tela formata no fuso de SP. */
  startISO: string;
  endISO: string;
};
export type WindowOverlap = {
  occupants: WindowOccupant[];
  /** A prioridade autoriza ocupar o horário? Quando falso, a tela só oferece as saídas que não
   *  tocam na ocupante. */
  canOverride: boolean;
  /** Para onde a ocupante iria se o gestor escolher "adiar" — já pulando terceiros. */
  firstFreeStartISO: string;
};
// setStageWindow passa a poder devolver { overlap: WindowOverlap }
```

- [ ] **Step 1: Write the failing test**

```ts
/** Uma ocupante já marcada das 14h às 16h para a mesma pessoa, no mesmo dia. */
function ocupante(over: Record<string, unknown> = {}) {
  return {
    id: "as9",
    stageId: "s9",
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
    scheduledEnd: new Date("2026-09-04T19:00:00Z"),
    task: { priority: "HIGH", title: "Institucional Acme" },
    stage: { name: "Gravação" },
    ...over,
  };
}

describe("setStageWindow — a trava de sobreposição", () => {
  it("sem colisão, grava", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);
    // 17h–20h não encosta em 14h–16h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "17:00" });
    expect(r).toEqual({ success: true });
  });

  it("colide e a prioridade NÃO autoriza: não grava, e diz quem está no caminho", async () => {
    // MEDIUM contra HIGH. Uma recusa que não nomeia a ocupante obriga o gestor a caçar na grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      overlap: {
        canOverride: false,
        occupants: [
          {
            activeStageId: "as9",
            taskTitle: "Institucional Acme",
            stageName: "Gravação",
            priority: "HIGH",
            startISO: "2026-09-04T17:00:00.000Z",
            endISO: "2026-09-04T19:00:00.000Z",
          },
        ],
      },
    });
  });

  it("colide e a prioridade autoriza: AINDA NÃO grava — a saída é do gestor", async () => {
    // A regra é "sempre avisa, e só permite se a prioridade autorizar". Permitir não é gravar por
    // cima: gravar deixaria duas janelas no mesmo horário, que é exatamente o que esta trava
    // existe para impedir. Quem escolhe a saída é o gestor, no diálogo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ overlap: { canOverride: true } });
  });

  it("o horário oferecido para adiar pula um terceiro compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([
      ocupante(),
      ocupante({
        id: "as8",
        scheduledStart: new Date("2026-09-04T20:00:00Z"), // 17h–18h
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      }),
    ]);

    // Nova das 15h às 17h (2h de referência). A ocupante das 14h–16h seria empurrada para 17h,
    // onde há outro compromisso — então o primeiro livre de verdade é 18h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00", endTime: "17:00" });

    expect(r).toMatchObject({ overlap: { firstFreeStartISO: "2026-09-04T21:00:00.000Z" } });
  });

  it("a consulta das ocupantes é da MESMA pessoa, no MESMO dia, e ignora a própria linha", async () => {
    // Sem excluir a si mesma, remarcar um compromisso existente colidiria com ele próprio.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ scheduledStart: new Date("2026-09-04T17:00:00Z") })
    );
    db.taskActiveStage.findMany.mockResolvedValue([]);

    await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toMatchObject({
      assigneeId: "u1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: { not: null },
      id: { not: "as1" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: FAIL — grava em todos os casos; `overlap` nunca aparece no retorno.

- [ ] **Step 3: Write minimal implementation**

Importar em `week-planning.ts`:

```ts
import {
  canOverride,
  collidingWith,
  firstFreeStart,
  occupiedRange,
  type Range,
} from "@/lib/planning/stage-window";
```

Em `setStageWindow`, depois de validar `fim` e antes do `update`:

```ts
// As outras janelas DESTA pessoa NESTE dia. `id: { not: … }` porque remarcar um compromisso
// existente colidiria com ele próprio.
const outras = await prisma.taskActiveStage.findMany({
  where: {
    assigneeId: row.assigneeId,
    plannedDate: row.plannedDate,
    scheduledStart: { not: null },
    id: { not: row.id },
    status: { not: "COMPLETED" },
  },
  select: {
    id: true,
    stageId: true,
    scheduledStart: true,
    scheduledEnd: true,
    task: { select: { priority: true, title: true } },
    stage: { select: { name: true } },
  },
});

// A referência da etapa fecha a faixa de quem não declarou fim — a da nova inclusive.
const refs = await getStageReferences([row.stageId, ...outras.map((o) => o.stageId)]);
const horasDe = (stageId: string) => refs.get(stageId)?.hours ?? 0;

const faixaNova = occupiedRange({
  scheduledStart: inicio,
  scheduledEnd: fim,
  referenceHours: horasDe(row.stageId),
}) as Range;

const ocupadas = outras.flatMap((o) => {
  const range = occupiedRange({
    scheduledStart: o.scheduledStart,
    scheduledEnd: o.scheduledEnd,
    referenceHours: horasDe(o.stageId),
  });
  return range ? [{ ...o, range }] : [];
});

const batidas = collidingWith(faixaNova, ocupadas);
if (batidas.length > 0) {
  // Autoriza se vence TODAS: passar por cima de uma e ignorar a outra deixaria uma sobreposição
  // gravada, que é o que esta trava existe para impedir.
  const autoriza = batidas.every((b) => canOverride(row.task.priority, b.task.priority));
  const duracaoDaOcupante = batidas[0].range.end.getTime() - batidas[0].range.start.getTime();
  return {
    overlap: {
      canOverride: autoriza,
      occupants: batidas.map((b) => ({
        activeStageId: b.id,
        taskTitle: b.task.title,
        stageName: b.stage.name,
        priority: b.task.priority,
        startISO: b.range.start.toISOString(),
        endISO: b.range.end.toISOString(),
      })),
      firstFreeStartISO: firstFreeStart(
        faixaNova.end,
        duracaoDaOcupante,
        ocupadas.map((o) => o.range)
      ).toISOString(),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/stage-window-write.test.ts
git commit -m "feat(janela): a trava — sobreposição nunca chega ao banco"
```

---

### Task 8: `unscheduleStage` limpa a janela

**Files:**

- Modify: `lib/actions/week-planning.ts:396-420`
- Test: `__tests__/lib/actions/week-planning-write.test.ts`

**Interfaces:**

- Consumes: nada novo.
- Produces: nada novo — muda o `data` do `update` existente.

- [ ] **Step 1: Write the failing test**

```ts
// em __tests__/lib/actions/week-planning-write.test.ts, dentro do describe de unscheduleStage
it("[CRÍTICO] devolver ao poço limpa o compromisso junto", async () => {
  // Sem isto sobra uma janela órfã: a etapa volta ao poço, é programada outro dia para outra
  // pessoa, e chega já "agendada" num horário que ninguém marcou — e num dia que não é o dela.
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
  });

  await unscheduleStage("as1");

  expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
    plannedDate: null,
    plannedOrder: null,
    assigneeId: null,
    scheduledStart: null,
    scheduledEnd: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts -t "devolver ao poço"`
Expected: FAIL — o `data` gravado não tem `scheduledStart`/`scheduledEnd`.

- [ ] **Step 3: Write minimal implementation**

```ts
      data: {
        plannedDate: null,
        plannedOrder: null,
        assigneeId: null,
        // A janela sai junto: ela é um compromisso PARA AQUELE DIA e AQUELA pessoa. Deixá-la para
        // trás faz a etapa voltar do poço já agendada num horário que ninguém marcou.
        scheduledStart: null,
        scheduledEnd: null,
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts`
Expected: PASS (todos os testes do arquivo)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/week-planning-write.test.ts
git commit -m "fix(janela): devolver ao poço limpa o compromisso junto"
```

---

### Task 9: Mudar o dia limpa a janela

**Files:**

- Modify: `lib/actions/week-planning.ts` (dentro de `scheduleStage`)
- Test: `__tests__/lib/actions/week-planning-write.test.ts`

**Interfaces:**

- Consumes: nada novo.
- Produces: `scheduleStage` passa a ler `plannedDate` e `scheduledStart` na consulta que já faz.

- [ ] **Step 1: Write the failing test**

```ts
// dentro do describe de scheduleStage
it("reprogramar para OUTRO dia limpa o compromisso", async () => {
  // O horário foi combinado para aquele dia. Deslizar sozinho para o novo seria o sistema
  // remarcando uma locação — decisão de quem combinou, não do UPDATE.
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
    ...timeDe("u1"),
  });

  await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-09-05" });

  expect(db.taskActiveStage.update.mock.calls[0][0].data).toMatchObject({
    scheduledStart: null,
    scheduledEnd: null,
  });
});

it("reprogramar para o MESMO dia preserva o compromisso", async () => {
  // Trocar só a pessoa (uma das saídas do diálogo de sobreposição) não pode apagar a hora.
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
    ...timeDe("u2"),
  });

  await scheduleStage({ activeStageId: "as1", userId: "u2", dateISO: "2026-09-04" });

  const data = db.taskActiveStage.update.mock.calls[0][0].data;
  expect(data).not.toHaveProperty("scheduledStart");
  expect(data).not.toHaveProperty("scheduledEnd");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts -t "compromisso"`
Expected: FAIL no primeiro teste — o `data` não menciona `scheduledStart`.

- [ ] **Step 3: Write minimal implementation**

No `select` de `scheduleStage`, acrescentar `plannedDate: true, scheduledStart: true`. Antes do `update`:

```ts
// Mudar de dia derruba o compromisso: ele foi combinado PARA AQUELE DIA. Deslizar sozinho seria o
// sistema remarcando uma locação, que é conversa com o estúdio e não `UPDATE`. Trocar só a
// pessoa, no mesmo dia, preserva a hora — é uma das saídas do diálogo de sobreposição.
const mudouDeDia = row.plannedDate ? formatISODate(row.plannedDate) !== input.dateISO : false;
const limpaJanela =
  mudouDeDia && row.scheduledStart ? { scheduledStart: null, scheduledEnd: null } : {};
```

E no `data` do `update`: `...limpaJanela,` depois de `plannedOrder`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/week-planning-write.test.ts
git commit -m "fix(janela): mudar o dia derruba o compromisso daquele dia"
```

---

### Task 10: A transferência é estrita

**Files:**

- Modify: `lib/actions/week-planning.ts` (dentro de `scheduleStage`)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/week-planning-write.test.ts`

**Interfaces:**

- Consumes: `occupiedRange`, `collidingWith` (Tasks 1–2); `getStageReferences`.
- Produces: chave `windowBusyPerson` em `errors.weekPlanning`.

- [ ] **Step 1: Write the failing test**

O arquivo já mocka `@/lib/planning/stage-reference` (linha 10) mas **não importa** o símbolo.
Acrescentar ao topo, junto dos outros imports:

```ts
import { getStageReferences } from "@/lib/planning/stage-reference";
```

```ts
it("[CRÍTICO] não transfere etapa COM janela para quem já tem compromisso na faixa", async () => {
  // Trocar o colaborador é uma das saídas para RESOLVER uma sobreposição. Se pudesse criar outra na
  // agenda do colega, o problema mudaria de tela em vez de acabar — e nasceria pela porta dos
  // fundos, sem nunca ter passado pela trava.
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: new Date("2026-09-04T17:00:00Z"), // 14h
    scheduledEnd: new Date("2026-09-04T19:00:00Z"), // 16h
    ...timeDe("u2"),
  });
  // u2 já tem 15h–17h.
  db.taskActiveStage.findMany.mockResolvedValue([
    {
      id: "as9",
      stageId: "s9",
      scheduledStart: new Date("2026-09-04T18:00:00Z"),
      scheduledEnd: new Date("2026-09-04T20:00:00Z"),
      task: { title: "Campanha Natal" },
      stage: { name: "Edição" },
    },
  ]);
  vi.mocked(getStageReferences).mockResolvedValue(new Map());

  const r = await scheduleStage({ activeStageId: "as1", userId: "u2", dateISO: "2026-09-04" });

  expect(r).toEqual({ error: "windowBusyPerson" });
  expect(db.taskActiveStage.update).not.toHaveBeenCalled();
});

it("etapa SEM janela transfere normalmente, sem consultar agenda", async () => {
  // A trava é sobre compromissos com hora. O resto da mesa continua sendo fila ordenada, e exigir
  // agenda livre para item sem hora inventaria uma grade de horários — o que a spec proíbe.
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    assigneeId: null,
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: null,
    scheduledStart: null,
    ...timeDe("u2"),
  });

  const r = await scheduleStage({ activeStageId: "as1", userId: "u2", dateISO: "2026-09-04" });

  expect(r).toEqual({ success: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts -t "transfere"`
Expected: FAIL no primeiro — devolve `{ success: true }`.

- [ ] **Step 3: Write minimal implementation**

No `select` de `scheduleStage`, acrescentar `stageId: true, scheduledEnd: true`. Depois do bloco `limpaJanela`:

```ts
// A janela viaja junto com a etapa quando só a pessoa muda — então a agenda do DESTINO precisa
// estar livre na faixa. Sem escape por prioridade aqui: transferir é como se RESOLVE uma
// sobreposição, e não pode criar outra.
const janelaQueViaja = mudouDeDia ? null : row.scheduledStart;
if (janelaQueViaja && input.userId !== row.assigneeId) {
  const refs = await getStageReferences([row.stageId]);
  const faixa = occupiedRange({
    scheduledStart: janelaQueViaja,
    scheduledEnd: row.scheduledEnd,
    referenceHours: refs.get(row.stageId)?.hours ?? 0,
  }) as Range;

  const doDestino = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: input.userId,
      plannedDate: row.plannedDate,
      scheduledStart: { not: null },
      status: { not: "COMPLETED" },
    },
    select: {
      id: true,
      stageId: true,
      scheduledStart: true,
      scheduledEnd: true,
      task: { select: { title: true } },
      stage: { select: { name: true } },
    },
  });
  const refsDestino = await getStageReferences(doDestino.map((d) => d.stageId));
  const ocupadas = doDestino.flatMap((d) => {
    const range = occupiedRange({
      scheduledStart: d.scheduledStart,
      scheduledEnd: d.scheduledEnd,
      referenceHours: refsDestino.get(d.stageId)?.hours ?? 0,
    });
    return range ? [{ ...d, range }] : [];
  });
  if (collidingWith(faixa, ocupadas).length > 0) return { error: t("windowBusyPerson") };
}
```

Chave nova (pt-BR): `"windowBusyPerson": "Esta pessoa já tem compromisso nesse horário."`
es-ES: `"windowBusyPerson": "Esta persona ya tiene un compromiso a esa hora."`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/week-planning-write.test.ts __tests__/i18n`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/week-planning-write.test.ts locales
git commit -m "feat(janela): transferir não pode criar sobreposição na agenda do colega"
```

---

### Task 11: Quem pode receber, e quem está ocupado

**Files:**

- Modify: `lib/actions/week-planning.ts`
- Test: `__tests__/lib/actions/stage-window-write.test.ts`

**Interfaces:**

- Consumes: `occupiedRange`, `collidingWith`; `effectiveStageTeam` de `@/lib/stage-team`.
- Produces:

```ts
export async function listWindowCandidates(
  activeStageId: string
): Promise<{ error: string } | { candidates: { id: string; name: string; busy: boolean }[] }>;
```

- [ ] **Step 1: Write the failing test**

```ts
describe("listWindowCandidates", () => {
  it("lista o time efetivo marcando quem já tem compromisso na faixa", async () => {
    // Quem está ocupado aparece DESABILITADO, não sumido: "some da lista" não se distingue de "não
    // é do time", e o gestor precisa saber que a pessoa existe e está comprometida.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: new Date("2026-09-04T17:00:00Z"),
      scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      teamId: null,
      team: null,
      stage: {
        name: "Gravação",
        defaultTeam: {
          id: "video",
          name: "Vídeo",
          members: [
            { id: "u1", name: "Ana" },
            { id: "u2", name: "Bruno" },
            { id: "u3", name: "Carla" },
          ],
        },
      },
    });
    // Bruno tem 15h–17h; Carla não tem nada.
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        id: "as9",
        stageId: "s9",
        assigneeId: "u2",
        scheduledStart: new Date("2026-09-04T18:00:00Z"),
        scheduledEnd: new Date("2026-09-04T20:00:00Z"),
      },
    ]);
    vi.mocked(getStageReferences).mockResolvedValue(new Map());

    const r = await listWindowCandidates("as1");

    expect(r).toEqual({
      candidates: [
        { id: "u1", name: "Ana", busy: false },
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: false },
      ],
    });
  });

  it("etapa sem janela não tem candidatos a calcular", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      teamId: null,
      team: null,
      stage: { name: "Gravação", defaultTeam: { id: "video", name: "Vídeo", members: [] } },
    });
    expect(await listWindowCandidates("as1")).toEqual({ error: "stageNotFound" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts -t "listWindowCandidates"`
Expected: FAIL — `listWindowCandidates is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Para as duas saídas de troca de colaborador: quem, no time EFETIVO da etapa, pode receber um
 * compromisso naquela faixa.
 *
 * Devolve todo mundo do time com a marca `busy` em vez de esconder os ocupados — sumir da lista não
 * se distingue de "não é do time", e o gestor precisa saber que a pessoa existe e está comprometida.
 */
export async function listWindowCandidates(activeStageId: string) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      stageId: true,
      plannedDate: true,
      scheduledStart: true,
      scheduledEnd: true,
      teamId: true,
      team: { select: { id: true, name: true, members: { select: { id: true, name: true } } } },
      stage: {
        select: {
          name: true,
          defaultTeam: {
            select: { id: true, name: true, members: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!row || !row.scheduledStart || !row.plannedDate) return { error: t("stageNotFound") };

  const refs = await getStageReferences([row.stageId]);
  const faixa = occupiedRange({
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    referenceHours: refs.get(row.stageId)?.hours ?? 0,
  }) as Range;

  const membros = (row.teamId ? row.team?.members : row.stage.defaultTeam?.members) ?? [];

  const agendasDoDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: { in: membros.map((m) => m.id) },
      plannedDate: row.plannedDate,
      scheduledStart: { not: null },
      status: { not: "COMPLETED" },
      id: { not: row.id },
    },
    select: {
      id: true,
      stageId: true,
      assigneeId: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });
  const refsOutras = await getStageReferences(agendasDoDia.map((a) => a.stageId));

  return {
    candidates: membros.map((m) => {
      const ocupadas = agendasDoDia
        .filter((a) => a.assigneeId === m.id)
        .flatMap((a) => {
          const range = occupiedRange({
            scheduledStart: a.scheduledStart,
            scheduledEnd: a.scheduledEnd,
            referenceHours: refsOutras.get(a.stageId)?.hours ?? 0,
          });
          return range ? [{ id: a.id, range }] : [];
        });
      return { id: m.id, name: m.name, busy: collidingWith(faixa, ocupadas).length > 0 };
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions/stage-window-write.test.ts`
Expected: PASS (15 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/week-planning.ts __tests__/lib/actions/stage-window-write.test.ts
git commit -m "feat(janela): quem do time pode receber, com o ocupado marcado"
```

---

### Task 12: Agendados saem em ordem de hora

**Files:**

- Modify: `lib/planning/day-queue.ts:62-77`
- Test: `__tests__/lib/planning/day-queue.test.ts`

**Interfaces:**

- Consumes: nada novo.
- Produces: nada novo — muda a ordenação interna de `buildDayQueue`.

- [ ] **Step 1: Write the failing test**

```ts
it("dois compromissos no mesmo dia saem em ordem de HORA, não de posição", () => {
  // A ordem manual manda no que não tem hora. Entre compromissos, quem manda é o relógio: com a
  // ordem manual decidindo, o "o que fazer agora" apontaria para o das 16h antes do das 10h — e a
  // fila mentiria exatamente no caso que a janela existe para servir.
  const r = buildDayQueue([
    item({ id: "tarde", plannedOrder: 1, scheduledStart: new Date("2026-08-31T19:00:00Z") }),
    item({ id: "cedo", plannedOrder: 2, scheduledStart: new Date("2026-08-31T13:00:00Z") }),
  ]);
  expect(r.slots.map((s) => s.item.id)).toEqual(["cedo", "tarde"]);
  expect(r.nextRunnableId).toBe("cedo");
});

it("o compromisso não fura a fila de quem não tem hora", () => {
  // A janela ordena os agendados ENTRE SI. Ela não promove o item para o topo do dia: promover
  // seria transformar a fila ordenada numa grade de horários, que a spec proíbe.
  const r = buildDayQueue([
    item({ id: "primeiro", plannedOrder: 1, scheduledStart: null }),
    item({ id: "agendado", plannedOrder: 2, scheduledStart: new Date("2026-08-31T13:00:00Z") }),
  ]);
  expect(r.slots.map((s) => s.item.id)).toEqual(["primeiro", "agendado"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/planning/day-queue.test.ts -t "ordem de HORA"`
Expected: FAIL — sai `["tarde", "cedo"]`, e `nextRunnableId` é `"tarde"`.

- [ ] **Step 3: Write minimal implementation**

Dentro do `sort` de `buildDayQueue`, antes do `return a.plannedOrder - b.plannedOrder || porId(a, b)`:

```ts
// Entre DOIS compromissos, quem manda é o relógio — a ordem manual não tem o que dizer sobre
// qual das duas locações acontece primeiro. Só entre eles: um agendado não fura a fila de quem
// não tem hora, senão a fila ordenada viraria grade de horários.
if (a.scheduledStart && b.scheduledStart) {
  return a.scheduledStart.getTime() - b.scheduledStart.getTime() || porId(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/planning/day-queue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/planning/day-queue.ts __tests__/lib/planning/day-queue.test.ts
git commit -m "fix(janela): entre compromissos, quem ordena é o relógio"
```

---

### Task 13: A leitura leva o fim da janela até a tela

**Files:**

- Modify: `lib/planning/day-queue.ts` (tipo `QueueItemInput`)
- Modify: `lib/actions/week-planning.ts` (select e montagem do item)
- Modify: `lib/actions/my-week.ts:130,205` (o mesmo select, para os tipos não divergirem)
- Test: `__tests__/lib/actions/week-planning-read.test.ts`

**Interfaces:**

- Consumes: nada novo.
- Produces: `QueueItemInput.scheduledEnd: Date | null`.

- [ ] **Step 1: Write the failing test**

```ts
// em week-planning-read.test.ts, logo abaixo de "etapa agendada e liberada chega ao dia com kind
// scheduled" — este é o irmão dele. `stageRow` já tem `scheduledEnd: null` no molde.
it("o FIM da janela também atravessa do select até a fila", async () => {
  // Mesmo fio do teste acima, um campo adiante: select do Prisma -> QueueItemInput.scheduledEnd ->
  // tela. Sem ele, reabrir o diálogo de um compromisso de 14h–16h o transformaria silenciosamente
  // num de "14h + referência".
  db.taskActiveStage.findMany.mockResolvedValue([
    stageRow({
      scheduledStart: new Date("2026-08-31T14:00:00Z"),
      scheduledEnd: new Date("2026-08-31T16:00:00Z"),
    }),
  ]);

  const r = await getWeekPlanning("2026-08-31");

  expect(r.people[0].byDay["2026-08-31"].slots[0].item.scheduledEnd).toEqual(
    new Date("2026-08-31T16:00:00Z")
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/actions/week-planning-read.test.ts -t "FIM da janela"`
Expected: FAIL — `scheduledEnd` é `undefined` no item da fila.

- [ ] **Step 3: Write minimal implementation**

Em `day-queue.ts`, ao lado de `scheduledStart`:

```ts
  /** Fim declarado do compromisso, quando existe. Passthrough puro — a fila ordena e classifica
   *  pelo INÍCIO; o fim só atravessa até a tela, que reabre o diálogo com os dois campos. */
  scheduledEnd?: Date | null;
```

Em `week-planning.ts` e `my-week.ts`: `scheduledEnd: true` no `select`, e `scheduledEnd: row.scheduledEnd` na montagem do item.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/actions __tests__/lib/planning`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/planning/day-queue.ts lib/actions/week-planning.ts lib/actions/my-week.ts __tests__/lib/actions/week-planning-read.test.ts
git commit -m "feat(janela): o fim do compromisso atravessa até a tela"
```

---

### Task 14: O diálogo que marca e desmarca

**Files:**

- Create: `app/[locale]/(protected)/planning/week/WindowDialog.tsx`
- Modify: `app/[locale]/(protected)/planning/week/page.tsx` (botão no item programado, ao lado de `OrderControls`)
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json` (namespace `week`)
- Test: Create `__tests__/components/WindowDialog.test.tsx`

**Interfaces:**

- Consumes: `setStageWindow` (Tasks 5–7).
- Produces:

```tsx
<WindowDialog
  activeStageId={s.item.id}
  label={`${s.item.taskTitle} · ${s.item.stageName}`}
  startTime={/* "14:00" em SP, ou null */}
  endTime={/* "16:00" em SP, ou null */}
/>
```

**Chaves novas em `planning.week`:** `windowTitle`, `windowStart`, `windowEnd`, `windowEndHint`, `windowSubmit`, `windowClear`, `windowSet_toast`, `windowCleared_toast`, `windowOpen`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setStageWindow = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/week-planning", () => ({
  setStageWindow: (...a: unknown[]) => setStageWindow(...a),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WindowDialog } from "@/app/[locale]/(protected)/planning/week/WindowDialog";

beforeEach(() => vi.clearAllMocks());

describe("WindowDialog", () => {
  it("reabre com a hora que já está marcada", () => {
    // Editar um compromisso de 14h–16h num formulário vazio o transformaria em outro compromisso.
    render(
      <WindowDialog
        activeStageId="as1"
        label="Reels · Gravação"
        startTime="14:00"
        endTime="16:00"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    expect((screen.getByLabelText("windowStart") as HTMLInputElement).value).toBe("14:00");
    expect((screen.getByLabelText("windowEnd") as HTMLInputElement).value).toBe("16:00");
  });

  it("envia início e fim", () => {
    render(
      <WindowDialog activeStageId="as1" label="Reels · Gravação" startTime={null} endTime={null} />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "09:30" } });
    fireEvent.submit(screen.getByTestId("window-form"));
    expect(setStageWindow).toHaveBeenCalledWith({
      activeStageId: "as1",
      startTime: "09:30",
      endTime: null,
    });
  });

  it("desmarcar manda startTime nulo", () => {
    // Limpar é a mesma porta, sem uma segunda ação no servidor.
    render(
      <WindowDialog activeStageId="as1" label="Reels · Gravação" startTime="14:00" endTime={null} />
    );
    fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
    fireEvent.click(screen.getByRole("button", { name: "windowClear" }));
    expect(setStageWindow).toHaveBeenCalledWith({ activeStageId: "as1", startTime: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/WindowDialog.test.tsx`
Expected: FAIL — `Failed to resolve import ".../WindowDialog"`.

- [ ] **Step 3: Write minimal implementation**

Componente cliente no molde de `ScheduleDialog.tsx` (mesmo `FormDialog`, `FieldLabel`, `useServerAction`, `useRouter().refresh()`), com:

- gatilho: `<Button variant="outline" size="sm">` com ícone `Clock` de `lucide-react` e `aria-label={t("windowOpen")}`;
- `<form id="window-form" data-testid="window-form">` com dois `<input type="time">` (`id="wd-start"` e `id="wd-end"`, cada um com seu `FieldLabel htmlFor`);
- texto de apoio `t("windowEndHint")` sob o fim, dizendo que sem ele o sistema reserva a referência da etapa;
- botão `t("windowClear")` visível só quando `startTime` não é nulo, chamando `run({ activeStageId, startTime: null })`;
- no submit: `run({ activeStageId, startTime, endTime: endTime || null })`;
- `useState` inicializado com as props (`startTime ?? ""`).

Chaves (pt-BR):

```json
"windowOpen": "Marcar horário",
"windowTitle": "Horário do compromisso",
"windowStart": "Início",
"windowEnd": "Fim",
"windowEndHint": "Sem o fim, o sistema reserva a duração de referência da etapa.",
"windowSubmit": "Marcar",
"windowClear": "Desmarcar",
"windowSet_toast": "Horário marcado.",
"windowCleared_toast": "Horário desmarcado."
```

es-ES:

```json
"windowOpen": "Marcar horario",
"windowTitle": "Horario del compromiso",
"windowStart": "Inicio",
"windowEnd": "Fin",
"windowEndHint": "Sin el fin, el sistema reserva la duración de referencia de la etapa.",
"windowSubmit": "Marcar",
"windowClear": "Quitar horario",
"windowSet_toast": "Horario marcado.",
"windowCleared_toast": "Horario quitado."
```

Em `page.tsx`, dentro do item da célula (ao lado de `<OrderControls />`), passando a hora já formatada no fuso de SP — a mesma `formatDisplayTime` que a célula usa:

```tsx
<WindowDialog
  activeStageId={s.item.id}
  label={`${s.item.taskTitle ?? ""} · ${s.item.stageName ?? ""}`}
  startTime={s.item.scheduledStart ? formatDisplayTime(s.item.scheduledStart) : null}
  endTime={s.item.scheduledEnd ? formatDisplayTime(s.item.scheduledEnd) : null}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/WindowDialog.test.tsx __tests__/i18n && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/\[locale\]/\(protected\)/planning/week/ locales __tests__/components/WindowDialog.test.tsx
git commit -m "feat(janela): o diálogo que marca e desmarca o horário"
```

---

### Task 15: As saídas quando há sobreposição

**Files:**

- Modify: `app/[locale]/(protected)/planning/week/WindowDialog.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`
- Test: `__tests__/components/WindowDialog.test.tsx`

**Interfaces:**

- Consumes: o retorno `{ overlap: WindowOverlap }` da Task 7.
- Produces: nenhuma API nova — estado interno do componente.

**Chaves novas:** `overlapTitle`, `overlapBlocked`, `overlapAllowed`, `overlapPostpone`, `overlapRetime`, `overlapCancel`, `overlapOccupant`.

- [ ] **Step 1: Write the failing test**

```tsx
const OVERLAP = {
  overlap: {
    canOverride: true,
    occupants: [
      {
        activeStageId: "as9",
        taskTitle: "Institucional Acme",
        stageName: "Gravação",
        priority: "HIGH",
        startISO: "2026-09-04T17:00:00.000Z",
        endISO: "2026-09-04T19:00:00.000Z",
      },
    ],
    firstFreeStartISO: "2026-09-04T20:00:00.000Z",
  },
};

it("mostra quem está no caminho em vez de um erro genérico", async () => {
  // Uma recusa que não diz o que está no caminho obriga o gestor a caçar na grade.
  setStageWindow.mockResolvedValueOnce({
    ...OVERLAP,
    overlap: { ...OVERLAP.overlap, canOverride: false },
  });
  render(
    <WindowDialog activeStageId="as1" label="Natal · Gravação" startTime={null} endTime={null} />
  );
  fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
  fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "15:00" } });
  fireEvent.submit(screen.getByTestId("window-form"));

  expect(await screen.findByText(/Institucional Acme/)).toBeInTheDocument();
  // Prioridade não autoriza: adiar a ocupante não é oferecido.
  expect(screen.queryByRole("button", { name: "overlapPostpone" })).not.toBeInTheDocument();
});

it("com prioridade autorizada, adiar a ocupante manda o horário já calculado", async () => {
  setStageWindow.mockResolvedValueOnce(OVERLAP);
  render(
    <WindowDialog activeStageId="as1" label="Natal · Gravação" startTime={null} endTime={null} />
  );
  fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
  fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "15:00" } });
  fireEvent.submit(screen.getByTestId("window-form"));

  fireEvent.click(await screen.findByRole("button", { name: "overlapPostpone" }));

  // 2026-09-04T20:00Z = 17h em São Paulo.
  expect(setStageWindow).toHaveBeenCalledWith({
    activeStageId: "as9",
    startTime: "17:00",
    endTime: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/WindowDialog.test.tsx -t "caminho"`
Expected: FAIL — o componente ignora `overlap` e nada é renderizado.

- [ ] **Step 3: Write minimal implementation**

No `useServerAction`, tratar o retorno em `onSuccess`: se `result` tem `overlap`, guardar em estado (`setOverlap`) em vez de fechar o diálogo. Renderizar, quando há `overlap`:

- o título `t("overlapTitle")` e a linha de cada ocupante: `t("overlapOccupant", { task, stage, from, to })` com as horas formatadas por `formatDisplayTime(new Date(startISO))`;
- o aviso `t(overlap.canOverride ? "overlapAllowed" : "overlapBlocked")`;
- **sempre**: `t("overlapRetime")` (volta ao formulário) e `t("overlapCancel")` (fecha sem gravar);
- **só quando `canOverride`**: `t("overlapPostpone")`, que chama `setStageWindow` na ocupante com o `firstFreeStartISO` convertido para "HH:MM" de São Paulo, e depois reenvia a janela nova.

> A conversão de instante para "HH:MM" usa `formatDisplayTime` de `@/lib/dates` — importe de lá, não reescreva. O arquivo é de funções puras, sem `"use server"`, e já é usado por componentes cliente; duplicar a conversão é como o fuso volta a divergir.

Chaves (pt-BR):

```json
"overlapTitle": "Já há compromisso nesse horário",
"overlapOccupant": "{task} · {stage} · {from} às {to}",
"overlapBlocked": "Esta demanda não tem prioridade sobre a que já está marcada. Escolha outro horário ou outra pessoa.",
"overlapAllowed": "Esta demanda tem prioridade. Escolha o que fazer com a que já estava marcada.",
"overlapPostpone": "Adiar a que estava marcada",
"overlapRetime": "Escolher outro horário",
"overlapCancel": "Cancelar"
```

es-ES:

```json
"overlapTitle": "Ya hay un compromiso a esa hora",
"overlapOccupant": "{task} · {stage} · de {from} a {to}",
"overlapBlocked": "Esta demanda no tiene prioridad sobre la que ya está marcada. Elige otro horario u otra persona.",
"overlapAllowed": "Esta demanda tiene prioridad. Elige qué hacer con la que ya estaba marcada.",
"overlapPostpone": "Aplazar la que estaba marcada",
"overlapRetime": "Elegir otro horario",
"overlapCancel": "Cancelar"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/WindowDialog.test.tsx __tests__/i18n`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/\[locale\]/\(protected\)/planning/week/WindowDialog.tsx locales __tests__/components/WindowDialog.test.tsx
git commit -m "feat(janela): as saídas da sobreposição — adiar, remarcar, cancelar"
```

---

### Task 16: As duas trocas de colaborador

**Files:**

- Modify: `app/[locale]/(protected)/planning/week/WindowDialog.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`
- Test: `__tests__/components/WindowDialog.test.tsx`

**Interfaces:**

- Consumes: `listWindowCandidates` (Task 11), `scheduleStage` (Task 10).
- Produces: nenhuma API nova.

**Chaves novas:** `overlapMoveOccupant`, `overlapMoveNew`, `overlapBusyPerson`, `overlapPickPerson`.

**Props novas:** `dayISO: string` — `scheduleStage` exige a data, e o diálogo passa a mesma da coluna. **`page.tsx` precisa ser alterado junto**, acrescentando `dayISO={d}` ao `<WindowDialog>` da Task 14 (`d` é o dia que o laço da grade já tem em mão); sem isso o componente compila com a prop faltando apenas porque TypeScript a exigiria — o `tsc` do Step 4 pega.

- [ ] **Step 1: Write the failing test**

```tsx
// O `vi.mock` da Task 14 exportava só `setStageWindow`. Substituí-lo por:
const listWindowCandidates = vi.fn();
const scheduleStage = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/actions/week-planning", () => ({
  setStageWindow: (...a: unknown[]) => setStageWindow(...a),
  listWindowCandidates: (...a: unknown[]) => listWindowCandidates(...a),
  scheduleStage: (...a: unknown[]) => scheduleStage(...a),
}));

it("oferece só quem está livre, e mostra o ocupado desabilitado", async () => {
  // Sumir da lista não se distingue de "não é do time".
  setStageWindow.mockResolvedValueOnce(OVERLAP);
  listWindowCandidates.mockResolvedValue({
    candidates: [
      { id: "u2", name: "Bruno", busy: true },
      { id: "u3", name: "Carla", busy: false },
    ],
  });
  render(
    <WindowDialog
      activeStageId="as1"
      label="Natal · Gravação"
      startTime={null}
      endTime={null}
      dayISO="2026-09-04"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
  fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "15:00" } });
  fireEvent.submit(screen.getByTestId("window-form"));

  fireEvent.click(await screen.findByRole("button", { name: "overlapMoveOccupant" }));

  const bruno = await screen.findByRole("option", { name: /Bruno/ });
  expect(bruno).toBeDisabled();
  expect(screen.getByRole("option", { name: /Carla/ })).not.toBeDisabled();
});

it("transferir a OCUPANTE chama scheduleStage com o dia da coluna", async () => {
  setStageWindow.mockResolvedValueOnce(OVERLAP);
  listWindowCandidates.mockResolvedValue({
    candidates: [{ id: "u3", name: "Carla", busy: false }],
  });
  render(
    <WindowDialog
      activeStageId="as1"
      label="Natal · Gravação"
      startTime={null}
      endTime={null}
      dayISO="2026-09-04"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "windowOpen" }));
  fireEvent.change(screen.getByLabelText("windowStart"), { target: { value: "15:00" } });
  fireEvent.submit(screen.getByTestId("window-form"));
  fireEvent.click(await screen.findByRole("button", { name: "overlapMoveOccupant" }));
  fireEvent.change(await screen.findByLabelText("overlapPickPerson"), { target: { value: "u3" } });
  fireEvent.click(screen.getByRole("button", { name: "overlapPickPersonSubmit" }));

  expect(scheduleStage).toHaveBeenCalledWith({
    activeStageId: "as9", // a OCUPANTE, não a nova
    userId: "u3",
    dateISO: "2026-09-04",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/WindowDialog.test.tsx -t "ocupado desabilitado"`
Expected: FAIL — o botão `overlapMoveOccupant` não existe.

- [ ] **Step 3: Write minimal implementation**

Acrescentar ao painel de sobreposição dois botões — `overlapMoveOccupant` (só quando `canOverride`) e `overlapMoveNew` (**sempre**, porque não depende de autoridade sobre a ocupante). Cada um:

1. chama `listWindowCandidates(idDaEtapaQueVaiMudar)`;
2. mostra um `<select>` com `aria-label={t("overlapPickPerson")}`, cada `<option disabled={c.busy}>` rotulada `c.busy ? t("overlapBusyPerson", { name: c.name }) : c.name`;
3. no botão de confirmar (`aria-label="overlapPickPersonSubmit"`), chama `scheduleStage({ activeStageId, userId, dateISO: dayISO })` e, quando é a NOVA que muda de dono, reenvia `setStageWindow` com a hora escolhida.

Chaves (pt-BR):

```json
"overlapMoveOccupant": "Passar a que estava marcada para outra pessoa",
"overlapMoveNew": "Passar esta para outra pessoa",
"overlapPickPerson": "Para quem vai",
"overlapPickPersonSubmit": "Transferir",
"overlapBusyPerson": "{name} — já tem compromisso nesse horário"
```

es-ES:

```json
"overlapMoveOccupant": "Pasar la que estaba marcada a otra persona",
"overlapMoveNew": "Pasar esta a otra persona",
"overlapPickPerson": "A quién va",
"overlapPickPersonSubmit": "Transferir",
"overlapBusyPerson": "{name} — ya tiene un compromiso a esa hora"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: PASS — suíte inteira verde, tsc e lint limpos.

- [ ] **Step 5: Commit**

```bash
git add app/\[locale\]/\(protected\)/planning/week/WindowDialog.tsx locales __tests__/components/WindowDialog.test.tsx
git commit -m "feat(janela): as duas trocas de colaborador, com o ocupado desabilitado"
```

---

### Task 17: Fechar a pendência e o changelog

**Files:**

- Modify: `docs/pendencias.md` (seção "Limitações conhecidas" — sai a linha da janela fixa)
- Modify: `CHANGELOG.md` (entrada em "Adicionado")
- Modify: `docs/superpowers/specs/2026-08-28-programacao-semanal-design.md` (nota de que a janela ganhou tela)

- [ ] **Step 1: Rodar a verificação completa**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: tudo verde — sem isto o changelog estaria afirmando o que ninguém conferiu.

- [ ] **Step 2: Tirar a limitação da lista**

Apagar de `docs/pendencias.md` o item "**Janela fixa de agendamento** (`scheduledStart`/`scheduledEnd`) não tem tela: só existe no banco. Sem ela, o bloco de conflitos da programação semanal nunca acende em uso real."

- [ ] **Step 3: Escrever a entrada do changelog**

Em `CHANGELOG.md`, em `### 🚀 Adicionado`, uma seção `#### Janela fixa do agendamento` cobrindo: o que passou a existir (marcar hora na mesa), a trava na porta com o veredito da prioridade, as saídas do diálogo, a transferência estrita, e as duas correções de bagagem (limpar a janela ao devolver ao poço e ao mudar de dia).

- [ ] **Step 4: Commit**

```bash
git add docs/pendencias.md CHANGELOG.md docs/superpowers/specs/2026-08-28-programacao-semanal-design.md
git commit -m "docs(janela): fecha a pendência da janela sem tela"
```

---

## Notas para quem executar

- **`getStageReferences` é assíncrona e faz consulta.** Nas Tasks 7, 10 e 11 ela é chamada mais de uma vez por ação; agrupar as chamadas numa só, quando os `stageId` já são conhecidos juntos, é bem-vindo — o que não pode é chamá-la dentro de um laço por item (N+1).
- **`week-planning.ts` é `"use server"`.** Só exporta função assíncrona: nada de `export const` ou re-export de constante ali (há um comentário no topo do arquivo explicando o `next build` que isso quebra). `WindowOccupant` e `WindowOverlap` são `export type`, que é apagado na compilação e não conta como export de runtime.
- **Nenhuma tarefa altera `QueueKind`.** Se em algum momento parecer necessário um tipo novo de conflito, pare: significa que uma sobreposição está chegando ao banco, e o desenho inteiro depende de ela não chegar.
