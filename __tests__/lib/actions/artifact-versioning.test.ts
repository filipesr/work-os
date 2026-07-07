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
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockReturnValue({ op: "update" }),
      create: vi.fn().mockReturnValue({ op: "create" }),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
  default: {},
}));

import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";

const asUser = { id: "u1", role: "MANAGER" };

describe("addLinkArtifactVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMemberOrHigher).mockResolvedValue(asUser as never);
    vi.mocked(requireManagerOrAdmin).mockResolvedValue(asUser as never);
  });

  it("cria v2 na mesma raiz e marca a anterior como não-vigente", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
      };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({
      id: "a1",
      isCurrent: true,
      scope: "TASK",
      taskId: "t1",
      projectId: null,
      clientId: null,
      version: 1,
      rootId: null,
      title: "Briefing",
      type: "DOCUMENT",
    });

    const { addLinkArtifactVersion } = await import("@/lib/actions/artifact");
    const res = await addLinkArtifactVersion("a1", { url: "https://drive/x" });

    expect(res).toEqual({ success: true });
    // marca a v1 como não-vigente
    expect(prisma.taskArtifact.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { isCurrent: false },
    });
    // cria a v2 na mesma raiz (a1), version 2, vigente — título e tipo HERDADOS, só a URL muda.
    const data = prisma.taskArtifact.create.mock.calls.at(-1)?.[0].data;
    expect(data).toMatchObject({
      scope: "TASK",
      taskId: "t1",
      rootId: "a1",
      version: 2,
      isCurrent: true,
      storageKind: "LINK",
      title: "Briefing",
      type: "DOCUMENT",
      url: "https://drive/x",
    });
  });

  it("recusa versionar uma versão não-vigente", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({ id: "a1", isCurrent: false, scope: "TASK" });
    const { addLinkArtifactVersion } = await import("@/lib/actions/artifact");
    const res = await addLinkArtifactVersion("a1", { url: "https://x" });
    expect(res).toHaveProperty("error");
  });

  it("rejeita URL inválida", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({
      id: "a1",
      isCurrent: true,
      scope: "TASK",
      taskId: "t1",
      projectId: null,
      clientId: null,
      version: 1,
      rootId: null,
      title: "Briefing",
      type: "OTHER",
    });
    const { addLinkArtifactVersion } = await import("@/lib/actions/artifact");
    const res = await addLinkArtifactVersion("a1", { url: "notaurl" });
    expect(res).toHaveProperty("error");
  });
});

describe("removeFailedArtifact (recuperação — segurança)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMemberOrHigher).mockResolvedValue(asUser as never);
    vi.mocked(requireManagerOrAdmin).mockResolvedValue(asUser as never);
  });

  const findUnique = async () =>
    (
      (await import("@/lib/prisma")).prisma as never as {
        taskArtifact: { findUnique: ReturnType<typeof vi.fn> };
      }
    ).taskArtifact.findUnique;

  it("recusa remover um artefato READY (não nuke o que está bom)", async () => {
    (await findUnique()).mockResolvedValue({
      scope: "TASK",
      storageKind: "NAS_UPLOAD",
      uploadStatus: "READY",
      taskId: "t1",
      projectId: null,
      clientId: null,
      rootId: null,
      isCurrent: true,
    });
    const { removeFailedArtifact } = await import("@/lib/actions/artifact");
    expect(await removeFailedArtifact("a1")).toHaveProperty("error");
  });

  it("recusa remover um LINK (só uploads NAS saem por aqui)", async () => {
    (await findUnique()).mockResolvedValue({
      scope: "TASK",
      storageKind: "LINK",
      uploadStatus: "READY",
      taskId: "t1",
      projectId: null,
      clientId: null,
      rootId: null,
      isCurrent: true,
    });
    const { removeFailedArtifact } = await import("@/lib/actions/artifact");
    expect(await removeFailedArtifact("a1")).toHaveProperty("error");
  });

  it("artefato inexistente → erro", async () => {
    (await findUnique()).mockResolvedValue(null);
    const { removeFailedArtifact } = await import("@/lib/actions/artifact");
    expect(await removeFailedArtifact("nope")).toHaveProperty("error");
  });
});

describe("getArtifactVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireManagerOrAdmin).mockResolvedValue(asUser as never);
    vi.mocked(requireMemberOrHigher).mockResolvedValue(asUser as never);
  });

  it("agrupa por raiz e retorna versões desc", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findUnique.mockResolvedValue({ id: "a2", rootId: "a1", scope: "PROJECT" });
    prisma.taskArtifact.findMany.mockResolvedValue([
      {
        id: "a2",
        title: "v2",
        url: "https://2",
        scope: "PROJECT",
        version: 2,
        createdAt: "2026-07-02T00:00:00Z",
        user: null,
      },
      {
        id: "a1",
        title: "v1",
        url: "https://1",
        scope: "PROJECT",
        version: 1,
        createdAt: "2026-07-01T00:00:00Z",
        user: null,
      },
    ]);

    const { getArtifactVersions } = await import("@/lib/actions/artifact");
    const rows = await getArtifactVersions("a2");

    // consulta pela raiz efetiva (a1)
    const where = prisma.taskArtifact.findMany.mock.calls.at(-1)?.[0].where;
    expect(where).toEqual({ OR: [{ id: "a1" }, { rootId: "a1" }] });
    expect(rows.map((r) => r.version)).toEqual([2, 1]);
    expect(rows[0].origin).toBe("PROJECT");
  });
});
