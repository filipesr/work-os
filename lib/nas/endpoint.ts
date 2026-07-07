// Endpoint resolver — "corrida no cliente" (client-side race) between the LAN agent and the
// Cloudflare Tunnel. Client-safe (runs in the browser). Reads the two public agent URLs from
// NEXT_PUBLIC_* env (inlined at build time).
//
// v1 policy (spec §"Decisões de escopo"): UPLOAD IS LAN-ONLY. If the LAN agent doesn't answer the
// health probe, upload is DISABLED (the UI explains "precisa de LAN/VPN"). Download prefers LAN and
// falls back to the Tunnel.
//
// FUTURE (v2, not implemented): allow upload to fall back to the Tunnel when off-LAN. That is the
// single extension point marked below — enabling it also requires the tunnel listener to accept
// PUT /v1/uploads + revisiting the WAF "só-GET" rule. See the spec "Fora de escopo (v2)".

export type NasEndpointMode = "lan" | "remote";

const LAN_URL = (process.env.NEXT_PUBLIC_NAS_AGENT_URL_LAN ?? "").replace(/\/+$/, "");
const TUNNEL_URL = (process.env.NEXT_PUBLIC_NAS_AGENT_URL_TUNNEL ?? "").replace(/\/+$/, "");
const HEALTH_TIMEOUT_MS = 400;

export interface NasHealth {
  ok: boolean;
  agentId?: string;
  version?: string;
  writable?: boolean;
  freeBytes?: number;
  maxUploadBytes?: number;
}

export interface UploadEndpoint {
  /** 'lan' when the agent answered on the LAN; 'remote' otherwise. */
  mode: NasEndpointMode;
  /** Base URL to PUT the file to, or null when upload is disabled (no LAN in v1). */
  uploadBaseUrl: string | null;
  uploadEnabled: boolean;
  health: NasHealth | null;
}

/** True quando algum endpoint do agente está configurado no build (LAN e/ou túnel). Se false, o NAS
 *  não foi provisionado neste ambiente — download/upload não têm pra onde ir (esconder/avisar). */
export function nasClientConfigured(): boolean {
  return !!(LAN_URL || TUNNEL_URL);
}

/** Probe the LAN agent once with a short timeout. Returns null on timeout/offline/non-OK. */
export async function probeLanAgent(
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<NasHealth | null> {
  if (!LAN_URL) return null;
  try {
    const res = await fetch(`${LAN_URL}/v1/health`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as NasHealth;
  } catch {
    return null; // não está na LAN / offline / timeout / CORS
  }
}

/**
 * Decide the upload endpoint. v1: LAN-only — without a healthy, writable LAN agent, upload is
 * disabled. The UI should disable the file input and explain that LAN/VPN is required.
 */
export async function resolveUploadEndpoint(): Promise<UploadEndpoint> {
  const health = await probeLanAgent();
  if (health?.ok && health.writable !== false) {
    return { mode: "lan", uploadBaseUrl: LAN_URL, uploadEnabled: true, health };
  }
  // --- v2 extension point ---
  // Here a future version would fall back to the Tunnel for upload:
  //   if (TUNNEL_URL) return { mode: "remote", uploadBaseUrl: TUNNEL_URL, uploadEnabled: true, health: null };
  // Doing so also requires the tunnel to accept PUT /v1/uploads + WAF changes (see spec "Fora de escopo").
  return { mode: "remote", uploadBaseUrl: null, uploadEnabled: false, health: null };
}

/** Download base URL: LAN if the agent answers, otherwise the Tunnel. */
export async function resolveDownloadBaseUrl(): Promise<{
  mode: NasEndpointMode;
  baseUrl: string;
}> {
  const health = await probeLanAgent();
  if (health?.ok) return { mode: "lan", baseUrl: LAN_URL };
  return { mode: "remote", baseUrl: TUNNEL_URL };
}

export const NAS_ENDPOINT_CONFIG = { LAN_URL, TUNNEL_URL, HEALTH_TIMEOUT_MS } as const;
