// Setup de PRODUÇÃO do fluxo NAS. Gera o par Ed25519 + segredos e imprime/escreve os DOIS blocos de
// env já com o domínio real: (1) app na Vercel, (2) .env do agente no NAS. Rode no dia do deploy.
//
// Uso:   node scripts/nas-prod-setup.mjs [kid]
//        APP_DOMAIN / AGENT_LAN_HOST / AGENT_DL_HOST podem sobrescrever os defaults.
//
// Saída (gitignored): nas-poc/keys/<kid>.{private,public}.pem + nas-poc/out/prod/{app.env,agent.env}
// A chave privada assina no app (NAS_TOKEN_SIGNING_KEY); a pública verifica no agente
// (TOKEN_PUBLIC_KEYS). NUNCA commitar chaves/segredos.

import { generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const kid = process.argv[2] || "prod-1";
const APP = process.env.APP_DOMAIN || "workos.goonmarketing.com";
const LAN_HOST = process.env.AGENT_LAN_HOST || "nas-agent-lan.goonmarketing.com";
const DL_HOST = process.env.AGENT_DL_HOST || "nas-agent-download.goonmarketing.com";

const root = process.cwd();
const keysDir = path.resolve(root, "nas-poc/keys");
const outDir = path.resolve(root, "nas-poc/out/prod");
fs.mkdirSync(keysDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
fs.writeFileSync(path.join(keysDir, `${kid}.private.pem`), privatePem, { mode: 0o600 });
fs.writeFileSync(path.join(keysDir, `${kid}.public.pem`), publicPem);

const finalizeSecret = randomBytes(24).toString("hex");
const sharePepper = randomBytes(24).toString("hex");
const reconcileToken = randomBytes(24).toString("hex");
const cronSecret = randomBytes(24).toString("hex");
const tokenPublicKeys = JSON.stringify([{ kid, publicKeyPem: publicPem }]);
const signingKeyEnv = privatePem.replace(/\n/g, "\\n"); // single-line p/ env (o app desescapa)

const appEnv = `# --- App (Vercel, Production) — vercel env add / dashboard. Domínio: ${APP} ---
NAS_TOKEN_SIGNING_KEY="${signingKeyEnv}"
NAS_TOKEN_KID=${kid}
NAS_TOKEN_ISSUER=${APP}
NAS_FINALIZE_SECRET=${finalizeSecret}
SHARE_TOKEN_PEPPER=${sharePepper}
NAS_AGENT_URL_LAN=https://${LAN_HOST}
NAS_AGENT_URL_TUNNEL=https://${DL_HOST}
NAS_SHARE_BASE_URL=https://${APP}/api/artifacts/share
NAS_UNC_PREFIX=\\\\NAS\\WorkOS
NAS_SMB_HOST=<IP-ou-host-SMB-do-NAS>
NAS_SMB_SHARE=WorkOS
NEXT_PUBLIC_NAS_AGENT_URL_LAN=https://${LAN_HOST}
NEXT_PUBLIC_NAS_AGENT_URL_TUNNEL=https://${DL_HOST}
CRON_SECRET=${cronSecret}
`;
fs.writeFileSync(path.join(outDir, "app.env"), appEnv);

const agentEnv = `# --- Agente (NAS): .env do docker-compose de produção (agent + cloudflared) ---
NAS_SHARE_PATH=/volume1/WorkOS
AGENT_UID=<uid svc-nasagent>
AGENT_GID=<gid svc-nasagent>
POC_HASH_MODE=inline
MAX_UPLOAD_BYTES=5368709120
STATE_DIR=/data/.agent-state
ALLOWED_ORIGIN=https://${APP}
CLOUD_FINALIZE_URL=https://${APP}/api/artifacts/finalize
FINALIZE_SECRET=${finalizeSecret}
RECONCILE_TOKEN=${reconcileToken}
TOKEN_PUBLIC_KEYS=${tokenPublicKeys}
TUNNEL_TOKEN=<token do Cloudflare Zero Trust>
`;
fs.writeFileSync(path.join(outDir, "agent.env"), agentEnv);

console.log(`✔ Setup de produção gerado (kid=${kid}, app=${APP}).\n`);
console.log(`  chaves: nas-poc/keys/${kid}.{private,public}.pem   (gitignored, mode 600)`);
console.log(`  blocos: nas-poc/out/prod/app.env  +  nas-poc/out/prod/agent.env  (gitignored)\n`);
console.log("Próximos passos:");
console.log("  1) App:   suba app.env no Vercel (Production). NAS_FINALIZE_SECRET == FINALIZE_SECRET do agente.");
console.log("  2) Agente: preencha os <placeholders> do agent.env (uid/gid, SMB host, TUNNEL_TOKEN) e");
console.log("     use no .env do nas-poc/docker-compose.yml (agent + cloudflared).");
console.log("  3) DNS/TLS/túnel: siga docs/nas-rollout-checklist.md §4–5.");
console.log("\n⚠️  Segredos e chave privada gerados. NÃO commitar (nas-poc/keys e nas-poc/out são gitignored).");
