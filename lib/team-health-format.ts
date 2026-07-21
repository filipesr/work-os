/** Compact age label, locale-neutral: "5h", "2d", "2d 2h". */
export function formatAge(hours: number): string {
  const total = Math.max(0, Math.floor(hours));
  const d = Math.floor(total / 24);
  const h = total % 24;
  if (d === 0) return `${h}h`;
  if (h === 0) return `${d}d`;
  return `${d}d ${h}h`;
}

type LoadRow = { count: number; onTrack: number; dueSoon: number; overdue: number };

/** Bar segments (percent of the person's WIP) ordered overdue → dueSoon → onTrack. */
export function loadSegments(
  row: LoadRow
): { key: "overdue" | "dueSoon" | "onTrack"; pct: number }[] {
  const denom = row.count || 1;
  const pct = (n: number) => (row.count === 0 ? 0 : (n / denom) * 100);
  return [
    { key: "overdue", pct: pct(row.overdue) },
    { key: "dueSoon", pct: pct(row.dueSoon) },
    { key: "onTrack", pct: pct(row.onTrack) },
  ];
}

/** A collaborator's active stage, for the load drill-down drawer. */
export interface MemberStage {
  taskId: string;
  taskTitle: string;
  stageName: string;
  /** Task creation date (ISO string). */
  createdAt: string;
  /** When this stage was activated for the collaborator — proxy for the
   * assignment date (ISO string). */
  assignedAt: string;
  /** Task due date (ISO string), or null. */
  dueDate: string | null;
  dueState: "overdue" | "dueSoon" | "none";
}
