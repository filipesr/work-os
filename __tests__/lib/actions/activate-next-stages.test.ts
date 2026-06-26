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
});
