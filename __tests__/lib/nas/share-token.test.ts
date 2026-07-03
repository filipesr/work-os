import { describe, it, expect } from "vitest";
import {
  generateShareToken,
  hashShareSecret,
  parseShareToken,
  verifyShareSecret,
} from "@/lib/nas/share-token";

const PEPPER = "pepper-secreto";

describe("generateShareToken", () => {
  it("produces a nas_shr_<publicId>_<secret> token that round-trips through parse", () => {
    const { publicId, secret, token } = generateShareToken();
    expect(token).toBe(`nas_shr_${publicId}_${secret}`);
    expect(parseShareToken(token)).toEqual({ publicId, secret });
  });

  it("is unique across calls", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe("parseShareToken", () => {
  it("rejects malformed tokens", () => {
    expect(parseShareToken("nope")).toBeNull();
    expect(parseShareToken("nas_shr_only3")).toBeNull();
    expect(parseShareToken("foo_bar_a_b")).toBeNull();
    // extra underscores in secret would break the 4-part split — guarded by generator using base64url
    expect(parseShareToken("nas_shr__b")).toBeNull();
  });
});

describe("hashShareSecret / verifyShareSecret", () => {
  it("hash is deterministic and pepper-dependent", () => {
    const { secret } = generateShareToken();
    expect(hashShareSecret(secret, PEPPER)).toBe(hashShareSecret(secret, PEPPER));
    expect(hashShareSecret(secret, PEPPER)).not.toBe(hashShareSecret(secret, "outro-pepper"));
  });

  it("verifies the right secret and rejects the wrong one (timing-safe)", () => {
    const { secret } = generateShareToken();
    const stored = hashShareSecret(secret, PEPPER);
    expect(verifyShareSecret(secret, PEPPER, stored)).toBe(true);
    expect(verifyShareSecret(secret + "x", PEPPER, stored)).toBe(false);
    expect(verifyShareSecret(secret, "pepper-errado", stored)).toBe(false);
  });

  it("rejects a stored hash of the wrong length without throwing", () => {
    const { secret } = generateShareToken();
    expect(verifyShareSecret(secret, PEPPER, "abcd")).toBe(false);
  });
});
