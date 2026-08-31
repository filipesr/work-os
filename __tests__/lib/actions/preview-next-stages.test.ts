import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({ requireMemberOrHigher: vi.fn().mockResolvedValue({}) }));

vi.mock("@/lib/prisma", () => ({
  default: {
    templateStage: {
      findUnique: vi.fn().mockResolvedValue({ templateId: "tpl" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    taskActiveStage: { findMany: vi.fn().mockResolvedValue([]) },
  },
  prisma: {},
}));

// O preview do modal de avanço precisa prever EXATAMENTE o que activateNextStages
// vai fazer. O caso que motivou o teste: etapa opcional no meio do fluxo, deixada
// de fora na criação — a etapa seguinte depende dela, mas quem libera é a etapa
// ANTERIOR à opcional.

type Node = {
  id: string;
  order: number;
  dependsOn?: string[];
  team?: { id: string; name: string } | null;
};

function graph(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    name: n.id,
    order: n.order,
    defaultTeamId: n.team?.id ?? null,
    defaultTeam: n.team ?? null,
    // Pré-requisitos vivem em `dependents` (ver o comentário em activateNextStages). O mock
    // antigo usava `dependencies`, reproduzindo o engano do código e escondendo o defeito.
    dependents: (n.dependsOn ?? []).map((d) => ({ dependsOnStageId: d })),
  }));
}

type Row = {
  stageId: string;
  status: string;
  assigneeId?: string | null;
  instructions?: string | null;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
};

async function run(nodes: Node[], rows: Row[], completedStageId: string) {
  const prisma = (await import("@/lib/prisma")).default as never as {
    templateStage: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    taskActiveStage: { findMany: ReturnType<typeof vi.fn> };
  };
  prisma.templateStage.findUnique.mockResolvedValue({ templateId: "tpl" });
  prisma.templateStage.findMany.mockResolvedValue(graph(nodes));
  prisma.taskActiveStage.findMany.mockResolvedValue(
    rows.map((r) => ({
      assigneeId: null,
      instructions: null,
      teamId: null,
      team: null,
      ...r,
    }))
  );
  const { previewNextStages } = await import("@/lib/actions/stage-assignment");
  return previewNextStages("task1", completedStageId);
}

const LINEAR: Node[] = [
  { id: "A", order: 1 },
  { id: "B", order: 2, dependsOn: ["A"] },
  { id: "C", order: 3, dependsOn: ["B"] },
];

describe("previewNextStages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("anuncia a dependente direta quando o fluxo está completo", async () => {
    const r = await run(
      LINEAR,
      [
        { stageId: "A", status: "ACTIVE" },
        { stageId: "B", status: "INACTIVE" },
        { stageId: "C", status: "INACTIVE" },
      ],
      "A"
    );
    expect(r.activated.map((s) => s.id)).toEqual(["B"]);
    expect(r.blocked).toEqual([]);
  });

  it("etapa opcional excluída no MEIO: libera a seguinte, não a excluída", async () => {
    // B é opcional e ficou de fora (sem linha). Concluir A tem de liberar C.
    const r = await run(
      LINEAR,
      [
        { stageId: "A", status: "ACTIVE" },
        { stageId: "C", status: "INACTIVE" },
      ],
      "A"
    );
    expect(r.activated.map((s) => s.id)).toEqual(["C"]);
    // A etapa excluída não pode ser anunciada: ela não existe nesta tarefa.
    expect([...r.activated, ...r.blocked].map((s) => s.id)).not.toContain("B");
  });

  it("cadeia de excluídas encadeadas continua passando direto", async () => {
    const nodes: Node[] = [
      { id: "A", order: 1 },
      { id: "B", order: 2, dependsOn: ["A"] },
      { id: "C", order: 3, dependsOn: ["B"] },
      { id: "D", order: 4, dependsOn: ["C"] },
    ];
    const r = await run(
      nodes,
      [
        { stageId: "A", status: "ACTIVE" },
        { stageId: "D", status: "INACTIVE" },
      ],
      "A"
    );
    expect(r.activated.map((s) => s.id)).toEqual(["D"]);
  });

  it("dependente com pré-requisito INCLUÍDO pendente aparece como bloqueada", async () => {
    const nodes: Node[] = [
      { id: "A", order: 1 },
      { id: "B", order: 2, dependsOn: ["A"] },
      { id: "C", order: 3, dependsOn: ["A", "B"] },
    ];
    const r = await run(
      nodes,
      [
        { stageId: "A", status: "ACTIVE" },
        { stageId: "B", status: "INACTIVE" },
        { stageId: "C", status: "INACTIVE" },
      ],
      "A"
    );
    // C só abre quando B fechar — B está INCLUÍDA, então não há pass-through.
    expect(r.activated.map((s) => s.id)).toEqual(["B"]);
    expect(r.blocked.map((s) => s.id)).toEqual(["C"]);
  });

  it("devolve o time EFETIVO e a instrução da etapa coringa", async () => {
    const nodes: Node[] = [
      { id: "A", order: 1, team: { id: "t1", name: "Design" } },
      { id: "B", order: 2, dependsOn: ["A"] }, // coringa: sem time no template
    ];
    const r = await run(
      nodes,
      [
        { stageId: "A", status: "ACTIVE" },
        {
          stageId: "B",
          status: "INACTIVE",
          teamId: "t2",
          team: { id: "t2", name: "Redação" },
          instructions: "Revisar o texto do briefing",
        },
      ],
      "A"
    );
    expect(r.activated[0].teamId).toBe("t2");
    expect(r.activated[0].team?.name).toBe("Redação");
    expect(r.activated[0].instructions).toBe("Revisar o texto do briefing");
  });

  it("etapa já ACTIVE não é re-anunciada (no-regress)", async () => {
    const r = await run(
      LINEAR,
      [
        { stageId: "A", status: "ACTIVE" },
        { stageId: "B", status: "ACTIVE" },
        { stageId: "C", status: "INACTIVE" },
      ],
      "A"
    );
    expect(r.activated.map((s) => s.id)).toEqual([]);
  });
});
