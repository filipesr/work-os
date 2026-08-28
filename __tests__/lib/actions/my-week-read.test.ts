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
