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
      ["s3", { hours: 4, source: "observed" }],
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
    status: "IN_PROGRESS",
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

  it("etapa não liberada aparece na lista E SOMA — aqui a pergunta é outra que a da mesa", () => {
    // A mesa esconde da SOMA o que ninguém pode começar, porque lá a pergunta é "o que dá para
    // fazer agora". Aqui a pergunta é "quanto desta semana este cliente ocupa", e a projeção existe
    // para mostrar o que VEM — que é, por definição, ainda não liberado. `state` continua dizendo
    // que ela espera; o que ela não faz é sumir do total.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ status: "INACTIVE" })] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dia = carga.clients[0].byDay["2026-09-08"];
      expect(dia.tasks[0].stages[0].state).toBe("waiting");
      expect(dia.pendingHours).toBe(2);
      expect(dia.doneHours).toBe(0);
    });
  });

  it("cadeia sequencial: o pendente das INACTIVE atrás da ACTIVE chega ao total", () => {
    // O defeito que anulava a feature: numa cadeia normal só a PRIMEIRA etapa é ACTIVE, e a soma
    // só aceitava ACTIVE. A projeção espalhava 9h pela semana e o cabeçalho da linha dizia 2h —
    // o total contradizendo o próprio conteúdo da célula.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({ id: "as1", stageId: "s1", plannedDate: new Date("2026-09-07T00:00:00Z") }),
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
        row({
          id: "as3",
          stageId: "s3",
          status: "INACTIVE",
          plannedDate: null,
          stage: {
            name: "Aprovação",
            order: 3,
            defaultTeam: null,
            dependents: [{ dependsOnStageId: "s2" }],
          },
        }),
      ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const cliente = carga.clients[0];
      const dias = cliente.byDay;
      // Uma etapa por dia, na ordem do fluxo — a cadeia andando pela semana.
      expect(dias["2026-09-07"].tasks[0].stages.map((e) => e.state)).toEqual(["pending"]);
      expect(dias["2026-09-08"].tasks[0].stages.map((e) => e.state)).toEqual(["waiting"]);
      expect(dias["2026-09-09"].tasks[0].stages.map((e) => e.state)).toEqual(["waiting"]);
      expect(dias["2026-09-07"].pendingHours).toBe(2);
      expect(dias["2026-09-08"].pendingHours).toBe(3);
      expect(dias["2026-09-09"].pendingHours).toBe(4);
      // E o cabeçalho da linha fecha com o que a linha mostra.
      expect(cliente.totalPending).toBe(9);
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

  it("a etapa que não contribui sozinha entra no bloco que a demanda já tem no dia", () => {
    // Fechar a demanda inteira na célula continua sendo o objetivo — mas quem não contribui (não
    // fechou, não tem apontamento, não carrega pendente > 0 no dia projetado — aqui porque a
    // referência de "Aprovação" não está cadastrada, então pendente é zero) só entra se já houver
    // bloco da demanda naquele dia; não cria um bloco vazio sozinha, e também não some da demanda
    // que já apareceu.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row(),
        row({
          id: "as9",
          stageId: "s9",
          status: "INACTIVE",
          plannedDate: new Date("2026-09-08T00:00:00Z"),
          assignee: null,
          team: null,
          stage: {
            name: "Aprovação",
            order: 3,
            defaultTeam: { name: "Atendimento" },
            dependents: [],
          },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const bloco = carga.clients[0].byDay["2026-09-08"].tasks[0];
      expect(bloco.stages.map((e) => e.stageName)).toEqual(["Roteiro", "Aprovação"]);
      const restante = bloco.stages[1];
      expect(restante.state).toBe("waiting");
      expect(restante.assigneeName).toBe("Atendimento");
      // "Aprovação" não soma (não liberada, e sem referência cadastrada); só "Roteiro" pesa.
      expect(bloco.pendingHours).toBe(2);
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
    // trabalho registrado nem trabalho projetado. Aqui a segunda etapa da MESMA demanda ("s9", sem
    // referência cadastrada — pendente zero) não fecha, não aponta e não carrega pendente no seu
    // próprio dia projetado (2026-09-07): sozinha, ela não pode abrir um bloco vazio lá, e como não
    // há bloco algum nesse dia (a outra etapa está em 2026-09-09), ela simplesmente não aparece.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ plannedDate: new Date("2026-09-09T00:00:00Z") })] as never)
      .mockResolvedValueOnce([
        row({
          id: "as9",
          stageId: "s9",
          status: "INACTIVE",
          plannedDate: null,
          stage: { name: "Aprovação", order: 2, defaultTeam: null, dependents: [] },
        }),
      ] as never);

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

  it("vencimento passado marca a demanda como vencida", () => {
    // Sem este caso, uma regressão que devolvesse `overdue: false` sempre passaria despercebida.
    // Data humana manda: uma etapa com `plannedDate` em 2026-09-08 fica lá, mesmo que o vencimento
    // seja 2020-01-01 e a parede fosse hoje. A parede não desfaz decisão do gestor.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          plannedDate: new Date("2026-09-08T00:00:00Z"),
          task: tarefa({ dueDate: new Date("2020-01-01T00:00:00Z") }),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const bloco = carga.clients[0].byDay["2026-09-08"].tasks[0];
      expect(bloco.dueDateISO).toBe("2020-01-01");
      expect(bloco.overdue).toBe(true);
    });
  });

  it("demanda ENTREGUE com atraso não fica vencida para sempre", () => {
    // `overdue` promete "o prazo passou E a demanda não fechou" — é o que justifica o
    // empilhamento em hoje. Sem a segunda metade, o alerta vermelho sobrevivia à entrega.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          plannedDate: new Date("2026-09-08T00:00:00Z"),
          task: tarefa({ dueDate: new Date("2020-01-01T00:00:00Z"), status: "COMPLETED" }),
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      expect(carga.clients[0].byDay["2026-09-08"].tasks[0].overdue).toBe(false);
    });
  });

  it("pré-requisito marcado para DEPOIS da semana leva a dependente junto", () => {
    // Roteiro fechou terça; o gestor marcou a Edição para a segunda que vem; a Aprovação depende
    // dela. Enquanto a consulta das restantes exigia `plannedDate: null`, a Edição sumia do mapa da
    // projeção e a Aprovação era tratada como se não tivesse pré-requisito nenhum — aparecia NESTA
    // semana, antes do trabalho de que ela depende.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          id: "as1",
          stageId: "s1",
          status: "COMPLETED",
          plannedDate: null,
          completedAt: new Date("2026-09-08T13:00:00Z"),
        }),
      ] as never)
      .mockResolvedValueOnce([
        row({
          id: "as2",
          stageId: "s2",
          status: "INACTIVE",
          // Fora da janela da semana em tela — e é justamente por isso que ela precisa vir.
          plannedDate: new Date("2026-09-14T00:00:00Z"),
          stage: {
            name: "Edição",
            order: 2,
            defaultTeam: null,
            dependents: [{ dependsOnStageId: "s1" }],
          },
        }),
        row({
          id: "as3",
          stageId: "s3",
          status: "INACTIVE",
          plannedDate: null,
          stage: {
            name: "Aprovação",
            order: 3,
            defaultTeam: null,
            dependents: [{ dependsOnStageId: "s2" }],
          },
        }),
      ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dias = carga.clients[0].byDay;
      const etapasNaSemana = carga.days.flatMap((d) =>
        dias[d].tasks.flatMap((t) => t.stages.map((e) => e.id))
      );
      // Só o Roteiro concluído. A Edição está na semana que vem, e a Aprovação vai atrás dela.
      expect(etapasNaSemana).toEqual(["as1"]);
      expect(carga.clients[0].totalPending).toBe(0);
    });
  });

  it("a consulta das restantes traz TODAS as não concluídas, sem repetir as já lidas", () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ id: "as1" })] as never)
      .mockResolvedValueOnce([] as never);

    return getClientLoad(SEGUNDA).then(() => {
      const where = (
        vi.mocked(prisma.taskActiveStage.findMany).mock.calls[1][0] as never as {
          where: Record<string, unknown>;
        }
      ).where;
      // Sem recorte por data: quem decide o que cabe na semana é a projeção.
      expect(where.plannedDate).toBeUndefined();
      // E sem duplicar o que a primeira consulta já trouxe.
      expect(where.id).toEqual({ notIn: ["as1"] });
    });
  });

  it("o realizado respeita o filtro de time — só as etapas que passaram por ele", () => {
    // Regressão numa tela em produção: `linhas` filtrava por time, mas o apontamento era buscado
    // por `taskId` inteiro. Com `?team=Vídeo`, a coluna "feito" passava a incluir as horas de
    // qualquer pessoa em qualquer etapa daquelas demandas.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([row({ id: "as1", stageId: "s1" })] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 2, logDate: new Date("2026-09-08T16:00:00Z") },
      // Etapa de outro time, na mesma demanda: fora do recorte, e portanto fora do "feito".
      { taskId: "t1", stageId: "s2", hoursSpent: 5, logDate: new Date("2026-09-08T16:00:00Z") },
    ] as never);

    return getClientLoad(SEGUNDA, "time1").then((carga) => {
      expect(carga.clients[0].byDay["2026-09-08"].doneHours).toBe(2);
      expect(carga.clients[0].totalDone).toBe(2);
      // A consulta também já sai estreitada pelas etapas em tela.
      const where = (
        vi.mocked(prisma.timeLog.findMany).mock.calls[0][0] as never as {
          where: { stageId?: unknown };
        }
      ).where;
      expect(where.stageId).toEqual({ in: ["s1"] });
    });
  });

  it("no dia retrospectivo a linha mostra o MEDIDO, não o pendente projetado", () => {
    // A etapa vale 3h de referência (declarada) e está projetada para quinta. Na terça ela aparece
    // porque houve apontamento — e ali o número honesto é 0,5h, não o pendente. Antes, `hours` só
    // virava medição quando a etapa estava CONCLUÍDA, então a coluna de terça exibia o pendente
    // inteiro: estimativa disfarçada de medição.
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        row({
          stageId: "s2",
          plannedDate: new Date("2026-09-10T00:00:00Z"),
          stage: { name: "Edição", order: 2, defaultTeam: null, dependents: [] },
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s2", hoursSpent: 0.5, logDate: new Date("2026-09-08T16:00:00Z") },
    ] as never);

    return getClientLoad(SEGUNDA).then((carga) => {
      const dias = carga.clients[0].byDay;
      const retro = dias["2026-09-08"].tasks[0].stages[0];
      expect(retro.hours).toBe(0.5);
      expect(retro.doneHours).toBe(0.5);
      // E sem a marca `~`: o número exibido é medição, não referência declarada.
      expect(retro.estimated).toBe(false);

      const projetado = dias["2026-09-10"].tasks[0].stages[0];
      expect(projetado.hours).toBe(2.5);
      expect(projetado.estimated).toBe(true);
    });
  });
});
