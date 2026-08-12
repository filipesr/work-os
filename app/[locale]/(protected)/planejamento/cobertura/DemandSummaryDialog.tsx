"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { taskStatusTone } from "@/lib/status-tone";
import type { OccurrenceTask } from "@/lib/actions/weekly-coverage";

/**
 * Resumo de uma demanda vinculada a uma data.
 *
 * Existe para não obrigar a sair da tela: daqui o gestor entende do que a
 * demanda trata (cliente, projeto, responsável, estado) e decide se vale abrir.
 * Abrir a tarefa perde a varredura das 12 semanas, que é o motivo de a tela
 * existir.
 */
export function DemandSummaryDialog({
  task,
  locale,
  onClose,
}: {
  task: OccurrenceTask | null;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations("planning.coverage.demand");
  const tStatus = useTranslations("tasks.taskStatus");

  if (!task) return null;

  const due = task.dueDateIso
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${task.dueDateIso}T00:00:00Z`))
    : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {task.clientName} · {task.projectName}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border">
          <Row label={t("status")}>
            <StatusBadge tone={taskStatusTone(task.status)} label={tStatus(task.status)} />
          </Row>
          <Row label={t("dueDate")}>
            <span className="text-sm tabular-nums text-foreground">{due ?? t("noDueDate")}</span>
          </Row>
          <Row label={t("assignee")}>
            <span className="text-sm text-foreground">{task.assigneeName ?? t("unassigned")}</span>
          </Row>
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          <Link
            href={`/admin/tasks/${task.id}`}
            target="_blank"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("open")}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
