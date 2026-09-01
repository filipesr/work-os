import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor", role: "MANAGER" }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    calendarOccurrence: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getWeeklyCoverage } from "@/lib/actions/weekly-coverage";

/** Uma data dentro da primeira semana da janela: hoje resolve isso sem depender do calendário. */
const DENTRO_DA_JANELA = new Date();

function etapaAtiva(over: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE",
    assignee: { name: "Ana Souza", email: null },
    team: null,
    stage: { order: 1, defaultTeam: null },
    ...over,
  };
}

function demanda(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Vídeo institucional",
    status: "IN_PROGRESS",
    dueDate: DENTRO_DA_JANELA,
    plannedStartAt: null,
    startedAt: null,
    completedAt: null,
    calendarOccurrenceId: null,
    activeStages: [etapaAtiva()],
    project: { name: "Campanha", clientId: "c1", client: { name: "Cliente A" } },
    ...over,
  };
}

/** A primeira demanda sem vínculo com data comemorativa, em qualquer semana da janela. */
function primeiraSolta(cobertura: Awaited<ReturnType<typeof getWeeklyCoverage>>) {
  return cobertura.weeks.flatMap((s) => s.unlinked)[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: "c1", name: "Cliente A" }] as never);
  vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.calendarOccurrence.findMany).mockResolvedValue([] as never);
});

describe("getWeeklyCoverage — o responsável vem da ETAPA", () => {
  it("mostra quem responde pela etapa em curso, não o campo da demanda", async () => {
    // `Task.assigneeId` existe no schema e NENHUM caminho do fluxo o escreve: lendo por ele, a tela
    // dizia "sem responsável" para toda demanda do sistema — informação que nunca esteve certa.
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);

    const cobertura = await getWeeklyCoverage(4);
    expect(primeiraSolta(cobertura)?.assigneeNames).toEqual(["Ana Souza"]);
  });

  it("com duas etapas ativas, mostra as duas — a demanda é das duas", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        activeStages: [
          etapaAtiva(),
          etapaAtiva({
            assignee: { name: "Bruno Lima", email: null },
            stage: { order: 2, defaultTeam: null },
          }),
        ],
      }),
    ] as never);

    const cobertura = await getWeeklyCoverage(4);
    expect(primeiraSolta(cobertura)?.assigneeNames).toEqual(["Ana Souza", "Bruno Lima"]);
  });

  it("a mesma pessoa em duas etapas aparece uma vez só", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        activeStages: [etapaAtiva(), etapaAtiva({ stage: { order: 2, defaultTeam: null } })],
      }),
    ] as never);

    const cobertura = await getWeeklyCoverage(4);
    expect(primeiraSolta(cobertura)?.assigneeNames).toEqual(["Ana Souza"]);
  });

  it("etapa sem pessoa cai para a equipe — quem responde é ela", async () => {
    // Mesma cadeia de recurso da carga por cliente e da linha do tempo: pessoa, equipe da etapa,
    // equipe padrão do modelo. A tela só diz "sem responsável" quando não há nem equipe.
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        activeStages: [
          etapaAtiva({ assignee: null, team: { name: "Vídeo" } }),
          etapaAtiva({
            assignee: null,
            team: null,
            stage: { order: 2, defaultTeam: { name: "Tráfego" } },
          }),
        ],
      }),
    ] as never);

    const cobertura = await getWeeklyCoverage(4);
    expect(primeiraSolta(cobertura)?.assigneeNames).toEqual(["Vídeo", "Tráfego"]);
  });

  it("sem etapa ativa nenhuma, a lista vem vazia — e a tela decide o que dizer", async () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda({ activeStages: [] })] as never);

    const cobertura = await getWeeklyCoverage(4);
    expect(primeiraSolta(cobertura)?.assigneeNames).toEqual([]);
  });

  it("a demanda vinculada a uma data comemorativa também traz o responsável da etapa", async () => {
    vi.mocked(prisma.calendarOccurrence.findMany).mockResolvedValue([
      {
        id: "o1",
        date: DENTRO_DA_JANELA,
        titlePt: "Dia das Mães",
        titleEs: "Día de la Madre",
        kind: "COMMEMORATIVE",
        source: "CURATED",
        tasks: [demanda({ id: "t2", calendarOccurrenceId: "o1" })],
      },
    ] as never);

    const cobertura = await getWeeklyCoverage(4);
    const vinculada = cobertura.weeks.flatMap((s) => s.occurrences).flatMap((o) => o.tasks)[0];
    expect(vinculada?.assigneeNames).toEqual(["Ana Souza"]);
  });
});
