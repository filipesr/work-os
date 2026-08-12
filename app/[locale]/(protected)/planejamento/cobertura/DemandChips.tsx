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
    <div className="space-y-1">
      {/* Uma por linha, ocupando a largura toda: lado a lado, o título era
          cortado com folga sobrando na direita. Assim as reticências só
          aparecem quando o texto realmente não cabe. */}
      {shown.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onPick(task)}
          title={`${task.clientName} · ${task.title}`}
          className={`block w-full truncate rounded-lg px-2.5 py-1 text-left text-xs font-medium transition-colors ${chip}`}
        >
          {task.clientName} · {task.title}
        </button>
      ))}

      {(hidden > 0 || (expanded && tasks.length > VISIBLE)) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
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
      )}
    </div>
  );
}
