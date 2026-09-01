import { describe, it, expect, vi, beforeEach } from "vitest";

// Remanejar responsável limpa a programação do dono anterior.
//
// `scheduleStage` recusa a troca de dono e manda remanejar "pela própria etapa" — este caminho.
// Se ele mantivesse `plannedDate`/`plannedOrder`, o item apareceria na grade do Bruno, no dia que
// era da Ana e com o número de ordem dela: uma semana que ninguém escolheu.

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
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
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    stageDependency: { findMany: vi.fn().mockResolvedValue([]) },
    templateStage: { findUnique: vi.fn(), findMany: vi.fn() },
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
    // Já apontado o bastante para não travar no gate de horas — o que este arquivo testa é o
    // remanejamento de responsável, não o apontamento em si.
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

/** Tarefa com duas etapas: s1 (sendo concluída) e s2, que depende dela e já tem dono. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setup(prisma: any, donoAtualDeS2: string | null) {
  mockAuth.mockResolvedValue({
    user: { id: "gestor", name: "Gestor", email: "g@example.com", role: "ADMIN" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
  prisma.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "gestor",
    stage: { id: "s1", name: "Roteiro", template: {}, defaultTeam: null },
    task: { id: "task1", project: { client: {} } },
  });
  prisma.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });

  const equipe = { id: "time1", name: "Vídeo", members: [{ id: "ana" }, { id: "bruno" }] };
  prisma.templateStage.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    args.where.templateId
      ? Promise.resolve([
          // Pré-requisitos vivem em `dependents` — em `TemplateStage`, o campo `dependencies` é a
          // relação INVERSA (quem depende desta etapa). Ver o comentário no schema.
          { id: "s1", name: "Roteiro", dependents: [], defaultTeam: equipe },
          {
            id: "s2",
            name: "Edição",
            dependents: [{ dependsOnStageId: "s1" }],
            defaultTeam: equipe,
          },
        ])
      : // A segunda leitura é a da validação de time do assignee.
        Promise.resolve([{ id: "s2", defaultTeamId: "time1", defaultTeam: equipe }])
  );

  prisma.taskActiveStage.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    args.where.stageId
      ? // A leitura da atribuição: quem já era o dono e por qual time a etapa foi roteada.
        Promise.resolve([{ stageId: "s2", teamId: null, assigneeId: donoAtualDeS2, team: null }])
      : Promise.resolve([
          { stageId: "s1", status: "COMPLETED" },
          { stageId: "s2", status: "INACTIVE" },
        ])
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dadosDaAtribuicao(prisma: any) {
  return prisma.taskActiveStage.update.mock.calls.at(-1)?.[0]?.data;
}

describe("completeStageAndAdvance — remanejar responsável", () => {
  beforeEach(() => vi.clearAllMocks());

  it("troca de dono limpa plannedDate e plannedOrder do anterior", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = (await import("@/lib/prisma")).default as any;
    setup(prisma, "ana");

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    await completeStageAndAdvance("task1", "s1", { s2: "bruno" });

    const data = dadosDaAtribuicao(prisma);
    expect(data.assigneeId).toBe("bruno");
    expect(data.plannedDate).toBeNull();
    expect(data.plannedOrder).toBeNull();
  });

  it("reafirmar o MESMO responsável não desmancha a programação já feita", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = (await import("@/lib/prisma")).default as any;
    setup(prisma, "bruno");

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    await completeStageAndAdvance("task1", "s1", { s2: "bruno" });

    const data = dadosDaAtribuicao(prisma);
    expect(data.assigneeId).toBe("bruno");
    expect(data).not.toHaveProperty("plannedDate");
    expect(data).not.toHaveProperty("plannedOrder");
  });

  it("etapa que ainda não tinha dono é atribuição, não remanejamento", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = (await import("@/lib/prisma")).default as any;
    setup(prisma, null);

    const { completeStageAndAdvance } = await import("@/lib/actions/task");
    await completeStageAndAdvance("task1", "s1", { s2: "ana" });

    const data = dadosDaAtribuicao(prisma);
    expect(data.assigneeId).toBe("ana");
    expect(data).not.toHaveProperty("plannedDate");
  });
});
