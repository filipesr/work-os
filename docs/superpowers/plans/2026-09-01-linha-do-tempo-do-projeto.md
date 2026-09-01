# Linha do tempo do projeto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/projects/[projectId]` troca o kanban por uma linha do tempo — futuro projetado em cima, hoje no meio, passado abaixo; demandas no eixo horizontal.

**Architecture:** a compressão dos vãos é uma função pura (`lib/planning/timeline-rows.ts`); a leitura (`lib/actions/project-timeline.ts`) monta os dias com movimento a partir de `TimeLog` e dos carimbos das etapas, e reusa `projectDemandDays` para a metade de cima. A tela é Server Component com filtros na URL, e os três componentes do kanban saem do repositório.

**Tech Stack:** Next.js 15 (Server Components e Server Actions), Prisma/PostgreSQL, next-intl v4, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-linha-do-tempo-do-projeto-design.md`

## Global Constraints

- **A gramática é a mesma da carga por cliente:** `✓` concluída com as horas apontadas, `▶` em curso, `·` ainda não liberada, `~` o número é referência e não medição. Nenhum vocabulário visual novo.
- **O futuro reusa `projectDemandDays`** de `lib/planning/demand-projection.ts`. Nenhuma segunda projeção — duas implementações da mesma leitura divergiriam.
- **A metade de cima fica visualmente separada da linha de hoje**, e as horas dela carregam a marca de referência. É projeção, não promessa.
- **Movimento** é: hora apontada, etapa concluída, etapa liberada, demanda criada, demanda concluída. Dia sem movimento em nenhuma demanda visível não vira linha.
- **O eixo é a demanda, nunca a pessoa.** Nenhuma leitura agrega por pessoa.
- **Os filtros "minhas demandas" e "por responsável" filtram pelo responsável da ETAPA** (`TaskActiveStage.assigneeId`), nunca por `Task.assigneeId` — campo que nenhum caminho do fluxo escreve.
- `logDate`, `completedAt`, `activatedAt` e `createdAt` são instantes REAIS: a janela usa `realInstant` e o dia do balde usa `nowInSaoPaulo`. `plannedDate` e `dueDate` são representação SP-local, e usam `formatISODate` direto.
- Nenhuma mudança de modelo, nenhuma migration.
- Toda string de UI vem do dicionário. **pt-BR e es-ES**, com espanhol de verdade — há teste de paridade de chaves.
- Comentários em pt-BR explicando o **porquê**.
- `npx tsc --noEmit` limpo, `npx vitest run` verde (**1440 testes hoje**, nenhum pode quebrar), `npm run build` compilando.

---

### Task 1: A compressão dos vãos (função pura)

**Files:**

- Create: `lib/planning/timeline-rows.ts`
- Test: `__tests__/lib/planning/timeline-rows.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `const MIN_GAP_DAYS = 2`
  - `type TimelineRow = { kind: "day"; dayISO: string } | { kind: "gap"; fromISO: string; toISO: string; days: number }`
  - `buildTimelineRows(args: { firstISO: string; lastISO: string; todayISO: string; movedDays: ReadonlySet<string> }): TimelineRow[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/timeline-rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTimelineRows, MIN_GAP_DAYS } from "@/lib/planning/timeline-rows";

describe("buildTimelineRows", () => {
  it("vai do mais recente para o mais antigo — futuro em cima, passado embaixo", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-09",
      todayISO: "2026-09-08",
      movedDays: new Set(["2026-09-07", "2026-09-09"]),
    });
    expect(linhas.map((l) => (l.kind === "day" ? l.dayISO : "gap"))).toEqual([
      "2026-09-09",
      "2026-09-08",
      "2026-09-07",
    ]);
  });

  it("hoje é SEMPRE uma linha, mesmo sem movimento nenhum", () => {
    // Hoje é a linha do meio: é ela que separa o que aconteceu do que é projeção. Comprimi-la
    // apagaria a referência que o resto da tela usa para se orientar.
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-07",
      todayISO: "2026-09-07",
      movedDays: new Set(),
    });
    expect(linhas).toEqual([{ kind: "day", dayISO: "2026-09-07" }]);
  });

  it("sequência sem movimento vira UMA faixa, com a contagem", () => {
    // O vão é a informação principal da tela: doze dias parados no meio de um projeto é o que
    // hoje ninguém vê, e costuma ser a explicação do atraso.
    const linhas = buildTimelineRows({
      firstISO: "2026-09-01",
      lastISO: "2026-09-10",
      todayISO: "2026-09-10",
      movedDays: new Set(["2026-09-01", "2026-09-10"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-10" },
      { kind: "gap", fromISO: "2026-09-02", toISO: "2026-09-09", days: 8 },
      { kind: "day", dayISO: "2026-09-01" },
    ]);
  });

  it("um único dia parado NÃO vira faixa", () => {
    // Uma faixa dizendo "1 dia sem movimento" ocupa mais espaço do que a linha que ela substitui,
    // e não conta nada que a ausência da linha já não contasse.
    expect(MIN_GAP_DAYS).toBe(2);
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-09",
      todayISO: "2026-09-09",
      movedDays: new Set(["2026-09-07", "2026-09-09"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-09" },
      { kind: "day", dayISO: "2026-09-08" },
      { kind: "day", dayISO: "2026-09-07" },
    ]);
  });

  it("o vão quebra em hoje: nunca engole a linha do meio", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-01",
      lastISO: "2026-09-10",
      todayISO: "2026-09-05",
      movedDays: new Set(["2026-09-01", "2026-09-10"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-10" },
      { kind: "gap", fromISO: "2026-09-06", toISO: "2026-09-09", days: 4 },
      { kind: "day", dayISO: "2026-09-05" },
      { kind: "gap", fromISO: "2026-09-02", toISO: "2026-09-04", days: 3 },
      { kind: "day", dayISO: "2026-09-01" },
    ]);
  });

  it("projeto de um único dia devolve uma linha só", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-07",
      todayISO: "2026-09-07",
      movedDays: new Set(["2026-09-07"]),
    });
    expect(linhas).toEqual([{ kind: "day", dayISO: "2026-09-07" }]);
  });

  it("janela invertida não explode nem gera linha", () => {
    // Defesa contra dado incompleto: projeto sem nenhum carimbo de data ainda renderiza a tela.
    expect(
      buildTimelineRows({
        firstISO: "2026-09-10",
        lastISO: "2026-09-01",
        todayISO: "2026-09-05",
        movedDays: new Set(),
      })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/timeline-rows.test.ts`
Expected: FAIL — `lib/planning/timeline-rows.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/planning/timeline-rows.ts`:

```ts
/**
 * As linhas do eixo do tempo, com os vãos comprimidos.
 *
 * Sem compressão, um projeto de um ano seriam trezentas e sessenta e cinco linhas e a tela morreria
 * de própria mão. Mas a compressão não é economia de espaço: o vão É a informação. Doze dias parados
 * no meio de um projeto é exatamente o que hoje ninguém enxerga, e costuma ser a explicação do
 * atraso que todo mundo procura depois.
 *
 * A ordem é do mais recente para o mais antigo — futuro em cima, hoje no meio, passado abaixo —,
 * como se lê um extrato.
 *
 * Pura, e sem data do sistema: "hoje" chega por parâmetro. Dias ISO comparam-se como texto, o que
 * mantém a função livre de fuso.
 */

const DIA_MS = 86_400_000;

/** Abaixo disto, o vão não vira faixa: uma faixa de "1 dia sem movimento" ocupa mais espaço do que
 *  a linha que ela substitui, e não conta nada que a ausência da linha já não conte. */
export const MIN_GAP_DAYS = 2;

export type TimelineRow =
  | { kind: "day"; dayISO: string }
  | { kind: "gap"; fromISO: string; toISO: string; days: number };

function diaAnterior(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
}

export function buildTimelineRows(args: {
  firstISO: string;
  lastISO: string;
  todayISO: string;
  movedDays: ReadonlySet<string>;
}): TimelineRow[] {
  const { firstISO, lastISO, todayISO, movedDays } = args;
  if (lastISO < firstISO) return [];

  // Hoje é sempre linha: é ela que separa o que aconteceu do que é projeção, e o resto da tela se
  // orienta por ela. Comprimi-la apagaria a referência.
  const ehLinha = (dia: string) => dia === todayISO || movedDays.has(dia);

  const linhas: TimelineRow[] = [];
  let vao: { fromISO: string; toISO: string; days: number } | null = null;

  const fecharVao = () => {
    if (!vao) return;
    // Vão curto demais volta a ser linha comum: comprimir um dia só não ganha nada.
    if (vao.days >= MIN_GAP_DAYS) linhas.push({ kind: "gap", ...vao });
    else {
      for (let d = vao.toISO; d >= vao.fromISO; d = diaAnterior(d)) {
        linhas.push({ kind: "day", dayISO: d });
      }
    }
    vao = null;
  };

  for (let dia = lastISO; dia >= firstISO; dia = diaAnterior(dia)) {
    if (ehLinha(dia)) {
      fecharVao();
      linhas.push({ kind: "day", dayISO: dia });
    } else if (vao) {
      // Percorrendo para trás, o começo do vão é sempre o dia mais antigo visto até agora.
      vao.fromISO = dia;
      vao.days += 1;
    } else {
      vao = { fromISO: dia, toISO: dia, days: 1 };
    }
  }
  fecharVao();

  return linhas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/timeline-rows.test.ts`
Expected: PASS (7 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/timeline-rows.ts __tests__/lib/planning/timeline-rows.test.ts
git commit -m "feat(projeto): as linhas do tempo com os vãos comprimidos"
```

---

### Task 2: A leitura da linha do tempo

**Files:**

- Create: `lib/actions/project-timeline.ts`
- Test: `__tests__/lib/actions/project-timeline.test.ts`

**Interfaces:**

- Consumes: `buildTimelineRows`, `TimelineRow`, (Task 1); `projectDemandDays`, `ProjectionStage` de `@/lib/planning/demand-projection`; `getStageReferences` de `@/lib/planning/stage-reference`; `getSessionUser` de `@/lib/permissions`; `formatISODate`, `nowInSaoPaulo`, `realInstant`, `todayInSaoPaulo` de `@/lib/dates`
- Produces:
  - `type TimelineLine = { stageId: string; stageOrder: number; stageName: string; assigneeName: string | null; hours: number; estimated: boolean; state: "done" | "pending" | "waiting" }`
  - `type TimelineCell = { doneHours: number; pendingHours: number; lines: TimelineLine[] }`
  - `type TimelineDemand = { taskId: string; title: string; open: boolean; dueDateISO: string | null; overdue: boolean }`
  - `type TimelineFilters = { mine?: boolean; assigneeId?: string; teamId?: string; priority?: string }`
  - `type ProjectTimeline = { rows: TimelineRow[]; demands: TimelineDemand[]; todayISO: string; byDay: Record<string, Record<string, TimelineCell>> }`
  - `getProjectTimeline(projectId: string, filters?: TimelineFilters): Promise<ProjectTimeline>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/actions/project-timeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

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
  default: { task: { findMany: vi.fn() }, timeLog: { findMany: vi.fn() } },
}));
// A projeção REAL roda; o espião só prova que é ela que roda, e não uma cópia local.
vi.mock("@/lib/planning/demand-projection", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planning/demand-projection")>();
  return { ...real, projectDemandDays: vi.fn(real.projectDemandDays) };
});

import prisma from "@/lib/prisma";
import { projectDemandDays } from "@/lib/planning/demand-projection";
import { getProjectTimeline } from "@/lib/actions/project-timeline";
import { formatISODate, todayInSaoPaulo } from "@/lib/dates";

const HOJE = formatISODate(todayInSaoPaulo());

function etapa(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: null,
    completedAt: null,
    activatedAt: new Date("2026-08-20T12:00:00Z"),
    assigneeId: "ana",
    assignee: { name: "Ana Souza", email: null },
    team: null,
    stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
    ...over,
  };
}

function demanda(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Vídeo institucional",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    createdAt: new Date("2026-08-20T12:00:00Z"),
    completedAt: null,
    dueDate: null,
    activeStages: [etapa()],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);
});

describe("getProjectTimeline", () => {
  it("o dia com apontamento vira linha, e a hora aparece nele", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 1.5, logDate: new Date("2026-08-21T16:00:00Z") },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === "2026-08-21")).toBe(true);
      expect(linha.byDay["2026-08-21"]["t1"].doneHours).toBe(1.5);
    });
  });

  it("dias sem movimento viram faixa entre os dias que têm", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 1, logDate: new Date("2026-08-25T16:00:00Z") },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      // Entre a criação (20/08) e o apontamento (25/08) não houve nada.
      expect(linha.rows.some((r) => r.kind === "gap" && r.days >= 2)).toBe(true);
    });
  });

  it("demanda aberta vem antes da concluída", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "fechada",
        status: "COMPLETED",
        completedAt: new Date("2026-08-22T12:00:00Z"),
      }),
      demanda({ id: "aberta" }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands.map((d) => d.taskId)).toEqual(["aberta", "fechada"]);
      expect(linha.demands[0].open).toBe(true);
    });
  });

  it("o pendente do futuro é posicionado pela projeção, não por data inventada", () => {
    // A segunda etapa não acontece junto da primeira: acontece depois dela.
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        activeStages: [
          etapa({ id: "as1", stageId: "s1" }),
          etapa({
            id: "as2",
            stageId: "s2",
            status: "INACTIVE",
            stage: {
              name: "Edição",
              order: 2,
              defaultTeam: null,
              dependents: [{ dependsOnStageId: "s1" }],
            },
          }),
        ],
      }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      // A tela NÃO tem projeção própria: uma segunda implementação divergiria da carga por cliente,
      // e a segunda seria a errada.
      expect(vi.mocked(projectDemandDays)).toHaveBeenCalled();
      const diaDaPrimeira = Object.keys(linha.byDay).find((d) =>
        linha.byDay[d]["t1"]?.lines.some((l) => l.stageId === "s1")
      );
      const diaDaSegunda = Object.keys(linha.byDay).find((d) =>
        linha.byDay[d]["t1"]?.lines.some((l) => l.stageId === "s2")
      );
      expect(diaDaSegunda! > diaDaPrimeira!).toBe(true);
    });
  });

  it("'minhas demandas' filtra pelo responsável da ETAPA, não pelo da demanda", () => {
    // `Task.assigneeId` não é escrito por caminho nenhum do fluxo: filtrar por ele devolve sempre
    // vazio. A atribuição neste sistema é por etapa.
    return getProjectTimeline("p1", { mine: true }).then(() => {
      const where = (
        vi.mocked(prisma.task.findMany).mock.calls[0][0] as never as {
          where: { activeStages?: { some?: { assigneeId?: string } } };
        }
      ).where;
      expect(where.activeStages?.some?.assigneeId).toBe("ana");
    });
  });

  it("hoje é sempre uma linha, mesmo num projeto sem nada acontecendo", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.todayISO).toBe(HOJE);
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === HOJE)).toBe(true);
    });
  });

  it("nenhuma leitura agrega por pessoa — o eixo é a demanda", () => {
    // Uma linha do tempo por pessoa seria vigilância ("o que fulano fez em cada dia"), que é o que a
    // biblioteca proíbe (P1, P2). O guarda é de código-fonte porque a proibição é fácil de esquecer:
    // agrupar por `assigneeId` num arquivo que já tem o campo é a coisa mais natural de se escrever.
    const fonte = readFileSync("lib/actions/project-timeline.ts", "utf-8");
    expect(/groupBy[\s\S]{0,200}(assigneeId|userId)/.test(fonte)).toBe(false);
    expect(/byPerson|porPessoa|byAssignee/.test(fonte)).toBe(false);
  });

  it("projeto sem demanda nenhuma devolve a linha de hoje e nada mais", () => {
    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands).toEqual([]);
      expect(linha.rows).toEqual([{ kind: "day", dayISO: HOJE }]);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/project-timeline.test.ts`
Expected: FAIL — `lib/actions/project-timeline.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/actions/project-timeline.ts`:

```ts
"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { formatISODate, nowInSaoPaulo, realInstant, todayInSaoPaulo } from "@/lib/dates";
import { buildTimelineRows, type TimelineRow } from "@/lib/planning/timeline-rows";
import { projectDemandDays, type ProjectionStage } from "@/lib/planning/demand-projection";
import { getStageReferences } from "@/lib/planning/stage-reference";

/**
 * A história do projeto: o que já foi feito, o que está em curso e o que vem.
 *
 * Substitui o kanban, que respondia uma pergunta só — onde cada demanda está agora — e jogava o
 * tempo fora. Quanto uma demanda ficou parada, onde o esforço foi e quando cada coisa andou não
 * existiam em tela nenhuma.
 *
 * O eixo é a DEMANDA, nunca a pessoa: uma linha do tempo por pessoa seria vigilância, e é o que a
 * biblioteca do projeto proíbe. Quem aparece na célula aparece como quem executou aquela etapa.
 *
 * O futuro sai da MESMA `projectDemandDays` da carga por cliente. Uma segunda projeção divergiria
 * da primeira, e a segunda seria a errada.
 */

/** Até onde a projeção vale. Além de oito semanas ela é ficção: a cadeia acumula incerteza a cada
 *  etapa, e uma tela que desenha três meses adiante promete o que ninguém pode cumprir.
 *
 *  NÃO exportar: arquivo `"use server"` só pode exportar função async. Um `export const` aqui passa
 *  no tsc E na suíte de testes, e quebra `next build` em runtime — já aconteceu neste projeto. */
const FUTURE_HORIZON_DAYS = 56;

export type TimelineLine = {
  stageId: string;
  stageOrder: number;
  stageName: string;
  assigneeName: string | null;
  hours: number;
  /** O número é referência, não medição — a tela marca com `~`. */
  estimated: boolean;
  state: "done" | "pending" | "waiting";
};

export type TimelineCell = { doneHours: number; pendingHours: number; lines: TimelineLine[] };

export type TimelineDemand = {
  taskId: string;
  title: string;
  open: boolean;
  dueDateISO: string | null;
  overdue: boolean;
};

export type TimelineFilters = {
  mine?: boolean;
  assigneeId?: string;
  teamId?: string;
  priority?: string;
};

export type ProjectTimeline = {
  rows: TimelineRow[];
  demands: TimelineDemand[];
  todayISO: string;
  /** dia → demanda → célula. */
  byDay: Record<string, Record<string, TimelineCell>>;
};

export async function getProjectTimeline(
  projectId: string,
  filters?: TimelineFilters
): Promise<ProjectTimeline> {
  const me = await getSessionUser();
  const hojeISO = formatISODate(todayInSaoPaulo());

  // "Minhas demandas" e "por responsável" olham o responsável da ETAPA. `Task.assigneeId` existe no
  // schema e NENHUM caminho do fluxo o escreve — filtrar por ele devolveria sempre vazio, que é
  // como o filtro do kanban antigo estava quebrado sem ninguém perceber.
  const donoProcurado = filters?.mine ? me.id : filters?.assigneeId;

  const tarefas = await prisma.task.findMany({
    where: {
      projectId,
      ...(filters?.priority ? { priority: filters.priority as never } : {}),
      ...(donoProcurado || filters?.teamId
        ? {
            activeStages: {
              some: {
                ...(donoProcurado ? { assigneeId: donoProcurado } : {}),
                ...(filters?.teamId
                  ? {
                      OR: [
                        { teamId: filters.teamId },
                        { teamId: null, stage: { defaultTeamId: filters.teamId } },
                      ],
                    }
                  : {}),
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      completedAt: true,
      dueDate: true,
      activeStages: {
        select: {
          id: true,
          stageId: true,
          status: true,
          plannedDate: true,
          completedAt: true,
          activatedAt: true,
          assignee: { select: { name: true, email: true } },
          team: { select: { name: true } },
          stage: {
            select: {
              name: true,
              order: true,
              defaultTeam: { select: { name: true } },
              // Os PRÉ-REQUISITOS vivem em `dependents` — em `TemplateStage` o campo de nome
              // intuitivo é a relação INVERSA. Ver o comentário no schema.
              dependents: { select: { dependsOnStageId: true } },
            },
          },
        },
        orderBy: [{ stage: { order: "asc" } }, { id: "asc" }],
      },
    },
  });

  const idsDasTarefas = tarefas.map((t) => t.id);
  const apontamentos = idsDasTarefas.length
    ? await prisma.timeLog.findMany({
        where: { taskId: { in: idsDasTarefas } },
        select: { taskId: true, stageId: true, hoursSpent: true, logDate: true },
      })
    : [];

  const referencias = await getStageReferences([
    ...new Set(tarefas.flatMap((t) => t.activeStages.map((a) => a.stageId))),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

  // (tarefa, etapa) → dia → horas, e (tarefa, etapa) → total para descontar da referência. Mapa
  // aninhado, e não chave concatenada: cada etapa lê só os SEUS dias, em vez de varrer a lista
  // inteira de apontamentos do projeto uma vez por etapa.
  const chave = (taskId: string, stageId: string) => `${taskId}::${stageId}`;
  const feitoPorDia = new Map<string, Map<string, number>>();
  const feitoPorEtapa = new Map<string, number>();
  for (const a of apontamentos) {
    if (!a.stageId) continue; // hora lançada na demanda inteira: não é de etapa nenhuma
    const k = chave(a.taskId, a.stageId);
    const dia = formatISODate(nowInSaoPaulo(a.logDate));
    const porDia = feitoPorDia.get(k) ?? new Map<string, number>();
    porDia.set(dia, (porDia.get(dia) ?? 0) + a.hoursSpent);
    feitoPorDia.set(k, porDia);
    feitoPorEtapa.set(k, (feitoPorEtapa.get(k) ?? 0) + a.hoursSpent);
  }

  // A janela do futuro, para a projeção. Ela devolve `null` para o que não cabe aqui — e o que não
  // cabe simplesmente não aparece, em vez de empilhar no último dia.
  const diasFuturos = Array.from({ length: FUTURE_HORIZON_DAYS + 1 }, (_, i) =>
    formatISODate(new Date(Date.parse(`${hojeISO}T00:00:00Z`) + i * 86_400_000))
  );

  const byDay: Record<string, Record<string, TimelineCell>> = {};
  const movedDays = new Set<string>();
  const ultimoMovimento = new Map<string, string>();

  const celula = (dia: string, taskId: string): TimelineCell => {
    byDay[dia] ??= {};
    byDay[dia][taskId] ??= { doneHours: 0, pendingHours: 0, lines: [] };
    return byDay[dia][taskId];
  };
  const marcarMovimento = (dia: string, taskId: string) => {
    movedDays.add(dia);
    const anterior = ultimoMovimento.get(taskId);
    if (!anterior || dia > anterior) ultimoMovimento.set(taskId, dia);
  };

  for (const t of tarefas) {
    // Criação e conclusão da demanda são movimento: é onde a história começa e termina.
    marcarMovimento(formatISODate(nowInSaoPaulo(t.createdAt)), t.id);
    if (t.completedAt) marcarMovimento(formatISODate(nowInSaoPaulo(t.completedAt)), t.id);

    const projecao = projectDemandDays({
      stages: t.activeStages.map(
        (a): ProjectionStage => ({
          id: a.id,
          stageId: a.stageId,
          order: a.stage.order,
          dependsOnIds: a.stage.dependents.map((d) => d.dependsOnStageId),
          status: a.status,
          plannedDate: a.plannedDate ? formatISODate(a.plannedDate) : null,
          completedDay: a.completedAt ? formatISODate(nowInSaoPaulo(a.completedAt)) : null,
          pendingHours: Math.max(
            0,
            horasDe(a.stageId) - (feitoPorEtapa.get(chave(t.id, a.stageId)) ?? 0)
          ),
        })
      ),
      days: diasFuturos,
      todayISO: hojeISO,
      dueDateISO: t.dueDate ? formatISODate(t.dueDate) : null,
    });

    for (const a of t.activeStages) {
      const nome =
        a.assignee?.name ?? a.assignee?.email ?? a.team?.name ?? a.stage.defaultTeam?.name ?? null;
      const referencia = horasDe(a.stageId);
      const pendente = Math.max(0, referencia - (feitoPorEtapa.get(chave(t.id, a.stageId)) ?? 0));

      // Liberar a etapa é movimento: é o dia em que o trabalho passou a ser possível. Sem isso, uma
      // demanda que andou pela cadeia sem ninguém apontar hora ficaria invisível na história.
      if (a.activatedAt) marcarMovimento(formatISODate(nowInSaoPaulo(a.activatedAt)), t.id);

      // PASSADO: cada dia em que houve hora apontada nesta etapa.
      const diasDaEtapa = feitoPorDia.get(chave(t.id, a.stageId)) ?? new Map<string, number>();
      for (const [dia, horas] of diasDaEtapa) {
        const c = celula(dia, t.id);
        c.doneHours += horas;
        c.lines.push({
          stageId: a.stageId,
          stageOrder: a.stage.order,
          stageName: a.stage.name,
          assigneeName: nome,
          hours: horas,
          estimated: false, // medido
          state: a.status === "COMPLETED" ? "done" : "pending",
        });
        marcarMovimento(dia, t.id);
      }

      // A etapa concluída aparece no dia em que fechou, mesmo sem apontamento — é um fato do
      // projeto. Sem hora, conta zero: preencher com estimativa seria fabricar histórico.
      if (a.status === "COMPLETED" && a.completedAt) {
        const dia = formatISODate(nowInSaoPaulo(a.completedAt));
        if (!diasDaEtapa.has(dia)) {
          celula(dia, t.id).lines.push({
            stageId: a.stageId,
            stageOrder: a.stage.order,
            stageName: a.stage.name,
            assigneeName: nome,
            hours: 0,
            estimated: false,
            state: "done",
          });
        }
        marcarMovimento(dia, t.id);
        continue;
      }

      // FUTURO (e hoje): o pendente, no dia que a projeção deu.
      const diaProjetado = projecao.get(a.id);
      if (!diaProjetado) continue;
      const c = celula(diaProjetado, t.id);
      c.pendingHours += pendente;
      c.lines.push({
        stageId: a.stageId,
        stageOrder: a.stage.order,
        stageName: a.stage.name,
        assigneeName: nome,
        hours: pendente,
        // O futuro é sempre referência, nunca medição.
        estimated: sourceDe(a.stageId) === "declared" || diaProjetado >= hojeISO,
        state: a.status === "ACTIVE" ? "pending" : "waiting",
      });
      marcarMovimento(diaProjetado, t.id);
    }
  }

  const diasComAlgo = [...movedDays].sort();
  const firstISO = diasComAlgo[0] ?? hojeISO;
  const lastISO = diasComAlgo[diasComAlgo.length - 1] ?? hojeISO;

  const demands: TimelineDemand[] = tarefas
    .map((t) => {
      const vencimento = t.dueDate ? formatISODate(t.dueDate) : null;
      const aberta =
        t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "OBSOLETE";
      return {
        taskId: t.id,
        title: t.title,
        open: aberta,
        dueDateISO: vencimento,
        overdue: !!vencimento && vencimento < hojeISO && aberta,
      };
    })
    // Abertas primeiro, e entre elas a que se moveu mais recentemente. Num projeto antigo, ordenar
    // por criação encheria as primeiras colunas de demandas fechadas há meses.
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      const ma = ultimoMovimento.get(a.taskId) ?? "";
      const mb = ultimoMovimento.get(b.taskId) ?? "";
      return mb.localeCompare(ma) || a.title.localeCompare(b.title);
    });

  return {
    rows: buildTimelineRows({ firstISO, lastISO, todayISO: hojeISO, movedDays }),
    demands,
    todayISO: hojeISO,
    byDay,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/project-timeline.test.ts && npx tsc --noEmit`
Expected: PASS (8 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/project-timeline.ts __tests__/lib/actions/project-timeline.test.ts
git commit -m "feat(projeto): a leitura da linha do tempo, com passado medido e futuro projetado"
```

---

### Task 3: A tela, e a saída do kanban

**Files:**

- Create: `app/[locale]/(protected)/projects/[projectId]/ProjectTimeline.tsx`
- Create: `app/[locale]/(protected)/projects/[projectId]/TimelineFilters.tsx`
- Modify: `app/[locale]/(protected)/projects/[projectId]/page.tsx`
- Modify: `locales/pt-BR/projects.json`, `locales/es-ES/projects.json`
- Delete: `components/projects/KanbanBoard.tsx`, `components/projects/TaskCard.tsx`, `components/projects/KanbanFilters.tsx`, `__tests__/components/KanbanBoard.test.tsx`

**Interfaces:**

- Consumes: `getProjectTimeline`, `ProjectTimeline`, `TimelineFilters` (Task 2); `TimelineRow` (Task 1); `useUrlFilters` de `@/lib/hooks/useUrlFilters`
- Produces: a rota `/projects/[projectId]` com a linha do tempo

- [ ] **Step 1: Chaves nos dois locales**

Em `locales/pt-BR/projects.json`, na raiz, o namespace `timeline`:

```json
"timeline": {
  "title": "Linha do tempo",
  "subtitle": "O que já foi feito, o que está em curso e o que vem — por demanda e por dia.",
  "today": "hoje",
  "future": "projeção",
  "futureHint": "Acima desta linha é projeção, não promessa: os dias vêm da ordem das etapas e do prazo da demanda.",
  "gap": "{days} dias sem movimento",
  "empty": "Nada registrado neste projeto ainda.",
  "noDemands": "Nenhuma demanda com esses filtros.",
  "dueOn": "vence {date}",
  "overdue": "venceu {date}",
  "legend": "✓ feito · ▶ em curso · · não liberada · ~ referência",
  "filters": {
    "mine": "Minhas demandas",
    "allAssignees": "Qualquer responsável",
    "allTeams": "Qualquer equipe",
    "allPriorities": "Qualquer prioridade"
  }
}
```

Em `locales/es-ES/projects.json`:

```json
"timeline": {
  "title": "Línea de tiempo",
  "subtitle": "Lo hecho, lo que está en marcha y lo que viene: por demanda y por día.",
  "today": "hoy",
  "future": "proyección",
  "futureHint": "Por encima de esta línea es proyección, no promesa: los días salen del orden de las etapas y del plazo de la demanda.",
  "gap": "{days} días sin movimiento",
  "empty": "Todavía no hay nada registrado en este proyecto.",
  "noDemands": "Ninguna demanda con esos filtros.",
  "dueOn": "vence el {date}",
  "overdue": "venció el {date}",
  "legend": "✓ hecho · ▶ en marcha · · no liberada · ~ referencia",
  "filters": {
    "mine": "Mis demandas",
    "allAssignees": "Cualquier responsable",
    "allTeams": "Cualquier equipo",
    "allPriorities": "Cualquier prioridad"
  }
}
```

- [ ] **Step 2: O controle de filtros**

Criar `app/[locale]/(protected)/projects/[projectId]/TimelineFilters.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/** Os mesmos quatro filtros do kanban que saiu — tirar capacidade em silêncio é pior que a tela
 *  antiga. A diferença é que "minhas" e "por responsável" agora olham o responsável da ETAPA, que
 *  é o que eles sempre quiseram dizer. */
export function TimelineFilters({
  mine,
  assigneeId,
  teamId,
  priority,
  people,
  teams,
}: {
  mine: boolean;
  assigneeId?: string;
  teamId?: string;
  priority?: string;
  people: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const t = useTranslations("projects.timeline");
  const tPriority = useTranslations("tasks.priority");
  const { setParam } = useUrlFilters({ replace: true });

  const campo = "h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => setParam("mine", e.target.checked ? "1" : null)}
          className="h-4 w-4 rounded border-input-border text-primary"
        />
        {t("filters.mine")}
      </label>

      <select
        value={assigneeId ?? ""}
        onChange={(e) => setParam("assignee", e.target.value || null)}
        aria-label={t("filters.allAssignees")}
        className={campo}
      >
        <option value="">{t("filters.allAssignees")}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={teamId ?? ""}
        onChange={(e) => setParam("team", e.target.value || null)}
        aria-label={t("filters.allTeams")}
        className={campo}
      >
        <option value="">{t("filters.allTeams")}</option>
        {teams.map((tm) => (
          <option key={tm.id} value={tm.id}>
            {tm.name}
          </option>
        ))}
      </select>

      <select
        value={priority ?? ""}
        onChange={(e) => setParam("priority", e.target.value || null)}
        aria-label={t("filters.allPriorities")}
        className={campo}
      >
        <option value="">{t("filters.allPriorities")}</option>
        {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
          <option key={p} value={p}>
            {tPriority(p.toLowerCase())}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: A grade**

Criar `app/[locale]/(protected)/projects/[projectId]/ProjectTimeline.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { ProjectTimeline as Timeline } from "@/lib/actions/project-timeline";

/** "3h", "2.5h" — sem o `.0` que só ocupa espaço numa célula cheia de números. */
function fmtH(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** Nome e sobrenome. O resto não distingue ninguém dentro de uma agência e come a largura que os
 *  números precisam. */
function curto(nome: string): string {
  return nome.split(/\s+/).slice(0, 2).join(" ");
}

function ddmm(diaISO: string): string {
  return `${diaISO.slice(8, 10)}/${diaISO.slice(5, 7)}`;
}

/** A grade: tempo no eixo vertical (futuro em cima, hoje no meio, passado abaixo), demandas no
 *  horizontal. A gramática visual é a mesma da carga por cliente — quem já lê uma, lê a outra. */
export async function ProjectTimeline({ data }: { data: Timeline }) {
  const t = await getTranslations("projects.timeline");

  if (data.demands.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("noDemands")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-muted-foreground">{t("legend")}</p>
      <table className="min-w-full table-fixed border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-20 bg-card px-2 py-2 text-left font-bold uppercase text-foreground">
              {t("today")}
            </th>
            {data.demands.map((d) => (
              <th
                key={d.taskId}
                className="min-w-[12rem] px-2 py-2 text-left font-bold text-foreground"
              >
                <span className="block truncate" title={d.title}>
                  {d.title}
                </span>
                {d.dueDateISO && (
                  <span className={d.overdue ? "text-danger" : "text-muted-foreground"}>
                    {t(d.overdue ? "overdue" : "dueOn", { date: ddmm(d.dueDateISO) })}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            if (row.kind === "gap") {
              // O vão é a informação principal desta tela: um trecho parado no meio do projeto é o
              // que ninguém enxergava antes, e costuma ser a explicação do atraso.
              return (
                <tr key={`gap-${row.fromISO}`}>
                  <td
                    colSpan={data.demands.length + 1}
                    className="border-y border-dashed border-border bg-muted/30 px-2 py-1 text-center text-[11px] text-muted-foreground"
                  >
                    {t("gap", { days: row.days })} · {ddmm(row.fromISO)} – {ddmm(row.toISO)}
                  </td>
                </tr>
              );
            }
            const futuro = row.dayISO > data.todayISO;
            const hoje = row.dayISO === data.todayISO;
            return (
              <tr key={row.dayISO} className={futuro ? "opacity-70" : undefined}>
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1 align-top ${
                    hoje
                      ? "border-t-2 border-primary bg-card font-semibold text-primary"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  {ddmm(row.dayISO)}
                  {hoje && <span className="ml-1 text-[10px]">{t("today")}</span>}
                  {futuro && <span className="ml-1 text-[10px]">{t("future")}</span>}
                </td>
                {data.demands.map((d) => {
                  const cel = data.byDay[row.dayISO]?.[d.taskId];
                  return (
                    <td
                      key={d.taskId}
                      className={`px-2 py-1 align-top ${hoje ? "border-t-2 border-primary" : ""}`}
                    >
                      {!cel ? (
                        <span className="text-muted-foreground/40">·</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {cel.lines.map((l, i) => (
                            <li key={`${l.stageId}-${i}`} className="flex justify-between gap-2">
                              <span
                                className="truncate"
                                title={`${l.stageName} · ${l.assigneeName ?? ""}`}
                              >
                                {l.state === "done" && <span className="text-success">✓ </span>}
                                {l.state === "pending" && <span className="text-primary">▶ </span>}
                                {l.state === "waiting" && <span>· </span>}
                                {l.stageOrder}. {l.stageName}
                                {l.assigneeName && ` · ${curto(l.assigneeName)}`}
                              </span>
                              <span className="shrink-0 whitespace-nowrap tabular-nums">
                                {fmtH(l.hours)}
                                {l.estimated && <span className="ml-0.5 text-warning">~</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">{t("futureHint")}</p>
    </div>
  );
}
```

- [ ] **Step 4: A página troca o kanban pela linha do tempo**

Reescrever `app/[locale]/(protected)/projects/[projectId]/page.tsx` para: autenticar; ler `searchParams` (`mine`, `assignee`, `team`, `priority`); buscar o projeto (nome e cliente, para o cabeçalho) e as listas de pessoas e times para os filtros; chamar `getProjectTimeline(projectId, filtros)`; e renderizar `PageHeader` + `TimelineFilters` + `ProjectTimeline`.

Toda a montagem ad-hoc que existia para o kanban (o `stagesMap`, o `allStagesMap`, os templates, o `currentStage` calculado) **sai junto**: era o que alimentava as colunas de etapa, que não existem mais.

```tsx
const sp = await searchParams;
const filtros = {
  mine: sp.mine === "1",
  assigneeId: typeof sp.assignee === "string" ? sp.assignee : undefined,
  teamId: typeof sp.team === "string" ? sp.team : undefined,
  priority: typeof sp.priority === "string" ? sp.priority : undefined,
};
const data = await getProjectTimeline(projectId, filtros);
```

- [ ] **Step 5: Apagar o kanban**

```bash
git rm components/projects/KanbanBoard.tsx components/projects/TaskCard.tsx \
       components/projects/KanbanFilters.tsx __tests__/components/KanbanBoard.test.tsx
```

Conferido antes de escrever a spec: os três são usados apenas entre si e pela página do projeto, e o filtro `byTeam` do kanban era opcional (nascia desligado), não uma regra de acesso — nenhuma permissão sai junto.

Depois de apagar, confirme que não sobrou referência:

Run: `grep -rn "KanbanBoard\|KanbanFilters\|projects/TaskCard" app components lib __tests__`
Expected: nenhuma saída.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: verde, com `/[locale]/projects/[projectId]` no route table. A suíte perde os testes do kanban e ganha os das tasks 1 e 2.

- [ ] **Step 7: Commit**

```bash
git add -A app components locales __tests__
git commit -m "feat(projeto): a linha do tempo substitui o kanban"
```

---

### Task 4: Documentação

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/pendencias.md`

**Interfaces:**

- Consumes: o comportamento das Tasks 1–3
- Produces: nada

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar (MESCLAR — não sobrescrever o que já existe):

```markdown
#### Linha do tempo do projeto (substitui o kanban)

- **O tempo entrou na tela do projeto.** Dia no eixo vertical — futuro projetado em cima, hoje no
  meio, passado abaixo — e demandas no horizontal. O kanban respondia uma pergunta só, "onde cada
  demanda está agora", e jogava fora quanto tempo cada uma ficou parada.
- **Os vãos são comprimidos**, e é aí que está a informação: "12 dias sem movimento" no meio de um
  projeto é o que ninguém via, e costuma ser a explicação do atraso.
- **A gramática é a mesma da carga por cliente** (✓ feito, ▶ em curso, · não liberada, ~
  referência), e o futuro sai da mesma projeção — nenhuma segunda implementação para divergir.
- **Corrigido de passagem:** os filtros "minhas demandas" e "por responsável" do kanban filtravam
  por `Task.assigneeId`, campo que nenhum caminho do fluxo escreve — devolviam sempre vazio. Agora
  filtram pelo responsável da etapa.
```

- [ ] **Step 2: Pendência 2 encolhe**

Em `docs/pendencias.md`, a pendência 2 (`/planning/coverage` mostra "sem responsável") tem a mesma causa raiz que esta entrega corrigiu noutra tela. Acrescente ao final da seção 2, antes do `---`:

```markdown
**Atualização (linha do tempo do projeto):** o mesmo defeito existia nos filtros do kanban e foi
corrigido lá — eles passaram a olhar `TaskActiveStage.assigneeId`. A cobertura semanal continua
lendo `Task.assignee`; o conserto é o mesmo, noutro arquivo.
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx vitest run && npx prettier --check CHANGELOG.md docs/pendencias.md`
Expected: verde

```bash
git add CHANGELOG.md docs/pendencias.md
git commit -m "docs(projeto): changelog da linha do tempo e a pendência 2 atualizada"
```

---

## Fora deste plano

- **O acumulado do projeto como leitura de orçamento** — direção registrada na spec, com decisões próprias por tomar (custo por hora? por time? quem vê?). É acumulado do projeto, nunca da pessoa.
- **Arrastar** para mover demanda entre etapas, que o kanban também não tinha.
- **Janela de tempo configurável** — a compressão torna o projeto inteiro legível.
- **Levar a linha do tempo para o cliente**, com todas as demandas dele.
