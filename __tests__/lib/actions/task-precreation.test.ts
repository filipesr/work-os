import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {},
}));

vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(),
}));

import { createTaskStages } from "@/lib/stage-assignment-helpers";

function makeTx(stages: any[]) {
  return {
    templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
    taskActiveStage: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

const stages = [
  {
    id: "s1",
    order: 1,
    dependencies: [],
    defaultTeamId: "t1",
    defaultTeam: { members: [{ id: "u1" }] },
  },
  {
    id: "s2",
    order: 2,
    dependencies: [{ id: "d1" }],
    defaultTeamId: "t1",
    defaultTeam: { members: [{ id: "u1" }] },
  },
];

describe("createTaskStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria a etapa sem dependência como ACTIVE e a dependente como INACTIVE", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, { taskId: "task1", templateId: "tmpl1", userId: "creator" });

    const created = tx.taskActiveStage.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toEqual([
      { taskId: "task1", stageId: "s1", status: "ACTIVE", assigneeId: null },
      { taskId: "task1", stageId: "s2", status: "INACTIVE", assigneeId: null },
    ]);
  });

  it("loga apenas as etapas ACTIVE iniciais", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, { taskId: "task1", templateId: "tmpl1", userId: "creator" });
    expect(tx.taskStageLog.create).toHaveBeenCalledTimes(1);
    expect(tx.taskStageLog.create.mock.calls[0][0].data.stageId).toBe("s1");
  });

  it("aplica assignee válido e ignora assignee inválido (não-membro)", async () => {
    const tx = makeTx(stages);
    await createTaskStages(tx, {
      taskId: "task1",
      templateId: "tmpl1",
      userId: "creator",
      assignments: { s1: "u1", s2: "u9" }, // u9 não é membro -> null
    });
    const created = tx.taskActiveStage.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created[0].assigneeId).toBe("u1");
    expect(created[1].assigneeId).toBe(null);
  });
});
