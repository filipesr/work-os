import { describe, it, expect, vi } from "vitest";
import {
  recordStageTransition,
  recordStageTransitions,
  statusDurations,
  flowEfficiencyRatio,
  statusAt,
  type TransitionRow,
} from "@/lib/stage-transitions";

const H = 3.6e6; // ms per hour
const base = new Date("2026-07-01T00:00:00.000Z").getTime();
const at = (hours: number) => new Date(base + hours * H);

describe("recordStageTransition", () => {
  const makeClient = () => ({ stageTransition: { create: vi.fn().mockResolvedValue({}) } });

  it("sem data explícita, não inclui o campo `at` — o default do banco assume", async () => {
    const client = makeClient();
    await recordStageTransition(client as never, "t1", "s1", "ACTIVE");
    const data = client.stageTransition.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("at");
  });

  it("com data explícita, grava o campo `at` com a data pedida", async () => {
    const client = makeClient();
    const quando = new Date("2025-08-14T10:00:00.000Z");
    await recordStageTransition(client as never, "t1", "s1", "ACTIVE", quando);
    const data = client.stageTransition.create.mock.calls[0][0].data;
    expect(data.at).toEqual(quando);
  });
});

describe("recordStageTransitions (plural)", () => {
  // Usada em produção no reset de reversão (lib/actions/task.ts) — sem cobertura própria até
  // aqui, nem do comportamento antigo nem do `at` novo.
  const makeClient = () => ({ stageTransition: { createMany: vi.fn().mockResolvedValue({}) } });

  it("stageIds vazio: no-op, não chama createMany", async () => {
    const client = makeClient();
    await recordStageTransitions(client as never, "t1", [], "INACTIVE");
    expect(client.stageTransition.createMany).not.toHaveBeenCalled();
  });

  it("sem data explícita, não inclui o campo `at` em nenhuma linha — o default do banco assume", async () => {
    const client = makeClient();
    await recordStageTransitions(client as never, "t1", ["s1", "s2"], "INACTIVE");
    const rows = client.stageTransition.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).not.toHaveProperty("at");
  });

  it("com data explícita, grava o campo `at` com a data pedida em todas as linhas", async () => {
    const client = makeClient();
    const quando = new Date("2025-08-14T10:00:00.000Z");
    await recordStageTransitions(client as never, "t1", ["s1", "s2"], "INACTIVE", quando);
    const rows = client.stageTransition.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.at).toEqual(quando);
  });
});

describe("statusDurations", () => {
  it("empty input → all zeros", () => {
    expect(statusDurations([])).toEqual({ INACTIVE: 0, ACTIVE: 0, BLOCKED: 0, COMPLETED: 0 });
  });

  it("pairs consecutive transitions; terminal COMPLETED accrues nothing", () => {
    // INACTIVE@0 → BLOCKED@2 → ACTIVE@5 → COMPLETED@11
    const rows: TransitionRow[] = [
      { status: "INACTIVE", at: at(0) },
      { status: "BLOCKED", at: at(2) },
      { status: "ACTIVE", at: at(5) },
      { status: "COMPLETED", at: at(11) },
    ];
    const d = statusDurations(rows, at(99).getTime());
    expect(d.INACTIVE).toBe(2 * H); // 0→2
    expect(d.BLOCKED).toBe(3 * H); // 2→5
    expect(d.ACTIVE).toBe(6 * H); // 5→11
    expect(d.COMPLETED).toBe(0); // terminal — does not accrue to `now`
  });

  it("open (non-completed) final row accrues up to now", () => {
    const rows: TransitionRow[] = [
      { status: "BLOCKED", at: at(0) },
      { status: "ACTIVE", at: at(4) },
    ];
    const d = statusDurations(rows, at(10).getTime());
    expect(d.BLOCKED).toBe(4 * H); // 0→4
    expect(d.ACTIVE).toBe(6 * H); // 4→now(10)
  });

  it("tolerates out-of-order input (sorts internally)", () => {
    const rows: TransitionRow[] = [
      { status: "ACTIVE", at: at(5) },
      { status: "BLOCKED", at: at(2) },
      { status: "COMPLETED", at: at(8) },
    ];
    const d = statusDurations(rows, at(50).getTime());
    expect(d.BLOCKED).toBe(3 * H); // 2→5
    expect(d.ACTIVE).toBe(3 * H); // 5→8
    expect(d.COMPLETED).toBe(0);
  });

  it("re-block cycle (BLOCKED→ACTIVE→BLOCKED→ACTIVE) sums each period", () => {
    const rows: TransitionRow[] = [
      { status: "BLOCKED", at: at(0) },
      { status: "ACTIVE", at: at(1) },
      { status: "BLOCKED", at: at(3) },
      { status: "ACTIVE", at: at(6) },
      { status: "COMPLETED", at: at(10) },
    ];
    const d = statusDurations(rows, at(99).getTime());
    expect(d.BLOCKED).toBe((1 + 3) * H); // 0→1 and 3→6
    expect(d.ACTIVE).toBe((2 + 4) * H); // 1→3 and 6→10
  });
});

describe("statusAt", () => {
  const rows: TransitionRow[] = [
    { status: "INACTIVE", at: at(0) },
    { status: "BLOCKED", at: at(2) },
    { status: "ACTIVE", at: at(5) },
    { status: "COMPLETED", at: at(11) },
  ];

  it("null before the instance existed", () => {
    expect(statusAt(rows, at(-1).getTime())).toBeNull();
  });

  it("returns the status of the latest transition at or before t", () => {
    expect(statusAt(rows, at(0).getTime())).toBe("INACTIVE");
    expect(statusAt(rows, at(3).getTime())).toBe("BLOCKED");
    expect(statusAt(rows, at(5).getTime())).toBe("ACTIVE");
    expect(statusAt(rows, at(10).getTime())).toBe("ACTIVE");
    expect(statusAt(rows, at(50).getTime())).toBe("COMPLETED");
  });
});

describe("flowEfficiencyRatio", () => {
  it("ACTIVE ÷ (ACTIVE + BLOCKED)", () => {
    expect(flowEfficiencyRatio(6 * H, 2 * H)).toBeCloseTo(0.75);
  });

  it("null when no reached time (denominator 0) — undefined, not 0%", () => {
    expect(flowEfficiencyRatio(0, 0)).toBeNull();
  });

  it("100% when never blocked", () => {
    expect(flowEfficiencyRatio(5 * H, 0)).toBe(1);
  });
});
