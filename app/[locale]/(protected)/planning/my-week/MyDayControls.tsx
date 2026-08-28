"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown } from "lucide-react";
import { reorderMyDay, moveMyStageToDay } from "@/lib/actions/my-week";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Reordenar por setas e mudar de dia por select. Sem arrastar, como na mesa do gestor. */
export function MyDayControls({
  activeStageId,
  days,
  currentDay,
}: {
  activeStageId: string;
  days: string[];
  currentDay: string;
}) {
  const t = useTranslations("planning.myWeek");
  const router = useRouter();

  const mover = useServerAction(reorderMyDay, { onSuccess: () => router.refresh() });
  const mudarDia = useServerAction(moveMyStageToDay, {
    successMessage: t("moved_toast"),
    onSuccess: () => router.refresh(),
  });

  const btn =
    "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className={btn}
        disabled={mover.isPending}
        aria-label={t("moveUp")}
        title={t("moveUp")}
        onClick={() => mover.run(activeStageId, "up")}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={mover.isPending}
        aria-label={t("moveDown")}
        title={t("moveDown")}
        onClick={() => mover.run(activeStageId, "down")}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <select
        value={currentDay}
        disabled={mudarDia.isPending}
        aria-label={t("moveTo")}
        title={t("moveTo")}
        onChange={(e) => mudarDia.run(activeStageId, e.target.value)}
        className="h-7 rounded border border-input-border bg-input px-1 text-xs text-foreground"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {d.slice(8, 10)}/{d.slice(5, 7)}
          </option>
        ))}
      </select>
    </div>
  );
}
