import { describe, it, expect } from "vitest";
import {
  buildNasPath,
  normalizeExtension,
  toAsciiSafe,
  toNasToken,
  NasPathError,
  LIMITS,
} from "../src/nas-path.js";

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

describe("buildNasPath — campanha", () => {
  const base = {
    client: "Construções Açaí",
    target: "CAMPANHA" as const,
    mediaType: "VIDEOS" as const,
    purpose: "Vídeo",
    taskTitle: "Abertura da Loja",
    originalFileName: "render_final.mov",
    version: 3,
    campaignYear: 2026,
    campaignMonth: 7,
    campaignSlug: "Black Friday",
  };

  it("builds the deterministic campaign path and name", () => {
    const r = buildNasPath(base);
    expect(r.relPath).toBe(
      "Construcoes Acai/Campanhas/2026_07_BlackFriday/videos/2026_07_BlackFriday_Video_AberturaDaLoja_v03.mov"
    );
    expect(r.fileName).toBe("2026_07_BlackFriday_Video_AberturaDaLoja_v03.mov");
    expect(r.ext).toBe("mov");
    expect(r.truncated).toBe(false);
  });

  it("Social Media keeps the real folder label", () => {
    const r = buildNasPath({
      ...base,
      mediaType: "SOCIAL_MEDIA",
      originalFileName: "post.png",
      purpose: "Feed",
    });
    expect(r.relPath).toContain("/Social Media/");
  });

  it("requires campaign fields", () => {
    expect(() => buildNasPath({ ...base, campaignSlug: undefined })).toThrow(/CAMPANHA exige/);
  });

  it("pads version to 2 digits and does not lose precision above 99", () => {
    expect(buildNasPath({ ...base, version: 1 }).fileName).toContain("_v01.");
    expect(buildNasPath({ ...base, version: 100 }).fileName).toContain("_v100.");
  });
});

describe("buildNasPath — institucional", () => {
  it("uses {Cliente} as the name prefix and Institucional folder", () => {
    const r = buildNasPath({
      client: "João & Cia",
      target: "INSTITUCIONAL",
      mediaType: "LOGOS",
      purpose: "Logo Principal",
      taskTitle: "Rebrand 2026",
      originalFileName: "marca.svg",
      version: 1,
    });
    expect(r.relPath).toBe(
      "Joao & Cia/Institucional/logos/JoaoCia_LogoPrincipal_Rebrand2026_v01.svg"
    );
  });
});

describe("buildNasPath — length budgets", () => {
  it("caps an over-long relPath under LIMITS.relPath with a hash suffix", () => {
    const r = buildNasPath({
      client: "C".repeat(60),
      target: "CAMPANHA",
      mediaType: "DOCUMENTOS",
      purpose: "Documento Muito Detalhado De Especificacao",
      taskTitle: "T".repeat(300),
      originalFileName: "spec.pdf",
      version: 12,
      campaignYear: 2026,
      campaignMonth: 12,
      campaignSlug: "Campanha Anual De Fim De Ano Muito Longa",
    });
    expect(r.relPath.length).toBeLessThanOrEqual(LIMITS.relPath);
    expect(r.truncated).toBe(true);
    expect(r.fileName.endsWith(".pdf")).toBe(true);
  });

  it("is deterministic — same input yields same output", () => {
    const input = {
      client: "X".repeat(80),
      target: "CAMPANHA" as const,
      mediaType: "FOTOS" as const,
      purpose: "P".repeat(40),
      taskTitle: "Y".repeat(200),
      originalFileName: "foto.jpg",
      version: 5,
      campaignYear: 2026,
      campaignMonth: 3,
      campaignSlug: "Z".repeat(90),
    };
    expect(buildNasPath(input)).toEqual(buildNasPath(input));
  });
});
