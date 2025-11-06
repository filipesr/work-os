"use client";

import { TaskComment, User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type CommentWithUser = TaskComment & {
  user: Pick<User, "id" | "name" | "email" | "image">;
};

interface CommentsListProps {
  comments: CommentWithUser[];
  currentUserId: string;
}

export function CommentsList({ comments, currentUserId }: CommentsListProps) {
  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Nenhum comentário ainda. Seja o primeiro a comentar!
      </div>
    );
  }

  // Sort comments by date (oldest first, like a chat)
  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      {sortedComments.map((comment) => {
        const isOwnComment = comment.userId === currentUserId;

        return (
          <div
            key={comment.id}
            className={`flex gap-3 ${isOwnComment ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={comment.user.image || undefined} />
              <AvatarFallback className="text-xs">
                {comment.user.name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>

            {/* Comment Bubble */}
            <div className={`flex-1 max-w-[80%] ${isOwnComment ? "items-end" : ""}`}>
              {/* User name and time */}
              <div
                className={`flex items-center gap-2 mb-1 ${
                  isOwnComment ? "flex-row-reverse" : ""
                }`}
              >
                <span className="text-xs font-medium">
                  {isOwnComment ? "Você" : comment.user.name || comment.user.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>

              {/* Comment content */}
              <div
                className={`rounded-2xl px-4 py-2 ${
                  isOwnComment
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
