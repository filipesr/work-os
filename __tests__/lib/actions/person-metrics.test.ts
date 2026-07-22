import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireSelfOrManager: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn(), count: vi.fn() },
    timeLog: { aggregate: vi.fn() },
    user: { findUnique: vi.fn() },
    reworkEvent: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
  getPersonQuality,
  getPersonReworkEvents,
} from "@/lib/actions/person-metrics";

const db = prisma as unknown as {
  taskActiveStage: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  timeLog: { aggregate: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  reworkEvent: { findMany: ReturnType<typeof vi.fn> };
};

describe("getPersonThroughputSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("buckets completed stages into weekly counts (length = weeks)", async () => {
    const DAY = 8.64e7;
    const now = Date.now();
    // one completion ~3 days ago (this week), one ~10 days ago (last week)
    db.taskActiveStage.findMany.mockResolvedValue([
      { completedAt: new Date(now - 3 * DAY) },
      { completedAt: new Date(now - 10 * DAY) },
    ]);
    const rows = await getPersonThroughputSeries("u1", 4);
    expect(rows).toHaveLength(4);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(2);
    // most recent bucket (last) has the 3-day-ago completion
    expect(rows[rows.length - 1].count).toBe(1);
  });
});

describe("getPersonWorkload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts WIP and aging (stageAgingRatio >= 1)", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6);
    db.taskActiveStage.findMany.mockResolvedValue([
      { activatedAt: hoursAgo(100), stage: { expectedDurationHours: 24 } }, // ratio ~4 → aging
      { activatedAt: hoursAgo(1), stage: { expectedDurationHours: 72 } }, // fresh → not aging
    ]);
    expect(await getPersonWorkload("u1")).toEqual({ wip: 2, aging: 1 });
  });
});

describe("getPersonUtilization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes utilization via utilizationRatio; null capacity → null", async () => {
    const from = new Date(Date.now() - 14 * 8.64e7); // 2 weeks
    const to = new Date();
    db.timeLog.aggregate.mockResolvedValue({ _sum: { hoursSpent: 60 } });
    db.user.findUnique.mockResolvedValue({ weeklyCapacityHours: 40 });
    const r = await getPersonUtilization("u1", { from, to });
    expect(r.hours).toBe(60);
    expect(r.weeklyCapacityHours).toBe(40);
    expect(r.utilization).toBeCloseTo(0.75, 1); // 60 / (40*2)

    db.user.findUnique.mockResolvedValue({ weeklyCapacityHours: null });
    const r2 = await getPersonUtilization("u1", { from, to });
    expect(r2.utilization).toBeNull();
  });
});

describe("getPersonQuality", () => {
  beforeEach(() => vi.clearAllMocks());
  it("FTR = 1 − defeitos/concluídas; split interno/cliente; null se 0 concluídas", async () => {
    // precisa de count (completed) e findMany (defect returns) mockados
    (db as any).taskActiveStage.count = vi.fn().mockResolvedValue(4);
    (db as any).reworkEvent = { findMany: vi.fn().mockResolvedValue([{ kind: "CLIENT" }]) };
    const r = await getPersonQuality("u1", { from: new Date(0), to: new Date() });
    expect(r).toEqual({
      completed: 4,
      defectReturns: 1,
      firstTimeRight: 0.75,
      internal: 0,
      client: 1,
    });
  });
});

describe("getPersonReworkEvents", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lista retornos da pessoa (sourceAssigneeId), newest first, todas as classes", async () => {
    (db as any).reworkEvent = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "r1",
          at: new Date(0),
          kind: "INTERNAL",
          reason: "x",
          reworkClass: null,
          sourceStage: { name: "Design" },
          task: { title: "Arte 1" },
        },
      ]),
    };
    const rows = await getPersonReworkEvents("u1", 20);
    const arg = (db as any).reworkEvent.findMany.mock.calls[0][0];
    expect(arg.where.sourceAssigneeId).toBe("u1");
    expect(rows[0]).toMatchObject({
      id: "r1",
      taskTitle: "Arte 1",
      sourceStageName: "Design",
      reworkClass: null,
    });
  });
});
