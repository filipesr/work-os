import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({ getStageReferences: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn() },
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn(),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { scheduleStage, unscheduleStage, moveStageOrder } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
};

describe("scheduleStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.taskActiveStage.aggregate.mockResolvedValue({ _max: { plannedOrder: 2 } });
  });

  it("programa etapa livre: grava dia, ordem no fim e o responsável", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    const r = await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" });
    expect(r).toEqual({ success: true });
    const data = db.taskActiveStage.update.mock.calls[0][0].data;
    expect(data.assigneeId).toBe("u1");
    expect(data.plannedOrder).toBe(3); // entra no fim do dia
    expect(formatUTC(data.plannedDate)).toBe("2026-08-31");
  });

  it("programa etapa AINDA NÃO liberada — programar não é executar", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "INACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa etapa concluída", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "COMPLETED",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "completedStage",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa puxar etapa que já é de outra pessoa", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "outro",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "alreadyAssigned",
    });
  });

  it("reprogramar quem JÁ é da pessoa é permitido — é mover de dia", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-09-01" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa data malformada, sem escrever", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    expect(await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "31/08" })).toEqual({
      error: "invalidDate",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

describe("unscheduleStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limpa dia e ordem, e devolve a etapa ao poço", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(await unscheduleStage("as1")).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      plannedDate: null,
      plannedOrder: null,
      assigneeId: null,
    });
  });
});

describe("moveStageOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("troca a ordem com o vizinho de cima", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 2,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as1", plannedOrder: 1 },
      { id: "as2", plannedOrder: 2 },
    ]);
    expect(await moveStageOrder("as2", "up")).toEqual({ success: true });
    // Duas escritas: cada um assume a posição do outro.
    expect(db.taskActiveStage.update).toHaveBeenCalledTimes(2);
  });

  it("subir o primeiro não faz nada e não é erro", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
    });
    db.taskActiveStage.findMany.mockResolvedValue([{ id: "as1", plannedOrder: 1 }]);
    expect(await moveStageOrder("as1", "up")).toEqual({ success: true });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

function formatUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
