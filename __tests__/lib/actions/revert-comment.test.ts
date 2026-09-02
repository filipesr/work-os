import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A action traduz via chave + parâmetros. O mock devolve "chave:paramsJSON" — nunca uma frase —
  // para que nenhuma palavra do corpo possa vir do código, só do locale (que aqui nem é lido).
  getTranslations: vi
    .fn()
    .mockResolvedValue((k: string, params?: Record<string, unknown>) =>
      params ? `${k}:${JSON.stringify(params)}` : k
    ),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi
    .fn()
    .mockResolvedValue({ id: "ana", role: "ADMIN", email: "ana@x.com" }),
  requireManagerOrAdmin: vi.fn(),
  getSessionUser: vi.fn(),
}));

// `db` cobre a etapa-alvo já reativada (id "as2") — é dela que `linhaAlvo.id` precisa sair,
// porque a transação já faz esse UPDATE antes de criar o comentário.
const db = {
  taskStageLog: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
  taskActiveStage: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ assigneeId: null }),
    updateMany: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ id: "as2" }),
  },
  taskComment: { create: vi.fn().mockResolvedValue({}) },
  task: { update: vi.fn().mockResolvedValue({}) },
  stageTransition: {
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  },
  reworkEvent: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: { findUnique: vi.fn() },
    taskActiveStage: { findMany: vi.fn(), findUnique: vi.fn() },
    taskStageLog: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof db) => Promise<unknown>) => cb(db)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { revertTaskStage } from "@/lib/actions/task";

const fora = prisma as unknown as {
  templateStage: { findUnique: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

function setupValidRevert() {
  // Alvo da reversão: etapa "s2" (ordem 1) — anterior à etapa em andamento "s3" (ordem 3).
  fora.templateStage.findUnique.mockResolvedValue({
    id: "s2",
    order: 1,
    name: "Design",
    template: {},
    defaultTeam: null,
  });
  fora.taskActiveStage.findMany.mockResolvedValue([
    { stageId: "s3", assigneeId: "ana", stage: { id: "s3", order: 3, name: "QC" } },
  ]);
  fora.user.findUnique.mockResolvedValue({ role: "ADMIN", name: "Ana" });
  // A etapa-alvo faz parte da tarefa (guarda de linha existente, fora da transação).
  fora.taskActiveStage.findUnique.mockResolvedValue({ id: "as2" });
}

describe("revertTaskStage — comentário da reversão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(db).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    );
    setupValidRevert();
  });

  it("o comentário da reversão é INSTRUÇÃO da etapa que volta, assinada por quem reverteu", async () => {
    // Simetria com a etapa coringa: coringa → instrução de quem criou a demanda; retrabalho →
    // instrução de quem reverteu. Quem vai refazer precisa do motivo no lugar onde vai trabalhar.
    await revertTaskStage("t1", "s2", "faltou o off do final", "INTERNAL");

    const criado = db.taskComment.create.mock.calls[0][0].data;
    expect(criado).toMatchObject({
      taskId: "t1",
      userId: "ana",
      activeStageId: "as2",
      kind: "STAGE_INSTRUCTION",
    });
    expect(criado.content).toContain("faltou o off do final");
  });

  it("NENHUMA palavra do corpo vem do código", async () => {
    // O corpo de hoje traz "**TAREFA REVERTIDA** por", "De:", "Para:", "**Motivo:**" e "Data:"
    // cravados na action, mais uma data formatada em pt-BR para quem lê em espanhol. Este teste é o
    // que impede a volta: o mock de i18n devolve a CHAVE, então nenhuma frase pode sobreviver nele.
    await revertTaskStage("t1", "s2", "faltou o off", "INTERNAL");

    const { content } = db.taskComment.create.mock.calls[0][0].data;
    for (const cravada of ["TAREFA REVERTIDA", "De:", "Para:", "Motivo:", "Data:"]) {
      expect(content).not.toContain(cravada);
    }
  });
});
