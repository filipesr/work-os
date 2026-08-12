"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startWorkOnTask, stopWorkOnTask } from "@/lib/actions/activity";
import { Play, Square, Loader2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { FormDialog } from "@/components/ui/FormDialog";

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

const STOP_FORM = "activity-stop-form";
const SWITCH_FORM = "activity-switch-form";

/**
 * Iniciar/parar o cronômetro de uma tarefa. Uma pessoa só pode ter UMA tarefa
 * contando tempo — o banco garante isso (índice parcial único), e aqui a
 * troca é tratada explicitamente em vez de acontecer em silêncio.
 *
 * Dois diálogos, com exigências diferentes de propósito:
 *  - **Parar**: descrição opcional. Encerrar o próprio trabalho não pede
 *    justificativa a ninguém.
 *  - **Trocar de tarefa**: motivo OBRIGATÓRIO. É o momento em que um bloco de
 *    trabalho é cortado no meio, e o motivo é o único registro de por quê.
 */
export function ActivityButton({
  taskId,
  taskTitle,
  currentStageId,
  activeLog,
}: ActivityButtonProps) {
  const t = useTranslations("tasks.activity");
  const [showStop, setShowStop] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");

  const { run: runStart, isPending: isStarting } = useServerAction(startWorkOnTask, {
    onSuccess: (result) => {
      const r = result as { status?: string; needsReason?: boolean } | undefined;
      // Rede de segurança: o servidor recusou por falta de motivo. A UI já
      // deveria ter aberto o diálogo, mas a regra não depende disso.
      if (r?.needsReason) {
        setShowSwitch(true);
        return;
      }
      if (r?.status === "already_active") {
        toast(t("alreadyActiveInfo"));
      } else {
        toast.success(t("startSuccess", { taskTitle }));
        setShowSwitch(false);
        setReason("");
      }
    },
  });

  const { run: runStop, isPending: isStopping } = useServerAction(stopWorkOnTask, {
    successMessage: t("stopSuccess", { taskTitle }),
    onSuccess: () => {
      setShowStop(false);
      setDescription("");
    },
  });

  const isThisTaskActive = activeLog?.taskId === taskId;
  const isWorkingOnOtherTask = Boolean(activeLog && activeLog.taskId !== taskId);

  const handleStartClick = () => {
    if (!currentStageId) {
      toast.error(t("noStageError"));
      return;
    }
    // Há outra em curso → o motivo vem antes da troca, não depois.
    if (isWorkingOnOtherTask) {
      setShowSwitch(true);
      return;
    }
    runStart(taskId, currentStageId);
  };

  const handleConfirmSwitch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentStageId || !reason.trim()) return;
    runStart(taskId, currentStageId, reason.trim());
  };

  const handleConfirmStop = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeLog) return;
    runStop(activeLog.id, taskId, description);
  };

  const textareaClass =
    "w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-foreground transition-all placeholder:text-muted-foreground focus:border-input focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

  if (isThisTaskActive) {
    return (
      <FormDialog
        open={showStop}
        onOpenChange={(open) => {
          setShowStop(open);
          if (!open) setDescription("");
        }}
        trigger={
          <Button disabled={isStopping} variant="destructive" className="w-full">
            {isStopping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("stopping")}
              </>
            ) : (
              <>
                <Square className="mr-2 h-4 w-4" />
                {t("stopWork")}
              </>
            )}
          </Button>
        }
        title={t("modal.title")}
        description={t("modal.subtitle")}
        formId={STOP_FORM}
        submitLabel={t("modal.confirm")}
        isPending={isStopping}
      >
        <form id={STOP_FORM} onSubmit={handleConfirmStop}>
          <label htmlFor="activity-description" className="mb-2 block text-sm font-semibold">
            {t("modal.label")}
          </label>
          <textarea
            id="activity-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={isStopping}
            className={textareaClass}
            placeholder={t("modal.placeholder")}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("modal.hint")}</p>
        </form>
      </FormDialog>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleStartClick}
        disabled={isStarting}
        className="w-full bg-success hover:bg-success/90"
      >
        {isStarting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("starting")}
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            {t("startWork")}
          </>
        )}
      </Button>

      {isWorkingOnOtherTask && activeLog && (
        <p className="text-center text-xs text-muted-foreground">
          {t("switchWarning", { taskTitle: activeLog.task.title })}
        </p>
      )}

      {/* Diálogo de troca — só monta quando há outra tarefa em curso. */}
      {isWorkingOnOtherTask && activeLog && (
        <FormDialog
          open={showSwitch}
          onOpenChange={(open) => {
            setShowSwitch(open);
            if (!open) setReason("");
          }}
          trigger={<span className="hidden" aria-hidden="true" />}
          title={t("switch.title")}
          description={t("switch.subtitle", { from: activeLog.task.title, to: taskTitle })}
          formId={SWITCH_FORM}
          submitLabel={t("switch.confirm")}
          isPending={isStarting}
        >
          <form id={SWITCH_FORM} onSubmit={handleConfirmSwitch}>
            {/* O tempo da tarefa anterior É registrado — antes ele era
                descartado em silêncio nesta troca. Dizer isso na tela evita
                que alguém evite trocar por medo de perder as horas. */}
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-xs text-foreground">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                aria-hidden="true"
              />
              {t("switch.timeNotice", { from: activeLog.task.title })}
            </p>
            <label htmlFor="switch-reason" className="mb-2 block text-sm font-semibold">
              {t("switch.label")}
            </label>
            <textarea
              id="switch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              disabled={isStarting}
              className={textareaClass}
              placeholder={t("switch.placeholder")}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("switch.hint")}</p>
          </form>
        </FormDialog>
      )}
    </div>
  );
}
