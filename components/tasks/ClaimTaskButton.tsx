"use client";

import { useState, useTransition } from "react";
import { claimTask } from "@/lib/actions/task";
import { useRouter } from "next/navigation";

interface ClaimTaskButtonProps {
  taskId: string;
}

export function ClaimTaskButton({ taskId }: ClaimTaskButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClaim = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimTask(taskId);
      
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh(); // Refresh to show updated dashboard
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClaim}
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Pegando..." : "Pegar Tarefa"}
      </button>
      
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">
          {error}
        </div>
      )}
    </div>
  );
}