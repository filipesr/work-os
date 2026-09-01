# O que está parado, na carga por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/planning/client-load` ganha uma sétima coluna com as demandas do cliente que ninguém pegou nem marcou — ordenadas por urgência, com o motivo e há quanto tempo estão paradas.

**Architecture:** a classificação ("esta demanda está parada, e por quê") é uma função pura em `lib/planning/stalled-demand.ts`; a leitura `getClientLoad` ganha uma consulta a mais e passa a poder CRIAR a linha de um cliente que só tem trabalho parado; a tela ganha uma coluna.

**Tech Stack:** Next.js 15 (Server Components), Prisma/PostgreSQL, next-intl v4, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-carga-cliente-parado-design.md`

## Global Constraints

- **Parada** = a PRÓXIMA etapa (a não concluída de menor `order`) não tem dono **e** não tem dia. Etapa futura sem dono é normal e não conta. Demanda sem etapa por concluir nunca está parada.
- **A ordem é a urgência:** com prazo primeiro, por prazo crescente (a vencida sobe sozinha, porque a data dela é a mais antiga); sem prazo por último, e entre elas **a mais parada primeiro**.
- **Parado desde** = o mais recente entre a liberação da etapa (`StageTransition` com `status: "ACTIVE"`) e o último apontamento na demanda (`TimeLog.logDate`); sem nenhum dos dois, a criação da demanda. **Zero dia não vira texto.**
- **As horas paradas NÃO entram em `totalDone`/`totalPending` nem em `ClientDay`.** Elas têm número próprio no cabeçalho da coluna.
- **Demanda sem equipe efetiva aparece com o filtro `?team=` ligado, em qualquer equipe.** As demais respeitam o filtro pela equipe efetiva da próxima etapa.
- **A gramática é a que a tela já usa:** `⚠` só nas vencidas, `·` no resto. Nenhum vocabulário visual novo.
- **O eixo é o cliente, nunca a pessoa.** A coluna mostra trabalho SEM dono; nenhuma leitura agrega por pessoa.
- `dueDate` é representação SP-local → `formatISODate` direto. `logDate`, `StageTransition.at` e `createdAt` são instantes REAIS → `nowInSaoPaulo` antes de `formatISODate`. Misturar erra em três horas.
- Um arquivo `"use server"` só pode exportar função async. `export type` é ok; `export const` NÃO (passa no tsc e nos testes, e quebra `next build` em runtime).
- Nenhuma mudança de modelo, nenhuma migration.
- Toda string de UI vem do dicionário, em **pt-BR e es-ES** com espanhol de verdade — há teste de paridade de chaves.
- Comentários em pt-BR explicando o **porquê**.
- `npx tsc --noEmit` limpo, `npx vitest run` verde (**1486 testes hoje**, nenhum pode quebrar), `npm run build` com exit 0.

---

### Task 1: A classificação (função pura)

**Files:**

- Create: `lib/planning/stalled-demand.ts`
- Test: `__tests__/lib/planning/stalled-demand.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `type StalledStage = { order: number; status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED"; assigneeId: string | null; plannedDate: Date | null; teamId: string | null; defaultTeamId: string | null }`
  - `type StalledCheck = { stalled: false } | { stalled: true; teamId: string | null }`
  - `checkStalled(stages: StalledStage[]): StalledCheck`
  - `stalledSince(args: { releasedISO: string | null; lastLogISO: string | null; createdISO: string }): string`
  - `idleDays(sinceISO: string, todayISO: string): number`
  - `type StalledItem = { taskId: string; taskTitle: string; projectName: string; dueDateISO: string | null; overdue: boolean; noTeam: boolean; idleDays: number; hours: number }`
  - `sortStalled(items: StalledItem[]): StalledItem[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/stalled-demand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  checkStalled,
  stalledSince,
  idleDays,
  sortStalled,
  type StalledStage,
  type StalledItem,
} from "@/lib/planning/stalled-demand";

function etapa(over: Partial<StalledStage> = {}): StalledStage {
  return {
    order: 1,
    status: "ACTIVE",
    assigneeId: null,
    plannedDate: null,
    teamId: null,
    defaultTeamId: "video",
    ...over,
  };
}

function item(over: Partial<StalledItem> = {}): StalledItem {
  return {
    taskId: "t1",
    taskTitle: "Vídeo",
    projectName: "Campanha",
    dueDateISO: null,
    overdue: false,
    noTeam: false,
    idleDays: 1,
    hours: 2,
    ...over,
  };
}

describe("checkStalled", () => {
  it("próxima etapa sem dono e sem dia: parada", () => {
    expect(checkStalled([etapa()])).toEqual({ stalled: true, teamId: "video" });
  });

  it("próxima etapa COM dono: não está parada", () => {
    expect(checkStalled([etapa({ assigneeId: "ana" })])).toEqual({ stalled: false });
  });

  it("próxima etapa COM dia: não está parada", () => {
    // Marcada é trabalho distribuído: já aparece na grade, no dia dela.
    expect(checkStalled([etapa({ plannedDate: new Date("2026-09-09T00:00:00Z") })])).toEqual({
      stalled: false,
    });
  });

  it("etapa FUTURA sem dono não conta — só a próxima", () => {
    // Ninguém pega a etapa 4 antes da 1. Sinalizar isso acenderia a coluna em toda demanda
    // saudável do sistema, e um alarme que acende sempre não é alarme.
    const stages = [etapa({ order: 1, assigneeId: "ana" }), etapa({ order: 2 })];
    expect(checkStalled(stages)).toEqual({ stalled: false });
  });

  it("a próxima é a de menor `order` entre as NÃO concluídas", () => {
    const stages = [
      etapa({ order: 1, status: "COMPLETED", assigneeId: "ana" }),
      etapa({ order: 2, defaultTeamId: "trafego" }),
      etapa({ order: 3, assigneeId: "bruno" }),
    ];
    expect(checkStalled(stages)).toEqual({ stalled: true, teamId: "trafego" });
  });

  it("a ordem do array não importa — quem manda é o `order`", () => {
    const stages = [etapa({ order: 3 }), etapa({ order: 1, assigneeId: "ana" })];
    expect(checkStalled(stages)).toEqual({ stalled: false });
  });

  it("demanda sem etapa por concluir nunca está parada", () => {
    // É a entregue: ela já aparece na grade, pelo dia em que fechou.
    expect(checkStalled([etapa({ status: "COMPLETED" })])).toEqual({ stalled: false });
    expect(checkStalled([])).toEqual({ stalled: false });
  });

  it("o roteamento da demanda SUBSTITUI o padrão do modelo", () => {
    expect(checkStalled([etapa({ teamId: "trafego", defaultTeamId: "video" })])).toEqual({
      stalled: true,
      teamId: "trafego",
    });
  });

  it("coringa que ninguém roteou fica sem equipe", () => {
    expect(checkStalled([etapa({ teamId: null, defaultTeamId: null })])).toEqual({
      stalled: true,
      teamId: null,
    });
  });
});

describe("stalledSince", () => {
  it("o mais recente entre liberação e último apontamento", () => {
    // Sem o apontamento, uma demanda que alguém pegou, trabalhou e largou ontem diria
    // "parado há 40 dias" sobre um trabalho que aconteceu há um dia.
    expect(
      stalledSince({
        releasedISO: "2026-08-01",
        lastLogISO: "2026-09-08",
        createdISO: "2026-07-20",
      })
    ).toBe("2026-09-08");
  });

  it("sem apontamento, vale a liberação", () => {
    expect(
      stalledSince({ releasedISO: "2026-08-01", lastLogISO: null, createdISO: "2026-07-20" })
    ).toBe("2026-08-01");
  });

  it("sem nenhum dos dois, vale a criação — o piso honesto", () => {
    // Dado antigo, sem transição registrada: a demanda existe desde então e não andou.
    expect(stalledSince({ releasedISO: null, lastLogISO: null, createdISO: "2026-07-20" })).toBe(
      "2026-07-20"
    );
  });
});

describe("idleDays", () => {
  it("conta os dias corridos até hoje", () => {
    expect(idleDays("2026-09-01", "2026-09-24")).toBe(23);
  });

  it("mesmo dia é zero", () => {
    expect(idleDays("2026-09-24", "2026-09-24")).toBe(0);
  });

  it("nunca é negativo", () => {
    // Defesa contra relógio ou dado fora de ordem: "parado há -3 dias" não significa nada.
    expect(idleDays("2026-09-30", "2026-09-24")).toBe(0);
  });
});

describe("sortStalled", () => {
  it("com prazo antes de sem prazo, e por prazo crescente", () => {
    // A vencida sobe sozinha: a data dela é a mais antiga de todas. Nenhum ramo especial para
    // "vencida" — um ramo a mais seria uma regra a mais para divergir.
    const r = sortStalled([
      item({ taskId: "sem-prazo" }),
      item({ taskId: "vence-depois", dueDateISO: "2026-09-30" }),
      item({ taskId: "venceu", dueDateISO: "2026-09-01", overdue: true }),
      item({ taskId: "vence-logo", dueDateISO: "2026-09-10" }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["venceu", "vence-logo", "vence-depois", "sem-prazo"]);
  });

  it("entre as SEM prazo, a mais parada primeiro", () => {
    // Elas nunca vão subir por vencimento; sem este critério a mais podre fica no fim para sempre.
    const r = sortStalled([
      item({ taskId: "nova", idleDays: 2 }),
      item({ taskId: "podre", idleDays: 90 }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["podre", "nova"]);
  });

  it("empate resolve pelo título — ordem estável entre carregamentos", () => {
    const r = sortStalled([
      item({ taskId: "b", taskTitle: "Beta", dueDateISO: "2026-09-10" }),
      item({ taskId: "a", taskTitle: "Alfa", dueDateISO: "2026-09-10" }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["a", "b"]);
  });

  it("não muda o array recebido", () => {
    const original = [item({ taskId: "x", idleDays: 1 }), item({ taskId: "y", idleDays: 9 })];
    sortStalled(original);
    expect(original.map((i) => i.taskId)).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/stalled-demand.test.ts`
Expected: FAIL — `lib/planning/stalled-demand.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/planning/stalled-demand.ts`:

```ts
/**
 * A demanda que ninguém pegou nem marcou.
 *
 * A carga por cliente responde "quanto deste cliente está distribuído nesta semana". O que NÃO está
 * distribuído não passa por nenhuma das portas dela — e o silêncio é indistinguível de "está tudo
 * certo". Cinco demandas paradas de um cliente é exatamente o que a tela deveria gritar.
 *
 * Puro e sem relógio do sistema: "hoje" chega por parâmetro. Dias ISO comparam-se como texto, o que
 * mantém o módulo livre de fuso.
 */

const DIA_MS = 86_400_000;

export type StalledStage = {
  order: number;
  status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  assigneeId: string | null;
  plannedDate: Date | null;
  /** Roteamento da demanda. */
  teamId: string | null;
  /** Padrão do modelo. */
  defaultTeamId: string | null;
};

export type StalledCheck =
  | { stalled: false }
  /** `teamId` é a equipe EFETIVA da próxima etapa; `null` na coringa que ninguém roteou. */
  | { stalled: true; teamId: string | null };

/**
 * A demanda está parada quando a PRÓXIMA etapa — a não concluída de menor `order` — não tem dono e
 * não tem dia.
 *
 * A estreiteza é o ponto: uma etapa FUTURA sem dono é normal (ninguém pega a etapa 4 antes da 1), e
 * sinalizar isso acenderia a coluna em toda demanda saudável do sistema.
 */
export function checkStalled(stages: StalledStage[]): StalledCheck {
  let proxima: StalledStage | null = null;
  for (const s of stages) {
    if (s.status === "COMPLETED") continue;
    if (!proxima || s.order < proxima.order) proxima = s;
  }
  // Sem etapa por concluir: é a demanda entregue, e ela já aparece na grade pelo dia em que fechou.
  if (!proxima) return { stalled: false };
  if (proxima.assigneeId || proxima.plannedDate) return { stalled: false };
  // Roteamento da demanda substitui o padrão do modelo — a regra de `lib/stage-team.ts`.
  return { stalled: true, teamId: proxima.teamId ?? proxima.defaultTeamId };
}

/**
 * Desde quando ninguém toca na demanda.
 *
 * Os dois fatos são necessários: sem a LIBERAÇÃO não há marco inicial para a demanda que nunca
 * andou; sem o APONTAMENTO, uma demanda que alguém pegou, trabalhou e largou ontem contaria desde a
 * liberação original e diria "parado há 40 dias" sobre trabalho de um dia atrás.
 *
 * Sem nenhum dos dois — dado antigo, sem transição registrada — vale a criação: é o piso honesto,
 * porque a demanda existe desde então e não andou.
 */
export function stalledSince(args: {
  releasedISO: string | null;
  lastLogISO: string | null;
  createdISO: string;
}): string {
  const candidatos = [args.releasedISO, args.lastLogISO].filter((d): d is string => !!d);
  if (candidatos.length === 0) return args.createdISO;
  return candidatos.reduce((a, b) => (a > b ? a : b));
}

/** Dias corridos, nunca negativo: "parado há -3 dias" não significa nada. */
export function idleDays(sinceISO: string, todayISO: string): number {
  const dias = Math.round(
    (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${sinceISO}T00:00:00Z`)) / DIA_MS
  );
  return dias > 0 ? dias : 0;
}

export type StalledItem = {
  taskId: string;
  taskTitle: string;
  projectName: string;
  dueDateISO: string | null;
  overdue: boolean;
  /** A próxima etapa não tem equipe efetiva: ninguém PODE pegar, o gestor precisa rotear. */
  noTeam: boolean;
  idleDays: number;
  /** Referência das etapas por concluir — estimativa, e a tela marca como tal. */
  hours: number;
};

/**
 * A ordem é a urgência: com prazo primeiro, por prazo crescente; sem prazo por último, e entre elas
 * a mais parada primeiro.
 *
 * Não há ramo para "vencida": a data dela é a mais antiga de todas, então ela sobe sozinha. Um ramo
 * a mais seria uma regra a mais para divergir da primeira.
 *
 * Devolve uma cópia — ordenar no lugar mudaria o array de quem chamou.
 */
export function sortStalled(items: StalledItem[]): StalledItem[] {
  return [...items].sort((a, b) => {
    if (a.dueDateISO && b.dueDateISO) {
      return a.dueDateISO.localeCompare(b.dueDateISO) || a.taskTitle.localeCompare(b.taskTitle);
    }
    if (a.dueDateISO) return -1;
    if (b.dueDateISO) return 1;
    // Sem prazo dos dois lados: a mais parada primeiro.
    return b.idleDays - a.idleDays || a.taskTitle.localeCompare(b.taskTitle);
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/stalled-demand.test.ts && npx tsc --noEmit`
Expected: PASS (18 casos), tsc limpo

- [ ] **Step 5: Commit**

```bash
git add lib/planning/stalled-demand.ts __tests__/lib/planning/stalled-demand.test.ts
git commit -m "feat(carga): a regra do que está parado, pura"
```

---

### Task 2: A leitura

**Files:**

- Modify: `lib/actions/client-load.ts`
- Test: `__tests__/lib/actions/client-load-stalled.test.ts`

**Interfaces:**

- Consumes: `checkStalled`, `stalledSince`, `idleDays`, `sortStalled`, `StalledStage`, `StalledItem` (Task 1); `getStageReferences`; `formatISODate`, `nowInSaoPaulo`, `todayInSaoPaulo` de `@/lib/dates`
- Produces:
  - `ClientWeek` ganha `stalled: StalledItem[]` e `stalledHours: number`
  - `ClientLoad` inalterado no formato (`{ days, clients }`)

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/actions/client-load-stalled.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 6, source: "declared" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn(), groupBy: vi.fn() },
    task: { findMany: vi.fn() },
    stageTransition: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getClientLoad } from "@/lib/actions/client-load";

const SEGUNDA = "2026-09-07";

function paradaCrua(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Reels institucional",
    dueDate: null,
    createdAt: new Date("2026-08-01T12:00:00Z"),
    project: { name: "Campanha", client: { id: "c1", name: "Acme" } },
    activeStages: [
      {
        stageId: "s1",
        status: "ACTIVE",
        assigneeId: null,
        plannedDate: null,
        teamId: null,
        stage: { order: 1, defaultTeamId: "video" },
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([] as never);
});

describe("getClientLoad — o que está parado", () => {
  it("cliente que SÓ tem trabalho parado ganha linha na grade", async () => {
    // Sem isto o pior caso — o cliente para quem ninguém está trabalhando — some da tela inteira,
    // que é exatamente o silêncio que esta entrega existe para quebrar.
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients.map((c) => c.clientId)).toEqual(["c1"]);
    expect(carga.clients[0].stalled).toHaveLength(1);
    expect(carga.clients[0].stalled[0]).toMatchObject({
      taskTitle: "Reels institucional",
      noTeam: false,
    });
  });

  it("as horas paradas NÃO entram no total da semana", async () => {
    // O total responde "quanto desta semana este cliente ocupou". Trabalho parado não ocupou nada,
    // e somá-lo misturaria ocupação com intenção.
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients[0].totalDone).toBe(0);
    expect(carga.clients[0].totalPending).toBe(0);
    expect(carga.clients[0].stalledHours).toBe(6);
  });

  it("demanda SEM equipe aparece mesmo com o filtro de equipe ligado", async () => {
    // Ela não pertence a equipe nenhuma: com o filtro, sumiria de todas as visões — a categoria
    // mais travada desaparecendo justamente da tela que existe para mostrá-la.
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      paradaCrua({
        id: "sem-equipe",
        activeStages: [
          {
            stageId: "s1",
            status: "ACTIVE",
            assigneeId: null,
            plannedDate: null,
            teamId: null,
            stage: { order: 1, defaultTeamId: null },
          },
        ],
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA, "outra-equipe");
    expect(carga.clients[0].stalled[0]).toMatchObject({ taskId: "sem-equipe", noTeam: true });
  });

  it("demanda COM equipe respeita o filtro", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA, "outra-equipe");
    expect(carga.clients).toEqual([]);
  });

  it("o tempo parado conta do último apontamento quando ele é mais recente", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);
    vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", at: new Date("2026-08-01T12:00:00Z") },
    ] as never);
    vi.mocked(prisma.timeLog.groupBy).mockResolvedValue([
      { taskId: "t1", _max: { logDate: new Date("2026-08-20T12:00:00Z") } },
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    // Não interessa o número exato (depende de hoje), e sim de QUAL data ele parte: a mais recente.
    const { idleDays, stalledSince } = await import("@/lib/planning/stalled-demand");
    const { formatISODate, todayInSaoPaulo } = await import("@/lib/dates");
    const esperado = idleDays(
      stalledSince({
        releasedISO: "2026-08-01",
        lastLogISO: "2026-08-20",
        createdISO: "2026-08-01",
      }),
      formatISODate(todayInSaoPaulo())
    );
    expect(carga.clients[0].stalled[0].idleDays).toBe(esperado);
  });

  it("demanda com dono não é parada", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      paradaCrua({
        activeStages: [
          {
            stageId: "s1",
            status: "ACTIVE",
            assigneeId: "ana",
            plannedDate: null,
            teamId: null,
            stage: { order: 1, defaultTeamId: "video" },
          },
        ],
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients).toEqual([]);
  });

  it("a leitura não agrega por pessoa — o eixo é o cliente", async () => {
    // Guarda de vocabulário: a coluna mostra trabalho SEM dono, e a lista nunca diz de quem
    // "deveria" ter sido.
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("lib/actions/client-load.ts", "utf-8");
    expect(/paradas[\s\S]{0,400}groupBy[\s\S]{0,120}assigneeId/.test(fonte)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/client-load-stalled.test.ts`
Expected: FAIL — `stalled` não existe em `ClientWeek`

- [ ] **Step 3: Implementar**

Em `lib/actions/client-load.ts`:

**3a.** Ao lado dos outros imports:

```ts
import {
  checkStalled,
  idleDays,
  sortStalled,
  stalledSince,
  type StalledItem,
} from "@/lib/planning/stalled-demand";
```

**3b.** `ClientWeek` ganha os dois campos:

```ts
export type ClientWeek = {
  clientId: string;
  clientName: string;
  totalDone: number;
  totalPending: number;
  byDay: Record<string, ClientDay>;
  /** O que ninguém pegou nem marcou, já ordenado por urgência. */
  stalled: StalledItem[];
  /** Soma das horas paradas. FORA de `totalDone`/`totalPending` de propósito: o total responde
   *  "quanto desta semana este cliente ocupou", e trabalho parado não ocupou nada. */
  stalledHours: number;
};
```

**3c.** Depois da montagem de `clients` e ANTES do `clients.sort(...)`, a leitura do parado:

```ts
// O que ninguém pegou nem marcou. Consulta própria porque nenhuma das três portas da grade a
// alcança: todas exigem vínculo com a semana (dia marcado, etapa reivindicada, conclusão nela).
//
// O `where` é um SUPERCONJUNTO — demandas com ALGUMA etapa aberta sem dono e sem dia —, e a regra
// fina (ser a PRÓXIMA etapa) roda em memória, em `checkStalled`: "a de menor ordem entre as não
// concluídas" não se escreve em SQL sem uma subconsulta por linha.
const candidatas = await prisma.task.findMany({
  where: {
    status: { notIn: ["CANCELLED", "OBSOLETE"] },
    activeStages: {
      some: { status: { not: "COMPLETED" }, assigneeId: null, plannedDate: null },
    },
  },
  select: {
    id: true,
    title: true,
    dueDate: true,
    createdAt: true,
    project: { select: { name: true, client: { select: { id: true, name: true } } } },
    activeStages: {
      select: {
        stageId: true,
        status: true,
        assigneeId: true,
        plannedDate: true,
        teamId: true,
        stage: { select: { order: true, defaultTeamId: true } },
      },
    },
  },
});

const paradas = candidatas
  .map((t) => ({
    t,
    check: checkStalled(
      t.activeStages.map((a) => ({
        ...a,
        order: a.stage.order,
        defaultTeamId: a.stage.defaultTeamId,
      }))
    ),
  }))
  .filter(
    (x): x is { t: (typeof candidatas)[number]; check: { stalled: true; teamId: string | null } } =>
      x.check.stalled
  )
  // Demanda SEM equipe efetiva aparece em qualquer filtro: ela não pertence a equipe nenhuma, e
  // com o filtro ligado sumiria de todas as visões. Dois gestores verem o mesmo item é melhor
  // que nenhum ver — a marca `sem equipe` explica por que ele está ali.
  .filter((x) => !teamId || x.check.teamId === null || x.check.teamId === teamId);

const idsParados = paradas.map((x) => x.t.id);
const [liberacoes, ultimoLog, refsParadas] = await Promise.all([
  idsParados.length
    ? prisma.stageTransition.findMany({
        where: { taskId: { in: idsParados }, status: "ACTIVE" },
        select: { taskId: true, stageId: true, at: true },
      })
    : Promise.resolve([]),
  idsParados.length
    ? prisma.timeLog.groupBy({
        by: ["taskId"],
        where: { taskId: { in: idsParados } },
        _max: { logDate: true },
      })
    : Promise.resolve([]),
  getStageReferences([
    ...new Set(
      paradas.flatMap((x) =>
        x.t.activeStages.filter((a) => a.status !== "COMPLETED").map((a) => a.stageId)
      )
    ),
  ]),
]);

// A liberação MAIS RECENTE de cada etapa: uma etapa pode entrar em ACTIVE mais de uma vez
// (bloqueio e desbloqueio, reversão), e o que interessa é desde quando ela está disponível AGORA.
const liberacaoPorEtapa = new Map<string, string>();
for (const l of liberacoes) {
  const k = `${l.taskId}:${l.stageId}`;
  const dia = formatISODate(nowInSaoPaulo(l.at));
  const anterior = liberacaoPorEtapa.get(k);
  if (!anterior || dia > anterior) liberacaoPorEtapa.set(k, dia);
}
const ultimoLogPorTarefa = new Map(
  ultimoLog
    .filter((g) => g._max.logDate)
    .map((g) => [g.taskId, formatISODate(nowInSaoPaulo(g._max.logDate as Date))])
);

const hojeISO = formatISODate(todayInSaoPaulo());
const paradasPorCliente = new Map<string, { nome: string; itens: StalledItem[] }>();
for (const { t } of paradas) {
  const abertas = t.activeStages.filter((a) => a.status !== "COMPLETED");
  const proxima = abertas.reduce(
    (m, a) => (m && m.stage.order <= a.stage.order ? m : a),
    abertas[0]
  );
  const vencimento = t.dueDate ? formatISODate(t.dueDate) : null;
  const item: StalledItem = {
    taskId: t.id,
    taskTitle: t.title,
    projectName: t.project.name,
    dueDateISO: vencimento,
    overdue: !!vencimento && vencimento < hojeISO,
    noTeam: (proxima.teamId ?? proxima.stage.defaultTeamId) === null,
    idleDays: idleDays(
      stalledSince({
        releasedISO: liberacaoPorEtapa.get(`${t.id}:${proxima.stageId}`) ?? null,
        lastLogISO: ultimoLogPorTarefa.get(t.id) ?? null,
        createdISO: formatISODate(nowInSaoPaulo(t.createdAt)),
      }),
      hojeISO
    ),
    // A referência de TODAS as etapas por concluir: o que a demanda ainda custa inteira.
    hours: abertas.reduce((n, a) => n + (refsParadas.get(a.stageId)?.hours ?? 0), 0),
  };
  const acc = paradasPorCliente.get(t.project.client.id) ?? {
    nome: t.project.client.name,
    itens: [],
  };
  acc.itens.push(item);
  paradasPorCliente.set(t.project.client.id, acc);
}

// Um cliente pode ter APENAS trabalho parado — e é o pior caso, o cliente para quem ninguém está
// trabalhando. Sem esta parte ele não teria linha na grade e sumiria da tela inteira.
for (const c of clients) {
  const p = paradasPorCliente.get(c.clientId);
  c.stalled = sortStalled(p?.itens ?? []);
  c.stalledHours = c.stalled.reduce((n, i) => n + i.hours, 0);
  paradasPorCliente.delete(c.clientId);
}
for (const [clientId, p] of paradasPorCliente) {
  const stalled = sortStalled(p.itens);
  clients.push({
    clientId,
    clientName: p.nome,
    totalDone: 0,
    totalPending: 0,
    byDay: Object.fromEntries(days.map((d) => [d, { doneHours: 0, pendingHours: 0, tasks: [] }])),
    stalled,
    stalledHours: stalled.reduce((n, i) => n + i.hours, 0),
  });
}
```

**3d.** No `map` que monta `clients`, o `return` ganha os dois campos com valor inicial (o laço acima os preenche):

```ts
return {
  clientId,
  clientName: acc.name,
  totalDone,
  totalPending,
  byDay,
  stalled: [],
  stalledHours: 0,
};
```

**3e.** O desempate da ordenação dos clientes, para o cliente só-parado não ficar sempre por último entre os de ocupação zero:

```ts
clients.sort(
  (a, b) =>
    b.totalDone + b.totalPending - (a.totalDone + a.totalPending) ||
    // Entre clientes que ocupam o mesmo (dois zeros, por exemplo), quem tem mais parado primeiro.
    b.stalledHours - a.stalledHours ||
    a.clientName.localeCompare(b.clientName)
);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/client-load-stalled.test.ts __tests__/lib/actions/client-load.test.ts && npx tsc --noEmit`
Expected: PASS.

**O `client-load.test.ts` existente vai quebrar antes de rodar um caso sequer**, e o motivo não é a
sua mudança: o mock de prisma dele só declara `taskActiveStage.findMany` e `timeLog.findMany`, então
as consultas novas chamam método de `undefined`. Complete o mock dele com o mínimo, sem tocar em
nenhum caso:

```ts
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn(), groupBy: vi.fn() },
    task: { findMany: vi.fn() },
    stageTransition: { findMany: vi.fn() },
  },
}));
```

E no `beforeEach` dele, o retorno vazio para as três novas (as consultas do parado não são o assunto
daquele arquivo):

```ts
vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
vi.mocked(prisma.timeLog.groupBy).mockResolvedValue([] as never);
vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([] as never);
```

- [ ] **Step 5: Commit**

```bash
git add lib/actions/client-load.ts __tests__/lib/actions/client-load-stalled.test.ts __tests__/lib/actions/client-load.test.ts
git commit -m "feat(carga): a leitura do que está parado, com o tempo parado junto"
```

---

### Task 3: A coluna na tela

**Files:**

- Modify: `app/[locale]/(protected)/planning/client-load/page.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`

**Interfaces:**

- Consumes: `ClientWeek.stalled: StalledItem[]` e `ClientWeek.stalledHours: number` (Task 2)
- Produces: a rota `/planning/client-load` com a sétima coluna

- [ ] **Step 1: Chaves nos dois locales**

Em `locales/pt-BR/planning.json`, dentro do namespace `clientLoad`:

```json
"stalledHeader": "Parado",
"stalledSummary": "{count} demandas · {hours}h",
"stalledEmpty": "—",
"stalledNoTeam": "sem equipe",
"stalledNoDueDate": "sem prazo",
"stalledOverdue": "venceu {date}",
"stalledDueOn": "vence {date}",
"stalledIdle": "parado há {days} dias",
"stalledHelp": "Demandas cuja próxima etapa não tem responsável nem dia. As horas não entram no total da semana — elas ainda não ocuparam ninguém."
```

Em `locales/es-ES/planning.json`, no mesmo namespace:

```json
"stalledHeader": "Parado",
"stalledSummary": "{count} demandas · {hours}h",
"stalledEmpty": "—",
"stalledNoTeam": "sin equipo",
"stalledNoDueDate": "sin plazo",
"stalledOverdue": "venció el {date}",
"stalledDueOn": "vence el {date}",
"stalledIdle": "parado hace {days} días",
"stalledHelp": "Demandas cuya siguiente etapa no tiene responsable ni día. Las horas no entran en el total de la semana: todavía no han ocupado a nadie."
```

- [ ] **Step 2: A coluna no cabeçalho**

Em `app/[locale]/(protected)/planning/client-load/page.tsx`, DEPOIS do `<th>` de `t("total")`:

```tsx
<th className="w-56 border-l-2 border-border px-3 py-2 text-left text-xs font-bold uppercase text-foreground">
  {t("stalledHeader")}
</th>
```

A coluna vem DEPOIS do total, e não entre os dias e ele: o total fecha a leitura da semana e precisa ficar colado nos dias que soma. A borda à esquerda diz que dali para a direita a pergunta é outra.

- [ ] **Step 3: A célula**

No `<tr>` de cada cliente, depois da célula do total:

```tsx
<td className="border-l-2 border-border px-3 py-2 align-top text-xs">
  {c.stalled.length === 0 ? (
    <span className="text-muted-foreground">{t("stalledEmpty")}</span>
  ) : (
    <>
      {/* O tamanho do que está parado, sem entrar no total da semana: aquele
                              número responde "quanto este cliente ocupou", e parado não ocupou. */}
      <p className="mb-1 font-semibold text-foreground">
        {t("stalledSummary", {
          count: c.stalled.length,
          hours: c.stalledHours.toFixed(1),
        })}
      </p>
      <ul className="space-y-1.5">
        {c.stalled.map((s) => (
          <li key={s.taskId}>
            <p className="truncate" title={`${s.projectName} · ${s.taskTitle}`}>
              {/* ⚠ só na vencida — a mesma gramática do resto da tela. */}
              {s.overdue ? (
                <span className="text-danger">⚠ </span>
              ) : (
                <span className="text-muted-foreground">· </span>
              )}
              {s.taskTitle}
            </p>
            <p className="text-muted-foreground">
              <span className={s.overdue ? "text-danger" : undefined}>
                {s.dueDateISO
                  ? t(s.overdue ? "stalledOverdue" : "stalledDueOn", {
                      date: `${s.dueDateISO.slice(8, 10)}/${s.dueDateISO.slice(5, 7)}`,
                    })
                  : t("stalledNoDueDate")}
              </span>
              {/* Zero dia não vira texto: uma etapa liberada hoje não está
                                      parada, está começando. */}
              {s.idleDays > 0 && ` · ${t("stalledIdle", { days: s.idleDays })}`}
              {s.noTeam && ` · ${t("stalledNoTeam")}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  )}
</td>
```

- [ ] **Step 4: A explicação da coluna**

Junto do parágrafo `t("ruler")` que já existe no topo da tela, acrescente:

```tsx
<p className="mb-2 text-xs text-muted-foreground">{t("stalledHelp")}</p>
```

Sem isto, um gestor lê "18h" na coluna e soma de cabeça com o total da semana — que é justamente a conta que esta entrega decidiu não fazer por ele.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc limpo, suíte verde (o guarda de paridade de locales incluído), build com exit 0.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(protected)/planning/client-load/page.tsx" locales/pt-BR/planning.json locales/es-ES/planning.json
git commit -m "feat(carga): a coluna do que está parado"
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

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar (MESCLAR — não sobrescrever o que já existe; leia o arquivo antes e siga a formatação vizinha):

```markdown
#### `/planning/client-load` mostra o que ninguém pegou nem marcou

- **O silêncio era indistinguível de "está tudo distribuído".** As três portas da tela exigiam
  vínculo com a semana — dia marcado, etapa reivindicada, conclusão nela —, então a demanda parada
  não aparecia em lugar nenhum. Agora tem coluna própria, na linha do cliente.
- **Ordenada por urgência:** com prazo primeiro, por prazo crescente (a vencida sobe sozinha), sem
  prazo por último — e entre as sem prazo, a mais parada primeiro, porque são as que nunca vão subir
  por vencimento.
- **Cada linha diz o que fazer,** não só o que está parado: `sem equipe` (o gestor roteia), prazo sem
  marca (alguém pega), `sem prazo` (alguém decide a data), e `parado há N dias`.
- **As horas paradas ficam FORA do total da semana.** O total responde "quanto este cliente ocupou",
  e trabalho parado não ocupou nada. O número tem lugar próprio, no cabeçalho da coluna.
- **O cliente que só tem trabalho parado ganha linha na grade** — é o pior caso, e antes ele sumia
  da tela inteira.
```

- [ ] **Step 2: A pendência sai da lista**

Em `docs/pendencias.md`, remova a seção `## 1. /planning/client-load — falta a demanda que ninguém pegou nem marcou` inteira (até o `---` que a fecha, inclusive) e renumere a seção seguinte, que passa a ser a `## 1.`. O cabeçalho do arquivo diz a regra: "Item resolvido sai daqui e vira commit".

- [ ] **Step 3: Verificar e commitar**

Run: `npx prettier --check CHANGELOG.md docs/pendencias.md && npx vitest run`
Expected: verde

```bash
git add CHANGELOG.md docs/pendencias.md
git commit -m "docs(carga): changelog do parado e a pendência fechada"
```

---

## Fora deste plano

- **Agir a partir da coluna** (rotear, atribuir ou marcar dia sem sair da tela). A carga por cliente
  é leitura pura; quem escreve é a mesa, e um segundo lugar que escrevesse seria um segundo lugar
  para as duas divergirem.
- **Levar o "parado" para a mesa semanal.** Lá o poço já mostra o que está sem dono.
- **Alerta ativo** (e-mail, notificação) a partir de N dias parado. A tela passa a ter o dado; quem
  decide que N existe é outra conversa.
