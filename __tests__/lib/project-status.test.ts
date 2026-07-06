import { describe, it, expect } from "vitest";
import { computeProjectCompletion } from "@/lib/project-status";

describe("computeProjectCompletion", () => {
  it("returns empty state for 0 tasks", () => {
    expect(computeProjectCompletion([])).toEqual({
      total: 0,
      completed: 0,
      cancelled: 0,
      obsolete: 0,
      pct: 0,
      state: "empty",
    });
  });

  it("returns empty state when all tasks are cancelled", () => {
    expect(computeProjectCompletion([{ status: "CANCELLED" }, { status: "CANCELLED" }])).toEqual({
      total: 2,
      completed: 0,
      cancelled: 2,
      obsolete: 0,
      pct: 0,
      state: "empty",
    });
  });

  it("returns pending state with correct pct for a mix", () => {
    // 1 completed of 3 active = 33%
    expect(
      computeProjectCompletion([
        { status: "COMPLETED" },
        { status: "IN_PROGRESS" },
        { status: "BACKLOG" },
      ])
    ).toEqual({ total: 3, completed: 1, cancelled: 0, obsolete: 0, pct: 33, state: "pending" });
  });

  it("ignores cancelled tasks in the denominator", () => {
    // 1 completed of 2 active = 50%
    expect(
      computeProjectCompletion([
        { status: "COMPLETED" },
        { status: "CANCELLED" },
        { status: "IN_PROGRESS" },
      ])
    ).toEqual({ total: 3, completed: 1, cancelled: 1, obsolete: 0, pct: 50, state: "pending" });
  });

  it("ignores obsolete tasks in the denominator (like cancelled)", () => {
    // 1 completed of 2 active (OBSOLETE excluded) = 50%
    expect(
      computeProjectCompletion([
        { status: "COMPLETED" },
        { status: "OBSOLETE" },
        { status: "BACKLOG" },
      ])
    ).toEqual({ total: 3, completed: 1, cancelled: 0, obsolete: 1, pct: 50, state: "pending" });
  });

  it("returns completed state at 100% when all active tasks are completed", () => {
    expect(
      computeProjectCompletion([
        { status: "COMPLETED" },
        { status: "COMPLETED" },
        { status: "CANCELLED" },
        { status: "OBSOLETE" },
      ])
    ).toEqual({ total: 4, completed: 2, cancelled: 1, obsolete: 1, pct: 100, state: "completed" });
  });
});
