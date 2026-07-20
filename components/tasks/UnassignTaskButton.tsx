"use client";

import { unassignTask } from "@/lib/actions/task";
import { UserMinus } from "lucide-react";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface UnassignTaskButtonProps {
  taskId: string;
  currentAssignee: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UnassignTaskButton({
  taskId,
  currentAssignee,
  open: controlledOpen,
  onOpenChange,
}: UnassignTaskButtonProps) {
  if (!currentAssignee) {
    return null; // Don't show button if task is not assigned
  }

  return (
    <ConfirmActionButton
      action={() => unassignTask(taskId)}
      title="Liberar Tarefa"
      description="Tem certeza que deseja desatribuir esta tarefa? A tarefa voltará para o backlog e ficará disponível para outros membros do time reivindicarem."
      confirmLabel="Liberar Tarefa"
      pendingLabel="Desatribuindo..."
      successMessage="Tarefa desatribuída com sucesso"
      confirmClassName="bg-orange-600 hover:bg-orange-700 text-white"
      open={controlledOpen}
      onOpenChange={onOpenChange}
      trigger={
        <button className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          <UserMinus className="h-4 w-4" />
          Liberar Tarefa
        </button>
      }
    >
      {/* Current Assignee Info */}
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-800">
          <strong>Responsável atual:</strong> {currentAssignee}
        </p>
        <p className="text-xs text-orange-700 mt-2">
          Um comentário será adicionado indicando que a tarefa foi desatribuída.
        </p>
      </div>
    </ConfirmActionButton>
  );
}
