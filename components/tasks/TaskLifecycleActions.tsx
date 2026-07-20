"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Copy, Archive } from "lucide-react";
import toast from "react-hot-toast";
import { duplicateTask, markTaskObsolete } from "@/lib/actions/task";

/** Ações de ciclo de vida da tarefa (MANAGER+): duplicar (metadados) e marcar obsoleta. */
export function TaskLifecycleActions({
  taskId,
  taskStatus,
}: {
  taskId: string;
  taskStatus: string;
}) {
  const t = useTranslations("tasks.actions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDuplicate = () => {
    startTransition(async () => {
      // duplicateTask redireciona para a nova tarefa em caso de sucesso.
      const res = await duplicateTask(taskId);
      if (res?.error) toast.error(res.error);
    });
  };

  const handleObsolete = () => {
    if (!window.confirm(t("confirmObsolete"))) return;
    startTransition(async () => {
      const res = await markTaskObsolete(taskId);
      if (res?.success) {
        toast.success(t("obsoleteSuccess"));
        router.refresh();
      } else {
        toast.error(res?.error ?? t("obsoleteError"));
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border-2 border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-accent disabled:opacity-50"
      >
        <Copy className="h-4 w-4" /> {t("duplicateShort")}
      </button>
      {taskStatus !== "OBSOLETE" && (
        <button
          type="button"
          onClick={handleObsolete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Archive className="h-4 w-4" /> {t("markObsolete")}
        </button>
      )}
    </div>
  );
}
