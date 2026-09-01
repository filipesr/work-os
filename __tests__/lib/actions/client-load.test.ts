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
  default: { taskActiveStage: { findMany: vi.fn() }, timeLog: { findMany: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";

const SEGUNDA = "2026-09-07";

function tarefa(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Vídeo institucional",
    dueDate: null,
    project: { name: "Institucional", client: { id: "c1", name: "Cliente A" } },
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-08T00:00:00Z"),
    completedAt: null,
    task: tarefa(),
    stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
    team: null,
    assignee: { name: "Filipe Salvarez Rezende", email: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Duas consultas agora: as linhas da semana e as etapas restantes das demandas em tela.
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);
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
        row({ id: "as2", stageId: "s2", stage: { name: "Edição", order: 2, dependents: [] } }),
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
    // O realizado agora vem do apontamento, não da referência — ver a suíte de "o realizado vem
    // do apontamento" logo abaixo. Aqui a pessoa apontou exatamente a referência (2h).
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 2, logDate: new Date("2026-09-09T13:00:00Z") },
    ] as never);

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
          stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
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
          stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      // `null` é a ausência; quem escreve "não atribuído" é a tela, no idioma de quem lê.
      expect(carga.clients[0].byDay["2026-09-08"].tasks[0].stages[0].assigneeName).toBeNull();
    });
  });

  it("traz as etapas restantes da demanda, mesmo sem depender da que já tem dia", () => {
    // Fechar a demanda inteira na célula: sem isto, a leitura mostrava só o pedaço com dia e o
    // gestor não via o tamanho do que ainda vem pela frente. Antes da Task 3 as restantes se
    // ancoravam no primeiro dia da demanda; agora quem não depende de nada projeta pela âncora
    // (hoje, ou o primeiro dia visível), então pode cair num dia diferente do de "Roteiro".
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
          stage: {
            name: "Aprovação",
            order: 3,
            defaultTeam: { name: "Atendimento" },
            dependents: [],
          },
        }),
      ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dias = carga.clients[0].byDay;
      // "Roteiro" tem dia planejado (segunda-feira da linha de base é 2026-09-08); "Aprovação" não
      // depende dela, então projeta pela âncora — o primeiro dia visível da semana, já que hoje
      // está fora dela.
      expect(dias["2026-09-08"].tasks[0].stages.map((e) => e.stageName)).toEqual(["Roteiro"]);
      const restante = dias["2026-09-07"].tasks[0].stages[0];
      expect(restante.stageName).toBe("Aprovação");
      expect(restante.state).toBe("waiting");
      expect(restante.assigneeName).toBe("Atendimento");
      // Não liberada não soma, aqui como em toda tela.
      expect(dias["2026-09-07"].tasks[0].pendingHours).toBe(0);
      expect(dias["2026-09-08"].tasks[0].pendingHours).toBe(2);
    });
  });

  it("o realizado do dia vem do APONTAMENTO, não da referência", () => {
    // A etapa vale 2h de referência, mas só 1,5h foram trabalhadas naquele dia. A célula mostra o
    // que aconteceu, não o que se esperava.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          status: "COMPLETED",
          plannedDate: null,
          completedAt: new Date("2026-09-09T13:00:00Z"),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 1.5, logDate: new Date("2026-09-09T16:00:00Z") },
    ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-09"].doneHours).toBe(1.5);
    });
  });

  it("etapa concluída SEM apontamento conta zero — não se preenche o passado com estimativa", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          status: "COMPLETED",
          plannedDate: null,
          completedAt: new Date("2026-09-09T13:00:00Z"),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-09"].doneHours).toBe(0);
      expect(carga.clients[0].totalDone).toBe(0);
    });
  });

  it("apontamento aparece no dia em que foi trabalhado, mesmo em etapa não concluída", () => {
    // "Trabalhei 2h ontem e não terminei": as 2h ficam em ontem, e o que falta segue adiante.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 0.5, logDate: new Date("2026-09-08T16:00:00Z") },
    ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-08"].doneHours).toBe(0.5);
      // O pendente é o que falta da referência (2h): 1,5h.
      expect(carga.clients[0].byDay["2026-09-09"].pendingHours).toBe(1.5);
    });
  });

  it("apontamento maior que a referência não vira pendente negativo", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 9, logDate: new Date("2026-09-08T16:00:00Z") },
    ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-09"].pendingHours).toBe(0);
    });
  });

  it("estimated marca quando a referência é declarada, não observada", () => {
    // s1 é "observed" e s2 é "declared" no mock de getStageReferences — a tela avisa a diferença.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({ id: "as1", stageId: "s1" }),
        row({ id: "as2", stageId: "s2", stage: { name: "Edição", order: 2, dependents: [] } }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const stages = carga.clients[0].byDay["2026-09-08"].tasks[0].stages;
      expect(stages.find((e) => e.id === "as1")?.estimated).toBe(false);
      expect(stages.find((e) => e.id === "as2")?.estimated).toBe(true);
    });
  });

  it("a segunda etapa cai no dia seguinte, não junto da primeira", () => {
    // Era a âncora antiga: tudo no primeiro dia da demanda, como se as etapas fossem simultâneas.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({ id: "as1", stageId: "s1", plannedDate: new Date("2026-09-08T00:00:00Z") }),
      ] as never)
      .mockResolvedValueOnce([
        row({
          id: "as2",
          stageId: "s2",
          status: "INACTIVE",
          plannedDate: null,
          stage: {
            name: "Edição",
            order: 2,
            defaultTeam: null,
            dependents: [{ dependsOnStageId: "s1" }],
          },
        }),
      ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dias = carga.clients[0].byDay;
      expect(dias["2026-09-08"].tasks[0].stages.map((e) => e.id)).toEqual(["as1"]);
      expect(dias["2026-09-09"].tasks[0].stages.map((e) => e.id)).toEqual(["as2"]);
    });
  });

  it("a demanda NÃO aparece em dia sem nada", () => {
    // Era o defeito da âncora antiga por outro ângulo: a demanda ocupando dias em que não há nem
    // trabalho registrado nem trabalho projetado.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dias = carga.clients[0].byDay;
      expect(dias["2026-09-09"].tasks).toHaveLength(1);
      for (const outro of ["2026-09-07", "2026-09-08", "2026-09-10", "2026-09-11", "2026-09-12"]) {
        expect(dias[outro].tasks).toHaveLength(0);
      }
    });
  });

  it("o vencimento vem no bloco, para explicar o empilhamento", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          plannedDate: new Date("2026-09-08T00:00:00Z"),
          task: tarefa({ dueDate: new Date("2026-09-10T00:00:00Z") }),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const bloco = carga.clients[0].byDay["2026-09-08"].tasks[0];
      expect(bloco.dueDateISO).toBe("2026-09-10");
      expect(bloco.overdue).toBe(false);
    });
  });
});
