"use client";

import { useTranslations } from "next-intl";
import { completeTask } from "@/lib/actions/task";
import { CheckCircle2 } from "lucide-react";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface CompleteTaskButtonProps {
  taskId: string;
  taskStatus: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CompleteTaskButton({
  taskId,
  taskStatus,
  open: controlledOpen,
  onOpenChange,
}: CompleteTaskButtonProps) {
  const t = useTranslations("tasks.actions");
  // If controlled via props, don't render button (only modal)
  const isControlled = controlledOpen !== undefined;

  // Don't show button if task is already completed
  if (taskStatus === "COMPLETED" && !isControlled) {
    return null;
  }

  return (
    <ConfirmActionButton
      action={() => completeTask(taskId)}
      title={t("completeTask")}
      description={t("completeDialog.description")}
      confirmLabel={t("completeTask")}
      pendingLabel={t("completeDialog.pending")}
      successMessage={t("completeDialog.success")}
      confirmClassName="bg-green-600 hover:bg-green-700 text-white"
      open={controlledOpen}
      onOpenChange={onOpenChange}
      trigger={
        isControlled ? undefined : (
          <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {t("completeTask")}
          </button>
        )
      }
    >
      {/* Info */}
      <div className="p-4 bg-success-subtle border border-success/40 rounded-lg">
        <p className="text-sm text-success">
          <strong>✓ {t("completeDialog.infoActionLabel")}</strong>{" "}
          {t("completeDialog.infoActionText")}
        </p>
        <p className="text-xs text-success mt-2">{t("completeDialog.infoComment")}</p>
      </div>
    </ConfirmActionButton>
  );
}
