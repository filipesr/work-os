// JWT verification (EdDSA, multiple public keys by `kid`) — port of the spec's token model
// (Apêndice A). The cloud signs; the agent only verifies. Upload tokens are single-use (jti);
// download tokens are reusable within their short window.

import { importSPKI, jwtVerify, type JWTPayload, type KeyLike, errors } from "jose";

const ALG = "EdDSA";

export interface PublicKeyConfigEntry {
  kid: string;
  /** SPKI PEM ("-----BEGIN PUBLIC KEY-----..."). */
  publicKeyPem: string;
}

/** Resolve a raw env value (JSON array of {kid, publicKeyPem}) into imported keys by kid. */
export async function loadKeyStore(rawJson: string): Promise<KeyStore> {
  let entries: PublicKeyConfigEntry[];
  try {
    entries = JSON.parse(rawJson);
  } catch {
    throw new Error("TOKEN_PUBLIC_KEYS não é JSON válido");
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("TOKEN_PUBLIC_KEYS deve ser um array não-vazio de {kid, publicKeyPem}");
  }
  const map = new Map<string, KeyLike>();
  for (const e of entries) {
    if (!e.kid || !e.publicKeyPem) throw new Error("entrada de chave sem kid/publicKeyPem");
    // Tolerate escaped newlines when pasted through a single-line env var.
    const pem = e.publicKeyPem.replace(/\\n/g, "\n");
    map.set(e.kid, await importSPKI(pem, ALG));
  }
  return new KeyStore(map);
}

export class KeyStore {
  constructor(private readonly keys: Map<string, KeyLike>) {}
  get(kid: string | undefined): KeyLike | undefined {
    return kid ? this.keys.get(kid) : undefined;
  }
  get kids(): string[] {
    return [...this.keys.keys()];
  }
}

export class TokenError extends Error {
  constructor(
    public code:
      | "MALFORMED"
      | "UNKNOWN_KID"
      | "BAD_SIGNATURE"
      | "EXPIRED"
      | "WRONG_AUDIENCE"
      | "JTI_REUSED"
      | "CLAIM_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export interface UploadTokenClaims extends JWTPayload {
  artifactId: string;
  taskId: string;
  nasPath: string;
  fileName: string;
  maxSize: number;
  jti: string;
}

export interface DownloadTokenClaims extends JWTPayload {
  artifactId: string;
  nasPath: string;
  fileName: string;
  dispositionName: string;
  sensitivity: string;
  scope: string;
}

async function verify(token: string, store: KeyStore, audience: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        const key = store.get(header.kid);
        if (!key)
          throw new TokenError("UNKNOWN_KID", `kid desconhecido: ${header.kid ?? "(ausente)"}`);
        return key;
      },
      { algorithms: [ALG], audience }
    );
    return payload;
  } catch (err) {
    if (err instanceof TokenError) throw err;
    if (err instanceof errors.JWTExpired) throw new TokenError("EXPIRED", "token expirado");
    if (err instanceof errors.JWTClaimValidationFailed)
      throw new TokenError("WRONG_AUDIENCE", "audience/claims inválidos");
    if (err instanceof errors.JWSSignatureVerificationFailed)
      throw new TokenError("BAD_SIGNATURE", "assinatura inválida");
    throw new TokenError("MALFORMED", `token malformado: ${(err as Error).message}`);
  }
}

/** Estrutural: qualquer store de jti (in-memory ou persistente) que saiba reivindicar um jti. */
export interface JtiClaimer {
  claim(jti: string, exp?: number): boolean;
}

export async function verifyUploadToken(
  token: string,
  store: KeyStore,
  jtiStore: JtiClaimer
): Promise<UploadTokenClaims> {
  const payload = (await verify(token, store, "nas-agent-upload")) as UploadTokenClaims;
  for (const f of ["artifactId", "taskId", "nasPath", "fileName", "jti"] as const) {
    if (!payload[f]) throw new TokenError("CLAIM_MISMATCH", `claim obrigatório ausente: ${f}`);
  }
  if (typeof payload.maxSize !== "number" || payload.maxSize <= 0) {
    throw new TokenError("CLAIM_MISMATCH", "maxSize ausente ou inválido");
  }
  // Single-use enforcement — reject replays of a jti already seen.
  if (!jtiStore.claim(payload.jti, payload.exp)) {
    throw new TokenError("JTI_REUSED", `jti já utilizado: ${payload.jti}`);
  }
  return payload;
}

export async function verifyDownloadToken(
  token: string,
  store: KeyStore
): Promise<DownloadTokenClaims> {
  const payload = (await verify(token, store, "nas-agent-download")) as DownloadTokenClaims;
  for (const f of ["artifactId", "nasPath", "fileName"] as const) {
    if (!payload[f]) throw new TokenError("CLAIM_MISMATCH", `claim obrigatório ausente: ${f}`);
  }
  return payload;
}

/**
 * In-memory single-use jti tracker. Production uses SQLite (survives restarts); for the viability
 * PoC an in-process map keyed by jti with lazy expiry is enough.
 */
export class JtiStore {
  private readonly seen = new Map<string, number>(); // jti -> exp (epoch seconds)

  /** Returns false if the jti was already claimed (replay). */
  claim(jti: string, exp?: number): boolean {
    this.sweep();
    if (this.seen.has(jti)) return false;
    // Keep until token expiry (fallback: 1h) so a replay after natural expiry is still caught by exp.
    const keepUntil = exp ?? Math.floor(nowSeconds()) + 3600;
    this.seen.set(jti, keepUntil);
    return true;
  }

  private sweep(): void {
    const now = nowSeconds();
    for (const [jti, exp] of this.seen) {
      if (exp < now) this.seen.delete(jti);
    }
  }

  get size(): number {
    return this.seen.size;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
