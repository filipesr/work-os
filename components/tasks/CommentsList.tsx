"use client";

import { useTranslations, useLocale } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/date-locale";

/**
 * Forma mínima que a lista precisa de cada comentário. Cobre tanto o `TaskComment` do Prisma
 * (chamador de `/tasks/{id}` e do modal de histórico) quanto o comentário mapeado de `StageView`
 * (chamador da tela da etapa) — o segundo não carrega `taskId`/`updatedAt`/`userId`, só o que a
 * lista de fato usa. Um tipo estrutural em vez de `TaskComment &` deixa os dois convergirem sem
 * um adaptador cheio de campos inventados.
 */
export type CommentListItem = {
  id: string;
  content: string;
  createdAt: Date | string;
  kind: "USER" | "STAGE_INSTRUCTION";
  activeStageId: string | null;
  user: { id: string; name: string | null; email: string | null; image?: string | null };
};

interface CommentsListProps {
  comments: CommentListItem[];
  currentUserId: string;
  /** Etapa em foco na tela: comentário nascido nela ganha o realce visual (`data-this-stage`).
   *  Omitido pelos chamadores fora da tela da etapa — lá ninguém precisa do destaque, e sem a
   *  prop nenhum comentário é marcado. */
  highlightStageId?: string | null;
}

export function CommentsList({ comments, currentUserId, highlightStageId }: CommentsListProps) {
  const t = useTranslations("tasks.comments");
  const tStage = useTranslations("tasks.stageView");
  const locale = useLocale();
  if (comments.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">{t("emptyPrompt")}</div>;
  }

  // Sort comments by date (oldest first, like a chat)
  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      {sortedComments.map((comment) => {
        const isOwnComment = comment.user.id === currentUserId;
        const isThisStage = highlightStageId != null && comment.activeStageId === highlightStageId;
        // `STAGE_INSTRUCTION` é direcionamento do gestor, não conversa — ganha título e cor
        // próprios (o mesmo verniz do destaque no topo da tela da etapa) em vez de virar bolha.
        const isInstruction = comment.kind === "STAGE_INSTRUCTION";

        return (
          <div
            key={comment.id}
            data-testid="comment"
            className={`flex gap-3 ${isOwnComment ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={getProxiedImageUrl(comment.user.image ?? null) || undefined} />
              <AvatarFallback className="text-xs">
                {comment.user.name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>

            {/* Comment Bubble */}
            <div className={`flex-1 max-w-[80%] ${isOwnComment ? "items-end" : ""}`}>
              {/* User name and time */}
              <div
                className={`flex items-center gap-2 mb-1 ${isOwnComment ? "flex-row-reverse" : ""}`}
              >
                <span className="text-xs font-medium">
                  {isOwnComment ? t("you") : comment.user.name || comment.user.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                    locale: dateFnsLocale(locale),
                  })}
                </span>
                {isThisStage && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {tStage("thisStage")}
                  </span>
                )}
              </div>

              {/* Comment content */}
              <div
                data-testid={`comment-${comment.id}`}
                data-this-stage={String(isThisStage)}
                className={`rounded-2xl px-4 py-2 ${
                  isInstruction
                    ? "border border-warning/40 bg-warning-subtle"
                    : isOwnComment
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                }`}
              >
                {isInstruction && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    {tStage("instructionTitle")}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
