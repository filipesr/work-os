import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A action traduz suas mensagens; sob jsdom o next-intl resolve para o build de cliente, onde
  // `getTranslations` lança por design. Devolver a própria chave basta: estes testes afirmam o
  // MOTIVO do erro, nunca o texto.
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

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
    findUnique: vi.fn().mockResolvedValue({ assigneeId: "worker1" }),
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
    taskActiveStage: { findMany: vi.fn(), findUnique: vi.fn() },
    taskStageLog: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { revertTaskStage, getPreviousStages } from "@/lib/actions/task";

const db = prisma as unknown as {
  templateStage: { findUnique: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  taskStageLog: { findMany: ReturnType<typeof vi.fn> };
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
  // A etapa-alvo faz parte da tarefa (tem linha).
  db.taskActiveStage.findUnique.mockResolvedValue({ id: "row-target" });
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
      sourceAssigneeId: "worker1",
    });
  });

  it("captura sourceAssigneeId do assignee da etapa-alvo", async () => {
    setupValidRevert();
    tx.taskActiveStage.findUnique.mockResolvedValue({ assigneeId: "worker1" });
    await revertTaskStage("t1", "sTarget", "motivo", "INTERNAL");
    expect(tx.reworkEvent.create.mock.calls[0][0].data.sourceAssigneeId).toBe("worker1");
  });
});

// O retorno mexe justamente nas linhas que carregam o roteamento da etapa
// coringa (teamId/instructions, escolhidos na criação). Se ele recriasse a linha
// em vez de atualizá-la, a etapa voltaria órfã — fora da fila de todo mundo.
describe("revertTaskStage — preserva o que foi determinado na criação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
  });

  it("reativa a etapa-alvo por UPDATE, sem tocar em teamId nem instructions", async () => {
    setupValidRevert();
    const res = await revertTaskStage("t1", "sTarget", "brief incompleto", "INTERNAL");
    expect(res).toEqual(expect.objectContaining({ success: true }));

    const call = tx.taskActiveStage.update.mock.calls.find(
      (c) => c[0].where?.taskId_stageId?.stageId === "sTarget"
    );
    expect(call, "a etapa-alvo deve ser reativada").toBeTruthy();
    // Um `create` aqui perderia o roteamento; o `update` preserva a linha. A lista é fechada de
    // propósito: `teamId` e `instructions` NÃO podem entrar. `plannedDate`/`plannedOrder` entram
    // porque são posição na fila de uma pessoa e saem junto com o assignee — sem isso a etapa
    // revertida ficaria com dia marcado e sem dono, fora da grade e fora do poço.
    expect(Object.keys(call![0].data).sort()).toEqual([
      "assigneeId",
      "completedAt",
      "plannedDate",
      "plannedOrder",
      "status",
    ]);
    expect(call![0].data.status).toBe("ACTIVE");
    // Assignee limpo de propósito (volta ao backlog) — o TIME continua o mesmo,
    // então a etapa coringa reaparece na fila do time roteado na criação.
    expect(call![0].data.assigneeId).toBeNull();
  });

  it("reset das posteriores é por UPDATE em linha existente — não ressuscita etapa excluída", async () => {
    setupValidRevert();
    // `tx.taskActiveStage` não expõe `create`: se a reversão tentasse criar
    // linha, a chamada explodiria e a ação devolveria erro em vez de success.
    const res = await revertTaskStage("t1", "sTarget", "motivo", "INTERNAL");
    expect(res).toEqual(expect.objectContaining({ success: true }));

    // Etapa opcional deixada de fora na criação não tem linha; um updateMany
    // escopado por taskId nunca a alcança (e nada aqui cria linha nova).
    expect(tx.taskActiveStage.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.taskActiveStage.updateMany.mock.calls[0][0].where).toEqual({
      taskId: "t1",
      stage: { order: { gt: 1 } },
    });
  });
});

describe("getPreviousStages — só oferece etapa que a tarefa realmente percorreu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
  });

  it("etapa opcional excluída na criação nunca aparece como destino de retorno", async () => {
    // Posição atual: ordem 3. Logs fechados só de A (1) — B (2, opcional) ficou
    // de fora na criação, então nunca gerou linha nem log.
    db.taskActiveStage.findMany.mockResolvedValue([{ stage: { order: 3 } }]);
    db.taskStageLog.findMany.mockResolvedValue([
      { stage: { id: "A", order: 1, name: "Briefing" } },
    ]);

    const stages = await getPreviousStages("t1");
    expect(stages.map((s) => s.id)).toEqual(["A"]);
  });

  it("não oferece etapa de ordem igual ou superior à posição atual", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([{ stage: { order: 2 } }]);
    db.taskStageLog.findMany.mockResolvedValue([
      { stage: { id: "A", order: 1, name: "Briefing" } },
      { stage: { id: "B", order: 2, name: "Design" } },
      { stage: { id: "C", order: 3, name: "QC" } },
    ]);

    expect((await getPreviousStages("t1")).map((s) => s.id)).toEqual(["A"]);
  });

  it("tarefa sem etapa aberta não tem para onde voltar", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([]);
    expect(await getPreviousStages("t1")).toEqual([]);
  });
});

describe("revertTaskStage — etapa fora da tarefa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
  });

  it("recusa reverter para etapa opcional que ficou de fora na criação", async () => {
    setupValidRevert();
    db.taskActiveStage.findUnique.mockResolvedValue(null); // sem linha nesta tarefa

    const res = await revertTaskStage("t1", "sExcluida", "motivo", "INTERNAL");
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    // Recusa ANTES de escrever qualquer coisa — nada de retrabalho fantasma.
    expect(tx.reworkEvent.create).not.toHaveBeenCalled();
    expect(tx.taskActiveStage.update).not.toHaveBeenCalled();
  });
});
