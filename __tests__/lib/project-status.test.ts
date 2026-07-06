import { describe, it, expect } from "vitest";
import { computeProjectCompletion } from "@/lib/project-status";

describe("computeProjectCompletion", () => {
  it("returns empty state for 0 tasks", () => {
    const result = computeProjectCompletion([]);
    expect(result).toEqual({
      total: 0,
      completed: 0,
      cancelled: 0,
      pct: 0,
      state: "empty",
    });
  });

  it("returns empty state when all tasks are cancelled", () => {
    const result = computeProjectCompletion([{ status: "CANCELLED" }, { status: "CANCELLED" }]);
    expect(result).toEqual({
      total: 2,
      completed: 0,
      cancelled: 2,
      pct: 0,
      state: "empty",
    });
  });

  it("returns pending state with correct pct for a mix", () => {
    const result = computeProjectCompletion([
      { status: "COMPLETED" },
      { status: "IN_PROGRESS" },
      { status: "BACKLOG" },
    ]);
    // 1 completed of 3 non-cancelled = 33%
    expect(result).toEqual({
      total: 3,
      completed: 1,
      cancelled: 0,
      pct: 33,
      state: "pending",
    });
  });

  it("ignores cancelled tasks in the denominator", () => {
    const result = computeProjectCompletion([
      { status: "COMPLETED" },
      { status: "CANCELLED" },
      { status: "IN_PROGRESS" },
    ]);
    // 1 completed of 2 non-cancelled = 50%
    expect(result).toEqual({
      total: 3,
      completed: 1,
      cancelled: 1,
      pct: 50,
      state: "pending",
    });
  });

  it("returns completed state at 100% when all non-cancelled tasks are completed", () => {
    const result = computeProjectCompletion([
      { status: "COMPLETED" },
      { status: "COMPLETED" },
      { status: "CANCELLED" },
    ]);
    expect(result).toEqual({
      total: 3,
      completed: 2,
      cancelled: 1,
      pct: 100,
      state: "completed",
    });
  });
});
