"use client";

import { claimTask } from "@/lib/actions/task";
import { useRouter } from "next/navigation";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface ClaimTaskButtonProps {
  taskId: string;
}

export function ClaimTaskButton({ taskId }: ClaimTaskButtonProps) {
  const router = useRouter();
  const { run, isPending } = useServerAction(claimTask, {
    onSuccess: () => router.refresh(), // Refresh to show updated dashboard
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => run(taskId)}
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Pegando..." : "Pegar Tarefa"}
      </button>
    </div>
  );
}
