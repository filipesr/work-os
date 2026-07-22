import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "u1", role: "ADMIN", email: "a@b.c" }),
  requireManagerOrAdmin: vi.fn(),
  getSessionUser: vi.fn(),
}));

const tx = {
  taskStageLog: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
  taskActiveStage: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  taskComment: { create: vi.fn().mockResolvedValue({}) },
  task: { update: vi.fn().mockResolvedValue({}) },
  stageTransition: {
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  },
  reworkEvent: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: { findUnique: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { revertTaskStage } from "@/lib/actions/task";

const db = prisma as unknown as {
  templateStage: { findUnique: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

function setupValidRevert() {
  // target stage order 1 (previous); current active stage order 3 (later) → revert allowed
  db.templateStage.findUnique.mockResolvedValue({
    id: "sTarget",
    order: 1,
    name: "Briefing",
    template: {},
    defaultTeam: null,
  });
  db.taskActiveStage.findMany.mockResolvedValue([
    { stageId: "sNow", assigneeId: "u1", stage: { id: "sNow", order: 3, name: "QC" } },
  ]);
  db.user.findUnique.mockResolvedValue({ role: "ADMIN", name: "Ana" });
}

describe("revertTaskStage — ReworkEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
  });

  it("rejects an invalid kind before touching the database", async () => {
    const res = await revertTaskStage("t1", "sTarget", "motivo válido", "BOGUS" as never);
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(db.templateStage.findUnique).not.toHaveBeenCalled();
  });

  it("writes a ReworkEvent with source = revertToStageId, kind and byUser", async () => {
    setupValidRevert();
    const res = await revertTaskStage("t1", "sTarget", "brief incompleto", "CLIENT");
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(tx.reworkEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.reworkEvent.create.mock.calls[0][0].data).toEqual({
      taskId: "t1",
      sourceStageId: "sTarget",
      kind: "CLIENT",
      reason: "brief incompleto",
      byUserId: "u1",
    });
  });
});
