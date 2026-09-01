# Projeção da carga por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a carga por cliente passa a mostrar o passado medido pelo apontamento e o futuro projetado pela cadeia de dependências, com o vencimento da demanda como parede.

**Architecture:** a projeção é uma função pura (`lib/planning/demand-projection.ts`) que recebe as etapas de uma demanda e devolve em que dia o trabalho pendente de cada uma cai. `getClientLoad` passa a somar o realizado do `TimeLog` por dia e a posicionar o pendente por essa função. A tela mantém a forma da célula e ganha o vencimento em destaque.

**Tech Stack:** Next.js 15 (Server Actions), Prisma/PostgreSQL, next-intl v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-carga-cliente-projecao-design.md`

## Global Constraints

- **As três grandezas são hora de trabalho:** referência (p50 do `TimeLog`, ou SLA declarado), realizado (`TimeLog` somado por dia) e pendente (`max(0, referência − realizado)`).
- **Etapa concluída sem apontamento conta ZERO.** Não se preenche o passado com estimativa — seria fabricar histórico.
- **A demanda não repete vazia:** aparece num dia porque houve trabalho registrado ali, porque uma etapa fechou ali, ou porque a projeção põe trabalho ali.
- **Precedência da projeção:** data humana (`plannedDate`/`scheduledStart`) manda; senão cascata pela dependência; etapa de 0h não empurra ninguém; a **véspera do vencimento** é a parede; demanda vencida empilha em **hoje**; demanda sem prazo flui livre, e o que passar de sábado não aparece nesta semana.
- **A projeção não fatia etapa entre dias** e **não simula capacidade** — isso seria a grade de horários que o P7 proíbe.
- Nenhuma mudança de modelo, nenhuma migration.
- Toda string de UI vem do dicionário. **pt-BR e es-ES**, com espanhol de verdade — há teste de paridade de chaves.
- Comentários em pt-BR explicando o **porquê**.
- `npx tsc --noEmit` limpo, `npx vitest run` verde (**1404 testes hoje**, nenhum pode quebrar), `npm run build` compilando.

---

### Task 1: A projeção (função pura)

**Files:**

- Create: `lib/planning/demand-projection.ts`
- Test: `__tests__/lib/planning/demand-projection.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `type ProjectionStage = { id: string; stageId: string; order: number; dependsOnIds: string[]; status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED"; plannedDate: string | null; completedDay: string | null; pendingHours: number }`
  - `projectDemandDays(input: { stages: ProjectionStage[]; days: string[]; todayISO: string | null; dueDateISO: string | null }): Map<string, string | null>` — chave é `ProjectionStage.id`, valor é o dia ISO onde o PENDENTE dela cai, ou `null` quando ela não aparece nesta semana

- [ ] **Step 1: Escrever os testes que falham**

Criar `__tests__/lib/planning/demand-projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectDemandDays, type ProjectionStage } from "@/lib/planning/demand-projection";

const DIAS = [
  "2026-09-07", // segunda
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12", // sábado
];

function etapa(over: Partial<ProjectionStage> & { id: string }): ProjectionStage {
  return {
    stageId: over.id,
    order: 1,
    dependsOnIds: [],
    status: "INACTIVE",
    plannedDate: null,
    completedDay: null,
    pendingHours: 2,
    ...over,
  };
}

describe("projectDemandDays", () => {
  it("data humana manda — a projeção não decide onde alguém já decidiu", () => {
    const r = projectDemandDays({
      stages: [etapa({ id: "a", plannedDate: "2026-09-10" })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-10");
  });

  it("a seguinte cai no dia POSTERIOR quando a anterior ainda não fechou", () => {
    // A etapa 2 não acontece junto da 1: acontece depois dela. É a razão desta função existir.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
  });

  it("anterior CONCLUÍDA libera o mesmo dia", () => {
    // Quem terminou às 10h não impede a etapa seguinte de acontecer às 14h.
    const r = projectDemandDays({
      stages: [
        etapa({
          id: "a",
          order: 1,
          status: "COMPLETED",
          completedDay: "2026-09-09",
          pendingHours: 0,
        }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    // A concluída não tem pendente para posicionar.
    expect(r.get("a")).toBeNull();
    expect(r.get("b")).toBe("2026-09-09");
  });

  it("etapas paralelas caem no mesmo dia", () => {
    // Duas que dependem da mesma anterior são paralelas — é isso que paralelo quer dizer.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
        etapa({ id: "c", order: 3, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("b")).toBe("2026-09-08");
    expect(r.get("c")).toBe("2026-09-08");
  });

  it("etapa de 0h não empurra ninguém", () => {
    // Sem duração conhecida, afirmar que ela consome um dia seria inventar.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1, pendingHours: 0 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-07");
  });

  it("o vencimento é a parede: tudo empilha na VÉSPERA", () => {
    // Vence quinta (10), então o trabalho precisa estar pronto na quarta (09).
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
        etapa({ id: "c", order: 3, dependsOnIds: ["b"] }),
        etapa({ id: "d", order: 4, dependsOnIds: ["c"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-10",
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
    expect(r.get("c")).toBe("2026-09-09");
    // A quarta seria sexta pela cascata; a parede a traz para a véspera.
    expect(r.get("d")).toBe("2026-09-09");
  });

  it("demanda VENCIDA empilha em hoje — não há para onde adiar", () => {
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: "2026-09-09",
      dueDateISO: "2026-09-04",
    });
    expect(r.get("a")).toBe("2026-09-09");
    expect(r.get("b")).toBe("2026-09-09");
  });

  it("demanda que vence HOJE também empilha em hoje", () => {
    // A véspera já passou; o último dia que existe é hoje.
    const r = projectDemandDays({
      stages: [etapa({ id: "a" })],
      days: DIAS,
      todayISO: "2026-09-09",
      dueDateISO: "2026-09-09",
    });
    expect(r.get("a")).toBe("2026-09-09");
  });

  it("sem prazo, o que passa do sábado não aparece nesta semana", () => {
    // Empilhar no sábado o trabalho que não é dele mentiria sobre a carga do dia.
    const stages = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      etapa({ id: `s${n}`, order: n, dependsOnIds: n === 1 ? [] : [`s${n - 1}`] })
    );
    const r = projectDemandDays({
      stages,
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("s6")).toBe("2026-09-12");
    expect(r.get("s7")).toBeNull();
    expect(r.get("s8")).toBeNull();
  });

  it("etapa atrasada entra no primeiro dia visível", () => {
    // Mesma regra do resto do sistema: sumir da tela é a pior perda, porque é silenciosa.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", plannedDate: "2026-08-31" })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
  });

  it("fora da semana corrente, a cascata parte do primeiro dia visível", () => {
    // Semana futura: `todayISO` é nulo porque hoje não está na janela.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: null,
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
  });

  it("dependência de etapa que não faz parte da demanda é ignorada", () => {
    // Etapa desmarcada na criação não tem linha; tratá-la como pendência travaria a cadeia inteira.
    const r = projectDemandDays({
      stages: [etapa({ id: "b", order: 2, dependsOnIds: ["fora"] })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("b")).toBe("2026-09-07");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/planning/demand-projection.test.ts`
Expected: FAIL — `lib/planning/demand-projection.ts` não existe

- [ ] **Step 3: Implementar**

Criar `lib/planning/demand-projection.ts`:

```ts
/**
 * Em que dia o trabalho PENDENTE de cada etapa de uma demanda vai acontecer.
 *
 * Existe porque a leitura anterior ancorava toda etapa sem data no primeiro dia da demanda — uma
 * âncora que não descreve o fluxo: a segunda etapa não acontece junto da primeira, acontece depois
 * dela. O gestor via um amontoado onde deveria ver uma demanda andando pela semana.
 *
 * É PROJEÇÃO, não promessa: ninguém se compromete com estes dias, e nada é gravado. A tela mostra
 * onde o trabalho cai se nada mudar — e é lendo isso que se descobre que não cabe.
 *
 * Duas coisas que ela deliberadamente NÃO faz:
 *
 *   - Não fatia etapa entre dias. Uma etapa de 12h aparece inteira no dia projetado, mesmo
 *     estourando a régua. Quem fatia é a realidade: o realizado se divide sozinho pelos
 *     apontamentos de cada dia.
 *   - Não simula capacidade. Não pergunta se a pessoa tem 8h livres naquele dia — isso seria a
 *     grade de horários que o P7 proíbe, e exigiria decidir por alguém que ainda nem é dono da
 *     etapa.
 */

const DIA_MS = 86_400_000;

/** Um dia ISO adiante. Dias ISO comparam-se como string, o que mantém a função sem fuso. */
function diaSeguinte(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
}

function diaAnterior(diaISO: string): string {
  return new Date(Date.parse(`${diaISO}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
}

export type ProjectionStage = {
  /** Id da linha da etapa na demanda (`TaskActiveStage.id`) — a chave do resultado. */
  id: string;
  /** Id da etapa do MODELO (`TemplateStage.id`) — é por ele que a cadeia se liga. */
  stageId: string;
  order: number;
  /** Pré-requisitos, em ids de etapa do modelo. Quem não estiver na demanda é ignorado. */
  dependsOnIds: string[];
  status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  /** Decisão humana: o gestor pôs a etapa neste dia. */
  plannedDate: string | null;
  /** Dia em que fechou, para as concluídas — é daí que as seguintes partem. */
  completedDay: string | null;
  /** `max(0, referência − realizado)`. Zero não empurra ninguém. */
  pendingHours: number;
};

export function projectDemandDays(input: {
  stages: ProjectionStage[];
  days: string[];
  todayISO: string | null;
  dueDateISO: string | null;
}): Map<string, string | null> {
  const { stages, days, todayISO, dueDateISO } = input;
  const primeiro = days[0];
  // Fora da semana corrente não existe "hoje" na janela: a cascata parte do primeiro dia visível,
  // que é a semana que se está planejando.
  const ancora = todayISO ?? primeiro;

  // A parede do vencimento. O prazo é a data de ENTREGA, então o trabalho precisa estar pronto na
  // VÉSPERA. Demanda vencida (ou que vence hoje) não tem para onde adiar: o último dia é hoje.
  const parede = (() => {
    if (!dueDateISO) return null;
    const vespera = diaAnterior(dueDateISO);
    return vespera < ancora ? ancora : vespera;
  })();

  const porStageId = new Map(stages.map((s) => [s.stageId, s]));
  const diaDe = new Map<string, string>();
  const resultado = new Map<string, string | null>();

  // A ordem do fluxo já é topológica nesta base: uma etapa nunca depende de outra de ordem maior.
  // Percorrer por `order` garante que os pré-requisitos já foram posicionados quando chega a vez.
  for (const s of [...stages].sort((a, b) => a.order - b.order)) {
    if (s.status === "COMPLETED") {
      // Concluída não tem pendente para posicionar — ela aparece no dia em que fechou, e quem a
      // coloca lá é quem lê o apontamento.
      resultado.set(s.id, null);
      if (s.completedDay) diaDe.set(s.stageId, s.completedDay);
      continue;
    }

    let dia: string;
    if (s.plannedDate) {
      // Decisão humana manda: inventar por cima dela seria a tela discordando de quem a usa.
      dia = s.plannedDate;
    } else {
      let base = ancora;
      for (const depId of s.dependsOnIds) {
        const dep = porStageId.get(depId);
        // Etapa desmarcada na criação não tem linha na demanda: tratá-la como pendência travaria
        // a cadeia inteira num pré-requisito que não existe.
        if (!dep) continue;
        const diaDep = dep.status === "COMPLETED" ? dep.completedDay : diaDe.get(depId);
        if (!diaDep) continue;
        // Anterior concluída libera o mesmo dia — quem terminou de manhã não impede a seguinte de
        // acontecer à tarde. Anterior ainda pendente ocupa o dia dela, e a seguinte vai para o
        // próximo; a de 0h é a exceção, porque sem duração conhecida ela não consome dia nenhum.
        const candidato =
          dep.status === "COMPLETED" || dep.pendingHours <= 0 ? diaDep : diaSeguinte(diaDep);
        if (candidato > base) base = candidato;
      }
      dia = base;
    }

    // Atrasado entra no primeiro dia visível, como em toda tela deste sistema.
    if (dia < primeiro) dia = primeiro;
    if (parede && dia > parede) dia = parede;

    diaDe.set(s.stageId, dia);
    // Fora da janela (sem parede que a segure) a etapa não aparece nesta semana: empilhar no
    // sábado o trabalho que não é dele mentiria sobre a carga do dia.
    resultado.set(s.id, days.includes(dia) ? dia : null);
  }

  return resultado;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/planning/demand-projection.test.ts`
Expected: PASS (12 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/planning/demand-projection.ts __tests__/lib/planning/demand-projection.test.ts
git commit -m "feat(carga): projeção da demanda pela cadeia, com o vencimento como parede"
```

---

### Task 2: O realizado vem do apontamento

**Files:**

- Modify: `lib/actions/client-load.ts`
- Test: `__tests__/lib/actions/client-load.test.ts`

**Interfaces:**

- Consumes: `realInstant`, `nowInSaoPaulo`, `formatISODate` de `@/lib/dates`
- Produces: `StageLine` ganha `doneHours: number` e `estimated: boolean`; `ClientDay.doneHours` passa a somar o apontamento do dia, não a referência das concluídas

**Por que esta task existe:** hoje o "feito" da célula é a **referência** da etapa concluída, não o que foi trabalhado. Com o apontamento obrigatório em vigor, o realizado passa a ser medido — e a spec é explícita: etapa concluída sem apontamento conta **zero**, porque preencher o passado com estimativa é fabricar histórico.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `__tests__/lib/actions/client-load.test.ts`, dentro do `describe("getClientLoad")`:

```ts
it("o realizado do dia vem do APONTAMENTO, não da referência", () => {
  // A etapa vale 2h de referência, mas só 1,5h foram trabalhadas naquele dia. A célula mostra o
  // que aconteceu, não o que se esperava.
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([
      row({
        status: "COMPLETED",
        plannedDate: null,
        completedAt: new Date("2026-09-09T13:00:00Z"),
      }),
    ] as never)
    .mockResolvedValueOnce([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
    { taskId: "t1", stageId: "s1", hoursSpent: 1.5, logDate: new Date("2026-09-09T16:00:00Z") },
  ] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    expect(carga.clients[0].byDay["2026-09-09"].doneHours).toBe(1.5);
  });
});

it("etapa concluída SEM apontamento conta zero — não se preenche o passado com estimativa", () => {
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([
      row({
        status: "COMPLETED",
        plannedDate: null,
        completedAt: new Date("2026-09-09T13:00:00Z"),
      }),
    ] as never)
    .mockResolvedValueOnce([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    expect(carga.clients[0].byDay["2026-09-09"].doneHours).toBe(0);
    expect(carga.clients[0].totalDone).toBe(0);
  });
});

it("apontamento aparece no dia em que foi trabalhado, mesmo em etapa não concluída", () => {
  // "Trabalhei 2h ontem e não terminei": as 2h ficam em ontem, e o que falta segue adiante.
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
    .mockResolvedValueOnce([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
    { taskId: "t1", stageId: "s1", hoursSpent: 0.5, logDate: new Date("2026-09-08T16:00:00Z") },
  ] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    expect(carga.clients[0].byDay["2026-09-08"].doneHours).toBe(0.5);
    // O pendente é o que falta da referência (2h): 1,5h.
    expect(carga.clients[0].byDay["2026-09-09"].pendingHours).toBe(1.5);
  });
});

it("apontamento maior que a referência não vira pendente negativo", () => {
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
    .mockResolvedValueOnce([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
    { taskId: "t1", stageId: "s1", hoursSpent: 9, logDate: new Date("2026-09-08T16:00:00Z") },
  ] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    expect(carga.clients[0].byDay["2026-09-09"].pendingHours).toBe(0);
  });
});
```

E acrescentar `timeLog: { findMany: vi.fn() }` ao mock do Prisma no topo do arquivo, mais `vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);` no `beforeEach`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts`
Expected: FAIL — a leitura ainda não consulta `TimeLog`

- [ ] **Step 3: Consultar o apontamento da janela**

Em `lib/actions/client-load.ts`, depois da consulta `restantes` e antes de `getStageReferences`:

```ts
// O REALIZADO: horas apontadas na janela, por etapa e por dia. `logDate` é instante real (o
// fechamento do cronômetro grava `endedAt`), então a janela usa `realInstant` — a mesma conta de
// `completedAt`. Comparar com a representação SP-local erraria em três horas e sumiria com o que
// foi trabalhado à noite.
const apontamentos = idsEmTela.length
  ? await prisma.timeLog.findMany({
      where: { taskId: { in: idsEmTela }, logDate: { gte: inicioReal, lte: fimReal } },
      select: { taskId: true, stageId: true, hoursSpent: true, logDate: true },
    })
  : [];

// (taskId, stageId, dia) → horas trabalhadas. O dia é o do calendário de São Paulo, senão o
// apontamento da noite cairia no dia seguinte.
const realizadoPorEtapaDia = new Map<string, number>();
// (taskId, stageId) → total trabalhado na janela, para descontar da referência.
const realizadoPorEtapa = new Map<string, number>();
const chave = (taskId: string, stageId: string, dia?: string) =>
  dia ? `${taskId} ${stageId} ${dia}` : `${taskId} ${stageId}`;

for (const a of apontamentos) {
  if (!a.stageId) continue; // hora lançada na demanda inteira, sem etapa: não é de ninguém aqui
  const dia = formatISODate(nowInSaoPaulo(a.logDate));
  const kDia = chave(a.taskId, a.stageId, dia);
  realizadoPorEtapaDia.set(kDia, (realizadoPorEtapaDia.get(kDia) ?? 0) + a.hoursSpent);
  const kEtapa = chave(a.taskId, a.stageId);
  realizadoPorEtapa.set(kEtapa, (realizadoPorEtapa.get(kEtapa) ?? 0) + a.hoursSpent);
}
```

- [ ] **Step 4: Trocar a origem do "feito"**

Em `StageLine`, acrescentar os dois campos:

```ts
/** Horas APONTADAS desta etapa no dia da célula. Zero quando ninguém apontou — o passado não é
 *  preenchido com estimativa. */
doneHours: number;
/** A referência é estimativa (SLA declarado), não medição. A tela avisa. */
estimated: boolean;
```

E, dentro da função `encaixar`, trocar o cálculo das horas. Onde hoje está o bloco que soma
`horas` em `doneHours`/`pendingHours` conforme o `state`, passa a valer:

```ts
const referencia = horasDe(row.stageId);
const kEtapa = chave(row.task.id, row.stageId);
// Feito NO DIA desta célula: o apontamento se divide sozinho pelos dias em que a pessoa
// trabalhou. É isto que responde "1h num dia, 1h no outro, até fechar".
const feitoNoDia = realizadoPorEtapaDia.get(chave(row.task.id, row.stageId, dia)) ?? 0;
// Pendente é o que falta da referência, descontado tudo que já foi apontado na janela. Nunca
// negativo: quem passou da referência não devolve horas ao cliente.
const pendente = Math.max(0, referencia - (realizadoPorEtapa.get(kEtapa) ?? 0));

const state: StageLine["state"] =
  row.status === "COMPLETED" ? "done" : row.status === "ACTIVE" ? "pending" : "waiting";

bloco.doneHours += feitoNoDia;
// Só a etapa POSICIONADA neste dia carrega o pendente dela; nos dias em que ela só aparece
// pelo apontamento do passado, o pendente já foi contado no dia projetado.
if (state !== "done" && dia === diaProjetado.get(row.id)) bloco.pendingHours += pendente;

bloco.stages.push({
  id: row.id,
  stageOrder: row.stage.order,
  stageName: row.stage.name,
  assigneeName:
    row.assignee?.name ??
    row.assignee?.email ??
    row.team?.name ??
    row.stage.defaultTeam?.name ??
    null,
  hours: state === "done" ? feitoNoDia : pendente,
  doneHours: feitoNoDia,
  // A referência é estimativa quando não há amostra observada — a tela avisa, para o número
  // não passar por medição.
  estimated: sourceDe(row.stageId) === "declared",
  state,
});
```

`sourceDe` já existe no arquivo, ao lado de `horasDe`. **Nesta task**, `diaProjetado` ainda não
existe: use `dia === diaDaEtapa` (o dia que a função já calcula hoje) e troque para `diaProjetado`
na Task 3, que é quem o cria.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts && npx tsc --noEmit`
Expected: PASS (os 4 casos novos e os 12 que já existiam)

- [ ] **Step 6: Commit**

```bash
git add lib/actions/client-load.ts __tests__/lib/actions/client-load.test.ts
git commit -m "feat(carga): o realizado do dia passa a ser o apontamento, não a referência"
```

---

### Task 3: O pendente é projetado pela cadeia

**Files:**

- Modify: `lib/actions/client-load.ts`
- Test: `__tests__/lib/actions/client-load.test.ts`

**Interfaces:**

- Consumes: `projectDemandDays`, `ProjectionStage` (Task 1); o realizado por etapa (Task 2)
- Produces: `TaskBlock` ganha `dueDateISO: string | null` e `overdue: boolean`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `__tests__/lib/actions/client-load.test.ts`:

```ts
it("a segunda etapa cai no dia seguinte, não junto da primeira", () => {
  // Era a âncora antiga: tudo no primeiro dia da demanda, como se as etapas fossem simultâneas.
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([
      row({ id: "as1", stageId: "s1", plannedDate: new Date("2026-09-08T00:00:00Z") }),
    ] as never)
    .mockResolvedValueOnce([
      row({
        id: "as2",
        stageId: "s2",
        status: "INACTIVE",
        plannedDate: null,
        stage: {
          name: "Edição",
          order: 2,
          defaultTeam: null,
          dependents: [{ dependsOnStageId: "s1" }],
        },
      }),
    ] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    const dias = carga.clients[0].byDay;
    expect(dias["2026-09-08"].tasks[0].stages.map((e) => e.id)).toEqual(["as1"]);
    expect(dias["2026-09-09"].tasks[0].stages.map((e) => e.id)).toEqual(["as2"]);
  });
});

it("a demanda NÃO aparece em dia sem nada", () => {
  // Era o defeito da âncora antiga por outro ângulo: a demanda ocupando dias em que não há nem
  // trabalho registrado nem trabalho projetado.
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
    .mockResolvedValueOnce([] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    const dias = carga.clients[0].byDay;
    expect(dias["2026-09-09"].tasks).toHaveLength(1);
    for (const outro of ["2026-09-07", "2026-09-08", "2026-09-10", "2026-09-11", "2026-09-12"]) {
      expect(dias[outro].tasks).toHaveLength(0);
    }
  });
});

it("o vencimento vem no bloco, para explicar o empilhamento", () => {
  vi.mocked(prisma.taskActiveStage.findMany)
    .mockResolvedValueOnce([
      row({
        plannedDate: new Date("2026-09-08T00:00:00Z"),
        task: tarefa({ dueDate: new Date("2026-09-10T00:00:00Z") }),
      }),
    ] as never)
    .mockResolvedValueOnce([] as never);

  return getClientLoad(SEGUNDA).then((carga) => {
    const bloco = carga.clients[0].byDay["2026-09-08"].tasks[0];
    expect(bloco.dueDateISO).toBe("2026-09-10");
    expect(bloco.overdue).toBe(false);
  });
});
```

E acrescentar o helper `tarefa` ao arquivo, ao lado de `row`:

```ts
function tarefa(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Vídeo institucional",
    dueDate: null,
    project: { name: "Institucional", client: { id: "c1", name: "Cliente A" } },
    ...over,
  };
}
```

O helper `row` passa a usar `task: tarefa()` e o `stage` dele ganha `dependents: []`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts`
Expected: FAIL — o pendente ainda é ancorado no primeiro dia da demanda

- [ ] **Step 3: Trazer a cadeia e o prazo na consulta**

Nas duas consultas de `lib/actions/client-load.ts`, acrescentar ao `select` do `stage`:

```ts
        // Os PRÉ-REQUISITOS da etapa vivem em `dependents` — em `TemplateStage`, o campo com nome
        // intuitivo (`dependencies`) é a relação INVERSA. Ver o comentário no schema: ler o lado
        // errado já custou um bug em que concluir a primeira etapa ativava a última.
        dependents: { select: { dependsOnStageId: true } },
```

e ao `select` do `task`: `dueDate: true`.

- [ ] **Step 4: Projetar**

Substituir a âncora `primeiroDiaDaTarefa` pela projeção. Para cada demanda, montar as `ProjectionStage` a partir das linhas dela (as duas consultas juntas), chamar `projectDemandDays` e usar o dia devolvido para encaixar o pendente. A etapa concluída continua indo para o dia em que fechou; a etapa cujo dia projetado é `null` não entra na semana.

```ts
// Uma projeção por demanda: a cadeia é da demanda, e misturar demandas na mesma conta faria uma
// empurrar a outra sem nenhuma relação entre elas.
const linhasPorTarefa = new Map<string, typeof linhas>();
for (const row of [...linhas, ...restantes]) {
  const lista = linhasPorTarefa.get(row.task.id) ?? [];
  lista.push(row);
  linhasPorTarefa.set(row.task.id, lista);
}

const diaProjetado = new Map<string, string | null>();
for (const [, rows] of linhasPorTarefa) {
  const projecao = projectDemandDays({
    stages: rows.map((r) => ({
      id: r.id,
      stageId: r.stageId,
      order: r.stage.order,
      dependsOnIds: r.stage.dependents.map((d) => d.dependsOnStageId),
      status: r.status,
      plannedDate: r.plannedDate ? formatISODate(r.plannedDate) : null,
      completedDay: r.completedAt ? formatISODate(nowInSaoPaulo(r.completedAt)) : null,
      pendingHours: Math.max(
        0,
        horasDe(r.stageId) - (realizadoPorEtapa.get(chave(r.task.id, r.stageId)) ?? 0)
      ),
    })),
    days,
    todayISO: hojeNaSemana,
    dueDateISO: rows[0].task.dueDate ? formatISODate(rows[0].task.dueDate) : null,
  });
  for (const [id, dia] of projecao) diaProjetado.set(id, dia);
}
```

E o laço que encaixa passa a usar a projeção no lugar da âncora:

```ts
for (const row of [...linhas, ...restantes]) {
  const concluida = row.status === "COMPLETED";
  // Concluída vale pelo dia em que fechou; o resto, pelo dia PROJETADO. `null` quer dizer que a
  // etapa não cabe nesta semana — e uma etapa que não cabe não aparece, em vez de empilhar no
  // sábado um trabalho que não é dele.
  const dia = concluida
    ? row.completedAt
      ? formatISODate(nowInSaoPaulo(row.completedAt))
      : null
    : (diaProjetado.get(row.id) ?? null);
  if (!dia || !days.includes(dia)) continue;
  encaixar(row, dia);

  // O apontamento do passado também põe a etapa nos dias em que ela foi trabalhada, mesmo que a
  // projeção a coloque adiante. É o "trabalhei 2h ontem e não terminei" da spec.
  for (const outroDia of days) {
    if (outroDia === dia) continue;
    if ((realizadoPorEtapaDia.get(chave(row.task.id, row.stageId, outroDia)) ?? 0) > 0) {
      encaixar(row, outroDia);
    }
  }
}
```

E o bloco ganha o prazo, dentro de `encaixar`, na criação dele:

```ts
const vencimento = row.task.dueDate ? formatISODate(row.task.dueDate) : null;
const bloco = doDia.get(row.task.id) ?? {
  taskId: row.task.id,
  projectName: row.task.project.name,
  taskTitle: row.task.title,
  dueDateISO: vencimento,
  // Vencida = o prazo já passou e a demanda não fechou. É o que justifica o empilhamento em
  // hoje, e a tela precisa dizer isso em vez de mostrar um amontoado sem causa.
  overdue: !!vencimento && vencimento < formatISODate(todayInSaoPaulo()),
  doneHours: 0,
  pendingHours: 0,
  stages: [],
};
```

**Nota de tipo:** `linhasPorTarefa` não pode ser tipado como `typeof linhas` — ele também recebe as
linhas de `restantes`, que vêm de outra consulta. Declare um tipo local com os campos que as duas
compartilham, ou use `(typeof linhas)[number] | (typeof restantes)[number]`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run __tests__/lib/actions/client-load.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS; suíte inteira verde.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/client-load.ts __tests__/lib/actions/client-load.test.ts
git commit -m "feat(carga): o pendente cai pela cadeia, com o vencimento como parede"
```

---

### Task 4: A tela mostra o vencimento e a marca de estimativa

**Files:**

- Modify: `app/[locale]/(protected)/planning/client-load/page.tsx`
- Modify: `locales/pt-BR/planning.json`, `locales/es-ES/planning.json`

**Interfaces:**

- Consumes: `TaskBlock.dueDateISO`, `TaskBlock.overdue`, `StageLine.doneHours`, `StageLine.estimated` (Tasks 2 e 3)
- Produces: nada

- [ ] **Step 1: Chaves nos dois locales**

Em `locales/pt-BR/planning.json`, dentro de `clientLoad`:

```json
"dueOn": "vence {date}",
"overdue": "venceu {date}",
"estimatedMark": "estimativa",
"ruler": "Feito = horas apontadas. Por fazer = referência da etapa menos o que já foi apontado, projetada pela ordem das etapas até a véspera do vencimento."
```

Em `locales/es-ES/planning.json`:

```json
"dueOn": "vence el {date}",
"overdue": "venció el {date}",
"estimatedMark": "estimación",
"ruler": "Hecho = horas imputadas. Por hacer = la referencia de la etapa menos lo ya imputado, proyectada por el orden de las etapas hasta la víspera del vencimiento."
```

- [ ] **Step 2: O vencimento no cabeçalho do bloco**

No cabeçalho de cada demanda, ao lado do nome, acrescentar:

```tsx
{
  tarefa.dueDateISO && (
    // Explica o empilhamento: quatro etapas na terça, sem dizer
    // que a entrega é quarta, é um amontoado sem causa visível.
    <span
      className={`shrink-0 whitespace-nowrap text-[11px] ${
        tarefa.overdue ? "text-danger" : "text-muted-foreground"
      }`}
    >
      {t(tarefa.overdue ? "overdue" : "dueOn", {
        date: `${tarefa.dueDateISO.slice(8, 10)}/${tarefa.dueDateISO.slice(5, 7)}`,
      })}
    </span>
  );
}
```

- [ ] **Step 3: A marca de estimativa na linha da etapa**

Na linha de cada etapa, depois das horas:

```tsx
{
  etapa.estimated && (
    <span className="ml-1 text-[10px] text-muted-foreground" title={t("estimatedMark")}>
      ~
    </span>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(protected)/planning/client-load/page.tsx" locales
git commit -m "feat(carga): vencimento em destaque e a marca de que a referência é estimativa"
```

---

### Task 5: Documentação

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/pendencias.md`

**Interfaces:**

- Consumes: o comportamento das Tasks 1–4
- Produces: nada

- [ ] **Step 1: CHANGELOG**

Em `CHANGELOG.md`, dentro de `## [Não lançado]` → `### 🚀 Adicionado`, acrescentar (MESCLAR):

```markdown
#### Carga por cliente: passado medido, futuro projetado

- **O realizado vem do apontamento**, por dia. "Trabalhei 2h ontem e não terminei" aparece como 2h
  em ontem, e o que falta segue adiante — até a etapa fechar.
- **O pendente é projetado pela cadeia de etapas.** A segunda etapa não aparece junto da primeira:
  aparece depois dela. Onde o gestor decidiu o dia, a decisão dele manda.
- **O vencimento é a parede.** Tudo que a projeção jogaria para depois dele empilha na véspera, e o
  bloco mostra a data — sem isso, quatro etapas na terça é um amontoado sem causa visível.
- **Etapa concluída sem apontamento conta zero.** Preencher o passado com estimativa seria fabricar
  histórico.
```

- [ ] **Step 2: Fechar a pendência 4**

Em `docs/pendencias.md`, substituir a seção `## 4. ...` inteira (até a linha `---` que a fecha) por:

```markdown
## 4. `/planning/client-load` — falta a demanda que ninguém pegou nem marcou

**Já resolvido:** a tela conta as etapas concluídas, o realizado vem do apontamento por dia, e o
pendente é projetado pela cadeia de etapas até a véspera do vencimento. A célula fecha a demanda
inteira, com quem faria cada etapa.

**O que continua faltando:** demanda que não tem dono **nem** dia não aparece em lugar nenhum desta
tela. Saber que um cliente tem cinco demandas paradas, sem ninguém e sem data, é justamente o que a
tela deveria gritar — e hoje ela cala.

**Perguntas a resolver no desenho:**

- Coluna própria ("sem dia") ao lado dos seis dias, ou faixa separada abaixo da grade?
- Vale distinguir "sem prazo" de "sem equipe"? São dois problemas diferentes, e o segundo tem dono
  óbvio (o gestor roteia); o primeiro agora é uma escolha declarada na criação.
```

- [ ] **Step 3: Verificar e commitar**

Run: `npx vitest run && npx prettier --check CHANGELOG.md docs/pendencias.md`
Expected: verde

```bash
git add CHANGELOG.md docs/pendencias.md
git commit -m "docs(carga): changelog da projeção e a pendência 4 encolhida ao que sobrou"
```

---

## Fora deste plano

- **Simular capacidade** da pessoa na projeção (grade de horários — proibido pelo P7).
- **Levar a projeção para a mesa do gestor e para a minha semana.** Lá a pergunta é "o que fazer agora"; a projeção responde "quando vai acontecer".
- **Demanda sem dono e sem dia** continua fora desta tela — é o que sobra da pendência 4.
- **Tela de leitura dos motivos de conclusão** — dados existem desde a entrega do apontamento obrigatório; a leitura vem quando houver o que ler.
