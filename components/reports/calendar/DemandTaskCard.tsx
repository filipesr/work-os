"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import type { DemandTask } from "./monthly-types";

const STATUS_CLASS: Record<DemandTask["status"], string> = {
  COMPLETED: "bg-success-subtle text-success border-success/40",
  IN_PROGRESS: "bg-primary/10 text-primary border-primary/20",
  PAUSED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
  OBSOLETE: "bg-muted text-muted-foreground border-border",
  BACKLOG: "bg-muted text-muted-foreground border-border",
};

interface DemandTaskCardProps {
  task: DemandTask;
}

export function DemandTaskCard({ task }: DemandTaskCardProps) {
  const t = useTranslations("reportsCalendar.monthly.dayDemands");
  const tStatus = useTranslations("reportsCalendar.monthly.status");

  return (
    <li className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">{task.projectName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.stageName ?? t("noStage")}
            {" · "}
            {task.assigneeName ?? t("unassigned")}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[task.status]}`}
        >
          {tStatus(task.status)}
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
  );
}
