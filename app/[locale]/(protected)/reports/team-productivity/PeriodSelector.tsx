"use client";

import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

interface PeriodSelectorProps {
  period: "week" | "month" | "custom";
  from?: string;
  to?: string;
}

export function PeriodSelector({ period, from, to }: PeriodSelectorProps) {
  const t = useTranslations("reportsTeam.period");
  const { setParam, setParams } = useUrlFilters({ replace: true });

  const setPeriod = (value: "week" | "month" | "custom") => {
    if (value === "custom") setParam("period", value);
    else setParams({ period: value, from: null, to: null });
  };

  const setDate = (key: "from" | "to", value: string) => {
    setParams({ [key]: value, period: "custom" });
  };

  const selectClass =
    "h-10 rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:border-primary";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground font-medium">{t("label")}:</span>
        <select
          className={selectClass}
          value={period}
          onChange={(e) => setPeriod(e.target.value as "week" | "month" | "custom")}
          aria-label={t("label")}
        >
          <option value="week">{t("week")}</option>
          <option value="month">{t("month")}</option>
          <option value="custom">{t("custom")}</option>
        </select>
      </label>

      {period === "custom" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">{t("from")}:</span>
            <input
              type="date"
              value={from ?? ""}
              onChange={(e) => setDate("from", e.target.value)}
              className={selectClass}
              aria-label={t("from")}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">{t("to")}:</span>
            <input
              type="date"
              value={to ?? ""}
              onChange={(e) => setDate("to", e.target.value)}
              className={selectClass}
              aria-label={t("to")}
            />
          </label>
        </>
      )}
    </div>
  );
}
