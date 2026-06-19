"use client";

import { useState, useTransition } from "react";
import { completeStageAndAdvance } from "@/lib/actions/task";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

interface Stage {
  id: string;
  name: string;
  order: number;
}

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
  const [internalOpen, setInternalOpen] = useState(false);
  const showConfirm = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setShowConfirm = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [isPending, startTransition] = useTransition();
  const [previewResult, setPreviewResult] = useState<{
    activated: Stage[];
    blocked: Stage[];
  } | null>(null);

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

  const handleComplete = async () => {
    startTransition(async () => {
      const result = await completeStageAndAdvance(taskId, currentStageId);

      if (result?.error) {
        toast.error(result.error);
      } else if (result?.success) {
        // Store result for preview
        setPreviewResult({
          activated: result.activated || [],
          blocked: result.blocked || [],
        });

        // Show success toast with summary
        const activatedCount = result.activated?.length || 0;
        const blockedCount = result.blocked?.length || 0;

        if (activatedCount > 0 && blockedCount > 0) {
          toast.success(
            `Etapa concluída! ${activatedCount} etapa(s) ativada(s), ${blockedCount} etapa(s) bloqueada(s)`,
            { duration: 5000 }
          );
        } else if (activatedCount > 0) {
          toast.success(`Etapa concluída! ${activatedCount} etapa(s) ativada(s)`, {
            duration: 4000,
          });
        } else if (blockedCount > 0) {
          toast.success(`Etapa concluída! ${blockedCount} etapa(s) criada(s) como bloqueadas`, {
            duration: 4000,
          });
        } else {
          toast.success("Etapa concluída com sucesso!");
        }

        setShowConfirm(false);
      }
    });
  };

  // If controlled via props, don't render button (only modal)
  const isControlled = controlledOpen !== undefined;

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

            {/* Show preview if available */}
            {previewResult && (
              <div className="mb-6 space-y-3">
                {previewResult.activated.length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-800 mb-2">
                      ✓ Etapas que serão ativadas:
                    </p>
                    <ul className="text-xs text-green-700 space-y-1">
                      {previewResult.activated.map((stage: Stage) => (
                        <li key={stage.id}>
                          • {stage.name} (ordem {stage.order})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {previewResult.blocked.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-semibold text-yellow-800 mb-2">
                      🔒 Etapas que serão bloqueadas:
                    </p>
                    <ul className="text-xs text-yellow-700 space-y-1">
                      {previewResult.blocked.map((stage: Stage) => (
                        <li key={stage.id}>
                          • {stage.name} (ordem {stage.order})
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
