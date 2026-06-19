import { getTranslations } from "next-intl/server";
import type { CalendarBuckets, CalendarTask } from "@/lib/actions/reporting";
import { weekRangeFromMonday, todayInSaoPaulo } from "@/lib/dates";
import { TaskBar } from "./TaskBar";

interface CalendarGridProps {
  buckets: CalendarBuckets;
  weekStart: Date;
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const GRID_COLS = "180px repeat(7, minmax(140px, 1fr))";

function DayBackdrop({ days, todayIdx }: { days: Date[]; todayIdx: number }) {
  return (
    <div
      className="absolute inset-0 grid pointer-events-none"
      style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      aria-hidden="true"
    >
      {days.map((_, i) => (
        <div
          key={i}
          className={[
            i > 0 ? "border-l border-border/40" : "",
            i === todayIdx ? "bg-primary/5" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );
}

function LaneShell({
  label,
  count,
  children,
  zebra,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  zebra?: boolean;
}) {
  return (
    <div
      className={`grid border-t border-border ${zebra ? "bg-muted/10" : ""}`}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <div className="px-4 py-3 text-sm font-semibold text-foreground flex items-center justify-between gap-2 border-r border-border">
        <span className="truncate">{label}</span>
        {typeof count === "number" && count > 0 && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[10px] font-bold rounded-full bg-primary/15 text-primary tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="col-span-7 relative min-h-[64px]" style={{ gridColumn: "span 7" }}>
        {children}
      </div>
    </div>
  );
}

export async function CalendarGrid({ buckets, weekStart }: CalendarGridProps) {
  const t = await getTranslations("reportsCalendar");
  const range = weekRangeFromMonday(weekStart);

  const today = todayInSaoPaulo();
  const todayIdx = range.days.findIndex((d) => d.getTime() === todayInSaoPaulo(today).getTime());

  const hasNoDueDate = buckets.noDueDate.length > 0;
  const hasTeams = buckets.byTeam.length > 0;

  if (!hasNoDueDate && !hasTeams) {
    return (
      <div className="py-16 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <p className="text-lg font-semibold mb-2">{t("empty.title")}</p>
        <p className="text-sm">{t("empty.subtitle")}</p>
      </div>
    );
  }

  const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="bg-card border-2 border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid bg-muted/60" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase border-r border-border">
          &nbsp;
        </div>
        {range.days.map((day, idx) => (
          <div
            key={day.toISOString()}
            className={`px-3 py-2 text-center border-l border-border/50 ${
              idx === todayIdx ? "bg-primary/10" : ""
            }`}
          >
            <div className="text-[11px] font-bold text-foreground uppercase tracking-wide">
              {t(`days.${DAY_KEYS[idx]}`)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {dayFormatter.format(day)}
            </div>
          </div>
        ))}
      </div>

      {/* No-due-date lane */}
      {hasNoDueDate && (
        <LaneShell label={t("lanes.noDueDate")} count={buckets.noDueDate.length}>
          <div className="absolute inset-0 bg-muted/20 pointer-events-none" aria-hidden="true" />
          <div className="relative px-2 py-2 flex flex-wrap gap-1.5">
            {buckets.noDueDate.map((task: CalendarTask) => (
              <div key={task.id} className="basis-[calc(25%-0.4rem)] min-w-[200px] grow max-w-sm">
                <TaskBar task={task} weekStart={weekStart} isNoDueDateLane />
              </div>
            ))}
          </div>
        </LaneShell>
      )}

      {/* Team lanes */}
      {buckets.byTeam.map((bucket, idx) => (
        <LaneShell
          key={bucket.teamId ?? "no-team"}
          label={bucket.teamName}
          count={bucket.tasks.length}
          zebra={idx % 2 === 1}
        >
          <DayBackdrop days={range.days} todayIdx={todayIdx} />
          <div
            className="relative grid gap-y-1 py-1.5 px-1 items-start"
            style={{
              gridTemplateColumns: "repeat(7, 1fr)",
              gridAutoRows: "min-content",
            }}
          >
            {bucket.tasks.map((task) => (
              <TaskBar key={task.id} task={task} weekStart={weekStart} />
            ))}
          </div>
        </LaneShell>
      ))}
    </div>
  );
}
