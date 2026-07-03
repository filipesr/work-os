// @vitest-environment node
// jose signs via WebCrypto over Uint8Array; jsdom's cross-realm Uint8Array breaks jose's
// instanceof checks, so this suite runs in the node environment (matches the real server runtime).
import { describe, it, expect, beforeAll } from "vitest";
import {
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  importSPKI,
  jwtVerify,
  decodeProtectedHeader,
  type CryptoKey,
} from "jose";
import {
  signUploadToken,
  signDownloadToken,
  computeFinalizeSignature,
  verifyFinalizeSignature,
  UPLOAD_AUDIENCE,
  DOWNLOAD_AUDIENCE,
} from "@/lib/nas/token";

const ISSUER = "work-os";
const KID = "nas-key-1";

let privateKeyPem: string;
let publicKey: CryptoKey;
// A second, unrelated key to stand in for "wrong kid / rotated-out key".
let otherPublicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKeyPem = await exportPKCS8(pair.privateKey);
  publicKey = await importSPKI(await exportSPKI(pair.publicKey), "EdDSA");

  const other = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  otherPublicKey = await importSPKI(await exportSPKI(other.publicKey), "EdDSA");
});

const cfg = () => ({ privateKeyPem, kid: KID, issuer: ISSUER });

describe("signUploadToken", () => {
  const claims = {
    artifactId: "art_1",
    taskId: "task_1",
    nasPath: "Cliente/Campanhas/2026_07_X/videos/file.mov",
    fileName: "file.mov",
    maxSize: 5 * 1024 * 1024 * 1024,
    jti: "jti-abc",
  };

  it("signs a verifiable EdDSA token with the right audience, kid and claims", async () => {
    const token = await signUploadToken(claims, cfg(), 300);

    expect(decodeProtectedHeader(token).kid).toBe(KID);

    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      audience: UPLOAD_AUDIENCE,
      issuer: ISSUER,
      algorithms: ["EdDSA"],
    });
    expect(protectedHeader.alg).toBe("EdDSA");
    expect(payload.artifactId).toBe("art_1");
    expect(payload.maxSize).toBe(claims.maxSize);
    expect(payload.jti).toBe("jti-abc");
    expect(payload.aud).toBe(UPLOAD_AUDIENCE);
  });

  it("fails verification against a different (rotated-out) key — rotation by kid", async () => {
    const token = await signUploadToken(claims, cfg(), 300);
    await expect(
      jwtVerify(token, otherPublicKey, { audience: UPLOAD_AUDIENCE, algorithms: ["EdDSA"] })
    ).rejects.toThrow();
  });

  it("is rejected when verified against the wrong audience", async () => {
    const token = await signUploadToken(claims, cfg(), 300);
    await expect(
      jwtVerify(token, publicKey, { audience: DOWNLOAD_AUDIENCE, algorithms: ["EdDSA"] })
    ).rejects.toThrow();
  });

  it("is rejected once expired", async () => {
    const token = await signUploadToken(claims, cfg(), 60);
    await expect(
      jwtVerify(token, publicKey, {
        audience: UPLOAD_AUDIENCE,
        algorithms: ["EdDSA"],
        currentDate: new Date(Date.now() + 10 * 60 * 1000), // 10 min no futuro
      })
    ).rejects.toThrow();
  });
});

describe("signDownloadToken", () => {
  it("signs a download token with scope=download and subject", async () => {
    const token = await signDownloadToken(
      {
        artifactId: "art_2",
        nasPath: "Cliente/Institucional/logos/marca.svg",
        fileName: "marca.svg",
        dispositionName: "marca.svg",
        sensitivity: "CLIENTE",
        sub: "user_9",
      },
      cfg(),
      120
    );
    const { payload } = await jwtVerify(token, publicKey, {
      audience: DOWNLOAD_AUDIENCE,
      algorithms: ["EdDSA"],
    });
    expect(payload.scope).toBe("download");
    expect(payload.sub).toBe("user_9");
    expect(payload.sensitivity).toBe("CLIENTE");
  });
});

describe("finalize HMAC", () => {
  const secret = "s3cr3t-finalize";
  const body = JSON.stringify({ artifactId: "art_1", checksum: "abc", sizeBytes: 123 });

  it("computes a stable signature and verifies within the skew window", () => {
    const ts = "1000000";
    const sig = computeFinalizeSignature(secret, ts, body);
    expect(sig).toBe(computeFinalizeSignature(secret, ts, body)); // deterministic
    const res = verifyFinalizeSignature(secret, ts, body, sig, { nowSeconds: 1000010 });
    expect(res.ok).toBe(true);
  });

  it("rejects a signature outside the skew window", () => {
    const ts = "1000000";
    const sig = computeFinalizeSignature(secret, ts, body);
    const res = verifyFinalizeSignature(secret, ts, body, sig, {
      nowSeconds: 1000000 + 3600,
      maxSkewSeconds: 300,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("SKEW");
  });

  it("rejects a tampered body (bad signature)", () => {
    const ts = "1000000";
    const sig = computeFinalizeSignature(secret, ts, body);
    const res = verifyFinalizeSignature(secret, ts, body + "x", sig, { nowSeconds: 1000010 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects a non-numeric timestamp", () => {
    const res = verifyFinalizeSignature(secret, "not-a-number", body, "00", {
      nowSeconds: 1000010,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("BAD_TIMESTAMP");
  });
});
