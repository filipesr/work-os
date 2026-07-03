// NAS PoC load-test + metrification.
//
// Exercises browser->agent uploads (LAN) and tunnel downloads across synthetic clients/campaigns
// and file-size buckets, then reports MB/s, p50/p95 latency and success rate. Also runs a few
// robustness cases (oversize, expired token, replayed jti).
//
// Prereqs:
//   1) Build the agent so the shared path builder is importable:
//        (cd nas-poc/agent && npm install && npm run build)
//   2) Generate keys:  node scripts/nas-poc-gen-keys.mjs
//   3) Start the agent (locally or on the NAS).
//
// Run:
//   NAS_POC_PRIVATE_KEY=nas-poc/keys/poc-key-1.private.pem \
//   AGENT_LAN_URL=http://NAS_IP:8080 \
//   [AGENT_TUNNEL_URL=https://nas-agent-download.dominio] \
//   [PROFILE=smoke|full] [CONCURRENCY=1,2,4] \
//   node scripts/nas-poc-loadtest.mjs
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { Readable } from "node:stream";
import { createPrivateKey, sign as edSign, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

// ---- shared path builder (from the compiled agent) ---------------------------
const distUrl = pathToFileURL(path.resolve("nas-poc/agent/dist/nas-path.js")).href;
let buildNasPath, ALLOWLIST;
try {
  ({ buildNasPath, ALLOWLIST } = await import(distUrl));
} catch {
  console.error("✖ agente não compilado. Rode: (cd nas-poc/agent && npm install && npm run build)");
  process.exit(1);
}

// ---- config ------------------------------------------------------------------
const KID = process.env.NAS_POC_KID || "poc-key-1";
const PRIVATE_KEY_PATH = process.env.NAS_POC_PRIVATE_KEY || `nas-poc/keys/${KID}.private.pem`;
const AGENT_LAN_URL = (process.env.AGENT_LAN_URL || "http://localhost:8080").replace(/\/$/, "");
const AGENT_TUNNEL_URL = (process.env.AGENT_TUNNEL_URL || "").replace(/\/$/, "");
const PROFILE = process.env.PROFILE || "smoke";
const CONCURRENCY = (process.env.CONCURRENCY || "1,2,4").split(",").map(Number).filter(Boolean);

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`✖ chave privada não encontrada: ${PRIVATE_KEY_PATH} (rode nas-poc-gen-keys.mjs)`);
  process.exit(1);
}
const privateKey = createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH));

const MB = 1024 * 1024;
const GB = 1024 * MB;
const PROFILES = {
  // Fast local smoke — validates the full path without moving GBs.
  smoke: [
    { label: "64KB", bytes: 64 * 1024 },
    { label: "1MB", bytes: 1 * MB },
    { label: "4.5MB", bytes: Math.round(4.5 * MB) },
    { label: "16MB", bytes: 16 * MB },
  ],
  // Real buckets — run on the LAN against the NAS.
  full: [
    { label: "1MB", bytes: 1 * MB },
    { label: "4.5MB", bytes: Math.round(4.5 * MB) },
    { label: "150MB", bytes: 150 * MB },
    { label: "1GB", bytes: 1 * GB },
    { label: "5GB", bytes: 5 * GB },
  ],
};
const BUCKETS = PROFILES[PROFILE] || PROFILES.smoke;

// Synthetic matrix — includes accented client names (the Windows/macOS NFC/NFD stress).
const CLIENTS = ["Construções Açaí", "João & Cia", "Padrão Móveis", "Studio Criação"];
const CAMPAIGNS = [
  { year: 2026, month: 7, slug: "Black Friday" },
  { year: 2026, month: 8, slug: "Dia dos Pais" },
];
// media type -> { purpose, ext }
const MEDIA = [
  { type: "VIDEOS", purpose: "Vídeo", ext: "mp4" },
  { type: "FOTOS", purpose: "Ensaio", ext: "jpg" },
  { type: "DOCUMENTOS", purpose: "Proposta", ext: "pdf" },
  { type: "SOCIAL_MEDIA", purpose: "Feed", ext: "png" },
];

// ---- JWT (EdDSA/Ed25519) -----------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signJwt(payload, audience, expSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT", kid: KID };
  const body = { iss: "nas-poc-loadtest", aud: audience, iat: now, exp: now + expSeconds, ...payload };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const signature = edSign(null, Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

// ---- body generator (streams a reused buffer; no giant temp files) -----------
function makeBody(totalBytes) {
  const chunk = Buffer.alloc(Math.min(totalBytes, MB), 0x61); // 'a'
  let remaining = totalBytes;
  return new Readable({
    read() {
      if (remaining <= 0) return this.push(null);
      const n = Math.min(chunk.length, remaining);
      remaining -= n;
      this.push(n === chunk.length ? chunk : chunk.subarray(0, n));
    },
  });
}

// ---- HTTP helpers ------------------------------------------------------------
function agentFor(urlStr) {
  return urlStr.startsWith("https:") ? https : http;
}
function putUpload(baseUrl, artifactId, token, bytes, { overrideBody } = {}) {
  return new Promise((resolve) => {
    const u = new URL(`${baseUrl}/v1/uploads/${artifactId}`);
    const req = agentFor(baseUrl).request(
      u,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": overrideBody != null ? overrideBody : bytes,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, json, ms: Date.now() - t0 });
        });
      },
    );
    req.on("error", (err) => resolve({ status: 0, error: err.message, ms: Date.now() - t0 }));
    const t0 = Date.now();
    makeBody(bytes).pipe(req);
  });
}
function getDownload(baseUrl, token, { range } = {}) {
  return new Promise((resolve) => {
    const u = new URL(`${baseUrl}/v1/download?token=${encodeURIComponent(token)}`);
    const headers = range ? { Range: range } : {};
    const t0 = Date.now();
    const req = agentFor(baseUrl).request(u, { method: "GET", headers }, (res) => {
      let bytes = 0;
      res.on("data", (d) => (bytes += d.length));
      res.on("end", () => resolve({ status: res.statusCode, bytes, ms: Date.now() - t0 }));
    });
    req.on("error", (err) => resolve({ status: 0, error: err.message, ms: Date.now() - t0 }));
    req.end();
  });
}

// ---- metrics -----------------------------------------------------------------
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const rows = [];

// Pick a media type whose allowlist max fits this bucket's size (a 5GB file must be VIDEOS, etc.),
// cycling among the compatible ones. Falls back to VIDEOS (largest) if none match.
function mediaForBucket(bucket, i) {
  const fit = MEDIA.filter((m) => ALLOWLIST[m.type].maxBytes >= bucket.bytes);
  const pool = fit.length ? fit : [MEDIA[0]];
  return pool[i % pool.length];
}
function buildOne(i, bucket) {
  const client = CLIENTS[i % CLIENTS.length];
  const camp = CAMPAIGNS[i % CAMPAIGNS.length];
  const m = mediaForBucket(bucket, i);
  const built = buildNasPath({
    client,
    target: "CAMPANHA",
    mediaType: m.type,
    purpose: m.purpose,
    taskTitle: `Demanda ${bucket.label} ${i}`,
    originalFileName: `bruto.${m.ext}`,
    version: (i % 9) + 1,
    campaignYear: camp.year,
    campaignMonth: camp.month,
    campaignSlug: camp.slug,
  });
  const artifactId = `art_${randomUUID()}`;
  const maxSize = ALLOWLIST[m.type].maxBytes;
  const token = signJwt(
    { artifactId, taskId: `task_${i}`, nasPath: built.relPath, fileName: built.fileName, maxSize, jti: randomUUID() },
    "nas-agent-upload",
    300,
  );
  return { built, artifactId, token, media: m };
}

async function uploadRound(concurrency) {
  console.log(`\n▶ upload — concorrência ${concurrency}`);
  for (const bucket of BUCKETS) {
    const jobs = [];
    for (let i = 0; i < concurrency; i++) {
      const { built, artifactId, token, media } = buildOne(rows.length + i, bucket);
      jobs.push(
        putUpload(AGENT_LAN_URL, artifactId, token, bucket.bytes).then((r) => {
          const mbps = r.status === 201 && r.ms > 0 ? bucket.bytes / MB / (r.ms / 1000) : 0;
          rows.push({
            phase: "upload",
            bucket: bucket.label,
            bytes: bucket.bytes,
            concurrency,
            media: media.type,
            status: r.status,
            ms: r.ms,
            mbps: +mbps.toFixed(1),
            msWrite: r.json?.msWrite ?? "",
            msHash: r.json?.msHash ?? "",
            hashMode: r.json?.hashMode ?? "",
            checksum: r.json?.checksum ?? "",
            nasPath: built.relPath,
            downloadToken:
              r.status === 201
                ? signJwt(
                    {
                      artifactId,
                      nasPath: built.relPath,
                      fileName: built.fileName,
                      dispositionName: built.fileName,
                      sensitivity: "CLIENTE",
                      scope: "download",
                    },
                    "nas-agent-download",
                    120,
                  )
                : null,
          });
          const ok = r.status === 201 ? "✓" : `✗ ${r.status}${r.error ? " " + r.error : ""}`;
          console.log(`  ${ok}  ${bucket.label.padEnd(6)} ${media.type.padEnd(12)} ${r.ms}ms  ${mbps.toFixed(1)} MB/s`);
        }),
      );
    }
    await Promise.all(jobs);
  }
}

async function downloadSample(baseUrl, label) {
  const ready = rows.filter((r) => r.phase === "upload" && r.status === 201 && r.downloadToken);
  if (!ready.length) return;
  const sample = ready.slice(0, Math.min(3, ready.length));
  console.log(`\n▶ download (${label}) — amostra de ${sample.length}`);
  for (const r of sample) {
    const full = await getDownload(baseUrl, r.downloadToken);
    const mbps = full.status < 400 && full.ms > 0 ? full.bytes / MB / (full.ms / 1000) : 0;
    const rangeRes = await getDownload(baseUrl, r.downloadToken, { range: "bytes=0-1048575" });
    rows.push({
      phase: `download-${label}`,
      bucket: r.bucket,
      bytes: full.bytes,
      concurrency: 1,
      media: r.media,
      status: full.status,
      ms: full.ms,
      mbps: +mbps.toFixed(1),
      rangeStatus: rangeRes.status,
      nasPath: r.nasPath,
    });
    console.log(
      `  ${full.status < 400 ? "✓" : "✗"} ${r.bucket.padEnd(6)} full=${full.status} ${mbps.toFixed(1)} MB/s  range=${rangeRes.status} (${rangeRes.bytes}B)`,
    );
  }
}

async function robustness() {
  console.log(`\n▶ robustez`);
  const camp = CAMPAIGNS[0];
  const built = buildNasPath({
    client: CLIENTS[0],
    target: "CAMPANHA",
    mediaType: "DOCUMENTOS",
    purpose: "Proposta",
    taskTitle: "Caso robustez",
    originalFileName: "x.pdf",
    version: 1,
    campaignYear: camp.year,
    campaignMonth: camp.month,
    campaignSlug: camp.slug,
  });
  const mk = (over) => {
    const artifactId = `art_${randomUUID()}`;
    return {
      artifactId,
      token: signJwt(
        {
          artifactId,
          taskId: "t",
          nasPath: built.relPath,
          fileName: built.fileName,
          maxSize: 8 * MB,
          jti: randomUUID(),
          ...over,
        },
        "nas-agent-upload",
        over?.expSeconds ?? 300,
      ),
    };
  };

  // oversize: token maxSize 8MB, send 12MB -> 413
  {
    const { artifactId, token } = mk();
    const r = await putUpload(AGENT_LAN_URL, artifactId, token, 12 * MB);
    console.log(`  oversize (>maxSize)        -> ${r.status} ${r.status === 413 ? "✓" : "✗ esperado 413"}`);
  }
  // expired token -> 401
  {
    const artifactId = `art_${randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: KID }));
    const body = b64url(
      JSON.stringify({
        iss: "x",
        aud: "nas-agent-upload",
        iat: now - 600,
        exp: now - 60,
        artifactId,
        taskId: "t",
        nasPath: built.relPath,
        fileName: built.fileName,
        maxSize: 8 * MB,
        jti: randomUUID(),
      }),
    );
    const si = `${header}.${body}`;
    const token = `${si}.${b64url(edSign(null, Buffer.from(si), privateKey))}`;
    const r = await putUpload(AGENT_LAN_URL, artifactId, token, 1 * MB);
    console.log(`  expired token              -> ${r.status} ${r.status === 401 ? "✓" : "✗ esperado 401"}`);
  }
  // replayed jti -> first 201, second 409
  {
    const jti = randomUUID();
    const a1 = `art_${randomUUID()}`;
    const t1 = signJwt(
      { artifactId: a1, taskId: "t", nasPath: built.relPath, fileName: built.fileName, maxSize: 8 * MB, jti },
      "nas-agent-upload",
      300,
    );
    const first = await putUpload(AGENT_LAN_URL, a1, t1, 512 * 1024);
    const second = await putUpload(AGENT_LAN_URL, a1, t1, 512 * 1024);
    console.log(
      `  replay jti (1ª/2ª)         -> ${first.status}/${second.status} ${first.status === 201 && second.status === 409 ? "✓" : "✗ esperado 201/409"}`,
    );
  }
}

function summarize() {
  console.log(`\n${"=".repeat(64)}\nRESUMO (profile=${PROFILE})\n${"=".repeat(64)}`);
  const uploads = rows.filter((r) => r.phase === "upload");
  for (const c of CONCURRENCY) {
    for (const b of BUCKETS) {
      const set = uploads.filter((r) => r.concurrency === c && r.bucket === b.label);
      if (!set.length) continue;
      const ok = set.filter((r) => r.status === 201);
      const lat = ok.map((r) => r.ms);
      const mbps = ok.map((r) => r.mbps);
      const avgMbps = mbps.length ? (mbps.reduce((a, x) => a + x, 0) / mbps.length).toFixed(1) : "0";
      console.log(
        `upload c=${c} ${b.label.padEnd(6)} sucesso ${ok.length}/${set.length}  ` +
          `MB/s avg ${avgMbps}  p50 ${pct(lat, 50)}ms  p95 ${pct(lat, 95)}ms`,
      );
    }
  }
  // Throughput targets (plan): LAN upload >= 85 MB/s no 5GB; túnel >= 10 MB/s.
  const big = uploads.filter((r) => (r.bucket === "5GB" || r.bucket === "1GB") && r.status === 201);
  if (big.length) {
    const best = Math.max(...big.map((r) => r.mbps));
    console.log(`\nmeta LAN (>=85 MB/s): melhor ${best} MB/s -> ${best >= 85 ? "ATINGE ✓" : "ABAIXO ✗"}`);
  }
  const tun = rows.filter((r) => r.phase === "download-tunnel" && r.status < 400);
  if (tun.length) {
    const best = Math.max(...tun.map((r) => r.mbps));
    console.log(`meta túnel (>=10 MB/s): melhor ${best} MB/s -> ${best >= 10 ? "ATINGE ✓" : "ABAIXO ✗"}`);
  }
}

function writeCsv() {
  const outDir = path.resolve("nas-poc/out");
  fs.mkdirSync(outDir, { recursive: true });
  const cols = [
    "phase", "bucket", "bytes", "concurrency", "media", "status", "ms", "mbps",
    "msWrite", "msHash", "hashMode", "rangeStatus", "nasPath",
  ];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `loadtest-${stamp}.csv`);
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => JSON.stringify(r[c] ?? "")).join(","));
  }
  fs.writeFileSync(file, lines.join("\n"));
  console.log(`\n✔ CSV: ${file}`);
}

// ---- main --------------------------------------------------------------------
console.log(`NAS PoC load-test`);
console.log(`  agente LAN: ${AGENT_LAN_URL}`);
console.log(`  túnel:      ${AGENT_TUNNEL_URL || "(não configurado — pulando download por túnel)"}`);
console.log(`  profile:    ${PROFILE}  buckets: ${BUCKETS.map((b) => b.label).join(", ")}`);
console.log(`  concorrência: ${CONCURRENCY.join(", ")}`);

// Health check first.
try {
  const h = await new Promise((resolve) => {
    const u = new URL(`${AGENT_LAN_URL}/v1/health`);
    agentFor(AGENT_LAN_URL)
      .get(u, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, json: safeJson(d) }));
      })
      .on("error", (e) => resolve({ status: 0, error: e.message }));
  });
  if (h.status !== 200) throw new Error(`health ${h.status} ${h.error || ""}`);
  console.log(`  health: ok — hashMode=${h.json?.hashMode} freeBytes=${h.json?.freeBytes}`);
} catch (e) {
  console.error(`✖ agente indisponível em ${AGENT_LAN_URL}: ${e.message}`);
  process.exit(1);
}

for (const c of CONCURRENCY) await uploadRound(c);
await downloadSample(AGENT_LAN_URL, "lan");
if (AGENT_TUNNEL_URL) await downloadSample(AGENT_TUNNEL_URL, "tunnel");
await robustness();
summarize();
writeCsv();

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
