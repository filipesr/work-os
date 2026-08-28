import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { applyDayReorder } from "@/lib/planning/reorder";

const DIA = new Date("2026-09-02T00:00:00Z");

function alvo(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "ana",
    plannedDate: DIA,
    plannedOrder: 2,
    scheduledStart: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.update).mockResolvedValue({} as never);
});

describe("applyDayReorder", () => {
  it("etapa de outra pessoa é recusada quando há dono exigido", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(alvo() as never);
    const r = await applyDayReorder("as1", "up", "bruno");
    expect(r).toEqual({ problem: "notYours" });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("sem dono exigido (mesa do gestor), a mesma etapa é aceita", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(alvo() as never);
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as0", plannedOrder: 1, scheduledStart: null },
      { id: "as1", plannedOrder: 2, scheduledStart: null },
    ] as never);
    const r = await applyDayReorder("as1", "up");
    expect(r).toEqual({ ok: true });
    expect(prisma.taskActiveStage.update).toHaveBeenCalledTimes(2);
    const escritas = new Map(
      vi.mocked(prisma.taskActiveStage.update).mock.calls.map((c) => {
        const arg = c[0] as { where: { id: string }; data: { plannedOrder: number } };
        return [arg.where.id, arg.data.plannedOrder];
      })
    );
    // Números DIFERENTES: troca simples — cada um recebe o valor do outro.
    expect(escritas.get("as0")).toBe(2);
    expect(escritas.get("as1")).toBe(1);
  });

  it("etapa com hora marcada não entra na ordenação", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ scheduledStart: new Date("2026-09-02T14:00:00Z") }) as never
    );
    const r = await applyDayReorder("as1", "up", "ana");
    expect(r).toEqual({ problem: "scheduledStage" });
  });

  it("etapa sem dia programado não é reordenável", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ plannedDate: null }) as never
    );
    expect(await applyDayReorder("as1", "up", "ana")).toEqual({ problem: "stageNotFound" });
  });

  it("subir o primeiro não escreve nada e não é erro", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ plannedOrder: 1 }) as never
    );
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as1", plannedOrder: 1, scheduledStart: null },
      { id: "as2", plannedOrder: 2, scheduledStart: null },
    ] as never);
    const r = await applyDayReorder("as1", "up", "ana");
    expect(r).toEqual({ ok: true });
    expect(prisma.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("empate renumera o dia inteiro, agendado incluído, sem trocar ninguém de lugar sem motivo", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue(
      alvo({ id: "as3", plannedOrder: 10 }) as never
    );
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      { id: "as1", plannedOrder: 1, scheduledStart: null },
      { id: "as2", plannedOrder: 5, scheduledStart: new Date("2026-09-02T14:00:00Z") },
      { id: "as3", plannedOrder: 10, scheduledStart: null },
      { id: "as4", plannedOrder: 10, scheduledStart: null },
    ] as never);

    const r = await applyDayReorder("as3", "down", "ana");
    expect(r).toEqual({ ok: true });

    const escritas = new Map(
      vi.mocked(prisma.taskActiveStage.update).mock.calls.map((c) => {
        const arg = c[0] as { where: { id: string }; data: { plannedOrder: number } };
        return [arg.where.id, arg.data.plannedOrder];
      })
    );
    // as3 desceu para depois de as4 — o que a seta prometeu.
    expect(escritas.get("as4")).toBeLessThan(escritas.get("as3") as number);
    // O agendado continua entre as1 e o par trocado: renumerar só os movíveis o faria saltar.
    // Sem fallback: se a regressão voltar (renumerar só os movíveis), as2 não é escrito e
    // `escritas.get("as2")` é `undefined` — o teste tem de falhar nesse caso, não passar por acaso.
    expect(escritas.get("as2")).toBe(2);
  });
});
