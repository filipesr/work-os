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
});
