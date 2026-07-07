// Helper client-side: sobe um arquivo direto pro agente NAS (prepare no servidor -> markUploading ->
// PUT dos bytes browser->agente). Usado pelo formulário de upload e pela ação "Reenviar" de
// artefatos travados/falhos, para não duplicar a sequência.

import { markUploading, prepareArtifactUpload } from "@/lib/actions/artifact";

// Palpite do tipo de mídia pela extensão (conveniência — o servidor valida pela allowlist e o
// usuário pode trocar). Alinhado com ALLOWLIST em lib/nas/path.ts.
const EXT_MEDIA: Record<string, string> = {
  mp4: "VIDEOS",
  mov: "VIDEOS",
  webm: "VIDEOS",
  mkv: "VIDEOS",
  jpg: "FOTOS",
  jpeg: "FOTOS",
  png: "FOTOS",
  webp: "FOTOS",
  gif: "FOTOS",
  tiff: "FOTOS",
  tif: "FOTOS",
  heic: "FOTOS",
  raw: "FOTOS",
  cr2: "FOTOS",
  nef: "FOTOS",
  arw: "FOTOS",
  svg: "LOGOS",
  ai: "LOGOS",
  eps: "LOGOS",
  cdr: "LOGOS",
  pdf: "DOCUMENTOS",
  docx: "DOCUMENTOS",
  xlsx: "DOCUMENTOS",
  pptx: "DOCUMENTOS",
  txt: "DOCUMENTOS",
  zip: "DOCUMENTOS",
  indd: "DOCUMENTOS",
  psd: "DOCUMENTOS",
};

export function guessMediaType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MEDIA[ext] ?? null;
}

export function putWithProgress(
  url: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Agente respondeu ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Erro de rede ao enviar ao agente"));
    xhr.send(file);
  });
}

export interface NasUploadParams {
  scope: "TASK" | "PROJECT" | "CLIENT";
  taskId?: string;
  projectId?: string;
  clientId?: string;
  mediaType: string;
  sensitivity?: string;
}

export type NasUploadResult = { ok: true; fileName: string } | { ok: false; error: string };

/** prepare -> markUploading -> PUT. Retorna o nome final selado ou um erro (nunca lança). */
export async function uploadFileToNas(
  file: File,
  params: NasUploadParams,
  onProgress: (pct: number) => void = () => {}
): Promise<NasUploadResult> {
  const prep = await prepareArtifactUpload({
    scope: params.scope,
    taskId: params.taskId,
    projectId: params.projectId,
    clientId: params.clientId,
    mediaType: params.mediaType,
    sensitivity: params.sensitivity ?? "INTERNO",
    originalFileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  if (!("success" in prep) || !prep.success) {
    return { ok: false, error: ("error" in prep && prep.error) || "Falha ao preparar upload." };
  }
  await markUploading(prep.artifact.id);
  try {
    await putWithProgress(prep.upload.url, prep.upload.token, file, onProgress);
    return { ok: true, fileName: prep.artifact.fileName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha no upload." };
  }
}
