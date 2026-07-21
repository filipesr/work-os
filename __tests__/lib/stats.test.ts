import { describe, it, expect } from "vitest";
import { percentile } from "@/lib/stats";

describe("percentile", () => {
  it("empty → 0", () => expect(percentile([], 0.85)).toBe(0));
  it("single element → that element for any p", () => {
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.95)).toBe(7);
  });
  it("p50 of 1..5 → 3 (median)", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
  });
  it("interpolates between ranks (PERCENTILE.INC)", () => {
    // 1..10, p85: rank = 0.85*9 = 7.65 → sorted[7]=8 + 0.65*(9-8) = 8.65
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85)).toBeCloseTo(8.65);
  });
  it("p0 → min, p1 → max; clamps out-of-range p", () => {
    expect(percentile([4, 8, 15, 16, 23], 0)).toBe(4);
    expect(percentile([4, 8, 15, 16, 23], 1)).toBe(23);
    expect(percentile([4, 8, 15, 16, 23], 2)).toBe(23); // clamped
  });
});
