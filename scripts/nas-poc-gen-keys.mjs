// Generate an Ed25519 keypair for the NAS PoC.
// - Private key (PKCS8 PEM) stays with the load-test script (it signs JWTs, like the cloud would).
// - Public key (SPKI PEM) goes to the agent via TOKEN_PUBLIC_KEYS.
//
// Run: node scripts/nas-poc-gen-keys.mjs [kid]
// Writes: nas-poc/keys/<kid>.private.pem, nas-poc/keys/<kid>.public.pem
// Prints: the TOKEN_PUBLIC_KEYS env value to paste into the Portainer stack.
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const kid = process.argv[2] || "poc-key-1";
const outDir = path.resolve("nas-poc/keys");
fs.mkdirSync(outDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const privPath = path.join(outDir, `${kid}.private.pem`);
const pubPath = path.join(outDir, `${kid}.public.pem`);
fs.writeFileSync(privPath, privatePem, { mode: 0o600 });
fs.writeFileSync(pubPath, publicPem);

// TOKEN_PUBLIC_KEYS is a JSON array; newlines escaped so it survives a single-line env var.
const tokenPublicKeys = JSON.stringify([{ kid, publicKeyPem: publicPem }]);

console.log(`✔ keypair "${kid}" gerado`);
console.log(`  privada: ${privPath} (mode 600 — NÃO commitar)`);
console.log(`  pública: ${pubPath}`);
console.log("");
console.log("Cole no env do agente (stack do Portainer):");
console.log("");
console.log(`TOKEN_PUBLIC_KEYS=${tokenPublicKeys}`);
console.log("");
console.log(`E use no load-test: NAS_POC_KID=${kid} NAS_POC_PRIVATE_KEY=${privPath}`);
