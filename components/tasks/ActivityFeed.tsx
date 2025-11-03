"use client";

import { useMemo } from "react";
import { TaskComment, TaskArtifact, User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FileText, Image, Video, Figma, File, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type CommentWithUser = TaskComment & {
  user: Pick<User, "id" | "name" | "email" | "image">;
};

type ArtifactWithUser = TaskArtifact & {
  user: Pick<User, "id" | "name" | "email" | "image">;
};

interface ActivityFeedProps {
  comments: CommentWithUser[];
  artifacts: ArtifactWithUser[];
}

type ActivityItem =
  | ({ type: "comment" } & CommentWithUser)
  | ({ type: "artifact" } & ArtifactWithUser);

const artifactIcons = {
  DOCUMENT: FileText,
  IMAGE: Image,
  VIDEO: Video,
  FIGMA: Figma,
  OTHER: File,
};

const artifactLabels = {
  DOCUMENT: "Documento",
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  FIGMA: "Figma",
  OTHER: "Arquivo",
};

export function ActivityFeed({ comments, artifacts }: ActivityFeedProps) {
  // Combine and sort comments and artifacts by creation date
  const activities = useMemo(() => {
    const combined: ActivityItem[] = [
      ...comments.map((c) => ({ ...c, type: "comment" as const })),
      ...artifacts.map((a) => ({ ...a, type: "artifact" as const })),
    ];

    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [comments, artifacts]);

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
        <p className="text-sm">Nenhuma atividade ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        Histórico de Atividades
      </h3>

      <div className="space-y-4">
        {activities.map((activity) => {
          if (activity.type === "comment") {
            return <CommentItem key={`comment-${activity.id}`} comment={activity} />;
          } else {
            return <ArtifactItem key={`artifact-${activity.id}`} artifact={activity} />;
          }
        })}
      </div>
    </div>
  );
}

function CommentItem({ comment }: { comment: CommentWithUser }) {
  const isRevertComment = comment.content.startsWith("**REVERTED");

  return (
    <div
      className={`flex gap-3 p-3 rounded-lg ${
        isRevertComment ? "bg-orange-50 border border-orange-200" : "bg-muted/50"
      }`}
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={comment.user.image || undefined} />
        <AvatarFallback>
          {comment.user.name?.charAt(0).toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">
            {comment.user.name || comment.user.email}
          </span>
          {isRevertComment && (
            <Badge variant="outline" className="text-xs">
              Reversão
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>
    </div>
  );
}

function ArtifactItem({ artifact }: { artifact: ArtifactWithUser }) {
  const Icon = artifactIcons[artifact.type];

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
      <Avatar className="h-8 w-8">
        <AvatarImage src={artifact.user.image || undefined} />
        <AvatarFallback>
          {artifact.user.name?.charAt(0).toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">
            {artifact.user.name || artifact.user.email}
          </span>
          <span className="text-xs text-muted-foreground">
            adicionou um {artifactLabels[artifact.type].toLowerCase()}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(artifact.createdAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
        </div>

        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 p-2 rounded-md bg-background hover:bg-accent transition-colors border"
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{artifact.title}</span>
        </a>
      </div>
    </div>
  );
}
