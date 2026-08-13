"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DemandTaskCard } from "./DemandTaskCard";
import { EventPill } from "./EventPill";
import { type ClientDemands, type DayAnniversaries, type MonthEvent } from "./monthly-types";

interface DayDetailDialogProps {
  dateLabel: string;
  events: MonthEvent[];
  clients: ClientDemands[];
  anniversaries: DayAnniversaries | null;
  onClose: () => void;
  /** Ausentes = modo leitura: o diálogo não oferece caminho de criação.
   *  Esconder o botão é melhor do que exibi-lo inerte — a tela não promete
   *  uma ação que a trava vai recusar. */
  onCreateForEvent?: (event: MonthEvent) => void;
  onCreateForDay?: () => void;
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
          {onCreateForDay && (
            <Button type="button" size="sm" onClick={onCreateForDay} className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              {t("dayDetail.createForDay")}
            </Button>
          )}
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
                    <EventPill event={event} variant="detail" />
                    {onCreateForEvent && (
                      <Button type="button" size="sm" onClick={() => onCreateForEvent(event)}>
                        {t("dayDetail.createForEvent")}
                      </Button>
                    )}
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
                        <DemandTaskCard key={task.id} task={task} />
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
