"use client";

import { useTranslations } from "next-intl";
import type { MyAllStagesResult } from "@/lib/actions/task";

interface MyStagesKPIsProps {
  stats: MyAllStagesResult["stats"];
}

export function MyStagesKPIs({ stats }: MyStagesKPIsProps) {
  const t = useTranslations("myStages");

  const cards = [
    {
      label: t("kpis.total"),
      value: stats.total,
      color: "bg-card border-border",
      textColor: "text-foreground",
    },
    {
      label: t("kpis.active"),
      value: stats.byStatus.ACTIVE,
      color: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
      textColor: "text-blue-700 dark:text-blue-300",
    },
    {
      label: t("kpis.blocked"),
      value: stats.byStatus.BLOCKED,
      color: "bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-700",
      textColor: "text-gray-700 dark:text-gray-300",
    },
    {
      label: t("kpis.completed"),
      value: stats.byStatus.COMPLETED,
      color: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
      textColor: "text-green-700 dark:text-green-300",
    },
    {
      label: t("kpis.overdue"),
      value: stats.overdue,
      color: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
      textColor: "text-red-700 dark:text-red-300",
    },
    {
      label: t("kpis.totalHours"),
      value: stats.totalHoursLogged.toFixed(1),
      color: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
      textColor: "text-purple-700 dark:text-purple-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border p-3 ${card.color}`}
        >
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
