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
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { setStageWindow } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

/** Linha programada para 04/09, sem compromisso ainda. `plannedDate` é meia-noite SP codificada em
 *  UTC — a mesma convenção que `scheduleStage` grava. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: null,
    scheduledEnd: null,
    task: { priority: "MEDIUM", title: "Reels institucional" },
    stage: { name: "Gravação" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.taskActiveStage.findMany.mockResolvedValue([]);
  vi.mocked(getStageReferences).mockResolvedValue(
    new Map([["s1", { hours: 3, source: "observed" }]])
  );
});

describe("setStageWindow", () => {
  it("grava a hora como INSTANTE REAL do dia da coluna", async () => {
    // 14h em São Paulo é 17h UTC. Gravar "14:00" cru deixaria o compromisso três horas adiantado,
    // e o erro só apareceria na borda do dia — o mesmo que o comentário de `realInstant` descreve.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });

    expect(r).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: new Date("2026-09-04T17:00:00.000Z"),
      scheduledEnd: null,
    });
  });

  it("grava o fim quando informado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "16:30" });

    expect(db.taskActiveStage.update.mock.calls[0][0].data.scheduledEnd).toEqual(
      new Date("2026-09-04T19:30:00.000Z")
    );
  });

  it("startTime nulo limpa a janela inteira", async () => {
    // Desmarcar o compromisso é a mesma porta, sem uma segunda ação: o fim nunca sobrevive ao
    // início, senão sobraria uma janela sem começo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({
        scheduledStart: new Date("2026-09-04T17:00:00Z"),
        scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      })
    );

    await setStageWindow({ activeStageId: "as1", startTime: null });

    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});
