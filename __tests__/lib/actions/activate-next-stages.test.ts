import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks required for task.ts to load in the test environment
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
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
  },
  prisma: {},
}));

// activateNextStages now: marks the completed row COMPLETED, loads the task's
// rows (= the INCLUDED stages), loads the full template graph, and recomputes
// readiness via computeStageReadiness. A prerequisite with NO row for the task
// (excluded/optional-off) counts as satisfied → pass-through. Transitions are
// written with updateMany({ where: { taskId, stageId }, data: { status } }) —
// never touching assigneeId.

type Node = { id: string; name?: string; dependsOn?: string[] };
function graph(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name ?? n.id,
    // ATENÇÃO ao nome: em `TemplateStage`, os PRÉ-REQUISITOS da etapa vivem em `dependents`
    // (as linhas em que ela é a dependente). `dependencies` é a relação INVERSA — quem depende
    // dela. O mock antigo montava `dependencies` com o sentido intuitivo, então reproduzia o
    // engano do código de produção e os testes passavam com o fluxo quebrado.
    dependents: (n.dependsOn ?? []).map((d) => ({ dependsOnStageId: d })),
    defaultTeam: null,
  }));
}

// Transition writes = updateMany calls that are NOT the completed-mark (the mark
// carries `where.status: "ACTIVE"`).
function transitionCalls(prisma: {
  taskActiveStage: {
    updateMany: {
      mock: {
        calls: [{ where: { stageId?: string; status?: string }; data: { status: string } }][];
      };
    };
  };
}) {
  return prisma.taskActiveStage.updateMany.mock.calls
    .map((c) => c[0])
    .filter((a) => a.where.status === undefined);
}

async function run(
  rows: { stageId: string; status: string }[],
  nodes: Node[],
  completedStageId = "s1"
) {
  const prisma = (await import("@/lib/prisma")).default as never as {
    taskActiveStage: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    templateStage: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };
  prisma.taskActiveStage.findMany.mockResolvedValue(rows);
  prisma.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });
  prisma.templateStage.findMany.mockResolvedValue(graph(nodes));
  const { activateNextStages } = await import("@/lib/actions/task");
  const result = await activateNextStages("task1", completedStageId);
  return { prisma, result };
}

describe("activateNextStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ativa dependente pronto sem tocar assigneeId", async () => {
    const { prisma, result } = await run(
      [
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "INACTIVE" },
      ],
      [{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }]
    );
    const t = transitionCalls(prisma as never);
    const s2 = t.find((c) => c.where.stageId === "s2");
    expect(s2?.data).toEqual({ status: "ACTIVE" }); // sem assigneeId
    expect(result.activated.map((s) => s.id)).toEqual(["s2"]);
  });

  it("não regride etapa já ACTIVE", async () => {
    const { prisma, result } = await run(
      [
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "ACTIVE" },
      ],
      [{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }]
    );
    expect(transitionCalls(prisma as never).some((c) => c.where.stageId === "s2")).toBe(false);
    expect(result.activated).toHaveLength(0);
  });

  it("não regride etapa já COMPLETED", async () => {
    const { prisma } = await run(
      [
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s2", status: "COMPLETED" },
      ],
      [{ id: "s1" }, { id: "s2", dependsOn: ["s1"] }]
    );
    expect(transitionCalls(prisma as never).some((c) => c.where.stageId === "s2")).toBe(false);
  });

  it("deps incompletas → BLOCKED e aparece em blocked", async () => {
    const { prisma, result } = await run(
      [
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s_other", status: "ACTIVE" },
        { stageId: "s2", status: "INACTIVE" },
      ],
      [{ id: "s1" }, { id: "s_other" }, { id: "s2", dependsOn: ["s1", "s_other"] }]
    );
    const s2 = transitionCalls(prisma as never).find((c) => c.where.stageId === "s2");
    expect(s2?.data).toEqual({ status: "BLOCKED", blockedAt: expect.any(Date) });
    expect(result.blocked.map((s) => s.id)).toEqual(["s2"]);
    expect(result.activated).toHaveLength(0);
  });

  it("BLOCKED→BLOCKED: sem mudança — nenhuma escrita nem entrada em blocked", async () => {
    const { prisma, result } = await run(
      [
        { stageId: "s1", status: "COMPLETED" },
        { stageId: "s_other", status: "ACTIVE" },
        { stageId: "s2", status: "BLOCKED" },
      ],
      [{ id: "s1" }, { id: "s_other" }, { id: "s2", dependsOn: ["s1", "s_other"] }]
    );
    expect(transitionCalls(prisma as never).some((c) => c.where.stageId === "s2")).toBe(false);
    expect(result.blocked).toHaveLength(0);
    expect(result.activated).toHaveLength(0);
  });

  it("pass-through: etapa B excluída (sem linha) → concluir A ativa C", async () => {
    const { prisma, result } = await run(
      [
        { stageId: "A", status: "COMPLETED" },
        { stageId: "C", status: "INACTIVE" }, // B não tem linha (excluída)
      ],
      [{ id: "A" }, { id: "B", dependsOn: ["A"] }, { id: "C", dependsOn: ["B"] }],
      "A"
    );
    const c = transitionCalls(prisma as never).find((x) => x.where.stageId === "C");
    expect(c?.data).toEqual({ status: "ACTIVE" });
    expect(result.activated.map((s) => s.id)).toEqual(["C"]);
  });
});
