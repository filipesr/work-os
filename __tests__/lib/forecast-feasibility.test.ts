import { describe, it, expect } from "vitest";
import {
  assessFeasibility,
  idealStartOffsetDays,
  confidentDays,
  firstIncludedStageId,
} from "@/lib/forecast-feasibility";

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

describe("firstIncludedStageId", () => {
  const stages = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("é a primeira etapa quando ela está incluída", () => {
    expect(firstIncludedStageId(stages, { a: true, b: true, c: true })).toBe("a");
  });
  it("pula a primeira quando ela está desmarcada (opcional-desmarcada)", () => {
    expect(firstIncludedStageId(stages, { a: false, b: true, c: true })).toBe("b");
  });
  it("pula todas as desmarcadas até a primeira incluída", () => {
    expect(firstIncludedStageId(stages, { a: false, b: false, c: true })).toBe("c");
  });
  it("null quando nenhuma está incluída", () => {
    expect(firstIncludedStageId(stages, { a: false, b: false, c: false })).toBeNull();
  });
  it("null para preview vazio", () => {
    expect(firstIncludedStageId([], {})).toBeNull();
  });
  it("trata ausência no mapa como não-incluída", () => {
    expect(firstIncludedStageId(stages, { b: true })).toBe("b");
  });
});
