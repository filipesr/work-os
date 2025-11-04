"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startWorkOnTask, stopWorkOnTask } from "@/lib/actions/activity";
import { Play, Square, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface ActiveLog {
  id: string;
  taskId: string;
  task: {
    id: string;
    title: string;
  };
}

interface ActivityButtonProps {
  taskId: string;
  taskTitle: string;
  currentStageId: string | null;
  activeLog: ActiveLog | null;
}

export function ActivityButton({
  taskId,
  taskTitle,
  currentStageId,
  activeLog,
}: ActivityButtonProps) {
  const [isPending, startTransition] = useTransition();

  // Check if this specific task is active
  const isThisTaskActive = activeLog?.taskId === taskId;

  // Check if user is working on a different task
  const isWorkingOnOtherTask = activeLog && activeLog.taskId !== taskId;

  const handleStart = () => {
    if (!currentStageId) {
      toast.error("Esta tarefa não tem uma etapa atual definida");
      return;
    }

    startTransition(async () => {
      const result = await startWorkOnTask(taskId, currentStageId);

      if (result.error) {
        toast.error(result.error);
      } else if (result.status === "already_active") {
        toast.info("Você já está trabalhando nesta tarefa");
      } else {
        toast.success(`Você começou a trabalhar em "${taskTitle}"`);
      }
    });
  };

  const handleStop = () => {
    if (!activeLog) return;

    startTransition(async () => {
      const result = await stopWorkOnTask(activeLog.id, taskId);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Você parou de trabalhar em "${taskTitle}"`);
      }
    });
  };

  if (isThisTaskActive) {
    // This task is currently active - show STOP button
    return (
      <Button
        onClick={handleStop}
        disabled={isPending}
        variant="destructive"
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Parando...
          </>
        ) : (
          <>
            <Square className="h-4 w-4 mr-2" />
            Parar Tarefa
          </>
        )}
      </Button>
    );
  } else {
    // No task is active, or a different task is active - show START button
    return (
      <div className="space-y-2">
        <Button
          onClick={handleStart}
          disabled={isPending}
          variant="default"
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Iniciando...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Iniciar Tarefa
            </>
          )}
        </Button>
        {isWorkingOnOtherTask && (
          <p className="text-xs text-muted-foreground text-center">
            ⚠️ Você está trabalhando em "{activeLog.task.title}". Iniciar esta
            tarefa irá parar a outra automaticamente.
          </p>
        )}
      </div>
    );
  }
}
