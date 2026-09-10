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
    { id: "s-relatorio", name: "Relatório" },
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
function fakePrisma(
  opts: {
    artifactExistsFor?: string[];
    explodeOnArtifactUrl?: string;
    existingProjects?: Array<{ name: string; clientId: string }>;
  } = {}
) {
  const existingArtifactUrls = new Set(opts.artifactExistsFor ?? []);
  const projectRows: Array<{ id: string; name: string; clientId: string }> = (
    opts.existingProjects ?? []
  ).map((p, i) => ({ id: `proj-existente-${i + 1}`, ...p }));
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
      // Casa TODAS as chaves do `where`, não só o nome: é assim que o Prisma se comporta, e é o que
      // deixa o teste ver a diferença entre procurar por `{ name }` e por `{ name, clientId }`.
      findFirst: vi
        .fn()
        .mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          const row = projectRows.find((p) =>
            Object.entries(where).every(([k, v]) => p[k as keyof typeof p] === v)
          );
          return row ? { id: row.id } : null;
        }),
      create: vi
        .fn()
        .mockImplementation(async ({ data }: { data: { name: string; clientId: string } }) => {
          projectSeq += 1;
          const row = { id: `proj-${projectSeq}`, name: data.name, clientId: data.clientId };
          projectRows.push(row);
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
    futureStages: [],
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

describe("applyImportPlan — o projeto mensal é do CLIENTE, não só do nome", () => {
  it("projeto de mesmo nome de OUTRO cliente não é reaproveitado", async () => {
    // Depois que a rodada de conserto 1 tirou a identidade do cliente do NOME do projeto, dois
    // clientes podem ter um "AtlanticoShop 2026-01" cada. Procurar só por `{ name }` cruzaria os
    // dois — as demandas importadas cairiam no projeto do cliente errado.
    const prisma = fakePrisma({
      existingProjects: [{ name: "AtlanticoShop 2026-01", clientId: "outro-cliente" }],
    });
    const plan = planCom(["https://trello.com/c/x1"]);

    const r = await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(r.projectsReused).toBe(0);
    expect(r.projectsCreated).toBe(1);
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: "AtlanticoShop 2026-01", clientId: "client1" },
    });
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

  it("demanda COMPLETED, etapa SEM saída medida → COMPLETED, fechada junto com a demanda", async () => {
    // A demanda foi entregue; a etapa de produção terminou até ali. Deixá-la INACTIVE mostraria
    // uma demanda entregue com etapa que nunca ativou. Nenhum registro de PERMANÊNCIA é inventado:
    // TaskStageLog só é escrito quando há entrada medida (writeStageHistory).
    expect(await statusDaEtapa("COMPLETED", false)).toBe("COMPLETED");
  });

  it("demanda OBSOLETE, etapa fechada → COMPLETED", async () => {
    expect(await statusDaEtapa("OBSOLETE", true)).toBe("COMPLETED");
  });

  it("demanda OBSOLETE, etapa aberta → INACTIVE, nunca ACTIVE", async () => {
    // A importação não produz mais OBSOLETE (arquivar era entregar), mas `MappedTask["status"]`
    // admite o valor e o produto o usa — a etapa aberta de uma demanda descartada continua não
    // sendo trabalho de ninguém.
    expect(await statusDaEtapa("OBSOLETE", false)).toBe("INACTIVE");
  });

  it("a etapa fechada junto com a demanda leva a data de conclusão DELA", async () => {
    const prisma = fakePrisma();
    const entregue = new Date("2025-06-26T10:00:00.000Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2025-06", name: "AtlanticoShop 2025-06", clientId: "client1" }],
      tasks: [
        plannedTask({
          monthKey: "2025-06",
          status: "COMPLETED",
          completedAt: entregue,
          stages: [stage({ stageName: "Desenho", segments: [{}] })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const update = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(update.data.status).toBe("COMPLETED");
    expect(update.data.completedAt).toEqual(entregue);
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

// A visita de ORIGEM da primeira movimentação nasce sem `enteredAt`: ninguém sabe quando o card
// entrou na primeira lista, só quando saiu (map-stages.ts). Com `enteredAt: seg.enteredAt ??
// historicalAt` — e `historicalAt` sendo, por construção, o `exitedAt` DESSA MESMA visita — isso
// virava um TaskStageLog de duração zero e um par de transições no mesmo instante: "0 h em
// Desenho" gravado como MEDIÇÃO, em 46 segmentos do plano real. É a mesma falta que a Ruling 11
// consertou uma vez (fundir visitas fabrica duração), reaparecendo na primeira visita.
describe("applyImportPlan — segmento sem entrada medida não fabrica permanência", () => {
  const saiu = new Date("2026-01-06T10:00:00.000Z");

  function planComSegmento(seg: { enteredAt?: Date; exitedAt?: Date }): ImportPlan {
    return {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          stages: [
            stage({ stageName: "Desenho", segments: [seg], completed: seg.exitedAt !== undefined }),
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function linhas(prisma: PrismaClient) {
    return {
      logs: (prisma.taskStageLog as any)._rows as any[],
      transitions: (prisma.stageTransition as any)._rows as any[],
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  it("segmento só com saída: zero TaskStageLog e exatamente uma transição, na data da saída", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planComSegmento({ exitedAt: saiu }), {
      commit: true,
      importedById: "u1",
    });

    const { logs, transitions } = linhas(prisma);
    // `TaskStageLog.enteredAt` é obrigatório no schema e não há valor honesto para ele — a entrada
    // não aconteceu num instante conhecido, então a linha não existe.
    expect(logs).toHaveLength(0);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ stageId: "s-desenho", status: "COMPLETED", at: saiu });
  });

  it("segmento completo continua produzindo o log e o par de transições", async () => {
    const prisma = fakePrisma();
    const entrou = new Date("2026-01-05T10:00:00.000Z");
    await applyImportPlan(prisma, planComSegmento({ enteredAt: entrou, exitedAt: saiu }), {
      commit: true,
      importedById: "u1",
    });

    const { logs, transitions } = linhas(prisma);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ enteredAt: entrou, exitedAt: saiu, status: "COMPLETED" });
    expect(transitions.map((t) => [t.status, t.at])).toEqual([
      ["ACTIVE", entrou],
      ["COMPLETED", saiu],
    ]);
  });

  it("segmento sem entrada NEM saída medidas não grava nada — nível 3 é etapa sabida, não medida", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planComSegmento({}), { commit: true, importedById: "u1" });

    const { logs, transitions } = linhas(prisma);
    expect(logs).toHaveLength(0);
    expect(transitions).toHaveLength(0);
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

  it("demanda só com data de CONCLUSÃO não começa — entrega não é evidência de início", async () => {
    // O arquivamento data a entrega das demandas antigas, e nenhuma delas tem segmento datado. Se
    // a conclusão contasse como início, ~100 demandas nasceriam com tempo de ciclo ZERO — um
    // número fabricado, indistinguível de um medido. O que a conclusão faz é limitar o início por
    // cima (teste seguinte), nunca criá-lo.
    const prisma = fakePrisma();
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          status: "COMPLETED",
          completedAt: new Date("2025-06-26T10:00:00.000Z"),
          stages: [stage({ segments: [{}] })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(carimbosDeInicio(prisma)).toHaveLength(0);
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

// Rodada de conserto residual (revisão da rodada de conserto). Três buracos que a re-revisão
// achou: a regra "saída medida também é início" não estava presa por teste nenhum; `completedAt`
// vindo de `dateCompleted` podia ser ANTERIOR à primeira data medida, gravando lead time negativo;
// e `createdAt` caía na âncora histórica quando o próprio id do card carrega a data de criação.
describe("applyImportPlan — a data de criação sai do id do card", () => {
  function planComCard(c: ExportCard, stages: PlannedStage[], dueDate: Date | null = null) {
    return {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [plannedTask({ card: c, stages, dueDate })],
      skipped: [],
      unmatchedPeople: [],
    } as ImportPlan;
  }

  function criacaoGravada(prisma: PrismaClient): Date {
    return (prisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.createdAt;
  }

  it("id do Trello vira a data real de criação, não a âncora do primeiro evento", async () => {
    const prisma = fakePrisma();
    // 680b9786 = 2025-04-25T14:09:10Z. É o mesmo card real do export (INm0k5De).
    const c = card({ id: "680b97863a68fa141b15a0f9", shortUrl: "https://trello.com/c/x1" });
    const plan = planComCard(c, [
      stage({ segments: [{ enteredAt: new Date("2026-08-14T12:00:00.000Z") }] }),
    ]);

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(criacaoGravada(prisma)).toEqual(new Date("2025-04-25T14:09:10.000Z"));
  });

  it("id que não é um ObjectId cai na âncora histórica, sem inventar data", async () => {
    const prisma = fakePrisma();
    const primeiroEvento = new Date("2026-08-14T12:00:00.000Z");
    const plan = planComCard(card({ id: "c1", shortUrl: "https://trello.com/c/x2" }), [
      stage({ segments: [{ enteredAt: primeiroEvento }] }),
    ]);

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(criacaoGravada(prisma)).toEqual(primeiroEvento);
  });

  it("criação posterior ao primeiro evento é incoerente e cai na âncora", async () => {
    const prisma = fakePrisma();
    // 680b9786 = 2025-04-25; o evento medido é de 2024, ANTES da criação decodificada.
    const primeiroEvento = new Date("2024-01-10T09:00:00.000Z");
    const plan = planComCard(card({ id: "680b97863a68fa141b15a0f9", shortUrl: "https://t/x3" }), [
      stage({ segments: [{ enteredAt: primeiroEvento }] }),
    ]);

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    expect(criacaoGravada(prisma)).toEqual(primeiroEvento);
  });
});

describe("applyImportPlan — o início nunca é posterior à conclusão", () => {
  it("demanda cuja única data medida é uma SAÍDA começa nela — saída prova que já tinha começado", async () => {
    const prisma = fakePrisma();
    const saida = new Date("2026-01-07T10:00:00.000Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          stages: [stage({ segments: [{ exitedAt: saida }] })],
          dueDate: new Date("2025-11-01T00:00:00.000Z"),
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const carimbos = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0]?.data?.startedAt !== undefined)
      .map((c) => c[0]);
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0].data.startedAt).toEqual(saida);
  });

  it("única data medida no instante da entrega (ou depois) não é início — fica nulo", async () => {
    const prisma = fakePrisma();
    // O caso real do card "Trend Que venden?": dateCompleted às 11:56, único anexo às 12:05. Não
    // sabemos quando o trabalho começou; sabemos quando ele foi entregue. Carimbar o início na
    // entrega produz tempo de ciclo ZERO — a mesma fabricação que a entrega-cria-início produzia,
    // só que menor. Medido na primeira gravação com esta regra: 8 demandas.
    const conclusao = new Date("2026-08-03T11:56:41.545Z");
    const anexo = new Date("2026-08-03T12:05:46.449Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-08", name: "AtlanticoShop 2026-08", clientId: "client1" }],
      tasks: [
        plannedTask({
          monthKey: "2026-08",
          status: "COMPLETED",
          completedAt: conclusao,
          stages: [stage({ segments: [{ enteredAt: anexo }], completed: true })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const carimbos = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0]?.data?.startedAt !== undefined)
      .map((c) => c[0]);
    // Nem 12:05 (início POSTERIOR à entrega, lead time negativo) nem 11:56 (início igual à
    // entrega, ciclo zero): nenhum dos dois é uma medição de quando o trabalho começou.
    expect(carimbos).toHaveLength(0);
  });

  it("data medida NO MESMO instante da entrega também não é início — ciclo zero é fabricação", async () => {
    const prisma = fakePrisma();
    const instante = new Date("2026-08-20T18:30:00.000Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-08", name: "AtlanticoShop 2026-08", clientId: "client1" }],
      tasks: [
        plannedTask({
          monthKey: "2026-08",
          status: "COMPLETED",
          completedAt: instante,
          stages: [stage({ segments: [{ enteredAt: instante }], completed: true })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const carimbos = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0]?.data?.startedAt !== undefined
    );
    expect(carimbos).toHaveLength(0);
  });

  it("data medida ANTES da entrega continua sendo o início", async () => {
    const prisma = fakePrisma();
    const comecou = new Date("2026-08-01T09:00:00.000Z");
    const entregue = new Date("2026-08-03T11:56:41.545Z");
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-08", name: "AtlanticoShop 2026-08", clientId: "client1" }],
      tasks: [
        plannedTask({
          monthKey: "2026-08",
          status: "COMPLETED",
          completedAt: entregue,
          stages: [stage({ segments: [{ enteredAt: comecou }], completed: true })],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const carimbos = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0]?.data?.startedAt !== undefined)
      .map((c) => c[0]);
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0].data.startedAt).toEqual(comecou);
  });
});

// As etapas que uma demanda ABERTA tem pela frente entram como etapa da tarefa (senão o produto não
// teria o que ativar quando o Desenho fechar), mas NÃO entram no histórico: não há data, não há
// dono e não houve permanência nenhuma para registrar.
describe("applyImportPlan — as etapas pela frente entram sem histórico", () => {
  function planComFuturas(): ImportPlan {
    return {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              segments: [{ enteredAt: new Date("2026-01-05T09:00:00.000Z") }],
            }),
          ],
          futureStages: [
            { stageName: "Quality Control" },
            { stageName: "Aprovação" },
            { stageName: "Relatório" },
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };
  }

  it("a etapa pela frente vira linha da tarefa, junto com a que tem evidência", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planComFuturas(), { commit: true, importedById: "u1" });

    const criadas = (prisma.taskActiveStage.create as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].data.stageId
    );
    expect(new Set(criadas)).toEqual(new Set(["s-desenho", "s-qc", "s-aprov", "s-relatorio"]));
  });

  it("a etapa pela frente COM dono declarado recebe o dono, e só ele", async () => {
    const prisma = fakePrisma();
    const plan: ImportPlan = {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          stages: [
            stage({
              stageName: "Desenho",
              segments: [{ enteredAt: new Date("2026-01-05T09:00:00.000Z") }],
            }),
          ],
          futureStages: [
            { stageName: "Quality Control" },
            { stageName: "Aprovação", assigneeUserId: "u-pedro" },
            { stageName: "Relatório", assigneeUserId: "u-pedro" },
          ],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };

    await applyImportPlan(prisma, plan, { commit: true, importedById: "u1" });

    const comDono = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((c) => c.data.assigneeId === "u-pedro");
    expect(comDono.map((c) => c.where.taskId_stageId.stageId).sort()).toEqual([
      "s-aprov",
      "s-relatorio",
    ]);
    // A atribuição de uma etapa pendente é roteamento feito AGORA, não fato histórico.
    for (const c of comDono) expect(c.data.assignedAt).toBeInstanceOf(Date);
    // A etapa sem dono declarado continua sem ninguém.
    const qc = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((c) => c.where.taskId_stageId.stageId === "s-qc");
    expect(qc).toEqual([]);
  });

  it("a etapa pela frente não recebe data, dono nem registro de permanência", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planComFuturas(), { commit: true, importedById: "u1" });

    const ajustadas = (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].where.taskId_stageId.stageId
    );
    expect(ajustadas).toEqual(["s-desenho"]);

    const logs = (prisma.taskStageLog as unknown as { _rows: Array<{ stageId: string }> })._rows;
    expect(logs.map((l) => l.stageId)).toEqual(["s-desenho"]);
  });
});

// Uma demanda ABERTA precisa ter uma etapa ativa: etapa nenhuma ativa é trabalho que não aparece na
// fila de ninguém. Quando a última etapa com evidência já fechou, o produto teria promovido a
// seguinte na hora daquele fechamento — a importação escreve o estado direto, então essa promoção
// não acontece sozinha. Caso real da primeira gravação: "202602 - Atlantico - Animación para LEDs",
// com Aprovação fechada e Relatório parado em INACTIVE, sem nada para ativá-lo.
describe("applyImportPlan — demanda aberta nunca fica sem etapa ativa", () => {
  const saida = new Date("2026-08-19T11:41:25.894Z");

  function planoCom(status: "IN_PROGRESS" | "COMPLETED", completa: boolean): ImportPlan {
    return {
      projects: [{ monthKey: "2026-01", name: "AtlanticoShop 2026-01", clientId: "client1" }],
      tasks: [
        plannedTask({
          status,
          completedAt: status === "COMPLETED" ? saida : null,
          stages: [
            stage({
              stageName: "Aprovação",
              segments: [
                {
                  enteredAt: new Date("2026-08-01T09:00:00.000Z"),
                  exitedAt: completa ? saida : undefined,
                },
              ],
              completed: completa,
            }),
          ],
          // Sempre com etapa pela frente, inclusive na CONCLUÍDA: o plano nunca produz isso
          // (futureStagesFor devolve vazio fora de IN_PROGRESS), e é justamente por isso que o
          // teste precisa montar o caso à mão — senão a fixture provaria a guarda por acidente.
          futureStages: [{ stageName: "Relatório" }],
        }),
      ],
      skipped: [],
      unmatchedPeople: [],
    };
  }

  function promocoes(prisma: PrismaClient) {
    return (prisma.taskActiveStage.update as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((c) => c.data.status === "ACTIVE");
  }

  it("etapa com evidência já fechada: a próxima pela frente é ativada na hora do fechamento", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planoCom("IN_PROGRESS", true), {
      commit: true,
      importedById: "u1",
    });

    const ativadas = promocoes(prisma);
    expect(ativadas).toHaveLength(1);
    expect(ativadas[0].where.taskId_stageId.stageId).toBe("s-relatorio");
    // A ativação é datada pelo fim da etapa anterior — o instante em que o produto teria promovido.
    expect(ativadas[0].data.activatedAt).toEqual(saida);
  });

  it("etapa com evidência ainda aberta: ela já é a ativa, nada é promovido", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planoCom("IN_PROGRESS", false), {
      commit: true,
      importedById: "u1",
    });

    const ativadas = promocoes(prisma);
    expect(ativadas.map((c) => c.where.taskId_stageId.stageId)).toEqual(["s-aprov"]);
  });

  it("demanda concluída não promove nada — não há trabalho pela frente", async () => {
    const prisma = fakePrisma();
    await applyImportPlan(prisma, planoCom("COMPLETED", true), {
      commit: true,
      importedById: "u1",
    });

    expect(promocoes(prisma)).toEqual([]);
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
