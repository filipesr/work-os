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

vi.mock("@/lib/planning/week-done", () => ({
  // O feito da semana tem leitura e testes próprios (`__tests__/lib/planning/week-done.test.ts`);
  // aqui ele só não pode ir ao banco. Cada caso que precisa dele sobrescreve.
  getWeekDone: vi.fn().mockResolvedValue({ lines: new Map(), hours: new Map() }),
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
import { getWeekDone } from "@/lib/planning/week-done";
// `DEFAULT_WEEKLY_HOURS` não é mais exportado por `week-planning.ts`: um arquivo `"use server"` só
// pode exportar função assíncrona, e mesmo o re-export do valor quebrava `next build` em runtime.
// Ver lib/planning/week-capacity.ts.
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { formatISODate, mondayOfWeek, todayInSaoPaulo } from "@/lib/dates";

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
    // `stageLogs` = os logs ABERTOS da demanda; é de lá que sai desde quando a etapa está ativa.
    task: { title: "Vídeo", project: { client: { name: "ACME" } }, stageLogs: [] },
    ...over,
  };
}

type FindManyArgs = { where: Record<string, unknown>; orderBy?: unknown };

/** As duas consultas de `taskActiveStage` saem em paralelo; o poço é a que pede `assigneeId: null`. */
function argsDeFindMany(doPoco: boolean): FindManyArgs {
  const chamadas = db.taskActiveStage.findMany.mock.calls as [FindManyArgs][];
  const achada = chamadas.map((c) => c[0]).find((a) => (a.where.assigneeId === null) === doPoco);
  if (!achada) throw new Error("consulta não encontrada");
  return achada;
}
const argsDoPoco = () => argsDeFindMany(true);
const argsDaSemana = () => argsDeFindMany(false);

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

  it("[IMPORTANTE] o item rolado carrega o DIA DELE, não o da coluna em que é mostrado", async () => {
    // A rolagem é de EXIBIÇÃO: o item continua planejado para 20/08, e só aparece na segunda
    // visível para não sumir da tela. Quem for marcar a hora dele precisa do dia REAL — o
    // compromisso é ancorado em `plannedDate`, e usar o dia da coluna gravaria "14h de segunda"
    // num item cuja âncora é 20/08. Ver `instanteNoDia`.
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ plannedDate: new Date("2026-08-20T00:00:00Z") }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].byDay["2026-08-31"].slots[0].item.plannedDateISO).toBe("2026-08-20");
  });

  it("item reivindicado SEM dia não inventa um: `plannedDateISO` fica nulo", async () => {
    // Ele entra na fila de hoje por LEITURA, sem nada gravado. Devolver o dia de hoje aqui seria
    // afirmar uma programação que não existe no banco — a tela cai no dia da coluna.
    const hoje = formatISODate(todayInSaoPaulo());
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({ plannedDate: null, plannedOrder: null, assignedAt: new Date("2026-08-31") }),
    ]);
    const r = await getWeekPlanning(formatISODate(mondayOfWeek(todayInSaoPaulo())));
    expect(r.people[0].byDay[hoje].slots[0].item.plannedDateISO).toBeNull();
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
    expect(argsDoPoco().where).not.toHaveProperty("plannedDate");
  });

  it("pede a semana já ordenada e desempatada por id", async () => {
    // Ordem de linha do Postgres não é garantida: sem `orderBy`, a mesma célula podia listar os
    // itens em ordens diferentes entre dois carregamentos.
    db.taskActiveStage.findMany.mockResolvedValue([]);
    await getWeekPlanning("2026-08-31");
    expect(argsDaSemana().orderBy).toEqual([{ plannedOrder: "asc" }, { id: "asc" }]);
  });

  it("a semana CORRENTE não tem piso: o atrasado das semanas anteriores continua vindo", async () => {
    db.taskActiveStage.findMany.mockResolvedValue([]);
    await getWeekPlanning(formatISODate(mondayOfWeek(todayInSaoPaulo())));
    // A consulta virou um OR: o primeiro ramo é o que tem dia; o segundo, o reivindicado sem dia.
    const comDia = (argsDaSemana().where.OR as { plannedDate: Record<string, unknown> }[])[0];
    expect(comDia.plannedDate).not.toHaveProperty("gte");
  });

  it("a semana FUTURA tem piso na própria segunda", async () => {
    // Sem piso, abrir a semana que vem para distribuir traria todo item não concluído das semanas
    // anteriores empilhado na segunda e somado ao acumulado da pessoa: a semana que se está
    // planejando nasceria cheia, que é o oposto do que a tela serve para responder.
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const proxima = new Date(mondayOfWeek(todayInSaoPaulo()).getTime() + 7 * 86_400_000);
    await getWeekPlanning(formatISODate(proxima));
    const comDia = (argsDaSemana().where.OR as { plannedDate: { gte: Date } }[])[0];
    const plannedDate = comDia.plannedDate;
    expect(plannedDate.gte.toISOString()).toBe(`${formatISODate(proxima)}T00:00:00.000Z`);
  });

  it("a grade é de quem executa: sem conta de portal e sem desativado", async () => {
    // Cada uma ganharia uma linha na grade — com o aviso de capacidade — e viraria alvo de
    // atribuição no diálogo de programar.
    db.taskActiveStage.findMany.mockResolvedValue([]);
    await getWeekPlanning("2026-08-31");
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.role).toEqual({ not: "CLIENT" });
    expect(where.disabledAt).toBeNull();
  });

  it("pessoa sem nome cai no e-mail, e sem e-mail no id — a linha nunca fica sem rótulo", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", name: null, email: "ana@example.com", weeklyCapacityHours: 40 },
      { id: "u2", name: null, email: null, weeklyCapacityHours: 40 },
    ]);
    db.taskActiveStage.findMany.mockResolvedValue([]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people.map((p) => p.name)).toEqual(["ana@example.com", "u2"]);
  });

  it("traz o início da etapa em execução, para o envelhecimento aparecer no item", async () => {
    // Envelhecimento é leitura sobre o TRABALHO (esta etapa contra a referência da classe), nunca
    // nota da pessoa. Vem do log ainda aberto da etapa.
    const desde = new Date("2026-08-31T09:00:00Z");
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({
        task: {
          title: "Vídeo",
          project: { client: { name: "ACME" } },
          stageLogs: [
            { stageId: "outra", enteredAt: new Date("2026-08-01T00:00:00Z") },
            { stageId: "s1", enteredAt: desde },
          ],
        },
      }),
    ]);
    const r = await getWeekPlanning("2026-08-31");
    expect(r.people[0].byDay["2026-08-31"].slots[0].item.activeSince).toEqual(desde);
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

  it("o FIM da janela também atravessa do select até a fila", async () => {
    // Mesmo fio do teste acima, um campo adiante: select do Prisma -> QueueItemInput.scheduledEnd ->
    // tela. Sem ele, reabrir o diálogo de um compromisso de 14h–16h o transformaria silenciosamente
    // num de "14h + referência".
    db.taskActiveStage.findMany.mockResolvedValue([
      stageRow({
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
        scheduledEnd: new Date("2026-08-31T16:00:00Z"),
      }),
    ]);

    const r = await getWeekPlanning("2026-08-31");

    expect(r.people[0].byDay["2026-08-31"].slots[0].item.scheduledEnd).toEqual(
      new Date("2026-08-31T16:00:00Z")
    );
  });

  it("demanda descartada não ocupa dia na mesa", () => {
    // Mesma regra da tela da pessoa e da carga por cliente, na mesma fonte compartilhada.
    return getWeekPlanning("2026-08-31").then(() => {
      const where = (
        vi.mocked(prisma.taskActiveStage.findMany).mock.calls[0][0] as never as {
          where: { task?: { status?: unknown } };
        }
      ).where;
      expect(where.task?.status).toEqual({ notIn: ["OBSOLETE", "CANCELLED"] });
    });
  });

  it("a grade mostra o feito do dia — a carga não encolhe quando a pessoa entrega", async () => {
    // O defeito: `status: not COMPLETED` apagava a etapa concluída do dia, então quem terminou tudo
    // na segunda aparecia com a segunda vazia e virava o candidato óbvio a receber mais.
    vi.mocked(getWeekDone).mockResolvedValueOnce({
      lines: new Map([
        [
          "u1",
          new Map([
            [
              "2026-08-31",
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
      hours: new Map([["u1", new Map([["2026-08-31", 2.5]])]]),
    });

    const r = await getWeekPlanning("2026-08-31");
    const pessoa = r.people.find((p) => p.userId === "u1");
    expect(pessoa?.byDay["2026-08-31"].done[0]).toMatchObject({ stageName: "Roteiro", hours: 2.5 });
    expect(pessoa?.byDay["2026-08-31"].doneHours).toBe(2.5);
    expect(pessoa?.doneHours).toBe(2.5);
  });
});
