"use client";

import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { WEEK_WINDOW_OPTIONS, DEFAULT_WEEK_WINDOW } from "@/lib/calendar/weekly-window";

/** Alterna a profundidade da janela (8 ou 12 semanas). Vive na URL para o
 *  recorte ser compartilhável e sobreviver ao refresh. */
export function WeekWindowToggle({ current }: { current: number }) {
  const t = useTranslations("planning.coverage");
  const { setParam } = useUrlFilters({ replace: true });

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group">
      {WEEK_WINDOW_OPTIONS.map((n, i) => (
        <button
          key={n}
          type="button"
          onClick={() => setParam("weeks", n === DEFAULT_WEEK_WINDOW ? null : String(n))}
          aria-pressed={current === n}
          className={`h-9 px-3 text-sm font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${
            current === n
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          {t("window.weeks", { count: n })}
        </button>
      ))}
    </div>
  );
}
