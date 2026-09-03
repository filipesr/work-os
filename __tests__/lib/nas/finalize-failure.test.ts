// @vitest-environment node

// Finalize com falha: o agente reporta por que não conseguiu importar para o NAS.
// O motivo é gravado para a tela explicar o que houve e a pessoa corrigir (Task 8).
// Sem ele, a reedição é tentativa e erro — o usuário troca o link quando o problema era o tipo
// declarado, falha igual, e conclui que a funcionalidade não presta.
//
// Mocka @/lib/nas/config INTEIRO (sem `orig()`), mesmo padrão da Task 6.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeFinalizeSignature } from "@/lib/nas/token";

vi.mock("@/lib/nas/config", () => ({
  getFinalizeSecret: () => "s3cr3t",
}));

const FINALIZE_SECRET = "s3cr3t";

// --- Fake do prisma: um array em memória com as operações necessárias para este teste. ---

interface Row {
  id: string;
  uploadStatus: "PENDING" | "UPLOADING" | "READY" | "FAILED";
  failedAt: Date | null;
  failedReason: string | null;
  importClaimedAt: Date | null;
  readyAt: Date | null;
}

let db: Row[] = [];
let updateCalls: Array<{ artifactId: string; data: Partial<Row> }> = [];
let auditLogCalls: Array<{ artifactId: string; eventType: string; metadata: unknown }> = [];

function addArtifact(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: overrides.id ?? "art1",
    uploadStatus: "PENDING",
    failedAt: null,
    failedReason: null,
    importClaimedAt: null,
    readyAt: null,
    ...overrides,
  };
  db.push(row);
  return row;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskArtifact: {
      findUnique: vi.fn(
        async (args: { where: { id: string }; select: Record<string, boolean> }) => {
          const row = db.find((r) => r.id === args.where.id);
          if (!row) return null;
          if (!args.select) return row;
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(args.select)) {
            out[k] = (row as unknown as Record<string, unknown>)[k];
          }
          return out;
        }
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
        const row = db.find((r) => r.id === args.where.id);
        if (row) {
          Object.assign(row, args.data);
        }
        updateCalls.push({ artifactId: args.where.id, data: args.data });
        return row;
      }),
    },
    artifactAuditLog: {
      create: vi.fn(
        async (args: { data: { artifactId: string; eventType: string; metadata: unknown } }) => {
          auditLogCalls.push(args.data);
        }
      ),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        taskArtifact: {
          update: vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
            const row = db.find((r) => r.id === args.where.id);
            if (row) {
              Object.assign(row, args.data);
            }
            updateCalls.push({ artifactId: args.where.id, data: args.data });
            return row;
          }),
        },
        artifactAuditLog: {
          create: vi.fn(
            async (args: {
              data: { artifactId: string; eventType: string; metadata: unknown };
            }) => {
              auditLogCalls.push(args.data);
            }
          ),
        },
      });
    }),
  },
  default: {},
}));

import { POST } from "@/app/api/artifacts/finalize/route";

function assinada(body: object, secret = FINALIZE_SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost/api/artifacts/finalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nas-timestamp": ts,
      "x-nas-signature": computeFinalizeSignature(secret, ts, raw),
    },
    body: raw,
  });
}

function updateArgs() {
  if (updateCalls.length === 0) throw new Error("Nenhum update foi chamado");
  return updateCalls[updateCalls.length - 1].data;
}

describe("POST /api/artifacts/finalize — falha com motivo", () => {
  beforeEach(() => {
    db = [];
    updateCalls = [];
    auditLogCalls = [];
  });

  it("grava o motivo e deixa o artefato em FAILED", async () => {
    addArtifact({ id: "art1" });
    const res = await POST(
      assinada({ artifactId: "art1", failed: true, reason: "TOO_LARGE" }) as never
    );
    expect(res.status).toBe(200);
    const data = updateArgs();
    expect(data.uploadStatus).toBe("FAILED");
    expect(data.failedReason).toBe("TOO_LARGE");
    expect(data.failedAt).toBeInstanceOf(Date);
    expect(data.importClaimedAt).toBeNull();
  });

  it("não ressuscita como falho um artefato já pronto", async () => {
    addArtifact({ id: "art1", uploadStatus: "READY" });
    const res = await POST(
      assinada({ artifactId: "art1", failed: true, reason: "TIMEOUT" }) as never
    );
    expect(res.status).toBe(409);
  });

  it("é idempotente: repetir a falha não é erro", async () => {
    addArtifact({ id: "art1", uploadStatus: "FAILED", failedReason: "TIMEOUT" });
    const res = await POST(
      assinada({ artifactId: "art1", failed: true, reason: "TIMEOUT" }) as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, idempotent: true });
  });

  it("corta um motivo absurdamente longo em vez de recusar", async () => {
    addArtifact({ id: "art1" });
    const res = await POST(
      assinada({ artifactId: "art1", failed: true, reason: "X".repeat(5000) }) as never
    );
    expect(res.status).toBe(200);
    expect(String(updateArgs().failedReason).length).toBeLessThanOrEqual(200);
  });

  it("o sucesso continua como hoje", async () => {
    addArtifact({ id: "art1" });
    const res = await POST(
      assinada({ artifactId: "art1", checksum: "abc", sizeBytes: 10 }) as never
    );
    expect(res.status).toBe(200);
    expect(updateArgs().uploadStatus).toBe("READY");
  });
});
