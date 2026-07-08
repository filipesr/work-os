import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatBytes } from "@/lib/nas/storage-format";

vi.mock("@/lib/prisma", () => ({
  prisma: { taskArtifact: { findMany: vi.fn(), groupBy: vi.fn() } },
  default: {},
}));

describe("formatBytes", () => {
  it("formata em B/KB/MB/GB (base 1024)", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
  });
  it("aceita bigint e trata negativo/zero como 0 B", () => {
    expect(formatBytes(BigInt(2048))).toBe("2.00 KB");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("storageByClient — roll-up de escopo → cliente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soma artefatos de cliente + projeto + tarefa no cliente certo, ordenado desc", async () => {
    const prisma = (await import("@/lib/prisma")).prisma as never as {
      taskArtifact: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.taskArtifact.findMany.mockResolvedValue([
      // cliente-escopo → c1
      { sizeBytes: BigInt(100), clientId: "c1", client: { name: "A" }, project: null, task: null },
      // projeto-escopo → projeto do c1
      {
        sizeBytes: BigInt(50),
        clientId: null,
        client: null,
        project: { clientId: "c1", client: { name: "A" } },
        task: null,
      },
      // tarefa-escopo → tarefa→projeto do c2
      {
        sizeBytes: BigInt(200),
        clientId: null,
        client: null,
        project: null,
        task: { project: { clientId: "c2", client: { name: "B" } } },
      },
    ]);

    const { storageByClient } = await import("@/lib/nas/storage-stats");
    const stats = await storageByClient();

    expect(stats.totalBytes).toBe(350);
    expect(stats.totalFiles).toBe(3);
    // ordenado por bytes desc: c2 (200) antes de c1 (150)
    expect(stats.rows.map((r) => [r.key, r.bytes, r.files])).toEqual([
      ["c2", 200, 1],
      ["c1", 150, 2],
    ]);
    expect(stats.rows[0].label).toBe("B");
  });
});
