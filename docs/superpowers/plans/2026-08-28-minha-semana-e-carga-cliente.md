# Minha semana e carga por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao colaborador a própria semana (`/planning/my-week`), com reordenar, puxar do poço e mover entre dias, e ao gestor a mesma semana pelo eixo do cliente (`/planning/client-load`).

**Architecture:** nenhuma mudança de modelo. As duas telas leem os campos que a fatia 1 criou e reusam a matemática dela (`buildDayQueue`, `getStageReferences`, `stageAgingRatio`). A escrita da pessoa mora em módulo próprio (`lib/actions/my-week.ts`), separado das ações da mesa porque ali a autorização é "ser você mesmo" e não `requireManagerOrAdmin` — o precedente é `lib/actions/profile.ts` contra `lib/actions/user.ts`. A lógica de reordenar é extraída para um módulo compartilhado, para a seta não divergir entre as duas telas.

**Tech Stack:** Next.js 15 (App Router, Server Components e Server Actions), Prisma/PostgreSQL, next-intl v4, Tailwind, vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-28-minha-semana-e-carga-cliente-design.md`

## Global Constraints

- **Nenhuma migration.** As duas fatias leem e escrevem campos que já existem.
- **`getMyWeek` não aceita `userId` por parâmetro.** Escopa na sessão. Com um `userId` na assinatura, quem descobre a URL lê a semana de qualquer um.
- **A mensagem de reconhecimento tem quatro travas obrigatórias:** compara com o próprio histórico da pessoa; usa mediana (`percentile(x, 0.5)`), não média; só existe no lado positivo; e o número **não é persistido** em lugar nenhum.
- **Proibido em qualquer tela:** nota de aderência da pessoa, ranking, percentual de cumprimento agregado por pessoa.
- Toda string de UI e toda mensagem de erro vem do dicionário, nunca fixa no código. **pt-BR e es-ES**, com espanhol de verdade — há teste de paridade de chaves.
- Comentários em pt-BR explicando o **porquê**, não o quê.
- `npx tsc --noEmit` limpo, `npx vitest run` verde (**1284 testes hoje**, nenhum pode quebrar) e `npm run build` compilando — o build é o único que pega erro de fronteira `"use server"` (um arquivo `"use server"` só exporta função assíncrona; `export const` lá quebra em runtime).
- Nenhuma tela usa arrastar. Botões e diálogo, como a mesa da fatia 1.

---

### Task 1: O ritmo próprio (função pura)

**Files:**

- Create: `lib/planning/own-pace.ts`
- Test: `__tests__/lib/planning/own-pace.test.ts`

**Interfaces:**

- Consumes: `percentile` de `@/lib/stats`
- Produces:
  - `const PACE_HISTORY_WEEKS = 8`
  - `const PACE_MIN_WEEKS = 4`
  - `isAboveOwnPace(thisWeek: number, previousWeeks: number[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/own-pace.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAboveOwnPace, PACE_MIN_WEEKS, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";

describe("isAboveOwnPace", () => {
  it("acima da mediana do próprio histórico: reconhece", () => {
    // Mediana de [2,3,4,5] = 3.5; sete etapas nesta semana passa disso.
    expect(isAboveOwnPace(7, [2, 3, 4, 5])).toBe(true);
  });

  it("igual à mediana: não reconhece — a mensagem só existe no lado positivo", () => {
    expect(isAboveOwnPace(3, [2, 3, 3, 4])).toBe(false);
  });

  it("abaixo da mediana: não reconhece, e não existe versão inversa", () => {
    expect(isAboveOwnPace(1, [2, 3, 4, 5])).toBe(false);
  });

  it("amostra curta não reconhece: elogio sobre duas semanas é ruído com cara de mérito", () => {
    expect(isAboveOwnPace(99, [1, 1, 1])).toBe(false);
  });

  it("no limiar exato da amostra, reconhece", () => {
    expect(PACE_MIN_WEEKS).toBe(4);
    expect(isAboveOwnPace(9, [1, 1, 1, 1])).toBe(true);
  });

  it("sem histórico nenhum não reconhece", () => {
    expect(isAboveOwnPace(5, [])).toBe(false);
  });

  it("semana zerada nunca reconhece, mesmo com histórico zerado", () => {
    // Guarda contra a mediana 0: sem isto, quem fechou zero seria elogiado por
    // "estar acima" de um histórico de zeros.
    expect(isAboveOwnPace(0, [0, 0, 0, 0])).toBe(false);
  });

  it("a janela do histórico é de 8 semanas", () => {
    expect(PACE_HISTORY_WEEKS).toBe(8);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/own-pace.test.ts`
Expected: FAIL — `lib/planning/own-pace.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/planning/own-pace.ts`:

```ts
import { percentile } from "@/lib/stats";

/**
 * A pessoa está acima do PRÓPRIO ritmo?
 *
 * Esta é a exceção deliberada da fatia 2 (ver a spec): a tela reconhece quem está rendendo mais que
 * de costume, para empurrar a fechar a semana. O que a separa de um placar são quatro escolhas, e
 * três delas moram aqui:
 *
 *   1. A comparação é com o histórico DELA, nunca com colegas. Se alguém está acima da média da
 *      equipe, alguém está abaixo, e a tela saberia quem.
 *   2. Mediana, não média: contagem semanal é distribuição enviesada (P3) — uma semana de férias ou
 *      de gravação puxaria a média e o reconhecimento sumiria por meses.
 *   3. Só existe no lado positivo. Não há versão inversa nem tom neutro de "abaixo do seu ritmo":
 *      quem está numa semana difícil não vê mensagem, e portanto não vê cobrança.
 *
 * A quarta trava está em quem chama: o número não é persistido em lugar nenhum.
 *
 * A unidade é CONTAGEM DE ETAPAS, não horas. Hora não é fungível (P7), e somar horas para elogiar
 * premiaria quem apontou mais tempo — exatamente o incentivo errado.
 */

/** Quantas semanas anteriores entram na conta. */
export const PACE_HISTORY_WEEKS = 8;

/** Abaixo disto não há amostra: um elogio calculado sobre duas semanas é ruído com cara de mérito. */
export const PACE_MIN_WEEKS = 4;

export function isAboveOwnPace(thisWeek: number, previousWeeks: number[]): boolean {
  if (previousWeeks.length < PACE_MIN_WEEKS) return false;
  // Semana sem nada concluído nunca é reconhecida: sem esta guarda, um histórico de zeros faria
  // qualquer coisa "passar da mediana" — inclusive outro zero.
  if (thisWeek <= 0) return false;
  return thisWeek > percentile(previousWeeks, 0.5);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/own-pace.test.ts`
Expected: PASS (8 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/own-pace.ts __tests__/lib/planning/own-pace.test.ts
git commit -m "feat(planning): ritmo próprio como mediana do histórico da pessoa"
```

---

### Task 2: Reordenar compartilhado entre as duas telas

**Files:**

- Create: `lib/planning/week-days.ts`
- Create: `lib/planning/reorder.ts`
- Modify: `lib/actions/week-planning.ts` (remove a função privada `weekDays`, e `moveStageOrder` passa a chamar o módulo novo)
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json` (chave `notYours` no namespace `weekPlanning`)
- Test: `__tests__/lib/planning/reorder.test.ts`

**Interfaces:**

- Consumes: `prisma` de `@/lib/prisma`
- Produces:
  - `weekDays(mondayISO: string): string[]` — segunda a sábado, seis datas ISO
  - `type ReorderProblem = "stageNotFound" | "notYours" | "scheduledStage" | "reorderFailed"`
  - `applyDayReorder(activeStageId: string, direction: "up" | "down", ownerId?: string): Promise<{ ok: true } | { problem: ReorderProblem }>`

**Por que esta task existe:** a tela da pessoa reordena o dia dela com as mesmas regras da mesa — troca simples, renumeração no empate, agendado fora da ordenação. Copiar essas regras para um segundo lugar garantiria que um dia elas divergissem, e a divergência apareceria como "a seta funciona na tela do gestor e não na minha".

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/reorder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { applyDayReorder } from "@/lib/planning/reorder";

const DIA = new Date("2026-09-02T00:00:00Z");

function alvo(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "ana",
    plannedDate: DIA,
    plannedOrder: 2,
    scheduledStart: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.update).mockResolvedValue({} as never);
});

describe("applyDayReorder", () => {
  it("etapa de outra pessoa é recusada quando há dono exigido", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(alvo() as never);
    const r = await applyDayReorder("as1", "up", "bruno");
    expect(r).toEqual({ problem: "notYours" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("sem dono exigido (mesa do gestor), a mesma etapa é aceita", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(alvo() as never);
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as0", plannedOrder: 1, scheduledStart: null },
      { id: "as1", plannedOrder: 2, scheduledStart: null },
    ] as never);
    const r = await applyDayReorder("as1", "up");
    expect(r).toEqual({ ok: true });
    expect(prisma.taskActiveStage.update).toHaveBeenCalledTimes(2);
  });

  it("etapa com hora marcada não entra na ordenação", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ scheduledStart: new Date("2026-09-02T14:00:00Z") }) as never
    );
    const r = await applyDayReorder("as1", "up", "ana");
    expect(r).toEqual({ problem: "scheduledStage" });
  });

  it("etapa sem dia programado não é reordenável", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ plannedDate: null }) as never
    );
    expect(await applyDayReorder("as1", "up", "ana")).toEqual({ problem: "stageNotFound" });
  });

  it("subir o primeiro não escreve nada e não é erro", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ plannedOrder: 1 }) as never
    );
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as1", plannedOrder: 1, scheduledStart: null },
      { id: "as2", plannedOrder: 2, scheduledStart: null },
    ] as never);
    const r = await applyDayReorder("as1", "up", "ana");
    expect(r).toEqual({ ok: true });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("empate renumera o dia inteiro, agendado incluído, sem trocar ninguém de lugar sem motivo", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ id: "as3", plannedOrder: 10 }) as never
    );
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as1", plannedOrder: 1, scheduledStart: null },
      { id: "as2", plannedOrder: 5, scheduledStart: new Date("2026-09-02T14:00:00Z") },
      { id: "as3", plannedOrder: 10, scheduledStart: null },
      { id: "as4", plannedOrder: 10, scheduledStart: null },
    ] as never);

    const r = await applyDayReorder("as3", "down", "ana");
    expect(r).toEqual({ ok: true });

    const escritas = new Map(
      vi.mocked(prisma.taskActiveStage.update).mock.calls.map((c) => {
        const arg = c[0] as { where: { id: string }; data: { plannedOrder: number } };
        return [arg.where.id, arg.data.plannedOrder];
      })
    );
    // as3 desceu para depois de as4 — o que a seta prometeu.
    expect(escritas.get("as4")).toBeLessThan(escritas.get("as3") as number);
    // O agendado continua entre as1 e o par trocado: renumerar só os movíveis o faria saltar.
    expect(escritas.get("as2") ?? 2).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/reorder.test.ts`
Expected: FAIL — `lib/planning/reorder.ts` não existe

- [ ] **Step 3: Criar `lib/planning/week-days.ts`**

```ts
/** Segunda a sábado. Sábado é coluna normal — recebe se o gestor colocar; o sistema não tem escala
 *  cadastrada e não sabe quem trabalha no sábado. Vive fora das ações porque as três telas da
 *  programação (mesa, minha semana e carga por cliente) precisam recortar a MESMA semana. */
export function weekDays(mondayISO: string): string[] {
  const base = Date.parse(`${mondayISO}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) =>
    new Date(base + i * 86_400_000).toISOString().slice(0, 10)
  );
}
```

- [ ] **Step 4: Criar `lib/planning/reorder.ts`**

Mover para cá o corpo de `moveStageOrder` que vem DEPOIS do `requireManagerOrAdmin`, trocando as mensagens traduzidas por chaves de problema:

```ts
import "server-only";
import prisma from "@/lib/prisma";

export type ReorderProblem = "stageNotFound" | "notYours" | "scheduledStage" | "reorderFailed";

/**
 * Sobe ou desce um item dentro do dia. Serve à mesa do gestor e à tela da pessoa: as regras de
 * ordenação são as mesmas nas duas, e duas cópias divergiriam — a divergência apareceria como "a
 * seta funciona na tela dele e não na minha".
 *
 * Devolve CHAVE de problema, não mensagem: quem traduz é a ação, que sabe em qual namespace a
 * mensagem daquela tela mora.
 *
 * `ownerId` é a diferença entre os dois chamadores. A mesa não passa (o gestor reordena o dia de
 * quem quiser); a tela da pessoa passa o próprio id, e é o que impede alguém de reordenar o dia
 * do colega mandando o id da etapa dele.
 *
 * Dois caminhos, porque um só não dá conta:
 *
 *   - Vizinhos com números DIFERENTES: troca os dois valores. Duas escritas em vez de N, e a ordem
 *     dos outros não muda por tabela.
 *   - Vizinhos EMPATADOS (mesmo número, ou os dois sem número): trocar escreveria o mesmo valor nos
 *     dois e a seta viraria um no-op silencioso. Aí o dia é renumerado — N escritas, e os números
 *     dos outros mudam, mas a ORDEM em que aparecem é preservada exatamente.
 */
export async function applyDayReorder(
  activeStageId: string,
  direction: "up" | "down",
  ownerId?: string
): Promise<{ ok: true } | { problem: ReorderProblem }> {
  const alvo = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      plannedDate: true,
      plannedOrder: true,
      scheduledStart: true,
    },
  });
  if (!alvo || !alvo.assigneeId || !alvo.plannedDate) return { problem: "stageNotFound" };
  if (ownerId && alvo.assigneeId !== ownerId) return { problem: "notYours" };
  // Item com horário marcado não entra na ordenação manual — ele acontece na hora dele, não na vez
  // dele. Ordenar um compromisso marcado seria fingir que ele espera a vez.
  if (alvo.scheduledStart) return { problem: "scheduledStage" };

  // O dia INTEIRO, agendados inclusive. Eles não entram na ordenação (ninguém os move, e não são
  // vizinhos de ninguém), mas precisam estar aqui: `buildDayQueue` ordena TODOS os slots por
  // `plannedOrder`, então renumerar só os movíveis deixaria o agendado com o número velho e ele
  // saltaria de posição sozinho.
  const doDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: alvo.assigneeId,
      plannedDate: alvo.plannedDate,
      status: { not: "COMPLETED" },
    },
    select: { id: true, plannedOrder: true, scheduledStart: true },
    // Mesmo desempate da leitura da tela (e de `buildDayQueue`): a seta precisa agir sobre a mesma
    // ordem que a pessoa está vendo.
    orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
  });

  // O vizinho é o próximo item MOVÍVEL: um agendado no meio do caminho não é um degrau da fila.
  const movaveis = doDia.filter((x) => !x.scheduledStart);
  const i = movaveis.findIndex((x) => x.id === activeStageId);
  const j = direction === "up" ? i - 1 : i + 1;
  // Fora da lista não é erro: a seta simplesmente não tem para onde ir.
  if (i < 0 || j < 0 || j >= movaveis.length) return { ok: true };
  const [origem, destino] = [movaveis[i], movaveis[j]];

  try {
    if (origem.plannedOrder !== destino.plannedOrder) {
      await prisma.taskActiveStage.update({
        where: { id: origem.id },
        data: { plannedOrder: destino.plannedOrder },
      });
      await prisma.taskActiveStage.update({
        where: { id: destino.id },
        data: { plannedOrder: origem.plannedOrder },
      });
    } else {
      // Empate: não há valor a trocar (a ordem só existe pelo desempate por `id`), então o dia é
      // renumerado a partir da ordem que a tela já mostra, com os dois trocados de lugar. A
      // renumeração é sobre a lista INTEIRA: o agendado ganha número novo mas continua exatamente
      // onde estava em relação aos vizinhos.
      const nova = [...doDia];
      const posOrigem = nova.findIndex((x) => x.id === origem.id);
      const posDestino = nova.findIndex((x) => x.id === destino.id);
      [nova[posOrigem], nova[posDestino]] = [nova[posDestino], nova[posOrigem]];
      for (const [pos, item] of nova.entries()) {
        if (item.plannedOrder === pos + 1) continue;
        await prisma.taskActiveStage.update({
          where: { id: item.id },
          data: { plannedOrder: pos + 1 },
        });
      }
    }
  } catch (error) {
    console.error("applyDayReorder error:", error);
    return { problem: "reorderFailed" };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Encolher `moveStageOrder` e usar `weekDays` do módulo novo**

Em `lib/actions/week-planning.ts`: apagar a função privada `weekDays` e importar `import { weekDays } from "@/lib/planning/week-days";`. Substituir o corpo inteiro de `moveStageOrder` por:

```ts
/** Sobe ou desce um item dentro do dia. As regras moram em `lib/planning/reorder.ts`, porque a
 *  tela da pessoa (fatia 2) reordena com exatamente as mesmas — e duas cópias divergiriam. */
export async function moveStageOrder(activeStageId: string, direction: "up" | "down") {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");
  const r = await applyDayReorder(activeStageId, direction);
  if ("problem" in r) return { error: t(r.problem) };
  revalidatePath("/planning/week");
  return { success: true as const };
}
```

com `import { applyDayReorder } from "@/lib/planning/reorder";` no topo.

- [ ] **Step 6: Chave `notYours` nos dois locales**

Em `locales/pt-BR/errors.json`, no namespace `weekPlanning`:

```json
"notYours": "Esta etapa não é sua."
```

Em `locales/es-ES/errors.json`, no mesmo namespace:

```json
"notYours": "Esta etapa no es tuya."
```

A mesa nunca passa `ownerId`, então este problema é inalcançável por lá — a chave existe porque `t(r.problem)` aceita a união inteira, e uma chave faltando explode em runtime no dia em que alguém passar o `ownerId`.

- [ ] **Step 7: Rodar tudo**

Run: `npx vitest run __tests__/lib/planning/reorder.test.ts __tests__/lib/actions/week-planning-write.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS. **Os testes existentes de `moveStageOrder` continuam passando sem alteração** — o comportamento não mudou de lugar, só de arquivo. Se algum quebrar, a extração mudou comportamento e é bug, não teste desatualizado.

- [ ] **Step 8: Commit**

```bash
git add lib/planning/reorder.ts lib/planning/week-days.ts lib/actions/week-planning.ts locales __tests__/lib/planning/reorder.test.ts
git commit -m "refactor(planning): reordenar do dia vira módulo compartilhado com dono opcional"
```

---

### Task 3: A leitura da minha semana

**Files:**

- Create: `lib/actions/my-week.ts`
- Test: `__tests__/lib/actions/my-week-read.test.ts`

**Interfaces:**

- Consumes: `buildDayQueue`, `QueueItemInput` de `@/lib/planning/day-queue`; `getStageReferences` de `@/lib/planning/stage-reference`; `weekDays` de `@/lib/planning/week-days`; `isAboveOwnPace`, `PACE_HISTORY_WEEKS` de `@/lib/planning/own-pace`; `stageTeamWhere` de `@/lib/stage-team`; `DEFAULT_WEEKLY_HOURS` de `@/lib/planning/week-capacity`; `getSessionUser` de `@/lib/permissions`; `formatISODate`, `mondayOfWeek`, `todayInSaoPaulo`, `nowInSaoPaulo`, `shiftWeek` de `@/lib/dates`
- Produces:
  - `type NextUp = { id: string; dayISO: string; taskTitle: string; stageName: string }`
  - `type MyWeek = { days: string[]; todayISO: string | null; weeklyHours: number; usedHours: number; byDay: Record<string, DayView>; pool: PoolItem[]; nextUp: NextUp | null; praise: boolean }`
  - `getMyWeek(mondayISO: string): Promise<MyWeek>`

`DayView` e `PoolItem` vêm de `@/lib/actions/week-planning` por **import de tipo** (`import type`), que é apagado na compilação — não é import de runtime de um arquivo `"use server"`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/actions/my-week-read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 2, source: "observed" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getMyWeek } from "@/lib/actions/my-week";

const SEGUNDA = "2026-09-07";

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-08T00:00:00Z"),
    plannedOrder: 1,
    scheduledStart: null,
    stage: { name: "Edição" },
    task: {
      title: "Reels setembro",
      project: { client: { name: "Cliente A" } },
      stageLogs: [],
    },
    ...over,
  };
}

function poolRow(over: Record<string, unknown> = {}) {
  return {
    id: "livre1",
    stageId: "s1",
    stage: { name: "Roteiro" },
    task: { title: "Campanha", project: { client: { name: "Cliente B" } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    weeklyCapacityHours: 40,
    teams: [{ id: "time1" }],
  } as never);
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
});

/** As três chamadas de findMany, na ordem em que a implementação as faz. */
function chamadas() {
  return vi.mocked(prisma.taskActiveStage.findMany).mock.calls.map((c) => c[0] as never);
}

describe("getMyWeek", () => {
  it("traz só as etapas de quem está na sessão", async () => {
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[0] as { where: { assigneeId: string } }).where;
    expect(where.assigneeId).toBe("ana");
  });

  it("monta os seis dias, de segunda a sábado", async () => {
    const semana = await getMyWeek(SEGUNDA);
    expect(semana.days).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("põe a etapa no dia dela, com a referência e o rótulo", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([stageRow()] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    const dia = semana.byDay["2026-09-08"];
    expect(dia.slots).toHaveLength(1);
    expect(dia.slots[0].kind).toBe("runnable");
    expect(dia.slots[0].item.taskTitle).toBe("Reels setembro");
    expect(dia.usedHours).toBe(2);
    expect(semana.usedHours).toBe(2);
  });

  it("sem capacidade cadastrada cai no padrão de 45h", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: null,
      teams: [],
    } as never);
    const semana = await getMyWeek(SEGUNDA);
    expect(semana.weeklyHours).toBe(45);
  });

  it("o poço é restrito aos times da pessoa — trabalho de outro time não é assumível", async () => {
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: Record<string, unknown> }).where;
    expect(where.assigneeId).toBeNull();
    expect(where.status).toBe("ACTIVE");
    // `stageTeamWhere` monta um OR que alcança a etapa coringa (teamId nulo, time herdado do
    // modelo). Sem ele, filtrar por `teamId` puro perderia justamente essas.
    expect(where.OR).toBeDefined();
  });

  it("etapa atrasada de semana anterior aparece no primeiro dia visível", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([stageRow({ plannedDate: new Date("2026-08-31T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.byDay["2026-09-07"].slots).toHaveLength(1);
  });

  it("o reconhecimento não aparece sem amostra suficiente", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      // Concluídas: duas semanas só.
      .mockResolvedValueOnce([
        { completedAt: new Date("2026-09-08T10:00:00Z") },
        { completedAt: new Date("2026-09-01T10:00:00Z") },
      ] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.praise).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/my-week-read.test.ts`
Expected: FAIL — `lib/actions/my-week.ts` não existe

- [ ] **Step 3: Implementar a leitura**

Criar `lib/actions/my-week.ts`:

```ts
"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import {
  formatISODate,
  mondayOfWeek,
  todayInSaoPaulo,
  nowInSaoPaulo,
  shiftWeek,
} from "@/lib/dates";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";
import { isAboveOwnPace, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
// Import de TIPO: é apagado na compilação, então não é import de runtime de um arquivo
// `"use server"`. As duas telas descrevem a mesma coisa e um segundo tipo divergiria.
import type { DayView, PoolItem } from "@/lib/actions/week-planning";

/**
 * A semana da própria pessoa.
 *
 * Não existe `userId` na assinatura, e isso é decisão de segurança, não de estilo: com um parâmetro
 * de pessoa, quem descobrisse a URL leria a semana de qualquer outro, e a proteção passaria a
 * depender de nunca ninguém errar uma checagem. Sem ele, o erro é impossível de cometer.
 *
 * Toda a matemática é a da mesa do gestor (fatia 1): mesma fila do dia, mesma referência de
 * duração, mesma régua. Duas implementações da mesma leitura divergiriam, e a pessoa veria um
 * número diferente do que o gestor vê da semana dela.
 */

export type NextUp = { id: string; dayISO: string; taskTitle: string; stageName: string };

export type MyWeek = {
  days: string[];
  /** Hoje, se a semana em tela for a corrente. Fora dela não há "fim do dia" para anunciar. */
  todayISO: string | null;
  weeklyHours: number;
  usedHours: number;
  byDay: Record<string, DayView>;
  pool: PoolItem[];
  /** O próximo trabalho da semana, quando o dia de hoje já não tem nada executável. */
  nextUp: NextUp | null;
  /** Ver `lib/planning/own-pace.ts`. Calculado na renderização e descartado — nunca persistido. */
  praise: boolean;
};

export async function getMyWeek(mondayISO: string): Promise<MyWeek> {
  const me = await getSessionUser();
  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);

  // Mesma regra da mesa: na semana corrente (ou passada) não há piso, para o atrasado continuar
  // aparecendo; numa semana futura o piso entra, senão a semana que se está planejando nasceria
  // cheia com o atraso das anteriores.
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;
  const hoje = formatISODate(todayInSaoPaulo());
  const todayISO = days.includes(hoje) ? hoje : null;

  // Os times vêm antes porque o poço depende deles. Com a pessoa sem time, `stageTeamWhere([])`
  // não casa com nada e o poço fica vazio — que é a verdade: não há trabalho que ela possa assumir.
  const eu = await prisma.user.findUnique({
    where: { id: me.id },
    select: { weeklyCapacityHours: true, teams: { select: { id: true } } },
  });
  const teamIds = eu?.teams.map((t) => t.id) ?? [];

  // Histórico de oito semanas para o reconhecimento, contado a partir da segunda em tela.
  const inicioHistorico = new Date(
    `${formatISODate(shiftWeek(new Date(`${mondayISO}T00:00:00Z`), -PACE_HISTORY_WEEKS))}T00:00:00Z`
  );

  const [programados, livres, concluidas] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: me.id,
        plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
        status: { not: "COMPLETED" },
      },
      select: {
        id: true,
        stageId: true,
        status: true,
        plannedDate: true,
        plannedOrder: true,
        scheduledStart: true,
        stage: { select: { name: true } },
        task: {
          select: {
            title: true,
            project: { select: { client: { select: { name: true } } } },
            // Log ABERTO da etapa, para o envelhecimento. Aninhado na mesma consulta para não virar
            // um N+1 por item; o casamento por `stageId` é feito abaixo.
            stageLogs: { where: { exitedAt: null }, select: { stageId: true, enteredAt: true } },
          },
        },
      },
      orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
    }),
    prisma.taskActiveStage.findMany({
      where: { assigneeId: null, status: "ACTIVE", ...stageTeamWhere(teamIds) },
      select: {
        id: true,
        stageId: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
      orderBy: { id: "asc" },
      take: 50,
    }),
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: me.id,
        status: "COMPLETED",
        completedAt: { gte: inicioHistorico, lte: fim },
      },
      select: { completedAt: true },
    }),
  ]);

  const referencias = await getStageReferences([
    ...new Set([...programados.map((p) => p.stageId), ...livres.map((l) => l.stageId)]),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

  const porDia = new Map<string, QueueItemInput[]>();
  const primeiroDia = days[0];
  for (const row of programados) {
    if (!row.plannedDate) continue;
    const planejado = formatISODate(row.plannedDate);
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const doDia = porDia.get(dia) ?? [];
    doDia.push({
      id: row.id,
      available: row.status === "ACTIVE",
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      referenceSource: sourceDe(row.stageId),
      scheduledStart: row.scheduledStart,
      taskTitle: row.task.title,
      stageName: row.stage.name,
      stageStatus: row.status,
      activeSince: row.task.stageLogs.find((l) => l.stageId === row.stageId)?.enteredAt ?? null,
    });
    porDia.set(dia, doDia);
  }

  const byDay: Record<string, DayView> = {};
  let usedHours = 0;
  for (const dia of days) {
    const fila = buildDayQueue(porDia.get(dia) ?? []);
    byDay[dia] = {
      slots: fila.slots,
      usedHours: fila.usedHours,
      nextRunnableId: fila.nextRunnableId,
    };
    usedHours += fila.usedHours;
  }

  // O fim do dia: com nada executável hoje, a tela oferece o próximo da SEQUÊNCIA — quem quiser
  // adiantar, adianta; quem não quiser, fechou o dia. É leitura, não ação: nada é movido.
  let nextUp: NextUp | null = null;
  if (todayISO && byDay[todayISO].nextRunnableId === null) {
    for (const dia of days.filter((d) => d > todayISO)) {
      const slot = byDay[dia].slots.find((s) => s.kind === "runnable" || s.kind === "scheduled");
      if (slot) {
        nextUp = {
          id: slot.item.id,
          dayISO: dia,
          taskTitle: slot.item.taskTitle ?? "",
          stageName: slot.item.stageName ?? "",
        };
        break;
      }
    }
  }

  // Contagem por semana, para o reconhecimento. `mondayOfWeek(nowInSaoPaulo(...))` porque as
  // funções de `lib/dates` trabalham na representação SP-local — comparar direto com o instante
  // UTC erraria a virada da semana.
  const porSemana = new Map<string, number>();
  for (const c of concluidas) {
    if (!c.completedAt) continue;
    const chave = formatISODate(mondayOfWeek(nowInSaoPaulo(c.completedAt)));
    porSemana.set(chave, (porSemana.get(chave) ?? 0) + 1);
  }
  const anteriores = [...porSemana.entries()]
    .filter(([semana, n]) => semana < mondayISO && n > 0)
    .map(([, n]) => n);
  const praise = isAboveOwnPace(porSemana.get(mondayISO) ?? 0, anteriores);

  return {
    days,
    todayISO,
    weeklyHours: eu?.weeklyCapacityHours ?? DEFAULT_WEEKLY_HOURS,
    usedHours,
    byDay,
    pool: livres.map((l) => ({
      id: l.id,
      taskTitle: l.task.title,
      stageName: l.stage.name,
      clientName: l.task.project.client.name,
      referenceHours: horasDe(l.stageId),
      referenceSource: sourceDe(l.stageId),
    })),
    nextUp,
    praise,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/my-week-read.test.ts && npx tsc --noEmit`
Expected: PASS (7 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/my-week.ts __tests__/lib/actions/my-week-read.test.ts
git commit -m "feat(planning): leitura da própria semana, escopada na sessão"
```

---

### Task 4: As três escritas da pessoa

**Files:**

- Modify: `lib/actions/my-week.ts`
- Modify: `locales/pt-BR/errors.json`, `locales/es-ES/errors.json`
- Test: `__tests__/lib/actions/my-week-write.test.ts`

**Interfaces:**

- Consumes: `applyDayReorder`, `ReorderProblem` de `@/lib/planning/reorder`; `getSessionUser`; `formatISODate`, `todayInSaoPaulo` de `@/lib/dates`
- Produces (todas devolvendo `Promise<{ success: true } | { error: string }>`):
  - `reorderMyDay(activeStageId: string, direction: "up" | "down")`
  - `pullStageToMe(activeStageId: string, dateISO: string)`
  - `moveMyStageToDay(activeStageId: string, dateISO: string)`

- [ ] **Step 1: Chaves de erro nos dois locales**

Em `locales/pt-BR/errors.json`, namespace novo `myWeek`:

```json
"myWeek": {
  "stageNotFound": "Etapa não encontrada.",
  "notYours": "Esta etapa não é sua.",
  "scheduledStage": "Etapa com horário marcado não entra na ordenação — ela acontece na hora dela.",
  "reorderFailed": "Não foi possível reordenar.",
  "alreadyAssigned": "Esta etapa já tem responsável.",
  "notAvailable": "Esta etapa ainda não foi liberada.",
  "otherTeam": "Esta etapa é de outro time.",
  "invalidDate": "Data inválida.",
  "pastDate": "Não dá para programar para um dia que já passou.",
  "tooFarAhead": "Escolha um dia dentro das próximas quatro semanas.",
  "pullFailed": "Não foi possível assumir a etapa.",
  "moveFailed": "Não foi possível mudar o dia."
}
```

Em `locales/es-ES/errors.json`:

```json
"myWeek": {
  "stageNotFound": "Etapa no encontrada.",
  "notYours": "Esta etapa no es tuya.",
  "scheduledStage": "Una etapa con hora programada no se reordena: se hace a la hora prevista.",
  "reorderFailed": "No se ha podido reordenar.",
  "alreadyAssigned": "Esta etapa ya tiene responsable.",
  "notAvailable": "Esta etapa todavía no se ha liberado.",
  "otherTeam": "Esta etapa es de otro equipo.",
  "invalidDate": "Fecha no válida.",
  "pastDate": "No se puede programar para un día que ya ha pasado.",
  "tooFarAhead": "Elige un día dentro de las próximas cuatro semanas.",
  "pullFailed": "No se ha podido asumir la etapa.",
  "moveFailed": "No se ha podido cambiar el día."
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `__tests__/lib/actions/my-week-write.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/planning/reorder", () => ({ applyDayReorder: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    taskActiveStage: { findUnique: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { applyDayReorder } from "@/lib/planning/reorder";
import { reorderMyDay, pullStageToMe, moveMyStageToDay } from "@/lib/actions/my-week";

/** Um dia bem à frente de "hoje" em qualquer execução: os testes não podem depender da data real. */
function amanha(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function livre(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: null,
    status: "ACTIVE",
    teamId: "time1",
    scheduledStart: null,
    stage: { defaultTeamId: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ teams: [{ id: "time1" }] } as never);
  vi.mocked(prisma.taskActiveStage.aggregate).mockResolvedValue({
    _max: { plannedOrder: 3 },
  } as never);
  vi.mocked(prisma.taskActiveStage.update).mockResolvedValue({} as never);
});

describe("reorderMyDay", () => {
  it("passa o próprio id como dono — é o que impede reordenar o dia do colega", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ ok: true } as never);
    await reorderMyDay("as1", "up");
    expect(applyDayReorder).toHaveBeenCalledWith("as1", "up", "ana");
  });

  it("traduz o problema devolvido pelo módulo de ordenação", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ problem: "notYours" } as never);
    expect(await reorderMyDay("as1", "up")).toEqual({ error: "notYours" });
  });
});

describe("pullStageToMe", () => {
  it("assume a etapa: responsável e dia juntos, no fim da fila do dia", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    const dia = amanha();

    const r = await pullStageToMe("as1", dia);
    expect(r).toEqual({ success: true });

    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      assigneeId: string;
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.assigneeId).toBe("ana");
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    // Entra DEPOIS do que já estava: quem chega não fura a ordem que a pessoa montou.
    expect(data.plannedOrder).toBe(4);
  });

  it("recusa etapa que já tem dono", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ assigneeId: "bruno" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "alreadyAssigned" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa etapa não liberada", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ status: "INACTIVE" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "notAvailable" });
  });

  it("recusa etapa de outro time", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: "time9" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "otherTeam" });
  });

  it("etapa coringa herda o time do modelo e é assumível", async () => {
    // `teamId` nulo não quer dizer "sem time": o time efetivo vem de `stage.defaultTeamId`.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: null, stage: { defaultTeamId: "time1" } }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ success: true });
  });

  it("recusa dia no passado", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(await pullStageToMe("as1", ontem)).toEqual({ error: "pastDate" });
  });

  it("recusa data malformada antes de consultar o banco", async () => {
    expect(await pullStageToMe("as1", "07/09/2026")).toEqual({ error: "invalidDate" });
    expect(prisma.taskActiveStage.findUnique).not.toHaveBeenCalled();
  });
});

describe("moveMyStageToDay", () => {
  it("muda o dia de uma etapa sua", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      scheduledStart: null,
    } as never);
    const dia = amanha();

    expect(await moveMyStageToDay("as1", dia)).toEqual({ success: true });
    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    expect(data.plannedOrder).toBe(4);
  });

  it("recusa etapa de outra pessoa", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "bruno",
      scheduledStart: null,
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "notYours" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa mover etapa com hora marcada — compromisso não muda de dia por arrasto", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      scheduledStart: new Date("2026-09-10T14:00:00Z"),
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "scheduledStage" });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/my-week-write.test.ts`
Expected: FAIL — as três funções ainda não existem

- [ ] **Step 4: Implementar as três ações**

Acrescentar ao **fim** de `lib/actions/my-week.ts` (os `import` novos vão para o **topo**, junto dos que já estão lá — colar o bloco inteiro no fim daria erro de sintaxe):

```ts
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { applyDayReorder } from "@/lib/planning/reorder";
```

```ts
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Teto de quatro semanas. A tela só oferece os seis dias da semana, mas a ação não conhece a
 *  janela da tela — sem teto, um dígito errado estacionaria trabalho em 2031, onde ninguém olha. */
const MAX_AHEAD_DAYS = 28;

/** Valida a data pedida contra hoje. Devolve chave de erro ou nada. */
function problemaDeData(dateISO: string): "invalidDate" | "pastDate" | "tooFarAhead" | null {
  if (!DATE_ONLY.test(dateISO)) return "invalidDate";
  const hoje = formatISODate(todayInSaoPaulo());
  if (dateISO < hoje) return "pastDate";
  const limite = formatISODate(
    new Date(Date.parse(`${hoje}T00:00:00Z`) + MAX_AHEAD_DAYS * 86_400_000)
  );
  if (dateISO > limite) return "tooFarAhead";
  return null;
}

/** Próxima posição livre no dia de alguém. Entrar no FIM é o que impede quem chega depois de furar
 *  a ordem que a pessoa já montou. */
async function fimDaFila(userId: string, plannedDate: Date): Promise<number> {
  const ultimo = await prisma.taskActiveStage.aggregate({
    where: { assigneeId: userId, plannedDate },
    _max: { plannedOrder: true },
  });
  return (ultimo._max.plannedOrder ?? 0) + 1;
}

/** Reordena o próprio dia. As regras são as mesmas da mesa do gestor e moram em
 *  `lib/planning/reorder.ts`; aqui só entra o dono, que é o que impede reordenar o dia do colega
 *  mandando o id da etapa dele. */
export async function reorderMyDay(activeStageId: string, direction: "up" | "down") {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");
  const r = await applyDayReorder(activeStageId, direction, me.id);
  if ("problem" in r) return { error: t(r.problem) };
  revalidatePath("/planning/my-week");
  return { success: true as const };
}

/** Assume uma etapa do poço. É o que permite a quem terminou cedo arrumar o que fazer sem esperar
 *  o gestor.
 *
 *  Três recusas, e nenhuma é burocracia: etapa com dono é trabalho de outra pessoa; etapa não
 *  liberada não pode ser executada (programar não libera); e etapa de outro time é trabalho que
 *  esta pessoa não pode assumir — a mesma regra de roteamento que o resto do app aplica a qualquer
 *  atribuição. */
export async function pullStageToMe(activeStageId: string, dateISO: string) {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");

  const problema = problemaDeData(dateISO);
  if (problema) return { error: t(problema) };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      status: true,
      teamId: true,
      stage: { select: { defaultTeamId: true } },
    },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.assigneeId) return { error: t("alreadyAssigned") };
  if (row.status !== "ACTIVE") return { error: t("notAvailable") };

  // Time EFETIVO: a etapa coringa tem `teamId` nulo e herda o time do modelo. Comparar só o
  // `teamId` recusaria justamente as coringas, que são as mais abertas de todas. Ver lib/stage-team.ts.
  const timeEfetivo = row.teamId ?? row.stage.defaultTeamId;
  const meu = await prisma.user.findUnique({
    where: { id: me.id },
    select: { teams: { select: { id: true } } },
  });
  if (!timeEfetivo || !meu?.teams.some((x) => x.id === timeEfetivo)) {
    return { error: t("otherTeam") };
  }

  const plannedDate = new Date(`${dateISO}T00:00:00Z`);
  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      data: {
        // Os três juntos, sempre: dia sem dono some do poço E da grade ao mesmo tempo.
        assigneeId: me.id,
        plannedDate,
        plannedOrder: await fimDaFila(me.id, plannedDate),
      },
    });
  } catch (error) {
    console.error("pullStageToMe error:", error);
    return { error: t("pullFailed") };
  }

  revalidatePath("/planning/my-week");
  return { success: true as const };
}

/** Muda de dia uma etapa que já é sua. Antecipar já acontece por leitura; isto é para quando a
 *  pessoa SABE que terça não vai dar. Item com hora marcada não se move: ele é compromisso com
 *  alguém ou com algum lugar, e remarcar é conversa, não arrasto. */
export async function moveMyStageToDay(activeStageId: string, dateISO: string) {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");

  const problema = problemaDeData(dateISO);
  if (problema) return { error: t(problema) };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: { id: true, assigneeId: true, scheduledStart: true },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.assigneeId !== me.id) return { error: t("notYours") };
  if (row.scheduledStart) return { error: t("scheduledStage") };

  const plannedDate = new Date(`${dateISO}T00:00:00Z`);
  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      // Chega no fim do dia de destino: a ordem de lá é de quem já estava.
      data: { plannedDate, plannedOrder: await fimDaFila(me.id, plannedDate) },
    });
  } catch (error) {
    console.error("moveMyStageToDay error:", error);
    return { error: t("moveFailed") };
  }

  revalidatePath("/planning/my-week");
  return { success: true as const };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/my-week-write.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS (12 casos novos; a suíte inteira verde, incluindo o guarda de paridade de locales)

- [ ] **Step 6: Commit**

```bash
git add lib/actions/my-week.ts locales __tests__/lib/actions/my-week-write.test.ts
git commit -m "feat(planning): a pessoa reordena, assume do poço e muda de dia"
```

---

### Task 5: A tela "Minha semana"

**Files:**

- Create: `components/shared/WeekNav.tsx`
- Create: `app/[locale]/(protected)/planning/my-week/page.tsx`
- Create: `app/[locale]/(protected)/planning/my-week/MyDayControls.tsx`
- Create: `app/[locale]/(protected)/planning/my-week/PullDialog.tsx`
- Modify: `app/[locale]/(protected)/planning/week/WeekControls.tsx` (passa a usar `WeekNav`)
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`
- Modify: `lib/navigation.ts`

**Interfaces:**

- Consumes: `getMyWeek`, `reorderMyDay`, `pullStageToMe`, `moveMyStageToDay` (Tasks 3 e 4); `DAY_VISUAL_HOURS`, `DEFAULT_WEEKLY_HOURS` de `@/lib/planning/week-capacity`; `parseWeekParam`, `mondayOfWeek`, `formatISODate`, `formatDisplayDate`, `formatDisplayTime`, `todayInSaoPaulo` de `@/lib/dates`; `stageAgingRatio` de `@/lib/team-health-format`; `workingClockEquivalent` de `@/lib/planning/working-hours`; `useServerAction` de `@/lib/hooks/useServerAction`
- Produces: rota `/planning/my-week`, componente `WeekNav`

- [ ] **Step 1: Chaves de tradução nos dois locales**

Em `locales/pt-BR/planning.json`, na raiz, namespace `myWeek`:

```json
"myWeek": {
  "kicker": "Meu trabalho",
  "title": "Minha semana",
  "subtitle": "O que está no seu dia, na ordem que você escolher.",
  "weekOf": "Semana de {date}",
  "capacity": "{used}h de {total}h",
  "dayRuler": "régua de {hours}h — referência visual, não meta",
  "estimated": "estimativa",
  "waiting": "não liberada",
  "scheduled": "agendada",
  "aging": "{elapsed}h nesta etapa · referência {reference}h",
  "empty": "Nada programado neste dia.",
  "dayDone": "Dia cumprido.",
  "nextUp": "Se quiser adiantar, o próximo é {task} · {stage} ({day}).",
  "praise": "Parabéns! Seu rendimento está acima da média das suas últimas semanas.",
  "poolTitle": "Disponíveis para você",
  "poolEmpty": "Nenhuma etapa livre do seu time agora.",
  "pull": "Assumir",
  "pullTitle": "Assumir etapa",
  "pullDay": "Em que dia?",
  "pullSubmit": "Assumir",
  "pulled_toast": "Etapa assumida.",
  "moveTo": "Mudar de dia",
  "moved_toast": "Etapa movida.",
  "moveUp": "Subir",
  "moveDown": "Descer",
  "previousWeek": "Semana anterior",
  "nextWeek": "Próxima semana",
  "currentWeek": "Semana atual",
  "conflictsTitle": "Agendamentos em risco",
  "conflictsHelp": "Estas etapas têm hora marcada e ainda não foram liberadas. Fale com seu gestor.",
  "noCapacity": "Sem capacidade semanal cadastrada — usando o padrão de {hours}h."
}
```

Em `locales/es-ES/planning.json`:

```json
"myWeek": {
  "kicker": "Mi trabajo",
  "title": "Mi semana",
  "subtitle": "Lo que tienes hoy, en el orden que tú elijas.",
  "weekOf": "Semana del {date}",
  "capacity": "{used}h de {total}h",
  "dayRuler": "regla de {hours}h: referencia visual, no objetivo",
  "estimated": "estimación",
  "waiting": "no liberada",
  "scheduled": "con cita",
  "aging": "{elapsed}h en esta etapa · referencia {reference}h",
  "empty": "No hay nada programado este día.",
  "dayDone": "Día cumplido.",
  "nextUp": "Si quieres adelantar, la siguiente es {task} · {stage} ({day}).",
  "praise": "¡Enhorabuena! Tu rendimiento está por encima de la media de tus últimas semanas.",
  "poolTitle": "Disponibles para ti",
  "poolEmpty": "Ahora mismo no hay ninguna etapa libre de tu equipo.",
  "pull": "Asumir",
  "pullTitle": "Asumir etapa",
  "pullDay": "¿Qué día?",
  "pullSubmit": "Asumir",
  "pulled_toast": "Etapa asumida.",
  "moveTo": "Cambiar de día",
  "moved_toast": "Etapa movida.",
  "moveUp": "Subir",
  "moveDown": "Bajar",
  "previousWeek": "Semana anterior",
  "nextWeek": "Semana siguiente",
  "currentWeek": "Semana actual",
  "conflictsTitle": "Citas en riesgo",
  "conflictsHelp": "Estas etapas tienen hora fijada y todavía no se han liberado. Habla con tu responsable.",
  "noCapacity": "Sin capacidad semanal registrada: se usa el valor por defecto de {hours}h."
}
```

- [ ] **Step 2: Extrair a navegação de semana**

Criar `components/shared/WeekNav.tsx` com o que hoje está em `planning/week/WeekControls.tsx`, deixando o filtro de time entrar por `children`:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatISODate, shiftWeek } from "@/lib/dates";

/**
 * Navegar de semana pela URL. Nasceu na mesa do gestor e virou compartilhado quando a tela da
 * pessoa precisou do mesmo: duas cópias divergiriam, e a semana seguinte é onde o trabalho é
 * distribuído — não pode funcionar de um jeito de cada lado.
 *
 * O que varia entre as telas (o filtro de time, que só o gestor tem) entra por `children`.
 */
export function WeekNav({
  monday,
  isCurrentWeek,
  labels,
  children,
}: {
  monday: Date;
  /** Vem do SERVIDOR: calcular `new Date()` aqui divergiria entre render de servidor e de cliente
   *  perto da virada do dia. */
  isCurrentWeek: boolean;
  labels: { previous: string; next: string; current: string };
  children?: React.ReactNode;
}) {
  const searchParams = useSearchParams();

  // A URL parte sempre dos parâmetros atuais: só a chave da semana muda, senão navegar descartaria
  // os outros filtros a cada clique.
  const href = (delta: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (delta === 0) params.delete("week");
    else params.set("week", formatISODate(shiftWeek(monday, delta)));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <div className="flex items-center gap-1">
        <Link href={href(-1)} aria-label={labels.previous} className={iconBtn} rel="prev">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link href={href(1)} aria-label={labels.next} className={iconBtn} rel="next">
          <ChevronRight className="h-4 w-4" />
        </Link>
        {/* "Semana atual" só aparece quando LEVA a algum lugar: a própria presença informa que você
            navegou para longe. */}
        {!isCurrentWeek && (
          <Link
            href={href(0)}
            scroll={false}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            {labels.current}
          </Link>
        )}
      </div>
    </div>
  );
}
```

E reescrever `planning/week/WeekControls.tsx` para usar:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { WeekNav } from "@/components/shared/WeekNav";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/** A mesa do gestor: navegação de semana (compartilhada) mais o filtro de time, que só existe aqui. */
export function WeekControls({
  monday,
  isCurrentWeek,
  teams,
  teamId,
}: {
  monday: Date;
  isCurrentWeek: boolean;
  teams: { id: string; name: string }[];
  teamId?: string;
}) {
  const t = useTranslations("planning.week");
  const { setParam } = useUrlFilters({ replace: true });

  return (
    <WeekNav
      monday={monday}
      isCurrentWeek={isCurrentWeek}
      labels={{ previous: t("previousWeek"), next: t("nextWeek"), current: t("currentWeek") }}
    >
      <select
        value={teamId ?? ""}
        onChange={(e) => setParam("team", e.target.value || null)}
        aria-label={t("teamFilter")}
        className="h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground"
      >
        <option value="">{t("allTeams")}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </WeekNav>
  );
}
```

- [ ] **Step 3: Os dois componentes de cliente**

Criar `app/[locale]/(protected)/planning/my-week/MyDayControls.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown } from "lucide-react";
import { reorderMyDay, moveMyStageToDay } from "@/lib/actions/my-week";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Reordenar por setas e mudar de dia por select. Sem arrastar, como na mesa do gestor. */
export function MyDayControls({
  activeStageId,
  days,
  currentDay,
}: {
  activeStageId: string;
  days: string[];
  currentDay: string;
}) {
  const t = useTranslations("planning.myWeek");
  const router = useRouter();

  const mover = useServerAction(reorderMyDay, { onSuccess: () => router.refresh() });
  const mudarDia = useServerAction(moveMyStageToDay, {
    successMessage: t("moved_toast"),
    onSuccess: () => router.refresh(),
  });

  const btn =
    "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="inline-flex items-center gap-1">
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
      <select
        value={currentDay}
        disabled={mudarDia.isPending}
        aria-label={t("moveTo")}
        title={t("moveTo")}
        onChange={(e) => mudarDia.run(activeStageId, e.target.value)}
        className="h-7 rounded border border-input-border bg-input px-1 text-xs text-foreground"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {d.slice(8, 10)}/{d.slice(5, 7)}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Criar `app/[locale]/(protected)/planning/my-week/PullDialog.tsx`. **Siga a forma do
`ScheduleDialog` da mesa**: `FormDialog` exige um `trigger`, e o botão de enviar vive no rodapé
dele, ligado ao `<form>` por `formId` — não um `<Button>` solto dentro do corpo.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HandHelping } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Button } from "@/components/ui/button";
import { pullStageToMe } from "@/lib/actions/my-week";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Assumir uma etapa do poço, escolhendo o dia. Diálogo e não arrasto: a lista é curta, e mirar uma
 *  célula no celular é pior do que escolher de um select — e esta é a tela que mais será aberta do
 *  celular. */
export function PullDialog({
  activeStageId,
  label,
  days,
  defaultDay,
}: {
  activeStageId: string;
  label: string;
  days: string[];
  defaultDay: string;
}) {
  const t = useTranslations("planning.myWeek");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateISO, setDateISO] = useState(defaultDay);

  const { run, isPending } = useServerAction(pullStageToMe, {
    successMessage: t("pulled_toast"),
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
          <HandHelping className="h-3.5 w-3.5" />
          {t("pull")}
        </Button>
      }
      title={t("pullTitle")}
      description={label}
      formId="pull-stage-form"
      submitLabel={t("pullSubmit")}
      isPending={isPending}
    >
      <form
        id="pull-stage-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(activeStageId, dateISO);
        }}
      >
        <div>
          <FieldLabel htmlFor="pull-day" required>
            {t("pullDay")}
          </FieldLabel>
          <select
            id="pull-day"
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

- [ ] **Step 4: A página**

Criar `app/[locale]/(protected)/planning/my-week/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, PartyPopper } from "lucide-react";
import { getSessionUser } from "@/lib/permissions";
import { getMyWeek } from "@/lib/actions/my-week";
import { DAY_VISUAL_HOURS, DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  formatDisplayTime,
  todayInSaoPaulo,
} from "@/lib/dates";
import { stageAgingRatio } from "@/lib/team-health-format";
import { workingClockEquivalent } from "@/lib/planning/working-hours";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { WeekNav } from "@/components/shared/WeekNav";
import { MyDayControls } from "./MyDayControls";
import { PullDialog } from "./PullDialog";

export const metadata: Metadata = { title: "Minha semana" };

export default async function MyWeekPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await getSessionUser();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const monday = parseWeekParam(sp.week);
  const t = await getTranslations("planning.myWeek");
  const semana = await getMyWeek(formatISODate(monday));
  const agora = Date.now();

  const conflitos = semana.days.flatMap((d) =>
    semana.byDay[d].slots.filter((s) => s.kind === "conflict").map((s) => ({ dia: d, slot: s }))
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <WeekNav
            monday={monday}
            isCurrentWeek={formatISODate(monday) === formatISODate(mondayOfWeek(todayInSaoPaulo()))}
            labels={{
              previous: t("previousWeek"),
              next: t("nextWeek"),
              current: t("currentWeek"),
            }}
          />
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        {t("capacity", { used: semana.usedHours.toFixed(1), total: semana.weeklyHours })}
        {semana.weeklyHours === DEFAULT_WEEKLY_HOURS && (
          <span className="ml-2 text-warning">
            {t("noCapacity", { hours: DEFAULT_WEEKLY_HOURS })}
          </span>
        )}
      </p>

      {/* O reconhecimento. Só existe no lado positivo — não há a versão inversa, e o número que o
          produziu não é gravado em lugar nenhum. Ver lib/planning/own-pace.ts. */}
      {semana.praise && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success-subtle p-3 text-sm text-success">
          <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("praise")}
        </div>
      )}

      {conflitos.length > 0 && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-subtle p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-danger">{t("conflictsTitle")}</p>
              <p className="mt-1 text-sm text-foreground/80">{t("conflictsHelp")}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                {conflitos.map(({ dia, slot }) => (
                  <li key={slot.item.id}>
                    {slot.item.taskTitle} · {slot.item.stageName} · {dia.slice(8, 10)}/
                    {dia.slice(5, 7)}
                    {slot.item.scheduledStart
                      ? ` · ${formatDisplayTime(slot.item.scheduledStart)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* A régua é VISUAL e a tela diz isso: número em barra vira meta na cabeça de quem olha,
          mesmo sem ninguém ter decidido isso. */}
      <p className="mb-2 text-xs text-muted-foreground">
        {t("dayRuler", { hours: DAY_VISUAL_HOURS })}
      </p>

      <div className="space-y-4">
        {semana.days.map((d) => {
          const dia = semana.byDay[d];
          const hoje = d === semana.todayISO;
          return (
            <SectionCard
              key={d}
              title={`${d.slice(8, 10)}/${d.slice(5, 7)}`}
              subtitle={`${dia.usedHours.toFixed(1)}h / ${DAY_VISUAL_HOURS}h`}
              className={hoje ? "border-primary/40" : undefined}
            >
              {dia.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {dia.slots.map((s) => {
                    // Envelhecimento DESTA etapa contra a referência da classe — leitura sobre o
                    // TRABALHO, nunca nota da pessoa. Em hora ÚTIL, para o aviso não acender em
                    // tudo: um sinal que acende sempre não é sinal.
                    const passou =
                      s.item.activeSince && s.item.referenceHours > 0
                        ? stageAgingRatio(
                            workingClockEquivalent(s.item.activeSince, agora),
                            s.item.referenceHours,
                            agora
                          )
                        : 0;
                    return (
                      <li
                        key={s.item.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
                          s.kind === "conflict"
                            ? "border-danger/40 bg-danger-subtle text-danger"
                            : s.kind === "waiting"
                              ? "border-border bg-muted/40 text-muted-foreground"
                              : "border-border bg-card text-foreground"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.item.taskTitle} · {s.item.stageName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.item.referenceHours.toFixed(1)}h
                            {s.item.referenceSource === "declared" && ` · ${t("estimated")}`}
                            {s.kind === "waiting" && ` · ${t("waiting")}`}
                            {s.kind === "scheduled" &&
                              s.item.scheduledStart &&
                              ` · ${t("scheduled")} ${formatDisplayTime(s.item.scheduledStart)}`}
                          </p>
                          {passou > 1 && s.item.activeSince && (
                            <p className="text-xs text-warning">
                              {t("aging", {
                                elapsed: (passou * s.item.referenceHours).toFixed(1),
                                reference: s.item.referenceHours.toFixed(1),
                              })}
                            </p>
                          )}
                        </div>
                        {/* Compromisso marcado não é reordenado nem movido: ele acontece na hora
                            dele. Sem controles, a regra fica óbvia na tela. */}
                        {!s.item.scheduledStart && (
                          <MyDayControls
                            activeStageId={s.item.id}
                            days={semana.days}
                            currentDay={d}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* O fim do dia: cumprido, e o próximo já visível como convite — não como cobrança. */}
              {hoje && dia.nextRunnableId === null && (
                <p className="mt-3 text-sm text-success">
                  {t("dayDone")}
                  {semana.nextUp && (
                    <span className="ml-1 text-foreground">
                      {t("nextUp", {
                        task: semana.nextUp.taskTitle,
                        stage: semana.nextUp.stageName,
                        day: `${semana.nextUp.dayISO.slice(8, 10)}/${semana.nextUp.dayISO.slice(5, 7)}`,
                      })}
                    </span>
                  )}
                </p>
              )}
            </SectionCard>
          );
        })}
      </div>

      <SectionCard title={t("poolTitle")} className="mt-6">
        {semana.pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("poolEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {semana.pool.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {p.taskTitle} · {p.stageName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.clientName} · {p.referenceHours.toFixed(1)}h
                    {p.referenceSource === "declared" && ` · ${t("estimated")}`}
                  </p>
                </div>
                <PullDialog
                  activeStageId={p.id}
                  label={`${p.taskTitle} · ${p.stageName}`}
                  days={semana.days}
                  defaultDay={semana.todayISO ?? semana.days[0]}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 5: Item de menu**

Em `lib/navigation.ts`, no array que serve MEMBER/SUPERVISOR (o que hoje tem `inicio` e `meu-trabalho`), acrescentar logo depois de `meu-trabalho` — e no mesmo lugar da lista de MANAGER/ADMIN, para o gestor também ver a própria semana:

```ts
{ id: "minha-semana", labelKey: "minhaSemana", href: "/planning/my-week", icon: CalendarRange },
```

`CalendarRange` de `lucide-react`. A chave `minhaSemana` entra no bloco de navegação de
`locales/pt-BR/common.json` e `locales/es-ES/common.json`, onde `meuTrabalho` já mora — "Minha
Semana" em pt-BR, "Mi Semana" em es-ES.

Fica **fora** do grupo "Planejamento": aquele grupo é de gestor, e a tela da pessoa escondida lá dentro não seria encontrada por quem ela serve.

- [ ] **Step 6: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: verde, com `/[locale]/planning/my-week` no route table. A suíte cobre a paridade de locales; a mesa do gestor continua funcionando com o `WeekControls` reescrito.

- [ ] **Step 7: Commit**

```bash
git add components/shared/WeekNav.tsx "app/[locale]/(protected)/planning/my-week" "app/[locale]/(protected)/planning/week/WeekControls.tsx" locales lib/navigation.ts
git commit -m "feat(planning): a tela da própria semana, com poço, ordem e reconhecimento"
```

---

### Task 6: A leitura da carga por cliente

**Files:**

- Create: `lib/actions/client-load.ts`
- Test: `__tests__/lib/actions/client-load.test.ts`

**Interfaces:**

- Consumes: `requireManagerOrAdmin`; `buildDayQueue`, `QueueItemInput`; `getStageReferences`; `weekDays`; `formatISODate`, `mondayOfWeek`, `todayInSaoPaulo`
- Produces:
  - `type ClientDay = { hours: number; count: number }`
  - `type ClientWeek = { clientId: string; clientName: string; totalHours: number; totalCount: number; byDay: Record<string, ClientDay> }`
  - `type ClientLoad = { days: string[]; clients: ClientWeek[] }`
  - `getClientLoad(mondayISO: string, teamId?: string): Promise<ClientLoad>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/actions/client-load.test.ts`:

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
  getStageReferences: vi.fn().mockResolvedValue(
    new Map([
      ["s1", { hours: 2, source: "observed" }],
      ["s2", { hours: 3, source: "declared" }],
    ])
  ),
}));
vi.mock("@/lib/prisma", () => ({
  default: { taskActiveStage: { findMany: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";

const SEGUNDA = "2026-09-07";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-08T00:00:00Z"),
    plannedOrder: 1,
    scheduledStart: null,
    task: { project: { client: { id: "c1", name: "Cliente A" } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
});

describe("getClientLoad", () => {
  it("MEMBER é recusado", async () => {
    vi.mocked(requireManagerOrAdmin).mockRejectedValueOnce(new Error("Access Denied"));
    await expect(getClientLoad(SEGUNDA)).rejects.toThrow(/Access Denied/i);
  });

  it("agrupa por cliente e por dia", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row(),
      row({ id: "as2", stageId: "s2" }),
      row({
        id: "as3",
        plannedDate: new Date("2026-09-09T00:00:00Z"),
        task: { project: { client: { id: "c2", name: "Cliente B" } } },
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    const a = carga.clients.find((c) => c.clientId === "c1")!;
    expect(a.byDay["2026-09-08"]).toEqual({ hours: 5, count: 2 });
    expect(a.totalHours).toBe(5);
    expect(a.totalCount).toBe(2);
    const b = carga.clients.find((c) => c.clientId === "c2")!;
    expect(b.byDay["2026-09-09"].count).toBe(1);
  });

  it("o total do cliente é a soma das células dele", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row(),
      row({ id: "as2", plannedDate: new Date("2026-09-10T00:00:00Z") }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    const a = carga.clients[0];
    const somaDasCelulas = carga.days.reduce((acc, d) => acc + (a.byDay[d]?.hours ?? 0), 0);
    expect(a.totalHours).toBe(somaDasCelulas);
  });

  it("etapa não liberada não soma horas — a mesma regra da mesa", async () => {
    // `buildDayQueue` classifica INACTIVE como "waiting": visível, mas sem consumir capacidade.
    // Se somasse aqui, o mesmo cliente teria números diferentes nas duas telas.
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row({ status: "INACTIVE" }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients[0].totalHours).toBe(0);
    expect(carga.clients[0].totalCount).toBe(1);
  });

  it("clientes vêm ordenados do que mais pega a semana para o que menos", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row({ id: "as1", stageId: "s1", task: { project: { client: { id: "c1", name: "A" } } } }),
      row({ id: "as2", stageId: "s2", task: { project: { client: { id: "c2", name: "B" } } } }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients.map((c) => c.clientId)).toEqual(["c2", "c1"]);
  });

  it("o filtro de time entra na consulta quando informado", async () => {
    await getClientLoad(SEGUNDA, "time1");
    const where = (
      vi.mocked(prisma.taskActiveStage.findMany).mock.calls[0][0] as never as {
        where: Record<string, unknown>;
      }
    ).where;
    expect(where.assignee).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts`
Expected: FAIL — `lib/actions/client-load.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/actions/client-load.ts`:

```ts
"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate, mondayOfWeek, todayInSaoPaulo } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";

/**
 * A mesma semana da mesa, pelo eixo do cliente.
 *
 * Leitura pura, sem nenhuma escrita: quem redistribui é a mesa. Um segundo lugar que também
 * escrevesse seria um segundo lugar para as duas divergirem.
 *
 * As horas de cada célula saem do MESMO `buildDayQueue` da mesa — inclusive a regra de que etapa
 * não liberada aparece mas não consome capacidade. Somar aqui o que a mesa não soma faria o mesmo
 * cliente ter dois números diferentes na mesma semana, e nenhum dos dois seria confiável.
 */

export type ClientDay = { hours: number; count: number };

export type ClientWeek = {
  clientId: string;
  clientName: string;
  totalHours: number;
  totalCount: number;
  byDay: Record<string, ClientDay>;
};

export type ClientLoad = { days: string[]; clients: ClientWeek[] };

export async function getClientLoad(mondayISO: string, teamId?: string): Promise<ClientLoad> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;

  const programados = await prisma.taskActiveStage.findMany({
    where: {
      plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
      status: { not: "COMPLETED" },
      ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
    },
    select: {
      id: true,
      stageId: true,
      status: true,
      plannedDate: true,
      plannedOrder: true,
      scheduledStart: true,
      task: { select: { project: { select: { client: { select: { id: true, name: true } } } } } },
    },
    orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
  });

  const referencias = await getStageReferences([...new Set(programados.map((p) => p.stageId))]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  // Cliente → dia → itens. O atrasado cai no primeiro dia visível, como na mesa: some da tela
  // seria a pior perda, porque é silenciosa.
  const porCliente = new Map<string, { name: string; dias: Map<string, QueueItemInput[]> }>();
  const primeiroDia = days[0];
  for (const row of programados) {
    if (!row.plannedDate) continue;
    const cliente = row.task.project.client;
    const planejado = formatISODate(row.plannedDate);
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const entrada = porCliente.get(cliente.id) ?? {
      name: cliente.name,
      dias: new Map<string, QueueItemInput[]>(),
    };
    const doDia = entrada.dias.get(dia) ?? [];
    doDia.push({
      id: row.id,
      available: row.status === "ACTIVE",
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      scheduledStart: row.scheduledStart,
    });
    entrada.dias.set(dia, doDia);
    porCliente.set(cliente.id, entrada);
  }

  const clients: ClientWeek[] = [...porCliente.entries()].map(([clientId, entrada]) => {
    const byDay: Record<string, ClientDay> = {};
    let totalHours = 0;
    let totalCount = 0;
    for (const dia of days) {
      const itens = entrada.dias.get(dia) ?? [];
      const fila = buildDayQueue(itens);
      byDay[dia] = { hours: fila.usedHours, count: itens.length };
      totalHours += fila.usedHours;
      totalCount += itens.length;
    }
    return { clientId, clientName: entrada.name, totalHours, totalCount, byDay };
  });

  // Do que mais pega a semana para o que menos: a pergunta que traz o gestor aqui é "quem está
  // comendo a capacidade", e ela se responde na primeira linha.
  clients.sort((a, b) => b.totalHours - a.totalHours || a.clientName.localeCompare(b.clientName));

  return { days, clients };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts && npx tsc --noEmit`
Expected: PASS (6 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/client-load.ts __tests__/lib/actions/client-load.test.ts
git commit -m "feat(planning): carga da semana por cliente, com a matemática da mesa"
```

---

### Task 7: A tela da carga por cliente

**Files:**

- Create: `app/[locale]/(protected)/planning/client-load/page.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`
- Modify: `lib/navigation.ts`

**Interfaces:**

- Consumes: `getClientLoad` (Task 6); `WeekNav` (Task 5); `requireManagerOrAdmin`; `parseWeekParam`, `mondayOfWeek`, `formatISODate`, `formatDisplayDate`, `todayInSaoPaulo`
- Produces: rota `/planning/client-load`

- [ ] **Step 1: Chaves nos dois locales**

Em `locales/pt-BR/planning.json`, namespace `clientLoad`:

```json
"clientLoad": {
  "kicker": "Planejamento",
  "title": "Carga por cliente",
  "subtitle": "Onde cada cliente está pegando a semana.",
  "weekOf": "Semana de {date}",
  "client": "Cliente",
  "total": "Total",
  "cell": "{hours}h · {count}",
  "empty": "Nada programado nesta semana.",
  "ruler": "As horas são referência da etapa, não apontamento — e etapa não liberada aparece sem somar.",
  "previousWeek": "Semana anterior",
  "nextWeek": "Próxima semana",
  "currentWeek": "Semana atual",
  "teamFilter": "Filtrar por time",
  "allTeams": "Todos os times"
}
```

Em `locales/es-ES/planning.json`:

```json
"clientLoad": {
  "kicker": "Planificación",
  "title": "Carga por cliente",
  "subtitle": "Dónde se lleva la semana cada cliente.",
  "weekOf": "Semana del {date}",
  "client": "Cliente",
  "total": "Total",
  "cell": "{hours}h · {count}",
  "empty": "No hay nada programado esta semana.",
  "ruler": "Las horas son la referencia de la etapa, no el tiempo imputado; una etapa no liberada aparece sin sumar.",
  "previousWeek": "Semana anterior",
  "nextWeek": "Semana siguiente",
  "currentWeek": "Semana actual",
  "teamFilter": "Filtrar por equipo",
  "allTeams": "Todos los equipos"
}
```

- [ ] **Step 2: A página**

Criar `app/[locale]/(protected)/planning/client-load/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  todayInSaoPaulo,
} from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { WeekNav } from "@/components/shared/WeekNav";

export const metadata: Metadata = { title: "Carga por cliente" };

export default async function ClientLoadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const monday = parseWeekParam(sp.week);
  const t = await getTranslations("planning.clientLoad");
  const carga = await getClientLoad(formatISODate(monday), sp.team);

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <WeekNav
            monday={monday}
            isCurrentWeek={formatISODate(monday) === formatISODate(mondayOfWeek(todayInSaoPaulo()))}
            labels={{
              previous: t("previousWeek"),
              next: t("nextWeek"),
              current: t("currentWeek"),
            }}
          />
        }
      />

      {/* De onde vêm as horas, dito na própria tela: sem isto, o número passa por apontamento e a
          leitura vira cobrança de tempo. */}
      <p className="mb-2 text-xs text-muted-foreground">{t("ruler")}</p>

      <SectionCard bodyClassName="overflow-x-auto p-0">
        {carga.clients.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                  {t("client")}
                </th>
                {carga.days.map((d) => (
                  <th
                    key={d}
                    className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground"
                  >
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carga.clients.map((c) => (
                <tr key={c.clientId}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-foreground">
                    {c.clientName}
                  </td>
                  {carga.days.map((d) => (
                    <td key={d} className="px-4 py-3 text-sm text-foreground">
                      {c.byDay[d].count === 0
                        ? "—"
                        : t("cell", {
                            hours: c.byDay[d].hours.toFixed(1),
                            count: c.byDay[d].count,
                          })}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-foreground">
                    {t("cell", { hours: c.totalHours.toFixed(1), count: c.totalCount })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 3: Item de menu**

Em `lib/navigation.ts`, no grupo "Planejamento" de MANAGER/ADMIN, logo depois de `programacao`:

```ts
{ id: "carga-cliente", labelKey: "cargaCliente", href: "/planning/client-load", icon: Building2 },
```

`Building2` de `lucide-react`. A chave `cargaCliente` entra no mesmo bloco de navegação de
`locales/pt-BR/common.json` e `locales/es-ES/common.json` — "Carga por Cliente" nos dois idiomas
(a expressão é a mesma em português e espanhol).

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: verde, com `/[locale]/planning/client-load` no route table.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/planning/client-load" locales lib/navigation.ts
git commit -m "feat(planning): carga por cliente na tela, com a origem das horas dita"
```

---

### Task 8: Documentação, com a exceção registrada

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/biblioteca-de-conhecimento.md`

**Interfaces:**

- Consumes: as rotas `/planning/my-week` e `/planning/client-load`
- Produces: nada

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar a subseção (MESCLAR — não sobrescrever as que já existem):

```markdown
#### Programação semanal (fatias 2 e 3)

- **Minha semana** (`/planning/my-week`): a pessoa vê os próprios seis dias, reordena, assume etapa
  livre do time dela e muda de dia o que já é seu. A leitura é escopada na sessão e **não aceita um
  `userId`** — sem esse parâmetro, ler a semana de outra pessoa é impossível, não só proibido.
- **Terminar o dia puxa o próximo**, como convite e não cobrança: quem quiser adiantar, adianta;
  quem não quiser, fechou o dia e o tempo que sobrou é dele.
- **Reconhecimento do próprio ritmo** — decisão explícita da gestão, e a única exceção ao princípio
  de "informar, não motivar". Compara a pessoa com o histórico dela (mediana das oito semanas
  anteriores), existe só no lado positivo, e o número não é gravado em lugar nenhum.
- **Carga por cliente** (`/planning/client-load`): a mesma semana pelo eixo do cliente, leitura
  pura. As horas saem do mesmo cálculo da mesa — etapa não liberada aparece sem somar —, senão o
  mesmo cliente teria dois números diferentes na mesma semana.
```

- [ ] **Step 2: Biblioteca de conhecimento**

Em `docs/biblioteca-de-conhecimento.md`, na seção `## 4. Decisões de arquitetura registradas (ADRs)`:

```markdown
- **Leitura da semana pessoal sem parâmetro de pessoa** — `getMyWeek(mondayISO)` escopa na sessão e
  não aceita `userId`. Com o parâmetro, a proteção dependeria de nunca ninguém errar uma checagem;
  sem ele, ler a semana de outro é impossível de codificar por engano. _(P1)_
- **Reconhecimento do ritmo próprio — exceção registrada a P1/P2** — a tela da pessoa diz "seu
  rendimento está acima da média" quando ela fecha mais etapas que de costume. É **decisão explícita
  da gestão**, para empurrar a fechar a semana sem o peso da crítica, e é exceção porque a regra
  continua valendo em todo o resto do produto. Quatro travas a separam de um placar, e as quatro são
  obrigatórias: (1) compara com o histórico DELA, nunca com colegas; (2) mediana, não média, porque
  contagem semanal é enviesada; (3) só existe no lado positivo — não há versão inversa nem tom
  neutro de "abaixo do seu ritmo"; (4) o número **não é persistido**, então não há histórico para
  alguém transformar em indicador depois. Quem copiar esta mensagem para outra tela precisa copiar
  as quatro. _(exceção a P1/P2)_
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx vitest run && npx prettier --check CHANGELOG.md docs/biblioteca-de-conhecimento.md`
Expected: verde

```bash
git add CHANGELOG.md docs/biblioteca-de-conhecimento.md
git commit -m "docs(planning): fatias 2 e 3 no changelog e a exceção na biblioteca"
```

---

## Fora deste plano

- Devolver etapa ao poço pela tela da pessoa (decisão registrada na spec: trabalho não circula sem dono)
- Arrastar, nas duas telas
- Editar a janela fixa (`scheduledStart`/`scheduledEnd`) por interface — segue esperando a tela de agendamento
- Ver a semana de outra pessoa pela tela do colaborador
- Qualquer indicador derivado da mensagem de reconhecimento
