import { currentMonthSaoPaulo, monthRangeSaoPaulo } from "@/lib/dates";

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Parse the shared report filter searchParams exactly as the performance and
 * productivity pages compute them today.
 */
export function parseReportFilters(params: SearchParams) {
  const rawMonth = typeof params.month === "string" ? params.month : undefined;
  const teamId = typeof params.teamId === "string" && params.teamId ? params.teamId : undefined;
  const clientId =
    typeof params.clientId === "string" && params.clientId ? params.clientId : undefined;
  const projectId =
    typeof params.projectId === "string" && params.projectId ? params.projectId : undefined;

  // Default to the current month (SP) even when no data exists yet.
  const monthStr = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonthSaoPaulo();
  const { start: startDate, end: endDate } = monthRangeSaoPaulo(monthStr);

  // Filters are meaningful (e.g. "Limpar") only when a non-default filter is active.
  const hasFilters = Boolean(rawMonth || teamId || clientId || projectId);

  return { rawMonth, monthStr, teamId, clientId, projectId, startDate, endDate, hasFilters };
}
