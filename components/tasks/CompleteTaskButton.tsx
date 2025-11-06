"use client";

import { useState, useTransition } from "react";
import { completeTask } from "@/lib/actions/task";
import { CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

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

  const handleComplete = async () => {
    startTransition(async () => {
      const result = await completeTask(taskId);

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Tarefa concluída com sucesso!");
        setShowConfirm(false);
      }
    });
  };

  // If controlled via props, don't render button (only modal)
  const isControlled = controlledOpen !== undefined;

  // Don't show button if task is already completed
  if (taskStatus === "COMPLETED" && !isControlled) {
    return null;
  }

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" />
          Concluir Tarefa
        </button>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-border">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Concluir Tarefa
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Tem certeza que deseja marcar esta tarefa como concluída? Esta ação indica que todo o trabalho foi finalizado.
              </p>
            </div>

            {/* Info */}
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>✓ Ação:</strong> A tarefa será marcada como CONCLUÍDA
              </p>
              <p className="text-xs text-green-700 mt-2">
                Um comentário será adicionado indicando que a tarefa foi concluída.
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
                onClick={handleComplete}
                disabled={isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isPending ? "Concluindo..." : "Concluir Tarefa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
