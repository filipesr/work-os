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
import { DEMAND_STATE_TONE } from "@/lib/calendar/demand-state";
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
  // Os rótulos de status vivem em admin.tasks.list (mesma fonte da lista de
  // demandas) — não há um namespace "tasks.taskStatus".
  const tTasks = useTranslations("admin.tasks.list");
  // Os rótulos de estado são compartilhados com as tags (DemandChips) e vivem um
  // nível acima. Duplicá-los aqui faria uma das cópias envelhecer sozinha.
  const tCoverage = useTranslations("planning.coverage");

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
          {/* Duas leituras, lado a lado e nomeadas: onde a demanda está no FLUXO
              e onde ela está no PLANO. Uma IN_PROGRESS pode estar tranquila ou
              atrasada, e mostrar só a primeira escondia a segunda. */}
          <Row label={tCoverage("planState")}>
            <StatusBadge
              tone={DEMAND_STATE_TONE[task.state]}
              label={tCoverage(`state.${task.state}`)}
            />
          </Row>
          <Row label={t("status")}>
            <StatusBadge
              tone={taskStatusTone(task.status)}
              label={tTasks(`taskStatus.${task.status}`)}
            />
          </Row>
          <Row label={t("dueDate")}>
            <span className="text-sm tabular-nums text-foreground">{due ?? t("noDueDate")}</span>
          </Row>
          <Row label={t("assignee")}>
            {/* Duas etapas em curso, dois nomes: a demanda é das duas, e escolher uma esconderia
                metade do trabalho. Vazio agora quer dizer "sem responsável" de verdade. */}
            <span className="text-sm text-foreground">
              {task.assigneeNames.length > 0 ? task.assigneeNames.join(" · ") : t("unassigned")}
            </span>
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
