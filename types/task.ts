export type ActiveStageWithDetails = {
  id: string;
  status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  taskId: string;
  stageId: string;
  assigneeId: string | null;
  activatedAt: Date;
  completedAt: Date | null;
  assignee: {
    name: string | null;
    email: string | null;
  } | null;
  task: {
    id: string;
    title: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" | "OBSOLETE";
    dueDate: Date | null;
    createdAt: Date;
    project: {
      name: string;
      client: { name: string };
    };
  };
  stage: {
    id: string;
    name: string;
    order: number;
    defaultTeam: {
      id: string;
      name: string;
    } | null;
    template: {
      id: string;
      name: string;
    };
  };
};

export type MyAllStagesResult = {
  stages: ActiveStageWithDetails[];
  stats: {
    total: number;
    byStatus: {
      INACTIVE: number;
      ACTIVE: number;
      BLOCKED: number;
      COMPLETED: number;
    };
    byPriority: {
      LOW: number;
      MEDIUM: number;
      HIGH: number;
      URGENT: number;
    };
    overdue: number;
    totalHoursLogged: number;
  };
};
