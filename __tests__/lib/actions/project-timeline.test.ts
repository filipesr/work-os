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
  default: {
    task: { findMany: vi.fn() },
    timeLog: { findMany: vi.fn() },
    stageTransition: { findMany: vi.fn() },
  },
}));
// A projeção REAL roda; o espião só prova que é ela que roda, e não uma cópia local.
vi.mock("@/lib/planning/demand-projection", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planning/demand-projection")>();
  return { ...real, projectDemandDays: vi.fn(real.projectDemandDays) };
});

import prisma from "@/lib/prisma";
import { projectDemandDays } from "@/lib/planning/demand-projection";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { getProjectTimeline } from "@/lib/actions/project-timeline";
import { formatISODate, nowInSaoPaulo, todayInSaoPaulo } from "@/lib/dates";

const HOJE = formatISODate(todayInSaoPaulo());

/** N dias atrás, como instante REAL (não SP-local): meio-dia em São Paulo (15h UTC), longe da
 *  virada de dia, para o cálculo de "dia" não depender de que horas são agora quando o teste roda. */
function diasAtras(n: number): Date {
  const hoje = new Date();
  hoje.setUTCHours(15, 0, 0, 0);
  return new Date(hoje.getTime() - n * 86_400_000);
}

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
  vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([] as never);
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
    // A segunda etapa não acontece junto da primeira: acontece depois dela. Precisa de referência
    // cadastrada (item 5 do ledger): sem `pendingHours > 0` a etapa não emite célula nenhuma, e o
    // teste não teria segunda etapa pra comparar.
    vi.mocked(getStageReferences).mockResolvedValueOnce(
      new Map([
        ["s1", { hours: 2, source: "observed" as const }],
        ["s2", { hours: 2, source: "observed" as const }],
      ])
    );
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

  it("demanda vencida trabalhada ontem vem antes de demanda antiga parada, mesmo a antiga projetando mais longe no futuro (item 1)", () => {
    // A projetada (`movedDays`/posição no futuro) não deve alimentar a ORDENAÇÃO — só movimento
    // real deveria. Sem a separação do item 1, a demanda parada projeta em hoje+4 (cadeia de 5
    // etapas) e essa data-fantasma vence a "ontem" real da demanda vencida.
    vi.mocked(getStageReferences).mockResolvedValueOnce(
      new Map([
        ["s1", { hours: 2, source: "observed" as const }],
        ["s2", { hours: 2, source: "observed" as const }],
        ["s3", { hours: 2, source: "observed" as const }],
        ["s4", { hours: 2, source: "observed" as const }],
        ["s5", { hours: 2, source: "observed" as const }],
      ])
    );

    const cadeia = (id: string, ordem: number, dependeDe: string | null) =>
      etapa({
        id: `as-parada-${id}`,
        stageId: id,
        status: ordem === 1 ? "ACTIVE" : "INACTIVE",
        stage: {
          name: id,
          order: ordem,
          defaultTeam: null,
          dependents: dependeDe ? [{ dependsOnStageId: dependeDe }] : [],
        },
      });

    const parada = demanda({
      id: "parada",
      createdAt: diasAtras(180),
      dueDate: null,
      activeStages: [
        cadeia("s1", 1, null),
        cadeia("s2", 2, "s1"),
        cadeia("s3", 3, "s2"),
        cadeia("s4", 4, "s3"),
        cadeia("s5", 5, "s4"),
      ],
    });

    const vencida = demanda({
      id: "vencida",
      createdAt: diasAtras(30),
      dueDate: diasAtras(5),
      activeStages: [etapa({ id: "as-vencida", stageId: "s1", status: "ACTIVE" })],
    });

    vi.mocked(prisma.task.findMany).mockResolvedValue([parada, vencida] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "vencida", stageId: "s1", hoursSpent: 1, logDate: diasAtras(1) },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands.map((d) => d.taskId)).toEqual(["vencida", "parada"]);
    });
  });

  it("projeto com tudo concluído há meses ainda devolve a linha de hoje, e um vão até lá (item 2)", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "fechada-ha-meses",
        status: "COMPLETED",
        createdAt: diasAtras(200),
        completedAt: diasAtras(190),
        activeStages: [etapa({ status: "COMPLETED", completedAt: diasAtras(190) })],
      }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === HOJE)).toBe(true);
      expect(linha.rows.some((r) => r.kind === "gap" && r.days >= 2)).toBe(true);
    });
  });

  it("apontamento sem etapa (stageId null) aparece na célula do dia e o dia vira linha (item 3)", () => {
    const dia = diasAtras(3);
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({ id: "bloqueada-sem-etapa", activeStages: [etapa({ status: "BLOCKED" })] }),
    ] as never);
    vi.mocked(prisma.timeLog.findMany).mockResolvedValue([
      { taskId: "bloqueada-sem-etapa", stageId: null, hoursSpent: 2, logDate: dia },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      const diaISO = formatISODate(nowInSaoPaulo(dia));
      const cel = linha.byDay[diaISO]?.["bloqueada-sem-etapa"];
      expect(cel?.doneHours).toBe(2);
      expect(cel?.lines.some((l) => l.stageOrder === 0 && l.hours === 2)).toBe(true);
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === diaISO)).toBe(true);
    });
  });

  it("demanda OBSOLETE com etapa ACTIVE não ganha célula futura, mas mantém o passado (item 4)", () => {
    vi.mocked(getStageReferences).mockResolvedValueOnce(
      new Map([["s1", { hours: 6, source: "declared" as const }]])
    );
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "descartada",
        status: "OBSOLETE",
        createdAt: diasAtras(10),
        activeStages: [etapa({ stageId: "s1", status: "ACTIVE" })],
      }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      expect(linha.demands.map((d) => d.taskId)).toContain("descartada");
      const temCelulaFutura = Object.keys(linha.byDay).some(
        (dia) => dia >= HOJE && linha.byDay[dia]["descartada"]
      );
      expect(temCelulaFutura).toBe(false);
    });
  });

  it("etapa sem referência (0h) não emite linha nem cria dia (item 5)", () => {
    vi.mocked(getStageReferences).mockResolvedValueOnce(new Map());
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "sem-referencia",
        createdAt: diasAtras(50),
        activeStages: [etapa({ stageId: "s-sem-ref", status: "ACTIVE" })],
      }),
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      const temCelula = Object.keys(linha.byDay).some((dia) => linha.byDay[dia]["sem-referencia"]);
      expect(temCelula).toBe(false);
    });
  });

  it("etapa bloqueada 20 dias e liberada no dia 14 vira linha, sem a faixa engolir os 20 dias (item 6)", () => {
    vi.mocked(prisma.task.findMany).mockResolvedValue([
      demanda({
        id: "liberada-tardia",
        createdAt: diasAtras(20),
        activeStages: [etapa({ stageId: "s1", status: "ACTIVE" })],
      }),
    ] as never);
    vi.mocked(prisma.stageTransition.findMany).mockResolvedValue([
      { taskId: "liberada-tardia", stageId: "s1", at: diasAtras(6) },
    ] as never);

    return getProjectTimeline("p1").then((linha) => {
      const diaLiberacao = formatISODate(nowInSaoPaulo(diasAtras(6)));
      expect(linha.rows.some((r) => r.kind === "day" && r.dayISO === diaLiberacao)).toBe(true);
      const maiorVao = Math.max(
        0,
        ...linha.rows.filter((r) => r.kind === "gap").map((r) => r.days)
      );
      expect(maiorVao).toBeLessThan(20);
    });
  });

  it("prioridade inválida não vai para o `where` do Prisma (item 8)", () => {
    return getProjectTimeline("p1", { priority: "FOO" }).then(() => {
      const where = (
        vi.mocked(prisma.task.findMany).mock.calls[0][0] as never as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).not.toHaveProperty("priority");
    });
  });
});
