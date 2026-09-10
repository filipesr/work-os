import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskCore } from "@/lib/task-create-core";

// Template com UMA etapa de entrada com time PADRÃO (defaultTeamId setado): isso
// mantém `instructions` fora do jogo (só etapas coringa aceitam instrução), então
// o fakeTx não precisa simular `task.findUnique`/`taskComment.createMany` — o
// mesmo corte que `task-precreation.test.ts` já usa.
function fakeTx() {
  const stages = [
    {
      id: "s1",
      order: 1,
      optional: false,
      defaultTeamId: "team1",
      defaultTeam: { members: [{ id: "u1" }] },
    },
  ];
  return {
    task: {
      create: vi.fn().mockResolvedValue({ id: "task1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ createdById: "u-criador" }),
    },
    templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
    team: { findMany: vi.fn().mockResolvedValue([]) },
    taskActiveStage: { create: vi.fn().mockResolvedValue({ id: "as1", instructions: null }) },
    taskStageLog: { create: vi.fn().mockResolvedValue({}) },
    stageTransition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    taskComment: { createMany: vi.fn().mockResolvedValue({}) },
  } as any;
}

const base = {
  title: "Reels institucional",
  description: null,
  priority: "MEDIUM" as const,
  dueDate: new Date("2026-12-01"),
  projectId: "p1",
  templateId: "wt1",
  userId: "u-criador",
};

describe("createTaskCore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria a demanda e as etapas, e marca iniciada quando a etapa inicial já tem dono", async () => {
    const tx = fakeTx();
    const r = await createTaskCore(tx, { ...base, assignments: { s1: "u1" } });
    expect(tx.task.create).toHaveBeenCalledOnce();
    expect(r.initialAssigned).toBe(true);
    expect(tx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IN_PROGRESS" } })
    );
  });

  it("sem dono na etapa inicial, a demanda fica em BACKLOG", async () => {
    const tx = fakeTx();
    const r = await createTaskCore(tx, { ...base });
    expect(r.initialAssigned).toBe(false);
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it("a importação manda o próprio status e a data — e eles chegam ao create", async () => {
    const tx = fakeTx();
    const quando = new Date("2025-08-14T10:00:00.000Z");
    await createTaskCore(tx, { ...base, status: "OBSOLETE", createdAt: quando });
    const data = tx.task.create.mock.calls[0][0].data;
    expect(data.status).toBe("OBSOLETE");
    expect(data.createdAt).toEqual(quando);
  });

  it("sem campos novos, o data do create sai igual ao de hoje — sem chaves extras", async () => {
    const tx = fakeTx();
    await createTaskCore(tx, { ...base });
    const data = tx.task.create.mock.calls[0][0].data;
    expect(data).toEqual({
      title: base.title,
      description: base.description,
      priority: base.priority,
      dueDate: base.dueDate,
      status: "BACKLOG",
      projectId: base.projectId,
      workflowTemplateId: base.templateId,
      createdById: base.userId,
    });
  });
});
