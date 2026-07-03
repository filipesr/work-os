// Share token crypto (pure, node:crypto). External share links use a token of the form
//   nas_shr_<publicId>_<secret>
// shown to the creator only once. We persist only `tokenHash = HMAC-SHA256(secret, PEPPER)` and
// compare timing-safe, so a DB leak doesn't reveal working tokens. The publicId indexes the row.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "nas_shr";

export interface ShareTokenParts {
  publicId: string;
  secret: string;
  /** The full token string shown once to the creator. */
  token: string;
}

/** Generate a fresh publicId + secret and the composed token. Hex payloads keep `_` out of the
 * components so the underscore separator stays unambiguous. */
export function generateShareToken(): ShareTokenParts {
  const publicId = randomBytes(9).toString("hex"); // 18 hex chars
  const secret = randomBytes(24).toString("hex"); // 48 hex chars
  return { publicId, secret, token: `${PREFIX}_${publicId}_${secret}` };
}

/** HMAC the secret with the server pepper. Deterministic; stored as tokenHash. */
export function hashShareSecret(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

/** Parse a token string back into its parts, or null if malformed. */
export function parseShareToken(token: string): { publicId: string; secret: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split("_");
  // nas, shr, publicId, secret
  if (parts.length !== 4 || parts[0] !== "nas" || parts[1] !== "shr") return null;
  const [, , publicId, secret] = parts;
  if (!publicId || !secret) return null;
  return { publicId, secret };
}

/** Timing-safe check of a presented secret against the stored hash. */
export function verifyShareSecret(secret: string, pepper: string, storedHash: string): boolean {
  const expected = hashShareSecret(secret, pepper);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
