import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, exportSPKI, SignJWT, type KeyLike } from "jose";
import {
  loadKeyStore,
  verifyUploadToken,
  verifyDownloadToken,
  JtiStore,
  TokenError,
} from "../src/token.js";

const KID = "poc-key-1";
let privateKey: KeyLike;
let publicKeyPem: string;

beforeAll(async () => {
  const kp = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = kp.privateKey;
  publicKeyPem = await exportSPKI(kp.publicKey);
});

function keyStore() {
  return loadKeyStore(JSON.stringify([{ kid: KID, publicKeyPem }]));
}

async function signUpload(overrides: Record<string, unknown> = {}, expIn = "5m", kid = KID) {
  return new SignJWT({
    artifactId: "art_1",
    taskId: "task_1",
    nasPath: "Cliente/Campanhas/2026_07_X/videos/f_v01.mov",
    fileName: "f_v01.mov",
    maxSize: 5 * 1024 * 1024 * 1024,
    jti: "jti-" + Math.round(Math.abs(Math.sin(Object.keys(overrides).length + 1)) * 1e9),
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setAudience("nas-agent-upload")
    .setExpirationTime(expIn)
    .sign(privateKey);
}

describe("verifyUploadToken", () => {
  it("accepts a valid token and consumes the jti", async () => {
    const store = await keyStore();
    const jtis = new JtiStore();
    const token = await signUpload({ jti: "jti-valid" });
    const claims = await verifyUploadToken(token, store, jtis);
    expect(claims.artifactId).toBe("art_1");
    expect(jtis.size).toBe(1);
  });

  it("rejects a replayed jti", async () => {
    const store = await keyStore();
    const jtis = new JtiStore();
    const token = await signUpload({ jti: "jti-replay" });
    await verifyUploadToken(token, store, jtis);
    await expect(verifyUploadToken(token, store, jtis)).rejects.toMatchObject({
      code: "JTI_REUSED",
    });
  });

  it("rejects an expired token", async () => {
    const store = await keyStore();
    const token = await signUpload({ jti: "jti-exp" }, "-1s");
    await expect(verifyUploadToken(token, store, new JtiStore())).rejects.toMatchObject({
      code: "EXPIRED",
    });
  });

  it("rejects a wrong audience", async () => {
    const store = await keyStore();
    const token = await new SignJWT({
      artifactId: "a",
      taskId: "t",
      nasPath: "p",
      fileName: "f",
      maxSize: 1,
      jti: "j",
    })
      .setProtectedHeader({ alg: "EdDSA", kid: KID })
      .setAudience("nas-agent-download")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(verifyUploadToken(token, store, new JtiStore())).rejects.toMatchObject({
      code: "WRONG_AUDIENCE",
    });
  });

  it("rejects an unknown kid", async () => {
    const store = await keyStore();
    const token = await signUpload({ jti: "jti-kid" }, "5m", "some-other-kid");
    await expect(verifyUploadToken(token, store, new JtiStore())).rejects.toMatchObject({
      code: "UNKNOWN_KID",
    });
  });

  it("rejects a tampered signature", async () => {
    const store = await keyStore();
    const token = await signUpload({ jti: "jti-tamper" });
    // Flip a character in the payload segment.
    const [h, p, s] = token.split(".");
    const tampered = `${h}.${p.slice(0, -2)}${p.slice(-2) === "AA" ? "BB" : "AA"}.${s}`;
    await expect(verifyUploadToken(tampered, store, new JtiStore())).rejects.toBeInstanceOf(
      TokenError
    );
  });

  it("rejects a token missing a required claim", async () => {
    const store = await keyStore();
    const token = await new SignJWT({
      taskId: "t",
      nasPath: "p",
      fileName: "f",
      maxSize: 1,
      jti: "j2",
    })
      .setProtectedHeader({ alg: "EdDSA", kid: KID })
      .setAudience("nas-agent-upload")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(verifyUploadToken(token, store, new JtiStore())).rejects.toMatchObject({
      code: "CLAIM_MISMATCH",
    });
  });
});

describe("verifyDownloadToken", () => {
  it("accepts a valid, reusable download token (no jti consumption)", async () => {
    const store = await keyStore();
    const token = await new SignJWT({
      artifactId: "art_1",
      nasPath: "Cliente/Campanhas/2026_07_X/videos/f_v01.mov",
      fileName: "f_v01.mov",
      dispositionName: "f_v01.mov",
      sensitivity: "CLIENTE",
      scope: "download",
    })
      .setProtectedHeader({ alg: "EdDSA", kid: KID })
      .setAudience("nas-agent-download")
      .setExpirationTime("2m")
      .sign(privateKey);
    const a = await verifyDownloadToken(token, store);
    const b = await verifyDownloadToken(token, store); // reusable within the window
    expect(a.fileName).toBe("f_v01.mov");
    expect(b.fileName).toBe("f_v01.mov");
  });
});
