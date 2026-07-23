"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { revertTaskStage } from "@/lib/actions/task";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useControllableOpen } from "@/lib/hooks/useControllableOpen";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface RevertStageButtonProps {
  taskId: string;
  previousStages: Stage[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RevertStageButton({
  taskId,
  previousStages,
  open: controlledOpen,
  onOpenChange,
}: RevertStageButtonProps) {
  const t = useTranslations("tasks.stages.revertModal");
  const tCommon = useTranslations("common");
  const {
    open: isOpen,
    setOpen: setIsOpen,
    isControlled,
  } = useControllableOpen(controlledOpen, onOpenChange);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [kind, setKind] = useState<"INTERNAL" | "CLIENT" | null>(null);
  const { run, isPending } = useServerAction(revertTaskStage, {
    successMessage: t("successToast"),
    onSuccess: () => {
      setIsOpen(false);
      setComment("");
      setSelectedStageId(null);
      setKind(null);
    },
  });

  if (previousStages.length === 0) {
    return null;
  }

  const handleRevert = () => {
    if (!selectedStageId || !comment.trim() || !kind) {
      toast.error(t("validationError"));
      return;
    }
    run(taskId, selectedStageId, comment, kind);
  };

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setIsOpen(true)}
          disabled={isPending}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}← {t("triggerButton")}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revert-stage-title"
            className="bg-background rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-border"
          >
            {/* Header */}
            <div className="mb-6">
              <h3 id="revert-stage-title" className="text-2xl font-bold text-foreground mb-2">
                {t("title")}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{t("description")}</p>
            </div>

            {/* Info Badge */}
            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-xs text-indigo-800">
                <strong>{t("infoLabel")}</strong> {t("infoText")}
              </p>
            </div>

            {/* Stage Selection */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-3">
                {t("selectStageLabel")}
              </label>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {previousStages.map((stage, index) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setSelectedStageId(stage.id)}
                    disabled={isPending}
                    className={`w-full text-left p-4 border rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm hover:shadow-md ${
                      selectedStageId === stage.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Order Badge */}
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-md">
                          {stage.order}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground group-hover:text-indigo-600 transition-colors">
                            {stage.name}
                          </span>
                          {index === 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {t("mostRecent")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {index === 0 ? t("mostRecentDesc") : t("olderDesc")}
                        </p>
                      </div>

                      {/* Selected indicator */}
                      {selectedStageId === stage.id && (
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t("reasonLabel")}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                disabled={isPending}
                className="w-full px-4 py-3 border-2 border-input bg-background text-foreground rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-input disabled:opacity-50 transition-all placeholder:text-muted-foreground"
                placeholder={t("reasonPlaceholder")}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("reasonHint")}</p>
            </div>

            {/* Origem do retorno (interno vs cliente) */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t("originLabel")}
              </label>
              <div className="flex gap-3">
                {(["INTERNAL", "CLIENT"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    disabled={isPending}
                    aria-pressed={kind === k}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      kind === k
                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                        : "border-border text-foreground hover:bg-accent"
                    }`}
                  >
                    {t(k === "INTERNAL" ? "originInternal" : "originClient")}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("originHint")}</p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-between items-center pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {previousStages.length === 1
                  ? t("oneStageAvailable")
                  : t("manyStagesAvailable", { count: previousStages.length })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setComment("");
                    setSelectedStageId(null);
                    setKind(null);
                  }}
                  disabled={isPending}
                  className="px-4 py-2 bg-muted text-foreground rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {tCommon("buttons.cancel")}
                </button>
                <button
                  onClick={handleRevert}
                  disabled={isPending || !selectedStageId || !comment.trim() || !kind}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isPending ? t("pending") : t("confirmButton")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
