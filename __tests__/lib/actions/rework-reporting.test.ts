// __tests__/lib/actions/rework-reporting.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { reworkEvent: { findMany: vi.fn() }, taskStageLog: { findMany: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getReworkBySourceStage, getFirstTimeRightByStage } from "@/lib/actions/reporting";

const db = prisma as unknown as {
  reworkEvent: { findMany: ReturnType<typeof vi.fn> };
  taskStageLog: { findMany: ReturnType<typeof vi.fn> };
};

describe("getReworkBySourceStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups by source stage with internal/client split, sorted by total desc", async () => {
    db.reworkEvent.findMany.mockResolvedValue([
      { kind: "CLIENT", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "INTERNAL", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "CLIENT", sourceStage: { id: "s1", name: "Briefing", template: { name: "Arte" } } },
      { kind: "INTERNAL", sourceStage: { id: "s2", name: "Design", template: { name: "Arte" } } },
    ]);
    const rows = await getReworkBySourceStage({});
    expect(rows[0]).toEqual({
      stageId: "s1",
      stageName: "Briefing",
      templateName: "Arte",
      internal: 1,
      client: 2,
      total: 3,
    });
    expect(rows[1].stageId).toBe("s2");
    expect(rows[1].total).toBe(1);
  });

  it("conta não-classificado + DEFECT, exclui LEGITIMATE (defeito-only)", async () => {
    db.reworkEvent.findMany.mockResolvedValue([]);
    await getReworkBySourceStage({});
    const where = db.reworkEvent.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ reworkClass: null }, { reworkClass: "DEFECT" }]);
  });
});

describe("getFirstTimeRightByStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes FTR = 1 - reworkedTo/completed, clamped, worst first", async () => {
    // s1: 4 completed, 1 reworked → FTR 0.75 ; s2: 2 completed, 0 reworked → FTR 1
    db.taskStageLog.findMany.mockResolvedValue([
      ...Array.from({ length: 4 }, () => ({
        stageId: "s1",
        stage: { name: "Briefing", template: { name: "Arte" } },
      })),
      ...Array.from({ length: 2 }, () => ({
        stageId: "s2",
        stage: { name: "Design", template: { name: "Arte" } },
      })),
    ]);
    db.reworkEvent.findMany.mockResolvedValue([{ sourceStageId: "s1" }]);
    const rows = await getFirstTimeRightByStage({});
    const s1 = rows.find((r) => r.stageId === "s1")!;
    const s2 = rows.find((r) => r.stageId === "s2")!;
    expect(s1).toEqual({
      stageId: "s1",
      stageName: "Briefing",
      templateName: "Arte",
      completed: 4,
      reworkedTo: 1,
      firstTimeRight: 0.75,
    });
    expect(s2.firstTimeRight).toBe(1);
    expect(rows[0].stageId).toBe("s1"); // worst (lowest FTR) first
  });
});
