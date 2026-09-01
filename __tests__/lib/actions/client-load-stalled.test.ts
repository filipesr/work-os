import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 6, source: "declared" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn(), groupBy: vi.fn() },
    task: { findMany: vi.fn() },
    stageTransition: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getClientLoad } from "@/lib/actions/client-load";

const SEGUNDA = "2026-09-07";

function paradaCrua(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Reels institucional",
    dueDate: null,
    createdAt: new Date("2026-08-01T12:00:00Z"),
    status: "IN_PROGRESS",
    plannedStartAt: null,
    project: { name: "Campanha", client: { id: "c1", name: "Acme" } },
    activeStages: [
      {
        stageId: "s1",
        status: "ACTIVE",
        assigneeId: null,
        plannedDate: null,
        teamId: null,
        stage: { order: 1, defaultTeamId: "video" },
      },
    ],
    ...over,
  };
}

/** Uma linha da consulta principal (o "que anda na semana"): a mesma demanda que `paradaCrua`
 *  descreve, mas na forma que `taskActiveStage.findMany` devolve — usada só no teste da Task 6, que
 *  precisa das DUAS consultas concordando sobre a mesma demanda. */
function linhaCrua(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "COMPLETED",
    plannedDate: null,
    completedAt: new Date("2026-09-09T13:00:00Z"),
    task: {
      id: "t1",
      title: "Reels institucional",
      dueDate: null,
      status: "IN_PROGRESS",
      project: { name: "Campanha", client: { id: "c1", name: "Acme" } },
    },
    stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
    team: null,
    assignee: null,
    ...over,
  };
}

/** Banco falso que aplica só o suficiente do `where` do Prisma para os testes de filtro fazerem
 *  sentido. O mock padrão (`vi.fn().mockResolvedValue(...)`) devolve o que mandarem nele
 *  IGNORANDO o `where` por completo — o que faria um teste "isto não aparece" passar mesmo sem
 *  nenhum filtro no código de produção. Reproduzir a filtragem de verdade é o que torna estes
 *  testes capazes de falhar pela razão certa. */
function bancoFake(tarefas: Record<string, unknown>[]) {
  // `any` de propósito: o tipo real de `args` é o `TaskFindManyArgs` gerado pelo Prisma, e este
  // fake só entende um recorte pequeno dele (`where.status.notIn` e `where.OR`) — tipar certinho
  // aqui exigiria repetir a definição inteira só para os dois campos que importam ao teste.
  return vi.fn(async (args: any = {}) => {
    const where = args.where ?? {};
    const notIn: string[] = where.status?.notIn ?? [];
    const or: Array<Record<string, unknown>> | undefined = where.OR;
    return tarefas.filter((t) => {
      if (notIn.includes(t.status as string)) return false;
      if (!or || or.length === 0) return true;
      // Só entende o fragmento de `lib/task-availability.ts` — `{ plannedStartAt: null }` ou
      // `{ plannedStartAt: { lte } }` — que é o único que este arquivo testa.
      return or.some((cond) => {
        if (!("plannedStartAt" in cond)) return false;
        const condVal = cond.plannedStartAt as null | { lte: Date };
        const valor = t.plannedStartAt as Date | null | undefined;
        if (condVal === null) return valor == null;
        return !!valor && valor.getTime() <= condVal.lte.getTime();
      });
    }) as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([] as never);
});

describe("getClientLoad — o que está parado", () => {
  it("cliente que SÓ tem trabalho parado ganha linha na grade", async () => {
    // Sem isto o pior caso — o cliente para quem ninguém está trabalhando — some da tela inteira,
    // que é exatamente o silêncio que esta entrega existe para quebrar.
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients.map((c) => c.clientId)).toEqual(["c1"]);
    expect(carga.clients[0].stalled).toHaveLength(1);
    expect(carga.clients[0].stalled[0]).toMatchObject({
      taskTitle: "Reels institucional",
      noTeam: false,
    });
  });

  it("as horas paradas NÃO entram no total da semana", async () => {
    // O total responde "quanto desta semana este cliente ocupou". Trabalho parado não ocupou nada,
    // e somá-lo misturaria ocupação com intenção.
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients[0].totalDone).toBe(0);
    expect(carga.clients[0].totalPending).toBe(0);
    expect(carga.clients[0].stalledHours).toBe(6);
  });

  it("demanda SEM equipe aparece mesmo com o filtro de equipe ligado", async () => {
    // Ela não pertence a equipe nenhuma: com o filtro, sumiria de todas as visões — a categoria
    // mais travada desaparecendo justamente da tela que existe para mostrá-la.
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      paradaCrua({
        id: "sem-equipe",
        activeStages: [
          {
            stageId: "s1",
            status: "ACTIVE",
            assigneeId: null,
            plannedDate: null,
            teamId: null,
            stage: { order: 1, defaultTeamId: null },
          },
        ],
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA, "outra-equipe");
    expect(carga.clients[0].stalled[0]).toMatchObject({ taskId: "sem-equipe", noTeam: true });
  });

  it("demanda COM equipe respeita o filtro", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);

    const carga = await getClientLoad(SEGUNDA, "outra-equipe");
    expect(carga.clients).toEqual([]);
  });

  it("o tempo parado conta do último apontamento quando ele é mais recente", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([paradaCrua()] as never);
    vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", at: new Date("2026-08-01T12:00:00Z") },
    ] as never);
    vi.mocked(prisma.timeLog.groupBy).mockResolvedValue([
      { taskId: "t1", _max: { logDate: new Date("2026-08-20T12:00:00Z") } },
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    // Não interessa o número exato (depende de hoje), e sim de QUAL data ele parte: a mais recente.
    const { idleDays, stalledSince } = await import("@/lib/planning/stalled-demand");
    const { formatISODate, todayInSaoPaulo } = await import("@/lib/dates");
    const esperado = idleDays(
      stalledSince({
        releasedISO: "2026-08-01",
        lastLogISO: "2026-08-20",
        createdISO: "2026-08-01",
      }),
      formatISODate(todayInSaoPaulo())
    );
    expect(carga.clients[0].stalled[0].idleDays).toBe(esperado);
  });

  it("demanda com dono não é parada", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      paradaCrua({
        activeStages: [
          {
            stageId: "s1",
            status: "ACTIVE",
            assigneeId: "ana",
            plannedDate: null,
            teamId: null,
            stage: { order: 1, defaultTeamId: "video" },
          },
        ],
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients).toEqual([]);
  });

  it("a leitura não agrega por pessoa — o eixo é o cliente", async () => {
    // Guarda de vocabulário: a coluna mostra trabalho SEM dono, e a lista nunca diz de quem
    // "deveria" ter sido.
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("lib/actions/client-load.ts", "utf-8");
    expect(/paradas[\s\S]{0,400}groupBy[\s\S]{0,120}assigneeId/.test(fonte)).toBe(false);
  });

  it("[CRÍTICO] demanda concluída à mão (COMPLETED) com etapa aberta sem dono e sem dia NÃO aparece na coluna", async () => {
    // "Concluir demanda" (botão manual — `completeTask` em lib/actions/task.ts) marca
    // Task.status = COMPLETED e NÃO toca nas linhas de TaskActiveStage: as etapas seguintes ficam
    // INACTIVE, sem dono e sem dia. Só o caminho de conclusão AUTOMÁTICA espera as etapas
    // fecharem — sem o corte no `where`, esta demanda ficaria parada para sempre, subindo de dias
    // a cada carregamento.
    vi.mocked(prisma.task.findMany).mockImplementation(
      bancoFake([paradaCrua({ status: "COMPLETED" })]) as never
    );

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients).toEqual([]);
  });

  it("[Importante] demanda com plannedStartAt no futuro não aparece na coluna", async () => {
    // `createTaskStages` cria a etapa de entrada ACTIVE, sem dono e sem dia — inclusive quando a
    // demanda inteira só deveria começar daqui a um mês. Sem o mesmo recorte de
    // lib/task-availability.ts, a campanha criada em lote para o mês que vem aparece "parada"
    // desde o dia em que foi criada, e não desde o dia em que deveria começar.
    const futuro = new Date(Date.now() + 30 * 86_400_000);
    vi.mocked(prisma.task.findMany).mockImplementation(
      bancoFake([paradaCrua({ plannedStartAt: futuro })]) as never
    );

    const carga = await getClientLoad(SEGUNDA);
    expect(carga.clients).toEqual([]);
  });

  it("[Importante] a demanda que andou na semana E travou aparece nos dois lugares — na célula do dia e na coluna", async () => {
    // A costura mais provável de regredir: a célula do dia vem de `taskActiveStage.findMany`, a
    // coluna de parado vem de `task.findMany` — duas consultas independentes que precisam
    // concordar sobre a MESMA demanda. Uma etapa fecha dentro da semana (célula); a etapa
    // seguinte fica aberta, sem dono e sem dia (coluna).
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([linhaCrua()] as never) // etapa 1: concluída dentro da semana
      .mockResolvedValueOnce([
        linhaCrua({
          id: "as2",
          stageId: "s2",
          status: "INACTIVE",
          completedAt: null,
          stage: { name: "Edição", order: 2, defaultTeam: null, dependents: [] },
        }),
      ] as never); // etapa 2: a "restante" — seguinte, aberta, sem dono e sem dia

    vi.mocked(prisma.task.findMany).mockResolvedValue([
      paradaCrua({
        activeStages: [
          {
            stageId: "s1",
            status: "COMPLETED",
            assigneeId: null,
            plannedDate: null,
            teamId: null,
            stage: { order: 1, defaultTeamId: "video" },
          },
          {
            stageId: "s2",
            status: "INACTIVE",
            assigneeId: null,
            plannedDate: null,
            teamId: null,
            stage: { order: 2, defaultTeamId: "video" },
          },
        ],
      }),
    ] as never);

    const carga = await getClientLoad(SEGUNDA);

    const dia = carga.clients[0].byDay["2026-09-09"];
    expect(dia.tasks.map((t) => t.taskId)).toContain("t1");
    expect(carga.clients[0].stalled.map((s) => s.taskId)).toContain("t1");
  });
});
