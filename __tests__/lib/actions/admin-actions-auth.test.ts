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

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    workflowTemplate: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    stageDependency: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
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

function asAdmin() {
  mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as any);
}

function asRole(role: string) {
  mockAuth.mockResolvedValue({ user: { id: "u1", role } } as any);
}

function stageFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Design");
  fd.set("order", overrides.order ?? "1");
  if (overrides.defaultTeamId) fd.set("defaultTeamId", overrides.defaultTeamId);
  return fd;
}

describe("admin actions reject non-admin roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTemplateStage rejects MANAGER", async () => {
    asRole("MANAGER");
    const { createTemplateStage } = await import("@/lib/actions/stage");
    await expect(createTemplateStage("tmpl-1", stageFormData())).rejects.toThrow(/Access Denied/i);
  });

  it("updateTemplateStage rejects MEMBER", async () => {
    asRole("MEMBER");
    const { updateTemplateStage } = await import("@/lib/actions/stage");
    await expect(updateTemplateStage("stage-1", "tmpl-1", stageFormData())).rejects.toThrow(
      /Access Denied/i
    );
  });

  it("deleteTemplateStage rejects VIEWER", async () => {
    asRole("VIEWER");
    const { deleteTemplateStage } = await import("@/lib/actions/stage");
    await expect(deleteTemplateStage("stage-1", "tmpl-1")).rejects.toThrow(/Access Denied/i);
  });

  it("createWorkflowTemplate rejects MANAGER", async () => {
    asRole("MANAGER");
    const { createWorkflowTemplate } = await import("@/lib/actions/template");
    const fd = new FormData();
    fd.set("name", "Onboarding");
    await expect(createWorkflowTemplate(fd)).rejects.toThrow(/Access Denied/i);
  });

  it("updateWorkflowTemplate rejects MEMBER", async () => {
    asRole("MEMBER");
    const { updateWorkflowTemplate } = await import("@/lib/actions/template");
    const fd = new FormData();
    fd.set("name", "Onboarding");
    await expect(updateWorkflowTemplate("tmpl-1", fd)).rejects.toThrow(/Access Denied/i);
  });

  it("updateStageDependencies rejects SUPERVISOR", async () => {
    asRole("SUPERVISOR");
    const { updateStageDependencies } = await import("@/lib/actions/dependency");
    await expect(updateStageDependencies("stage-1", "tmpl-1", [])).rejects.toThrow(
      /Access Denied/i
    );
  });
});

describe("admin actions validate input before touching the database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it("createTemplateStage returns error and does not write when name is missing", async () => {
    const { createTemplateStage } = await import("@/lib/actions/stage");
    const fd = stageFormData({ name: "" });
    const result = await createTemplateStage("tmpl-1", fd);
    expect(result).toEqual({ error: expect.stringMatching(/name/i) });
    expect(prisma.templateStage.create).not.toHaveBeenCalled();
  });

  it("createTemplateStage returns error when order is non-numeric", async () => {
    const { createTemplateStage } = await import("@/lib/actions/stage");
    const fd = stageFormData({ order: "abc" });
    const result = await createTemplateStage("tmpl-1", fd);
    expect(result).toEqual({ error: expect.stringMatching(/order/i) });
    expect(prisma.templateStage.create).not.toHaveBeenCalled();
  });

  it("updateWorkflowTemplate returns error when name is missing", async () => {
    const { updateWorkflowTemplate } = await import("@/lib/actions/template");
    const fd = new FormData();
    const result = await updateWorkflowTemplate("tmpl-1", fd);
    expect(result).toEqual({ error: expect.stringMatching(/name/i) });
    expect(prisma.workflowTemplate.update).not.toHaveBeenCalled();
  });
});

describe("admin actions happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it("createTemplateStage creates the stage with valid data", async () => {
    vi.mocked(prisma.templateStage.create).mockResolvedValue({ id: "stage-1" } as any);
    const { createTemplateStage } = await import("@/lib/actions/stage");
    const result = await createTemplateStage("tmpl-1", stageFormData());
    expect(result).toEqual({ success: true });
    expect(prisma.templateStage.create).toHaveBeenCalledOnce();
  });

  it("updateStageDependencies diffs and commits in a transaction", async () => {
    vi.mocked(prisma.stageDependency.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);
    const { updateStageDependencies } = await import("@/lib/actions/dependency");
    const result = await updateStageDependencies("stage-1", "tmpl-1", ["dep-1"]);
    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
