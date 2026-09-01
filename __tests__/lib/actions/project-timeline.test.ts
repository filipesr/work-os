import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 2, source: "observed" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: { task: { findMany: vi.fn() }, timeLog: { findMany: vi.fn() } },
}));
// A projeção REAL roda; o espião só prova que é ela que roda, e não uma cópia local.
vi.mock("@/lib/planning/demand-projection", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planning/demand-projection")>();
  return { ...real, projectDemandDays: vi.fn(real.projectDemandDays) };
});

import prisma from "@/lib/prisma";
import { projectDemandDays } from "@/lib/planning/demand-projection";
import { getProjectTimeline } from "@/lib/actions/project-timeline";
import { formatISODate, todayInSaoPaulo } from "@/lib/dates";

const HOJE = formatISODate(todayInSaoPaulo());

function etapa(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    stageId: "s1",
    status: "ACTIVE",
    plannedDate: null,
    completedAt: null,
    activatedAt: new Date("2026-08-20T12:00:00Z"),
    assigneeId: "ana",
    assignee: { name: "Ana Souza", email: null },
    team: null,
    stage: { name: "Roteiro", order: 1, defaultTeam: null, dependents: [] },
    ...over,
  };
}

function demanda(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Vídeo institucional",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    createdAt: new Date("2026-08-20T12:00:00Z"),
    completedAt: null,
    dueDate: null,
    activeStages: [etapa()],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.timeLog.findMany).mockResolvedValue([] as never);
});

describe("getProjectTimeline", () => {
  it("o dia com apontamento vira linha, e a hora aparece nele", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 1.5, logDate: new Date("2026-08-21T16:00:00Z") },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === "2026-08-21")).toBe(true);
      expect(linha.byDay["2026-08-21"]["t1"].doneHours).toBe(1.5);
    });
  });

  it("dias sem movimento viram faixa entre os dias que têm", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "t1", stageId: "s1", hoursSpent: 1, logDate: new Date("2026-08-25T16:00:00Z") },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      // Entre a criação (20/08) e o apontamento (25/08) não houve nada.
      expect(linha.rows.some((r) => r.kind === "gap" && r.days >= 2)).toBe(true);
    });
  });

  it("demanda aberta vem antes da concluída", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "fechada",
        status: "COMPLETED",
        completedAt: new Date("2026-08-22T12:00:00Z"),
      }),
      demanda({ id: "aberta" }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands.map((d) => d.taskId)).toEqual(["aberta", "fechada"]);
      expect(linha.demands[0].open).toBe(true);
    });
  });

  it("o pendente do futuro é posicionado pela projeção, não por data inventada", () => {
    // A segunda etapa não acontece junto da primeira: acontece depois dela.
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        activeStages: [
          etapa({ id: "as1", stageId: "s1" }),
          etapa({
            id: "as2",
            stageId: "s2",
            status: "INACTIVE",
            stage: {
              name: "Edição",
              order: 2,
              defaultTeam: null,
              dependents: [{ dependsOnStageId: "s1" }],
            },
          }),
        ],
      }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      // A tela NÃO tem projeção própria: uma segunda implementação divergiria da carga por cliente,
      // e a segunda seria a errada.
      expect(vi.mocked(projectDemandDays)).toHaveBeenCalled();
      const diaDaPrimeira = Object.keys(linha.byDay).find((d) =>
        linha.byDay[d]["t1"]?.lines.some((l) => l.stageId === "s1")
      );
      const diaDaSegunda = Object.keys(linha.byDay).find((d) =>
        linha.byDay[d]["t1"]?.lines.some((l) => l.stageId === "s2")
      );
      expect(diaDaSegunda! > diaDaPrimeira!).toBe(true);
    });
  });

  it("'minhas demandas' filtra pelo responsável da ETAPA, não pelo da demanda", () => {
    // `Task.assigneeId` não é escrito por caminho nenhum do fluxo: filtrar por ele devolve sempre
    // vazio. A atribuição neste sistema é por etapa.
    return getProjectTimeline("p1", { mine: true }).then(() => {
      const where = (
        vi.mocked(prisma.task.findMany).mock.calls[0][0] as never as {
          where: { activeStages?: { some?: { assigneeId?: string } } };
        }
      ).where;
      expect(where.activeStages?.some?.assigneeId).toBe("ana");
    });
  });

  it("hoje é sempre uma linha, mesmo num projeto sem nada acontecendo", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([demanda()] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.todayISO).toBe(HOJE);
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === HOJE)).toBe(true);
    });
  });

  it("nenhuma leitura agrega por pessoa — o eixo é a demanda", () => {
    // Uma linha do tempo por pessoa seria vigilância ("o que fulano fez em cada dia"), que é o que a
    // biblioteca proíbe (P1, P2). O guarda é de código-fonte porque a proibição é fácil de esquecer:
    // agrupar por `assigneeId` num arquivo que já tem o campo é a coisa mais natural de se escrever.
    const fonte = readFileSync("lib/actions/project-timeline.ts", "utf-8");
    expect(/groupBy[\s\S]{0,200}(assigneeId|userId)/.test(fonte)).toBe(false);
    expect(/byPerson|porPessoa|byAssignee/.test(fonte)).toBe(false);
  });

  it("projeto sem demanda nenhuma devolve a linha de hoje e nada mais", () => {
    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands).toEqual([]);
      expect(linha.rows).toEqual([{ kind: "day", dayISO: HOJE }]);
    });
  });
});
