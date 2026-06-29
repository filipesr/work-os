import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/projects/KanbanBoard";

// next-intl: echo the key, appending the interpolated count when present so we
// can assert per-column counters.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals && "count" in vals ? `${key}:${vals.count}` : key,
}));

// Render TaskCard as a lightweight stub keyed by title.
vi.mock("@/components/projects/TaskCard", () => ({
  TaskCard: ({ task }: { task: { title: string } }) => (
    <div data-testid="task-card">{task.title}</div>
  ),
}));

// Filters stub: a single button that turns on the "my tasks" filter so we can
// exercise the filtering logic without the real filter UI.
vi.mock("@/components/projects/KanbanFilters", () => ({
  KanbanFilters: ({
    filters,
    onFiltersChange,
  }: {
    filters: Record<string, unknown>;
    onFiltersChange: (f: Record<string, unknown>) => void;
  }) => <button onClick={() => onFiltersChange({ ...filters, myTasks: true })}>apply-mine</button>,
}));

const project = { id: "p1", client: { name: "ACME" } } as never;

const stages = [
  {
    id: "s1",
    name: "Design",
    order: 1,
    templateId: "tpl",
    templateName: "Flow",
    defaultTeam: null,
  },
  {
    id: "s2",
    name: "Review",
    order: 2,
    templateId: "tpl",
    templateName: "Flow",
    defaultTeam: null,
  },
];

function makeTask(over: Record<string, unknown>) {
  return {
    id: "t",
    title: "Task",
    priority: "MEDIUM",
    assigneeId: null,
    assignee: null,
    currentStage: null,
    currentStageId: null,
    project,
    ...over,
  } as never;
}

const tasks = [
  makeTask({ id: "t1", title: "Alpha", assigneeId: "u1", currentStageId: "s1" }),
  makeTask({ id: "t2", title: "Beta", assigneeId: "u2", currentStageId: "s2" }),
];

function renderBoard(extra?: { stages?: typeof stages; tasks?: typeof tasks }) {
  return render(
    <KanbanBoard
      project={project}
      tasks={extra?.tasks ?? tasks}
      stages={extra?.stages ?? stages}
      currentUserId="u1"
      currentUserTeamIds={[]}
    />
  );
}

describe("KanbanBoard", () => {
  it("renders one column per stage", () => {
    renderBoard();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("groups each task under its current stage", () => {
    renderBoard();
    const cards = screen.getAllByTestId("task-card");
    expect(cards.map((c) => c.textContent)).toEqual(["Alpha", "Beta"]);
    // Each populated column reports a single task.
    expect(screen.getAllByText("taskCount:1")).toHaveLength(2);
  });

  it("shows the empty state for stages without tasks", () => {
    renderBoard({ stages: [...stages, { ...stages[0], id: "s3", name: "QA" }] });
    expect(screen.getByText("noTasks")).toBeInTheDocument();
  });

  it("filters to the current user's tasks", async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    await user.click(screen.getByText("apply-mine"));

    // Beta belongs to u2 and is filtered out; Alpha (u1) stays.
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("renders the no-stages state when there are no stages", () => {
    renderBoard({ stages: [] });
    expect(screen.getByText("noStages")).toBeInTheDocument();
  });
});
