import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/planning/stage-reference", () => ({ getStageReferences: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { listWindowCandidates, setStageWindow } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

/** Linha programada para 04/09, sem compromisso ainda. `plannedDate` é meia-noite SP codificada em
 *  UTC — a mesma convenção que `scheduleStage` grava. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "as1",
    assigneeId: "u1",
    status: "ACTIVE",
    stageId: "s1",
    plannedDate: new Date("2026-09-04T00:00:00Z"),
    scheduledStart: null,
    scheduledEnd: null,
    task: { priority: "MEDIUM", title: "Reels institucional" },
    stage: { name: "Gravação" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.taskActiveStage.findMany.mockResolvedValue([]);
  vi.mocked(getStageReferences).mockResolvedValue(
    new Map([["s1", { hours: 3, source: "observed" }]])
  );
});

describe("setStageWindow", () => {
  it("grava a hora como INSTANTE REAL do dia da coluna", async () => {
    // 14h em São Paulo é 17h UTC. Gravar "14:00" cru deixaria o compromisso três horas adiantado,
    // e o erro só apareceria na borda do dia — o mesmo que o comentário de `realInstant` descreve.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });

    expect(r).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: new Date("2026-09-04T17:00:00.000Z"),
      scheduledEnd: null,
    });
  });

  it("grava o fim quando informado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());

    await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "16:30" });

    expect(db.taskActiveStage.update.mock.calls[0][0].data.scheduledEnd).toEqual(
      new Date("2026-09-04T19:30:00.000Z")
    );
  });

  it("startTime nulo limpa a janela inteira", async () => {
    // Desmarcar o compromisso é a mesma porta, sem uma segunda ação: o fim nunca sobrevive ao
    // início, senão sobraria uma janela sem começo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({
        scheduledStart: new Date("2026-09-04T17:00:00Z"),
        scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      })
    );

    await setStageWindow({ activeStageId: "as1", startTime: null });

    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
    });
  });
});

describe("setStageWindow — recusas", () => {
  it("etapa sem dia não recebe compromisso", async () => {
    // "Quinta às 14h" precisa da quinta. Sem `plannedDate` não há dia em que ancorar a hora, e o
    // item nem aparece numa coluna da grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ plannedDate: null }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "windowNeedsDay" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("etapa concluída não recebe compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha({ status: "COMPLETED" }));
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00" });
    expect(r).toEqual({ error: "completedStage" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("hora fora do formato é recusada, sem tentar gravar", async () => {
    // Vem de `<input type="time">`, mas a ação é chamável direto — a tela explica, o servidor
    // garante.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    for (const hora of ["25:00", "14h", "", "9:00"]) {
      const r = await setStageWindow({ activeStageId: "as1", startTime: hora });
      expect(r).toEqual({ error: "invalidTime" });
    }
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim antes do início é recusado", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "16:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("fim IGUAL ao início é recusado — janela de duração zero não ocupa nada", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    const r = await setStageWindow({ activeStageId: "as1", startTime: "14:00", endTime: "14:00" });
    expect(r).toEqual({ error: "windowEndBeforeStart" });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

/** Uma ocupante já marcada das 14h às 16h para a mesma pessoa, no mesmo dia. */
function ocupante(over: Record<string, unknown> = {}) {
  return {
    id: "as9",
    stageId: "s9",
    scheduledStart: new Date("2026-09-04T17:00:00Z"),
    scheduledEnd: new Date("2026-09-04T19:00:00Z"),
    task: { priority: "HIGH", title: "Institucional Acme" },
    stage: { name: "Gravação" },
    ...over,
  };
}

describe("setStageWindow — a trava de sobreposição", () => {
  it("sem colisão, grava", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);
    // 17h–20h não encosta em 14h–16h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "17:00" });
    expect(r).toEqual({ success: true });
  });

  it("colide e a prioridade NÃO autoriza: não grava, e diz quem está no caminho", async () => {
    // MEDIUM contra HIGH. Uma recusa que não nomeia a ocupante obriga o gestor a caçar na grade.
    db.taskActiveStage.findUnique.mockResolvedValue(linha());
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      overlap: {
        canOverride: false,
        occupants: [
          {
            activeStageId: "as9",
            taskTitle: "Institucional Acme",
            stageName: "Gravação",
            priority: "HIGH",
            startISO: "2026-09-04T17:00:00.000Z",
            endISO: "2026-09-04T19:00:00.000Z",
          },
        ],
      },
    });
  });

  it("colide e a prioridade autoriza: AINDA NÃO grava — a saída é do gestor", async () => {
    // A regra é "sempre avisa, e só permite se a prioridade autorizar". Permitir não é gravar por
    // cima: gravar deixaria duas janelas no mesmo horário, que é exatamente o que esta trava
    // existe para impedir. Quem escolhe a saída é o gestor, no diálogo.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([ocupante()]);

    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ overlap: { canOverride: true } });
  });

  it("o horário oferecido para adiar pula um terceiro compromisso", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ task: { priority: "URGENT", title: "Campanha Natal" } })
    );
    db.taskActiveStage.findMany.mockResolvedValue([
      ocupante(),
      ocupante({
        id: "as8",
        scheduledStart: new Date("2026-09-04T20:00:00Z"), // 17h–18h
        scheduledEnd: new Date("2026-09-04T21:00:00Z"),
      }),
    ]);

    // Nova das 15h às 17h (2h de referência). A ocupante das 14h–16h seria empurrada para 17h,
    // onde há outro compromisso — então o primeiro livre de verdade é 18h.
    const r = await setStageWindow({ activeStageId: "as1", startTime: "15:00", endTime: "17:00" });

    expect(r).toMatchObject({ overlap: { firstFreeStartISO: "2026-09-04T21:00:00.000Z" } });
  });

  it("a consulta das ocupantes é da MESMA pessoa, no MESMO dia, e ignora a própria linha", async () => {
    // Sem excluir a si mesma, remarcar um compromisso existente colidiria com ele próprio.
    db.taskActiveStage.findUnique.mockResolvedValue(
      linha({ scheduledStart: new Date("2026-09-04T17:00:00Z") })
    );
    db.taskActiveStage.findMany.mockResolvedValue([]);

    await setStageWindow({ activeStageId: "as1", startTime: "15:00" });

    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).toMatchObject({
      assigneeId: "u1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: { not: null },
      id: { not: "as1" },
    });
  });
});

describe("listWindowCandidates", () => {
  it("lista o time efetivo marcando quem já tem compromisso na faixa", async () => {
    // Quem está ocupado aparece DESABILITADO, não sumido: "some da lista" não se distingue de "não
    // é do time", e o gestor precisa saber que a pessoa existe e está comprometida.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: new Date("2026-09-04T17:00:00Z"),
      scheduledEnd: new Date("2026-09-04T19:00:00Z"),
      teamId: null,
      team: null,
      stage: {
        name: "Gravação",
        defaultTeam: {
          id: "video",
          name: "Vídeo",
          members: [
            { id: "u1", name: "Ana" },
            { id: "u2", name: "Bruno" },
            { id: "u3", name: "Carla" },
          ],
        },
      },
    });
    // Bruno tem 15h–17h; Carla não tem nada.
    db.taskActiveStage.findMany.mockResolvedValue([
      {
        id: "as9",
        stageId: "s9",
        assigneeId: "u2",
        scheduledStart: new Date("2026-09-04T18:00:00Z"),
        scheduledEnd: new Date("2026-09-04T20:00:00Z"),
      },
    ]);
    vi.mocked(getStageReferences).mockResolvedValue(new Map());

    const r = await listWindowCandidates("as1");

    expect(r).toEqual({
      candidates: [
        { id: "u1", name: "Ana", busy: false },
        { id: "u2", name: "Bruno", busy: true },
        { id: "u3", name: "Carla", busy: false },
      ],
    });
  });

  it("etapa sem janela não tem candidatos a calcular", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      stageId: "s1",
      plannedDate: new Date("2026-09-04T00:00:00Z"),
      scheduledStart: null,
      scheduledEnd: null,
      teamId: null,
      team: null,
      stage: { name: "Gravação", defaultTeam: { id: "video", name: "Vídeo", members: [] } },
    });
    expect(await listWindowCandidates("as1")).toEqual({ error: "stageNotFound" });
  });
});
