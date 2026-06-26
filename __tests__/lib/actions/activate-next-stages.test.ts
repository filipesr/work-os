import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
    stageDependency: { findMany: vi.fn() },
  },
  prisma: {},
}));

describe("activateNextStages preserva assignee ao ativar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz upsert de status sem incluir assigneeId no data", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // First findMany call: dependents of s1
    // Second findMany call (inside checkAllDependenciesComplete): no deps → allDepsComplete = true
    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }])
      .mockResolvedValue([]);

    // Pre-created row for s2 exists and is INACTIVE (has an assigneeId pre-set)
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "INACTIVE",
      assigneeId: "u1",
    });

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

    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }])
      .mockResolvedValue([]);

    // Row is already ACTIVE — must NOT be overwritten
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "ACTIVE",
      assigneeId: "u1",
    });

    const { activateNextStages } = await import("@/lib/actions/task");
    await activateNextStages("task1", "s1");

    // upsert must NOT have been called (stage skipped via no-regress guard)
    expect(prisma.taskActiveStage.upsert).not.toHaveBeenCalled();
  });

  it("não regride etapa já COMPLETED", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // First findMany: dependents of s1. Second findMany: NOT called (guard fires first).
    prisma.stageDependency.findMany.mockResolvedValueOnce([
      { stage: { id: "s2", dependencies: [], defaultTeam: null } },
    ]);

    // Row is already COMPLETED — must be skipped before any dep query
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "COMPLETED",
      assigneeId: null,
    });

    const { activateNextStages } = await import("@/lib/actions/task");
    await activateNextStages("task1", "s1");

    // No upsert for a COMPLETED stage
    expect(prisma.taskActiveStage.upsert).not.toHaveBeenCalled();
    // Dep query must NOT have run (findMany called exactly once — the outer call)
    expect(prisma.stageDependency.findMany).toHaveBeenCalledTimes(1);
  });

  it("INACTIVE com deps incompletas → upsert BLOCKED e aparece em blocked", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;

    // Outer findMany: s2 depends on s1 (and also on s_other, still incomplete).
    // Inner findMany (checkAllDependenciesComplete for s2): returns one unmet dep.
    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }])
      .mockResolvedValue([{ dependsOnStageId: "s_other" }]);

    // s2 row is INACTIVE — eligible for transition
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "INACTIVE",
      assigneeId: "u1",
    });

    // s_other has NOT been completed → allDepsComplete = false
    prisma.taskActiveStage.findFirst.mockResolvedValue(null);

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

    // Outer findMany: s2. Inner findMany: s2 still has an unmet dep.
    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }])
      .mockResolvedValue([{ dependsOnStageId: "s_other" }]);

    // s2 is already BLOCKED
    prisma.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      status: "BLOCKED",
      assigneeId: null,
    });

    // s_other still not complete → allDepsComplete = false
    prisma.taskActiveStage.findFirst.mockResolvedValue(null);

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

    // Outer findMany: s2. Inner findMany: no deps → allDepsComplete = true.
    prisma.stageDependency.findMany
      .mockResolvedValueOnce([{ stage: { id: "s2", dependencies: [], defaultTeam: null } }])
      .mockResolvedValue([]);

    // No pre-created row for this legacy task
    prisma.taskActiveStage.findUnique.mockResolvedValue(null);

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
