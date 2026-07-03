import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { callFinalize, finalizeSignature } from "../src/finalize.js";

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
