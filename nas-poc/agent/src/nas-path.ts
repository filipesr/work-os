// Deterministic NAS path/name builder — faithful port of the spec
// (docs/superpowers/specs/2026-07-02-nas-artifact-storage-design.md §"Padrão de pastas e nomes"
// + Apêndice D allowlist). This module is pure and dependency-free so it can be lifted almost
// verbatim into the production `lib/nas/path` later.
//
// Layout:
//   Campanha:      {Cliente}/Campanhas/{Ano_Mes_Campanha}/{tipoMidia}/{arquivo}
//   Institucional: {Cliente}/Institucional/{tipoMidia}/{arquivo}
// Names:
//   Campanha:      {Ano_Mes_Campanha}_{Proposito}_{Demanda}_v{NN}.{ext}
//   Institucional: {Cliente}_{Proposito}_{Demanda}_v{NN}.{ext}

import { createHash } from "node:crypto";

export type ArtifactMediaType =
  | "VIDEOS"
  | "FOTOS"
  | "DOCUMENTOS"
  | "LOGOS"
  | "SOCIAL_MEDIA"
  | "OUTROS";

export type ArtifactTarget = "CAMPANHA" | "INSTITUCIONAL";

// enum -> folder label (central mapper). SOCIAL_MEDIA is a real folder name; the rest lowercase.
export const MEDIA_TYPE_FOLDER: Record<ArtifactMediaType, string> = {
  VIDEOS: "videos",
  FOTOS: "fotos",
  DOCUMENTOS: "documentos",
  LOGOS: "logos",
  SOCIAL_MEDIA: "Social Media",
  OUTROS: "outros",
};

// Apêndice D — allowlist per media type + max bytes (v1). Extensions are stored normalized.
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const ALLOWLIST: Record<ArtifactMediaType, { ext: string[]; maxBytes: number }> = {
  FOTOS: {
    ext: ["jpg", "png", "webp", "gif", "tiff", "heic", "raw", "cr2", "nef", "arw"],
    maxBytes: 150 * MB,
  },
  VIDEOS: { ext: ["mp4", "mov", "webm", "mkv"], maxBytes: 5 * GB },
  LOGOS: { ext: ["svg", "ai", "eps", "pdf", "png", "cdr"], maxBytes: 200 * MB },
  DOCUMENTOS: {
    ext: ["pdf", "docx", "xlsx", "pptx", "txt", "zip", "indd", "psd"],
    maxBytes: 200 * MB,
  },
  SOCIAL_MEDIA: { ext: ["jpg", "png", "mp4", "gif", "pdf"], maxBytes: 500 * MB },
  // OUTROS = any extension present in the union of the allowlists above (never "anything").
  OUTROS: { ext: [], maxBytes: 500 * MB },
};

// Executables are always blocked, regardless of media type.
export const BLOCKED_EXT = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "sh",
  "ps1",
  "js",
  "jar",
  "msi",
  "scr",
  "vbs",
  "html",
]);

// Union of allowed extensions, used by OUTROS.
const ALLOWED_UNION = new Set(
  Object.entries(ALLOWLIST)
    .filter(([k]) => k !== "OUTROS")
    .flatMap(([, v]) => v.ext)
);

// Length budgets (spec). relPath total is the binding one (protects Windows MAX_PATH 260).
export const LIMITS = {
  client: 64,
  campaignFolder: 96,
  fileName: 180,
  relPath: 240,
} as const;

export class NasPathError extends Error {
  constructor(
    public code:
      | "NO_EXTENSION"
      | "DOUBLE_EXTENSION"
      | "BLOCKED_EXTENSION"
      | "EXT_NOT_ALLOWED_FOR_TYPE"
      | "MISSING_CAMPAIGN_FIELDS"
      | "EMPTY_COMPONENT",
    message: string
  ) {
    super(message);
    this.name = "NasPathError";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 6);
}

// Strip diacritics + non-ASCII, keep it filesystem-safe and human-readable (spaces + case kept).
// Windows NFC vs macOS NFD divergence disappears because the output is pure ASCII.
export function toAsciiSafe(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/[^\x20-\x7e]/g, "") // drop remaining non-ASCII (emoji, etc.)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // filesystem-reserved + control chars
    .replace(/\s+/g, " ")
    .trim();
}

// Compact field token used inside filenames (no spaces — "_" is the field separator).
// "João & Cia" -> "JoaoCia", "Black Friday" -> "BlackFriday".
export function toNasToken(input: string): string {
  const ascii = toAsciiSafe(input).replace(/&/g, " ");
  return ascii
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// Normalize an extension from the original file name. Throws on missing / double / blocked.
export function normalizeExtension(originalFileName: string, mediaType: ArtifactMediaType): string {
  const name = originalFileName.trim();
  const parts = name.split(".");
  if (parts.length < 2 || parts[parts.length - 1] === "") {
    throw new NasPathError("NO_EXTENSION", `arquivo sem extensão: "${originalFileName}"`);
  }
  // Double-extension guard (e.g. invoice.pdf.exe) — inspect the penultimate segment.
  if (parts.length >= 3) {
    const penult = parts[parts.length - 2].toLowerCase();
    if (BLOCKED_EXT.has(penult) || ALLOWED_UNION.has(penult)) {
      throw new NasPathError(
        "DOUBLE_EXTENSION",
        `extensão dupla não permitida: "${originalFileName}"`
      );
    }
  }
  let ext = parts[parts.length - 1].toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (ext === "tif") ext = "tiff";
  if (BLOCKED_EXT.has(ext)) {
    throw new NasPathError("BLOCKED_EXTENSION", `extensão bloqueada: ".${ext}"`);
  }
  const allowed =
    mediaType === "OUTROS" ? ALLOWED_UNION.has(ext) : ALLOWLIST[mediaType].ext.includes(ext);
  if (!allowed) {
    throw new NasPathError(
      "EXT_NOT_ALLOWED_FOR_TYPE",
      `extensão ".${ext}" não permitida para o tipo ${mediaType}`
    );
  }
  return ext;
}

// Cap a component to `max` chars deterministically, appending "~<hash>" when truncated so
// distinct-but-long inputs never collide.
function capWithHash(value: string, max: number): string {
  if (value.length <= max) return value;
  const suffix = "~" + shortHash(value);
  const keep = Math.max(1, max - suffix.length);
  return value.slice(0, keep) + suffix;
}

export interface BuildNasPathInput {
  /** Client folderName (human, ASCII-normalized here). */
  client: string;
  target: ArtifactTarget;
  mediaType: ArtifactMediaType;
  /** DeliverablePurpose label, e.g. "Banner Web". */
  purpose: string;
  /** Snapshot source: task.title -> {Demanda}. */
  taskTitle: string;
  originalFileName: string;
  /** Version number NN (never reused across expired/failed/deleted). */
  version: number;
  // Campaign fields (required when target === "CAMPANHA").
  campaignYear?: number;
  campaignMonth?: number;
  campaignSlug?: string;
}

export interface BuildNasPathResult {
  /** Path relative to NAS_ROOT, forward-slash separated. */
  relPath: string;
  /** Final file name (with extension). */
  fileName: string;
  /** Media-type folder label used. */
  mediaFolder: string;
  ext: string;
  /** True when any component was truncated to fit a length budget. */
  truncated: boolean;
}

export function buildNasPath(input: BuildNasPathInput): BuildNasPathResult {
  const ext = normalizeExtension(input.originalFileName, input.mediaType);
  const mediaFolder = MEDIA_TYPE_FOLDER[input.mediaType];
  const versionTag = `v${pad2(input.version)}`;
  const purposeTok = toNasToken(input.purpose);
  const demandaTok = toNasToken(input.taskTitle);
  const clientRaw = toAsciiSafe(input.client);
  if (!clientRaw) throw new NasPathError("EMPTY_COMPONENT", "cliente vazio após normalização");
  if (!purposeTok) throw new NasPathError("EMPTY_COMPONENT", "propósito vazio após normalização");
  if (!demandaTok) throw new NasPathError("EMPTY_COMPONENT", "demanda vazia após normalização");

  const clientFolder = capWithHash(clientRaw, LIMITS.client);

  let dirParts: string[];
  let baseNamePrefix: string;

  if (input.target === "CAMPANHA") {
    if (
      input.campaignYear == null ||
      input.campaignMonth == null ||
      !input.campaignSlug ||
      !toNasToken(input.campaignSlug)
    ) {
      throw new NasPathError(
        "MISSING_CAMPAIGN_FIELDS",
        "target CAMPANHA exige campaignYear, campaignMonth e campaignSlug"
      );
    }
    const campaignToken = `${input.campaignYear}_${pad2(input.campaignMonth)}_${toNasToken(input.campaignSlug)}`;
    const campaignFolder = capWithHash(campaignToken, LIMITS.campaignFolder);
    dirParts = [clientFolder, "Campanhas", campaignFolder, mediaFolder];
    baseNamePrefix = campaignFolder;
  } else {
    dirParts = [clientFolder, "Institucional", mediaFolder];
    baseNamePrefix = toNasToken(clientRaw);
  }

  // Compose the filename, capping so the *base* (without extension) fits LIMITS.fileName,
  // then re-checking the whole relPath budget and shrinking the Demanda field if needed.
  const fixed = `${baseNamePrefix}_${purposeTok}_`;
  const tail = `_${versionTag}.${ext}`;
  let fileName = buildFileName(fixed, demandaTok, tail);

  let relPath = [...dirParts, fileName].join("/");
  let truncated =
    fileName.includes("~") || clientFolder.includes("~") || dirParts.some((p) => p.includes("~"));

  if (relPath.length > LIMITS.relPath) {
    // Deterministically shrink the Demanda token to bring the whole relPath under budget.
    const overflow = relPath.length - LIMITS.relPath;
    const shrunkDemanda = capWithHash(demandaTok, Math.max(1, demandaTok.length - overflow));
    fileName = buildFileName(fixed, shrunkDemanda, tail);
    relPath = [...dirParts, fileName].join("/");
    truncated = true;
    // Last resort: if still over budget (pathological dir lengths), hash the whole base.
    if (relPath.length > LIMITS.relPath) {
      const forced = `${baseNamePrefix}_${purposeTok}_${shortHash(relPath)}${tail}`;
      fileName = forced.length <= LIMITS.fileName ? forced : capWithHash(forced, LIMITS.fileName);
      relPath = [...dirParts, fileName].join("/");
    }
  }

  return { relPath, fileName, mediaFolder, ext, truncated };
}

function buildFileName(fixed: string, demanda: string, tail: string): string {
  const full = `${fixed}${demanda}${tail}`;
  if (full.length <= LIMITS.fileName) return full;
  // Keep fixed prefix + tail, cap the demanda part with a hash suffix.
  const room = Math.max(1, LIMITS.fileName - fixed.length - tail.length);
  return `${fixed}${capWithHash(demanda, room)}${tail}`;
}
