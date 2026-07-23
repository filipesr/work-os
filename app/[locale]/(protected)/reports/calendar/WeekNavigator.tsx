"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatISODate, shiftWeek } from "@/lib/dates";

interface WeekNavigatorProps {
  weekStart: Date;
  weekEnd: Date;
}

export function WeekNavigator({ weekStart, weekEnd }: WeekNavigatorProps) {
  const t = useTranslations("reportsCalendar.navigation");
  const searchParams = useSearchParams();

  const buildHref = (delta: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (delta === 0) params.delete("week");
    else params.set("week", formatISODate(shiftWeek(weekStart, delta)));
    return `?${params.toString()}`;
  };

  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const label = t("range", { start: fmt.format(weekStart), end: fmt.format(weekEnd) });

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors";

  return (
    <div className="flex items-center gap-1.5">
      <Link href={buildHref(-1)} aria-label={t("previousWeek")} className={iconBtn} rel="prev">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <Link
        href={buildHref(0)}
        aria-label={t("currentWeek")}
        title={t("currentWeek")}
        className={iconBtn}
      >
        <CalendarIcon className="h-4 w-4" />
      </Link>
      <Link href={buildHref(1)} aria-label={t("nextWeek")} className={iconBtn} rel="next">
        <ChevronRight className="h-4 w-4" />
      </Link>
      <span
        className="ml-2 px-2 text-sm font-semibold text-foreground whitespace-nowrap tabular-nums"
        aria-live="polite"
      >
        {label}
      </span>
    </div>
  );
}
