import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi.fn().mockResolvedValue(
    new Map([
      ["s1", { hours: 2, source: "observed" }],
      ["s2", { hours: 3, source: "declared" }],
    ])
  ),
}));
vi.mock("@/lib/prisma", () => ({
  default: { taskActiveStage: { findMany: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";

const SEGUNDA = "2026-09-07";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-08T00:00:00Z"),
    plannedOrder: 1,
    scheduledStart: null,
    task: { project: { client: { id: "c1", name: "Cliente A" } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
});

describe("getClientLoad", () => {
  it("MEMBER é recusado", async () => {
    vi.mocked(requireManagerOrAdmin).mockRejectedValueOnce(new Error("Access Denied"));
    await expect(getClientLoad(SEGUNDA)).rejects.toThrow(/Access Denied/i);
  });

  it("agrupa por cliente e por dia", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row(),
      row({ id: "as2", stageId: "s2" }),
      row({
        id: "as3",
        plannedDate: new Date("2026-09-09T00:00:00Z"),
        task: { project: { client: { id: "c2", name: "Cliente B" } } },
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    const a = carga.clients.find((c) => c.clientId === "c1")!;
    expect(a.byDay["2026-09-08"]).toEqual({ hours: 5, count: 2 });
    expect(a.totalHours).toBe(5);
    expect(a.totalCount).toBe(2);
    const b = carga.clients.find((c) => c.clientId === "c2")!;
    expect(b.byDay["2026-09-09"].count).toBe(1);
  });

  it("o total do cliente é a soma das células dele", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row(),
      row({ id: "as2", plannedDate: new Date("2026-09-10T00:00:00Z") }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    const a = carga.clients[0];
    const somaDasCelulas = carga.days.reduce((acc, d) => acc + (a.byDay[d]?.hours ?? 0), 0);
    expect(a.totalHours).toBe(somaDasCelulas);
  });

  it("etapa não liberada não soma horas — a mesma regra da mesa", async () => {
    // `buildDayQueue` classifica INACTIVE como "waiting": visível, mas sem consumir capacidade.
    // Se somasse aqui, o mesmo cliente teria números diferentes nas duas telas.
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row({ status: "INACTIVE" }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients[0].totalHours).toBe(0);
    expect(carga.clients[0].totalCount).toBe(1);
  });

  it("clientes vêm ordenados do que mais pega a semana para o que menos", async () => {
    vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([
      row({ id: "as1", stageId: "s1", task: { project: { client: { id: "c1", name: "A" } } } }),
      row({ id: "as2", stageId: "s2", task: { project: { client: { id: "c2", name: "B" } } } }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients.map((c) => c.clientId)).toEqual(["c2", "c1"]);
  });

  it("o filtro de time entra na consulta quando informado", async () => {
    await getClientLoad(SEGUNDA, "time1");
    const where = (
      vi.mocked(prisma.taskActiveStage.findMany).mock.calls[0][0] as never as {
        where: Record<string, unknown>;
      }
    ).where;
    expect(where.assignee).toBeDefined();
  });

  it("demanda descartada não ocupa dia na carga do cliente", () => {
    // "Marcar obsoleta" promete que a demanda sai dos pendentes. Sem esta condição a grade
    // continuava reservando espaço para trabalho que ninguém vai fazer.
    return getClientLoad(SEGUNDA).then(() => {
      const where = (
        vi.mocked(prisma.taskActiveStage.findMany).mock.calls[0][0] as never as {
          where: { task?: { status?: unknown } };
        }
      ).where;
      expect(where.task?.status).toEqual({ notIn: ["OBSOLETE", "CANCELLED"] });
    });
  });
});
