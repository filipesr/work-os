"use client";

import { useTranslations } from "next-intl";
import { COUNTRY_FLAG, type MonthEvent } from "./monthly-types";

interface EventPillProps {
  event: MonthEvent;
  /** "calendar" = clickable pill in the month grid; "detail" = flags + title + type badge inside the day dialog. */
  variant: "calendar" | "detail";
  /** Click handler for the "calendar" variant button. */
  onSelect?: () => void;
}

export function EventPill({ event, variant, onSelect }: EventPillProps) {
  const t = useTranslations("reportsCalendar.monthly");
  const flags = event.countries.map((c) => COUNTRY_FLAG[c]).join("");

  if (variant === "calendar") {
    return (
      <button
        type="button"
        onClick={onSelect}
        title={event.title}
        className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors ${
          event.type === "holiday"
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200"
            : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200"
        }`}
      >
        <span className="mr-1">{flags}</span>
        {event.title}
      </button>
    );
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-foreground">
        <span className="mr-1.5">{flags}</span>
        {event.title}
      </p>
      <span
        className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${
          event.type === "holiday"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-indigo-200 bg-indigo-50 text-indigo-700"
        }`}
      >
        {event.type === "holiday" ? t("legend.holiday") : t("legend.commercial")}
      </span>
    </div>
  );
}
