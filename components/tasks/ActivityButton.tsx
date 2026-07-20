"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startWorkOnTask, stopWorkOnTask } from "@/lib/actions/activity";
import { Play, Square, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useControllableOpen } from "@/lib/hooks/useControllableOpen";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface ActiveLog {
  id: string;
  taskId: string;
  task: {
    id: string;
    title: string;
  };
}

interface ActivityButtonProps {
  taskId: string;
  taskTitle: string;
  currentStageId: string | null;
  activeLog: ActiveLog | null;
}

export function ActivityButton({
  taskId,
  taskTitle,
  currentStageId,
  activeLog,
}: ActivityButtonProps) {
  const { open: showStopModal, setOpen: setShowStopModal } = useControllableOpen();
  const [description, setDescription] = useState("");
  const t = useTranslations("tasks.activity");

  const { run: runStart, isPending: isStarting } = useServerAction(startWorkOnTask, {
    onSuccess: (result) => {
      const r = result as { status?: string } | undefined;
      if (r?.status === "already_active") {
        toast(t("alreadyActiveInfo"));
      } else {
        toast.success(t("startSuccess", { taskTitle }));
      }
    },
  });

  const { run: runStop, isPending: isStopping } = useServerAction(stopWorkOnTask, {
    successMessage: t("stopSuccess", { taskTitle }),
    onSuccess: () => {
      setShowStopModal(false);
      setDescription("");
    },
  });

  // Check if this specific task is active
  const isThisTaskActive = activeLog?.taskId === taskId;

  // Check if user is working on a different task
  const isWorkingOnOtherTask = activeLog && activeLog.taskId !== taskId;

  const handleStart = () => {
    if (!currentStageId) {
      toast.error(t("noStageError"));
      return;
    }
    runStart(taskId, currentStageId);
  };

  const handleStop = () => {
    setShowStopModal(true);
  };

  const handleConfirmStop = () => {
    if (!activeLog) return;
    runStop(activeLog.id, taskId, description);
  };

  return (
    <>
      {isThisTaskActive ? (
        // This task is currently active - show STOP button
        <Button onClick={handleStop} disabled={isStopping} variant="destructive" className="w-full">
          {isStopping ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("stopping")}
            </>
          ) : (
            <>
              <Square className="h-4 w-4 mr-2" />
              {t("stopWork")}
            </>
          )}
        </Button>
      ) : (
        // No task is active, or a different task is active - show START button
        <div className="space-y-2">
          <Button
            onClick={handleStart}
            disabled={isStarting}
            variant="default"
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("starting")}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t("startWork")}
              </>
            )}
          </Button>
          {isWorkingOnOtherTask && (
            <p className="text-xs text-muted-foreground text-center">
              {t("switchWarning", { taskTitle: activeLog.task.title })}
            </p>
          )}
        </div>
      )}

      {/* Stop Activity Modal */}
      {showStopModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-activity-title"
            className="bg-background rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-border"
          >
            {/* Header */}
            <div className="mb-6">
              <h3 id="stop-activity-title" className="text-2xl font-bold text-foreground mb-2">
                {t("modal.title")}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{t("modal.subtitle")}</p>
            </div>

            {/* Description Field */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t("modal.label")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isStopping}
                className="w-full px-4 py-3 border-2 border-input bg-background text-foreground rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-input disabled:opacity-50 transition-all placeholder:text-muted-foreground"
                placeholder={t("modal.placeholder")}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("modal.hint")}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowStopModal(false);
                  setDescription("");
                }}
                disabled={isStopping}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 font-medium"
              >
                {t("modal.cancel")}
              </button>
              <button
                onClick={handleConfirmStop}
                disabled={isStopping}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
              >
                {isStopping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("stopping")}
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4" />
                    {t("modal.confirm")}
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
