import { describe, it, expect } from "vitest";
import {
  buildNasPath,
  fileBaseToken,
  normalizeExtension,
  toAsciiSafe,
  toNasToken,
  NasPathError,
  LIMITS,
} from "@/lib/nas/path";

describe("toAsciiSafe", () => {
  it("strips diacritics and keeps readable ASCII", () => {
    expect(toAsciiSafe("Construções Açaí")).toBe("Construcoes Acai");
    expect(toAsciiSafe("João & Cia")).toBe("Joao & Cia");
  });
  it("drops emoji and reserved chars", () => {
    expect(toAsciiSafe("Rel🎉atório: v/2")).toBe("Relatorio v2");
  });
  it("normalizes NFC and NFD forms to the same output", () => {
    const nfc = "Açaí".normalize("NFC");
    const nfd = "Açaí".normalize("NFD");
    expect(toAsciiSafe(nfc)).toBe(toAsciiSafe(nfd));
    expect(toAsciiSafe(nfc)).toBe("Acai");
  });
});

describe("toNasToken", () => {
  it("compacts to a space-free PascalCase token", () => {
    expect(toNasToken("Black Friday")).toBe("BlackFriday");
    expect(toNasToken("João & Cia")).toBe("JoaoCia");
    expect(toNasToken("banner web")).toBe("BannerWeb");
  });
});

describe("fileBaseToken (identidade da cadeia de versões)", () => {
  it("tira a extensão e normaliza o nome do arquivo", () => {
    expect(fileBaseToken("LP.jpg")).toBe("LP");
    expect(fileBaseToken("banner.jpg")).toBe("Banner");
    expect(fileBaseToken("render_final.mov")).toBe("RenderFinal");
    expect(fileBaseToken("Banner Final.png")).toBe("BannerFinal");
    expect(fileBaseToken("Relatório-Q1.pdf")).toBe("RelatorioQ1");
  });
  it("mesmo nome (qualquer extensão) → mesma chave; nome diferente → chave diferente", () => {
    expect(fileBaseToken("LP.jpg")).toBe(fileBaseToken("LP.png")); // extensão não muda a identidade
    expect(fileBaseToken("LP.jpg")).not.toBe(fileBaseToken("banner.jpg"));
  });
  it("nome sem extensão é aceito", () => {
    expect(fileBaseToken("README")).toBe("README");
  });
});

describe("normalizeExtension", () => {
  it("lowercases and maps jpeg->jpg", () => {
    expect(normalizeExtension("Foto.JPEG", "FOTOS")).toBe("jpg");
    expect(normalizeExtension("clip.MP4", "VIDEOS")).toBe("mp4");
  });
  it("rejects missing extension", () => {
    expect(() => normalizeExtension("semponto", "OUTROS")).toThrow(NasPathError);
  });
  it("rejects blocked executables", () => {
    expect(() => normalizeExtension("payload.exe", "OUTROS")).toThrow(/bloqueada/);
  });
  it("rejects double extension", () => {
    expect(() => normalizeExtension("invoice.pdf.exe", "DOCUMENTOS")).toThrow(/dupla|bloqueada/);
  });
  it("rejects extension not allowed for the media type", () => {
    expect(() => normalizeExtension("art.mp4", "FOTOS")).toThrow(/não permitida/);
  });
  it("OUTROS accepts any extension in the global union", () => {
    expect(normalizeExtension("thing.zip", "OUTROS")).toBe("zip");
    expect(() => normalizeExtension("thing.xyz", "OUTROS")).toThrow(/não permitida/);
  });
});

const JULY_2026 = new Date(2026, 6, 15); // local July 15, 2026 → AAAA_MM = 2026_07

describe("buildNasPath — TASK", () => {
  const base = {
    scope: "TASK" as const,
    client: "Construções Açaí",
    ownerName: "Abertura da Loja",
    ownerId: "task_1",
    mediaType: "VIDEOS" as const,
    originalFileName: "render_final.mov",
    version: 3,
    uploadDate: JULY_2026,
  };

  it("pasta {cliente}/{tarefa ~id}/institucional/{tipoMidia}; nome = {AAAA_MM}_{arquivo}_v{NN}", () => {
    const r = buildNasPath(base);
    expect(r.relPath).toMatch(
      /^Construcoes Acai\/Abertura da Loja ~[0-9a-f]{6}\/institucional\/videos\/2026_07_RenderFinal_v03\.mov$/
    );
    expect(r.fileName).toBe("2026_07_RenderFinal_v03.mov");
    expect(r.ext).toBe("mov");
    expect(r.truncated).toBe(false);
  });

  it("o nome vem do ARQUIVO, não da tarefa — arquivos diferentes → nomes diferentes", () => {
    const lp = buildNasPath({
      ...base,
      mediaType: "FOTOS",
      originalFileName: "LP.jpg",
      version: 1,
    });
    const banner = buildNasPath({
      ...base,
      mediaType: "FOTOS",
      originalFileName: "banner.jpg",
      version: 1,
    });
    expect(lp.fileName).toBe("2026_07_LP_v01.jpg");
    expect(banner.fileName).toBe("2026_07_Banner_v01.jpg");
    expect(lp.fileName).not.toBe(banner.fileName); // sem colisão
  });

  it("Social Media mantém o rótulo de pasta real", () => {
    const r = buildNasPath({ ...base, mediaType: "SOCIAL_MEDIA", originalFileName: "post.png" });
    expect(r.relPath).toContain("/institucional/Social Media/");
    expect(r.fileName).toBe("2026_07_Post_v03.png");
  });

  it("exige ownerName/ownerId", () => {
    expect(() => buildNasPath({ ...base, ownerId: undefined })).toThrow(/TASK\/PROJECT exigem/);
  });

  it("versão paddada a 2 dígitos, sem perda acima de 99", () => {
    expect(buildNasPath({ ...base, version: 1 }).fileName).toContain("_v01.");
    expect(buildNasPath({ ...base, version: 100 }).fileName).toContain("_v100.");
  });
});

describe("buildNasPath — PROJECT", () => {
  it("nome = {AAAA_MM}_{arquivo}_v{NN} na pasta do projeto", () => {
    const r = buildNasPath({
      scope: "PROJECT",
      client: "João & Cia",
      ownerName: "Rebrand 2026",
      ownerId: "proj_1",
      mediaType: "LOGOS",
      originalFileName: "marca.svg",
      version: 1,
      uploadDate: JULY_2026,
    });
    expect(r.relPath).toMatch(
      /^Joao & Cia\/Rebrand 2026 ~[0-9a-f]{6}\/institucional\/logos\/2026_07_Marca_v01\.svg$/
    );
  });
});

describe("buildNasPath — CLIENT", () => {
  it("cai em {cliente}/institucional, nome {arquivo}_v{NN} e sem data", () => {
    const r = buildNasPath({
      scope: "CLIENT",
      client: "João & Cia",
      mediaType: "LOGOS",
      originalFileName: "marca.svg",
      version: 1,
      uploadDate: JULY_2026,
    });
    expect(r.relPath).toBe("Joao & Cia/institucional/logos/Marca_v01.svg");
  });
});

describe("buildNasPath — length budgets", () => {
  it("limita relPath longo abaixo de LIMITS.relPath com hash", () => {
    const r = buildNasPath({
      scope: "TASK",
      client: "C".repeat(60),
      ownerName: "T".repeat(300),
      ownerId: "task_long",
      mediaType: "DOCUMENTOS",
      originalFileName: "spec.pdf",
      version: 12,
      uploadDate: JULY_2026,
    });
    expect(r.relPath.length).toBeLessThanOrEqual(LIMITS.relPath);
    expect(r.truncated).toBe(true);
    expect(r.fileName.endsWith(".pdf")).toBe(true);
  });

  it("é determinístico — mesma entrada, mesma saída", () => {
    const input = {
      scope: "TASK" as const,
      client: "X".repeat(80),
      ownerName: "Y".repeat(200),
      ownerId: "task_det",
      mediaType: "FOTOS" as const,
      originalFileName: "foto.jpg",
      version: 5,
      uploadDate: JULY_2026,
    };
    expect(buildNasPath(input)).toEqual(buildNasPath(input));
  });
});
