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
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: 40,
      teams: [{ id: "time1" }, { id: "time2" }],
    } as never);
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: Record<string, unknown> }).where;
    expect(where.assigneeId).toBeNull();
    expect(where.status).toBe("ACTIVE");
    // `stageTeamWhere` sempre devolve um `OR` — checar só que ele existe passaria mesmo se a
    // implementação enviasse os times errados. A prova real é que os IDS dentro dele são os da
    // PESSOA: `stageTeamWhere` monta um OR que alcança a etapa coringa (teamId nulo, time herdado
    // do modelo). Sem ele, filtrar por `teamId` puro perderia justamente essas.
    expect(where.OR).toEqual([
      { teamId: { in: ["time1", "time2"] } },
      { teamId: null, stage: { defaultTeamId: { in: ["time1", "time2"] } } },
    ]);
  });

  it("pessoa sem time nenhum não vê nada no poço — não há trabalho que ela possa assumir", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: 40,
      teams: [],
    } as never);
    const semana = await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: { OR: Array<Record<string, unknown>> } }).where;
    // `stageTeamWhere([])` não casa com nada — é o mesmo fragmento que uma pessoa COM time recebe,
    // só que com a lista de ids vazia.
    expect(where.OR).toEqual([
      { teamId: { in: [] } },
      { teamId: null, stage: { defaultTeamId: { in: [] } } },
    ]);
    expect(semana.pool).toEqual([]);
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

  it("o reconhecimento aparece quando a semana em tela supera a mediana das anteriores", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        // Quatro semanas anteriores, uma etapa concluída em cada — mediana 1, amostra suficiente
        // (PACE_MIN_WEEKS = 4).
        { completedAt: new Date("2026-08-31T12:00:00Z") },
        { completedAt: new Date("2026-08-25T12:00:00Z") },
        { completedAt: new Date("2026-08-18T12:00:00Z") },
        { completedAt: new Date("2026-08-11T12:00:00Z") },
        // Semana em tela: três — acima da mediana das anteriores.
        { completedAt: new Date("2026-09-08T12:00:00Z") },
        { completedAt: new Date("2026-09-09T12:00:00Z") },
        { completedAt: new Date("2026-09-10T12:00:00Z") },
      ] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.praise).toBe(true);
  });

  it("completedAt é instante real: conclusão de sábado à noite em SP não pode sumir na borda da consulta", async () => {
    // `completedAt` é gravado com `new Date()` (instante real) — diferente de `plannedDate`, que é
    // gravado como representação SP-local. 22h de sábado em São Paulo é 01h de domingo em UTC: se a
    // consulta usasse a borda ingênua (sábado 23:59:59Z, a mesma de `plannedDate`), a linha seria
    // descartada ANTES de chegar ao agrupamento, e uma conclusão legítima sumiria da contagem. A
    // prova é na CONSULTA — os valores `gte`/`lte` que chegam ao `findMany` das concluídas —, não
    // só no resultado, porque um mock de Prisma não filtra sozinho.
    const concluidaSabadoNoite = new Date("2026-09-13T01:00:00Z");
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ completedAt: concluidaSabadoNoite }] as never);

    await getMyWeek(SEGUNDA);

    const where = (chamadas()[2] as { where: { completedAt: { gte: Date; lte: Date } } }).where;
    // A borda de cima é o instante real equivalente a domingo 23:59:59 em São Paulo — não sábado
    // 23:59:59Z, que teria descartado `concluidaSabadoNoite` da consulta.
    expect(where.completedAt.lte.toISOString()).toBe("2026-09-14T02:59:59.000Z");
    expect(where.completedAt.gte.toISOString()).toBe("2026-07-13T03:00:00.000Z");
    expect(concluidaSabadoNoite.getTime()).toBeGreaterThanOrEqual(where.completedAt.gte.getTime());
    expect(concluidaSabadoNoite.getTime()).toBeLessThanOrEqual(where.completedAt.lte.getTime());
  });
});
