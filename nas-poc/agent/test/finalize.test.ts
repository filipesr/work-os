import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  callFinalize,
  finalizeSignature,
  decideFinalize,
  FINALIZE_BACKOFF_CAP_MS,
  FINALIZE_MAX_AGE_MS,
} from "../src/finalize.js";

describe("decideFinalize (política de retry do worker)", () => {
  const NOW = 1_800_000_000_000;
  const fresh = { attempts: 0, createdAt: NOW };

  it("sucesso → remove/ok", () => {
    expect(decideFinalize(fresh, { ok: true, status: 200 }, NOW)).toEqual({
      action: "remove",
      reason: "ok",
      attempts: 0,
    });
  });

  it("4xx (exceto 429) é TERMINAL → remove/terminal", () => {
    for (const status of [400, 401, 404, 409]) {
      const d = decideFinalize(fresh, { ok: false, status }, NOW);
      expect(d).toMatchObject({ action: "remove", reason: "terminal" });
    }
  });

  it("transiente NUNCA desiste por contagem — reintenta mesmo com muitas tentativas", () => {
    const many = { attempts: 500, createdAt: NOW };
    // 5xx, 429 e erro de rede (sem status) → reschedule
    for (const r of [{ ok: false, status: 500 }, { ok: false, status: 429 }, { ok: false }]) {
      const d = decideFinalize(many, r, NOW);
      expect(d.action).toBe("reschedule");
      if (d.action === "reschedule") expect(d.attempts).toBe(501);
    }
  });

  it("backstop de idade: transiente muito velho → remove/too_old", () => {
    const old = { attempts: 20, createdAt: NOW - FINALIZE_MAX_AGE_MS - 1 };
    const d = decideFinalize(old, { ok: false, status: 503 }, NOW);
    expect(d).toMatchObject({ action: "remove", reason: "too_old" });
  });

  it("backoff é limitado ao teto (30 min) e agenda no futuro", () => {
    const d = decideFinalize({ attempts: 50, createdAt: NOW }, { ok: false, status: 500 }, NOW);
    expect(d.action).toBe("reschedule");
    if (d.action === "reschedule") {
      expect(d.nextAttemptAt).toBe(NOW + FINALIZE_BACKOFF_CAP_MS);
    }
  });
});

describe("finalizeSignature", () => {
  it("is HMAC-SHA256 over `${timestamp}.${body}`", () => {
    const expected = createHmac("sha256", "secret").update("1000.hello").digest("hex");
    expect(finalizeSignature("secret", "1000", "hello")).toBe(expected);
  });
});

describe("callFinalize", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs with matching timestamp+signature headers and the agentId in the body", async () => {
    const seen: { url: unknown; init: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: any) => {
        seen.push({ url, init });
        return { ok: true, status: 200 } as Response;
      })
    );

    const r = await callFinalize(
      { url: "http://cloud/api/artifacts/finalize", secret: "s3cr3t", agentId: "agent-1" },
      { artifactId: "art1", checksum: "abc", sizeBytes: 10 }
    );

    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(1);
    const { init } = seen[0];
    expect(init.method).toBe("POST");
    const ts = init.headers["x-nas-timestamp"];
    expect(init.headers["x-nas-signature"]).toBe(finalizeSignature("s3cr3t", ts, init.body));
    expect(JSON.parse(init.body)).toMatchObject({
      artifactId: "art1",
      checksum: "abc",
      sizeBytes: 10,
      agentId: "agent-1",
    });
  });

  it("does not retry on terminal 4xx", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const r = await callFinalize(
      { url: "u", secret: "s", agentId: "a" },
      { artifactId: "x", checksum: null, sizeBytes: 1 },
      { retries: 3, backoffMs: 1 }
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to the limit", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const r = await callFinalize(
      { url: "u", secret: "s", agentId: "a" },
      { artifactId: "x", checksum: null, sizeBytes: 1 },
      { retries: 3, backoffMs: 1 }
    );
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
