import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getTeamMemberLoad } from "@/lib/actions/team-health";

const mockAuth = vi.mocked(auth);
const db = vi.mocked(prisma, true);

function asManager() {
  mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
  db.user.findUnique.mockResolvedValue({ teams: [{ id: "team1" }] } as never);
}

describe("getTeamMemberLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-manager", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    await expect(getTeamMemberLoad()).rejects.toThrow(/Access Denied/i);
  });

  it("flags overloaded (>= ceiling), idle (<= threshold) and buckets by due date", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
    ] as never);
    const overdue = new Date(Date.now() - 5 * 864e5);
    const soon = new Date(Date.now() + 1 * 864e5);
    const far = new Date(Date.now() + 30 * 864e5);
    // Ana: 8 active stages (>= OVERLOAD_CEILING) → overloaded; Bruno: 1 → idle
    db.taskActiveStage.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, () => ({ assigneeId: "a", task: { dueDate: far } })),
      { assigneeId: "a", task: { dueDate: soon } },
      { assigneeId: "a", task: { dueDate: overdue } },
      { assigneeId: "b", task: { dueDate: null } },
    ] as never);

    const rows = await getTeamMemberLoad();
    const ana = rows.find((r) => r.userId === "a")!;
    const bruno = rows.find((r) => r.userId === "b")!;
    expect(ana.count).toBe(8);
    expect(ana.overloaded).toBe(true);
    expect(ana.overdue).toBe(1);
    expect(ana.dueSoon).toBe(1);
    expect(ana.onTrack).toBe(6);
    expect(bruno.count).toBe(1);
    expect(bruno.idle).toBe(true);
    expect(rows[0].userId).toBe("a"); // sorted by count desc
  });

  it("flags relative overload (> median + margin) even below ceiling", async () => {
    asManager();
    db.user.findMany.mockResolvedValue([
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
      { id: "c", name: "Caio" },
    ] as never);
    // counts: Ana 5, Bruno 0, Caio 0 → median 0; 5 >= 0 + 3 → overloaded
    db.taskActiveStage.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ assigneeId: "a", task: { dueDate: null } })) as never
    );
    const rows = await getTeamMemberLoad();
    expect(rows.find((r) => r.userId === "a")!.overloaded).toBe(true);
  });
});
