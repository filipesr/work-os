"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BatchCreateDialog } from "./BatchCreateDialog";
import { DayDemandsDialog } from "./DayDemandsDialog";
import { DayDetailDialog } from "./DayDetailDialog";
import { EventPill } from "./EventPill";
import {
  isoToDisplay,
  type ClientDemands,
  type ClientOption,
  type DayAnniversaries,
  type MonthDay,
  type MonthEvent,
  type ProjectOption,
  type TemplateOption,
} from "./monthly-types";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const MAX_CLIENTS = 4;

interface MonthlyCalendarProps {
  days: MonthDay[];
  eventsByDay: Record<string, MonthEvent[]>;
  demandsByDay: Record<string, ClientDemands[]>;
  anniversariesByDay: Record<string, DayAnniversaries>;
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
}

export function MonthlyCalendar({
  days,
  eventsByDay,
  demandsByDay,
  anniversariesByDay,
  clients,
  projects,
  templates,
}: MonthlyCalendarProps) {
  const t = useTranslations("reportsCalendar.monthly");
  const [batch, setBatch] = useState<{ date: string; eventTitle?: string } | null>(null);
  const [detailIso, setDetailIso] = useState<string | null>(null);
  const [dayClient, setDayClient] = useState<{
    clientName: string;
    iso: string;
    tasks: ClientDemands["tasks"];
  } | null>(null);

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-rose-300 bg-rose-100" />
          {t("legend.holiday")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-violet-300 bg-violet-100" />
          {t("legend.commercial")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-blue-300 bg-blue-100" />
          {t("legend.demands")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" />
          {t("legend.anniversaries")}
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 overflow-hidden rounded-t-xl border-2 border-b-0 border-border bg-muted">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {t(`weekdays.${wd}`)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border border-border">
        {days.map((day, index) => {
          const events = eventsByDay[day.iso] ?? [];
          const clients = demandsByDay[day.iso] ?? [];
          const shownClients = clients.slice(0, MAX_CLIENTS);
          const extraClients = clients.length - shownClients.length;
          const anniv = anniversariesByDay[day.iso];
          // Combined birthday + company anniversary names (deduped), first name only.
          const annivNames = anniv
            ? [
                ...new Set([
                  ...anniv.birthdays.map((b) => b.name),
                  ...anniv.workAnniversaries.map((w) => w.name),
                ]),
              ]
            : [];
          const annivFirstNames = annivNames.map((n) => n.split(/\s+/)[0]);

          return (
            <div
              key={day.iso}
              className={`flex min-h-[112px] flex-col border-border p-1.5 ${
                index % 7 !== 6 ? "border-r" : ""
              } ${index < 35 ? "border-b" : ""} ${day.inMonth ? "bg-card" : "bg-muted/30"}`}
            >
              {/* Day number */}
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailIso(day.iso)}
                  title={t("viewDay")}
                  className={`flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full px-1.5 text-xs font-semibold transition-shadow hover:ring-2 hover:ring-primary/40 ${
                    day.isToday
                      ? "bg-primary text-primary-foreground"
                      : day.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {day.day}
                </button>
              </div>

              {/* Events */}
              <div className="space-y-1">
                {events.map((event) => (
                  <EventPill
                    key={event.id}
                    event={event}
                    variant="calendar"
                    onSelect={() => setBatch({ date: event.iso, eventTitle: event.title })}
                  />
                ))}
              </div>

              {/* Client demands */}
              {shownClients.length > 0 && (
                <div className="mt-1 space-y-1">
                  {shownClients.map((client) => (
                    <button
                      key={client.clientId}
                      type="button"
                      onClick={() =>
                        setDayClient({
                          clientName: client.clientName,
                          iso: day.iso,
                          tasks: client.tasks,
                        })
                      }
                      title={client.clientName}
                      className="flex w-full items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 hover:border-blue-400 transition-colors dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-200"
                    >
                      <span className="truncate">{client.clientName}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-blue-200/70 px-1.5 text-[10px] font-bold dark:bg-blue-800/60">
                        {client.tasks.length}
                      </span>
                    </button>
                  ))}
                  {extraClients > 0 && (
                    <button
                      type="button"
                      onClick={() => setDetailIso(day.iso)}
                      className="block w-full px-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {t("moreClients", { count: extraClients })}
                    </button>
                  )}
                </div>
              )}

              {/* Anniversaries — discrete footer line (amber, first names, truncated) */}
              {annivFirstNames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailIso(day.iso)}
                  title={annivNames.join(", ")}
                  className="-mx-1.5 -mb-1.5 mt-auto block truncate border-t border-border bg-amber-50/60 px-1.5 py-1 text-left text-[10px] text-amber-700 transition-colors hover:bg-amber-100/80 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                >
                  {annivFirstNames.join(", ")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {detailIso && (
        <DayDetailDialog
          key={detailIso}
          dateLabel={isoToDisplay(detailIso)}
          events={eventsByDay[detailIso] ?? []}
          clients={demandsByDay[detailIso] ?? []}
          anniversaries={anniversariesByDay[detailIso] ?? null}
          onClose={() => setDetailIso(null)}
          onCreateForEvent={(event) => {
            setDetailIso(null);
            setBatch({ date: event.iso, eventTitle: event.title });
          }}
          onCreateForDay={() => {
            const iso = detailIso;
            setDetailIso(null);
            setBatch({ date: iso });
          }}
        />
      )}

      {batch && (
        <BatchCreateDialog
          key={`${batch.date}-${batch.eventTitle ?? "day"}`}
          date={batch.date}
          eventTitle={batch.eventTitle}
          clients={clients}
          projects={projects}
          templates={templates}
          onClose={() => setBatch(null)}
        />
      )}

      {dayClient && (
        <DayDemandsDialog
          key={`${dayClient.clientName}-${dayClient.iso}`}
          clientName={dayClient.clientName}
          dateLabel={isoToDisplay(dayClient.iso)}
          tasks={dayClient.tasks}
          onClose={() => setDayClient(null)}
        />
      )}
    </div>
  );
}
