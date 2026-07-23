"use client";

import { useTranslations } from "next-intl";
import { completeStageAndAdvance } from "@/lib/actions/task";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useControllableOpen } from "@/lib/hooks/useControllableOpen";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { useNextStagePreview } from "@/lib/hooks/useNextStagePreview";

interface AdvanceStageButtonProps {
  taskId: string;
  currentStageId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AdvanceStageButton({
  taskId,
  currentStageId,
  open: controlledOpen,
  onOpenChange,
}: AdvanceStageButtonProps) {
  const t = useTranslations("tasks.stages");
  const tCommon = useTranslations("common");

  const {
    open: showConfirm,
    setOpen: setShowConfirm,
    isControlled,
  } = useControllableOpen(controlledOpen, onOpenChange);

  // Pre-confirm preview state (loaded when the modal opens)
  const {
    previewData,
    membersByStage,
    assignments,
    setAssignment,
    loading: previewLoading,
  } = useNextStagePreview(taskId, currentStageId, showConfirm);

  const { run, isPending } = useServerAction(completeStageAndAdvance, {
    onSuccess: (result) => {
      const r = result as
        | { success?: boolean; activated?: unknown[]; blocked?: unknown[] }
        | undefined;
      if (!r?.success) return;

      // Show success toast with summary
      const activatedCount = r.activated?.length || 0;
      const blockedCount = r.blocked?.length || 0;

      if (activatedCount > 0 && blockedCount > 0) {
        toast.success(
          t("toasts.completedWithActivatedBlocked", {
            activated: activatedCount,
            blocked: blockedCount,
          }),
          { duration: 5000 }
        );
      } else if (activatedCount > 0) {
        toast.success(t("toasts.completedWithActivated", { activated: activatedCount }), {
          duration: 4000,
        });
      } else if (blockedCount > 0) {
        toast.success(t("toasts.completedWithBlocked", { blocked: blockedCount }), {
          duration: 4000,
        });
      } else {
        toast.success(t("toasts.completed"));
      }

      setShowConfirm(false);
    },
  });

  // Don't show button if there's no current stage
  if (!currentStageId) {
    return (
      <div className="border border-warning/40 bg-warning-subtle rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warning" />
          <p className="text-sm font-medium text-warning">{t("noActiveStage")}</p>
        </div>
      </div>
    );
  }

  const handleComplete = () => {
    run(taskId, currentStageId, Object.keys(assignments).length > 0 ? assignments : undefined);
  };

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending}
          className="px-4 py-2 bg-success text-white rounded-md hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("completing")}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              {t("completeStageButton")}
            </>
          )}
        </button>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="advance-stage-title"
            className="bg-background rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-border"
          >
            {/* Header */}
            <div className="mb-6">
              <h3 id="advance-stage-title" className="text-2xl font-bold text-foreground mb-2">
                {t("advanceModal.title")}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("advanceModal.description")}
              </p>
            </div>

            {/* Info Box */}
            <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm text-primary">
                <strong>{t("advanceModal.whatHappensLabel")}</strong>
              </p>
              <ul className="text-xs text-primary mt-2 space-y-1 list-disc pl-5">
                <li>{t("advanceModal.whatHappens1")}</li>
                <li>
                  {t.rich("advanceModal.whatHappens2", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </li>
                <li>
                  {t.rich("advanceModal.whatHappens3", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </li>
                <li>{t("advanceModal.whatHappens4")}</li>
              </ul>
            </div>

            {/* Requirement Box */}
            <div className="mb-6 p-4 bg-warning-subtle border border-warning/40 rounded-lg">
              <p className="text-sm text-warning">
                <strong>{t("advanceModal.requirementLabel")}</strong>
              </p>
              <p className="text-xs text-warning mt-2">
                {t.rich("advanceModal.requirementText", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>

            {/* Pre-confirm preview of next stages + optional assignee selects */}
            {previewLoading && (
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("advanceModal.loading")}
              </div>
            )}
            {previewData && (
              <div className="mb-6 space-y-3">
                {previewData.activated.length > 0 && (
                  <div className="p-3 bg-success-subtle border border-success/40 rounded-lg">
                    <p className="text-sm font-semibold text-success mb-2">
                      ✓ {t("advanceModal.activatedTitle")}
                    </p>
                    <ul className="space-y-2">
                      {previewData.activated.map((stage) => (
                        <li
                          key={stage.id}
                          className="flex items-center justify-between gap-2 text-xs text-success"
                        >
                          <span>
                            • {stage.name} ({t("advanceModal.orderLabel", { order: stage.order })})
                          </span>
                          <StageAssigneeSelect
                            stageId={stage.id}
                            teamName={stage.defaultTeam?.name ?? null}
                            members={membersByStage[stage.id] ?? []}
                            value={assignments[stage.id] ?? ""}
                            onChange={(userId) => setAssignment(stage.id, userId)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {previewData.blocked.length > 0 && (
                  <div className="p-3 bg-warning-subtle border border-warning/40 rounded-lg">
                    <p className="text-sm font-semibold text-warning mb-2">
                      🔒 {t("advanceModal.blockedTitle")}
                    </p>
                    <ul className="space-y-2">
                      {previewData.blocked.map((stage) => (
                        <li
                          key={stage.id}
                          className="flex items-center justify-between gap-2 text-xs text-warning"
                        >
                          <span>
                            • {stage.name} ({t("advanceModal.orderLabel", { order: stage.order })})
                          </span>
                          <StageAssigneeSelect
                            stageId={stage.id}
                            teamName={stage.defaultTeam?.name ?? null}
                            members={membersByStage[stage.id] ?? []}
                            value={assignments[stage.id] ?? ""}
                            onChange={(userId) => setAssignment(stage.id, userId)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 font-medium"
              >
                {tCommon("buttons.cancel")}
              </button>
              <button
                onClick={handleComplete}
                disabled={isPending}
                className="px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("completing")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t("confirmComplete")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
