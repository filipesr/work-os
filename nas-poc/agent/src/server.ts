// NAS PoC agent — data plane. Two listeners:
//   LAN    (0.0.0.0:8080): health, upload (PUT), download.
//   TUNNEL (127.0.0.1:8081): download only — reachable solely via cloudflared on the same host.
//
// Upload path: verify JWT (EdDSA/kid, single-use jti) -> stream to `.uploading-<jti>.tmp`
//   -> enforce size -> atomic rename -> sha256 (mode-dependent) -> 201.
// Download path: verify JWT -> Range-aware stream (200/206/416).

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, statfs } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { loadConfig, safeResolve, type AgentConfig, type HashMode } from "./config.js";
import {
  loadKeyStore,
  verifyUploadToken,
  verifyDownloadToken,
  JtiStore,
  TokenError,
  KeyStore,
} from "./token.js";

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1];
}

async function freeBytesOf(dir: string): Promise<number> {
  try {
    const fs = await statfs(dir);
    return Number(fs.bavail) * Number(fs.bsize);
  } catch {
    return -1;
  }
}

// ---- handlers ----------------------------------------------------------------

async function healthHandler(cfg: AgentConfig, store: KeyStore, reply: FastifyReply) {
  const freeBytes = await freeBytesOf(cfg.nasRoot);
  let writable = false;
  try {
    await stat(cfg.nasRoot);
    writable = freeBytes !== 0;
  } catch {
    writable = false;
  }
  return reply.send({
    ok: true,
    agentId: cfg.agentId,
    version: cfg.version,
    writable,
    freeBytes,
    maxUploadBytes: cfg.maxUploadBytes,
    hashMode: cfg.hashMode,
    kids: store.kids,
  });
}

async function uploadHandler(
  cfg: AgentConfig,
  store: KeyStore,
  jtis: JtiStore,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const token = bearer(req);
  if (!token) return reply.code(401).send({ error: "missing_bearer" });

  let claims;
  try {
    claims = await verifyUploadToken(token, store, jtis);
  } catch (err) {
    const code = err instanceof TokenError ? err.code : "MALFORMED";
    const status = code === "JTI_REUSED" ? 409 : 401;
    return reply.code(status).send({ error: code, message: (err as Error).message });
  }

  const artifactId = (req.params as { artifactId: string }).artifactId;
  if (artifactId !== claims.artifactId) {
    return reply.code(400).send({ error: "artifact_mismatch" });
  }

  let finalPath: string;
  try {
    finalPath = safeResolve(cfg.nasRoot, claims.nasPath);
  } catch (err) {
    return reply.code(400).send({ error: "bad_path", message: (err as Error).message });
  }

  const maxSize = Math.min(claims.maxSize, cfg.maxUploadBytes);
  const declaredLen = Number(req.headers["content-length"] ?? "0");
  if (declaredLen && declaredLen > maxSize) {
    return reply.code(413).send({ error: "too_large", maxSize });
  }

  const tmpPath = `${finalPath}.uploading-${claims.jti}.tmp`;
  await mkdir(path.dirname(finalPath), { recursive: true });

  const hash = cfg.hashMode === "off" ? null : createHash("sha256");
  const ws = createWriteStream(tmpPath);
  let bytes = 0;
  const tWrite = Date.now();

  try {
    for await (const chunk of req.raw as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (bytes > maxSize) {
        ws.destroy();
        await safeUnlink(tmpPath);
        return reply.code(413).send({ error: "too_large", maxSize });
      }
      if (cfg.hashMode === "inline" && hash) hash.update(chunk);
      if (!ws.write(chunk)) await once(ws, "drain");
    }
    ws.end();
    await finished(ws);
  } catch (err) {
    // Client disconnect / stream error — the temp file never becomes final.
    ws.destroy();
    await safeUnlink(tmpPath);
    req.log.warn({ err: (err as Error).message, tmpPath }, "upload aborted");
    return reply.code(499).send({ error: "aborted" });
  }
  const msWrite = Date.now() - tWrite;

  // Atomic publish.
  await rename(tmpPath, finalPath);

  // Checksum according to the measurement mode.
  let checksum: string | null = null;
  let msHash = 0;
  if (cfg.hashMode === "inline" && hash) {
    checksum = hash.digest("hex");
  } else if (cfg.hashMode === "deferred") {
    const tHash = Date.now();
    checksum = await hashFile(finalPath);
    msHash = Date.now() - tHash;
  }

  return reply.code(201).send({
    checksum,
    sizeBytes: bytes,
    storedAt: new Date().toISOString(),
    msWrite,
    msHash,
    hashMode: cfg.hashMode,
  });
}

async function downloadHandler(
  cfg: AgentConfig,
  store: KeyStore,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const token = (req.query as { token?: string }).token ?? bearer(req);
  if (!token) return reply.code(401).send({ error: "missing_token" });

  let claims;
  try {
    claims = await verifyDownloadToken(token, store);
  } catch (err) {
    const code = err instanceof TokenError ? err.code : "MALFORMED";
    return reply.code(401).send({ error: code, message: (err as Error).message });
  }

  let filePath: string;
  try {
    filePath = safeResolve(cfg.nasRoot, claims.nasPath);
  } catch {
    return reply.code(400).send({ error: "bad_path" });
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return reply.code(404).send({ error: "not_found" });
  }

  const disposition = sanitizeDisposition(claims.dispositionName || claims.fileName);
  reply.header("Accept-Ranges", "bytes");
  reply.header("Content-Disposition", disposition);
  reply.header("Content-Type", "application/octet-stream");

  const range = req.headers.range;
  if (range) {
    const r = resolveRange(range, size);
    if (!r.satisfiable) {
      return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    }
    reply.code(206);
    reply.header("Content-Range", `bytes ${r.start}-${r.end}/${size}`);
    reply.header("Content-Length", r.end - r.start + 1);
    return reply.send(createReadStream(filePath, { start: r.start, end: r.end }));
  }

  reply.code(200);
  reply.header("Content-Length", size);
  return reply.send(createReadStream(filePath));
}

// ---- app wiring --------------------------------------------------------------

function registerRawParser(app: FastifyInstance) {
  // Never buffer bodies — we stream request.raw ourselves.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_req, _payload, done) => done(null, undefined));
}

async function buildLanApp(
  cfg: AgentConfig,
  store: KeyStore,
  jtis: JtiStore
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: cfg.maxUploadBytes });
  registerRawParser(app);
  await app.register(cors, {
    origin: cfg.allowedOrigins.includes("*") ? true : cfg.allowedOrigins,
  });
  app.get("/v1/health", (_req, reply) => healthHandler(cfg, store, reply));
  app.put("/v1/uploads/:artifactId", (req, reply) => uploadHandler(cfg, store, jtis, req, reply));
  app.get("/v1/download", (req, reply) => downloadHandler(cfg, store, req, reply));
  return app;
}

async function buildTunnelApp(cfg: AgentConfig, store: KeyStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  registerRawParser(app);
  // Tunnel exposes ONLY download. Everything else -> 404 (defense in depth; the CF ingress
  // path rule and a WAF method rule are the outer layers).
  app.get("/v1/download", (req, reply) => downloadHandler(cfg, store, req, reply));
  return app;
}

async function main() {
  const cfg = loadConfig();
  const store = await loadKeyStore(cfg.tokenPublicKeysRaw);
  const jtis = new JtiStore();

  const lan = await buildLanApp(cfg, store, jtis);
  const tunnel = await buildTunnelApp(cfg, store);

  await lan.listen({ host: cfg.lanHost, port: cfg.lanPort });
  await tunnel.listen({ host: cfg.tunnelHost, port: cfg.tunnelPort });

  lan.log.info(
    { nasRoot: cfg.nasRoot, hashMode: cfg.hashMode, kids: store.kids },
    `agent up — LAN ${cfg.lanHost}:${cfg.lanPort}, TUNNEL ${cfg.tunnelHost}:${cfg.tunnelPort}`
  );

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      await Promise.allSettled([lan.close(), tunnel.close()]);
      process.exit(0);
    });
  }
}

// ---- utils -------------------------------------------------------------------

async function safeUnlink(p: string): Promise<void> {
  try {
    await rm(p, { force: true });
  } catch {
    /* ignore */
  }
}

async function hashFile(p: string): Promise<string> {
  const h = createHash("sha256");
  await finished(createReadStream(p).on("data", (c) => h.update(c)));
  return h.digest("hex");
}

// RFC 7233 single-range resolver. 416 only when the start is unsatisfiable; a too-large end is
// clamped to size-1. Handles suffix ranges ("bytes=-N").
export function resolveRange(
  rangeHeader: string,
  size: number
): { satisfiable: boolean; start: number; end: number } {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m || (m[1] === "" && m[2] === "")) return { satisfiable: false, start: 0, end: 0 };
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix form "bytes=-N" — the last N bytes. N >= size returns the whole file.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Number(m[2]);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= size) {
    return { satisfiable: false, start: 0, end: 0 };
  }
  if (end >= size) end = size - 1;
  return { satisfiable: true, start, end };
}

// RFC 6266: filename* UTF-8 + ASCII fallback, stripped of CR/LF/quotes.
export function sanitizeDisposition(name: string): string {
  const clean = name.replace(/[\r\n"]/g, "").trim() || "download";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(clean);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Only boot when run directly (so tests can import handlers/utils without starting listeners).
import { fileURLToPath } from "node:url";
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("agent failed to start:", err);
    process.exit(1);
  });
}
