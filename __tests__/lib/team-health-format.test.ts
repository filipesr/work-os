import { describe, it, expect } from "vitest";
import {
  formatAge,
  loadSegments,
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

describe("loadSegments", () => {
  it("splits into percentages summing to 100 when count > 0", () => {
    const segs = loadSegments({ count: 4, onTrack: 2, dueSoon: 1, overdue: 1 });
    const total = segs.reduce((s, x) => s + x.pct, 0);
    expect(Math.round(total)).toBe(100);
    expect(segs.find((s) => s.key === "overdue")!.pct).toBe(25);
  });
  it("all zero when count is 0", () => {
    const segs = loadSegments({ count: 0, onTrack: 0, dueSoon: 0, overdue: 0 });
    expect(segs.every((s) => s.pct === 0)).toBe(true);
  });
});
