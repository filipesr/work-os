import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { task: { findMany: vi.fn() } },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getMonthlyCalendarDemands } from "@/lib/actions/reporting";

const db = vi.mocked(prisma, true);
const RANGE = { start: new Date("2026-08-01"), end: new Date("2026-08-31") };

const whereOf = () => db.task.findMany.mock.calls[0][0]!.where!;

describe("getMonthlyCalendarDemands — filtros da visão de mês", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.task.findMany.mockResolvedValue([] as never);
  });

  it("por padrão esconde CANCELLED e COMPLETED", async () => {
    // Antes o mês só excluía CANCELLED e sempre mostrava o concluído, então a
    // grade entulhava do que já saiu e escondia o que ainda precisa de atenção.
    await getMonthlyCalendarDemands(RANGE);
    expect(whereOf().status).toEqual({ notIn: ["CANCELLED", "COMPLETED"] });
  });

  it("showCompleted traz o concluído de volta, mas nunca o cancelado", async () => {
    await getMonthlyCalendarDemands(RANGE, { showCompleted: true });
    expect(whereOf().status).toEqual({ notIn: ["CANCELLED"] });
  });

  it("filtra por projeto direto na tarefa", async () => {
    await getMonthlyCalendarDemands(RANGE, { projectId: "p1" });
    expect(whereOf().projectId).toBe("p1");
  });

  it("escopo de time é pela etapa ABERTA, como na semana", async () => {
    // Onde o trabalho está agora — não onde já passou. Filtrar por etapa
    // concluída traria de volta tarefas que o time já entregou.
    await getMonthlyCalendarDemands(RANGE, { teamId: "t1" });
    // Time EFETIVO: etapa com time no template OU coringa roteada para ele na
    // criação. Sem o segundo ramo a etapa coringa sumiria do calendário.
    expect(whereOf().activeStages).toEqual({
      some: {
        status: { in: ["ACTIVE", "BLOCKED"] },
        OR: [
          { teamId: { in: ["t1"] } },
          { teamId: null, stage: { defaultTeamId: { in: ["t1"] } } },
        ],
      },
    });
  });

  it("escopo de pessoa é pela etapa aberta atribuída a ela", async () => {
    await getMonthlyCalendarDemands(RANGE, { userId: "u1" });
    expect(whereOf().activeStages).toEqual({
      some: { status: { in: ["ACTIVE", "BLOCKED"] }, assigneeId: "u1" },
    });
  });

  it("time e pessoa juntos recaem sobre a MESMA etapa aberta", async () => {
    // Dois `some` separados casariam com etapas diferentes — "o time X tem uma
    // etapa aberta E a pessoa Y tem outra", que não é o que o filtro promete.
    await getMonthlyCalendarDemands(RANGE, { teamId: "t1", userId: "u1" });
    expect(whereOf().activeStages).toEqual({
      some: {
        status: { in: ["ACTIVE", "BLOCKED"] },
        OR: [
          { teamId: { in: ["t1"] } },
          { teamId: null, stage: { defaultTeamId: { in: ["t1"] } } },
        ],
        assigneeId: "u1",
      },
    });
  });

  it("sem filtro de time/pessoa não restringe por etapa", async () => {
    await getMonthlyCalendarDemands(RANGE, { projectId: "p1" });
    expect(whereOf()).not.toHaveProperty("activeStages");
  });

  it("mantém a janela de vencimento do período", async () => {
    await getMonthlyCalendarDemands(RANGE);
    expect(whereOf().dueDate).toEqual({ gte: RANGE.start, lte: RANGE.end });
  });
});
