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
    completedAt: null,
    task: {
      id: "t1",
      title: "Vídeo institucional",
      project: { name: "Institucional", client: { id: "c1", name: "Cliente A" } },
    },
    stage: { name: "Roteiro", order: 1, defaultTeam: null },
    team: null,
    assignee: { name: "Filipe Salvarez Rezende", email: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Duas consultas agora: as linhas da semana e as etapas restantes das demandas em tela.
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
});

describe("getClientLoad", () => {
  it("MEMBER é recusado", async () => {
    vi.mocked(requireManagerOrAdmin).mockRejectedValueOnce(new Error("Access Denied"));
    await expect(getClientLoad(SEGUNDA)).rejects.toThrow(/Access Denied/i);
  });

  it("agrupa por cliente, por dia e por demanda", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row(),
        row({ id: "as2", stageId: "s2", stage: { name: "Edição", order: 2 } }),
        row({
          id: "as3",
          plannedDate: new Date("2026-09-09T00:00:00Z"),
          task: {
            id: "t2",
            title: "Campanha",
            project: { name: "Setembro", client: { id: "c2", name: "Cliente B" } },
          },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const a = carga.clients.find((c) => c.clientId === "c1")!;
      const dia = a.byDay["2026-09-08"];
      // Uma demanda só, com as duas etapas dentro dela.
      expect(dia.tasks).toHaveLength(1);
      expect(dia.tasks[0].taskTitle).toBe("Vídeo institucional");
      expect(dia.tasks[0].stages.map((e) => e.stageName)).toEqual(["Roteiro", "Edição"]);
      expect(dia.pendingHours).toBe(5);
      expect(a.totalPending).toBe(5);
      const b = carga.clients.find((c) => c.clientId === "c2")!;
      expect(b.byDay["2026-09-09"].tasks).toHaveLength(1);
    });
  });

  it("etapa concluída conta como FEITO, no dia em que fechou", () => {
    // Sem isto a carga do cliente ENCOLHE conforme a semana avança: sexta mostra menos que
    // segunda, e quem mais entregou aparece como quem menos ocupou.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          status: "COMPLETED",
          plannedDate: null,
          completedAt: new Date("2026-09-09T13:00:00Z"),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const a = carga.clients[0];
      expect(a.byDay["2026-09-09"].doneHours).toBe(2);
      expect(a.byDay["2026-09-09"].tasks[0].stages[0].state).toBe("done");
      expect(a.totalDone).toBe(2);
      expect(a.totalPending).toBe(0);
    });
  });

  it("a consulta busca também as concluídas da semana", () => {
    return getClientLoad(SEGUNDA).then(() => {
      const or = (
        vi.mocked(prisma.taskActiveStage.findMany).mock.calls[0][0] as never as {
          where: { OR: Record<string, unknown>[] };
        }
      ).where.OR;
      expect(or.some((r) => r.status === "COMPLETED" && r.completedAt)).toBe(true);
    });
  });

  it("o total do cliente é a soma das células dele", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row(),
        row({ id: "as2", plannedDate: new Date("2026-09-10T00:00:00Z") }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const a = carga.clients[0];
      const soma = carga.days.reduce(
        (acc, d) => acc + a.byDay[d].doneHours + a.byDay[d].pendingHours,
        0
      );
      expect(a.totalDone + a.totalPending).toBe(soma);
    });
  });

  it("etapa não liberada aparece na lista mas não soma — a mesma regra da mesa", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ status: "INACTIVE" })] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dia = carga.clients[0].byDay["2026-09-08"];
      expect(dia.tasks[0].stages[0].state).toBe("waiting");
      expect(dia.pendingHours).toBe(0);
      expect(dia.doneHours).toBe(0);
    });
  });

  it("clientes vêm ordenados do que mais pega a semana para o que menos", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({ id: "as1", stageId: "s1" }),
        row({
          id: "as2",
          stageId: "s2",
          task: {
            id: "t2",
            title: "B",
            project: { name: "P", client: { id: "c2", name: "B" } },
          },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients.map((c) => c.clientId)).toEqual(["c2", "c1"]);
    });
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

  it("etapa sem responsável cai no nome da EQUIPE efetiva", () => {
    // A etapa coringa não tem time padrão: o time dela foi escolhido na criação e mora na linha.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          assignee: null,
          team: { name: "Vídeo" },
          stage: { name: "Roteiro", order: 1, defaultTeam: null },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-08"].tasks[0].stages[0].assigneeName).toBe("Vídeo");
    });
  });

  it("sem responsável e sem time, a linha diz que ninguém assumiu", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          assignee: null,
          team: null,
          stage: { name: "Roteiro", order: 1, defaultTeam: null },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      // `null` é a ausência; quem escreve "não atribuído" é a tela, no idioma de quem lê.
      expect(carga.clients[0].byDay["2026-09-08"].tasks[0].stages[0].assigneeName).toBeNull();
    });
  });

  it("traz as etapas restantes da demanda, ancoradas no primeiro dia dela", () => {
    // Fechar a demanda inteira na célula: sem isto, a leitura mostrava só o pedaço com dia e o
    // gestor não via o tamanho do que ainda vem pela frente.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row()] as never)
      .mockResolvedValueOnce([
        row({
          id: "as9",
          stageId: "s9",
          status: "INACTIVE",
          plannedDate: null,
          assignee: null,
          team: null,
          stage: { name: "Aprovação", order: 3, defaultTeam: { name: "Atendimento" } },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const bloco = carga.clients[0].byDay["2026-09-08"].tasks[0];
      expect(bloco.stages.map((e) => e.stageName)).toEqual(["Roteiro", "Aprovação"]);
      const restante = bloco.stages[1];
      expect(restante.state).toBe("waiting");
      expect(restante.assigneeName).toBe("Atendimento");
      // Não liberada não soma, aqui como em toda tela.
      expect(bloco.pendingHours).toBe(2);
    });
  });
});
