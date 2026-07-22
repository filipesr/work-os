import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireSelfOrManager: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { aggregate: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
} from "@/lib/actions/person-metrics";

const db = prisma as unknown as {
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  timeLog: { aggregate: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
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
