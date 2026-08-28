import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Reivindicar uma etapa é o caminho canônico de atribuição — e o poço é COMPARTILHADO.
 *
 * Ana e Bruno, do mesmo time, veem a mesma etapa livre e clicam quase juntos. Com uma leitura
 * seguida de uma escrita por `id`, as duas checagens passam, os dois recebem "etapa assumida" e a
 * etapa fica com quem escreveu por último: o outro atualiza a tela e o trabalho sumiu, sem uma
 * linha dizendo o que aconteceu. Por isso as condições viajam no `where` da escrita — o árbitro é
 * o banco, não o intervalo entre as duas consultas.
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: { create: vi.fn().mockResolvedValue({}) },
  },
  prisma: {},
}));

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { claimActiveStage } from "@/lib/actions/task";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "ana", name: "Ana", email: "ana@example.com", role: "MEMBER" },
  } as never);
  vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: null,
    stage: { id: "s1", name: "Edição", wipLimit: null },
  } as never);
  vi.mocked(prisma.taskActiveStage.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.task.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("claimActiveStage", () => {
  it("atribui com as condições no where — quem decide o empate é o banco", async () => {
    expect(await claimActiveStage("t1", "s1")).toEqual({ success: true });

    const args = vi.mocked(prisma.taskActiveStage.updateMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { assigneeId: string };
    };
    // As MESMAS condições que a leitura conferiu. Sem elas no `where`, a escrita venceria mesmo
    // depois de outra pessoa já ter levado a etapa.
    expect(args.where).toEqual({ id: "as1", assigneeId: null, status: "ACTIVE" });
    expect(args.data.assigneeId).toBe("ana");

    // E o resto do que reivindicar significa continua acontecendo: log ABERTO da etapa (de onde sai
    // o `activeSince` do envelhecimento) e carimbo write-once de início da tarefa.
    expect(prisma.taskStageLog.create).toHaveBeenCalled();
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", startedAt: null } })
    );
  });

  it("na corrida, quem perde recebe recusa — e nada mais é escrito", async () => {
    // `count: 0` = alguma condição deixou de valer entre a leitura e a escrita. Na prática: alguém
    // chegou antes.
    vi.mocked(prisma.taskActiveStage.updateMany).mockResolvedValue({ count: 0 } as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "stageAlreadyAssigned" });

    // Sem esta parada, o perdedor da corrida promovia a tarefa, carimbava o início e abria um log
    // de etapa em nome de trabalho que é de outra pessoa.
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskStageLog.create).not.toHaveBeenCalled();
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
  });

  it("recusa quando a etapa já tem responsável, antes de tentar escrever", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: "bruno",
      stage: { id: "s1", name: "Edição", wipLimit: null },
    } as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "stageAlreadyAssigned" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("recusa no limite de WIP — o limite existe como restrição de PULL", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      stage: { id: "s1", name: "Edição", wipLimit: 2 },
    } as never);
    vi.mocked(prisma.taskActiveStage.count).mockResolvedValue(2 as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "wipLimitReached" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });
});
