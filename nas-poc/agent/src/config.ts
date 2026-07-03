// Agent runtime config, parsed from env once at boot.
import path from "node:path";

export type HashMode = "inline" | "deferred" | "off";

export interface AgentConfig {
  agentId: string;
  version: string;
  nasRoot: string;
  lanPort: number;
  lanHost: string;
  tunnelPort: number;
  tunnelHost: string;
  maxUploadBytes: number;
  hashMode: HashMode;
  allowedOrigins: string[];
  tokenPublicKeysRaw: string;
  // Cloud finalize callback (agent -> cloud). Optional: when unset the agent just stores + 201s
  // (PoC/load-test mode). When set, after storing it POSTs to the cloud to flip PENDING -> READY.
  cloudFinalizeUrl?: string;
  finalizeSecret?: string;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} inválido: "${v}"`);
  return n;
}

export function loadConfig(): AgentConfig {
  const nasRoot = process.env.NAS_ROOT;
  if (!nasRoot) throw new Error("NAS_ROOT é obrigatório (ex.: /data ou /volume1/WorkOS-PoC)");
  const tokenPublicKeysRaw = process.env.TOKEN_PUBLIC_KEYS;
  if (!tokenPublicKeysRaw)
    throw new Error("TOKEN_PUBLIC_KEYS é obrigatório (JSON [{kid, publicKeyPem}])");

  const hashModeRaw = (process.env.POC_HASH_MODE ?? "inline").toLowerCase();
  if (!["inline", "deferred", "off"].includes(hashModeRaw)) {
    throw new Error(`POC_HASH_MODE deve ser inline|deferred|off, recebido "${hashModeRaw}"`);
  }

  return {
    agentId: process.env.AGENT_ID ?? "nas-poc-agent",
    version: process.env.AGENT_VERSION ?? "0.1.0",
    nasRoot: path.resolve(nasRoot),
    lanPort: num("LAN_PORT", 8080),
    lanHost: process.env.LAN_HOST ?? "0.0.0.0",
    tunnelPort: num("TUNNEL_PORT", 8081),
    // Bind the tunnel listener to loopback so only cloudflared (same host) can reach it.
    tunnelHost: process.env.TUNNEL_HOST ?? "127.0.0.1",
    maxUploadBytes: num("MAX_UPLOAD_BYTES", 5 * 1024 * 1024 * 1024),
    hashMode: hashModeRaw as HashMode,
    allowedOrigins: (process.env.ALLOWED_ORIGIN ?? "*")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    tokenPublicKeysRaw,
    cloudFinalizeUrl: process.env.CLOUD_FINALIZE_URL || undefined,
    finalizeSecret: process.env.FINALIZE_SECRET || undefined,
  };
}

/**
 * Resolve a token-provided relative nasPath safely inside NAS_ROOT.
 * Rejects absolute paths, "..", and anything escaping the root.
 */
export function safeResolve(nasRoot: string, relPath: string): string {
  if (!relPath || relPath.trim() === "") throw new Error("nasPath vazio");
  if (path.isAbsolute(relPath)) throw new Error("nasPath não pode ser absoluto");
  const normalized = path.normalize(relPath);
  if (normalized.split(/[\\/]/).some((seg) => seg === "..")) {
    throw new Error("nasPath contém '..'");
  }
  const abs = path.resolve(nasRoot, normalized);
  const rootWithSep = nasRoot.endsWith(path.sep) ? nasRoot : nasRoot + path.sep;
  if (abs !== nasRoot && !abs.startsWith(rootWithSep)) {
    throw new Error("nasPath escapa de NAS_ROOT");
  }
  return abs;
}
