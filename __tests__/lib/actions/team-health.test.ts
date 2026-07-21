import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
    stageDependency: { findMany: vi.fn() },
    templateStage: { findMany: vi.fn() },
  },
}));
vi.mock("@prisma/client", () => ({
  UserRole: {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    SUPERVISOR: "SUPERVISOR",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER",
  },
}));

import { median } from "@/lib/actions/team-health";

describe("median", () => {
  it("returns 0 for empty", () => expect(median([])).toBe(0));
  it("odd length → middle", () => expect(median([3, 1, 2])).toBe(2));
  it("even length → average of middles", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});
