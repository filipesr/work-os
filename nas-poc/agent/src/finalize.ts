// Finalize callback (agent -> cloud). After a file is stored (temp->rename->sha256), the agent
// POSTs to the cloud's /api/artifacts/finalize to flip the artifact PENDING/UPLOADING -> READY.
//
// Auth contract (must match the app's lib/nas/token verifyFinalizeSignature):
//   X-NAS-Timestamp: <unix seconds>
//   X-NAS-Signature: HMAC-SHA256(FINALIZE_SECRET, `${timestamp}.${rawBody}`) as hex
// The cloud rejects timestamps outside ±300s and mismatched signatures (timing-safe).

import { createHmac } from "node:crypto";

export interface FinalizeConfig {
  url: string;
  secret: string;
  agentId: string;
}

export interface FinalizePayload {
  artifactId: string;
  checksum: string | null;
  sizeBytes: number;
}

export function finalizeSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export interface FinalizeResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Call the cloud finalize endpoint with retry/backoff. 4xx (except 429) is terminal — no retry.
 * Best-effort: the caller stores the file regardless; a failed finalize is logged and the cloud's
 * reconcile cron / a later retry closes the loop.
 */
export async function callFinalize(
  cfg: FinalizeConfig,
  payload: FinalizePayload,
  opts: { retries?: number; backoffMs?: number } = {}
): Promise<FinalizeResult> {
  const body = JSON.stringify({ ...payload, agentId: cfg.agentId });
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 300;
  let lastErr = "";

  for (let i = 0; i < retries; i++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = finalizeSignature(cfg.secret, timestamp, body);
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nas-timestamp": timestamp,
          "x-nas-signature": signature,
        },
        body,
        // Nuvem lenta não pode pendurar o worker/upload.
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true, status: res.status };
      lastErr = `status ${res.status}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status, error: lastErr };
      }
    } catch (e) {
      lastErr = (e as Error).message;
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
  }
  return { ok: false, error: lastErr };
}
