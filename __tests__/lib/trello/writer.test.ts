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
function fakePrisma(opts: { artifactExistsFor?: string[]; explodeOnArtifactUrl?: string } = {}) {
  const existingArtifactUrls = new Set(opts.artifactExistsFor ?? []);
  const projectsByName = new Map<string, { id: string }>();
  const stageLogRows: Array<Record<string, unknown>> = [];
  const stageTransitionRows: Array<Record<string, unknown>> = [];
  let taskSeq = 0;
  let projectSeq = 0;

  const client = {
    workflowTemplate: {
      findFirst: vi.fn().mockResolvedValue(TEMPLATE),
    },
    // Sem mock de `client` (o model `Client`, não a variável `client` deste fake): rodada de
    // conserto 1 tirou a derivação por nome do projeto — o escritor usa `proj.clientId` direto,
    // nunca consulta o model `Client`.
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
      // Mesmo motivo do `_rows` de `taskStageLog` acima: `writer.ts` agora também apaga e
      // reconstrói StageTransition por segmento (rodada de conserto 1) — sem estado real, os
      // testes veriam a transição fantasma que createTaskCore→createTaskStages grava na criação.
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `trans-${stageTransitionRows.length + 1}`, at: new Date(), ...data };
        stageTransitionRows.push(row);
        return row;
      }),
      createMany: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockImplementation(async ({ where }: { where: { taskId: string } }) => {
        const before = stageTransitionRows.length;
        for (let i = stageTransitionRows.length - 1; i >= 0; i--) {
          if (stageTransitionRows[i].taskId === where.taskId) stageTransitionRows.splice(i, 1);
        }
        return { count: before - stageTransitionRows.length };
      }),
      _rows: stageTransitionRows,
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
        // `explodeOnArtifactUrl` simula a transação morrendo NO MEIO do mês (é o que P2028 faz):
        // as escritas anteriores já rodaram e já contaram, e só então vem o erro.
        if (opts.explodeOnArtifactUrl && data.url === opts.explodeOnArtifactUrl) {
          throw new Error("P2028 — Transaction already closed (simulado)");
        }
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
    projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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
  it("mês que falha NO MEIO não soma nada ao relatório — e não derruba os outros meses", async () => {
    // O rollback desfaz as LINHAS do mês que falhou; não desfaria os contadores se eles fossem
    // incrementados direto no `report` de dentro da transação. Aqui o mês de fevereiro escreve o
    // projeto, a primeira demanda inteira (com artefato e retrabalho) e só então estoura no
    // artefato da segunda — exatamente a forma do P2028. Nada disso pode aparecer no relatório.
    const prisma = fakePrisma({ explodeOnArtifactUrl: "https://trello.com/c/c3" });

    const plan: ImportPlan = {
      projects: [
        { monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" },
        { monthKey: "2026-02", name: "AtlanticoShop 2026-02", clientId: "client1" },
      ],
      tasks: [
        plannedTask({
          monthKey: "2026-01",
          card: card({ id: "c1", shortUrl: "https://trello.com/c/c1" }),
        }),
        plannedTask({
          monthKey: "2026-02",
          card: card({ id: "c2", shortUrl: "https://trello.com/c/c2" }),
          stages: [
            stage({
              stageName: "Desenho",
              segments: [{ exitedAt: new Date("2026-02-03T10:00:00.000Z") }],
            }),
            stage({
              stageName: "Quality Control",
              segments: [{ exitedAt: new Date("2026-02-03T10:00:00.000Z") }],
              completed: true,
            }),
          ],
          rework: [
            {
              at: new Date("2026-02-03T10:00:00.000Z"),
              kind: "INTERNAL",
              sourceStageName: "Desenho",
              reason: "Devolução da revisão",
            },
          ],
        }),
        plannedTask({
          monthKey: "2026-02",
          card: card({ id: "c3", shortUrl: "https://trello.com/c/c3" }),
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    // O laço continua: os dois meses tiveram sua transação, e o de janeiro escreveu.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(r.failedMonths).toEqual([{ monthKey: "2026-02", error: expect.any(String) }]);

    // Só os números de JANEIRO. Fevereiro escreveu de verdade antes de estourar (o fake registra
    // as chamadas), mas nada do que ele escreveu sobreviveu ao rollback — logo, não conta.
    // 3 demandas foram de fato CRIADAS no banco (janeiro + as duas de fevereiro — a segunda só
    // estoura depois, no artefato); as duas de fevereiro morreram no rollback.
    expect(prisma.task.create).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({
      projectsCreated: 1,
      projectsReused: 0,
      tasksCreated: 1,
      artifactsCreated: 1,
      reworkEventsCreated: 0,
      skippedAlreadyImported: 0,
    });
  });
});

describe("applyImportPlan — o estado da etapa reflete o que aconteceu", () => {
  it("etapa com saída conhecida fecha COMPLETED (com completedAt); sem saída fica ACTIVE", async () => {
    const prisma = fakePrisma();
    const entrouDesenho = new Date("2026-01-05T10:00:00.000Z");
    const saiuDesenho = new Date("2026-01-06T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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

// Os painéis de gestão (getTeamCurrentLoad em reporting.ts, team-health.ts, person-metrics.ts) NÃO
// usam `availableStageWhere` — filtram só pelo status da ETAPA. Uma etapa ACTIVE numa demanda
// morta vira carga de trabalho de alguém, e `person-metrics.ts` ainda calcula aging sobre
// `activatedAt`, que a importação carimba em 2025: toda etapa importada estouraria o SLA.
// `INACTIVE` é o mesmo valor que `revertTaskStage` grava para "etapa a ser reconquistada" — não
// afirma um trabalho que não aconteceu, ao contrário de `COMPLETED`.
describe("applyImportPlan — etapa aberta de demanda morta não é trabalho de ninguém", () => {
  async function statusDaEtapa(
    taskStatus: PlannedTask["status"],
    etapaFechada: boolean
  ): Promise<string> {
    const prisma = fakePrisma();
    const entrou = new Date("2026-01-05T10:00:00.000Z");
    const saiu = new Date("2026-01-06T10:00:00.000Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          status: taskStatus,
          stages: [
            stage({
              stageName: "Desenho",
              segments: [{ enteredAt: entrou, exitedAt: etapaFechada ? saiu : undefined }],
              completed: etapaFechada,
            }),
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const update = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    return update.data.status as string;
  }

  it("demanda IN_PROGRESS, etapa fechada → COMPLETED", async () => {
    expect(await statusDaEtapa("IN_PROGRESS", true)).toBe("COMPLETED");
  });

  it("demanda IN_PROGRESS, etapa aberta → ACTIVE (o trabalho parou ali, e continua sendo trabalho)", async () => {
    expect(await statusDaEtapa("IN_PROGRESS", false)).toBe("ACTIVE");
  });

  it("demanda COMPLETED, etapa fechada → COMPLETED", async () => {
    expect(await statusDaEtapa("COMPLETED", true)).toBe("COMPLETED");
  });

  it("demanda COMPLETED, etapa aberta → INACTIVE, nunca ACTIVE", async () => {
    expect(await statusDaEtapa("COMPLETED", false)).toBe("INACTIVE");
  });

  it("demanda OBSOLETE, etapa fechada → COMPLETED", async () => {
    expect(await statusDaEtapa("OBSOLETE", true)).toBe("COMPLETED");
  });

  it("demanda OBSOLETE, etapa aberta → INACTIVE, nunca ACTIVE", async () => {
    expect(await statusDaEtapa("OBSOLETE", false)).toBe("INACTIVE");
  });
});

describe("applyImportPlan — o log de etapa, um por segmento", () => {
  it("segmento fechado por devolução da revisão vira log REVERTED; os demais fecham COMPLETED", async () => {
    const prisma = fakePrisma();
    const entrouDesenho1 = new Date("2026-01-01T10:00:00.000Z");
    const entrouQC = new Date("2026-01-02T10:00:00.000Z");
    const devolvidoEm = new Date("2026-01-03T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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

  it("a mesma ida-e-volta produz StageTransition datadas no passado, uma entrada por segmento e uma saída por segmento fechado", async () => {
    const prisma = fakePrisma();
    const entrouDesenho1 = new Date("2026-01-01T10:00:00.000Z");
    const entrouQC = new Date("2026-01-02T10:00:00.000Z");
    const devolvidoEm = new Date("2026-01-03T10:00:00.000Z");
    const antesDoTeste = new Date();

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              segments: [
                { enteredAt: entrouDesenho1, exitedAt: entrouQC },
                { enteredAt: devolvidoEm }, // reaberta pela devolução, ainda em curso — só entrada
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

    expect(prisma.stageTransition.deleteMany).toHaveBeenCalledWith({
      where: { taskId: expect.any(String) },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transitions = (prisma.stageTransition as any)._rows as any[];
    // 3 segmentos ao todo (2 no Desenho + 1 na QC); os 2 fechados geram entrada+saída, o aberto só
    // entrada — 2+2+1 = 5. É a "mesma quantidade dos segmentos" que a rodada de conserto pediu:
    // cada segmento fechado conta 2 transições, cada aberto conta 1.
    expect(transitions).toHaveLength(5);

    // Datadas no PASSADO real (a data do Trello), não no instante da importação — é a garantia que
    // a Task 1 desta entrega (o parâmetro `at`) existe para sustentar.
    for (const t of transitions) {
      expect((t.at as Date).getTime()).toBeLessThan(antesDoTeste.getTime());
    }

    const desenhoTransitions = transitions.filter((t) => t.stageId === "s-desenho");
    expect(desenhoTransitions).toEqual([
      {
        id: expect.any(String),
        taskId: expect.any(String),
        stageId: "s-desenho",
        status: "ACTIVE",
        at: entrouDesenho1,
      },
      {
        id: expect.any(String),
        taskId: expect.any(String),
        stageId: "s-desenho",
        status: "COMPLETED",
        at: entrouQC,
      },
      {
        id: expect.any(String),
        taskId: expect.any(String),
        stageId: "s-desenho",
        status: "ACTIVE",
        at: devolvidoEm,
      },
      // segundo segmento ainda aberto: sem transição de saída.
    ]);

    // A saída da QC foi por devolução — INACTIVE (o mesmo status que `revertTaskStage` grava para a
    // etapa de onde se reverte), não um "REVERTED" inventado (ActiveStageStatus não tem esse valor).
    const qcTransitions = transitions.filter((t) => t.stageId === "s-qc");
    expect(qcTransitions).toEqual([
      {
        id: expect.any(String),
        taskId: expect.any(String),
        stageId: "s-qc",
        status: "ACTIVE",
        at: entrouQC,
      },
      {
        id: expect.any(String),
        taskId: expect.any(String),
        stageId: "s-qc",
        status: "INACTIVE",
        at: devolvidoEm,
      },
    ]);
  });

  it("retrabalho vira ReworkEvent com a etapa-origem e o responsável capturado na reversão", async () => {
    const prisma = fakePrisma();
    const devolvidoEm = new Date("2026-01-03T10:00:00.000Z");

    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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

// `createTaskCore` só carimba `startedAt` quando `initialAssigned` é verdadeiro, e o escritor não
// passa `assignments` de propósito (ver o comentário em writer.ts) — sem este conserto, nenhuma das
// 204 nasceria com `startedAt`, e `getCycleTimePercentiles` (reporting.ts) filtra
// `startedAt: { not: null }`.
describe("applyImportPlan — startedAt só com data medida", () => {
  function planComEtapas(stages: PlannedStage[], dueDate: Date | null = null): ImportPlan {
    return {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [plannedTask({ stages, dueDate })],
      skipped: [],
      unmatchedPeople: [],
    };
  }

  function carimbosDeInicio(prisma: PrismaClient) {
    return (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0]?.data?.startedAt !== undefined)
      .map((c) => c[0]);
  }

  it("demanda com segmento datado começa na MAIS ANTIGA das datas medidas", async () => {
    const prisma = fakePrisma();
    const maisAntiga = new Date("2026-01-04T08:00:00.000Z");
    const depois = new Date("2026-01-09T08:00:00.000Z");
    const plan = planComEtapas(
      [
        stage({ stageName: "Desenho", segments: [{ exitedAt: depois }] }),
        stage({ stageName: "Audio Visual", segments: [{ enteredAt: maisAntiga }] }),
      ],
      // Um prazo bem anterior: se o carimbo saísse da âncora inferida em vez da medida, seria este.
      new Date("2025-12-01T00:00:00.000Z")
    );

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const carimbos = carimbosDeInicio(prisma);
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0].data.startedAt).toEqual(maisAntiga);
    // Compare-and-set: só carimba se ainda estiver nulo (markTaskStarted, lib/task-start.ts).
    expect(carimbos[0].where.startedAt).toBeNull();
  });

  it("demanda sem NENHUM segmento datado fica com startedAt nulo — a âncora inferida não é medição", async () => {
    const prisma = fakePrisma();
    const plan = planComEtapas(
      [stage({ stageName: "Desenho", segments: [{}] })],
      new Date("2026-01-20T00:00:00.000Z")
    );

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(carimbosDeInicio(prisma)).toHaveLength(0);
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
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
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
