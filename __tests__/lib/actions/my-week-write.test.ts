import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/planning/reorder", () => ({ applyDayReorder: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    taskActiveStage: { findUnique: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { applyDayReorder } from "@/lib/planning/reorder";
import { reorderMyDay, pullStageToMe, moveMyStageToDay } from "@/lib/actions/my-week";

/** Um dia bem à frente de "hoje" em qualquer execução: os testes não podem depender da data real. */
function amanha(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function livre(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: null,
    status: "ACTIVE",
    teamId: "time1",
    scheduledStart: null,
    stage: { defaultTeamId: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ teams: [{ id: "time1" }] } as never);
  vi.mocked(prisma.taskActiveStage.aggregate).mockResolvedValue({
    _max: { plannedOrder: 3 },
  } as never);
  vi.mocked(prisma.taskActiveStage.update).mockResolvedValue({} as never);
});

describe("reorderMyDay", () => {
  it("passa o próprio id como dono — é o que impede reordenar o dia do colega", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ ok: true } as never);
    await reorderMyDay("as1", "up");
    expect(applyDayReorder).toHaveBeenCalledWith("as1", "up", "ana");
  });

  it("traduz o problema devolvido pelo módulo de ordenação", async () => {
    vi.mocked(applyDayReorder).mockResolvedValue({ problem: "notYours" } as never);
    expect(await reorderMyDay("as1", "up")).toEqual({ error: "notYours" });
  });
});

describe("pullStageToMe", () => {
  it("assume a etapa: responsável e dia juntos, no fim da fila do dia", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    const dia = amanha();

    const r = await pullStageToMe("as1", dia);
    expect(r).toEqual({ success: true });

    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      assigneeId: string;
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.assigneeId).toBe("ana");
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    // Entra DEPOIS do que já estava: quem chega não fura a ordem que a pessoa montou.
    expect(data.plannedOrder).toBe(4);
  });

  it("recusa etapa que já tem dono", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ assigneeId: "bruno" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "alreadyAssigned" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa etapa não liberada", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ status: "INACTIVE" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "notAvailable" });
  });

  it("recusa etapa de outro time", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: "time9" }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ error: "otherTeam" });
  });

  it("etapa coringa herda o time do modelo e é assumível", async () => {
    // `teamId` nulo não quer dizer "sem time": o time efetivo vem de `stage.defaultTeamId`.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      livre({ teamId: null, stage: { defaultTeamId: "time1" } }) as never
    );
    expect(await pullStageToMe("as1", amanha())).toEqual({ success: true });
  });

  it("recusa dia no passado", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(livre() as never);
    const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(await pullStageToMe("as1", ontem)).toEqual({ error: "pastDate" });
  });

  it("recusa data malformada antes de consultar o banco", async () => {
    expect(await pullStageToMe("as1", "07/09/2026")).toEqual({ error: "invalidDate" });
    expect(prisma.taskActiveStage.findUnique).not.toHaveBeenCalled();
  });
});

describe("moveMyStageToDay", () => {
  it("muda o dia de uma etapa sua", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      scheduledStart: null,
    } as never);
    const dia = amanha();

    expect(await moveMyStageToDay("as1", dia)).toEqual({ success: true });
    const data = vi.mocked(prisma.taskActiveStage.update).mock.calls[0][0].data as {
      plannedDate: Date;
      plannedOrder: number;
    };
    expect(data.plannedDate).toEqual(new Date(`${dia}T00:00:00Z`));
    expect(data.plannedOrder).toBe(4);
  });

  it("recusa etapa de outra pessoa", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "bruno",
      scheduledStart: null,
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "notYours" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa mover etapa com hora marcada — compromisso não muda de dia por arrasto", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      scheduledStart: new Date("2026-09-10T14:00:00Z"),
    } as never);
    expect(await moveMyStageToDay("as1", amanha())).toEqual({ error: "scheduledStage" });
  });
});
