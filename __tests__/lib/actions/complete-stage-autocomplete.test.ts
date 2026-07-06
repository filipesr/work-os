import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { update: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
    },
    stageDependency: { findMany: vi.fn().mockResolvedValue([]) },
    templateStage: {
      findUnique: vi.fn().mockResolvedValue({ templateId: "tpl" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    taskStageLog: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
  },
  prisma: {},
}));

import { auth } from "@/auth";

const mockAuth = vi.mocked(auth);

function setupActiveStage(prisma: any) {
  // Admin caller → skips contribution gate.
  mockAuth.mockResolvedValue({
    user: { id: "u1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
  } as any);
  prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
  // The (last) active stage being completed.
  prisma.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "u1",
    stage: { id: "s1", name: "Etapa Final", template: {}, defaultTeam: null },
    task: { id: "task1", project: { client: {} } },
  });
  // No dependent stages → activateNextStages returns empty.
  prisma.stageDependency.findMany.mockResolvedValue([]);
  prisma.taskActiveStage.findMany.mockResolvedValue([]);
}

describe("completeStageAndAdvance auto-completes the task", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the task COMPLETED when no open stage rows remain", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;
    setupActiveStage(prisma);
    // No ACTIVE/BLOCKED/INACTIVE rows left → last stage.
    prisma.taskActiveStage.count.mockResolvedValue(0);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    const result = await completeStageAndAdvance("task1", "s1");

    expect(result).toMatchObject({ success: true });

    // count must consider ACTIVE, BLOCKED and INACTIVE as "not done yet".
    const countCall = prisma.taskActiveStage.count.mock.calls.at(-1)?.[0];
    expect(countCall?.where?.status).toEqual({ in: ["ACTIVE", "BLOCKED", "INACTIVE"] });

    // Task updated to COMPLETED with a completedAt timestamp.
    const updateCall = prisma.task.update.mock.calls.at(-1)?.[0];
    expect(updateCall?.data?.status).toBe("COMPLETED");
    expect(updateCall?.data?.completedAt).toBeInstanceOf(Date);

    // An audit comment is logged for the auto-completion.
    const comment = prisma.taskComment.create.mock.calls.at(-1)?.[0];
    expect(comment?.data?.content).toMatch(/CONCLU[IÍ]DA AUTOMATICAMENTE/i);
  });

  it("keeps the task IN_PROGRESS when open stage rows remain", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;
    setupActiveStage(prisma);
    // One stage still open.
    prisma.taskActiveStage.count.mockResolvedValue(1);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    const result = await completeStageAndAdvance("task1", "s1");

    expect(result).toMatchObject({ success: true });

    const updateCall = prisma.task.update.mock.calls.at(-1)?.[0];
    expect(updateCall?.data?.status).toBe("IN_PROGRESS");

    // No auto-completion comment when the task is not finished.
    const autoComment = prisma.taskComment.create.mock.calls.find((c: any[]) =>
      /CONCLU[IÍ]DA AUTOMATICAMENTE/i.test(c?.[0]?.data?.content ?? "")
    );
    expect(autoComment).toBeUndefined();
  });
});
