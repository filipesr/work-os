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

/**
 * Mesma etapa e mesma demanda usadas em `__tests__/lib/actions/stage-view.test.ts`, para que
 * este teste e o do fetch fiquem falando da mesma etapa (`as2`) no mesmo vocabulário.
 */
const VIEW: StageView = {
  stage: {
    activeStageId: "as2",
    name: "Gravação",
    order: 2,
    status: "ACTIVE",
    teamName: "Vídeo",
    assignee: { id: "u1", name: "Ana" },
    instruction: "Gravar no estúdio B",
  },
  task: {
    id: "t1",
    title: "Reels de setembro",
    dueDate: new Date("2026-09-10T00:00:00Z"),
    projectName: "Campanha institucional",
    clientName: "ACME",
  },
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
});
