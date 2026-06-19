import { describe, it, expect } from "vitest";
import { parsePage, paginate, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

describe("parsePage", () => {
  it("returns 1 by default for missing param", () => {
    expect(parsePage(undefined)).toBe(1);
  });

  it("parses valid positive integer", () => {
    expect(parsePage("3")).toBe(3);
  });

  it("returns fallback for zero", () => {
    expect(parsePage("0")).toBe(1);
  });

  it("returns fallback for negative", () => {
    expect(parsePage("-5")).toBe(1);
  });

  it("returns fallback for non-numeric", () => {
    expect(parsePage("abc")).toBe(1);
  });

  it("uses first item from array", () => {
    expect(parsePage(["2", "9"])).toBe(2);
  });

  it("respects custom fallback", () => {
    expect(parsePage(undefined, 7)).toBe(7);
  });
});

describe("paginate", () => {
  it("wraps items with metadata", () => {
    const result = paginate(["a", "b"], 50, 2, 25);
    expect(result).toEqual({
      items: ["a", "b"],
      total: 50,
      page: 2,
      pageSize: 25,
      totalPages: 2,
    });
  });

  it("computes totalPages with ceiling", () => {
    const result = paginate([], 51, 1, 25);
    expect(result.totalPages).toBe(3);
  });

  it("totalPages is at least 1 when total=0", () => {
    const result = paginate([], 0, 1, 25);
    expect(result.totalPages).toBe(1);
  });
});

describe("DEFAULT_PAGE_SIZE", () => {
  it("is 25", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });
});
