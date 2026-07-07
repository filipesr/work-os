// Deterministic NAS path/name builder — production port of the PoC seed
// (nas-poc/agent/src/nas-path.ts), faithful to the spec
// (docs/superpowers/specs/2026-07-02-nas-artifact-storage-design.md §"Padrão de pastas e nomes"
// + Apêndice D allowlist). Pure and dependency-light (node:crypto only) so it is unit-testable and
// usable from server actions (prepare) without touching the DB or the agent.
//
// Layout (spec 2026-07-06-nas-flow-simplification — tudo em `institucional`, por escopo):
//   CLIENT:  {cliente}/institucional/{tipoMidia}/{arquivo}
//   PROJECT: {cliente}/{projeto ~id}/institucional/{tipoMidia}/{arquivo}
//   TASK:    {cliente}/{tarefa ~id}/institucional/{tipoMidia}/{arquivo}
// Names (o nome vem do ARQUIVO enviado — identidade da cadeia de versões; contexto fica nas pastas):
//   CLIENT:  {Arquivo}_v{NN}.{ext}
//   PROJECT: {AAAA_MM}_{Arquivo}_v{NN}.{ext}
//   TASK:    {AAAA_MM}_{Arquivo}_v{NN}.{ext}   (AAAA_MM = data do envio)
//
// The string-literal unions below intentionally mirror the Prisma enums `ArtifactMediaType` /
// `ArtifactTarget` (same member values), so Prisma enum values pass through with no coupling.

import { createHash } from "node:crypto";

export type ArtifactMediaType =
  | "VIDEOS"
  | "FOTOS"
  | "DOCUMENTOS"
  | "LOGOS"
  | "SOCIAL_MEDIA"
  | "OUTROS";

export type ArtifactScope = "TASK" | "PROJECT" | "CLIENT";

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
      | "MISSING_OWNER"
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

// Filesystem-safe client folder slug (kept readable; spaces preserved). Used to backfill
// Client.folderName and to build the client folder component.
export function toNasClientFolder(name: string): string {
  return toAsciiSafe(name);
}

// Nome do arquivo enviado, SEM extensão, normalizado a um token NAS. É a IDENTIDADE da cadeia de
// versões (mesmo nome → nova versão; nome diferente → artefato novo) e o componente variável do
// nome final no NAS. "LP.jpg" -> "LP", "Banner Final.png" -> "BannerFinal".
export function fileBaseToken(originalFileName: string): string {
  const name = originalFileName.trim();
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  // "_"/"-" viram separadores de palavra: "render_final" -> "RenderFinal".
  return toNasToken(base.replace(/[_-]+/g, " "));
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
  scope: ArtifactScope;
  /** Client folderName (human, ASCII-normalized here). */
  client: string;
  /** Task title (TASK) or project name (PROJECT). Ignored for CLIENT. */
  ownerName?: string;
  /** Task id (TASK) or project id (PROJECT) — for the folder id suffix. Ignored for CLIENT. */
  ownerId?: string;
  mediaType: ArtifactMediaType;
  originalFileName: string;
  /** Version number NN (never reused across expired/failed/deleted). */
  version: number;
  /** Upload timestamp — drives AAAA_MM for TASK/PROJECT names. */
  uploadDate: Date;
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
  const clientRaw = toAsciiSafe(input.client);
  if (!clientRaw) throw new NasPathError("EMPTY_COMPONENT", "cliente vazio após normalização");

  // Campo variável do nome = o arquivo enviado (identidade da cadeia). O contexto (cliente/tarefa)
  // já está nas PASTAS, então o nome não repete a tarefa — vem do arquivo.
  const fileTok = fileBaseToken(input.originalFileName);
  if (!fileTok)
    throw new NasPathError("EMPTY_COMPONENT", "nome de arquivo vazio após normalização");

  const OWNER_NAME_MAX = LIMITS.campaignFolder - 8; // deixa espaço p/ " ~<6hex>"
  const clientFolder = capWithHash(clientRaw, LIMITS.client);
  const ym = `${input.uploadDate.getFullYear()}_${pad2(input.uploadDate.getMonth() + 1)}`;
  let truncated = clientRaw.length > LIMITS.client;

  let dirParts: string[];
  let fixed: string; // prefixo do nome até o campo variável (o arquivo)

  if (input.scope === "CLIENT") {
    dirParts = [clientFolder, "institucional", mediaFolder];
    fixed = ""; // {arquivo}_v{NN} (institucional do cliente é atemporal — sem data)
  } else {
    if (!input.ownerName || !input.ownerId) {
      throw new NasPathError("MISSING_OWNER", "TASK/PROJECT exigem ownerName e ownerId");
    }
    const ownerAscii = toAsciiSafe(input.ownerName);
    if (!ownerAscii) throw new NasPathError("EMPTY_COMPONENT", "nome do dono vazio");
    truncated = truncated || ownerAscii.length > OWNER_NAME_MAX;
    const idTok = shortHash(input.ownerId);
    const ownerFolder = `${capWithHash(ownerAscii, OWNER_NAME_MAX)} ~${idTok}`;
    dirParts = [clientFolder, ownerFolder, "institucional", mediaFolder];
    fixed = `${ym}_`; // {AAAA_MM}_{arquivo}_v{NN}
  }

  const tail = `_${versionTag}.${ext}`;
  const dirLen = dirParts.join("/").length;
  // Orçamento do nome: cabe em LIMITS.fileName E no que sobra do relPath.
  const maxFile = Math.max(12, Math.min(LIMITS.fileName, LIMITS.relPath - dirLen - 1));

  // Nome ideal (sem cap) para detectar truncamento do campo.
  truncated = truncated || `${fixed}${fileTok}${tail}`.length > maxFile;

  const fileName = fitField(fixed, fileTok, tail, maxFile);

  const relPath = [...dirParts, fileName].join("/");
  return { relPath, fileName, mediaFolder, ext, truncated };
}

// {fixed}{demanda}{tail} cabendo em `max`: encolhe o campo Demanda; se o prefixo já não couber,
// hasheia o nome inteiro.
function fitField(fixed: string, demanda: string, tail: string, max: number): string {
  const full = `${fixed}${demanda}${tail}`;
  if (full.length <= max) return full;
  const room = max - fixed.length - tail.length;
  if (room >= 8) return `${fixed}${capWithHash(demanda, room)}${tail}`;
  // Prefixo (fixed+demanda) longo demais — hasheia mantendo o tail (extensão).
  return `${capWithHash(`${fixed}${demanda}`, Math.max(1, max - tail.length))}${tail}`;
}
