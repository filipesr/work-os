import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(async () => ({ id: "u1" })),
  requirePresenceRead: vi.fn(),
}));
vi.mock("@/lib/presence-access", () => ({ requirePresenceRead: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));

const tx = {
  activityLog: {
    findFirst: vi.fn(),
    update: vi.fn(async (_a: unknown) => ({})),
    create: vi.fn(async (_a: unknown) => ({ id: "new-log" })),
  },
  timeLog: { create: vi.fn(async (_a: unknown) => ({})) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
    activityLog: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  prisma: {},
}));

import { startWorkOnTask } from "@/lib/actions/activity";

const PREVIOUS = {
  id: "log-prev",
  userId: "u1",
  taskId: "task-A",
  stageId: "stage-A",
  startedAt: new Date(Date.now() - 2 * 3.6e6), // 2h atrás
};

describe("startWorkOnTask — exclusividade e justificativa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem nada em curso, inicia direto (sem pedir motivo)", async () => {
    tx.activityLog.findFirst.mockResolvedValue(null);
    const res = (await startWorkOnTask("task-B", "stage-B")) as { success?: boolean };

    expect(res.success).toBe(true);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(tx.timeLog.create).not.toHaveBeenCalled();
  });

  it("iniciar a tarefa em que já está é no-op", async () => {
    tx.activityLog.findFirst.mockResolvedValue(PREVIOUS);
    const res = (await startWorkOnTask("task-A", "stage-A")) as { status?: string };

    expect(res.status).toBe("already_active");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.activityLog.update).not.toHaveBeenCalled();
  });

  it("RECUSA trocar de tarefa sem justificativa", async () => {
    // A regra é do servidor, não da UI: mesmo que o diálogo seja contornado,
    // a troca não acontece sem motivo.
    tx.activityLog.findFirst.mockResolvedValue(PREVIOUS);
    const res = (await startWorkOnTask("task-B", "stage-B")) as { needsReason?: boolean };

    expect(res.needsReason).toBe(true);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.activityLog.update).not.toHaveBeenCalled();
  });

  it("recusa também quando o motivo é só espaço em branco", async () => {
    tx.activityLog.findFirst.mockResolvedValue(PREVIOUS);
    const res = (await startWorkOnTask("task-B", "stage-B", "   ")) as { needsReason?: boolean };
    expect(res.needsReason).toBe(true);
  });

  it("com justificativa: fecha a anterior REGISTRANDO as horas e inicia a nova", async () => {
    // O bug que isso corrige: antes a anterior era fechada sem TimeLog e as
    // horas trabalhadas desapareciam.
    tx.activityLog.findFirst.mockResolvedValue(PREVIOUS);
    const res = (await startWorkOnTask("task-B", "stage-B", "cliente pediu prioridade")) as {
      success?: boolean;
    };

    expect(res.success).toBe(true);
    expect(tx.activityLog.update).toHaveBeenCalledTimes(1); // fechou a anterior
    expect(tx.timeLog.create).toHaveBeenCalledTimes(1); // e registrou as horas
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1); // abriu a nova

    const tl = tx.timeLog.create.mock.calls[0][0] as {
      data: { taskId: string; description: string; hoursSpent: number };
    };
    expect(tl.data.taskId).toBe("task-A"); // as horas são da tarefa INTERROMPIDA
    expect(tl.data.description).toBe("cliente pediu prioridade");
    expect(tl.data.hoursSpent).toBeGreaterThan(0);
  });

  it("tudo acontece na mesma transação — nunca fecha uma sem abrir a outra", async () => {
    tx.activityLog.findFirst.mockResolvedValue(PREVIOUS);
    await startWorkOnTask("task-B", "stage-B", "motivo");

    const prisma = (await import("@/lib/prisma")).default as unknown as {
      $transaction: { mock: { calls: unknown[] } };
    };
    expect(prisma.$transaction.mock.calls).toHaveLength(1);
  });

  it("exige taskId e stageId", async () => {
    const res = (await startWorkOnTask("", "stage-B")) as { error?: string };
    expect(res.error).toBeTruthy();
  });
});
