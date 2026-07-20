"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { completeStageAndAdvance } from "@/lib/actions/task";
import {
  previewNextStages,
  getTeamMembers,
  type PreviewStage,
} from "@/lib/actions/stage-assignment";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useControllableOpen } from "@/lib/hooks/useControllableOpen";
import { useServerAction } from "@/lib/hooks/useServerAction";

type Member = { id: string; name: string | null; email: string | null };
type MembersByStage = Record<string, Member[]>;

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

  const {
    open: showConfirm,
    setOpen: setShowConfirm,
    isControlled,
  } = useControllableOpen(controlledOpen, onOpenChange);

  // Pre-confirm preview state
  const [previewData, setPreviewData] = useState<{
    activated: PreviewStage[];
    blocked: PreviewStage[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [membersByStage, setMembersByStage] = useState<MembersByStage>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});

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

  // Load next-stage preview when the modal opens
  useEffect(() => {
    if (!showConfirm || !currentStageId) return;

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewData(null);
    setAssignments({});
    setMembersByStage({});

    (async () => {
      try {
        const result = await previewNextStages(taskId, currentStageId);
        if (cancelled) return;

        const allStages = [...result.activated, ...result.blocked];
        const stagesWithTeam = allStages.filter((s) => s.defaultTeamId !== null);

        const memberResults = await Promise.all(
          stagesWithTeam.map(async (s) => ({
            stageId: s.id,
            members: await getTeamMembers(s.defaultTeamId as string),
          }))
        );

        if (cancelled) return;

        const newMembersByStage: MembersByStage = {};
        for (const { stageId, members } of memberResults) {
          newMembersByStage[stageId] = members;
        }

        // Pre-fill with each stage's already-assigned responsible (set at
        // creation), but only when that user is still in the stage's team.
        const initialAssignments: Record<string, string> = {};
        for (const s of allStages) {
          if (!s.assigneeId) continue;
          const inTeam = newMembersByStage[s.id]?.some((m) => m.id === s.assigneeId);
          if (inTeam) initialAssignments[s.id] = s.assigneeId;
        }

        setPreviewData(result);
        setMembersByStage(newMembersByStage);
        setAssignments(initialAssignments);
      } catch {
        // fail silently — the user can still confirm without assignments
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showConfirm, taskId, currentStageId]);

  const handleAssignmentChange = (stageId: string, userId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (userId) {
        next[stageId] = userId;
      } else {
        delete next[stageId];
      }
      return next;
    });
  };

  // Don't show button if there's no current stage
  if (!currentStageId) {
    return (
      <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <p className="text-sm font-medium text-yellow-900">Nenhuma etapa ativa para concluir</p>
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
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Concluindo...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Concluir Etapa
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
                Concluir Etapa Atual
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Ao confirmar, a etapa atual será marcada como concluída e as próximas etapas
                dependentes serão ativadas automaticamente (fork/join).
              </p>
            </div>

            {/* Info Box */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>ℹ️ O que acontecerá:</strong>
              </p>
              <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc pl-5">
                <li>A etapa atual será concluída</li>
                <li>
                  Todas as etapas dependentes com dependências cumpridas serão{" "}
                  <strong>ativadas</strong>
                </li>
                <li>
                  Etapas com dependências pendentes serão criadas como <strong>bloqueadas</strong>
                </li>
                <li>Um log será adicionado ao histórico da tarefa</li>
              </ul>
            </div>

            {/* Requirement Box */}
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-900">
                <strong>⚠️ Requisito de contribuição:</strong>
              </p>
              <p className="text-xs text-amber-800 mt-2">
                Você precisa ter adicionado <strong>pelo menos 1 artefato ou 1 comentário</strong>{" "}
                nesta tarefa antes de concluir a etapa. (Admins e Gerentes podem ignorar este
                requisito.)
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
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-800 mb-2">
                      ✓ {t("advanceModal.activatedTitle")}
                    </p>
                    <ul className="space-y-2">
                      {previewData.activated.map((stage) => (
                        <li
                          key={stage.id}
                          className="flex items-center justify-between gap-2 text-xs text-green-700"
                        >
                          <span>
                            • {stage.name} ({t("advanceModal.orderLabel", { order: stage.order })})
                          </span>
                          <StageAssigneeSelect
                            stageId={stage.id}
                            teamName={stage.defaultTeam?.name ?? null}
                            members={membersByStage[stage.id] ?? []}
                            value={assignments[stage.id] ?? ""}
                            onChange={(userId) => handleAssignmentChange(stage.id, userId)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {previewData.blocked.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-semibold text-yellow-800 mb-2">
                      🔒 {t("advanceModal.blockedTitle")}
                    </p>
                    <ul className="space-y-2">
                      {previewData.blocked.map((stage) => (
                        <li
                          key={stage.id}
                          className="flex items-center justify-between gap-2 text-xs text-yellow-700"
                        >
                          <span>
                            • {stage.name} ({t("advanceModal.orderLabel", { order: stage.order })})
                          </span>
                          <StageAssigneeSelect
                            stageId={stage.id}
                            teamName={stage.defaultTeam?.name ?? null}
                            members={membersByStage[stage.id] ?? []}
                            value={assignments[stage.id] ?? ""}
                            onChange={(userId) => handleAssignmentChange(stage.id, userId)}
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
                Cancelar
              </button>
              <button
                onClick={handleComplete}
                disabled={isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Concluindo...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar e Concluir
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
