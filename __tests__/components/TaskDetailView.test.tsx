import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";
import { UserRole } from "@prisma/client";

// next-intl: echo keys; locale fixed.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

// Stub every heavy child so the test targets TaskDetailView's own rendering.
//
// Task 9: ActivityButton/TaskActionsMenu/AddCommentForm SAÍRAM de TaskDetailView — não há mais
// import nenhum deles aqui para mockar. O teste "a tela da demanda não age mais" abaixo prova
// ausência de verdade (o componente real não é montado), não ausência por mock.
vi.mock("@/components/tasks/CommentsList", () => ({ CommentsList: () => <div /> }));
vi.mock("@/components/tasks/ArtifactsList", () => ({ ArtifactsList: () => <div /> }));
vi.mock("@/components/tasks/AddArtifactForm", () => ({ AddArtifactForm: () => <div /> }));
vi.mock("@/components/artifacts/UnifiedArtifactsPanel", () => ({
  UnifiedArtifactsPanel: () => <div />,
}));
vi.mock("@/components/tasks/TimeLogsList", () => ({ TimeLogsList: () => <div /> }));
vi.mock("@/components/tasks/WorkflowHistoryModal", () => ({
  WorkflowHistoryModal: () => <div data-testid="WorkflowHistoryModal" />,
}));

function makeTask(over?: Record<string, unknown>) {
  return {
    id: "t1",
    title: "Landing Page",
    projectId: "p1",
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: null,
    project: {
      id: "p1",
      name: "Site",
      description: null,
      artifacts: [],
      client: { name: "ACME", artifacts: [] },
    },
    assignee: { id: "u1", name: "Fabi", email: "f@x.com", image: null },
    currentStage: null,
    currentStageId: null,
    comments: [],
    artifacts: [],
    stageLogs: [],
    timeLogs: [],
    ...over,
  } as never;
}

function renderView(taskOver?: Record<string, unknown>, role: UserRole = UserRole.MEMBER) {
  return render(
    <TaskDetailView
      task={makeTask(taskOver)}
      artifactRows={[]}
      currentUserId="u1"
      currentUserRole={role}
      allTemplateStages={[]}
    />
  );
}

describe("TaskDetailView", () => {
  it("renders the task title and project/client", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Landing Page" })).toBeInTheDocument();
    // PageHeader subtitle joins client · project into a single node.
    expect(screen.getByText("ACME · Site")).toBeInTheDocument();
  });

  it("shows the assignee name", () => {
    renderView();
    expect(screen.getByText("Fabi")).toBeInTheDocument();
  });

  it("renders without crashing for an overdue task", () => {
    renderView({ dueDate: new Date("2000-01-01T00:00:00Z") });
    expect(screen.getByRole("heading", { name: "Landing Page" })).toBeInTheDocument();
  });

  it("renders the current stage badge when present", () => {
    renderView({ currentStage: { id: "s1", name: "Design", order: 3 } });
    // StatusBadge joins order · stage name into a single node.
    expect(screen.getByText("3 · Design")).toBeInTheDocument();
  });

  it("a tela da demanda não age mais — é leitura", () => {
    // Se a ação precisa saber QUAL etapa, ela mora na etapa. Com etapas paralelas, um botão aqui
    // teria de escolher sozinho — que é o defeito que esta entrega remove.
    renderView();
    for (const testid of ["activity-button", "log-time", "advance-stage", "add-comment"]) {
      expect(screen.queryByTestId(testid)).not.toBeInTheDocument();
    }
  });
});
