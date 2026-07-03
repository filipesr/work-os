// NAS token signing (cloud side) — the control plane SIGNS; the agent VERIFIES (the verify half
// lives in the agent, ported from nas-poc/agent/src/token.ts). EdDSA (Ed25519) with `kid` for
// rotation. Upload tokens are single-use (jti, enforced by the agent); download tokens are reusable
// within their short window. Finalize (agent -> cloud) is authenticated by an HMAC over a timestamp
// + raw body, with a small skew window.
//
// server-only: the private signing key and finalize secret must never reach the client bundle.

import "server-only";

import { SignJWT, importPKCS8, type CryptoKey } from "jose";
import { createHmac, timingSafeEqual } from "node:crypto";

const ALG = "EdDSA";

export const UPLOAD_AUDIENCE = "nas-agent-upload";
export const DOWNLOAD_AUDIENCE = "nas-agent-download";

export interface SigningConfig {
  /** PKCS8 PEM private key ("-----BEGIN PRIVATE KEY-----..."). Newlines may be escaped. */
  privateKeyPem: string;
  kid: string;
  issuer: string;
}

export interface UploadTokenClaims {
  artifactId: string;
  taskId: string;
  nasPath: string;
  fileName: string;
  maxSize: number;
  /** Single-use id — the agent rejects replays. */
  jti: string;
}

export interface DownloadTokenClaims {
  artifactId: string;
  nasPath: string;
  fileName: string;
  /** Content-Disposition filename presented to the browser. */
  dispositionName: string;
  sensitivity: string;
  scope?: string;
  /** Subject (user id) for internal downloads, or the share link id for public shares. */
  sub?: string;
  shareLinkId?: string;
}

async function loadPrivateKey(pkcs8Pem: string): Promise<CryptoKey> {
  return importPKCS8(pkcs8Pem.replace(/\\n/g, "\n"), ALG);
}

/** Sign an upload token (aud = nas-agent-upload). Short-lived; single-use via jti. */
export async function signUploadToken(
  claims: UploadTokenClaims,
  cfg: SigningConfig,
  expSeconds: number
): Promise<string> {
  const key = await loadPrivateKey(cfg.privateKeyPem);
  const { jti, ...rest } = claims;
  return new SignJWT({ ...rest })
    .setProtectedHeader({ alg: ALG, kid: cfg.kid })
    .setIssuedAt()
    .setIssuer(cfg.issuer)
    .setAudience(UPLOAD_AUDIENCE)
    .setExpirationTime(`${expSeconds}s`)
    .setJti(jti)
    .sign(key);
}

/** Sign a download token (aud = nas-agent-download). Reusable within its short window. */
export async function signDownloadToken(
  claims: DownloadTokenClaims,
  cfg: SigningConfig,
  expSeconds: number
): Promise<string> {
  const key = await loadPrivateKey(cfg.privateKeyPem);
  const { sub, ...rest } = claims;
  const jwt = new SignJWT({ scope: "download", ...rest })
    .setProtectedHeader({ alg: ALG, kid: cfg.kid })
    .setIssuedAt()
    .setIssuer(cfg.issuer)
    .setAudience(DOWNLOAD_AUDIENCE)
    .setExpirationTime(`${expSeconds}s`);
  if (sub) jwt.setSubject(sub);
  return jwt.sign(key);
}

// --- Finalize HMAC (agent -> cloud) -----------------------------------------------------------

/** Canonical string that both sides HMAC: `${timestamp}.${rawBody}`. */
function finalizeSigningInput(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export function computeFinalizeSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac("sha256", secret)
    .update(finalizeSigningInput(timestamp, rawBody))
    .digest("hex");
}

export interface FinalizeVerifyResult {
  ok: boolean;
  reason?: "BAD_TIMESTAMP" | "SKEW" | "BAD_SIGNATURE";
}

/**
 * Verify a finalize request. `nowSeconds` is injectable for tests. Rejects timestamps outside
 * ±maxSkewSeconds (default 300s) and mismatched signatures (timing-safe).
 */
export function verifyFinalizeSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  providedSignatureHex: string,
  opts: { maxSkewSeconds?: number; nowSeconds?: number } = {}
): FinalizeVerifyResult {
  const maxSkew = opts.maxSkewSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "BAD_TIMESTAMP" };
  if (Math.abs(now - ts) > maxSkew) return { ok: false, reason: "SKEW" };

  const expected = computeFinalizeSignature(secret, timestamp, rawBody);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSignatureHex, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "BAD_SIGNATURE" };
  return { ok: true };
}
