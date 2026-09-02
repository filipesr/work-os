import { describe, it, expect, vi, beforeEach } from "vitest";

// createTasksBatch está no mesmo módulo que createTask, que importa "@/auth" no topo (para
// getCurrentUser); sem mockar, o next-auth real tenta resolver "next/server" e quebra sob o
// ambiente de teste. Mesmo mock de duplicate-task.test.ts / create-task-creator.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
  requireManagerOrAdmin: vi.fn(),
  getSessionUser: vi.fn(),
}));

const { createTaskStages } = vi.hoisted(() => ({ createTaskStages: vi.fn() }));
vi.mock("@/lib/stage-assignment-helpers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createTaskStages,
}));

const tx = { task: { create: vi.fn().mockResolvedValue({ id: "t1" }) } };
vi.mock("@/lib/prisma", () => ({
  default: {
    project: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { createTasksBatch } from "@/lib/actions/task";

const db = prisma as unknown as { project: { findMany: ReturnType<typeof vi.fn> } };

describe("createTasksBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.task.create.mockResolvedValue({ id: "t1" });
    createTaskStages.mockResolvedValue({ initialAssigned: false });
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
  });

  it("grava quem disparou o lote como autor de cada demanda criada", async () => {
    // Hoje este caminho não repassa teams/instructions, então nenhuma instrução fica sem dono —
    // mas a demanda ainda precisa nascer com autor: a promessa é "toda demanda nova", sem
    // exceção por caminho de criação, e este é o que evita a dívida silenciosa do dia em que o
    // lote passar a repassar instruções.
    await createTasksBatch({
      projectIds: ["p1", "p2"],
      templateId: "wt1",
      title: "LP de Páscoa",
      dueDate: "2026-12-01",
    });

    expect(tx.task.create).toHaveBeenCalledTimes(2);
    for (const call of tx.task.create.mock.calls) {
      expect(call[0].data).toMatchObject({ createdById: "gestor1" });
    }
  });
});
