import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
    stageDependency: { findMany: vi.fn() },
  },
  prisma: {},
}));

// Readiness is derived from each dependent stage's own `dependencies` (already
// loaded by the dependents query) checked against the set of COMPLETED stages.
// Both the COMPLETED set and the pre-created dependent rows are batch-loaded via
// taskActiveStage.findMany (two calls, in order) — see activateNextStages. The
// mocks below feed those two inputs with mockResolvedValueOnce, in call order:
//   1st findMany → COMPLETED set   2nd findMany → existing dependent rows

describe("activateNextStages preserva assignee ao ativar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz upsert de status sem incluir assigneeId no data", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // Dependents of s1: s2 with no remaining prerequisites → ACTIVE.
    prisma.stageDependency.findMany.mockResolvedValue([
      { stage: { id: "s2", dependencies: [], defaultTeam: null } },
    ]);
    // 1st findMany = completed set (s1 just completed); 2nd = existing rows.
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([{ stageId: "s2", status: "INACTIVE" }]);

    const { activateNextStages } = await import("@/lib/actions/task");
    await activateNextStages("task1", "s1");

    // Implementation must call upsert (not create) and the update branch must
    // contain ONLY { status: "ACTIVE" } — never assigneeId — to preserve
    // whatever assignee was set during task creation.
    const upsertCall = prisma.taskActiveStage.upsert.mock.calls.at(-1)?.[0];
    expect(upsertCall?.update).toEqual({ status: "ACTIVE" }); // NÃO contém assigneeId
  });

  it("não regride etapa já ACTIVE", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    prisma.stageDependency.findMany.mockResolvedValue([
      { stage: { id: "s2", dependencies: [], defaultTeam: null } },
    ]);
    // Row is already ACTIVE — must NOT be overwritten
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([{ stageId: "s2", status: "ACTIVE" }]);

    const { activateNextStages } = await import("@/lib/actions/task");
    await activateNextStages("task1", "s1");

    // upsert must NOT have been called (stage skipped via no-regress guard)
    expect(prisma.taskActiveStage.upsert).not.toHaveBeenCalled();
  });

  it("não regride etapa já COMPLETED", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // Dependents of s1.
    prisma.stageDependency.findMany.mockResolvedValue([
      { stage: { id: "s2", dependencies: [], defaultTeam: null } },
    ]);
    // Row is already COMPLETED — must be skipped
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([{ stageId: "s2", status: "COMPLETED" }]);

    const { activateNextStages } = await import("@/lib/actions/task");
    await activateNextStages("task1", "s1");

    // No upsert for a COMPLETED stage
    expect(prisma.taskActiveStage.upsert).not.toHaveBeenCalled();
    // Only the outer dependents query runs (readiness no longer queries deps).
    expect(prisma.stageDependency.findMany).toHaveBeenCalledTimes(1);
  });

  it("INACTIVE com deps incompletas → upsert BLOCKED e aparece em blocked", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // s2 depends on s1 (just completed) AND s_other (still incomplete).
    prisma.stageDependency.findMany.mockResolvedValue([
      {
        stage: {
          id: "s2",
          dependencies: [{ dependsOnStageId: "s1" }, { dependsOnStageId: "s_other" }],
          defaultTeam: null,
        },
      },
    ]);
    // Only s1 is complete — s_other is not. s2 row is INACTIVE (eligible).
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([{ stageId: "s2", status: "INACTIVE" }]);

    const { activateNextStages } = await import("@/lib/actions/task");
    const result = await activateNextStages("task1", "s1");

    // upsert must have been called with update: { status: "BLOCKED" }
    const upsertCall = prisma.taskActiveStage.upsert.mock.calls.at(-1)?.[0];
    expect(upsertCall?.update).toEqual({ status: "BLOCKED" });
    expect(upsertCall?.create).toEqual({ taskId: "task1", stageId: "s2", status: "BLOCKED" });

    // Stage must appear in blocked, not activated
    expect(result.blocked).toHaveLength(1);
    expect(result.activated).toHaveLength(0);
  });

  it("BLOCKED→BLOCKED: sem mudança de estado — upsert NÃO chamado, não aparece em blocked", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // s2 still has an unmet dep (s_other).
    prisma.stageDependency.findMany.mockResolvedValue([
      {
        stage: {
          id: "s2",
          dependencies: [{ dependsOnStageId: "s1" }, { dependsOnStageId: "s_other" }],
          defaultTeam: null,
        },
      },
    ]);
    // s2 is already BLOCKED
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([{ stageId: "s2", status: "BLOCKED" }]);

    const { activateNextStages } = await import("@/lib/actions/task");
    const result = await activateNextStages("task1", "s1");

    // No upsert — no spurious write
    expect(prisma.taskActiveStage.upsert).not.toHaveBeenCalled();
    // Not pushed to either array
    expect(result.blocked).toHaveLength(0);
    expect(result.activated).toHaveLength(0);
  });

  it("sem linha pré-criada (null) → upsert com create sem assigneeId", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // s2 has no remaining prerequisites → ACTIVE.
    prisma.stageDependency.findMany.mockResolvedValue([
      { stage: { id: "s2", dependencies: [], defaultTeam: null } },
    ]);
    // No pre-created row for this legacy task (existing rows empty).
    prisma.taskActiveStage.findMany
      .mockResolvedValueOnce([{ stageId: "s1" }])
      .mockResolvedValueOnce([]);

    const { activateNextStages } = await import("@/lib/actions/task");
    const result = await activateNextStages("task1", "s1");

    const upsertCall = prisma.taskActiveStage.upsert.mock.calls.at(-1)?.[0];
    // create branch must NOT include assigneeId
    expect(upsertCall?.create).toEqual({ taskId: "task1", stageId: "s2", status: "ACTIVE" });
    expect(upsertCall?.create).not.toHaveProperty("assigneeId");
    // update branch must also not include assigneeId
    expect(upsertCall?.update).toEqual({ status: "ACTIVE" });

    // Stage appears in activated
    expect(result.activated).toHaveLength(1);
  });
});
