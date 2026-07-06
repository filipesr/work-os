// Normalização de artefatos de qualquer escopo (TASK/PROJECT/CLIENT) numa linha comum para o
// UnifiedArtifactsPanel. Puro e testável — as telas carregam os artefatos e mapeiam aqui.

export type ArtifactOrigin = "TASK" | "PROJECT" | "CLIENT";

export type UnifiedArtifactRow = {
  id: string;
  origin: ArtifactOrigin;
  title: string;
  url: string | null;
  storageKind: "LINK" | "NAS_UPLOAD";
  uploadStatus: string;
  type: string | null; // ArtifactType (link)
  mediaType: string | null; // ArtifactMediaType (NAS)
  fileName: string | null;
  createdAt: string; // ISO
  taskId: string | null;
  taskTitle: string | null;
  userName: string | null;
};

export const ORIGIN_LABEL: Record<ArtifactOrigin, string> = {
  TASK: "Tarefa",
  PROJECT: "Projeto",
  CLIENT: "Cliente",
};

export const ORIGIN_CHIP: Record<ArtifactOrigin, string> = {
  TASK: "bg-blue-100 text-blue-800 border-blue-200",
  PROJECT: "bg-purple-100 text-purple-800 border-purple-200",
  CLIENT: "bg-amber-100 text-amber-800 border-amber-200",
};

const ARTIFACT_TYPE_LABEL: Record<string, string> = {
  DOCUMENT: "Documento",
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  FIGMA: "Figma",
  OTHER: "Outro",
};

const MEDIA_TYPE_LABEL: Record<string, string> = {
  VIDEOS: "Vídeos",
  FOTOS: "Fotos",
  DOCUMENTOS: "Documentos",
  LOGOS: "Logos",
  SOCIAL_MEDIA: "Social Media",
  OUTROS: "Outros",
};

/** Rótulo de tipo: mediaType para NAS, ArtifactType para link. */
export function artifactTypeLabel(
  row: Pick<UnifiedArtifactRow, "storageKind" | "type" | "mediaType">
): string {
  if (row.storageKind === "NAS_UPLOAD" && row.mediaType) {
    return MEDIA_TYPE_LABEL[row.mediaType] ?? row.mediaType;
  }
  if (row.type) return ARTIFACT_TYPE_LABEL[row.type] ?? row.type;
  return "—";
}

type RawArtifact = {
  id: string;
  title: string;
  url?: string | null;
  storageKind?: string | null;
  uploadStatus?: string | null;
  type?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  createdAt: Date | string;
  user?: { name?: string | null; email?: string | null } | null;
};

/** Mapeia um artefato bruto (record do Prisma) para a linha unificada. */
export function mapArtifactRow(
  a: RawArtifact,
  origin: ArtifactOrigin,
  task?: { id: string; title: string } | null
): UnifiedArtifactRow {
  return {
    id: a.id,
    origin,
    title: a.title,
    url: a.url ?? null,
    storageKind: a.storageKind === "NAS_UPLOAD" ? "NAS_UPLOAD" : "LINK",
    uploadStatus: a.uploadStatus ?? "READY",
    type: a.type ?? null,
    mediaType: a.mediaType ?? null,
    fileName: a.fileName ?? null,
    createdAt: typeof a.createdAt === "string" ? a.createdAt : a.createdAt.toISOString(),
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    userName: a.user?.name ?? a.user?.email ?? null,
  };
}

/** Ordena por data (mais recentes primeiro). */
export function sortRows(rows: UnifiedArtifactRow[]): UnifiedArtifactRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
