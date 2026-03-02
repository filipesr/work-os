import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Use fake timers to control time
    vi.useFakeTimers();
  });

  it("allows requests within the limit", () => {
    const result = rateLimit("test-1", { limit: 5, windowInSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining requests", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit("test-2", { limit: 5, windowInSeconds: 60 });
    }
    const result = rateLimit("test-2", { limit: 5, windowInSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit("test-3", { limit: 5, windowInSeconds: 60 });
    }
    const result = rateLimit("test-3", { limit: 5, windowInSeconds: 60 });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the time window", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit("test-4", { limit: 5, windowInSeconds: 60 });
    }

    // Blocked
    expect(rateLimit("test-4", { limit: 5, windowInSeconds: 60 }).success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    const result = rateLimit("test-4", { limit: 5, windowInSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks different identifiers separately", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit("user-a", { limit: 5, windowInSeconds: 60 });
    }

    // user-a is blocked
    expect(rateLimit("user-a", { limit: 5, windowInSeconds: 60 }).success).toBe(false);

    // user-b should still be allowed
    expect(rateLimit("user-b", { limit: 5, windowInSeconds: 60 }).success).toBe(true);
  });
});
