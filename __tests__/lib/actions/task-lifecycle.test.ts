import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// Devolve a própria chave: estas asserções olham o MOTIVO do erro, não o texto. O mock anterior
// (`vi.fn()` cru) devolvia undefined e quebrava assim que a action passou a traduzir de fato.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn(),
  requireMemberOrHigher: vi.fn(),
  getSessionUser: vi.fn(),
}));

// createTaskStages é observado (spy); os demais helpers não são chamados nestes testes.
const createTaskStages = vi.fn();
vi.mock("@/lib/stage-assignment-helpers", () => ({
  createTaskStages,
  parseStageAssignments: vi.fn(),
  parseSelectedStages: vi.fn(),
  isValidStageAssignee: vi.fn(),
  computeStageReadiness: vi.fn(),
}));

const txTask = { create: vi.fn().mockResolvedValue({ id: "new1" }) };
vi.mock("@/lib/prisma", () => ({
  default: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ task: txTask })),
  },
  prisma: {},
}));

import { requireManagerOrAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";

const asUser = { id: "u1", role: "MANAGER" };

describe("markTaskObsolete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireManagerOrAdmin).mockResolvedValue(asUser as never);
  });

  it("seta status OBSOLETE", async () => {
    const prisma = (await import("@/lib/prisma")).default as never as {
      task: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    };
    prisma.task.findUnique.mockResolvedValue({ id: "t1", projectId: "p1" });

    const { markTaskObsolete } = await import("@/lib/actions/task");
    const res = await markTaskObsolete("t1");

    expect(res).toEqual({ success: true });
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "OBSOLETE" },
    });
  });
});

describe("duplicateTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireManagerOrAdmin).mockResolvedValue(asUser as never);
    txTask.create.mockResolvedValue({ id: "new1" });
  });

  it("copia metadados, recria etapas incluídas e redireciona (sem comentários/artefatos)", async () => {
    const prisma = (await import("@/lib/prisma")).default as never as {
      task: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.task.findUnique.mockResolvedValue({
      title: "Campanha X",
      description: "desc",
      priority: "HIGH",
      projectId: "p1",
      activeStages: [
        { stageId: "s1", stage: { templateId: "tpl" } },
        { stageId: "s2", stage: { templateId: "tpl" } },
      ],
    });

    const { duplicateTask } = await import("@/lib/actions/task");
    // Duplicar passou a exigir a decisão de prazo: a cópia é uma demanda nova, e demanda nova
    // decide o próprio prazo (ver lib/task-due-date.ts).
    await duplicateTask("t1", {
      title: "Campanha X — outubro",
      dueDate: "2026-09-30",
      noDueDate: false,
    });

    // O título vem do diálogo. Antes a ação anexava "(cópia)" sozinha, o que só descrevia um dos
    // dois usos de duplicar — o de corrigir; para repetir o mesmo desenho noutro ciclo, o título
    // é outro.
    const created = txTask.create.mock.calls.at(-1)?.[0].data;
    expect(created).toMatchObject({
      title: "Campanha X — outubro",
      description: "desc",
      priority: "HIGH",
      status: "BACKLOG",
      projectId: "p1",
    });
    // recria as MESMAS etapas incluídas, frescas
    const stageArgs = createTaskStages.mock.calls.at(-1)?.[1];
    expect(stageArgs.taskId).toBe("new1");
    expect(stageArgs.templateId).toBe("tpl");
    expect([...stageArgs.selectedStageIds].sort()).toEqual(["s1", "s2"]);
    // redireciona para a nova tarefa
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/admin/tasks/new1");
  });

  it("erro quando a tarefa não tem etapas", async () => {
    const prisma = (await import("@/lib/prisma")).default as never as {
      task: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.task.findUnique.mockResolvedValue({
      title: "X",
      description: null,
      priority: "MEDIUM",
      projectId: "p1",
      activeStages: [],
    });
    const { duplicateTask } = await import("@/lib/actions/task");
    const res = await duplicateTask("t1");
    expect(res).toHaveProperty("error");
  });
});
