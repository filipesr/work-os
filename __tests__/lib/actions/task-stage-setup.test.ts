import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A ação devolve a CHAVE como mensagem; o teste afirma o motivo, não o texto.
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));

const tx = {
  taskActiveStage: {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({}),
  },
  stageTransition: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn() },
  taskStageLog: {
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { findUnique: vi.fn() },
    templateStage: { findMany: vi.fn() },
    team: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { updateTaskStageSetup } from "@/lib/actions/task-stage-setup";

const db = prisma as unknown as {
  task: { findUnique: ReturnType<typeof vi.fn> };
  templateStage: { findMany: ReturnType<typeof vi.fn> };
  team: { findMany: ReturnType<typeof vi.fn> };
};

// s1 obrigatória com time no template; s2 OPCIONAL e coringa; s3 obrigatória.
const TEMPLATE = [
  {
    id: "s1",
    optional: false,
    defaultTeamId: "tA",
    defaultTeam: { members: [{ id: "uA" }] },
  },
  { id: "s2", optional: true, defaultTeamId: null, defaultTeam: null },
  {
    id: "s3",
    optional: false,
    defaultTeamId: "tA",
    defaultTeam: { members: [{ id: "uA" }] },
  },
];

function virginTask(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1",
    status: "BACKLOG",
    startedAt: null,
    projectId: "p1",
    workflowTemplateId: "tpl",
    activeStages: [
      { stageId: "s1", status: "ACTIVE", assigneeId: null },
      { stageId: "s3", status: "INACTIVE", assigneeId: null },
    ],
    ...over,
  };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  fd.append("taskId", "t1");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function createdFor(stageId: string) {
  return tx.taskActiveStage.create.mock.calls
    .map((c) => c[0].data as Record<string, unknown>)
    .find((d) => d.stageId === stageId);
}
function updatedFor(stageId: string) {
  return tx.taskActiveStage.update.mock.calls
    .map((c) => c[0])
    .find((a) => a.where?.taskId_stageId?.stageId === stageId)?.data as
    | Record<string, unknown>
    | undefined;
}

describe("updateTaskStageSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
    db.templateStage.findMany.mockResolvedValue(TEMPLATE);
    db.team.findMany.mockResolvedValue([]);
    tx.taskStageLog.findFirst.mockResolvedValue(null);
  });

  it("recusa quando a demanda já foi iniciada, sem escrever nada", async () => {
    db.task.findUnique.mockResolvedValue(virginTask({ startedAt: new Date() }));
    const res = await updateTaskStageSetup(form({ "stage:s1": "on", "stage:s3": "on" }));
    expect(res).toEqual({ error: "locked.started" });
    expect(tx.taskActiveStage.update).not.toHaveBeenCalled();
    expect(tx.taskActiveStage.create).not.toHaveBeenCalled();
  });

  it("recusa quando alguma etapa já tem responsável", async () => {
    db.task.findUnique.mockResolvedValue(
      virginTask({
        activeStages: [{ stageId: "s1", status: "ACTIVE", assigneeId: "uA" }],
      })
    );
    const res = await updateTaskStageSetup(form({ "stage:s1": "on" }));
    expect(res).toEqual({ error: "locked.assigned" });
  });

  it("inclui etapa opcional que ficou de fora, roteando time e instrução", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    db.team.findMany.mockResolvedValue([{ id: "tB", members: [{ id: "uB" }] }]);

    const res = await updateTaskStageSetup(
      form({
        "stage:s1": "on",
        "stage:s2": "on",
        "stage:s3": "on",
        "team:s2": "tB",
        "assignee:s2": "uB",
        "instructions:s2": "Revisar o roteiro",
      })
    );
    expect(res).toEqual({ success: true });

    const s2 = createdFor("s2")!;
    expect(s2.teamId).toBe("tB");
    expect(s2.instructions).toBe("Revisar o roteiro");
    expect(s2.assigneeId).toBe("uB");
    // Não é a menor ordem incluída → não é a entrada.
    expect(s2.status).toBe("INACTIVE");
  });

  it("excluir etapa apaga linha, transições e log — a tarefa nunca a percorreu", async () => {
    db.task.findUnique.mockResolvedValue(
      virginTask({
        activeStages: [
          { stageId: "s1", status: "ACTIVE", assigneeId: null },
          { stageId: "s2", status: "INACTIVE", assigneeId: null },
          { stageId: "s3", status: "INACTIVE", assigneeId: null },
        ],
      })
    );
    const res = await updateTaskStageSetup(form({ "stage:s1": "on", "stage:s3": "on" }));
    expect(res).toEqual({ success: true });

    const where = { taskId: "t1", stageId: { in: ["s2"] } };
    expect(tx.taskActiveStage.deleteMany).toHaveBeenCalledWith({ where });
    expect(tx.stageTransition.deleteMany).toHaveBeenCalledWith({ where });
    expect(tx.taskStageLog.deleteMany).toHaveBeenCalledWith({ where });
  });

  it("etapa NÃO-opcional entra mesmo sem checkbox — ela é o processo", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    // Só s2 marcada: s1 e s3 são obrigatórias e não podem ser removidas.
    const res = await updateTaskStageSetup(form({ "stage:s2": "on" }));
    expect(res).toEqual({ success: true });
    expect(tx.taskActiveStage.deleteMany).not.toHaveBeenCalled();
    expect(createdFor("s2")).toBeTruthy();
  });

  it("recalcula a entrada quando a etapa de menor ordem muda", async () => {
    // s0 opcional e de menor ordem, hoje fora; ao incluí-la vira a entrada.
    db.templateStage.findMany.mockResolvedValue([
      { id: "s0", optional: true, defaultTeamId: "tA", defaultTeam: { members: [{ id: "uA" }] } },
      ...TEMPLATE,
    ]);
    db.task.findUnique.mockResolvedValue(virginTask());

    const res = await updateTaskStageSetup(
      form({ "stage:s0": "on", "stage:s1": "on", "stage:s3": "on" })
    );
    expect(res).toEqual({ success: true });
    expect(createdFor("s0")!.status).toBe("ACTIVE");
    // s1 era a entrada e passa a INACTIVE.
    expect(updatedFor("s1")!.status).toBe("INACTIVE");
    // O log de entrada segue a entrada nova.
    expect(tx.taskStageLog.deleteMany).toHaveBeenCalledWith({
      where: { taskId: "t1", stageId: { not: "s0" } },
    });
    expect(tx.taskStageLog.create).toHaveBeenCalledTimes(1);
  });

  it("responsável fora do time escolhido é descartado", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    db.team.findMany.mockResolvedValue([{ id: "tB", members: [{ id: "uB" }] }]);
    await updateTaskStageSetup(
      form({ "stage:s2": "on", "team:s2": "tB", "assignee:s2": "intruso" })
    );
    expect(createdFor("s2")!.assigneeId).toBeNull();
  });

  it("roteamento em etapa com time no template é ignorado — quem manda é o fluxo", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    db.team.findMany.mockResolvedValue([{ id: "tB", members: [{ id: "uB" }] }]);
    await updateTaskStageSetup(form({ "team:s1": "tB", "instructions:s1": "não entra" }));
    const s1 = updatedFor("s1")!;
    expect(s1.teamId).toBeNull();
    expect(s1.instructions).toBeNull();
  });

  it("entrada com responsável promove a demanda a IN_PROGRESS", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    await updateTaskStageSetup(form({ "assignee:s1": "uA" }));
    expect(updatedFor("s1")!.assigneeId).toBe("uA");
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "IN_PROGRESS" },
    });
    // markTaskStarted é compare-and-set: só carimba se ainda estiver nulo.
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", startedAt: null },
      data: { startedAt: expect.any(Date) },
    });
  });

  it("sem responsável na entrada, a demanda continua no backlog", async () => {
    db.task.findUnique.mockResolvedValue(virginTask());
    await updateTaskStageSetup(form({ "stage:s1": "on" }));
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(tx.task.updateMany).not.toHaveBeenCalled();
  });
});
