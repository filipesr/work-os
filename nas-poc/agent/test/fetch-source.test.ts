import { describe, it, expect, vi } from "vitest";
import { fetchSource, isPrivateAddress } from "../src/fetch-source.js";

describe("isPrivateAddress", () => {
  it("recusa toda a família privada", () => {
    const privados = [
      "127.0.0.1",
      "127.53.1.2",
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.254",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.0.1",
      "192.168.200.216",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::",
      "fe80::1",
      "fe90::1",
      "febf::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:192.168.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      // Conserto 1 — formas de endereço IPv6 interno que a régua por regex não cobria.
      "::7f00:1", // IPv4-compatible (127.0.0.1 embutido)
      "::ffff:0:7f00:1", // IPv4-translated (127.0.0.1 embutido)
      "ff00::1", // multicast, ff00::/8
      "fec0::1", // site-local (deprecated), fec0::/10
      "0:0:0:0:0:0:0:1", // loopback na forma expandida
    ];
    for (const ip of privados) expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("aceita público", () => {
    for (const ip of [
      "8.8.8.8",
      "172.32.0.1",
      "172.15.0.1",
      "93.184.216.34",
      "2606:2800::1",
      // Vizinhos de faixa do lado IPv6, para não bloquear demais: abaixo de fe80 (link-local),
      // abaixo de fc00 (unique-local) e entre unique-local e link-local não são privados.
      "fe7f::1",
      "fbff::1",
      "fe00::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("não confunde NOME com endereço", () => {
    // As regras de prefixo IPv6 são de endereço, não de string. Sem a guarda do dois-pontos,
    // `fdic.gov` casa com /^f[cd]/ e `febraban.com.br` com /^fe[89ab]/ — domínios reais recusados
    // como "host privado", que é o defeito inverso do que a trava existe para impedir.
    for (const nome of ["febraban.com.br", "fdic.gov", "fcuk.com", "fe80.exemplo.com"]) {
      expect(isPrivateAddress(nome), nome).toBe(false);
    }
  });

  it("recusa um endereço com zona que ela não sabe interpretar (falhar para o lado fechado)", () => {
    // Hoje isso é inalcançável a partir de fetchSource (o parser de URL rejeita a zona antes de
    // chegar aqui), mas isPrivateAddress é exportada e um endereço ininteligível precisa ser
    // recusado por definição — não tratado como público por omissão.
    expect(isPrivateAddress("fe80::1%eth0")).toBe(true);
  });
});

describe("fetchSource", () => {
  const base = {
    maxBytes: 10_000_000,
    lookup: async () => ["93.184.216.34"],
  };
  const ok = () => new Response(new ReadableStream(), { status: 200 });

  it("recusa esquema que não seja http/https", async () => {
    await expect(fetchSource("file:///etc/passwd", base)).rejects.toMatchObject({
      code: "PRIVATE_HOST",
    });
  });

  it("recusa quando o DNS aponta para dentro da rede", async () => {
    const lookup = async () => ["192.168.200.216"];
    const fetchImpl = vi.fn();
    await expect(
      fetchSource("https://parece-publico.com/a.jpg", { ...base, lookup, fetchImpl })
    ).rejects.toMatchObject({ code: "PRIVATE_HOST" });
    expect(fetchImpl).not.toHaveBeenCalled(); // nem chegou a bater na porta
  });

  it("recusa quando QUALQUER endereço do nome é privado", async () => {
    // Um nome com dois A records, um público e um privado, é o truque mais barato que existe.
    const lookup = async () => ["93.184.216.34", "10.0.0.5"];
    await expect(fetchSource("https://x.com/a.jpg", { ...base, lookup })).rejects.toMatchObject({
      code: "PRIVATE_HOST",
    });
  });

  it("reconfere a cada salto: público que redireciona para dentro é recusado", async () => {
    const lookup = async (h: string) => (h === "publico.com" ? ["93.184.216.34"] : ["10.0.0.5"]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://interno.local/a.jpg" } })
    );
    await expect(
      fetchSource("https://publico.com/a.jpg", { ...base, lookup, fetchImpl })
    ).rejects.toMatchObject({ code: "PRIVATE_HOST" });
  });

  it("para depois do limite de saltos", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://outro.com/a.jpg" } })
    );
    await expect(
      fetchSource("https://x.com/a.jpg", { ...base, maxRedirects: 2, fetchImpl })
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // original + 2 saltos
  });

  it("recusa cedo quando o Content-Length já estoura o teto", async () => {
    const fetchImpl = async () =>
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "content-length": "999999999" },
      });
    await expect(
      fetchSource("https://x.com/a.jpg", { ...base, maxBytes: 1000, fetchImpl })
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("traduz o status da origem", async () => {
    for (const [status, code] of [
      [403, "SOURCE_REFUSED"],
      [404, "SOURCE_REFUSED"],
      [500, "SOURCE_UNREACHABLE"],
    ] as const) {
      const fetchImpl = async () => new Response(null, { status });
      await expect(
        fetchSource("https://x.com/a.jpg", { ...base, fetchImpl })
      ).rejects.toMatchObject({ code });
    }
  });

  it("traduz o estouro de tempo", async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    };
    await expect(fetchSource("https://x.com/a.jpg", { ...base, fetchImpl })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("devolve o corpo quando está tudo certo", async () => {
    const r = await fetchSource("https://x.com/a.jpg", { ...base, fetchImpl: ok });
    expect(r.finalUrl).toBe("https://x.com/a.jpg");
  });

  // Conserto 1: a origem é hostil por definição — um Location malformado não pode escapar
  // como TypeError cru, fora do contrato FetchSourceError.
  it("traduz Location malformado no salto para SOURCE_UNREACHABLE (não deixa o TypeError escapar)", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "http://[bad" } })
    );
    await expect(fetchSource("https://x.com/a.jpg", { ...base, fetchImpl })).rejects.toMatchObject({
      code: "SOURCE_UNREACHABLE",
    });
  });

  // Conserto 2: hostname.toLowerCase() de um literal IPv6 vem COM colchetes; passar isso direto
  // para o lookup faz um endereço público ser recusado como "inalcançável" por engano.
  it("resolve host IPv6 literal público sem os colchetes", async () => {
    const lookup = vi.fn(async (h: string) => [h]);
    const r = await fetchSource("https://[2606:2800::1]/a.jpg", { ...base, lookup, fetchImpl: ok });
    expect(lookup).toHaveBeenCalledWith("2606:2800::1"); // sem colchetes
    expect(r.finalUrl).toBe("https://[2606:2800::1]/a.jpg");
  });

  // Conserto 4: o prazo de CABEÇALHO tem que valer para a busca inteira, não um cronômetro novo
  // por salto — senão o teto real é maxRedirects × connectTimeoutMs. O mock de fetch honra o
  // AbortSignal (como o fetch de verdade honraria), então se o cronômetro reiniciasse a cada
  // salto, os três saltos de 30ms caberiam cada um dentro do prazo de 40ms próprio e a busca só
  // falharia (por TOO_MANY_REDIRECTS) perto dos 90ms. Com UM cronômetro para a cadeia inteira, ela
  // estoura por TIMEOUT bem antes disso, e não completa os 4 hops.
  it("usa um único cronômetro de cabeçalho para a busca inteira, não um por salto", async () => {
    let chamadas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      chamadas++;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 30);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
        });
      });
      return new Response(null, { status: 302, headers: { location: "https://outro.com/a.jpg" } });
    });
    const inicio = Date.now();
    await expect(
      fetchSource("https://x.com/a.jpg", {
        ...base,
        maxRedirects: 3,
        connectTimeoutMs: 40,
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const decorrido = Date.now() - inicio;
    expect(chamadas).toBeLessThanOrEqual(2); // não chegou nem perto dos 4 hops possíveis
    expect(decorrido).toBeLessThan(80); // bem menos que 3×30ms = 90ms de saltos completos
  });

  // O TESTE QUE FALTAVA (item crítico da revisão final): o prazo de cabeçalho NÃO pode governar o
  // corpo inteiro. Um corpo mais lento que connectTimeoutMs, mas nunca ocioso por mais que
  // idleTimeoutMs, tem que terminar — prova de que o teto absoluto sumiu.
  it("o corpo pode demorar mais que o prazo de cabeçalho e ainda assim terminar (sem teto absoluto)", async () => {
    // O stream verifica o MESMO `signal` que foi passado ao fetch — como o fetch de verdade faz,
    // onde o sinal da requisição também governa a leitura do corpo. É o que faz este teste falhar
    // contra a implementação antiga: lá o cronômetro de 10ms aborta a busca inteira (corpo
    // incluso); aqui só o cabeçalho usa esse prazo, e é cancelado assim que os cabeçalhos chegam.
    function streamLento(signal?: AbortSignal): ReadableStream<Uint8Array> {
      const partes: [Uint8Array, number][] = [
        [new Uint8Array([1]), 0],
        [new Uint8Array([2]), 40],
        [new Uint8Array([3]), 40],
      ];
      let i = 0;
      return new ReadableStream({
        async pull(controller) {
          if (i >= partes.length) {
            controller.close();
            return;
          }
          const [chunk, delay] = partes[i++];
          if (delay) {
            await new Promise<void>((resolve, reject) => {
              if (signal?.aborted) {
                reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
                return;
              }
              const t = setTimeout(resolve, delay);
              signal?.addEventListener("abort", () => {
                clearTimeout(t);
                reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
              });
            });
          }
          controller.enqueue(chunk);
        },
      });
    }
    const fetchImpl = async (_url: string, init?: RequestInit) =>
      new Response(streamLento(init?.signal ?? undefined), { status: 200 });
    // Cabeçalho responde na hora — o prazo de 10ms nem chega a ser testado por ele. O corpo leva
    // ~80ms no total (bem mais que os 10ms de cabeçalho), mas cada intervalo (40ms) fica bem
    // abaixo do teto de ociosidade (200ms).
    const inicio = Date.now();
    const r = await fetchSource("https://x.com/a.jpg", {
      ...base,
      connectTimeoutMs: 10,
      idleTimeoutMs: 200,
      fetchImpl,
    });
    const recebidos: number[] = [];
    for await (const chunk of r.body) recebidos.push(chunk[0]);
    expect(recebidos).toEqual([1, 2, 3]);
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(70);
  });

  // O outro lado do MESMO teste que faltava: um corpo que para no meio (ocioso) precisa morrer
  // rápido, com um código PRÓPRIO — não pode virar ABORTED nem TIMEOUT.
  it("aborta com SOURCE_STALLED quando a origem para de mandar bytes no meio (ociosidade, não teto absoluto)", async () => {
    function streamQueTrava(): ReadableStream<Uint8Array> {
      let entregueUmChunk = false;
      return new ReadableStream({
        async pull(controller) {
          if (!entregueUmChunk) {
            entregueUmChunk = true;
            controller.enqueue(new Uint8Array([1]));
            return;
          }
          // Nunca resolve: a origem parou de mandar bytes.
          await new Promise(() => {});
        },
      });
    }
    const fetchImpl = async () => new Response(streamQueTrava(), { status: 200 });
    const r = await fetchSource("https://x.com/a.jpg", {
      ...base,
      connectTimeoutMs: 5_000, // cabeçalho chegou na hora — não é ele quem aborta aqui
      idleTimeoutMs: 30,
      fetchImpl,
    });
    const consumir = async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of r.body) chunks.push(chunk);
      return chunks;
    };
    await expect(consumir()).rejects.toMatchObject({ code: "SOURCE_STALLED" });
  });
});
