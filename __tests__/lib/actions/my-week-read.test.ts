import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
// `my-week.ts` importa `claimActiveStage` (a atribuição é delegada a ele). O módulo real puxa
// `@/auth`, que não carrega sob vitest — e a leitura não usa nada dele.
vi.mock("@/lib/actions/task", () => ({ claimActiveStage: vi.fn() }));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 2, source: "observed" }]])),
}));
vi.mock("@/lib/planning/week-done", () => ({
  // O feito da semana tem leitura e testes próprios (`__tests__/lib/planning/week-done.test.ts`);
  // aqui ele só não pode ir ao banco. Cada caso que precisa dele sobrescreve.
  getWeekDone: vi.fn().mockResolvedValue({ lines: new Map(), hours: new Map() }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    taskActiveStage: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { formatISODate, mondayOfWeek, todayInSaoPaulo } from "@/lib/dates";
import { getMyWeek } from "@/lib/actions/my-week";
import { getWeekDone } from "@/lib/planning/week-done";

const SEGUNDA = "2026-09-07";

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: new Date("2026-09-08T00:00:00Z"),
    plannedOrder: 1,
    scheduledStart: null,
    stage: { name: "Edição" },
    task: {
      title: "Reels setembro",
      project: { client: { name: "Cliente A" } },
      stageLogs: [],
    },
    ...over,
  };
}

function poolRow(over: Record<string, unknown> = {}) {
  return {
    id: "livre1",
    stageId: "s1",
    stage: { name: "Roteiro" },
    task: { title: "Campanha", project: { client: { name: "Cliente B" } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    weeklyCapacityHours: 40,
    teams: [{ id: "time1" }],
  } as never);
  vi.mocked(prisma.taskActiveStage.findMany).mockResolvedValue([] as never);
});

/** As três chamadas de findMany, na ordem em que a implementação as faz. */
function chamadas() {
  return vi.mocked(prisma.taskActiveStage.findMany).mock.calls.map((c) => c[0] as never);
}

describe("getMyWeek", () => {
  it("traz só as etapas de quem está na sessão", async () => {
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[0] as { where: { assigneeId: string } }).where;
    expect(where.assigneeId).toBe("ana");
  });

  it("monta os seis dias, de segunda a sábado", async () => {
    const semana = await getMyWeek(SEGUNDA);
    expect(semana.days).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("põe a etapa no dia dela, com a referência e o rótulo", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([stageRow()] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    const dia = semana.byDay["2026-09-08"];
    expect(dia.slots).toHaveLength(1);
    expect(dia.slots[0].kind).toBe("runnable");
    expect(dia.slots[0].item.taskTitle).toBe("Reels setembro");
    expect(dia.usedHours).toBe(2);
    expect(semana.usedHours).toBe(2);
  });

  it("sem capacidade cadastrada cai no padrão de 45h", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: null,
      teams: [],
    } as never);
    const semana = await getMyWeek(SEGUNDA);
    expect(semana.weeklyHours).toBe(45);
  });

  it("o poço é restrito aos times da pessoa — trabalho de outro time não é assumível", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: 40,
      teams: [{ id: "time1" }, { id: "time2" }],
    } as never);
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: Record<string, unknown> }).where;
    expect(where.assigneeId).toBeNull();
    expect(where.status).toBe("ACTIVE");
    // `stageTeamWhere` sempre devolve um `OR` — checar só que ele existe passaria mesmo se a
    // implementação enviasse os times errados. A prova real é que os IDS dentro dele são os da
    // PESSOA: `stageTeamWhere` monta um OR que alcança a etapa coringa (teamId nulo, time herdado
    // do modelo). Sem ele, filtrar por `teamId` puro perderia justamente essas.
    expect(where.OR).toEqual([
      { teamId: { in: ["time1", "time2"] } },
      { teamId: null, stage: { defaultTeamId: { in: ["time1", "time2"] } } },
    ]);
  });

  it("o poço não mostra demanda cujo início planejado ainda não chegou", async () => {
    await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: { task?: { OR?: unknown } } }).where;
    // A MESMA condição de `getTeamBacklog` (`availableStageWhere`). Sem ela, o poço do dashboard e
    // o poço da minha semana mostram listas diferentes na mesma sessão — e a demanda que só começa
    // em novembro aparece como trabalho para pegar hoje.
    expect(where.task?.OR).toEqual([
      { plannedStartAt: null },
      { plannedStartAt: { lte: expect.any(Date) } },
    ]);
  });

  it("pessoa sem time nenhum não vê nada no poço — não há trabalho que ela possa assumir", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      weeklyCapacityHours: 40,
      teams: [],
    } as never);
    const semana = await getMyWeek(SEGUNDA);
    const where = (chamadas()[1] as { where: { OR: Array<Record<string, unknown>> } }).where;
    // `stageTeamWhere([])` não casa com nada — é o mesmo fragmento que uma pessoa COM time recebe,
    // só que com a lista de ids vazia.
    expect(where.OR).toEqual([
      { teamId: { in: [] } },
      { teamId: null, stage: { defaultTeamId: { in: [] } } },
    ]);
    expect(semana.pool).toEqual([]);
  });

  it("etapa atrasada de semana anterior aparece no primeiro dia visível", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([stageRow({ plannedDate: new Date("2026-08-31T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.byDay["2026-09-07"].slots).toHaveLength(1);
    // E ele carrega o DIA DELE, não o da coluna: a rolagem é de exibição, e as duas telas têm de
    // devolver o mesmo campo — a mesa do gestor usa `plannedDateISO` para ancorar a hora.
    expect(semana.byDay["2026-09-07"].slots[0].item.plannedDateISO).toBe("2026-08-31");
  });

  it("o reconhecimento não aparece sem amostra suficiente", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      // Concluídas: duas semanas só.
      .mockResolvedValueOnce([
        { completedAt: new Date("2026-09-08T10:00:00Z") },
        { completedAt: new Date("2026-09-01T10:00:00Z") },
      ] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.praise).toBe(false);
  });

  it("o reconhecimento aparece quando a semana em tela supera a mediana das anteriores", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        // Quatro semanas anteriores, uma etapa concluída em cada — mediana 1, amostra suficiente
        // (PACE_MIN_WEEKS = 4).
        { completedAt: new Date("2026-08-31T12:00:00Z") },
        { completedAt: new Date("2026-08-25T12:00:00Z") },
        { completedAt: new Date("2026-08-18T12:00:00Z") },
        { completedAt: new Date("2026-08-11T12:00:00Z") },
        // Semana em tela: três — acima da mediana das anteriores.
        { completedAt: new Date("2026-09-08T12:00:00Z") },
        { completedAt: new Date("2026-09-09T12:00:00Z") },
        { completedAt: new Date("2026-09-10T12:00:00Z") },
      ] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.praise).toBe(true);
  });

  it("completedAt é instante real: conclusão de sábado à noite em SP não pode sumir na borda da consulta", async () => {
    // `completedAt` é gravado com `new Date()` (instante real) — diferente de `plannedDate`, que é
    // gravado como representação SP-local. 22h de sábado em São Paulo é 01h de domingo em UTC: se a
    // consulta usasse a borda ingênua (sábado 23:59:59Z, a mesma de `plannedDate`), a linha seria
    // descartada ANTES de chegar ao agrupamento, e uma conclusão legítima sumiria da contagem. A
    // prova é na CONSULTA — os valores `gte`/`lte` que chegam ao `findMany` das concluídas —, não
    // só no resultado, porque um mock de Prisma não filtra sozinho.
    const concluidaSabadoNoite = new Date("2026-09-13T01:00:00Z");
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ completedAt: concluidaSabadoNoite }] as never);

    await getMyWeek(SEGUNDA);

    const where = (chamadas()[2] as { where: { completedAt: { gte: Date; lte: Date } } }).where;
    // A borda de cima é o instante real equivalente a domingo 23:59:59 em São Paulo — não sábado
    // 23:59:59Z, que teria descartado `concluidaSabadoNoite` da consulta.
    expect(where.completedAt.lte.toISOString()).toBe("2026-09-14T02:59:59.000Z");
    expect(where.completedAt.gte.toISOString()).toBe("2026-07-13T03:00:00.000Z");
    expect(concluidaSabadoNoite.getTime()).toBeGreaterThanOrEqual(where.completedAt.gte.getTime());
    expect(concluidaSabadoNoite.getTime()).toBeLessThanOrEqual(where.completedAt.lte.getTime());
  });
});

/**
 * O fim do dia. Aqui "hoje" precisa cair DENTRO da semana em tela — por isso o relógio falso.
 */
describe("getMyWeek: fim do dia e convite", () => {
  // Quinta, 12h em São Paulo (15h UTC): dentro da semana de SEGUNDA.
  const QUINTA = "2026-09-10";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${QUINTA}T15:00:00.000Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dia vazio não é dia cumprido — a tela não pode dizer as duas coisas em duas linhas", async () => {
    const semana = await getMyWeek(SEGUNDA);
    expect(semana.todayISO).toBe(QUINTA);
    // `nextRunnableId` nulo também é o valor de um dia SEM NADA: sem a contagem de itens, a quinta
    // vazia renderizava "Nada programado neste dia." e logo abaixo "Dia cumprido.".
    expect(semana.byDay[QUINTA].nextRunnableId).toBeNull();
    expect(semana.dayDone).toBe(false);
  });

  it("dia cumprido só quando o dia TINHA itens e nenhum está executável agora", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        // Item não liberado: visível, mas não executável — o dia não tem o que fazer.
        stageRow({ id: "as1", status: "INACTIVE", plannedDate: new Date(`${QUINTA}T00:00:00Z`) }),
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.dayDone).toBe(true);
  });

  it("o convite é a pendência do dia ANTERIOR, não o trabalho de sexta", async () => {
    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        // Quarta ficou por fazer; hoje é quinta e não há nada executável nela; sexta tem trabalho.
        stageRow({ id: "atrasada", plannedDate: new Date("2026-09-09T00:00:00Z") }),
        stageRow({ id: "hoje", status: "INACTIVE", plannedDate: new Date(`${QUINTA}T00:00:00Z`) }),
        stageRow({ id: "sexta", plannedDate: new Date("2026-09-11T00:00:00Z") }),
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const semana = await getMyWeek(SEGUNDA);
    // Varredura CRONOLÓGICA pulando hoje: oferecer sexta por cima do atrasado de quarta inverteria
    // a ordem em que o trabalho deve acontecer.
    expect(semana.nextUp?.id).toBe("atrasada");
    expect(semana.nextUp?.dayISO).toBe("2026-09-09");
  });

  it("demanda descartada não ocupa dia na minha semana", () => {
    return getMyWeek(SEGUNDA).then(() => {
      const where = (chamadas()[0] as never as { where: { task?: { status?: unknown } } }).where;
      expect(where.task?.status).toEqual({ notIn: ["OBSOLETE", "CANCELLED"] });
    });
  });

  it("etapa reivindicada e sem dia entra na fila de hoje, sem gravar data", () => {
    // O caso que trouxe esta regra: a pessoa pega uma etapa pelo painel e ela some da programação
    // — não está na grade (que lê por dia) nem no poço (que exige etapa sem dono).
    const hoje = formatISODate(todayInSaoPaulo());
    const segunda = formatISODate(mondayOfWeek(todayInSaoPaulo()));

    vi.mocked(prisma.taskActiveStage.findMany)
      .mockResolvedValueOnce([
        stageRow({ plannedDate: null, assignedAt: new Date("2026-09-01T09:00:00Z") }),
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    return getMyWeek(segunda).then((semana) => {
      expect(semana.byDay[hoje].slots).toHaveLength(1);
      expect(semana.byDay[hoje].slots[0].item.semDia).toBe(true);
      // Consome capacidade: é trabalho de verdade acontecendo.
      expect(semana.byDay[hoje].usedHours).toBe(2);
    });
  });

  it("a consulta busca o sem dia apenas LIBERADO", () => {
    // Etapa atribuída e ainda INACTIVE tem dono desde a criação e espera a anterior fechar. Se
    // entrasse, a fila de hoje nasceria com todas as etapas futuras de todas as demandas.
    return getMyWeek(SEGUNDA).then(() => {
      const or = (chamadas()[0] as never as { where: { OR: Record<string, unknown>[] } }).where.OR;
      const semDia = or.find((r) => r.plannedDate === null) as { status?: string };
      expect(semDia?.status).toBe("ACTIVE");
    });
  });

  it("mostra o que já foi FEITO no dia — concluir não pode apagar do dia", async () => {
    // Antes daqui a leitura filtrava `status: not COMPLETED`: concluir a etapa a apagava, e a
    // semana da pessoa esvaziava conforme ela entregava. O feito é medido (apontamento), o
    // previsto é referência, e os dois ficam lado a lado sem se somar.
    vi.mocked(getWeekDone).mockResolvedValueOnce({
      lines: new Map([
        [
          "ana",
          new Map([
            [
              SEGUNDA,
              [
                {
                  stageId: "s1",
                  taskId: "t1",
                  taskTitle: "Vídeo institucional",
                  stageName: "Roteiro",
                  hours: 2.5,
                  completed: true,
                },
              ],
            ],
          ]),
        ],
      ]),
      hours: new Map([["ana", new Map([[SEGUNDA, 2.5]])]]),
    });

    const semana = await getMyWeek(SEGUNDA);
    expect(semana.byDay[SEGUNDA].done).toHaveLength(1);
    expect(semana.byDay[SEGUNDA].done[0]).toMatchObject({ stageName: "Roteiro", completed: true });
    expect(semana.byDay[SEGUNDA].doneHours).toBe(2.5);
    // O total da semana soma os dias, e NÃO entra em `usedHours` — as duas grandezas são
    // diferentes, e um número só esconderia qual metade é estimativa.
    expect(semana.doneHours).toBe(2.5);
  });
});
