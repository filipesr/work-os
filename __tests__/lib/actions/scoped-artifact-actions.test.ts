import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn(),
  requireMemberOrHigher: vi.fn(),
  requireSupervisorOrHigher: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskArtifact: {
      create: vi.fn().mockResolvedValue({ id: "a1" }),
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
  default: {},
}));

import { requireManagerOrAdmin } from "@/lib/permissions";

const mockRequireManager = vi.mocked(requireManagerOrAdmin);

describe("addScopedLinkArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireManager.mockResolvedValue({ id: "u1", role: "MANAGER" } as never);
  });

  it("cria artefato PROJECT com storageKind LINK e READY", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { create: ReturnType<typeof vi.fn> };
    };
    const { addScopedLinkArtifact } = await import("@/lib/actions/artifact");
    const res = await addScopedLinkArtifact({
      scope: "PROJECT",
      projectId: "p1",
      title: "Briefing",
      url: "https://drive.google.com/x",
    });
    expect(res).toEqual({ success: true });
    const data = prisma.taskArtifact.create.mock.calls.at(-1)?.[0].data;
    expect(data).toMatchObject({
      scope: "PROJECT",
      projectId: "p1",
      clientId: null,
      storageKind: "LINK",
      uploadStatus: "READY",
      userId: "u1",
    });
  });

  it("rejeita escopo TASK", async () => {
    const { addScopedLinkArtifact } = await import("@/lib/actions/artifact");
    const res = await addScopedLinkArtifact({
      scope: "TASK",
      taskId: "t1",
      title: "x",
      url: "https://x.com",
    });
    expect(res).toHaveProperty("error");
  });

  it("rejeita dono divergente do escopo (invariante)", async () => {
    const { addScopedLinkArtifact } = await import("@/lib/actions/artifact");
    const res = await addScopedLinkArtifact({
      scope: "PROJECT",
      clientId: "c1", // dono errado
      title: "x",
      url: "https://x.com",
    });
    expect(res).toHaveProperty("error");
  });
});

describe("removeScopedArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireManager.mockResolvedValue({ id: "u1", role: "MANAGER" } as never);
  });

  it("remove artefato de projeto", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({
      scope: "PROJECT",
      projectId: "p1",
      clientId: null,
    });
    const { removeScopedArtifact } = await import("@/lib/actions/artifact");
    const res = await removeScopedArtifact("a1");
    expect(res).toEqual({ success: true });
    expect(prisma.taskArtifact.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("recusa remover artefato TASK por aqui", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({
      scope: "TASK",
      projectId: null,
      clientId: null,
    });
    const { removeScopedArtifact } = await import("@/lib/actions/artifact");
    const res = await removeScopedArtifact("a1");
    expect(res).toHaveProperty("error");
    expect(prisma.taskArtifact.delete).not.toHaveBeenCalled();
  });
});
