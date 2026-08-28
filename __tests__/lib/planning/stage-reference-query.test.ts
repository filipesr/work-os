import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences, REFERENCE_WINDOW_DAYS } from "@/lib/planning/stage-reference";

const db = prisma as unknown as {
  templateStage: { findMany: ReturnType<typeof vi.fn> };
  timeLog: { findMany: ReturnType<typeof vi.fn> };
};

function timeLog(taskId: string, hoursSpent: number, stageId = "s1") {
  return { taskId, stageId, hoursSpent };
}

// O observado vem do TimeLog — hora de TRABALHO — e não do intervalo do TaskStageLog, que é tempo
// de relógio e traz madrugada e fim de semana dentro. A tela soma este número contra a régua de 8h
// do dia e as 45h da semana; misturar as duas unidades faria a referência crescer sozinha conforme
// o histórico acumulasse, em silêncio.

describe("getStageReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.templateStage.findMany.mockResolvedValue([{ id: "s1", expectedDurationHours: 9 }]);
    db.timeLog.findMany.mockResolvedValue([]);
  });

  it("não consulta nada quando não há etapa pedida", async () => {
    expect((await getStageReferences([])).size).toBe(0);
    expect(db.timeLog.findMany).not.toHaveBeenCalled();
  });

  it("soma as horas por OCORRÊNCIA (taskId, stageId) antes do percentil", async () => {
    // O apontamento vem picado: a mesma execução da etapa rende vários lançamentos (dois dias,
    // duas pessoas). Cada demanda é uma ocorrência de 3h; cinco ocorrências dão amostra e p50 = 3.
    db.timeLog.findMany.mockResolvedValue([
      timeLog("t1", 1),
      timeLog("t1", 2),
      timeLog("t2", 1.5),
      timeLog("t2", 1.5),
      timeLog("t3", 3),
      timeLog("t4", 3),
      timeLog("t5", 3),
    ]);
    const r = await getStageReferences(["s1"]);
    expect(r.get("s1")).toEqual({ hours: 3, source: "observed" });
  });

  it("cai no declarado quando as ocorrências não chegam ao mínimo de amostra", async () => {
    // Dez lançamentos podem ser UMA execução só: contar lançamento como amostra faria uma etapa
    // virar "observada" com uma única ocorrência medida.
    db.timeLog.findMany.mockResolvedValue([
      timeLog("t1", 1),
      timeLog("t1", 1),
      timeLog("t1", 1),
      timeLog("t1", 1),
      timeLog("t1", 1),
    ]);
    const r = await getStageReferences(["s1"]);
    expect(r.get("s1")).toEqual({ hours: 9, source: "declared" });
  });

  it("limita a janela aos últimos 180 dias por logDate", async () => {
    const antes = Date.now();
    await getStageReferences(["s1"]);
    const where = db.timeLog.findMany.mock.calls[0][0].where;
    expect(where.stageId).toEqual({ in: ["s1"] });
    const gte = (where.logDate as { gte: Date }).gte.getTime();
    const esperado = antes - REFERENCE_WINDOW_DAYS * 86_400_000;
    // Tolerância de um segundo: o relógio anda entre a marcação e a chamada.
    expect(Math.abs(gte - esperado)).toBeLessThan(1000);
    expect(REFERENCE_WINDOW_DAYS).toBe(180);
  });

  it("mapeia cada stageId à sua própria referência, sem misturar as horas", async () => {
    db.templateStage.findMany.mockResolvedValue([
      { id: "s1", expectedDurationHours: 9 },
      { id: "s2", expectedDurationHours: 4 },
      { id: "s3", expectedDurationHours: null },
    ]);
    db.timeLog.findMany.mockResolvedValue([
      ...["t1", "t2", "t3", "t4", "t5"].map((t) => timeLog(t, 2, "s1")),
      ...["t1", "t2", "t3", "t4", "t5"].map((t) => timeLog(t, 8, "s2")),
    ]);
    const r = await getStageReferences(["s1", "s2", "s3"]);
    expect(r.get("s1")).toEqual({ hours: 2, source: "observed" });
    expect(r.get("s2")).toEqual({ hours: 8, source: "observed" });
    // Etapa sem apontamento e sem SLA: zero DECLARADO, nunca "etapa de graça" observada.
    expect(r.get("s3")).toEqual({ hours: 0, source: "declared" });
  });

  it("ignora lançamento sem etapa — hora da demanda inteira não descreve uma etapa", async () => {
    db.timeLog.findMany.mockResolvedValue([
      ...["t1", "t2", "t3", "t4", "t5"].map((t) => timeLog(t, 2)),
      { taskId: "t6", stageId: null, hoursSpent: 40 },
    ]);
    const r = await getStageReferences(["s1"]);
    expect(r.get("s1")).toEqual({ hours: 2, source: "observed" });
  });
});
