"use client";

import { claimActiveStage } from "@/lib/actions/task";
import { useRouter } from "next/navigation";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface ClaimActiveStageButtonProps {
  taskId: string;
  stageId: string;
  isBlocked?: boolean;
}

export function ClaimActiveStageButton({
  taskId,
  stageId,
  isBlocked = false,
}: ClaimActiveStageButtonProps) {
  const router = useRouter();
  const { run, isPending } = useServerAction(claimActiveStage, {
    onSuccess: () => router.refresh(), // Refresh to show updated dashboard
  });

  // Don't allow claiming blocked stages
  if (isBlocked) {
    return <div className="text-xs text-gray-500 italic">Bloqueado</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => run(taskId, stageId)}
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Pegando..." : "Pegar Etapa"}
      </button>
    </div>
  );
}
