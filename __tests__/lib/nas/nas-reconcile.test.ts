// @vitest-environment node

// Reconciliation cron: expires old browser uploads, but NEVER touches importation.
// Importation has its own liveness mechanism via the import-queue lease.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CRON_SECRET: "test-secret",
  },
}));

// --- Fake do prisma: um array em memória com as operações necessárias. ---

interface Row {
  id: string;
  storageKind: "NAS_UPLOAD" | "LINK";
  uploadStatus: "PENDING" | "UPLOADING" | "READY" | "EXPIRED" | "FAILED";
  url: string | null;
  createdAt: Date;
}

let db: Row[] = [];
let seq = 0;

function addArtifact(overrides: Partial<Row> = {}): Row {
  seq += 1;
  const row: Row = {
    id: `art${seq}`,
    storageKind: "NAS_UPLOAD",
    uploadStatus: "PENDING",
    url: null,
    createdAt: new Date(),
    ...overrides,
  };
  db.push(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesWhere(row: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (cond === null) return value === null;
    if (typeof cond === "object" && !(cond instanceof Date)) {
      if ("not" in cond) return cond.not === null ? value !== null : value !== cond.not;
      if ("lt" in cond) return value instanceof Date && value.getTime() < cond.lt.getTime();
      return true;
    }
    return value === cond;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskArtifact: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const targets = db.filter((r) => matchesWhere(r, args.where));
        for (const r of targets) Object.assign(r, args.data);
        return { count: targets.length };
      }),
    },
  },
  default: {},
}));

import { GET } from "@/app/api/cron/nas-reconcile/route";

describe("GET /api/cron/nas-reconcile", () => {
  beforeEach(() => {
    db = [];
    seq = 0;
  });

  it("browser PENDING > 30min vira EXPIRED", async () => {
    const thirtyfiveMinsAgo = new Date(Date.now() - 35 * 60_000);
    addArtifact({
      id: "browser1",
      storageKind: "NAS_UPLOAD",
      uploadStatus: "PENDING",
      url: null, // browser upload
      createdAt: thirtyfiveMinsAgo,
    });

    const req = new Request("http://localhost/api/cron/nas-reconcile", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as never);
    const json = await res.json();

    expect(json.expired).toBe(1);
    expect(db[0].uploadStatus).toBe("EXPIRED");
  });

  it("importation PENDING > 30min é ignorada", async () => {
    const thirtyfiveMinsAgo = new Date(Date.now() - 35 * 60_000);
    addArtifact({
      id: "import1",
      storageKind: "NAS_UPLOAD",
      uploadStatus: "PENDING",
      url: "https://exemplo.com/arquivo.pdf", // importation
      createdAt: thirtyfiveMinsAgo,
    });

    const req = new Request("http://localhost/api/cron/nas-reconcile", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as never);
    const json = await res.json();

    expect(json.expired).toBe(0);
    expect(db[0].uploadStatus).toBe("PENDING"); // não foi tocado
  });

  it("browser UPLOADING > 180min vira FAILED", async () => {
    const threehoursTwoMinsAgo = new Date(Date.now() - 182 * 60_000);
    addArtifact({
      id: "browser2",
      storageKind: "NAS_UPLOAD",
      uploadStatus: "UPLOADING",
      url: null, // browser upload
      createdAt: threehoursTwoMinsAgo,
    });

    const req = new Request("http://localhost/api/cron/nas-reconcile", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as never);
    const json = await res.json();

    expect(json.failed).toBe(1);
    expect(db[0].uploadStatus).toBe("FAILED");
    expect(db[0]).toMatchObject({ failedReason: "upload timeout (reconcile)" });
  });

  it("importation UPLOADING > 180min é ignorada", async () => {
    const threehoursTwoMinsAgo = new Date(Date.now() - 182 * 60_000);
    addArtifact({
      id: "import2",
      storageKind: "NAS_UPLOAD",
      uploadStatus: "UPLOADING",
      url: "https://exemplo.com/arquivo.zip", // importation
      createdAt: threehoursTwoMinsAgo,
    });

    const req = new Request("http://localhost/api/cron/nas-reconcile", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as never);
    const json = await res.json();

    expect(json.failed).toBe(0);
    expect(db[0].uploadStatus).toBe("UPLOADING"); // não foi tocado
  });
});
