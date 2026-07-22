import { describe, it, expect } from "vitest";
import { assessFeasibility, idealStartOffsetDays, confidentDays } from "@/lib/forecast-feasibility";

describe("assessFeasibility", () => {
  it("unknown when no class data (p85 <= 0)", () => {
    expect(assessFeasibility(10, 0, 0)).toBe("unknown");
  });
  it("comfortable when days available >= p85", () => {
    expect(assessFeasibility(9, 4, 9)).toBe("comfortable");
    expect(assessFeasibility(12, 4, 9)).toBe("comfortable");
  });
  it("tight between p50 and p85", () => {
    expect(assessFeasibility(6, 4, 9)).toBe("tight");
    expect(assessFeasibility(4, 4, 9)).toBe("tight"); // exactly p50
  });
  it("atRisk below p50 (incl. past-due negative days)", () => {
    expect(assessFeasibility(3, 4, 9)).toBe("atRisk");
    expect(assessFeasibility(-2, 4, 9)).toBe("atRisk");
  });
});

describe("idealStartOffsetDays", () => {
  it("rounds p85 up, floored at 0", () => {
    expect(idealStartOffsetDays(8.2)).toBe(9);
    expect(idealStartOffsetDays(0)).toBe(0);
  });
});

describe("confidentDays", () => {
  it("experiente → p85; novo → p95", () => {
    expect(confidentDays(9, 14, true)).toBe(9);
    expect(confidentDays(9, 14, false)).toBe(14);
  });
});
