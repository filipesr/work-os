import { describe, it, expect, vi, beforeEach } from "vitest";

// createTask importa "@/auth" no topo do módulo (para getCurrentUser); sem mockar, o next-auth
// real tenta resolver "next/server" e quebra sob o ambiente de teste. Mesmo mock de
// duplicate-task.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
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
    workflowTemplate: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import { createTask } from "@/lib/actions/task";

function formulario() {
  const fd = new FormData();
  fd.set("title", "Reels institucional");
  // description é opcional na regra de negócio, mas o schema Zod só aceita ausência via
  // `undefined` — `FormData.get` de um campo nunca setado devolve `null`, que o schema rejeita.
  fd.set("description", "");
  fd.set("projectId", "p1");
  fd.set("templateId", "wt1");
  fd.set("priority", "MEDIUM");
  fd.set("dueDate", "2026-12-01");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.task.create.mockResolvedValue({ id: "t1" });
  createTaskStages.mockResolvedValue({ initialAssigned: false });
});

describe("createTask", () => {
  it("grava quem criou a demanda", async () => {
    // Sem isto a instrução da etapa não teria autor: ela é assinada por quem GEROU a demanda,
    // independente de quem venha a executar a etapa. E o sistema não guardava esse dado.
    await createTask(formulario());
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({ createdById: "gestor1" });
  });
});
