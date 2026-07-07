// Sniffing dos primeiros bytes do upload (Apêndice D do spec). Objetivo: pegar arquivo mal-rotulado
// (ex.: executável renomeado como .pdf) sem depender de lib externa. Regras:
//   1. SEMPRE rejeita magic de executável (MZ/ELF/shebang/Mach-O), independente de tipo/extensão.
//   2. Para os tipos comuns (imagens/PDF/vídeo/família ZIP/SVG), exige que os bytes confiram com a
//      extensão declarada.
//   3. Formatos de design exóticos (psd/indd/cdr/raw/heic/ai/eps) sem assinatura confiável → aceita
//      (permissivo) desde que não caia na regra 1.

export class SniffError extends Error {
  constructor(
    public code: "EXECUTABLE" | "MAGIC_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "SniffError";
  }
}

function startsWith(head: Buffer, hex: string, offset = 0): boolean {
  const bytes = Buffer.from(hex, "hex");
  if (head.length < offset + bytes.length) return false;
  return head.subarray(offset, offset + bytes.length).equals(bytes);
}

// Executáveis / scripts — bloqueio incondicional.
function isExecutable(head: Buffer): boolean {
  return (
    startsWith(head, "4d5a") || // MZ (PE/DOS .exe/.dll)
    startsWith(head, "7f454c46") || // ELF
    startsWith(head, "2321") || // "#!" shebang
    startsWith(head, "cafebabe") || // Mach-O fat / Java class
    startsWith(head, "feedface") || // Mach-O 32
    startsWith(head, "feedfacf") || // Mach-O 64
    startsWith(head, "cffaedfe") // Mach-O 64 LE
  );
}

type Matcher = (head: Buffer) => boolean;

// Assinaturas por extensão normalizada. Extensões ausentes = sem verificação (permissivo).
const MAGIC: Record<string, Matcher> = {
  jpg: (h) => startsWith(h, "ffd8ff"),
  png: (h) => startsWith(h, "89504e470d0a1a0a"),
  gif: (h) => startsWith(h, "474946383761") || startsWith(h, "474946383961"),
  webp: (h) => startsWith(h, "52494646") && startsWith(h, "57454250", 8), // RIFF....WEBP
  tiff: (h) => startsWith(h, "49492a00") || startsWith(h, "4d4d002a"),
  pdf: (h) => startsWith(h, "25504446"), // %PDF
  // container ISO-BMFF: box "ftyp" no offset 4.
  mp4: (h) => startsWith(h, "66747970", 4),
  mov: (h) => startsWith(h, "66747970", 4),
  webm: (h) => startsWith(h, "1a45dfa3"), // EBML (mkv/webm)
  mkv: (h) => startsWith(h, "1a45dfa3"),
  // Família ZIP (docx/xlsx/pptx/zip): PK\x03\x04 (ou empty/spanned).
  zip: (h) => startsWith(h, "504b0304") || startsWith(h, "504b0506") || startsWith(h, "504b0708"),
  docx: (h) => MAGIC.zip(h),
  xlsx: (h) => MAGIC.zip(h),
  pptx: (h) => MAGIC.zip(h),
  // SVG é texto: começa com "<?xml" ou "<svg" (após BOM/espaços).
  svg: (h) => {
    const s = h.toString("utf8", 0, Math.min(h.length, 256)).replace(/^﻿/, "").trimStart();
    return s.startsWith("<?xml") || s.toLowerCase().startsWith("<svg");
  },
};

/**
 * Valida o cabeçalho do arquivo contra a extensão declarada. Lança `SniffError` em executável ou
 * mismatch de assinatura de um tipo conhecido. `head` deve conter os primeiros ~256 bytes.
 */
export function sniffUpload(head: Buffer, ext: string): void {
  if (isExecutable(head)) {
    throw new SniffError("EXECUTABLE", "conteúdo é um executável/script — bloqueado");
  }
  const matcher = MAGIC[ext.toLowerCase()];
  if (matcher && !matcher(head)) {
    throw new SniffError("MAGIC_MISMATCH", `os bytes não conferem com a extensão .${ext}`);
  }
}
