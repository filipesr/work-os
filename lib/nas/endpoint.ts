// Endpoint resolver — "corrida no cliente" (client-side race) between the LAN agent and the
// Cloudflare Tunnel. Client-safe (runs in the browser). Reads the two public agent URLs from
// NEXT_PUBLIC_* env (inlined at build time).
//
// v1 policy (spec §"Decisões de escopo"): UPLOAD IS LAN-ONLY. If the LAN agent doesn't answer the
// health probe, upload is DISABLED (the UI explains "precisa de LAN/VPN"). Download prefers LAN and
// falls back to the Tunnel.
//
// FUTURE (v2, not implemented): allow upload to fall back to the Tunnel when off-LAN. That is the
// single extension point marked below — enabling it also requires the tunnel listener to accept
// PUT /v1/uploads + revisiting the WAF "só-GET" rule. See the spec "Fora de escopo (v2)".

export type NasEndpointMode = "lan" | "remote";

const LAN_URL = (process.env.NEXT_PUBLIC_NAS_AGENT_URL_LAN ?? "").replace(/\/+$/, "");
const TUNNEL_URL = (process.env.NEXT_PUBLIC_NAS_AGENT_URL_TUNNEL ?? "").replace(/\/+$/, "");
const HEALTH_TIMEOUT_MS = 400;

export interface NasHealth {
  ok: boolean;
  agentId?: string;
  version?: string;
  writable?: boolean;
  freeBytes?: number;
  maxUploadBytes?: number;
}

/**
 * Por que um motivo discriminado, e não só "não encontrado": em 26/08/2026 o certificado TLS do
 * agente venceu. O agente estava vivo, na LAN, respondendo — mas o navegador recusou o handshake, o
 * probe devolveu `null` e a tela disse "conecte-se à LAN/VPN". Horas de caça a um problema de rede
 * que não existia. O navegador não nos entrega a causa exata (por segurança, um `fetch` que falha
 * no transporte é sempre um `TypeError` opaco), então o contrato aqui é honesto sobre o que dá para
 * afirmar: `unreachable` significa "não subiu conexão — rede, DNS OU certificado", e é a UI que
 * lembra do certificado.
 */
export type NasProbeFailure =
  | "not-configured" // NEXT_PUBLIC_NAS_AGENT_URL_LAN vazio (build sem NAS provisionado)
  | "timeout" // não respondeu no prazo
  | "unreachable" // não foi possível estabelecer a conexão (rede, DNS ou TLS/certificado)
  | "blocked" // o servidor respondeu, mas o navegador barrou (CORS / Private Network Access)
  | "http-error" // respondeu com status fora de 2xx
  | "unhealthy"; // respondeu 200, mas ok:false ou writable:false

export type NasProbeResult =
  | { ok: true; health: NasHealth }
  // `health` viaja junto quando o agente CHEGOU a responder um corpo válido: é o que permite
  // distinguir "sem espaço para gravar" (leitura segue OK) de "o agente se declarou fora do ar".
  | { ok: false; reason: NasProbeFailure; status?: number; health?: NasHealth };

export interface UploadEndpoint {
  /** 'lan' when the agent answered on the LAN; 'remote' otherwise. */
  mode: NasEndpointMode;
  /** Base URL to PUT the file to, or null when upload is disabled (no LAN in v1). */
  uploadBaseUrl: string | null;
  uploadEnabled: boolean;
  health: NasHealth | null;
  /** Por que o upload está desabilitado — preenchido só quando `uploadEnabled` é false. */
  failure?: NasProbeFailure;
  /** Status HTTP que acompanha `failure === "http-error"`; a mensagem cita o número. */
  failureStatus?: number;
}

/** True quando algum endpoint do agente está configurado no build (LAN e/ou túnel). Se false, o NAS
 *  não foi provisionado neste ambiente — download/upload não têm pra onde ir (esconder/avisar). */
export function nasClientConfigured(): boolean {
  return !!(LAN_URL || TUNNEL_URL);
}

/** `AbortSignal.timeout` rejeita com DOMException "TimeoutError"; um abort manual, "AbortError".
 *  Checamos pelo nome porque a instância varia entre navegador, jsdom e Node. */
function isAbortLike(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Falha de transporte do `fetch` — sempre um TypeError opaco ("Failed to fetch"). */
function isTransportError(err: unknown): boolean {
  return err instanceof TypeError || (err as { name?: string } | null)?.name === "TypeError";
}

/**
 * Segunda tentativa que separa `blocked` de `unreachable`.
 *
 * Uma requisição `mode: "no-cors"` NUNCA falha por CORS/PNA (o navegador simplesmente devolve uma
 * resposta opaca), mas continua falhando por DNS, conexão recusada ou certificado inválido. Então:
 * se ela resolve, o transporte estava de pé e quem barrou foi a política do navegador (`blocked`);
 * se ela também estoura, não houve conexão nenhuma (`unreachable`).
 *
 * Só é chamada depois de um TypeError — isto é, depois de uma falha RÁPIDA (o caso lento já saiu
 * pelo ramo do timeout) —, e com o mesmo prazo curto, para não dobrar a espera de forma perceptível.
 */
async function classifyTransportFailure(url: string, timeoutMs: number): Promise<NasProbeResult> {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: false, reason: "blocked" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Probe cru: devolve o motivo E o corpo de saúde, quando houve corpo. As duas funções públicas
 *  abaixo são vistas disto — assim uma única ida à rede serve às duas. */
async function probeLanAgentRaw(
  timeoutMs: number
): Promise<{ result: NasProbeResult; health: NasHealth | null }> {
  if (!LAN_URL) return { result: { ok: false, reason: "not-configured" }, health: null };
  const url = `${LAN_URL}/v1/health`;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      return { result: { ok: false, reason: "http-error", status: res.status }, health: null };
    }
    const health = (await res.json()) as NasHealth;
    // `writable:false` = disco cheio ou pasta do NAS fora do ar: o agente responde, mas não aceita
    // envio. Vale um motivo próprio para a UI não mandar ninguém procurar cabo de rede.
    if (!health?.ok || health.writable === false) {
      return { result: { ok: false, reason: "unhealthy", health }, health };
    }
    return { result: { ok: true, health }, health };
  } catch (err) {
    // A ordem importa: o timeout tem de ser reconhecido ANTES do ramo do TypeError, senão uma espera
    // estourada seria reclassificada como problema de conexão.
    if (isAbortLike(err)) return { result: { ok: false, reason: "timeout" }, health: null };
    if (isTransportError(err)) {
      return { result: await classifyTransportFailure(url, timeoutMs), health: null };
    }
    // JSON malformado e afins: o agente respondeu, mas não do jeito combinado.
    return { result: { ok: false, reason: "unhealthy" }, health: null };
  }
}

/** Probe do agente na LAN com motivo de falha legível. Prefira esta em telas novas. */
export async function probeLanAgentDetailed(
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<NasProbeResult> {
  return (await probeLanAgentRaw(timeoutMs)).result;
}

/** Probe the LAN agent once with a short timeout. Returns null on timeout/offline/non-OK.
 *  Mantida com a semântica antiga (corpo de saúde quando o agente respondeu 200, mesmo degradado)
 *  para não mexer em quem já depende dela; quem precisa do motivo usa `probeLanAgentDetailed`. */
export async function probeLanAgent(
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<NasHealth | null> {
  return (await probeLanAgentRaw(timeoutMs)).health;
}

/**
 * Decide the upload endpoint. v1: LAN-only — without a healthy, writable LAN agent, upload is
 * disabled. The UI should disable the file input and explain that LAN/VPN is required.
 */
export async function resolveUploadEndpoint(): Promise<UploadEndpoint> {
  const probe = await probeLanAgentDetailed();
  if (probe.ok) {
    return { mode: "lan", uploadBaseUrl: LAN_URL, uploadEnabled: true, health: probe.health };
  }
  // --- v2 extension point ---
  // Here a future version would fall back to the Tunnel for upload:
  //   if (TUNNEL_URL) return { mode: "remote", uploadBaseUrl: TUNNEL_URL, uploadEnabled: true, health: null };
  // Doing so also requires the tunnel to accept PUT /v1/uploads + WAF changes (see spec "Fora de escopo").
  // A política não muda; o que passa adiante é o MOTIVO, para a tela dizer o que fazer.
  return {
    mode: "remote",
    uploadBaseUrl: null,
    uploadEnabled: false,
    health: null,
    failure: probe.reason,
    failureStatus: probe.status,
  };
}

/** Download base URL: LAN if the agent answers, otherwise the Tunnel. */
export async function resolveDownloadBaseUrl(): Promise<{
  mode: NasEndpointMode;
  baseUrl: string;
}> {
  const health = await probeLanAgent();
  if (health?.ok) return { mode: "lan", baseUrl: LAN_URL };
  return { mode: "remote", baseUrl: TUNNEL_URL };
}

export const NAS_ENDPOINT_CONFIG = { LAN_URL, TUNNEL_URL, HEALTH_TIMEOUT_MS } as const;
