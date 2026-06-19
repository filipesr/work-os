import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    taskActiveStage: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
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

const mockAuth = vi.mocked(auth);

describe("server actions reject unauthenticated calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null as any);
  });

  it("getTaskById throws when unauthenticated", async () => {
    const { getTaskById } = await import("@/lib/actions/task");
    await expect(getTaskById("task-1")).rejects.toThrow(/Unauthorized/i);
  });

  it("createTask throws when unauthenticated", async () => {
    const { createTask } = await import("@/lib/actions/task");
    const fd = new FormData();
    fd.set("title", "x");
    fd.set("description", "y");
    fd.set("projectId", "p");
    fd.set("templateId", "t");
    fd.set("priority", "MEDIUM");
    await expect(createTask(fd)).rejects.toThrow(/Not Authenticated|Access Denied/i);
  });

  it("getTasks throws when unauthenticated", async () => {
    const { getTasks } = await import("@/lib/actions/task");
    await expect(getTasks()).rejects.toThrow(/Unauthorized/i);
  });

  it("completeStageAndAdvance throws when unauthenticated", async () => {
    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    await expect(completeStageAndAdvance("t", "s")).rejects.toThrow(/Unauthorized/i);
  });

  it("getMyActiveStages throws when unauthenticated", async () => {
    const { getMyActiveStages } = await import("@/lib/actions/task");
    await expect(getMyActiveStages()).rejects.toThrow(/Not Authenticated|Unauthorized/i);
  });
});

describe("server actions reject viewer/insufficient roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask rejects VIEWER", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as any);
    const { createTask } = await import("@/lib/actions/task");
    const fd = new FormData();
    fd.set("title", "x");
    await expect(createTask(fd)).rejects.toThrow(/Access Denied/i);
  });
});
