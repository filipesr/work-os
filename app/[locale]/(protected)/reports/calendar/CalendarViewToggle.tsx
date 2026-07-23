"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, CalendarRange } from "lucide-react";

type View = "week" | "month";

/**
 * Week/month switch for the unified Calendar (§3.3 fusion). Switching modes drops
 * the params that belong to the other mode so the URL stays clean.
 */
export function CalendarViewToggle({ view }: { view: View }) {
  const t = useTranslations("reportsCalendar.view");

  const base =
    "inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const active = "bg-primary text-primary-foreground";
  const inactive = "bg-card text-muted-foreground hover:bg-accent";

  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-border"
      role="tablist"
      aria-label={t("label")}
    >
      <Link
        href="/reports/calendar"
        role="tab"
        aria-selected={view === "week"}
        className={`${base} ${view === "week" ? active : inactive}`}
      >
        <CalendarDays className="h-4 w-4" />
        {t("week")}
      </Link>
      <Link
        href="/reports/calendar?view=month"
        role="tab"
        aria-selected={view === "month"}
        className={`${base} border-l border-border ${view === "month" ? active : inactive}`}
      >
        <CalendarRange className="h-4 w-4" />
        {t("month")}
      </Link>
    </div>
  );
}
