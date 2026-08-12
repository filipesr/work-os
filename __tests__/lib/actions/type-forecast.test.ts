import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { task: { findMany: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getTypeForecast } from "@/lib/actions/reporting";
import { MIN_CLASS_SAMPLES } from "@/lib/reporting-constants";

const db = vi.mocked(prisma, true);
const daysAgo = (createdOffset: number, completedOffset: number) => ({
  createdAt: new Date(Date.now() - createdOffset * 8.64e7),
  completedAt: new Date(Date.now() - completedOffset * 8.64e7),
});

describe("getTypeForecast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty class → zeros + lowConfidence", async () => {
    db.task.findMany.mockResolvedValue([] as never);
    expect(await getTypeForecast("tpl")).toEqual({
      p50: 0,
      p85: 0,
      p95: 0,
      count: 0,
      lowConfidence: true,
    });
  });

  it("filters completed tasks by workflowTemplateId", async () => {
    db.task.findMany.mockResolvedValue([daysAgo(4, 0)] as never);
    await getTypeForecast("tplX");
    const arg = db.task.findMany.mock.calls[0][0]!;
    expect(arg.where!.workflowTemplateId).toBe("tplX");
    expect(arg.where!.completedAt).toEqual({ not: null });
  });

  it("computes day percentiles and flags lowConfidence under the threshold", async () => {
    // 3 tasks, each 4 days cycle → all percentiles ~4; 3 < MIN_CLASS_SAMPLES
    db.task.findMany.mockResolvedValue([daysAgo(4, 0), daysAgo(6, 2), daysAgo(5, 1)] as never);
    const r = await getTypeForecast("tpl");
    expect(r.count).toBe(3);
    expect(Math.round(r.p50)).toBe(4);
    expect(r.lowConfidence).toBe(MIN_CLASS_SAMPLES > 3);
  });

  // Guarda de regressão sobre uma decisão deliberada: quando lead e cycle time
  // foram separados, ESTA função ficou em LEAD time (createdAt → completedAt).
  // Quem cria a demanda pergunta "de hoje até o dueDate, dá?" — a tarefa ainda
  // vai passar pela fila, então medir de startedAt subestimaria o prazo.
  it("mede da CRIAÇÃO (lead time), não do início — não filtra por startedAt", async () => {
    db.task.findMany.mockResolvedValue([daysAgo(10, 0)] as never);
    const r = await getTypeForecast("tpl");

    const arg = db.task.findMany.mock.calls[0][0]!;
    expect(arg.where).not.toHaveProperty("startedAt");
    expect(arg.select).toEqual({ createdAt: true, completedAt: true });
    // 10 dias de criação a entrega — o tempo de fila está INCLUÍDO de propósito.
    expect(Math.round(r.p50)).toBe(10);
  });
});
