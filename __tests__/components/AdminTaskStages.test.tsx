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
import { RevertStageButton } from "@/components/tasks/RevertStageButton";

// Duas `TaskActiveStage` ACTIVE ao mesmo tempo — o cenário de fork/join que `task.currentStageId`
// não sabia representar: só uma das duas era "a" etapa atual, e a outra ficava sem ações.
const ATIVA_A: AdminActiveStageRow = {
  id: "as1",
  stageId: "ts1",
  status: "ACTIVE",
  stage: { name: "Roteiro", order: 1, template: { name: "Vídeo institucional" } },
  assignee: { name: "Ana", email: "ana@x.com" },
};

const ATIVA_B: AdminActiveStageRow = {
  id: "as2",
  stageId: "ts2",
  status: "ACTIVE",
  stage: { name: "Arte", order: 2, template: { name: "Vídeo institucional" } },
  assignee: { name: "Beto", email: "beto@x.com" },
};

const PROPS = {
  taskId: "t1",
};

const PREVIOUS_STAGES = [{ id: "ts0", name: "Briefing", order: 0 }];

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

  // Fix round 1: `RevertStageButton` recebe só `taskId` + `previousStages` — nenhum `stageId`.
  // Repeti-lo por etapa produz cópias idênticas que não sabem em que bloco estão, e sugerem
  // (falsamente) que cada uma reverte "a sua" etapa — quando na verdade reverte a DEMANDA. Ele
  // não mora mais dentro do bloco por etapa: fica junto do `CompleteTaskButton`, fora da lista.
  it("etapa BLOCKED não ganha reverter dentro do bloco — reverter é ação de demanda, não de etapa", () => {
    render(<AdminTaskStages stages={[{ ...ATIVA_A, status: "BLOCKED" }]} {...PROPS} />);
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /triggerButton/ })).not.toBeInTheDocument();
  });

  it("com DUAS etapas ativas, existe UM botão de reverter na tela — a mesma cópia do cabeçalho da demanda, não uma por etapa", () => {
    // Simula a composição real da página: `RevertStageButton` fora da lista (junto do
    // `CompleteTaskButton`) e `AdminTaskStages` ao lado. Se `AdminTaskStages` tivesse voltado a
    // renderizar o próprio Reverter por etapa, este teste veria 2 (ou mais) botões, não 1.
    render(
      <>
        <RevertStageButton taskId={PROPS.taskId} previousStages={PREVIOUS_STAGES} />
        <AdminTaskStages stages={[ATIVA_A, ATIVA_B]} {...PROPS} />
      </>
    );
    expect(screen.getAllByRole("button", { name: /triggerButton/ })).toHaveLength(1);
  });

  it("mostra o template de cada etapa ao lado do nome", () => {
    render(<AdminTaskStages stages={[ATIVA_A]} {...PROPS} />);
    expect(screen.getByText(/Vídeo institucional/)).toBeInTheDocument();
  });

  it("sem etapa ativa nenhuma, mostra o estado vazio em vez de uma lista sem itens", () => {
    render(<AdminTaskStages stages={[]} {...PROPS} />);
    expect(screen.getByText("noCurrentStage")).toBeInTheDocument();
  });
});
