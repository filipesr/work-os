import { describe, it, expect } from "vitest";
import { formatAge, loadSegments } from "@/lib/team-health-format";

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
