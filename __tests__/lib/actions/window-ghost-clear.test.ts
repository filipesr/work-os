import { describe, it, expect, vi, beforeEach } from "vitest";

// A janela fixa NÃO sobrevive a perder o dono nem o dia.
//
// `unscheduleStage` já limpava `scheduledStart`/`scheduledEnd` ao devolver a etapa ao poço. Estes
// dois caminhos fazem exatamente a mesma coisa por outra porta — desatribuir pela tela da tarefa, e
// a troca de time do admin — e deixavam o compromisso para trás. A etapa voltava ao poço já
// "agendada" num horário que ninguém marcou, e a próxima programação a entregava a OUTRA pessoa
// com a hora de um dia que não existe mais. Ver o comentário em `unscheduleStage`.

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(),
  requireManagerOrAdmin: vi.fn(),
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1", role: "ADMIN" }),
  getSessionUser: vi.fn().mockResolvedValue({ id: "admin1", role: "ADMIN" }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(1),
    },
    user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    task: { update: vi.fn().mockResolvedValue({}) },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { unassignActiveStage } from "@/lib/actions/task";
import { updateUserRoleAndTeams } from "@/lib/actions/user";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.taskActiveStage.findMany.mockResolvedValue([]);
  db.taskActiveStage.count.mockResolvedValue(1);
});

describe("unassignActiveStage — a janela sai junto com o responsável", () => {
  it("[CRÍTICO] devolver a etapa ao poço limpa o compromisso", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "gestor", name: "Gestor", email: "g@example.com" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    db.user.findUnique.mockResolvedValue({ role: "MANAGER" });
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "ana",
      stage: { name: "Gravação" },
      assignee: { name: "Ana", email: "ana@example.com" },
    });

    await unassignActiveStage("t1", "s1");

    expect(db.taskActiveStage.update.mock.calls[0][0].data).toMatchObject({
      assigneeId: null,
      plannedDate: null,
      plannedOrder: null,
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});

describe("updateUserRoleAndTeams — a janela sai junto com a desatribuição em massa", () => {
  it("[CRÍTICO] trocar o time da pessoa limpa o compromisso das etapas devolvidas", async () => {
    db.user.findUnique.mockResolvedValue({ teams: [{ id: "video" }] });
    db.taskActiveStage.findMany.mockResolvedValue([{ id: "as1" }]);

    const fd = new FormData();
    fd.set("id", "ana");
    fd.set("role", "MEMBER");
    fd.append("teamIds", "trafego");

    await updateUserRoleAndTeams(fd);

    expect(db.taskActiveStage.updateMany.mock.calls[0][0].data).toMatchObject({
      assigneeId: null,
      plannedDate: null,
      plannedOrder: null,
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});
