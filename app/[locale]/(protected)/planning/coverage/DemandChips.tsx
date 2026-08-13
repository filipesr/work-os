"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OccurrenceTask } from "@/lib/actions/weekly-coverage";
import { DEMAND_STATE_TONE, needsAttention } from "@/lib/calendar/demand-state";

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

  // O contexto (sazonal vs rotina) define o REPOUSO; o estado do plano define a
  // cor quando há o que dizer. Uma demanda entregue lê como boa notícia nos dois
  // contextos, e uma atrasada grita nos dois — era o inverso antes, quando a cor
  // só distinguia campanha de operação e o desfecho não aparecia.
  const repouso =
    tone === "primary"
      ? "bg-primary/10 text-primary hover:bg-primary/20"
      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground";

  const PELO_ESTADO: Record<string, string> = {
    success: "bg-success-subtle text-success hover:brightness-95",
    warning: "bg-warning-subtle text-warning hover:brightness-95",
    danger: "bg-danger-subtle text-danger hover:brightness-95",
    info: "bg-primary/10 text-primary hover:bg-primary/20",
    neutral: repouso,
  };

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
          title={`${task.clientName} · ${task.title} — ${t(`state.${task.state}`)}`}
          className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-left text-xs font-medium transition-colors ${
            PELO_ESTADO[DEMAND_STATE_TONE[task.state]] ?? repouso
          }`}
        >
          {/* Ponto para quem pede ação. Cor sozinha não basta: ~8% dos homens
              não distingue vermelho de verde, e é justamente esse par que separa
              "entregue" de "atrasada". */}
          {needsAttention(task.state) && (
            <span aria-hidden="true" className="shrink-0 text-[10px] leading-none">
              ●
            </span>
          )}
          <span className="truncate">
            {task.clientName} · {task.title}
          </span>
          <span className="sr-only"> — {t(`state.${task.state}`)}</span>
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
