import { describe, it, expect } from "vitest";
import { taskVirginBlocker, isTaskVirgin } from "@/lib/task-virgin";

// A janela de correção é "antes da tarefa iniciar". A âncora é `startedAt`, que
// já é carimbado uma única vez na primeira promoção para IN_PROGRESS — e não um
// predicado novo de "teve interação", que precisaria decidir se comentário
// conta, se artefato conta, e divergiria em cada tela nova.

const virgin = {
  status: "BACKLOG",
  startedAt: null,
  activeStages: [{ assigneeId: null }, { assigneeId: null }],
};

describe("taskVirginBlocker", () => {
  it("demanda no backlog, nunca iniciada e sem responsável é virgem", () => {
    expect(taskVirginBlocker(virgin)).toBeNull();
    expect(isTaskVirgin(virgin)).toBe(true);
  });

  it("tarefa sem etapa alguma ainda é virgem", () => {
    expect(taskVirginBlocker({ ...virgin, activeStages: [] })).toBeNull();
  });

  it("startedAt carimbado fecha a janela", () => {
    expect(taskVirginBlocker({ ...virgin, startedAt: new Date("2026-08-01") })).toBe("started");
  });

  it("etapa com responsável fecha a janela mesmo antes de iniciar", () => {
    // Alguém já foi mobilizado: re-rotear por baixo o deixaria preso a uma
    // etapa que passou a ser de outro time.
    expect(
      taskVirginBlocker({
        ...virgin,
        activeStages: [{ assigneeId: null }, { assigneeId: "u1" }],
      })
    ).toBe("assigned");
  });

  it("demanda fora do backlog não é reconfigurável", () => {
    for (const status of ["COMPLETED", "CANCELLED", "OBSOLETE", "PAUSED"]) {
      expect(taskVirginBlocker({ ...virgin, status })).toBe("status");
    }
  });

  it("startedAt tem precedência sobre os demais motivos", () => {
    // O motivo mais específico é o que a tela mostra ao gestor.
    expect(
      taskVirginBlocker({
        status: "IN_PROGRESS",
        startedAt: new Date(),
        activeStages: [{ assigneeId: "u1" }],
      })
    ).toBe("started");
  });
});
