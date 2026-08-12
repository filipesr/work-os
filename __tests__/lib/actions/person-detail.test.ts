import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireSelfOrManager: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { requireSelfOrManager } from "@/lib/permissions";
import { getPersonActiveStages, getPersonTimeLogs } from "@/lib/actions/person-metrics";
import { AGING_ALERT_RATIO, DEFAULT_SLA_HOURS } from "@/lib/actions/team-health";

const authGuard = vi.mocked(requireSelfOrManager);

const db = prisma as unknown as {
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  timeLog: { findMany: ReturnType<typeof vi.fn> };
};

const HOUR = 3.6e6;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);

const stageRow = (over: Record<string, unknown> = {}) => ({
  id: "as1",
  activatedAt: hoursAgo(10),
  task: { id: "t1", title: "Arte do carrossel" },
  stage: { name: "Design", expectedDurationHours: 24, template: { name: "Post Carrossel" } },
  ...over,
});

describe("getPersonActiveStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("é fail-closed: autoriza antes de ler", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([]);
    await getPersonActiveStages("u1");
    expect(authGuard).toHaveBeenCalledWith("u1");
  });

  it("resolve o envelhecimento por etapa e ordena a mais antiga primeiro", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([stageRow()]);
    const rows = await getPersonActiveStages("u1");

    // 10h de idade num SLA de 24h → ~0,42 (longe do alerta).
    expect(rows[0].agingRatio).toBeCloseTo(10 / 24, 2);
    expect(rows[0].agingRatio).toBeLessThan(AGING_ALERT_RATIO);
    expect(db.taskActiveStage.findMany.mock.calls[0][0].orderBy).toEqual({ activatedAt: "asc" });
  });

  it("marca como envelhecida a etapa que passou do SLA", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ activatedAt: hoursAgo(48), stage: { ...stageRow().stage } }),
    ]);
    const rows = await getPersonActiveStages("u1");
    expect(rows[0].agingRatio).toBeGreaterThanOrEqual(AGING_ALERT_RATIO);
  });

  it("cai no SLA padrão quando a etapa não define duração esperada", async () => {
    // Sem fallback, etapas sem SLA dariam divisão por null e sumiriam do sinal.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({
        activatedAt: hoursAgo(DEFAULT_SLA_HOURS),
        stage: { name: "Revisão", expectedDurationHours: null, template: { name: "LP" } },
      }),
    ]);
    const rows = await getPersonActiveStages("u1");
    expect(rows[0].agingRatio).toBeCloseTo(1, 2);
  });

  it("só considera etapas ACTIVE atribuídas à pessoa", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([]);
    await getPersonActiveStages("u1");
    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toEqual({
      assigneeId: "u1",
      status: "ACTIVE",
    });
  });
});

describe("getPersonTimeLogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("é fail-closed: autoriza antes de ler", async () => {
    db.timeLog.findMany.mockResolvedValue([]);
    await getPersonTimeLogs("u1");
    expect(authGuard).toHaveBeenCalledWith("u1");
  });

  it("traz os mais recentes primeiro, respeitando o limite", async () => {
    db.timeLog.findMany.mockResolvedValue([]);
    await getPersonTimeLogs("u1", 5);
    const arg = db.timeLog.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ logDate: "desc" });
    expect(arg.take).toBe(5);
    expect(arg.where).toEqual({ userId: "u1" });
  });

  it("tolera registro sem etapa (stageId é opcional no schema)", async () => {
    db.timeLog.findMany.mockResolvedValue([
      {
        id: "tl1",
        logDate: new Date("2026-08-01"),
        hoursSpent: 3.5,
        description: null,
        task: { title: "Vídeo institucional" },
        stage: null,
      },
    ]);
    const rows = await getPersonTimeLogs("u1");
    expect(rows[0].stageName).toBeNull();
    expect(rows[0].taskTitle).toBe("Vídeo institucional");
    expect(rows[0].hoursSpent).toBe(3.5);
  });
});
