// NAS runtime config accessor (server-only). Centralizes reading the validated env so actions and
// routes don't each re-parse. Upload/download stay disabled until the required secrets/URLs are set,
// so the app runs fine in environments where the NAS isn't configured yet.

import "server-only";

import { env } from "@/lib/env";
import type { SigningConfig } from "./token";

/** True when the control plane can sign tokens and reach the LAN agent (upload path). */
export function isNasUploadConfigured(): boolean {
  return Boolean(env.NAS_TOKEN_SIGNING_KEY && env.NAS_TOKEN_KID && env.NAS_AGENT_URL_LAN);
}

/** True when external download/share via the tunnel is configured. */
export function isNasTunnelConfigured(): boolean {
  return Boolean(env.NAS_AGENT_URL_TUNNEL && env.NAS_SHARE_BASE_URL);
}

export function getNasSigningConfig(): SigningConfig {
  if (!env.NAS_TOKEN_SIGNING_KEY || !env.NAS_TOKEN_KID) {
    throw new Error("NAS signing key/kid não configurados (NAS_TOKEN_SIGNING_KEY / NAS_TOKEN_KID)");
  }
  return {
    privateKeyPem: env.NAS_TOKEN_SIGNING_KEY,
    kid: env.NAS_TOKEN_KID,
    issuer: env.NAS_TOKEN_ISSUER,
  };
}

export function getFinalizeSecret(): string {
  if (!env.NAS_FINALIZE_SECRET) throw new Error("NAS_FINALIZE_SECRET não configurado");
  return env.NAS_FINALIZE_SECRET;
}

export function getShareTokenPepper(): string {
  if (!env.SHARE_TOKEN_PEPPER) throw new Error("SHARE_TOKEN_PEPPER não configurado");
  return env.SHARE_TOKEN_PEPPER;
}

/** Non-secret config bundle used by actions/routes to build URLs and local links. */
export const nasConfig = {
  agentLanUrl: env.NAS_AGENT_URL_LAN ?? "",
  agentTunnelUrl: env.NAS_AGENT_URL_TUNNEL ?? "",
  shareBaseUrl: env.NAS_SHARE_BASE_URL ?? "",
  smbHost: env.NAS_SMB_HOST ?? "",
  smbShare: env.NAS_SMB_SHARE ?? "",
  uncPrefix: env.NAS_UNC_PREFIX ?? "",
} as const;

// Token lifetimes (seconds).
export const NAS_TOKEN_TTL = {
  upload: 15 * 60, // 15 min to start/finish a PUT
  download: 5 * 60, // short, reusable within the window (Range-friendly)
} as const;

// Share link expiry policy (days).
export const SHARE_EXPIRY = {
  defaultDays: 7,
  maxDays: 30, // exceção MANAGER+ tratada na action
} as const;
