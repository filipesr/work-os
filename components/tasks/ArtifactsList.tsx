"use client";

import { TaskArtifact, User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink, FileText, Image, Video, Figma, File } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
              {/* Title and link */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <a
                  href={artifact.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline flex items-center gap-1 group"
                >
                  <span className="truncate">{artifact.title}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {/* User */}
                <div className="flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={artifact.user.image || undefined} />
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
