// @vitest-environment node

// A fila de importação: o agente pergunta o que há para baixar. Mesmo HMAC do finalize
// (timestamp + corpo cru), sem sessão — ver app/api/artifacts/import-queue/route.ts.
//
// Mocka @/lib/nas/config INTEIRO (sem `orig()`): o Vitest deste repo não carrega .env sozinho, e
// quem carrega por efeito colateral é a importação de @prisma/client. Chamar `orig()` aqui
// avaliaria lib/env.ts e estouraria "Invalid environment variables: DATABASE_URL" — armadilha de
// infraestrutura, não do código da rota. Devolver só o que a rota usa evita o problema de raiz.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeFinalizeSignature } from "@/lib/nas/token";

// vi.mock é hoisted para o topo do arquivo — a factory não pode referenciar `const`s declaradas
// abaixo dela (ReferenceError: "Cannot access ... before initialization"). Por isso os valores vão
// literais aqui, e as constantes usadas pelo resto do teste (abaixo) só repetem os mesmos valores.
vi.mock("@/lib/nas/config", () => ({
  getFinalizeSecret: () => "s3cr3t",
  IMPORT_LEASE_MS: 2 * 60 * 60 * 1000, // 2h — mesmo valor da rota real
  IMPORT_QUEUE_MAX: 10,
}));

const FINALIZE_SECRET = "s3cr3t";

// --- Fake do prisma: um array em memória com filtro de `where` suficiente para os casos usados
// pela rota (equality, `{ not }`, `{ lt }`, `{ in }`). ---

interface Row {
  id: string;
  storageKind: "NAS_UPLOAD" | "LINK";
  uploadStatus: "PENDING" | "UPLOADING" | "READY" | "FAILED" | "EXPIRED";
  url: string | null;
  deletedAt: Date | null;
  nasPath: string | null;
  fileName: string | null;
  mediaType: string | null;
  importClaimedAt: Date | null;
  createdAt: Date;
  agentId: string | null;
}

let db: Row[] = [];
let seq = 0;

function addArtifact(overrides: Partial<Row> = {}): Row {
  seq += 1;
  const row: Row = {
    id: overrides.id ?? `art${seq}`,
    storageKind: "NAS_UPLOAD",
    uploadStatus: "PENDING",
    url: "https://exemplo.com/foto.jpg",
    deletedAt: null,
    nasPath: "Cliente/institucional/fotos/Foto_v01.jpg",
    fileName: "Foto_v01.jpg",
    mediaType: "FOTOS",
    importClaimedAt: null,
    createdAt: new Date(Date.now() + seq), // ordem estável de inserção
    agentId: null,
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
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("not" in cond) return cond.not === null ? value !== null : value !== cond.not;
      if ("lt" in cond) return value instanceof Date && value.getTime() < cond.lt.getTime();
      if ("in" in cond) return (cond.in as unknown[]).includes(value);
      return true;
    }
    return value === cond;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskArtifact: {
      findMany: vi.fn(
        async (args: {
          where: Record<string, unknown>;
          orderBy?: { createdAt: "asc" | "desc" };
          take?: number;
          select?: Record<string, boolean>;
        }) => {
          let rows = db.filter((r) => matchesWhere(r, args.where));
          if (args.orderBy?.createdAt === "asc") {
            rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
          if (typeof args.take === "number") rows = rows.slice(0, args.take);
          if (!args.select) return rows;
          return rows.map((r) => {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(args.select!))
              out[k] = (r as unknown as Record<string, unknown>)[k];
            return out;
          });
        }
      ),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const targets = db.filter((r) => matchesWhere(r, args.where));
        for (const r of targets) Object.assign(r, args.data);
        return { count: targets.length };
      }),
    },
  },
  default: {},
}));

import { POST } from "@/app/api/artifacts/import-queue/route";

function assinada(body: object, secret = FINALIZE_SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost/api/artifacts/import-queue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nas-timestamp": ts,
      "x-nas-signature": computeFinalizeSignature(secret, ts, raw),
    },
    body: raw,
  });
}

describe("POST /api/artifacts/import-queue", () => {
  beforeEach(() => {
    db = [];
    seq = 0;
  });

  it("recusa quem não assina", async () => {
    const res = await POST(
      new Request("http://localhost/x", { method: "POST", body: "{}" }) as never
    );
    expect(res.status).toBe(401);
  });

  it("entrega o pendente com o caminho selado e o teto do tipo", async () => {
    addArtifact({
      id: "art1",
      url: "https://exemplo.com/foto.jpg",
      mediaType: "FOTOS",
    });
    const res = await POST(assinada({ agentId: "a1" }) as never);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({
      artifactId: "art1",
      url: "https://exemplo.com/foto.jpg",
      maxBytes: 150 * 1024 * 1024, // ALLOWLIST.FOTOS
    });
  });

  it("NÃO entrega upload de navegador parado em PENDING (url nulo)", async () => {
    // Este é o caso que estraga tudo em silêncio: o agente tentaria baixar `null`, e um upload
    // que só esperava os bytes do navegador seria marcado como falho.
    addArtifact({ id: "browser1", url: null, nasPath: null, fileName: null });
    const res = await POST(assinada({ agentId: "a1" }) as never);
    expect((await res.json()).items).toHaveLength(0);
  });

  it("NÃO entrega upload de navegador em progresso — url nulo, mas nasPath/fileName já selados", async () => {
    // A forma REAL de um upload de navegador esperando os bytes: `nasPath`/`fileName` são selados
    // no prepare (createArtifactWithVersion), para os dois fluxos (upload e importação) — só falta
    // `url`. O caso acima (nasPath/fileName também nulos) não prova nada sobre a guarda `url: {
    // not: null }` sozinha, porque a guarda `nasPath: { not: null }` já bastaria para excluí-lo.
    // Este isola: só `url` está faltando.
    addArtifact({
      id: "browser2",
      url: null,
      nasPath: "Cliente/Tarefa ~ab12/institucional/fotos/Foto_v01.jpg",
      fileName: "Foto_v01.jpg",
    });
    const res = await POST(assinada({ agentId: "a1" }) as never);
    expect((await res.json()).items).toHaveLength(0);
  });

  it("não entrega o mesmo item duas vezes", async () => {
    addArtifact({ id: "art1" });
    await POST(assinada({ agentId: "a1" }) as never);
    const res2 = await POST(assinada({ agentId: "a1" }) as never);
    expect((await res2.json()).items).toHaveLength(0);
  });

  it("devolve à fila o item preso em UPLOADING além da reserva", async () => {
    addArtifact({
      id: "stuck1",
      uploadStatus: "UPLOADING",
      importClaimedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h atrás, lease = 2h
    });
    const res = await POST(assinada({ agentId: "a1" }) as never);
    expect((await res.json()).items).toHaveLength(1);
  });

  it("respeita o teto de itens por chamada", async () => {
    for (let i = 0; i < 15; i++) addArtifact();
    const res = await POST(assinada({ agentId: "a1", limit: 3 }) as never);
    expect((await res.json()).items.length).toBeLessThanOrEqual(3);
  });
});
