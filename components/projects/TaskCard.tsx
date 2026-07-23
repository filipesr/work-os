"use client";

import Link from "next/link";
import { Task, User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { priorityTone } from "@/lib/status-tone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { dateFnsLocale } from "@/lib/date-locale";

type TaskCardProps = {
  task: Task & {
    assignee: Pick<User, "id" | "name" | "email" | "image"> | null;
  };
};

export function TaskCard({ task }: TaskCardProps) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium line-clamp-2">{task.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Priority Badge */}
          <div>
            <StatusBadge
              tone={priorityTone(task.priority)}
              label={t(`priority.${task.priority}`)}
            />
          </div>

          {/* Due Date */}
          {task.dueDate && (
            <div className="flex items-center gap-2 text-sm">
              {isOverdue ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <Calendar className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={isOverdue ? "text-destructive" : "text-muted-foreground"}>
                {formatDistanceToNow(new Date(task.dueDate), {
                  addSuffix: true,
                  locale: dateFnsLocale(locale),
                })}
              </span>
            </div>
          )}

          {/* Assignee */}
          {task.assignee ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={task.assignee.image || undefined} />
                <AvatarFallback className="text-xs">
                  {task.assignee.name?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {task.assignee.name || task.assignee.email}
              </span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">{t("unassigned")}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
