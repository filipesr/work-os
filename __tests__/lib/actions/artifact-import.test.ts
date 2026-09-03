import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(),
  requireManagerOrAdmin: vi.fn(),
}));
vi.mock("@/lib/nas/config", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isNasImportConfigured: () => true,
}));

const created: Record<string, unknown>[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn().mockResolvedValue({
        id: "t1",
        title: "Post de lançamento",
        project: { client: { folderName: "Cliente Um" } },
      }),
    },
    taskArtifact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: "a1" });
      }),
      update: vi.fn(),
    },
    artifactAuditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        taskArtifact: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn((args: { data: Record<string, unknown> }) => {
            created.push(args.data);
            return Promise.resolve({ id: "a1" });
          }),
          update: vi.fn(),
        },
      })
    ),
  },
  default: {},
}));

import { requireMemberOrHigher } from "@/lib/permissions";
import { enqueueArtifactImport } from "@/lib/actions/artifact-import";

const base = {
  scope: "TASK" as const,
  taskId: "t1",
  title: "Foto do cliente",
  url: "https://exemplo.com/foto.jpg",
  mediaType: "FOTOS" as const,
  sensitivity: "CLIENTE" as const,
};

describe("enqueueArtifactImport", () => {
  beforeEach(() => {
    created.length = 0;
    vi.clearAllMocks();
    vi.mocked(requireMemberOrHigher).mockResolvedValue({ id: "u1", role: "MEMBER" } as never);
  });

  it("cria o artefato na fila: NAS_UPLOAD + PENDING + a origem em url", async () => {
    const res = await enqueueArtifactImport(base);
    expect(res).toMatchObject({ success: true });
    const row = created.at(-1)!;
    expect(row.storageKind).toBe("NAS_UPLOAD");
    expect(row.uploadStatus).toBe("PENDING");
    expect(row.url).toBe("https://exemplo.com/foto.jpg");
    expect(row.mediaType).toBe("FOTOS");
    expect(row.sensitivity).toBe("CLIENTE");
  });

  it("guarda o nome que a pessoa deu, e o nome do arquivo vem da URL", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.title).toBe("Foto do cliente");
    expect(row.originalFileName).toBe("foto.jpg");
  });

  it("sela o caminho no NAS já no enfileiramento", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.nasPath).toContain("/fotos/");
    expect(String(row.fileName)).toMatch(/\.jpg$/);
  });

  it("não grava tamanho nem MIME — ninguém os conhece antes de baixar", async () => {
    await enqueueArtifactImport(base);
    const row = created.at(-1)!;
    expect(row.sizeBytes).toBeNull();
    expect(row.mimeType).toBeNull();
  });

  it("não grava o `type` legado", async () => {
    await enqueueArtifactImport(base);
    expect(created.at(-1)!).not.toHaveProperty("type");
  });

  it("recusa link que não aponta para um arquivo", async () => {
    const res = await enqueueArtifactImport({
      ...base,
      url: "https://drive.google.com/file/d/1a2b/view",
    });
    expect(res).toMatchObject({ error: "importNoFileName" });
  });

  it("recusa destino privado antes de enfileirar", async () => {
    const res = await enqueueArtifactImport({ ...base, url: "http://192.168.200.216/a.jpg" });
    expect(res).toMatchObject({ error: "importPrivateHost" });
  });

  it("recusa tipo que só existe como link", async () => {
    for (const mediaType of ["FIGMA", "OUTROS"] as const) {
      const res = await enqueueArtifactImport({ ...base, mediaType });
      expect(res, mediaType).toMatchObject({ error: "mediaTypeLinkOnly" });
    }
    expect(created).toHaveLength(0);
  });

  it("recusa extensão que o tipo de mídia não aceita", async () => {
    const res = await enqueueArtifactImport({
      ...base,
      url: "https://exemplo.com/filme.mp4",
      mediaType: "FOTOS",
    });
    expect(res).toHaveProperty("error");
    expect(created).toHaveLength(0);
  });
});
