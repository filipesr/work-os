import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  useLocale: () => "pt-BR",
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

vi.mock("@/lib/actions/task", () => ({
  completeStageAndAdvance: vi.fn(async () => ({ success: true, activated: [], blocked: [] })),
  getStageCompletionContext: vi.fn(async () => ({ loggedHours: 0, referenceHours: 0 })),
  revertTaskStage: vi.fn(async () => ({ success: true })),
  unassignActiveStage: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/actions/stage-assignment", () => ({
  previewNextStages: vi.fn(async () => ({ activated: [], blocked: [] })),
  getTeamMembers: vi.fn(async () => []),
}));

import { AdminTaskStages, type AdminActiveStageRow } from "@/components/tasks/AdminTaskStages";

// Duas `TaskActiveStage` ACTIVE ao mesmo tempo — o cenário de fork/join que `task.currentStageId`
// não sabia representar: só uma das duas era "a" etapa atual, e a outra ficava sem ações.
const ATIVA_A: AdminActiveStageRow = {
  id: "as1",
  stageId: "ts1",
  status: "ACTIVE",
  stage: { name: "Roteiro", order: 1 },
  assignee: { name: "Ana", email: "ana@x.com" },
};

const ATIVA_B: AdminActiveStageRow = {
  id: "as2",
  stageId: "ts2",
  status: "ACTIVE",
  stage: { name: "Arte", order: 2 },
  assignee: { name: "Beto", email: "beto@x.com" },
};

const PROPS = {
  taskId: "t1",
  previousStages: [{ id: "ts0", name: "Briefing", order: 0 }],
};

describe("AdminTaskStages", () => {
  it("com DUAS etapas ativas, cada uma tem as próprias ações", () => {
    // `task.currentStageId` elege uma sozinho — o mesmo defeito da tela da demanda, no admin. Com
    // fork/join isso esconde metade do trabalho em curso atrás de um botão que age na outra etapa.
    render(<AdminTaskStages stages={[ATIVA_A, ATIVA_B]} {...PROPS} />);
    expect(screen.getAllByTestId("advance-stage")).toHaveLength(2);
  });

  it("mostra o nome de cada etapa ao lado das próprias ações", () => {
    render(<AdminTaskStages stages={[ATIVA_A, ATIVA_B]} {...PROPS} />);
    expect(screen.getByText("Roteiro")).toBeInTheDocument();
    expect(screen.getByText("Arte")).toBeInTheDocument();
  });

  it("etapa BLOCKED mostra reverter, mas não avançar — mesma regra de revertTaskStage", () => {
    // `revertTaskStage` aceita a demanda ter etapa ACTIVE OU BLOCKED; `completeStageAndAdvance` e
    // `unassignActiveStage` só aceitam ACTIVE. Portão largo demais esconderia esse recuo válido;
    // estreito demais deixaria a etapa BLOCKED sem nenhuma ação.
    render(<AdminTaskStages stages={[{ ...ATIVA_A, status: "BLOCKED" }]} {...PROPS} />);
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /triggerButton/ })).toBeInTheDocument();
  });

  it("sem etapa ativa nenhuma, mostra o estado vazio em vez de uma lista sem itens", () => {
    render(<AdminTaskStages stages={[]} {...PROPS} />);
    expect(screen.getByText("noCurrentStage")).toBeInTheDocument();
  });
});
