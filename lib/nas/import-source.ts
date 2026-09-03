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
  // Sem dois-pontos não é endereço IPv6 — é nome. Sem esta linha, as regras de prefixo abaixo
  // recusam domínio de verdade: `fdic.gov` casa com /^f[cd]/ e `febraban.com.br` com /^fe[89ab]/.
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true;
  // fe80::/10 — o terceiro nibble vai de 8 a b, não só 0.
  if (/^fe[89ab]/.test(h)) return true;
  if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
  // IPv4 mapeado, NAS DUAS FORMAS: o parser de URL normaliza "::ffff:127.0.0.1" para
  // "::ffff:7f00:1", então reconhecer só a decimal deixa o literal passar como público.
  const dec = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (dec) return isPrivateIpv4(dec[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const n = ((parseInt(hex[1], 16) << 16) >>> 0) + parseInt(hex[2], 16);
    return isPrivateIpv4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
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

/** Chave de i18n (em `errors.artifact`) para cada recusa de URL. */
export const URL_PROBLEM_KEY: Record<ImportUrlProblem, string> = {
  MALFORMED: "importMalformedUrl",
  SCHEME: "importSchemeNotAllowed",
  PRIVATE_HOST: "importPrivateHost",
  NO_FILE_NAME: "importNoFileName",
};
