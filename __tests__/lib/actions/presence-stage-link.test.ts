import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/presence-access", () => ({ requirePresenceRead: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/activity-close", () => ({ closeActivityLog: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    activityLog: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getActiveWorkLogs } from "@/lib/actions/activity";

const db = prisma as unknown as {
  activityLog: { findMany: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
};

/** Um log aberto, como `getActiveWorkLogs` o traz do banco. */
function logAberto(taskId: string, stageId: string) {
  return {
    id: `log-${taskId}`,
    startedAt: new Date("2026-09-14T12:00:00Z"),
    endedAt: null,
    userId: "u1",
    taskId,
    stageId,
    user: { id: "u1", name: "Ana", email: "ana@x.com", image: null },
    task: {
      id: taskId,
      title: "Arte do carrossel",
      project: { id: "p1", name: "Projeto", client: { name: "Cliente" } },
    },
    stage: { id: stageId, name: "Desenho" },
  };
}

describe("getActiveWorkLogs — o card de presença precisa da INSTÂNCIA da etapa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolve (taskId, stageId) para o id da instância, numa consulta em lote", async () => {
    // `ActivityLog.stageId` aponta para o TEMPLATE da etapa, não para a instância — e o card só
    // consegue linkar para /tasks/{id}/stages/{activeStageId} se tiver a instância. O par
    // (taskId, stageId) é @@unique em TaskActiveStage, então resolve para exatamente uma: não há
    // ambiguidade a desempatar, e por isso a resolução pode ser em lote em vez de uma busca por
    // card.
    db.activityLog.findMany.mockResolvedValue([
      logAberto("t1", "s-desenho"),
      logAberto("t2", "s-revisao"),
    ]);
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as-1", taskId: "t1", stageId: "s-desenho" },
      { id: "as-2", taskId: "t2", stageId: "s-revisao" },
    ]);

    const logs = await getActiveWorkLogs();

    expect(logs.map((l) => l.activeStageId)).toEqual(["as-1", "as-2"]);
    // UMA consulta para todos os logs, não uma por log: são dezenas de pessoas trabalhando ao
    // mesmo tempo, e uma busca por card devolveria o N+1 pela porta dos fundos.
    expect(db.taskActiveStage.findMany).toHaveBeenCalledTimes(1);
    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { taskId: "t1", stageId: "s-desenho" },
        { taskId: "t2", stageId: "s-revisao" },
      ],
    });
  });

  it("sem instância correspondente, o campo é null — e o card cai na demanda", async () => {
    // Um log antigo pode apontar para uma etapa que a demanda não tem mais. Inventar um id ali
    // levaria a pessoa a uma tela 404; devolver null deixa o card manter o link para a demanda,
    // que é o destino correto quando a etapa não existe.
    db.activityLog.findMany.mockResolvedValue([logAberto("t1", "s-sumiu")]);
    db.taskActiveStage.findMany.mockResolvedValue([]);

    const logs = await getActiveWorkLogs();

    expect(logs[0].activeStageId).toBeNull();
  });

  it("sem nenhum log aberto, não consulta instância nenhuma", async () => {
    // Ninguém trabalhando é o estado da madrugada, e o board recarrega a cada 10s. Uma consulta
    // com `OR: []` — que no Prisma não casa com nada — seria uma ida ao banco por nada.
    db.activityLog.findMany.mockResolvedValue([]);

    const logs = await getActiveWorkLogs();

    expect(logs).toEqual([]);
    expect(db.taskActiveStage.findMany).not.toHaveBeenCalled();
  });
});
