// @vitest-environment node
// Cross-codebase contract tests between the app (control plane) and the NAS agent (data plane).
// The agent's finalize.ts uses only node:crypto (no jose), so it imports cleanly here and we can
// assert both sides agree on the wire format. The upload-token half is verified by replicating the
// agent's documented verifyUploadToken rules with jose (avoids dragging the agent's jose v5).

import { describe, it, expect } from "vitest";
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify } from "jose";
import {
  signUploadToken,
  computeFinalizeSignature,
  verifyFinalizeSignature,
  UPLOAD_AUDIENCE,
} from "@/lib/nas/token";
import { finalizeSignature as agentFinalizeSignature } from "../../../nas-poc/agent/src/finalize";

describe("finalize HMAC contract (app ↔ agent)", () => {
  const secret = "shared-finalize-secret";
  const ts = "1730000000";
  const body = JSON.stringify({
    artifactId: "art1",
    checksum: "abc",
    sizeBytes: 123,
    agentId: "a1",
  });

  it("agent and app compute the identical signature", () => {
    expect(agentFinalizeSignature(secret, ts, body)).toBe(
      computeFinalizeSignature(secret, ts, body)
    );
  });

  it("the app accepts a signature produced by the agent (within the skew window)", () => {
    const sig = agentFinalizeSignature(secret, ts, body);
    const res = verifyFinalizeSignature(secret, ts, body, sig, { nowSeconds: Number(ts) + 5 });
    expect(res.ok).toBe(true);
  });

  it("a wrong shared secret is rejected", () => {
    const sig = agentFinalizeSignature("other-secret", ts, body);
    const res = verifyFinalizeSignature(secret, ts, body, sig, { nowSeconds: Number(ts) + 5 });
    expect(res.ok).toBe(false);
  });
});

describe("upload token contract (app signs → agent-style verify)", () => {
  it("a token signed by the app verifies under EdDSA + the agent audience with all required claims", async () => {
    const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const privateKeyPem = await exportPKCS8(pair.privateKey);
    const publicKey = await importSPKI(await exportSPKI(pair.publicKey), "EdDSA");

    const token = await signUploadToken(
      {
        artifactId: "art1",
        taskId: "t1",
        nasPath: "Cliente/Campanhas/2026_07_X/videos/f.mov",
        fileName: "f.mov",
        maxSize: 1000,
        jti: "j1",
      },
      { privateKeyPem, kid: "k1", issuer: "work-os" },
      300
    );

    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: ["EdDSA"],
      audience: UPLOAD_AUDIENCE,
    });
    expect(protectedHeader.kid).toBe("k1");
    for (const f of ["artifactId", "taskId", "nasPath", "fileName", "jti"] as const) {
      expect(payload[f]).toBeTruthy();
    }
    expect(typeof payload.maxSize).toBe("number");
  });
});
