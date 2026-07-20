import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
    taskStageLog: { findMany: vi.fn() },
  },
  prisma: {},
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

const mockAuth = vi.mocked(auth);

describe("reporting auth path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCalendarTasks rejects MEMBER", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    const { getCalendarTasks } = await import("@/lib/actions/reporting");
    await expect(
      getCalendarTasks({
        weekStart: new Date(),
        weekEnd: new Date(),
      })
    ).rejects.toThrow(/Forbidden|Access Denied/i);
  });

  it("getOnTimeRate rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const { getOnTimeRate } = await import("@/lib/actions/reporting");
    await expect(getOnTimeRate({ from: new Date(), to: new Date() })).rejects.toThrow(
      /Not Authenticated|Unauthorized/i
    );
  });

  it("getTeamCurrentLoad rejects MEMBER", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "MEMBER" } } as never);
    const { getTeamCurrentLoad } = await import("@/lib/actions/reporting");
    await expect(getTeamCurrentLoad()).rejects.toThrow(/Forbidden|Access Denied/i);
  });
});

describe("getOnTimeRate calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u", role: "ADMIN" } } as never);
  });

  it("computes 75% when 3 of 4 tasks finished on time", async () => {
    const completedOnTime = (id: string) => ({
      id,
      dueDate: new Date("2026-06-20T00:00:00Z"),
      completedAt: new Date("2026-06-19T00:00:00Z"),
      activeStages: [],
    });
    const completedLate = (id: string) => ({
      id,
      dueDate: new Date("2026-06-20T00:00:00Z"),
      completedAt: new Date("2026-06-22T00:00:00Z"),
      activeStages: [],
    });

    // Current range: 3 on time + 1 late = 75%
    // Previous range: 0
    vi.mocked(prisma.task.findMany)
      .mockResolvedValueOnce([
        completedOnTime("a"),
        completedOnTime("b"),
        completedOnTime("c"),
        completedLate("d"),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const { getOnTimeRate } = await import("@/lib/actions/reporting");
    const result = await getOnTimeRate({
      from: new Date("2026-06-15"),
      to: new Date("2026-06-22"),
    });

    expect(result.overall.total).toBe(4);
    expect(result.overall.onTime).toBe(3);
    expect(result.overall.percentage).toBe(75);
    expect(result.previousPercentage).toBe(0);
  });

  it("returns 0% when no completed tasks", async () => {
    vi.mocked(prisma.task.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const { getOnTimeRate } = await import("@/lib/actions/reporting");
    const result = await getOnTimeRate({ from: new Date(), to: new Date() });

    expect(result.overall.total).toBe(0);
    expect(result.overall.percentage).toBe(0);
    expect(result.byTeam).toEqual([]);
  });
});
