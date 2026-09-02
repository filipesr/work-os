import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { StageWorkView } from "@/components/tasks/StageWorkView";
import type { StageView } from "@/lib/actions/stage-view";

// next-intl: ecoa a chave (sem namespace) — é assim que o teste verifica QUAL chave
// cada trecho da tela usa, sem depender do texto traduzido.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

// AddCommentForm tem dependências pesadas (server action, toast) que nada aqui exercita —
// só a PRESENÇA do wrapper importa para estes testes, não o formulário em si.
vi.mock("@/components/tasks/AddCommentForm", () => ({
  AddCommentForm: () => <div data-testid="add-comment-form-stub" />,
}));

// Painel de artefatos tem sua própria árvore de hooks (useRouter, upload NAS, versionamento) —
// já testada em separado. Aqui só a PRESENÇA do painel na etapa importa (Task 9), não o miolo dele
// — igual ao que `TaskDetailView.test.tsx` já faz.
vi.mock("@/components/artifacts/UnifiedArtifactsPanel", () => ({
  UnifiedArtifactsPanel: () => <div data-testid="artifacts-panel-stub" />,
}));

// Task 9: os botões de ação (antes só na demanda) passam a morar aqui. As Server Actions por trás
// deles são pesadas (prisma, next-intl/server, auth) e já têm teste próprio — aqui só a
// MONTAGEM dos botões na tela da etapa importa.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));
vi.mock("@/lib/actions/activity", () => ({
  startWorkOnTask: vi.fn(),
  stopWorkOnTask: vi.fn(),
}));
vi.mock("@/lib/actions/task", () => ({
  logTime: vi.fn(),
  completeStageAndAdvance: vi.fn(),
  getStageCompletionContext: vi.fn().mockResolvedValue({ loggedHours: 0, referenceHours: 0 }),
  revertTaskStage: vi.fn(),
  unassignActiveStage: vi.fn(),
}));
vi.mock("@/lib/actions/stage-assignment", () => ({
  previewNextStages: vi.fn().mockResolvedValue({ activated: [], blocked: [] }),
  getTeamMembers: vi.fn().mockResolvedValue([]),
}));

/**
 * Mesma etapa e mesma demanda usadas em `__tests__/lib/actions/stage-view.test.ts`, para que
 * este teste e o do fetch fiquem falando da mesma etapa (`as2`) no mesmo vocabulário.
 */
const VIEW: StageView = {
  stage: {
    activeStageId: "as2",
    templateStageId: "ts2",
    name: "Gravação",
    order: 2,
    status: "ACTIVE",
    teamName: "Vídeo",
    assignee: { id: "u1", name: "Ana" },
    instruction: "Gravar no estúdio B",
    canPerformActions: true,
  },
  task: {
    id: "t1",
    title: "Reels de setembro",
    dueDate: new Date("2026-09-10T00:00:00Z"),
    projectId: "p1",
    projectName: "Campanha institucional",
    clientId: "c1",
    clientName: "ACME",
  },
  previousStages: [],
  activeLog: null,
  artifactRows: [],
  canManageScoped: false,
  comments: [
    {
      id: "c1",
      content: "oi",
      createdAt: new Date("2026-09-01T09:00:00Z"),
      kind: "USER",
      activeStageId: null,
      author: { id: "u2", name: "Beto" },
    },
    {
      id: "c2",
      content: "Gravar no estúdio B",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      kind: "STAGE_INSTRUCTION",
      activeStageId: "as2",
      author: { id: "gestor1", name: "Gestora" },
    },
    {
      id: "c3",
      content: "combinado, obrigado",
      createdAt: new Date("2026-09-01T11:00:00Z"),
      kind: "USER",
      activeStageId: null,
      author: { id: "u1", name: "Ana" },
    },
  ],
};

describe("StageWorkView", () => {
  it("mostra a instrução da etapa em destaque, com título próprio", () => {
    render(<StageWorkView view={VIEW} currentUserId="u1" />);
    const destaque = screen.getByTestId("stage-instruction");
    expect(destaque).toHaveTextContent("stageView.instructionTitle");
    expect(destaque).toHaveTextContent("Gravar no estúdio B");
  });

  it("a conversa é a da DEMANDA, com o bloco desta etapa realçado", () => {
    // Realçar, não filtrar: quem opera precisa do contexto inteiro. Um teste que só contasse os
    // comentários da etapa passaria numa implementação que filtra — que é o oposto da decisão.
    render(<StageWorkView view={VIEW} currentUserId="u1" />);
    expect(screen.getAllByTestId("comment")).toHaveLength(3);
    expect(screen.getByTestId("comment-c2")).toHaveAttribute("data-this-stage", "true");
    expect(screen.getByTestId("comment-c1")).toHaveAttribute("data-this-stage", "false");
  });

  it("etapa concluída não oferece caixa de escrever", () => {
    // A tela da etapa concluída é leitura: a conversa dela já aconteceu.
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
        currentUserId="u1"
      />
    );
    expect(screen.queryByTestId("add-comment")).not.toBeInTheDocument();
  });

  it("a etapa ativa oferece as ações dela", () => {
    // Estas ações moravam na tela da demanda, escolhendo sozinhas qual etapa ativa operar. Com
    // fork/join várias etapas podem estar ACTIVE ao mesmo tempo — só a tela DESTA etapa sabe, sem
    // adivinhar, qual delas é.
    render(<StageWorkView view={VIEW} currentUserId="u1" />);
    for (const testid of ["activity-button", "log-time", "advance-stage"]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
  });

  // Fix round 1: o portão da tela precisa espelhar o guarda de CADA botão no servidor, não um
  // portão único largo (esconde `revertTaskStage` aceitando BLOCKED) nem um único estreito
  // (esconde `logTime`, que não exige etapa ACTIVE nenhuma).

  it("etapa BLOCKED mostra reverter, mas não avançar/desatribuir — mesma regra de revertTaskStage", () => {
    // `revertTaskStage` aceita a demanda ter etapa ACTIVE OU BLOCKED; `completeStageAndAdvance` e
    // `unassignActiveStage` só aceitam ACTIVE. Exigir ACTIVE para reverter também escondia o botão
    // exatamente na situação em que ele mais serve: uma etapa travada.
    render(
      <StageWorkView
        view={{
          ...VIEW,
          stage: { ...VIEW.stage, status: "BLOCKED" },
          previousStages: [{ id: "ts1", name: "Roteiro", order: 1 }],
        }}
        currentUserId="u1"
      />
    );
    expect(screen.getByRole("button", { name: /triggerButton/ })).toBeInTheDocument();
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-button")).not.toBeInTheDocument();
  });

  it("etapa COMPLETED ainda oferece apontar hora — logTime não exige etapa ativa nenhuma", () => {
    // `logTime` só checa `requireMemberOrHigher`. Prender ao status ACTIVE tirava de um gestor o
    // único caminho de lançar/corrigir hora numa demanda já concluída — perda de função pura.
    render(
      <StageWorkView
        view={{ ...VIEW, stage: { ...VIEW.stage, status: "COMPLETED" } }}
        currentUserId="u1"
      />
    );
    expect(screen.getByTestId("log-time")).toBeInTheDocument();
    expect(screen.queryByTestId("advance-stage")).not.toBeInTheDocument();
  });
});
