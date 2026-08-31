"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Copy, Archive } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
import toast from "react-hot-toast";
import { duplicateTask, markTaskObsolete } from "@/lib/actions/task";

/** Ações de ciclo de vida da tarefa (MANAGER+): duplicar (metadados) e marcar obsoleta. */
export function TaskLifecycleActions({
  taskId,
  taskStatus,
  dueDate,
}: {
  taskId: string;
  taskStatus: string;
  /** Prazo do ORIGINAL, em YYYY-MM-DD. Preenche o diálogo — quem duplica confirma ou troca. */
  dueDate: string | null;
}) {
  const t = useTranslations("tasks.actions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Duplicar PERGUNTA antes de criar. A cópia é uma demanda nova e decide o próprio prazo: herdar
  // o do original em silêncio a faria nascer quase sempre vencida (duplica-se para refazer o que
  // não deu certo), e criar sem prazo era a porta dos fundos da regra de criação — pior aqui,
  // porque demanda não se edita neste sistema.
  const [open, setOpen] = useState(false);
  const [dueDateCopia, setDueDateCopia] = useState(dueDate ?? "");
  const [semPrazo, setSemPrazo] = useState(false);

  const handleDuplicate = () => {
    startTransition(async () => {
      // duplicateTask redireciona para a nova tarefa em caso de sucesso.
      const res = await duplicateTask(taskId, {
        dueDate: semPrazo ? "" : dueDateCopia,
        noDueDate: semPrazo,
      });
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
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-accent disabled:opacity-50"
          >
            <Copy className="h-4 w-4" /> {t("duplicateShort")}
          </button>
        }
        title={t("duplicateTitle")}
        description={t("duplicateHelp")}
        formId="duplicate-task-form"
        submitLabel={t("duplicateSubmit")}
        isPending={isPending}
      >
        <form
          id="duplicate-task-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleDuplicate();
          }}
        >
          <div>
            <FieldLabel htmlFor="dup-due" required={!semPrazo}>
              {t("duplicateDueDate")}
            </FieldLabel>
            <input
              type="date"
              id="dup-due"
              required={!semPrazo}
              disabled={semPrazo}
              value={semPrazo ? "" : dueDateCopia}
              onChange={(e) => setDueDateCopia(e.target.value)}
              className="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm text-foreground disabled:opacity-50"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={semPrazo}
              onChange={(e) => setSemPrazo(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input-border text-primary"
            />
            <span>{t("duplicateNoDueDate")}</span>
          </label>
        </form>
      </FormDialog>
      {taskStatus !== "OBSOLETE" && (
        <button
          type="button"
          onClick={handleObsolete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Archive className="h-4 w-4" /> {t("markObsolete")}
        </button>
      )}
    </div>
  );
}
