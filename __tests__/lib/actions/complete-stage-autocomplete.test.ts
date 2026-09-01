import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A action traduz suas mensagens; sob jsdom o next-intl resolve para o build de cliente, onde
  // `getTranslations` lança por design. Devolver a própria chave basta: estes testes afirmam o
  // MOTIVO do erro, nunca o texto.
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// Sem régua nestes cenários: o apontamento em si não é o que este arquivo testa.
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    // updateMany: carimbo write-once de startedAt (lib/task-start.ts).
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
    },
    stageDependency: { findMany: vi.fn().mockResolvedValue([]) },
    templateStage: {
      findUnique: vi.fn().mockResolvedValue({ templateId: "tpl" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    taskStageLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    stageTransition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn() },
    // Já apontado o bastante para não travar no gate de horas — o que este arquivo testa é a
    // autocompleção da tarefa, não o apontamento em si.
    activityLog: { findFirst: vi.fn().mockResolvedValue(null) },
    timeLog: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { hoursSpent: 1 } }),
      create: vi.fn().mockResolvedValue({}),
    },
    stageCompletionNote: { create: vi.fn().mockResolvedValue({}) },
  },
  prisma: {},
}));

import { auth } from "@/auth";

const mockAuth = vi.mocked(auth);

function setupActiveStage(prisma: any) {
  // Admin caller → skips contribution gate.
  mockAuth.mockResolvedValue({
    user: { id: "u1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
  } as any);
  prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
  // The (last) active stage being completed.
  prisma.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "u1",
    stage: { id: "s1", name: "Etapa Final", template: {}, defaultTeam: null },
    task: { id: "task1", project: { client: {} } },
  });
  // No dependent stages → activateNextStages returns empty.
  prisma.stageDependency.findMany.mockResolvedValue([]);
  prisma.taskActiveStage.findMany.mockResolvedValue([]);
}

describe("completeStageAndAdvance auto-completes the task", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the task COMPLETED when no open stage rows remain", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;
    setupActiveStage(prisma);
    // No ACTIVE/BLOCKED/INACTIVE rows left → last stage.
    prisma.taskActiveStage.count.mockResolvedValue(0);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    const result = await completeStageAndAdvance("task1", "s1");

    expect(result).toMatchObject({ success: true });

    // count must consider ACTIVE, BLOCKED and INACTIVE as "not done yet".
    const countCall = prisma.taskActiveStage.count.mock.calls.at(-1)?.[0];
    expect(countCall?.where?.status).toEqual({ in: ["ACTIVE", "BLOCKED", "INACTIVE"] });

    // Task updated to COMPLETED with a completedAt timestamp.
    const updateCall = prisma.task.update.mock.calls.at(-1)?.[0];
    expect(updateCall?.data?.status).toBe("COMPLETED");
    expect(updateCall?.data?.completedAt).toBeInstanceOf(Date);

    // An audit comment is logged for the auto-completion.
    const comment = prisma.taskComment.create.mock.calls.at(-1)?.[0];
    expect(comment?.data?.content).toMatch(/CONCLU[IÍ]DA AUTOMATICAMENTE/i);
  });

  it("keeps the task IN_PROGRESS when open stage rows remain", async () => {
    const prisma = (await import("@/lib/prisma")).default as any;
    setupActiveStage(prisma);
    // One stage still open.
    prisma.taskActiveStage.count.mockResolvedValue(1);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    const result = await completeStageAndAdvance("task1", "s1");

    expect(result).toMatchObject({ success: true });

    const updateCall = prisma.task.update.mock.calls.at(-1)?.[0];
    expect(updateCall?.data?.status).toBe("IN_PROGRESS");

    // No auto-completion comment when the task is not finished.
    const autoComment = prisma.taskComment.create.mock.calls.find((c: any[]) =>
      /CONCLU[IÍ]DA AUTOMATICAMENTE/i.test(c?.[0]?.data?.content ?? "")
    );
    expect(autoComment).toBeUndefined();
  });

  it("fecha TODOS os logs abertos da etapa, não só o primeiro", async () => {
    // Defesa em profundidade: a causa do log órfão (reivindicar abria um segundo) foi corrigida na
    // origem, mas demanda que JÁ tem sobra precisa se resolver ao concluir. Fechar por `findFirst`
    // deixava a segunda linha aberta para sempre, e nada na tela denunciava.
    const prisma = (await import("@/lib/prisma")).default as any;
    setupActiveStage(prisma);
    prisma.taskActiveStage.count.mockResolvedValue(1);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    await completeStageAndAdvance("task1", "s1");

    const chamada = prisma.taskStageLog.updateMany.mock.calls.at(-1)?.[0];
    expect(chamada?.where).toEqual({ taskId: "task1", stageId: "s1", exitedAt: null });
    expect(chamada?.data?.status).toBe("COMPLETED");
  });
});
