// Por que estes testes existem: em 26/08/2026 o certificado TLS do agente NAS venceu. O agente
// estava vivo e na LAN, mas o `fetch` do navegador falhou e o probe antigo devolvia `null` para
// QUALQUER falha — a tela disse "Agente não encontrado — conecte-se à LAN/VPN" e o dia foi gasto
// caçando um problema de rede inexistente. Cada caso abaixo trava um motivo distinto no lugar, para
// que nenhuma falha volte a se disfarçar de "não encontrado".

import { describe, it, expect, vi, afterEach } from "vitest";

const LAN = "https://nas-agent-lan.goonmarketing.com";
const HEALTH_URL = `${LAN}/v1/health`;

/** O módulo lê NEXT_PUBLIC_NAS_AGENT_URL_LAN no topo (Next inlina no build), então cada cenário
 *  precisa de um import fresco com o env já ajustado. */
async function loadEndpoint(lanUrl: string) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_NAS_AGENT_URL_LAN = lanUrl;
  return import("@/lib/nas/endpoint");
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** O erro que o navegador realmente entrega quando o transporte falha: um TypeError opaco, sem
 *  qualquer pista de que a causa foi TLS, DNS ou CORS. É a ambiguidade que o probe tem de desatar. */
function failedToFetch() {
  return new TypeError("Failed to fetch");
}

/** `AbortSignal.timeout` rejeita com uma DOMException de nome "TimeoutError". */
function timeoutError() {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_NAS_AGENT_URL_LAN;
});

describe("probeLanAgentDetailed", () => {
  it("agente saudável e gravável → ok com o corpo de saúde", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: true, agentId: "nas-1", writable: true, freeBytes: 999 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    const res = await probeLanAgentDetailed();

    expect(res).toEqual({
      ok: true,
      health: { ok: true, agentId: "nas-1", writable: true, freeBytes: 999 },
    });
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_URL, expect.objectContaining({ method: "GET" }));
  });

  // Ambiente sem NAS provisionado (preview/CI) NÃO é falha: a tela deve dizer "não existe aqui",
  // não "não encontrado na rede" — e não pode nem tentar bater na rede.
  it("sem URL de LAN no build → not-configured, sem tocar na rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint("");

    expect(await probeLanAgentDetailed()).toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // O timeout tem de ser reconhecido ANTES do ramo do TypeError: um agente lento é um problema
  // diferente de um agente inalcançável, e a segunda tentativa (no-cors) só faria esperar de novo.
  it("estouro de prazo → timeout, sem segunda tentativa", async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed(50)).toEqual({ ok: false, reason: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 5xx/4xx significam agente NO AR com serviço quebrado: mandar a pessoa para a VPN seria mentira.
  // O status vai junto porque é ele que aponta para o log certo.
  it("resposta fora de 2xx → http-error com o status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed()).toEqual({ ok: false, reason: "http-error", status: 503 });
  });

  it("200 com ok:false → unhealthy (o agente respondeu, e se declarou indisponível)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false })));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    // O corpo viaja junto: é ele que separa "não grava" de "fora do ar" (ver o bloco no fim).
    expect(await probeLanAgentDetailed()).toEqual({
      ok: false,
      reason: "unhealthy",
      health: { ok: false },
    });
  });

  // Disco cheio / pasta do NAS fora do ar: o agente atende, mas não aceita escrita. É o caso em que
  // "conecte-se à LAN" seria o conselho mais inútil possível — a pessoa já está na LAN.
  it("200 com writable:false → unhealthy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, writable: false })));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed()).toEqual({
      ok: false,
      reason: "unhealthy",
      health: { ok: true, writable: false },
    });
  });

  // --- os dois ramos do TypeError: o núcleo do diagnóstico -------------------------------------
  // Uma requisição no-cors NÃO falha por CORS/PNA, mas ainda falha por TLS/DNS/conexão recusada.
  // Se ela passa, o transporte estava de pé e quem barrou foi o navegador → "blocked".
  it("TypeError + no-cors que resolve → blocked (transporte OK, política do navegador barrou)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(failedToFetch())
      .mockResolvedValueOnce({ type: "opaque", ok: false, status: 0 });
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed()).toEqual({ ok: false, reason: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ mode: "no-cors" });
  });

  // O incidente real: certificado vencido derruba as DUAS tentativas, inclusive a no-cors. É este
  // motivo que a UI traduz em "pode ser o certificado do agente" com a URL para conferir na hora.
  it("TypeError + no-cors que também falha → unreachable (rede, DNS ou certificado)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(failedToFetch());
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed()).toEqual({ ok: false, reason: "unreachable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A segunda tentativa também é curta: um agente que sumiu não pode dobrar a espera da tela.
  it("no-cors que estoura o prazo também vira unreachable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(failedToFetch())
      .mockRejectedValueOnce(timeoutError());
    vi.stubGlobal("fetch", fetchMock);
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    expect(await probeLanAgentDetailed(50)).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("probeLanAgent (compatibilidade)", () => {
  // Chamadores antigos (ex.: resolveDownloadBaseUrl) dependem de receber o corpo de saúde sempre que
  // o agente respondeu 200 — inclusive degradado. Baixar de um NAS com disco cheio continua válido.
  it("devolve o corpo de saúde mesmo quando writable:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, writable: false })));
    const { probeLanAgent } = await loadEndpoint(LAN);

    expect(await probeLanAgent()).toEqual({ ok: true, writable: false });
  });

  it("devolve null quando não há conexão", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failedToFetch()));
    const { probeLanAgent } = await loadEndpoint(LAN);

    expect(await probeLanAgent()).toBeNull();
  });
});

describe("resolveUploadEndpoint", () => {
  // A política v1 (upload só na LAN) não muda; o que passa a viajar junto é o MOTIVO, para a tela
  // parar de dizer "conecte-se à LAN/VPN" quando o problema é outro.
  it("mantém o upload desabilitado, mas carrega o motivo e o status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 502)));
    const { resolveUploadEndpoint } = await loadEndpoint(LAN);

    const ep = await resolveUploadEndpoint();
    expect(ep.uploadEnabled).toBe(false);
    expect(ep.uploadBaseUrl).toBeNull();
    expect(ep.failure).toBe("http-error");
    expect(ep.failureStatus).toBe(502);
  });

  it("habilita o upload com agente saudável e gravável na LAN", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, writable: true })));
    const { resolveUploadEndpoint } = await loadEndpoint(LAN);

    const ep = await resolveUploadEndpoint();
    expect(ep).toMatchObject({ mode: "lan", uploadEnabled: true, uploadBaseUrl: LAN });
    expect(ep.failure).toBeUndefined();
  });
});

describe("mensagens de falha", () => {
  // Motivo sem tradução vira MISSING_MESSAGE na tela — exatamente na hora em que a pessoa mais
  // precisa ler o que aconteceu. O mapa é exaustivo por construção; aqui provamos que ele resolve.
  it("todo motivo tem texto em pt-BR e es-ES", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { NAS_FAILURE_MESSAGE_KEY } = await import("@/lib/nas/failure-message");

    for (const locale of ["pt-BR", "es-ES"]) {
      const tasks = JSON.parse(
        readFileSync(join(process.cwd(), "locales", locale, "tasks.json"), "utf8")
      ) as { nasProbe: Record<string, string> };
      for (const key of Object.values(NAS_FAILURE_MESSAGE_KEY)) {
        expect(tasks.nasProbe[key], `${locale}: tasks.nasProbe.${key}`).toBeTruthy();
      }
    }
  });

  // A URL do agente é o atalho que faltou no incidente: abri-la no navegador mostra o erro de
  // certificado na hora. Ela precisa aparecer no texto de `unreachable`, nos dois idiomas.
  it("o texto de unreachable cita o certificado e a URL do agente", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    for (const [locale, palavra] of [
      ["pt-BR", "certificado"],
      ["es-ES", "certificado"],
    ] as const) {
      const tasks = JSON.parse(
        readFileSync(join(process.cwd(), "locales", locale, "tasks.json"), "utf8")
      ) as { nasProbe: Record<string, string> };
      expect(tasks.nasProbe.unreachable.toLowerCase()).toContain(palavra);
      expect(tasks.nasProbe.unreachable).toContain("{url}");
    }
  });
});

// Regressão: `unhealthy` cobre dois estados que pedem decisões OPOSTAS no download.
// `writable:false` com `ok:true` é disco cheio — a leitura continua boa, então a LAN serve.
// `ok:false` é o agente se declarando fora do ar, e aí o túnel é a aposta melhor. Conflatar os dois
// seria repetir, em miniatura, o erro que este arquivo inteiro existe para não deixar acontecer.
describe("probeLanAgentDetailed — corpo de saúde acompanha a falha", () => {
  it("devolve health em writable:false, para o download saber que dá para ler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, writable: false })));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    const res = await probeLanAgentDetailed();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("unhealthy");
    expect(res.health?.ok).toBe(true); // agente vivo, só não grava
  });

  it("devolve health.ok=false quando o agente se declara fora do ar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false, writable: true })));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    const res = await probeLanAgentDetailed();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("unhealthy");
    expect(res.health?.ok).toBe(false);
  });

  it("não inventa health quando não houve corpo (falha de transporte)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failedToFetch()));
    const { probeLanAgentDetailed } = await loadEndpoint(LAN);

    const res = await probeLanAgentDetailed();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.health).toBeUndefined();
  });
});
