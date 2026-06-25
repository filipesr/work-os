"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DemandTask } from "./monthly-types";

const STATUS_CLASS: Record<DemandTask["status"], string> = {
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  IN_PROGRESS: "bg-primary/10 text-primary border-primary/20",
  PAUSED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
  BACKLOG: "bg-muted text-muted-foreground border-border",
};

interface DayDemandsDialogProps {
  clientName: string;
  dateLabel: string;
  tasks: DemandTask[];
  onClose: () => void;
}

export function DayDemandsDialog({ clientName, dateLabel, tasks, onClose }: DayDemandsDialogProps) {
  const t = useTranslations("reportsCalendar.monthly.dayDemands");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("title", { client: clientName })}</DialogTitle>
          <DialogDescription>
            {t("subtitle", { count: tasks.length, date: dateLabel })}
          </DialogDescription>
        </DialogHeader>

        {tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto py-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.projectName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.stageName ?? t("noStage")}
                      {" · "}
                      {task.assigneeName ?? t("unassigned")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_CLASS[task.status]}`}
                  >
                    {task.status}
                  </span>
                </div>
                <Link
                  href={`/admin/tasks/${task.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:gap-1.5 transition-all"
                >
                  {t("openTask")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
