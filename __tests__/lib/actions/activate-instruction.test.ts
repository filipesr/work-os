import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: {
      findUnique: vi.fn().mockResolvedValue({ createdById: "gestor1" }),
    },
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    templateStage: {
      findUnique: vi.fn().mockResolvedValue({ templateId: "tpl" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    stageTransition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    taskComment: {
      createMany: vi.fn().mockResolvedValue({}),
    },
  },
  prisma: {},
}));

// A instrução vira comentário no instante em que a etapa é liberada. `activateNextStages`
// descobre quem virou ACTIVE (o array `activated`, com id de TEMPLATE stage), busca as linhas
// de INSTÂNCIA correspondentes (`taskActiveStage.findMany` por `stageId: { in: ... }`) e o
// criador da demanda, e delega a decisão de gerar (ou não) para `buildInstructionComments`.

type Node = { id: string; name?: string; dependsOn?: string[] };
function graph(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name ?? n.id,
    dependents: (n.dependsOn ?? []).map((d) => ({ dependsOnStageId: d })),
    defaultTeam: null,
  }));
}

async function setup() {
  const db = (await import("@/lib/prisma")).default as never as {
    task: { findUnique: ReturnType<typeof vi.fn> };
    taskActiveStage: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    templateStage: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    taskComment: { createMany: ReturnType<typeof vi.fn> };
  };
  const { activateNextStages } = await import("@/lib/actions/task");
  return { db, activateNextStages };
}

describe("activateNextStages — instrução da etapa liberada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("liberar uma etapa com instrução cria o comentário assinado pelo criador", async () => {
    const { db, activateNextStages } = await setup();
    db.task.findUnique.mockResolvedValue({ createdById: "gestor1" });
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "INACTIVE" },
      ])
      .mockResolvedValueOnce([{ id: "as2", instructions: "Gravar no estúdio B" }]);
    db.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });
    db.templateStage.findMany.mockResolvedValue(
      graph([{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }])
    );

    // O fio inteiro: activateNextStages descobre o que virou ACTIVE, e é ali que a instrução vira
    // conversa. Fora dali, ela continuaria escrita e não lida.
    await activateNextStages("t1", "s1");

    expect(db.taskComment.createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "t1",
          userId: "gestor1",
          activeStageId: "as2",
          kind: "STAGE_INSTRUCTION",
          content: "Gravar no estúdio B",
        },
      ],
    });
  });

  it("nenhuma ativada com instrução: não chama o banco à toa", async () => {
    const { db, activateNextStages } = await setup();
    db.task.findUnique.mockResolvedValue({ createdById: "gestor1" });
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "INACTIVE" },
      ])
      .mockResolvedValueOnce([{ id: "as2", instructions: null }]);
    db.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });
    db.templateStage.findMany.mockResolvedValue(
      graph([{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }])
    );

    await activateNextStages("t1", "s1");
    expect(db.taskComment.createMany).not.toHaveBeenCalled();
  });

  it("etapa revertida e reativada: a instrução chega de novo, sem checagem de 'já entreguei'", async () => {
    // A instrução é direção para o trabalho que vem, não registro; quem refaz a etapa depois de
    // uma reversão precisa dela de novo, e a conversa do retrabalho não pode começar cega. Sem
    // este teste, alguém "conserta" a duplicata no futuro achando que é bug, e a segunda passada
    // passa a começar sem direção nenhuma. Ruling do controller: o comportamento fica.
    const { db, activateNextStages } = await setup();
    db.task.findUnique.mockResolvedValue({ createdById: "gestor1" });
    db.taskActiveStage.findMany
      .mockResolvedValueOnce([
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "INACTIVE" },
      ])
      .mockResolvedValueOnce([{ id: "as2", instructions: "Gravar no estúdio B" }])
      .mockResolvedValueOnce([
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "INACTIVE" },
      ])
      .mockResolvedValueOnce([{ id: "as2", instructions: "Gravar no estúdio B" }]);
    db.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });
    db.templateStage.findMany.mockResolvedValue(
      graph([{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }])
    );

    // Primeira passada: libera a etapa, a instrução vira comentário.
    await activateNextStages("t1", "s1");
    // Reversão devolveu a etapa a INACTIVE (fora deste teste) e o avanço seguinte a reativa —
    // mesma TaskActiveStage.id, mesma instructions.
    await activateNextStages("t1", "s1");

    const conteudoEsperado = {
      data: [
        {
          taskId: "t1",
          userId: "gestor1",
          activeStageId: "as2",
          kind: "STAGE_INSTRUCTION",
          content: "Gravar no estúdio B",
        },
      ],
    };
    expect(db.taskComment.createMany).toHaveBeenCalledTimes(2);
    expect(db.taskComment.createMany).toHaveBeenNthCalledWith(1, conteudoEsperado);
    expect(db.taskComment.createMany).toHaveBeenNthCalledWith(2, conteudoEsperado);
  });
});
