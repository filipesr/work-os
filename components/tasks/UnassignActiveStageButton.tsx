"use client";

import { useState, useTransition } from "react";
import { unassignActiveStage } from "@/lib/actions/task";
import { UserMinus } from "lucide-react";
import toast from "react-hot-toast";

interface UnassignActiveStageButtonProps {
  taskId: string;
  stageId: string;
  currentAssignee: string | null;
}

export function UnassignActiveStageButton({
  taskId,
  stageId,
  currentAssignee,
}: UnassignActiveStageButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleUnassign = async () => {
    startTransition(async () => {
      const result = await unassignActiveStage(taskId, stageId);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Etapa desatribuída com sucesso");
        setShowConfirm(false);
      }
    });
  };

  if (!currentAssignee) {
    return null; // Don't show button if stage is not assigned
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <UserMinus className="h-4 w-4" />
        Liberar Etapa
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-gray-200">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Liberar Etapa
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Tem certeza que deseja desatribuir esta etapa? A etapa voltará para o backlog e ficará disponível para outros membros do time reivindicarem.
              </p>
            </div>

            {/* Current Assignee Info */}
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-800">
                <strong>Responsável atual:</strong> {currentAssignee}
              </p>
              <p className="text-xs text-orange-700 mt-2">
                Um comentário será adicionado indicando que a etapa foi desatribuída.
              </p>
            </div>

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
                onClick={handleUnassign}
                disabled={isPending}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 font-medium"
              >
                {isPending ? "Desatribuindo..." : "Liberar Etapa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
