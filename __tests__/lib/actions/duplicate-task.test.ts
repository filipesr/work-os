import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A action traduz suas mensagens; sob jsdom o next-intl resolve para o build de cliente, onde
  // `getTranslations` lança por design. Devolver a própria chave basta: estes testes afirmam o
  // MOTIVO do erro, nunca o texto.
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  // duplicateTask redireciona no fim; o redirect real lança, então aqui é no-op.
  redirect: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
  requireMemberOrHigher: vi.fn(),
  getSessionUser: vi.fn(),
}));

// vi.hoisted: as factories de vi.mock sobem acima das consts do módulo.
const { createTaskStages } = vi.hoisted(() => ({ createTaskStages: vi.fn() }));
vi.mock("@/lib/stage-assignment-helpers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createTaskStages,
}));

const tx = { task: { create: vi.fn() } };

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { duplicateTask } from "@/lib/actions/task";

const db = prisma as unknown as { task: { findUnique: ReturnType<typeof vi.fn> } };

// Duplicar é o caminho de conserto de uma demanda que travou (obsoleta →
// duplica → corrige). Para servir a isso, a cópia precisa nascer VIRGEM e com o
// desenho da original — senão consertar uma etapa custaria redecidir todas.
describe("duplicateTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.task.create.mockResolvedValue({ id: "novo" });
    createTaskStages.mockResolvedValue({ initialAssigned: false });
  });

  it("carrega etapas incluídas, time roteado e instrução das coringa", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: "desc",
      priority: "HIGH",
      projectId: "p1",
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
        {
          stageId: "s2",
          teamId: "tB",
          instructions: "Revisar o roteiro",
          stage: { templateId: "tpl" },
        },
      ],
    });

    await duplicateTask("t1");

    const args = createTaskStages.mock.calls[0][1];
    expect([...args.selectedStageIds].sort()).toEqual(["s1", "s2"]);
    expect(args.teams).toEqual({ s2: "tB" });
    expect(args.instructions).toEqual({ s2: "Revisar o roteiro" });
  });

  it("NÃO copia responsável — é o que mantém a cópia virgem e corrigível", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    await duplicateTask("t1");

    // Sem assignments a etapa de entrada nasce sem dono → task fica em BACKLOG
    // com startedAt nulo, dentro da janela de lib/task-virgin.ts.
    expect(createTaskStages.mock.calls[0][1].assignments).toBeUndefined();
    expect(tx.task.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ status: "BACKLOG", assigneeId: null })
    );
  });

  it("recusa duplicar tarefa sem etapas", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "x",
      description: null,
      priority: "LOW",
      projectId: "p1",
      activeStages: [],
    });
    expect(await duplicateTask("t1")).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
