"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BatchCreateDialog } from "./BatchCreateDialog";
import { DayDemandsDialog } from "./DayDemandsDialog";
import { DayDetailDialog } from "./DayDetailDialog";
import {
  COUNTRY_FLAG,
  isoToDisplay,
  type ClientDemands,
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
  projects: ProjectOption[];
  templates: TemplateOption[];
}

export function MonthlyCalendar({
  days,
  eventsByDay,
  demandsByDay,
  projects,
  templates,
}: MonthlyCalendarProps) {
  const t = useTranslations("reportsCalendar.monthly");
  const [batchEvent, setBatchEvent] = useState<MonthEvent | null>(null);
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
      <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-2 border-border">
        {days.map((day, index) => {
          const events = eventsByDay[day.iso] ?? [];
          const clients = demandsByDay[day.iso] ?? [];
          const shownClients = clients.slice(0, MAX_CLIENTS);
          const extraClients = clients.length - shownClients.length;
          const hasContent = events.length > 0 || clients.length > 0;

          return (
            <div
              key={day.iso}
              className={`min-h-[112px] border-border p-1.5 ${
                index % 7 !== 6 ? "border-r" : ""
              } ${index < 35 ? "border-b" : ""} ${day.inMonth ? "bg-card" : "bg-muted/30"}`}
            >
              {/* Day number */}
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  disabled={!hasContent}
                  onClick={() => setDetailIso(day.iso)}
                  title={hasContent ? t("viewDay") : undefined}
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition-shadow ${
                    hasContent
                      ? "cursor-pointer hover:ring-2 hover:ring-primary/40"
                      : "cursor-default"
                  } ${
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
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setBatchEvent(event)}
                    title={event.title}
                    className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors ${
                      event.type === "holiday"
                        ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
                        : "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200"
                    }`}
                  >
                    <span className="mr-1">
                      {event.countries.map((c) => COUNTRY_FLAG[c]).join("")}
                    </span>
                    {event.title}
                  </button>
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
          onClose={() => setDetailIso(null)}
          onCreateForEvent={(event) => {
            setDetailIso(null);
            setBatchEvent(event);
          }}
        />
      )}

      {batchEvent && (
        <BatchCreateDialog
          key={batchEvent.id}
          event={batchEvent}
          projects={projects}
          templates={templates}
          onClose={() => setBatchEvent(null)}
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
