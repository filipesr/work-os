"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  COUNTRY_FLAG,
  type ClientDemands,
  type DayAnniversaries,
  type DemandTask,
  type MonthEvent,
} from "./monthly-types";

const STATUS_CLASS: Record<DemandTask["status"], string> = {
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  IN_PROGRESS: "bg-primary/10 text-primary border-primary/20",
  PAUSED: "bg-destructive/10 text-destructive border-destructive/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
  BACKLOG: "bg-muted text-muted-foreground border-border",
};

interface DayDetailDialogProps {
  dateLabel: string;
  events: MonthEvent[];
  clients: ClientDemands[];
  anniversaries: DayAnniversaries | null;
  onClose: () => void;
  onCreateForEvent: (event: MonthEvent) => void;
  onCreateForDay: () => void;
}

export function DayDetailDialog({
  dateLabel,
  events,
  clients,
  anniversaries,
  onClose,
  onCreateForEvent,
  onCreateForDay,
}: DayDetailDialogProps) {
  const t = useTranslations("reportsCalendar.monthly");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t("dayDetail.title")}</DialogTitle>
          <DialogDescription>{t("dayDetail.subtitle", { date: dateLabel })}</DialogDescription>
        </DialogHeader>

        <div className="pt-1">
          <Button type="button" size="sm" onClick={onCreateForDay} className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("dayDetail.createForDay")}
          </Button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto py-2">
          {/* Anniversaries */}
          {anniversaries &&
            (anniversaries.birthdays.length > 0 || anniversaries.workAnniversaries.length > 0) && (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("dayDetail.anniversariesHeading")}
                </h3>
                <ul className="space-y-1.5">
                  {anniversaries.birthdays.map((b, i) => (
                    <li key={`b-${i}`} className="flex items-center gap-2 text-sm text-foreground">
                      <span>🎂</span>
                      <span>{b.name}</span>
                    </li>
                  ))}
                  {anniversaries.workAnniversaries.map((w, i) => (
                    <li key={`w-${i}`} className="flex items-center gap-2 text-sm text-foreground">
                      <span>🎉</span>
                      <span>{w.name}</span>
                      {w.years > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("dayDetail.workAnnivYears", { years: w.years })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {/* Events */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("dayDetail.eventsHeading")}
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dayDetail.noEvents")}</p>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        <span className="mr-1.5">
                          {event.countries.map((c) => COUNTRY_FLAG[c]).join("")}
                        </span>
                        {event.title}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          event.type === "holiday"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-violet-200 bg-violet-50 text-violet-700"
                        }`}
                      >
                        {event.type === "holiday" ? t("legend.holiday") : t("legend.commercial")}
                      </span>
                    </div>
                    <Button type="button" size="sm" onClick={() => onCreateForEvent(event)}>
                      {t("dayDetail.createForEvent")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Demands */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("dayDetail.demandsHeading")}
            </h3>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dayDetail.noDemands")}</p>
            ) : (
              <div className="space-y-4">
                {clients.map((client) => (
                  <div key={client.clientId}>
                    <p className="mb-1.5 text-sm font-bold text-foreground">
                      {client.clientName}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t("dayDetail.clientCount", { count: client.tasks.length })}
                      </span>
                    </p>
                    <ul className="space-y-2">
                      {client.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{task.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {task.projectName}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {task.stageName ?? t("dayDemands.noStage")}
                                {" · "}
                                {task.assigneeName ?? t("dayDemands.unassigned")}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[task.status]}`}
                            >
                              {task.status}
                            </span>
                          </div>
                          <Link
                            href={`/admin/tasks/${task.id}`}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:gap-1.5 transition-all"
                          >
                            {t("dayDemands.openTask")}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
