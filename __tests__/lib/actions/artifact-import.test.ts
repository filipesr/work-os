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
const updated: Record<string, unknown>[] = [];
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
      findUnique: vi.fn(),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: "a1" });
      }),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        updated.push(args.data);
        return Promise.resolve({ id: "art1" });
      }),
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
import { prisma } from "@/lib/prisma";
import { enqueueArtifactImport, retryArtifactImport } from "@/lib/actions/artifact-import";

// O `findUnique` real do Prisma devolve o TaskArtifact inteiro (30+ campos); o mock só precisa dos
// que `retryArtifactImport` lê (ver `select` da ação). O cast solto é intencional — sem ele, TS
// exige a linha inteira do modelo em cada `artifactRow(...)` do teste.
const mockedFindUnique = vi.mocked(prisma.taskArtifact.findUnique) as unknown as ReturnType<
  typeof vi.fn
>;
const updateArgs = () => updated.at(-1)! as Record<string, unknown>;

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

// artifactRow — a linha do artefato que `retryArtifactImport` lê antes de decidir. FAILED +
// NAS_UPLOAD + url != null é o único estado que a reedição aceita (as duas regras da task: editar
// só existe em FAILED, e só existe para uma importação, não para um upload comum).
function artifactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "art1",
    scope: "TASK" as const,
    taskId: "t1",
    projectId: null,
    clientId: null,
    storageKind: "NAS_UPLOAD" as const,
    uploadStatus: "FAILED" as const,
    url: "https://exemplo.com/foto-velha.png",
    version: 1,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

const validInput = {
  title: "Foto certa",
  url: "https://exemplo.com/foto.png",
  mediaType: "FOTOS" as const,
  sensitivity: "CLIENTE" as const,
};

describe("retryArtifactImport", () => {
  beforeEach(() => {
    created.length = 0;
    updated.length = 0;
    vi.clearAllMocks();
    vi.mocked(requireMemberOrHigher).mockResolvedValue({ id: "u1", role: "MEMBER" } as never);
    mockedFindUnique.mockResolvedValue(artifactRow());
  });

  it("devolve o artefato para a fila e limpa a falha", async () => {
    const res = await retryArtifactImport("art1", {
      title: "Foto certa",
      url: "https://exemplo.com/foto.png",
      mediaType: "FOTOS",
      sensitivity: "CLIENTE",
    });
    expect(res).toMatchObject({ success: true });
    const data = updateArgs();
    expect(data.uploadStatus).toBe("PENDING");
    expect(data.failedReason).toBeNull();
    expect(data.failedAt).toBeNull();
    expect(data.importClaimedAt).toBeNull();
  });

  it("resela o caminho quando o tipo de mídia muda", async () => {
    await retryArtifactImport("art1", {
      title: "Vídeo",
      url: "https://exemplo.com/filme.mp4",
      mediaType: "VIDEOS",
      sensitivity: "INTERNO",
    });
    const data = updateArgs();
    expect(data.nasPath).toContain("/videos/");
    expect(String(data.fileName)).toMatch(/\.mp4$/);
    expect(data.originalFileName).toBe("filme.mp4");
  });

  it("aceita reenviar sem mudar nada (falha passageira de rede)", async () => {
    const res = await retryArtifactImport("art1", {
      title: "Foto",
      url: "https://exemplo.com/foto.jpg",
      mediaType: "FOTOS",
      sensitivity: "INTERNO",
    });
    expect(res).toMatchObject({ success: true });
  });

  it("recusa em READY — pelo SERVIDOR, não só escondendo o botão", async () => {
    mockedFindUnique.mockResolvedValue(artifactRow({ uploadStatus: "READY" }));
    const res = await retryArtifactImport("art1", validInput);
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(updated).toHaveLength(0);
  });

  it("recusa em PENDING (já está na fila)", async () => {
    mockedFindUnique.mockResolvedValue(artifactRow({ uploadStatus: "PENDING" }));
    const res = await retryArtifactImport("art1", validInput);
    expect(res).toHaveProperty("error");
    expect(updated).toHaveLength(0);
  });

  it("recusa um artefato que não é importação (upload sem url)", async () => {
    mockedFindUnique.mockResolvedValue(artifactRow({ url: null }));
    const res = await retryArtifactImport("art1", validInput);
    expect(res).toHaveProperty("error");
    expect(updated).toHaveLength(0);
  });
});
