"use client";

import { TaskArtifact, User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { ExternalLink, FileText, Image, Video, Figma, File } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DownloadArtifactButton } from "./DownloadArtifactButton";

// NAS upload status -> badge label + classes.
const nasStatus: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border" },
  UPLOADING: { label: "Enviando", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  READY: { label: "Pronto", cls: "bg-green-100 text-green-800 border-green-200" },
  FAILED: { label: "Falhou", cls: "bg-red-100 text-red-800 border-red-200" },
  EXPIRED: { label: "Expirado", cls: "bg-muted text-muted-foreground border-border" },
};

type ArtifactWithUser = TaskArtifact & {
  user: Pick<User, "id" | "name" | "email" | "image">;
};

interface ArtifactsListProps {
  artifacts: ArtifactWithUser[];
}

const artifactTypeConfig = {
  DOCUMENT: { icon: FileText, label: "Documento", color: "text-blue-500" },
  IMAGE: { icon: Image, label: "Imagem", color: "text-green-500" },
  VIDEO: { icon: Video, label: "Vídeo", color: "text-purple-500" },
  FIGMA: { icon: Figma, label: "Figma", color: "text-pink-500" },
  OTHER: { icon: File, label: "Outro", color: "text-gray-500" },
};

export function ArtifactsList({ artifacts }: ArtifactsListProps) {
  if (artifacts.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Nenhum artefato anexado. Adicione links ou arquivos relevantes.
      </div>
    );
  }

  // Sort artifacts by date (newest first)
  const sortedArtifacts = [...artifacts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-3">
      {sortedArtifacts.map((artifact) => {
        const config = artifactTypeConfig[artifact.type];
        const Icon = config.icon;

        return (
          <div
            key={artifact.id}
            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            {/* Icon */}
            <div className={`flex-shrink-0 ${config.color}`}>
              <Icon className="h-5 w-5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title + action (link vs NAS upload) */}
              <div className="flex items-start justify-between gap-2 mb-1">
                {artifact.storageKind === "NAS_UPLOAD" ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">
                      {artifact.fileName || artifact.title}
                    </span>
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        nasStatus[artifact.uploadStatus]?.cls ??
                        "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {nasStatus[artifact.uploadStatus]?.label ?? artifact.uploadStatus}
                    </span>
                  </div>
                ) : (
                  <a
                    href={artifact.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline flex items-center gap-1 group"
                  >
                    <span className="truncate">{artifact.title}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                )}
                {artifact.storageKind === "NAS_UPLOAD" && artifact.uploadStatus === "READY" && (
                  <DownloadArtifactButton artifactId={artifact.id} />
                )}
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {/* User */}
                <div className="flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={getProxiedImageUrl(artifact.user.image) || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {artifact.user.name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{artifact.user.name || artifact.user.email}</span>
                </div>

                <span>•</span>

                {/* Type */}
                <span>{config.label}</span>

                <span>•</span>

                {/* Time */}
                <span>
                  {formatDistanceToNow(new Date(artifact.createdAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
