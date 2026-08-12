import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { task: { findMany: vi.fn(), count: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getLeadTimeMetrics, getCycleTimePercentiles } from "@/lib/actions/reporting";

const db = vi.mocked(prisma, true);
const DAY = 8.64e7;
const ago = (d: number) => new Date(Date.now() - d * DAY);

/** Tarefa concluída com fila explícita: criada, pega depois, entregue depois. */
const task = (createdDaysAgo: number, startedDaysAgo: number | null, completedDaysAgo: number) => ({
  id: `t-${createdDaysAgo}`,
  createdAt: ago(createdDaysAgo),
  startedAt: startedDaysAgo === null ? null : ago(startedDaysAgo),
  completedAt: ago(completedDaysAgo),
});

// Três concluídas — lead / fila / cycle desenhados para não colidirem:
//   criada 10d, iniciada  8d, entregue  0d → lead 10, fila 2, cycle  8
//   criada 20d, iniciada 14d, entregue  4d → lead 16, fila 6, cycle 10
//   criada 30d, iniciada 26d, entregue 12d → lead 18, fila 4, cycle 14
// findMany devolve por completedAt desc, então a ordem é essa mesma.
const THREE = [task(10, 8, 0), task(20, 14, 4), task(30, 26, 12)];

describe("getLeadTimeMetrics — lead time e tempo de fila", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mede lead time da CRIAÇÃO à entrega (a fila está incluída)", async () => {
    db.task.findMany.mockResolvedValue(THREE as never);
    const r = await getLeadTimeMetrics();

    expect(r.count).toBe(3);
    expect(Math.round(r.medianLeadTimeDays)).toBe(16); // mediana de [10, 16, 18]
    expect(r.averageLeadTimeDays).toBeCloseTo((10 + 16 + 18) / 3, 5);
  });

  it("devolve a mediana do tempo de fila (criação → início)", async () => {
    db.task.findMany.mockResolvedValue(THREE as never);
    const r = await getLeadTimeMetrics();

    expect(Math.round(r.medianQueueTimeDays!)).toBe(4); // mediana de [2, 6, 4]
    expect(r.queueCount).toBe(3);
  });

  it("ignora na fila as tarefas sem startedAt, sem tirá-las do lead time", async () => {
    // A do meio é anterior à migração: entra no lead time, sai da fila.
    db.task.findMany.mockResolvedValue([
      task(10, 8, 0),
      task(20, null, 4),
      task(30, 26, 12),
    ] as never);
    const r = await getLeadTimeMetrics();

    expect(r.count).toBe(3); // lead time continua sobre as 3
    expect(r.queueCount).toBe(2); // fila só sobre as carimbadas
    expect(Math.round(r.medianQueueTimeDays!)).toBe(3); // mediana de [2, 4]
  });

  it("base 100% pré-migração → fila null (ausente), não zero", async () => {
    // Zero seria uma afirmação falsa ("não houve espera"); null é "não sei".
    db.task.findMany.mockResolvedValue([task(10, null, 0)] as never);
    const r = await getLeadTimeMetrics();

    expect(r.medianQueueTimeDays).toBeNull();
    expect(r.queueCount).toBe(0);
    expect(Math.round(r.medianLeadTimeDays)).toBe(10);
  });

  it("escopo vazio → zeros e fila null", async () => {
    db.task.findMany.mockResolvedValue([] as never);
    const r = await getLeadTimeMetrics();
    expect(r).toEqual({
      averageLeadTimeDays: 0,
      medianLeadTimeDays: 0,
      count: 0,
      medianQueueTimeDays: null,
      queueCount: 0,
    });
  });
});

describe("getCycleTimePercentiles — cycle time a partir do início", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mede do INÍCIO à entrega e exige startedAt na query", async () => {
    db.task.findMany.mockResolvedValue(THREE as never);
    db.task.count.mockResolvedValue(3 as never);

    const r = await getCycleTimePercentiles();

    const arg = db.task.findMany.mock.calls[0][0]!;
    expect(arg.where!.startedAt).toEqual({ not: null });
    expect(arg.select).toEqual({ startedAt: true, completedAt: true });

    // cycle = [8, 10, 14] — e não [10, 16, 18], que seria o lead time.
    expect(Math.round(r.p50)).toBe(10);
    expect(r.count).toBe(3);
  });

  it("cycle time fica ABAIXO do lead time quando há fila (o ponto da separação)", async () => {
    db.task.findMany.mockResolvedValue(THREE as never);
    db.task.count.mockResolvedValue(3 as never);
    const cycle = await getCycleTimePercentiles();

    db.task.findMany.mockResolvedValue(THREE as never);
    const lead = await getLeadTimeMetrics();

    expect(cycle.p50).toBeLessThan(lead.medianLeadTimeDays);
  });

  it("conta as concluídas sem startedAt em excludedLegacy", async () => {
    // 7 concluídas no escopo, só 3 com início carimbado → 4 ficaram de fora.
    db.task.findMany.mockResolvedValue(THREE as never);
    db.task.count.mockResolvedValue(7 as never);

    const r = await getCycleTimePercentiles();
    expect(r.count).toBe(3);
    expect(r.excludedLegacy).toBe(4);
  });

  it("nenhuma carimbada ainda → vazio, mas informa quantas ficaram de fora", async () => {
    // Estado esperado logo após a migração: a UI precisa explicar o vazio.
    db.task.findMany.mockResolvedValue([] as never);
    db.task.count.mockResolvedValue(12 as never);

    const r = await getCycleTimePercentiles();
    expect(r.count).toBe(0);
    expect(r.excludedLegacy).toBe(12);
    expect(r.lowConfidence).toBe(true);
  });

  it("o scatter usa o cycle time, não o lead time", async () => {
    db.task.findMany.mockResolvedValue(THREE as never);
    db.task.count.mockResolvedValue(3 as never);

    const r = await getCycleTimePercentiles();
    expect(Math.round(r.points[0].days)).toBe(8); // início 8d → entrega 0d
    expect(r.points).toHaveLength(3);
  });
});
