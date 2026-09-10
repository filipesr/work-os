import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { applyImportPlan } from "@/lib/trello/writer";
import type { ImportPlan, PlannedStage, PlannedTask } from "@/lib/trello/plan";
import type { ExportCard } from "@/lib/trello/types";

// --- Fixtures: a template "Demanda GoOn" mínima, com as 4 etapas do mapeamento real. Sem
// `defaultTeam` de propósito — prova que a atribuição histórica não depende de time efetivo (ver
// writer.ts: a atribuição é escrita no fixup, não via `assignments`/`createTaskStages`).
const TEMPLATE = {
  id: "tpl1",
  stages: [
    { id: "s-desenho", name: "Desenho" },
    { id: "s-av", name: "Audio Visual" },
    { id: "s-qc", name: "Quality Control" },
    { id: "s-aprov", name: "Aprovação" },
  ],
};

const TEMPLATE_STAGE_ROWS = TEMPLATE.stages.map((s) => ({
  id: s.id,
  optional: false,
  defaultTeamId: null,
  defaultTeam: null,
}));

/**
 * Cliente falso de banco. Uma única fábrica serve tanto "sem estado" (idempotência checada só pelo
 * `artifactExistsFor` inicial) quanto "com estado" (a criação de um artefato entra no mesmo
 * conjunto que a checagem lê) — os dois papéis que o brief nomeia separadamente
 * (`fakePrisma`/`fakePrismaComEstado`) caem no mesmo objeto, porque rastrear o que foi criado É a
 * forma mais simples de simular idempotência real entre duas chamadas.
 */
function fakePrisma(opts: { artifactExistsFor?: string[] } = {}) {
  const existingArtifactUrls = new Set(opts.artifactExistsFor ?? []);
  const projectsByName = new Map<string, { id: string }>();
  const stageLogRows: Array<Record<string, unknown>> = [];
  let taskSeq = 0;
  let projectSeq = 0;

  const client = {
    workflowTemplate: {
      findFirst: vi.fn().mockResolvedValue(TEMPLATE),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: "client1", name: "AtlanticoShop" }),
    },
    project: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { name: string } }) => {
        return projectsByName.get(where.name) ?? null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: { name: string } }) => {
        projectSeq += 1;
        const row = { id: `proj-${projectSeq}` };
        projectsByName.set(data.name, row);
        return row;
      }),
    },
    templateStage: {
      findMany: vi.fn().mockResolvedValue(TEMPLATE_STAGE_ROWS),
    },
    task: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        taskSeq += 1;
        return { id: `task-${taskSeq}`, ...data };
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    taskActiveStage: {
      create: vi.fn().mockResolvedValue({ id: "active-row", instructions: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    taskStageLog: {
      // Estado real (não só chamadas registradas): `writer.ts` cria um log automático (via
      // createTaskCore→createTaskStages) e depois manda apagar tudo daquela tarefa antes de
      // reconstruir por segmento. Se este fake só registrasse chamadas sem aplicar o delete, o
      // log fantasma continuaria aparecendo pra quem lê `.mock.calls` — daí `_rows` abaixo, o
      // estado FINAL depois de create+delete, que é o que os testes de log inspecionam.
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `log-${stageLogRows.length + 1}`, ...data };
        stageLogRows.push(row);
        return row;
      }),
      deleteMany: vi.fn().mockImplementation(async ({ where }: { where: { taskId: string } }) => {
        const before = stageLogRows.length;
        for (let i = stageLogRows.length - 1; i >= 0; i--) {
          if (stageLogRows[i].taskId === where.taskId) stageLogRows.splice(i, 1);
        }
        return { count: before - stageLogRows.length };
      }),
      _rows: stageLogRows,
    },
    stageTransition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    taskComment: {
      createMany: vi.fn().mockResolvedValue({}),
    },
    reworkEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    taskArtifact: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { url?: string } }) => {
        const url = where?.url;
        return url && existingArtifactUrls.has(url) ? { id: `art-${url}` } : null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: { url?: string | null } }) => {
        if (data.url) existingArtifactUrls.add(data.url);
        return { id: `art-${data.url ?? Math.random()}` };
      }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };

  return client as unknown as PrismaClient;
}

function card(overrides: Partial<ExportCard> & Pick<ExportCard, "id">): ExportCard {
  return {
    name: "Card padrão",
    attachments: [],
    ...overrides,
  };
}

function stage(overrides: Partial<PlannedStage> = {}): PlannedStage {
  return {
    stageName: "Desenho",
    segments: [{}],
    completed: false,
    ...overrides,
  };
}

function plannedTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    card: card({ id: "c1", shortUrl: "https://trello.com/c/c1" }),
    monthKey: "2026-01",
    title: "Demanda",
    description: "",
    dueDate: null,
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    completedAt: null,
    stages: [stage()],
    rework: [],
    ...overrides,
  };
}

function planCom(urls: string[]): ImportPlan {
  const tasks = urls.map((url, i) => plannedTask({ card: card({ id: `c${i}`, shortUrl: url }) }));
  return {
    projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
    tasks,
    skipped: [],
    unmatchedPeople: [],
  };
}

function contarTasksCriadas(prisma: PrismaClient): number {
  return (prisma.task.create as ReturnType<typeof vi.fn>).mock.calls.length;
}

describe("applyImportPlan — ENSAIO não escreve", () => {
  it("ENSAIO não escreve nada — contado, não deduzido", async () => {
    const prisma = fakePrisma();
    const plan = planCom(["https://trello.com/c/abc"]);
    await applyImportPlan(prisma, plan, { commit: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("mesmo assim devolve um relatório com a projeção do plano", async () => {
    const prisma = fakePrisma();
    const plan = planCom(["https://trello.com/c/abc", "https://trello.com/c/def"]);
    const r = await applyImportPlan(prisma, plan, { commit: false });
    expect(r.commit).toBe(false);
    expect(r.tasksCreated).toBe(2);
    expect(r.skippedAlreadyImported).toBe(0);
  });
});

describe("applyImportPlan — idempotência pela URL do card", () => {
  it("pula a demanda cujo card já foi importado — a URL do card é a chave", async () => {
    const prisma = fakePrisma({ artifactExistsFor: ["https://trello.com/c/abc"] });
    const plan = planCom(["https://trello.com/c/abc"]);
    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });
    expect(r.skippedAlreadyImported).toBe(1);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("rodar duas vezes cria a demanda uma vez só", async () => {
    const prisma = fakePrisma();
    const plan = planCom(["https://trello.com/c/x1", "https://trello.com/c/x2"]);
    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });
    const r2 = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });
    expect(contarTasksCriadas(prisma)).toBe(plan.tasks.length);
    expect(r2.skippedAlreadyImported).toBe(2);
    // O projeto do mês também não duplica — achado pelo nome na segunda rodada.
    expect(prisma.project.create).toHaveBeenCalledTimes(1);
    expect(r2.projectsReused).toBe(1);
  });
});

describe("applyImportPlan — artefatos", () => {
  it("cada demanda ganha o artefato do card original e um por anexo", async () => {
    const prisma = fakePrisma();
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [
        plannedTask({
          card: card({
            id: "c1",
            shortUrl: "https://trello.com/c/c1",
            attachments: [
              {
                id: "a1",
                name: "Arte.png",
                url: "https://trello.com/1/cards/c1/attachments/a1/download/Arte.png",
                mimeType: "image/png",
                date: "2026-01-10T00:00:00.000Z",
              },
              {
                id: "a2",
                // sem url: não sustenta artefato nenhum — não deve virar TaskArtifact.
                mimeType: "video/mp4",
                date: "2026-01-11T00:00:00.000Z",
              },
            ],
          }),
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const calls = (prisma.taskArtifact.create as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map((c) => c[0].data.url);
    expect(urls).toEqual([
      "https://trello.com/c/c1",
      "https://trello.com/1/cards/c1/attachments/a1/download/Arte.png",
    ]);
    expect(calls[1][0].data.mediaType).toBe("FOTOS");
    expect(r.artifactsCreated).toBe(2);
  });
});

describe("applyImportPlan — transação por projeto mensal", () => {
  it("uma transação por projeto mensal — um mês que falha não derruba os outros", async () => {
    const prisma = fakePrisma();
    let call = 0;
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        call += 1;
        if (call === 2) throw new Error("mês quebrado de propósito");
        return fn(prisma);
      }
    );

    const plan: ImportPlan = {
      projects: [
        { monthKey: "2026-01", name: "AtlanticoShop 2026-01" },
        { monthKey: "2026-02", name: "AtlanticoShop 2026-02" },
      ],
      tasks: [
        plannedTask({
          monthKey: "2026-01",
          card: card({ id: "c1", shortUrl: "https://trello.com/c/c1" }),
        }),
        plannedTask({
          monthKey: "2026-02",
          card: card({ id: "c2", shortUrl: "https://trello.com/c/c2" }),
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(r.tasksCreated).toBe(1); // só o mês de janeiro escreveu
    expect(r.failedMonths).toEqual([{ monthKey: "2026-02", error: expect.any(String) }]);
  });
});

describe("applyImportPlan — o estado da etapa reflete o que aconteceu", () => {
  it("etapa com saída conhecida fecha COMPLETED (com completedAt); sem saída fica ACTIVE", async () => {
    const prisma = fakePrisma();
    const entrouDesenho = new Date("2026-01-05T10:00:00.000Z");
    const saiuDesenho = new Date("2026-01-06T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              segments: [{ enteredAt: entrouDesenho, exitedAt: saiuDesenho }],
              completed: true,
            }),
            stage({
              stageName: "Audio Visual",
              segments: [{ enteredAt: saiuDesenho }],
              completed: false,
            }),
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const updates = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    const desenho = updates.find(
      (u) => (u.where.taskId_stageId as { stageId: string }).stageId === "s-desenho"
    );
    expect(desenho.data.status).toBe("COMPLETED");
    expect(desenho.data.completedAt).toEqual(saiuDesenho);

    const av = updates.find(
      (u) => (u.where.taskId_stageId as { stageId: string }).stageId === "s-av"
    );
    expect(av.data.status).toBe("ACTIVE");
    expect(av.data.completedAt).toBeNull();
  });

  it("atribuição histórica ignora o time efetivo de hoje — é fato passado, não roteamento novo", async () => {
    const prisma = fakePrisma();
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [
        plannedTask({
          stages: [stage({ stageName: "Desenho", assigneeUserId: "designer-fora-do-time" })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const update = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.data.assigneeId).toBe("designer-fora-do-time");
  });
});

describe("applyImportPlan — o log de etapa, um por segmento", () => {
  it("segmento fechado por devolução da revisão vira log REVERTED; os demais fecham COMPLETED", async () => {
    const prisma = fakePrisma();
    const entrouDesenho1 = new Date("2026-01-01T10:00:00.000Z");
    const entrouQC = new Date("2026-01-02T10:00:00.000Z");
    const devolvidoEm = new Date("2026-01-03T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              segments: [
                { enteredAt: entrouDesenho1, exitedAt: entrouQC },
                { enteredAt: devolvidoEm }, // reaberta pela devolução, ainda em curso
              ],
              completed: false,
            }),
            stage({
              stageName: "Quality Control",
              segments: [{ enteredAt: entrouQC, exitedAt: devolvidoEm }],
              completed: true,
            }),
          ],
          rework: [
            {
              at: devolvidoEm,
              kind: "INTERNAL",
              sourceStageName: "Desenho",
              reason: "Devolução da revisão",
            },
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    // O log auto-criado por createTaskStages (para a etapa de entrada) some — só sobrevivem os
    // logs reconstruídos por segmento.
    expect(prisma.taskStageLog.deleteMany).toHaveBeenCalledWith({
      where: { taskId: expect.any(String) },
    });

    // Estado FINAL (create seguido do delete da linha fantasma) — não a lista bruta de chamadas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = (prisma.taskStageLog as any)._rows as any[];
    const qcLog = logs.find((l) => l.stageId === "s-qc");
    expect(qcLog.status).toBe("REVERTED");
    expect(qcLog.exitedAt).toEqual(devolvidoEm);

    const desenhoLogs = logs.filter((l) => l.stageId === "s-desenho");
    expect(desenhoLogs).toHaveLength(2);
    expect(desenhoLogs[0].status).toBe("COMPLETED");
    expect(desenhoLogs[1].status).toBeNull(); // ainda em curso — sem saída, sem status
  });

  it("retrabalho vira ReworkEvent com a etapa-origem e o responsável capturado na reversão", async () => {
    const prisma = fakePrisma();
    const devolvidoEm = new Date("2026-01-03T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              assigneeUserId: "designer1",
              segments: [{ exitedAt: devolvidoEm }],
            }),
            stage({
              stageName: "Quality Control",
              segments: [{ exitedAt: devolvidoEm }],
              completed: true,
            }),
          ],
          rework: [
            {
              at: devolvidoEm,
              kind: "INTERNAL",
              sourceStageName: "Desenho",
              reason: "Devolução da revisão",
            },
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(prisma.reworkEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceStageId: "s-desenho",
        kind: "INTERNAL",
        reason: "Devolução da revisão",
        // Sem ator real na movimentação do Trello: quem grava é quem rodou a importação — auditoria,
        // nunca métrica de pessoa (comentário do schema em ReworkEvent.byUserId).
        byUserId: "u1",
        // Este sim é quem fez o trabalho revertido — vem do assignee da etapa-origem no plano.
        sourceAssigneeId: "designer1",
      }),
    });
    expect(r.reworkEventsCreated).toBe(1);
  });
});

describe("applyImportPlan — data histórica, não a de hoje", () => {
  it("Task nasce com createdAt histórico — a data mais antiga que o plano sustenta", async () => {
    const prisma = fakePrisma();
    const entrada = new Date("2025-08-01T00:00:00.000Z");
    const plan = planCom(["https://trello.com/c/h1"]);
    plan.tasks[0].stages[0].segments = [{ enteredAt: entrada }];

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const data = (prisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.createdAt).toEqual(entrada);
  });
});

describe("applyImportPlan — pré-condição do template", () => {
  it("aborta antes de escrever quando o template não tem uma etapa que o plano precisa", async () => {
    const prisma = fakePrisma();
    (prisma.workflowTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tpl1",
      stages: [{ id: "s-desenho", name: "Desenho" }], // falta "Audio Visual" etc.
    });
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01" }],
      tasks: [plannedTask({ stages: [stage({ stageName: "Quality Control" })] })],
      skipped: [],
      unmatchedPeople: [],
    };

    await expect(
      applyImportPlan(prisma, plan, { commit: true, importedById: "u1" })
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
