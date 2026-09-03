// Leitura da origem de uma importação. PURO — sem rede, sem DNS: serve para o app recusar cedo,
// com mensagem útil, o que nem valeria a pena mandar para o agente. A trava de verdade contra
// varredura da LAN resolve o DNS e vive no agente (nas-poc/agent/src/fetch-source.ts), porque só
// lá se sabe para onde um nome público realmente aponta.

export type ImportUrlProblem = "MALFORMED" | "SCHEME" | "PRIVATE_HOST" | "NO_FILE_NAME";

export const IMPORT_FAILURE_CODES = [
  "TOO_LARGE",
  "NOT_A_FILE",
  "EXECUTABLE",
  "SOURCE_UNREACHABLE",
  "SOURCE_REFUSED",
  "PRIVATE_HOST",
  "TOO_MANY_REDIRECTS",
  "TIMEOUT",
  "WRITE_FAILED",
] as const;

export type ImportFailureCode = (typeof IMPORT_FAILURE_CODES)[number];

/** Nome de arquivo que a URL promete, ou null quando o caminho não termina em algo com extensão. */
export function deriveFileNameFromUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const last = u.pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* percent-encoding inválido: fica o cru */
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name;
}

// Literais que não precisam de DNS para serem recusados.
const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost"]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local (metadata de nuvem)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
  const mapped = /^::ffff:(.+)$/.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function checkImportUrl(
  rawUrl: string
): { ok: true; url: URL } | { ok: false; reason: ImportUrlProblem } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "SCHEME" };
  }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { ok: false, reason: "PRIVATE_HOST" };
  }
  if (!deriveFileNameFromUrl(rawUrl)) {
    return { ok: false, reason: "NO_FILE_NAME" };
  }
  return { ok: true, url: u };
}
