import { describe, it, expect } from "vitest";
import {
  formatAge,
  loadMeter,
  medianMarkerPct,
  stageAgingRatio,
  dependencyRiskLevel,
} from "@/lib/team-health-format";

describe("dependencyRiskLevel", () => {
  it("0–1 pending → low", () => {
    expect(dependencyRiskLevel(0)).toBe("low");
    expect(dependencyRiskLevel(1)).toBe("low");
  });
  it("2 pending → medium", () => expect(dependencyRiskLevel(2)).toBe("medium"));
  it("3+ pending → high", () => {
    expect(dependencyRiskLevel(3)).toBe("high");
    expect(dependencyRiskLevel(7)).toBe("high");
  });
});

describe("stageAgingRatio", () => {
  const now = Date.now();
  it("1.0 when age equals the SLA", () => {
    const activatedAt = new Date(now - 24 * 3.6e6); // 24h ago
    expect(stageAgingRatio(activatedAt, 24, now)).toBeCloseTo(1, 5);
  });
  it("2.0 when age is twice the SLA", () => {
    const activatedAt = new Date(now - 48 * 3.6e6);
    expect(stageAgingRatio(activatedAt, 24, now)).toBeCloseTo(2, 5);
  });
});

describe("formatAge", () => {
  it("hours only under a day", () => expect(formatAge(5)).toBe("5h"));
  it("days and hours", () => expect(formatAge(50)).toBe("2d 2h"));
  it("whole days", () => expect(formatAge(48)).toBe("2d"));
});

describe("loadMeter", () => {
  const ceiling = 8;
  it("idle tier + 0% fill when no WIP", () => {
    expect(loadMeter({ count: 0, overloaded: false }, ceiling)).toEqual({
      fillPct: 0,
      tier: "idle",
    });
  });
  it("healthy tier below 75% of the ceiling", () => {
    const m = loadMeter({ count: 3, overloaded: false }, ceiling);
    expect(m.tier).toBe("healthy");
    expect(m.fillPct).toBeCloseTo(37.5);
  });
  it("high tier at/above 75% of the ceiling", () => {
    expect(loadMeter({ count: 6, overloaded: false }, ceiling).tier).toBe("high");
  });
  it("overloaded tier wins regardless of count; fill clamps to 100%", () => {
    const m = loadMeter({ count: 20, overloaded: true }, ceiling);
    expect(m.tier).toBe("overloaded");
    expect(m.fillPct).toBe(100);
  });
  it("guards a non-positive ceiling", () => {
    expect(loadMeter({ count: 2, overloaded: false }, 0).fillPct).toBe(100);
  });
});

describe("medianMarkerPct", () => {
  it("positions the median on the 0..ceiling scale", () => {
    expect(medianMarkerPct(4, 8)).toBe(50);
  });
  it("clamps to 100% when median exceeds the ceiling", () => {
    expect(medianMarkerPct(12, 8)).toBe(100);
  });
});
