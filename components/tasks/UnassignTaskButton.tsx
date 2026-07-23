"use client";

import { useTranslations } from "next-intl";
import { unassignTask } from "@/lib/actions/task";
import { UserMinus } from "lucide-react";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface UnassignTaskButtonProps {
  taskId: string;
  currentAssignee: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UnassignTaskButton({
  taskId,
  currentAssignee,
  open: controlledOpen,
  onOpenChange,
}: UnassignTaskButtonProps) {
  const t = useTranslations("tasks.actions");

  if (!currentAssignee) {
    return null; // Don't show button if task is not assigned
  }

  return (
    <ConfirmActionButton
      action={() => unassignTask(taskId)}
      title={t("unassignTask")}
      description={t("unassignTaskDialog.description")}
      confirmLabel={t("unassignTask")}
      pendingLabel={t("unassignTaskDialog.pending")}
      successMessage={t("unassignTaskDialog.success")}
      confirmClassName="bg-orange-600 hover:bg-orange-700 text-white"
      open={controlledOpen}
      onOpenChange={onOpenChange}
      trigger={
        <button className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          <UserMinus className="h-4 w-4" />
          {t("unassignTask")}
        </button>
      }
    >
      {/* Current Assignee Info */}
      <div className="p-4 bg-warning-subtle border border-warning/40 rounded-lg">
        <p className="text-sm text-warning">
          <strong>{t("unassignTaskDialog.currentAssigneeLabel")}</strong> {currentAssignee}
        </p>
        <p className="text-xs text-warning mt-2">{t("unassignTaskDialog.infoComment")}</p>
      </div>
    </ConfirmActionButton>
  );
}
