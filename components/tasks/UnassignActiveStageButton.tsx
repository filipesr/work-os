"use client";

import { useTranslations } from "next-intl";
import { unassignActiveStage } from "@/lib/actions/task";
import { UserMinus } from "lucide-react";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface UnassignActiveStageButtonProps {
  taskId: string;
  stageId: string;
  currentAssignee: string | null;
  /** Controlled mode: when provided, the component hides its own trigger button
   *  and the modal visibility is driven by these props. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UnassignActiveStageButton({
  taskId,
  stageId,
  currentAssignee,
  open,
  onOpenChange,
}: UnassignActiveStageButtonProps) {
  const t = useTranslations("tasks.actions");
  const controlled = onOpenChange !== undefined;

  if (!currentAssignee) {
    return null; // Don't show button if stage is not assigned
  }

  return (
    <ConfirmActionButton
      action={() => unassignActiveStage(taskId, stageId)}
      title={t("unassignStage")}
      description={t("unassignStageDialog.description")}
      confirmLabel={t("unassignStage")}
      pendingLabel={t("unassignStageDialog.pending")}
      successMessage={t("unassignStageDialog.success")}
      confirmClassName="bg-warning hover:bg-warning/90 text-white"
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        controlled ? undefined : (
          <button className="px-4 py-2 bg-warning text-white rounded-md hover:bg-warning/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <UserMinus className="h-4 w-4" />
            {t("unassignStage")}
          </button>
        )
      }
    >
      {/* Current Assignee Info */}
      <div className="p-4 bg-warning-subtle border border-warning/40 rounded-lg">
        <p className="text-sm text-warning">
          <strong>{t("unassignStageDialog.currentAssigneeLabel")}</strong> {currentAssignee}
        </p>
        <p className="text-xs text-warning mt-2">{t("unassignStageDialog.infoComment")}</p>
      </div>
    </ConfirmActionButton>
  );
}
