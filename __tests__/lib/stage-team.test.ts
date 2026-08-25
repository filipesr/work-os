import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { taskActiveStage: { findMany: vi.fn().mockResolvedValue([]) } },
  prisma: {},
}));

import { effectiveStageTeam, stageTeamWhere, routedStageTerms } from "@/lib/stage-team";

const TEAM_A = { id: "tA", name: "Design" };
const TEAM_B = { id: "tB", name: "Redação" };

describe("effectiveStageTeam", () => {
  it("o roteamento da tarefa vence o time padrão do template", () => {
    // Cenário do coringa direcionado: o template não nomeia ninguém.
    expect(effectiveStageTeam({ team: TEAM_B, stage: { defaultTeam: null } })).toEqual(TEAM_B);
  });

  it("sem roteamento, cai no time padrão da etapa", () => {
    expect(effectiveStageTeam({ team: null, stage: { defaultTeam: TEAM_A } })).toEqual(TEAM_A);
  });

  it("coringa não direcionado é null — e precisa aparecer como tal", () => {
    expect(effectiveStageTeam({ team: null, stage: { defaultTeam: null } })).toBeNull();
  });
});

describe("stageTeamWhere", () => {
  it("casa por roteamento OU por time padrão, mas nunca as duas coisas na mesma linha", () => {
    const w = stageTeamWhere("tA");
    // O `teamId: null` no segundo ramo é o que impede a dupla contagem: uma
    // etapa roteada para outro time não pode voltar pelo padrão do template.
    expect(w).toEqual({
      OR: [{ teamId: { in: ["tA"] } }, { teamId: null, stage: { defaultTeamId: { in: ["tA"] } } }],
    });
  });

  it("aceita lista de times", () => {
    expect(stageTeamWhere(["tA", "tB"]).OR?.[0]).toEqual({ teamId: { in: ["tA", "tB"] } });
  });
});

describe("routedStageTerms", () => {
  it("agrupa por etapa — um termo por etapa coringa, não por demanda", async () => {
    const prisma = (await import("@/lib/prisma")).default as never as {
      taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.taskActiveStage.findMany.mockResolvedValue([
      { taskId: "k1", stageId: "s9" },
      { taskId: "k2", stageId: "s9" },
      { taskId: "k3", stageId: "s7" },
    ]);
    expect(await routedStageTerms("tA")).toEqual([
      { stageId: "s9", taskId: { in: ["k1", "k2"] } },
      { stageId: "s7", taskId: { in: ["k3"] } },
    ]);
  });

  it("time sem etapa coringa não adiciona termo algum", async () => {
    const prisma = (await import("@/lib/prisma")).default as never as {
      taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.taskActiveStage.findMany.mockResolvedValue([]);
    expect(await routedStageTerms("tA")).toEqual([]);
  });
});
