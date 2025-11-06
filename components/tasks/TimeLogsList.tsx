"use client";

import { TimeLog, User, TemplateStage } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TimeLogWithRelations = TimeLog & {
  user: Pick<User, "id" | "name" | "email" | "image">;
  stage: Pick<TemplateStage, "id" | "name" | "order"> | null;
};

interface TimeLogsListProps {
  timeLogs: TimeLogWithRelations[];
}

export function TimeLogsList({ timeLogs }: TimeLogsListProps) {
  if (timeLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Nenhum tempo registrado ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {timeLogs.map((log) => (
        <div
          key={log.id}
          className="border rounded-lg p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          {/* Header: User + Date */}
          <div className="flex items-start gap-3 mb-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={log.user.image || undefined} />
              <AvatarFallback className="text-xs">
                {log.user.name?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {log.user.name || log.user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(log.logDate), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
            {/* Hours Badge */}
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-semibold">
              <Clock className="h-3 w-3" />
              {log.hoursSpent}h
            </div>
          </div>

          {/* Stage (if applicable) */}
          {log.stage && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                Etapa {log.stage.order}: {log.stage.name}
              </span>
            </div>
          )}

          {/* Description */}
          {log.description && (
            <p className="text-sm text-foreground leading-relaxed">
              {log.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
