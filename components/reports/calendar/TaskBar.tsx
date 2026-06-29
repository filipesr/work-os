import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { daysUntil, todayInSaoPaulo, weekRangeFromMonday } from "@/lib/dates";
import type { CalendarTask } from "@/lib/actions/reporting";

interface TaskBarProps {
  task: CalendarTask;
  weekStart: Date;
  isNoDueDateLane?: boolean;
  /** When true the bar does not set its own grid column (a draggable wrapper positions it). */
  disablePositioning?: boolean;
}

export function spanForDueDate(dueDate: Date, weekStart: Date): { start: number; end: number } {
  const range = weekRangeFromMonday(weekStart);
  const today = todayInSaoPaulo();
  const dueDay = todayInSaoPaulo(dueDate);

  const weekStartTime = range.start.getTime();
  const weekEndTime = range.end.getTime();
  const todayTime = today.getTime();
  const dueTime = dueDay.getTime();

  const anchorTime = Math.max(weekStartTime, Math.min(todayTime, weekEndTime));

  let startCol = 1;
  for (let i = 0; i < range.days.length; i++) {
    if (range.days[i].getTime() <= anchorTime) startCol = i + 1;
  }

  let endCol = startCol;
  if (dueTime < weekStartTime) {
    endCol = 1;
    startCol = 1;
  } else if (dueTime > weekEndTime) {
    endCol = range.days.length;
  } else {
    for (let i = 0; i < range.days.length; i++) {
      if (range.days[i].getTime() <= dueTime) endCol = i + 1;
    }
  }

  if (startCol > endCol) startCol = endCol;

  return { start: startCol, end: endCol + 1 };
}

export async function TaskBar({
  task,
  weekStart,
  isNoDueDateLane = false,
  disablePositioning = false,
}: TaskBarProps) {
  const t = await getTranslations("reportsCalendar.bar");

  const isCompleted = task.status === "COMPLETED";
  let dueText = "";
  let toneClasses =
    "bg-emerald-50 border-emerald-300 text-emerald-950 hover:border-emerald-500 dark:bg-emerald-950/40 dark:border-emerald-700/60 dark:text-emerald-50 dark:hover:border-emerald-500";

  if (task.dueDate) {
    const delta = daysUntil(task.dueDate);
    if (isCompleted) {
      dueText = t("completed");
      toneClasses =
        "bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-400 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400";
    } else if (delta < 0) {
      dueText = t("overdue", { days: Math.abs(delta) });
      toneClasses =
        "bg-red-50 border-red-300 text-red-950 hover:border-red-500 dark:bg-red-950/40 dark:border-red-700/60 dark:text-red-50 dark:hover:border-red-500";
    } else if (delta === 0) {
      dueText = t("dueToday");
      toneClasses =
        "bg-amber-50 border-amber-300 text-amber-950 hover:border-amber-500 dark:bg-amber-950/40 dark:border-amber-700/60 dark:text-amber-50 dark:hover:border-amber-500";
    } else if (delta <= 2) {
      dueText = t("dueIn", { days: delta });
      toneClasses =
        "bg-amber-50 border-amber-300 text-amber-950 hover:border-amber-500 dark:bg-amber-950/40 dark:border-amber-700/60 dark:text-amber-50 dark:hover:border-amber-500";
    } else {
      dueText = t("dueIn", { days: delta });
    }
  }

  const span =
    task.dueDate && !isNoDueDateLane
      ? spanForDueDate(task.dueDate, weekStart)
      : { start: 1, end: 8 };

  const ariaLabel = t("ariaLabel", {
    title: task.title,
    team: task.teamName ?? "—",
    stage: task.primaryStageName ?? "—",
    dueText: dueText || (task.dueDate ? "" : "sem prazo"),
  });

  return (
    <Link
      href={`/tasks/${task.id}`}
      aria-label={ariaLabel}
      className={`group block border rounded-md px-2.5 py-1.5 mx-0.5 text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors overflow-hidden ${toneClasses}`}
      style={
        isNoDueDateLane || disablePositioning
          ? undefined
          : ({ gridColumnStart: span.start, gridColumnEnd: span.end } as React.CSSProperties)
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="font-semibold truncate flex-1 min-w-0">{task.title}</span>
        {task.extraStageCount > 0 && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-foreground/15 text-[10px] font-bold whitespace-nowrap">
            {t("extraStages", { count: task.extraStageCount })}
          </span>
        )}
      </div>
      {(task.primaryStageName || task.assigneeName) && (
        <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] opacity-80 truncate">
          {task.primaryStageName && <span className="truncate">{task.primaryStageName}</span>}
          {task.primaryStageName && task.assigneeName && <span className="opacity-50">·</span>}
          {task.assigneeName && <span className="truncate font-medium">{task.assigneeName}</span>}
        </div>
      )}
      {dueText && (
        <div className="mt-0.5 text-[10.5px] font-medium opacity-90 truncate">{dueText}</div>
      )}
    </Link>
  );
}
