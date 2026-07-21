import { describe, it, expect } from "vitest";
import { statusDurations, flowEfficiencyRatio, type TransitionRow } from "@/lib/stage-transitions";

const H = 3.6e6; // ms per hour
const base = new Date("2026-07-01T00:00:00.000Z").getTime();
const at = (hours: number) => new Date(base + hours * H);

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
