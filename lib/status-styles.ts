/**
 * Mapas canônicos de classes Tailwind para badges de prioridade e status.
 * Fonte única de verdade — antes duplicados inline em my-stages, dashboard,
 * reports/calendar, artifacts, etc.
 */

export const PRIORITY_BADGE: Record<string, string> = {
  URGENT: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

/** ActiveStageStatus: ACTIVE | BLOCKED | COMPLETED */
export const STAGE_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800 border-blue-300",
  BLOCKED: "bg-gray-100 text-gray-800 border-gray-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
};

/** TaskStatus: BACKLOG | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED | OBSOLETE */
export const TASK_STATUS_BADGE: Record<string, string> = {
  BACKLOG: "bg-gray-100 text-gray-800 border-gray-300",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
  PAUSED: "bg-purple-100 text-purple-800 border-purple-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
  CANCELLED: "bg-red-100 text-red-800 border-red-300",
  OBSOLETE: "bg-gray-100 text-gray-500 border-gray-300",
};

const FALLBACK = "bg-gray-100 text-gray-800 border-gray-300";

export function priorityBadgeClass(priority: string): string {
  return PRIORITY_BADGE[priority] ?? FALLBACK;
}

export function stageStatusBadgeClass(status: string): string {
  return STAGE_STATUS_BADGE[status] ?? FALLBACK;
}

export function taskStatusBadgeClass(status: string): string {
  return TASK_STATUS_BADGE[status] ?? FALLBACK;
}
