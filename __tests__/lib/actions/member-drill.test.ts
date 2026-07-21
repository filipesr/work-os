import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
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

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getMemberActiveStages } from "@/lib/actions/member-drill";

const mockAuth = vi.mocked(auth);
const db = vi.mocked(prisma, true);

function asManager() {
  mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
  // resolveTeamIds (MANAGER path) reads the caller's teams
  db.user.findUnique.mockResolvedValue({ teams: [{ id: "team1" }] } as never);
}

describe("getMemberActiveStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-manager", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    await expect(getMemberActiveStages("x")).rejects.toThrow(/Access Denied/i);
  });

  it("fail-closed: returns [] when the target user is not in the caller's teams", async () => {
    asManager();
    db.user.findFirst.mockResolvedValue(null as never);
    expect(await getMemberActiveStages("outsider")).toEqual([]);
    expect(db.taskActiveStage.findMany).not.toHaveBeenCalled();
  });

  it("returns the member's active stages (dueDate as ISO, dueState computed)", async () => {
    asManager();
    db.user.findFirst.mockResolvedValue({ id: "ana" } as never);
    const overdue = new Date(Date.now() - 5 * 864e5);
    db.taskActiveStage.findMany.mockResolvedValue([
      { task: { id: "t1", title: "A", dueDate: overdue }, stage: { name: "Dev" } },
      { task: { id: "t2", title: "B", dueDate: null }, stage: { name: "QC" } },
    ] as never);

    const res = await getMemberActiveStages("ana");
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ taskId: "t1", stageName: "Dev", dueState: "overdue" });
    expect(res[0].dueDate).toBe(overdue.toISOString());
    expect(res[1]).toMatchObject({ taskId: "t2", dueDate: null, dueState: "none" });
  });
});
