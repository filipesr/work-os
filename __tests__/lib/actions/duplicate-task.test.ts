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

    await duplicateTask("t1", { dueDate: "2026-09-30", noDueDate: false });

    const args = createTaskStages.mock.calls[0][1];
    expect([...args.selectedStageIds].sort()).toEqual(["s1", "s2"]);
    expect(args.teams).toEqual({ s2: "tB" });
    expect(args.instructions).toEqual({ s2: "Revisar o roteiro" });
  });

  it("grava quem duplicou como autor da cópia — não o criador da original", async () => {
    // A cópia é uma demanda NOVA, e ela repassa as `instructions` das etapas originais para
    // createTaskStages: sem autor aqui, uma instrução viva viajaria sem ninguém que a assine.
    // E quem assina é quem clicou em duplicar (mock de requireManagerOrAdmin: "gestor1"),
    // nunca o criador da demanda original — que não decidiu nada para ESTA cópia.
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    await duplicateTask("t1", { dueDate: "2026-09-30", noDueDate: false });

    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({ createdById: "gestor1" });
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

    await duplicateTask("t1", { dueDate: "2026-09-30", noDueDate: false });

    // Sem assignments a etapa de entrada nasce sem dono → task fica em BACKLOG
    // com startedAt nulo, dentro da janela de lib/task-virgin.ts. Não há mais `assigneeId` na
    // demanda para conferir: a coluna foi removida, e o dono sempre foi da ETAPA.
    expect(createTaskStages.mock.calls[0][1].assignments).toBeUndefined();
    expect(tx.task.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ status: "BACKLOG" })
    );
    expect(tx.task.create.mock.calls[0][0].data).not.toHaveProperty("assigneeId");
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

  it("grava o prazo informado — duplicar decide o prazo, não herda em silêncio", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      dueDate: new Date("2026-01-10T00:00:00.000Z"),
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    await duplicateTask("t1", { dueDate: "2026-09-30", noDueDate: false });

    expect(tx.task.create.mock.calls[0][0].data.dueDate).toEqual(
      new Date("2026-09-30T00:00:00.000Z")
    );
  });

  it("recusa duplicar sem prazo e sem a marca — a cópia é uma demanda nova", async () => {
    // Sem isto, duplicar era a porta dos fundos da regra de criação: a cópia nascia sem prazo,
    // invisível para cobertura, taxa de entrega e atraso — e como demanda não se edita, sem
    // conserto possível a não ser marcar obsoleta e recomeçar.
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      dueDate: null,
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    expect(await duplicateTask("t1", { dueDate: "", noDueDate: false })).toEqual({
      error: "dueDateRequired",
    });
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it("com a marca, a cópia nasce sem prazo de propósito", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "Vídeo demo",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      dueDate: new Date("2026-01-10T00:00:00.000Z"),
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    await duplicateTask("t1", { dueDate: "", noDueDate: true });

    expect(tx.task.create.mock.calls[0][0].data.dueDate).toBeNull();
  });

  it("usa o título informado — duplicar também serve para rodar o mesmo modelo de novo", async () => {
    // O sufixo "(cópia)" só descrevia um dos dois usos: corrigir uma demanda travada. O outro é
    // repetir o mesmo desenho para outro ciclo, e aí o título é outro.
    db.task.findUnique.mockResolvedValue({
      title: "Landing setembro",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      dueDate: null,
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    await duplicateTask("t1", {
      title: "Landing outubro",
      dueDate: "2026-10-31",
      noDueDate: false,
    });

    expect(tx.task.create.mock.calls[0][0].data.title).toBe("Landing outubro");
  });

  it("recusa título vazio", async () => {
    db.task.findUnique.mockResolvedValue({
      title: "Landing setembro",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      dueDate: null,
      activeStages: [
        { stageId: "s1", teamId: null, instructions: null, stage: { templateId: "tpl" } },
      ],
    });

    expect(
      await duplicateTask("t1", { title: "   ", dueDate: "2026-10-31", noDueDate: false })
    ).toEqual({ error: "titleRequired" });
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});
