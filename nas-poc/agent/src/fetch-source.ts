// Busca a origem de uma importação. Esta é a fronteira: o agente vive DENTRO da rede, e buscar
// uma URL que um usuário digitou é, sem trava, uma ferramenta de varredura da LAN operada de fora.
//
// LIMITAÇÃO CONHECIDA (registrada de propósito): conferimos o DNS e depois o `fetch` resolve de
// novo — uma resposta com TTL curtíssimo pode devolver um endereço na primeira consulta e outro na
// segunda (DNS rebinding). Fechar isso exigiria fixar o IP resolvido e falar TLS com SNI manual,
// o que quebra a verificação de certificado do jeito ingênuo. Fica anotado como o buraco que esta
// versão NÃO fecha, em vez de fingir que fecha.
//
// `isPrivateAddress` também não é uma prova: é uma lista de faixas reservadas conhecidas. Ela cobre
// as formas de endereço documentadas abaixo (decimal, IPv6 nas variações que canonicalizamos), mas
// não é — e não pretende ser — uma demonstração formal de que todo endereço interno cai nela.

import { lookup as dnsLookup } from "node:dns/promises";

export type FetchFailureCode =
  | "PRIVATE_HOST"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_REFUSED"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "NOT_A_FILE"
  | "SOURCE_STALLED";

export class FetchSourceError extends Error {
  constructor(
    public code: FetchFailureCode,
    message: string
  ) {
    super(message);
    this.name = "FetchSourceError";
  }
}

function isPrivateIpv4Octets(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true; // multicast e reservados
  return false;
}

// Canonicaliza um literal IPv6 (sem colchetes, minúsculo, contém ":") para 8 grupos de 16 bits.
// Expande "::", completa a notação mista com IPv4 pontuado ("::ffff:1.2.3.4") em dois grupos hex,
// e devolve null quando a string não é um endereço reconhecível. Fazer isso uma vez, em vez de
// mais um regex por forma, é o ponto: um regex por forma é exatamente como a lista de exceções
// cresceu incompleta da primeira vez.
function ipv6ToGroups(input: string): number[] | null {
  let host = input;
  const lastColon = host.lastIndexOf(":");
  const tail = host.slice(lastColon + 1);
  const v4Tail = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(tail);
  if (v4Tail) {
    const parts = v4Tail.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    const hi = ((parts[0] << 8) | parts[1]).toString(16);
    const lo = ((parts[2] << 8) | parts[3]).toString(16);
    host = host.slice(0, lastColon + 1) + hi + ":" + lo;
  }

  const halves = host.split("::");
  if (halves.length > 2) return null;

  let groups: string[];
  if (halves.length === 2) {
    const head = halves[0] ? halves[0].split(":") : [];
    const tailGroups = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    groups = host.split(":");
  }
  if (groups.length !== 8) return null;

  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function ipv4FromGroups(hi: number, lo: number): [number, number, number, number] {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
}

function isPrivateIpv6Groups(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true; // "::" — não especificado
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // "::1" — loopback
  const first = g[0];
  if (first >= 0xfe80 && first <= 0xfebf) return true; // link-local, fe80::/10
  if ((first & 0xfe00) === 0xfc00) return true; // unique-local, fc00::/7
  if (first >= 0xfec0 && first <= 0xfeff) return true; // site-local (deprecated), fec0::/10
  if (first >>> 8 === 0xff) return true; // multicast, ff00::/8
  // IPv4-mapped: 0:0:0:0:0:ffff:a.b.c.d
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPrivateIpv4Octets(ipv4FromGroups(g[6], g[7]));
  }
  // IPv4-translated: 0:0:0:0:ffff:0:a.b.c.d
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0xffff && g[5] === 0) {
    return isPrivateIpv4Octets(ipv4FromGroups(g[6], g[7]));
  }
  // IPv4-compatible: 0:0:0:0:0:0:a.b.c.d (::/:: e ::1 já saíram acima)
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isPrivateIpv4Octets(ipv4FromGroups(g[6], g[7]));
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    return isPrivateIpv4Octets([Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])]);
  }
  // Sem dois-pontos não é endereço IPv6 — é nome. Sem esta linha, as regras de prefixo abaixo
  // recusam domínio de verdade: `fdic.gov` cai em /^f[cd]/ e `febraban.com.br` cai em /^fe[89ab]/.
  if (!host.includes(":")) return false;
  const groups = ipv6ToGroups(host);
  // Ininteligível não é "não é a régua de endereço que decide" — é a régua recusando por
  // definição. Um endereço que esta função não sabe canonicalizar (ex.: zona "%eth0") tem que
  // falhar para o lado fechado (privado), nunca para o lado aberto (público).
  if (!groups) return true;
  return isPrivateIpv6Groups(groups);
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
    /** Prazo até os CABEÇALHOS chegarem (cobre a busca inteira, todos os saltos — não um por salto). */
    connectTimeoutMs?: number;
    /** Prazo de OCIOSIDADE do corpo: aborta se nenhum pedaço novo chegar por este tanto de tempo.
     *  NÃO é um teto de duração total — uma origem lenta mas viva (vídeo grande, rede ruim) tem
     *  que conseguir terminar; só o silêncio mata. */
    idleTimeoutMs?: number;
  } & FetchSourceDeps
): Promise<{ body: AsyncIterable<Uint8Array>; finalUrl: string }> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const connectTimeoutMs = opts.connectTimeoutMs ?? 15_000;
  const idleTimeoutMs = opts.idleTimeoutMs ?? 15_000;
  const lookup = opts.lookup ?? defaultLookup;
  const doFetch = opts.fetchImpl ?? fetch;

  // AbortController próprio (não AbortSignal.timeout): o prazo de cabeçalho é UM cronômetro para
  // a busca inteira, não um por salto — senão o teto real vira maxRedirects × connectTimeoutMs.
  // Ele é cancelado assim que os cabeçalhos da resposta final chegam; dali em diante quem manda é
  // a ociosidade do CORPO (ver `withIdleTimeout`), rearmada a cada pedaço — nunca um teto absoluto
  // de transferência, que mataria todo download que passasse de `connectTimeoutMs` no total.
  const controller = new AbortController();
  const headerTimer = setTimeout(() => controller.abort(), connectTimeoutMs);
  headerTimer.unref?.();

  try {
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

      // hostname de um literal IPv6 vem COM colchetes ("[2606:2800::1]"); tirá-los aqui é o que
      // faz um endereço público literal resolver, em vez de estourar ENOTFOUND na DNS.
      const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
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
          signal: controller.signal,
        });
      } catch (e) {
        const err = e as Error;
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          throw new FetchSourceError("TIMEOUT", `a origem não respondeu em ${connectTimeoutMs}ms`);
        }
        throw new FetchSourceError("SOURCE_UNREACHABLE", err.message);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new FetchSourceError("SOURCE_UNREACHABLE", "redirecionamento sem destino");
        }
        // A origem é hostil por definição: um Location malformado não pode escapar como TypeError
        // cru, fora do contrato FetchSourceError que quem chama este módulo espera tratar.
        try {
          current = new URL(location, current).toString();
        } catch {
          throw new FetchSourceError("SOURCE_UNREACHABLE", `Location inválido: ${location}`);
        }
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

      // Cabeçalhos da resposta final chegaram: o prazo de conexão cumpriu o papel dele. Cancela
      // ANTES de devolver o corpo — dali em diante só a ociosidade (por pedaço) pode abortar, o
      // corpo inteiro não tem mais teto absoluto de tempo.
      clearTimeout(headerTimer);

      const body = withIdleTimeout(
        res.body as unknown as AsyncIterable<Uint8Array>,
        idleTimeoutMs,
        controller
      );
      return { body, finalUrl: current };
    }
    throw new FetchSourceError("TOO_MANY_REDIRECTS", `mais de ${maxRedirects} redirecionamentos`);
  } finally {
    clearTimeout(headerTimer);
  }
}

// Envolve o corpo com ociosidade: se nenhum pedaço novo chegar em `idleTimeoutMs`, aborta com
// SOURCE_STALLED — não é um teto de duração total (uma origem lenta mas viva tem que conseguir
// terminar), é um teto de SILÊNCIO (uma origem que travou tem que morrer rápido). O cronômetro é
// rearmado a cada pedaço: só o intervalo ENTRE pedaços conta, nunca o tempo acumulado.
function withIdleTimeout(
  body: AsyncIterable<Uint8Array>,
  idleTimeoutMs: number,
  controller: AbortController
): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = body[Symbol.asyncIterator]();
      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          const proximo = iterator.next();
          let timer: ReturnType<typeof setTimeout>;
          const ociosidade = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              // ORDEM IMPORTA: rejeita ANTES de abortar. `controller.abort()` erra o stream do
              // undici de forma SÍNCRONA — se ele rodasse primeiro, a promessa de `proximo` já
              // estaria rejeitada com AbortError quando chamássemos `reject`, e o Promise.race
              // entregaria o AbortError genérico (não o FetchSourceError). A esteira perderia o
              // código SOURCE_STALLED, caindo no fallback StoreError("ABORTED") -> WRITE_FAILED —
              // exatamente a mensagem enganosa que este código existe para evitar.
              reject(
                new FetchSourceError(
                  "SOURCE_STALLED",
                  `a origem parou de mandar bytes por ${idleTimeoutMs}ms`
                )
              );
              // Cancela a leitura de verdade (libera a conexão) — o fetch real trata isso como
              // abort da requisição inteira, mas a essa altura os cabeçalhos já foram entregues e
              // publicados; só o corpo é afetado.
              controller.abort();
            }, idleTimeoutMs);
          });
          try {
            return await Promise.race([proximo, ociosidade]);
          } finally {
            clearTimeout(timer!);
            // A leitura original pode rejeitar mais tarde por causa do abort acima — isso não
            // pode escapar como unhandled rejection, já que quem "venceu" foi o nosso erro.
            proximo.catch(() => {});
          }
        },
        async return(value?: unknown): Promise<IteratorResult<Uint8Array>> {
          if (iterator.return) {
            return (await iterator.return(value)) as IteratorResult<Uint8Array>;
          }
          return { done: true, value } as IteratorResult<Uint8Array>;
        },
      };
    },
  };
}
