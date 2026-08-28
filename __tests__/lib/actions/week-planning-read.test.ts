import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findMany: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { getWeekPlanning } from "@/lib/actions/week-planning";
// `DEFAULT_WEEKLY_HOURS` não é mais exportado por `week-planning.ts`: um arquivo `"use server"` só
// pode exportar função assíncrona, e mesmo o re-export do valor quebrava `next build` em runtime.
// Ver lib/planning/week-capacity.ts.
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";

const db = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn> };
  taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
};

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    assigneeId: "u1",
    status: "ACTIVE",
    plannedDate: new Date("2026-08-31T00:00:00Z"), // segunda
    plannedOrder: 1,
    scheduledStart: null,
    scheduledEnd: null,
    stage: { name: "Edição" },
    task: { title: "Vídeo", project: { client: { name: "ACME" } } },
    ...over,
  };
}

describe("getWeekPlanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findMany.mockResolvedValue([{ id: "u1", name: "Ana", weeklyCapacityHours: 40 }]);
    (getStageReferences as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["s1", { hours: 2, source: "observed" }]])
    );
  });

  it("devolve os seis dias da semana, de segunda a sábado", async () => {
    // Sábado é coluna normal: o sistema não tem escala, então quem decide é o gestor.
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.days).toHaveLength(6);
    expect(r.days[0]).toBe("2026-08-31");
    expect(r.days[5]).toBe("2026-09-05");
  });

  it("agrupa os itens da pessoa por dia, com a referência aplicada", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([stageRow()]);
    const r = await getWeekPlanning("2026-08-31");
    const ana = r.people[0];
    expect(ana.byDay["2026-08-31"].slots).toHaveLength(1);
    expect(ana.byDay["2026-08-31"].usedHours).toBeCloseTo(2, 5);
  });

  it("usa a capacidade da pessoa; sem ela, cai no padrão", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: "Ana", weeklyCapacityHours: 40 },
      { id: "u2", name: "Bruno", weeklyCapacityHours: null },
    ]);
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people.find((p) => p.userId === "u1")!.weeklyHours).toBe(40);
    expect(r.people.find((p) => p.userId === "u2")!.weeklyHours).toBe(DEFAULT_WEEKLY_HOURS);
  });

  it("etapa não liberada não conta nas horas da semana", async () => {
    // Mesma regra da fila do dia, agora no acumulado: não dá para ocupar a semana de alguém com
    // trabalho que ainda não pode começar.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ id: "as1", plannedOrder: 1, status: "INACTIVE" }),
      stageRow({ id: "as2", plannedOrder: 2 }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].usedHours).toBeCloseTo(2, 5);
  });

  it("item atrasado de semana anterior aparece no primeiro dia visível", async () => {
    // Sem isto, trabalho planejado e não feito sumiria da tela na virada da semana.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ plannedDate: new Date("2026-08-20T00:00:00Z") }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].byDay["2026-08-31"].slots).toHaveLength(1);
  });

  it("o poço traz etapas ativas e sem dono", async () => {
    db.taskActiveStage.findMany.mockImplementation((args: { where?: Record<string, unknown> }) =>
      args.where?.assigneeId === null
        ? Promise.resolve([stageRow({ id: "livre", assigneeId: null, plannedDate: null })])
        : Promise.resolve([])
    );
    const r = await getWeekPlanning("2026-08-31");
    expect(r.pool.map((p) => p.id)).toEqual(["livre"]);
  });

  it("item com dia e SEM responsável continua alcançável: cai no poço", async () => {
    // A invariante "plannedDate e assigneeId andam juntos" é respeitada pelas ações desta feature,
    // mas o resto do app desatribui etapa sem saber que ela existe (o próprio responsável larga,
    // uma reversão, uma troca de time em massa). Se o poço exigisse `plannedDate: null`, a linha
    // resultante ficaria fora da grade (que descarta item sem responsável) E fora do poço: o
    // trabalho desapareceria da mesa sem volta. Este teste guarda a saída.
    db.taskActiveStage.findMany.mockImplementation((args: { where?: Record<string, unknown> }) =>
      args.where?.assigneeId === null
        ? Promise.resolve([
            stageRow({
              id: "orfa",
              assigneeId: null,
              plannedDate: new Date("2026-08-24T00:00:00Z"),
            }),
          ])
        : Promise.resolve([])
    );
    const r = await getWeekPlanning("2026-08-31");
    expect(r.pool.map((p) => p.id)).toEqual(["orfa"]);
    // E o filtro que a causaria não pode voltar por descuido.
    const wherePoco = db.taskActiveStage.findMany.mock.calls
      .map((c: [{ where?: Record<string, unknown> }]) => c[0].where)
      .find((w: Record<string, unknown> | undefined) => w?.assigneeId === null);
    expect(wherePoco).not.toHaveProperty("plannedDate");
  });

  it("recusa quem não é gestor nem admin", async () => {
    // Todos os outros testes mockam MANAGER; sem este, uma regressão que apagasse a chamada a
    // requireManagerOrAdmin passaria batido pela suíte inteira.
    (requireManagerOrAdmin as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Access Denied: Insufficient permissions.")
    );
    await expect(getWeekPlanning("2026-08-31")).rejects.toThrow(/Access Denied/i);
  });

  it("etapa agendada e liberada chega ao dia com kind scheduled", async () => {
    // O fio que faltava: select do Prisma -> QueueItemInput.scheduledStart -> classificação. A
    // tabela de classificação em si já é testada na task 2 (day-queue); aqui só confere que o
    // campo chega inteiro até lá.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ scheduledStart: new Date("2026-08-31T14:00:00Z") }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].byDay["2026-08-31"].slots[0].kind).toBe("scheduled");
  });
});
