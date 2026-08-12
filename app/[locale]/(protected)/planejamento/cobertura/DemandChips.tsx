"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OccurrenceTask } from "@/lib/actions/weekly-coverage";

/** Teto antes de colapsar. Uma semana cheia pode ter dezenas de demandas; a
 *  tela existe para dar a leitura da semana, não para virar lista de tarefas. */
const VISIBLE = 8;

/**
 * Demandas como tags clicáveis. Usado nos dois contextos do card — as vinculadas
 * a uma data e as soltas da semana — para que abrir uma seja o mesmo gesto nos
 * dois lugares.
 */
export function DemandChips({
  tasks,
  onPick,
  tone = "primary",
}: {
  tasks: OccurrenceTask[];
  onPick: (task: OccurrenceTask) => void;
  /** `primary` para as vinculadas a uma data (sazonais), `muted` para as de
   *  rotina — a diferença de peso visual é o que separa campanha de operação. */
  tone?: "primary" | "muted";
}) {
  const t = useTranslations("planning.coverage");
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const shown = expanded ? tasks : tasks.slice(0, VISIBLE);
  const hidden = tasks.length - shown.length;

  const chip =
    tone === "primary"
      ? "bg-primary/10 text-primary hover:bg-primary/20"
      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onPick(task)}
          title={`${task.clientName} · ${task.title}`}
          className={`inline-flex max-w-[16rem] items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${chip}`}
        >
          <span className="truncate">
            {task.clientName} · {task.title}
          </span>
        </button>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
        >
          {t("week.moreDemands", { count: hidden })}
        </button>
      )}

      {expanded && tasks.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          {t("week.collapse")}
        </button>
      )}
    </div>
  );
}
