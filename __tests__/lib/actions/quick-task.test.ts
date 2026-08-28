import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "u1", name: "Ana" }),
}));

const tx = {
  task: { create: vi.fn().mockResolvedValue({ id: "t1" }) },
  taskActiveStage: { create: vi.fn().mockResolvedValue({}) },
  taskStageLog: { create: vi.fn().mockResolvedValue({}) },
  stageTransition: { create: vi.fn().mockResolvedValue({}) },
  timeLog: { create: vi.fn().mockResolvedValue({}) },
  taskArtifact: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    workflowTemplate: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { createQuickTask } from "@/lib/actions/quick-task";

const db = prisma as unknown as {
  workflowTemplate: { findUnique: ReturnType<typeof vi.fn> };
  project: { findUnique: ReturnType<typeof vi.fn> };
};

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    templateId: "tpl",
    projectId: "p1",
    date: "2026-08-28",
    minutes: "40",
    title: "Story de loja",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v !== "") fd.append(k, v);
  return fd;
}

describe("createQuickTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(tx).forEach((m) =>
      Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear())
    );
    db.workflowTemplate.findUnique.mockResolvedValue({
      id: "tpl",
      quickEntry: true,
      stages: [{ id: "s1" }],
    });
    db.project.findUnique.mockResolvedValue({ id: "p1" });
    // `setSystemTime` só tem efeito com fake timers ligados; sem isto a data de "hoje" seria a real
    // e os testes de janela passariam ou falhariam conforme o dia em que a suíte roda.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grava a demanda já concluída, com a etapa única concluída", async () => {
    const res = await createQuickTask(form());
    expect(res).toEqual({ success: true, taskId: "t1" });

    const task = tx.task.create.mock.calls[0][0].data;
    expect(task.status).toBe("COMPLETED");
    expect(task.workflowTemplateId).toBe("tpl");
    // createdAt = startedAt: queue time zero, que é a verdade desta classe.
    expect(task.createdAt.toISOString()).toBe(task.startedAt.toISOString());
    expect(task.completedAt.getTime() - task.startedAt.getTime()).toBe(40 * 60 * 1000);

    const stage = tx.taskActiveStage.create.mock.calls[0][0].data;
    expect(stage.status).toBe("COMPLETED");
    expect(stage.assigneeId).toBe("u1"); // quem registra é quem fez
  });

  it("grava as horas no dia informado, em HORAS", async () => {
    await createQuickTask(form({ minutes: "90" }));
    const log = tx.timeLog.create.mock.calls[0][0].data;
    expect(log.hoursSpent).toBeCloseTo(1.5, 5);
    expect(log.userId).toBe("u1");
  });

  it("grava o link como artefato quando informado", async () => {
    await createQuickTask(form({ link: "https://instagram.com/p/abc" }));
    expect(tx.taskArtifact.create).toHaveBeenCalledTimes(1);
    expect(tx.taskArtifact.create.mock.calls[0][0].data.storageKind).toBe("LINK");
  });

  it("não cria artefato quando não há link", async () => {
    await createQuickTask(form());
    expect(tx.taskArtifact.create).not.toHaveBeenCalled();
  });

  it("recusa template que não é de fluxo rápido, sem escrever nada", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({
      id: "tpl",
      quickEntry: false,
      stages: [{ id: "s1" }],
    });
    expect(await createQuickTask(form())).toEqual({ error: "templateNotQuick" });
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it("recusa data futura e data fora da janela", async () => {
    expect(await createQuickTask(form({ date: "2026-08-29" }))).toEqual({ error: "dateFuture" });
    expect(await createQuickTask(form({ date: "2026-08-01" }))).toEqual({ error: "dateTooOld" });
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it("recusa tempo ausente ou zero", async () => {
    expect(await createQuickTask(form({ minutes: "0" }))).toEqual({ error: "minutesInvalid" });
  });
});
