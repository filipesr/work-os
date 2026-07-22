import { describe, it, expect } from "vitest";
import { mulberry32, forecastWhen, forecastHowMany } from "@/lib/monte-carlo";

describe("mulberry32", () => {
  it("is deterministic per seed and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("forecastWhen", () => {
  it("constant throughput → exact deterministic days", () => {
    // 2 items/day, backlog 10 → always 5 days regardless of RNG
    const r = forecastWhen([2, 2, 2], 10, { trials: 200, rng: mulberry32(1) })!;
    expect(r.p50).toBe(5);
    expect(r.p85).toBe(5);
    expect(r.p95).toBe(5);
  });

  it("backlog ≤ 0 → all zeros", () => {
    expect(forecastWhen([1, 2], 0)).toEqual({ p50: 0, p85: 0, p95: 0 });
  });

  it("no throughput history (all zeros) → null (cannot finish)", () => {
    expect(forecastWhen([0, 0, 0], 5)).toBeNull();
    expect(forecastWhen([], 5)).toBeNull();
  });

  it("variable throughput → p95 ≥ p85 ≥ p50 (later percentile = later date)", () => {
    const r = forecastWhen([0, 1, 3, 2, 0, 1], 40, { trials: 2000, rng: mulberry32(7) })!;
    expect(r.p95).toBeGreaterThanOrEqual(r.p85);
    expect(r.p85).toBeGreaterThanOrEqual(r.p50);
  });
});

describe("forecastHowMany", () => {
  it("constant throughput → exact count over the horizon", () => {
    // 3/day for 10 days → always 30
    const r = forecastHowMany([3, 3], 10, { trials: 200, rng: mulberry32(2) });
    expect(r.p50).toBe(30);
    expect(r.p85).toBe(30);
    expect(r.p95).toBe(30);
  });

  it("horizon 0 or no samples → zeros", () => {
    expect(forecastHowMany([1, 2], 0)).toEqual({ p50: 0, p85: 0, p95: 0 });
    expect(forecastHowMany([], 5)).toEqual({ p50: 0, p85: 0, p95: 0 });
  });
});
