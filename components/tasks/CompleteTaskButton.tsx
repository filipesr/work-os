"use client";

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
  // If controlled via props, don't render button (only modal)
  const isControlled = controlledOpen !== undefined;

  // Don't show button if task is already completed
  if (taskStatus === "COMPLETED" && !isControlled) {
    return null;
  }

  return (
    <ConfirmActionButton
      action={() => completeTask(taskId)}
      title="Concluir Tarefa"
      description="Tem certeza que deseja marcar esta tarefa como concluída? Esta ação indica que todo o trabalho foi finalizado."
      confirmLabel="Concluir Tarefa"
      pendingLabel="Concluindo..."
      successMessage="Tarefa concluída com sucesso!"
      confirmClassName="bg-green-600 hover:bg-green-700 text-white"
      open={controlledOpen}
      onOpenChange={onOpenChange}
      trigger={
        isControlled ? undefined : (
          <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Concluir Tarefa
          </button>
        )
      }
    >
      {/* Info */}
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800">
          <strong>✓ Ação:</strong> A tarefa será marcada como CONCLUÍDA
        </p>
        <p className="text-xs text-green-700 mt-2">
          Um comentário será adicionado indicando que a tarefa foi concluída.
        </p>
      </div>
    </ConfirmActionButton>
  );
}
