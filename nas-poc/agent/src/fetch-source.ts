// Busca a origem de uma importação. Esta é a fronteira: o agente vive DENTRO da rede, e buscar
// uma URL que um usuário digitou é, sem trava, uma ferramenta de varredura da LAN operada de fora.
//
// LIMITAÇÃO CONHECIDA (registrada de propósito): conferimos o DNS e depois o `fetch` resolve de
// novo — uma resposta com TTL curtíssimo pode devolver um endereço na primeira consulta e outro na
// segunda (DNS rebinding). Fechar isso exigiria fixar o IP resolvido e falar TLS com SNI manual,
// o que quebra a verificação de certificado do jeito ingênuo. Fica anotado como o buraco que esta
// versão NÃO fecha, em vez de fingir que fecha.

import { lookup as dnsLookup } from "node:dns/promises";

export type FetchFailureCode =
  | "PRIVATE_HOST"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_REFUSED"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "NOT_A_FILE";

export class FetchSourceError extends Error {
  constructor(
    public code: FetchFailureCode,
    message: string
  ) {
    super(message);
    this.name = "FetchSourceError";
  }
}

export function isPrivateAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // multicast e reservados
    return false;
  }
  // Sem dois-pontos não é endereço IPv6 — é nome. Sem esta linha, as regras de prefixo abaixo
  // recusam domínio de verdade: `fdic.gov` cai em /^f[cd]/ e `febraban.com.br` cai em /^fe[89ab]/.
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "::") return true;
  // fe80::/10 — o terceiro nibble vai de 8 a b. `startsWith("fe80")` deixaria passar fe90/fea0/febf.
  if (/^fe[89ab]/.test(host)) return true;
  if (/^f[cd]/.test(host)) return true; // unique-local fc00::/7
  // IPv4 mapeado, NAS DUAS FORMAS. O parser de URL normaliza "::ffff:127.0.0.1" para
  // "::ffff:7f00:1" — reconhecer só a forma decimal deixa o literal passar como público, que é
  // um bypass de SSRF conhecido.
  const dec = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dec) return isPrivateAddress(dec[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hex) {
    const n = ((parseInt(hex[1], 16) << 16) >>> 0) + parseInt(hex[2], 16);
    return isPrivateAddress(
      [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")
    );
  }
  return false;
}

async function defaultLookup(host: string): Promise<string[]> {
  const all = await dnsLookup(host, { all: true });
  return all.map((a) => a.address);
}

export interface FetchSourceDeps {
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export async function fetchSource(
  rawUrl: string,
  opts: {
    maxBytes: number;
    maxRedirects?: number;
    connectTimeoutMs?: number;
  } & FetchSourceDeps
): Promise<{ body: AsyncIterable<Uint8Array>; finalUrl: string }> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const timeout = opts.connectTimeoutMs ?? 15_000;
  const lookup = opts.lookup ?? defaultLookup;
  const doFetch = opts.fetchImpl ?? fetch;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new FetchSourceError("PRIVATE_HOST", `URL inválida: ${current}`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new FetchSourceError("PRIVATE_HOST", `esquema não permitido: ${u.protocol}`);
    }

    const host = u.hostname.toLowerCase();
    // Literal já resolvido, ou nome — os dois passam pela mesma régua.
    const enderecos = isPrivateAddress(host) ? [host] : await lookup(host).catch(() => null);
    if (!enderecos || enderecos.length === 0) {
      throw new FetchSourceError("SOURCE_UNREACHABLE", `não foi possível resolver ${host}`);
    }
    // UM endereço privado basta para recusar: um nome com dois A records, um público e um
    // privado, é o truque mais barato que existe.
    if (enderecos.some(isPrivateAddress)) {
      throw new FetchSourceError("PRIVATE_HOST", `${host} aponta para dentro da rede`);
    }

    let res: Response;
    try {
      res = await doFetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new FetchSourceError("TIMEOUT", `a origem não respondeu em ${timeout}ms`);
      }
      throw new FetchSourceError("SOURCE_UNREACHABLE", err.message);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new FetchSourceError("SOURCE_UNREACHABLE", "redirecionamento sem destino");
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      throw new FetchSourceError("SOURCE_UNREACHABLE", `a origem respondeu ${res.status}`);
    }
    if (!res.ok) {
      throw new FetchSourceError("SOURCE_REFUSED", `a origem respondeu ${res.status}`);
    }

    const declarado = Number(res.headers.get("content-length") ?? "0");
    if (declarado && declarado > opts.maxBytes) {
      throw new FetchSourceError("TOO_LARGE", `origem declara ${declarado} bytes`);
    }
    if (!res.body) throw new FetchSourceError("SOURCE_UNREACHABLE", "resposta sem corpo");

    return { body: res.body as unknown as AsyncIterable<Uint8Array>, finalUrl: current };
  }
  throw new FetchSourceError("TOO_MANY_REDIRECTS", `mais de ${maxRedirects} redirecionamentos`);
}
