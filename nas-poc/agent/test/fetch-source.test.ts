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
    ];
    for (const ip of privados) expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("aceita público", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "93.184.216.34", "2606:2800::1"]) {
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
});
