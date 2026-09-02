"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { moveStageOrder, unscheduleStage } from "@/lib/actions/week-planning";
import { useServerAction } from "@/lib/hooks/useServerAction";

/** Reordenar por setas e tirar da semana. Sem arrastar nesta fatia — ver ScheduleDialog. */
export function OrderControls({
  activeStageId,
  canReorder,
}: {
  activeStageId: string;
  /** Falso quando o dia tem UM item só. Ordenar uma coisa sozinha não muda nada, e botão que não
   *  faz nada ensina a ignorar botão — inclusive os que fazem. */
  canReorder: boolean;
}) {
  const t = useTranslations("planning.week");
  const router = useRouter();

  const mover = useServerAction(moveStageOrder, { onSuccess: () => router.refresh() });
  const tirar = useServerAction(unscheduleStage, {
    successMessage: t("unscheduled_toast"),
    onSuccess: () => router.refresh(),
  });

  const btn =
    "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="inline-flex items-center">
      {canReorder && (
        <>
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
        </>
      )}

      <button
        type="button"
        className={btn}
        disabled={tirar.isPending}
        aria-label={t("unschedule")}
        title={t("unschedule")}
        onClick={() => tirar.run(activeStageId)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
