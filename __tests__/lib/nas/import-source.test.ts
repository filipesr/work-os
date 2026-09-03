import { describe, it, expect } from "vitest";
import { deriveFileNameFromUrl, checkImportUrl } from "@/lib/nas/import-source";

describe("deriveFileNameFromUrl", () => {
  it("pega o último segmento do caminho", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/a/b/foto.jpg")).toBe("foto.jpg");
  });

  it("ignora query e fragmento", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/foto.png?download=1#x")).toBe("foto.png");
  });

  it("decodifica o que estiver escapado", () => {
    expect(deriveFileNameFromUrl("https://exemplo.com/arte%20final.pdf")).toBe("arte final.pdf");
  });

  it("devolve null quando o caminho não promete um arquivo", () => {
    expect(deriveFileNameFromUrl("https://drive.google.com/file/d/1a2b3c/view")).toBeNull();
    expect(deriveFileNameFromUrl("https://exemplo.com/")).toBeNull();
    expect(deriveFileNameFromUrl("não é url")).toBeNull();
  });
});

describe("checkImportUrl", () => {
  it("aceita http e https", () => {
    expect(checkImportUrl("https://exemplo.com/a.jpg").ok).toBe(true);
    expect(checkImportUrl("http://exemplo.com/a.jpg").ok).toBe(true);
  });

  it("recusa qualquer outro esquema", () => {
    for (const u of ["ftp://x/a.jpg", "file:///etc/passwd", "data:image/png;base64,AAA"]) {
      const r = checkImportUrl(u);
      expect(r.ok, u).toBe(false);
      if (!r.ok) expect(r.reason, u).toBe("SCHEME");
    }
  });

  it("recusa host que já é um IP privado escrito na URL", () => {
    const hosts = [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.200.216",
      "172.16.3.9",
      "169.254.169.254",
      "localhost",
      "[::1]",
    ];
    for (const h of hosts) {
      const r = checkImportUrl(`http://${h}/a.jpg`);
      expect(r.ok, h).toBe(false);
      if (!r.ok) expect(r.reason, h).toBe("PRIVATE_HOST");
    }
  });

  it("recusa a URL sem nome de arquivo", () => {
    const r = checkImportUrl("https://exemplo.com/pasta/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_FILE_NAME");
  });

  it("NÃO é a trava de verdade: nome público que resolve para IP privado passa aqui", () => {
    // A checagem que vale resolve o DNS e roda no agente (fetch-source.ts). Este módulo só dá
    // mensagem boa cedo — confundir os dois é trancar a porta da frente e deixar a de trás
    // encostada.
    expect(checkImportUrl("https://interno.exemplo.com/a.jpg").ok).toBe(true);
  });
});
