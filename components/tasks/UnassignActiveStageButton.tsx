"use client";

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
  const controlled = onOpenChange !== undefined;

  if (!currentAssignee) {
    return null; // Don't show button if stage is not assigned
  }

  return (
    <ConfirmActionButton
      action={() => unassignActiveStage(taskId, stageId)}
      title="Liberar Etapa"
      description="Tem certeza que deseja desatribuir esta etapa? A etapa voltará para o backlog e ficará disponível para outros membros do time reivindicarem."
      confirmLabel="Liberar Etapa"
      pendingLabel="Desatribuindo..."
      successMessage="Etapa desatribuída com sucesso"
      confirmClassName="bg-orange-600 hover:bg-orange-700 text-white"
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        controlled ? undefined : (
          <button className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <UserMinus className="h-4 w-4" />
            Liberar Etapa
          </button>
        )
      }
    >
      {/* Current Assignee Info */}
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-800">
          <strong>Responsável atual:</strong> {currentAssignee}
        </p>
        <p className="text-xs text-orange-700 mt-2">
          Um comentário será adicionado indicando que a etapa foi desatribuída.
        </p>
      </div>
    </ConfirmActionButton>
  );
}
