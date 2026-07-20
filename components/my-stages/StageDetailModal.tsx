"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import type { ActiveStageWithDetails } from "@/lib/actions/task";
import { priorityBadgeClass, stageStatusBadgeClass } from "@/lib/status-styles";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

interface StageDetailModalProps {
  stage: ActiveStageWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageDetailModal({ stage, open, onOpenChange }: StageDetailModalProps) {
  const t = useTranslations("myStages");

  if (!stage) return null;

  const formatDate = (date: Date | null | undefined) => formatDisplayDateTime(date);

  const formatDateOnly = (date: Date | null | undefined) =>
    formatDisplayDate(date, t("modal.noDueDate"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{stage.task.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5" />
            {t("modal.readOnlyNotice")}
          </DialogDescription>
        </DialogHeader>

        {/* Task Info Section */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("modal.taskInfo")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.project")}</p>
              <p className="text-sm font-medium">{stage.task.project.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.priority")}</p>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-md border ${priorityBadgeClass(
                  stage.task.priority
                )}`}
              >
                {t(`priority.${stage.task.priority}`)}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.taskStatus")}</p>
              <Badge variant="secondary">{t(`status.${stage.task.status}`)}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.dueDate")}</p>
              <p className="text-sm">{formatDateOnly(stage.task.dueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.createdAt")}</p>
              <p className="text-sm">{formatDate(stage.task.createdAt)}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Stage Info Section */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("modal.stageInfo")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.stageName")}</p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {stage.stage.order}
                </span>
                <span className="text-sm font-medium">{stage.stage.name}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.stageStatus")}</p>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-md border ${stageStatusBadgeClass(
                  stage.status
                )}`}
              >
                {t(`status.${stage.status}`)}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.template")}</p>
              <p className="text-sm">{stage.stage.template.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.assignee")}</p>
              <p className="text-sm">
                {stage.assignee?.name || stage.assignee?.email || t("unassigned")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.team")}</p>
              <p className="text-sm">{stage.stage.defaultTeam?.name || t("modal.noTeam")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("modal.activatedAt")}</p>
              <p className="text-sm">{formatDate(stage.activatedAt)}</p>
            </div>
            {stage.completedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("modal.completedAt")}</p>
                <p className="text-sm">{formatDate(stage.completedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
