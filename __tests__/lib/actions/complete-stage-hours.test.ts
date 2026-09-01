import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi
    .fn()
    .mockResolvedValue(new Map([["s1", { hours: 4, source: "observed" }]])),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "ADMIN" }) },
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    stageTransition: { create: vi.fn().mockResolvedValue({}) },
    templateStage: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    timeLog: { aggregate: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    activityLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    stageCompletionNote: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { completeStageAndAdvance } from "@/lib/actions/task";

function cenario(horasJaApontadas: number) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "ana", name: "Ana", email: "ana@x.com", role: "ADMIN" },
  } as never);
  vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "ana",
    stageId: "s1",
    stage: { id: "s1", name: "Edição", template: {}, defaultTeam: null },
    task: { id: "t1", project: { client: {} } },
  } as never);
  vi.mocked(prisma.templateStage.findUnique).mockResolvedValue({ templateId: "tpl" } as never);
  vi.mocked(prisma.timeLog.aggregate).mockResolvedValue({
    _sum: { hoursSpent: horasJaApontadas },
  } as never);
  // `clearAllMocks` não desfaz `mockResolvedValue` de um teste anterior — só limpa o histórico de
  // chamadas. Sem este reset, um cenário com cronômetro aberto vazaria para o próximo teste.
  vi.mocked(prisma.activityLog.findFirst).mockResolvedValue(null);
}

beforeEach(() => vi.clearAllMocks());

describe("completeStageAndAdvance — apontamento", () => {
  it("recusa concluir sem hora quando nada foi apontado", async () => {
    // A metade "realizado" de todas as telas de tempo nasce aqui. Sem esta trava ela continua
    // sendo um campo em branco com cara de zero.
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1");
    expect(r).toEqual({ error: "hoursRequired" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("não exige nada quando o cronômetro já apontou dentro da referência", async () => {
    // O atrito é proporcional ao que falta: quem trabalhou com o relógio ligado não digita nada.
    cenario(3);
    const r = await completeStageAndAdvance("t1", "s1");
    expect(r).toMatchObject({ success: true });
    expect(prisma.timeLog.create).not.toHaveBeenCalled();
  });

  it("recusa hora menor que a já apontada", async () => {
    // O cronômetro gravou períodos reais, com início e fim. Apagá-los por um campo de texto seria
    // destruir medição em silêncio.
    cenario(3);
    const r = await completeStageAndAdvance("t1", "s1", undefined, { hours: 2 });
    expect(r).toEqual({ error: "hoursBelowLogged" });
  });

  it("grava só a DIFERENÇA como apontamento complementar", async () => {
    cenario(1);
    await completeStageAndAdvance("t1", "s1", undefined, { hours: 3 });
    const data = vi.mocked(prisma.timeLog.create).mock.calls[0][0].data as {
      hoursSpent: number;
      userId: string;
    };
    expect(data.hoursSpent).toBe(2);
    // As horas são de quem fez o trabalho, não de quem clicou em concluir.
    expect(data.userId).toBe("ana");
  });

  it("acima da referência exige motivo", async () => {
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1", undefined, { hours: 9 });
    expect(r).toEqual({ error: "reasonRequired" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("com motivo, conclui e grava a nota com a referência da época", async () => {
    cenario(0);
    const r = await completeStageAndAdvance("t1", "s1", undefined, {
      hours: 9,
      reason: "EXTERNAL_INTERRUPTION",
      note: "chefe pediu outra coisa",
    });
    expect(r).toMatchObject({ success: true });
    const data = vi.mocked(prisma.stageCompletionNote.create).mock.calls[0][0].data as {
      reason: string;
      hoursLogged: number;
      referenceHours: number;
    };
    expect(data.reason).toBe("EXTERNAL_INTERRUPTION");
    expect(data.hoursLogged).toBe(9);
    // Sem a régua da época ninguém reconstrói depois por que a justificativa foi pedida.
    expect(data.referenceHours).toBe(4);
  });

  it("dentro da referência não grava nota nenhuma", async () => {
    cenario(3);
    await completeStageAndAdvance("t1", "s1");
    expect(prisma.stageCompletionNote.create).not.toHaveBeenCalled();
  });

  it("cronômetro aberto e motivo faltando: recusa e não fecha o cronômetro", async () => {
    // Fechar é escrita. Uma recusa — por hora ou por motivo — não pode ter gravado nada no
    // caminho: nem o TimeLog complementar, nem o fechamento do período em aberto.
    cenario(0);
    vi.mocked(prisma.activityLog.findFirst).mockResolvedValue({
      id: "log1",
      userId: "ana",
      taskId: "t1",
      stageId: "s1",
      startedAt: new Date(Date.now() - 9 * 3_600_000), // 9h atrás: acima da referência (4h)
    } as never);
    const r = await completeStageAndAdvance("t1", "s1");
    expect(r).toEqual({ error: "reasonRequired" });
    expect(prisma.activityLog.update).not.toHaveBeenCalled();
  });

  it("gestor conclui etapa de outra pessoa: a hora complementar é do responsável", async () => {
    // Cobre especificamente a restrição da task: as horas são de quem FEZ o trabalho, mesmo
    // quando quem clica em concluir é outra pessoa. Com `cenario` o autor e o responsável são o
    // mesmo ("ana"), e por isso não bastava para provar isto — aqui eles são pessoas diferentes.
    vi.mocked(auth).mockResolvedValue({
      user: { id: "gestor", name: "Gestor", email: "g@x.com", role: "ADMIN" },
    } as never);
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: "bruno",
      stageId: "s1",
      stage: { id: "s1", name: "Edição", template: {}, defaultTeam: null },
      task: { id: "t1", project: { client: {} } },
    } as never);
    vi.mocked(prisma.templateStage.findUnique).mockResolvedValue({ templateId: "tpl" } as never);
    vi.mocked(prisma.timeLog.aggregate).mockResolvedValue({
      _sum: { hoursSpent: 1 },
    } as never);
    // Sem `cenario` aqui — reseta explicitamente o que o teste anterior deixou configurado.
    vi.mocked(prisma.activityLog.findFirst).mockResolvedValue(null);

    await completeStageAndAdvance("t1", "s1", undefined, { hours: 3 });

    const data = vi.mocked(prisma.timeLog.create).mock.calls[0][0].data as {
      hoursSpent: number;
      userId: string;
    };
    expect(data.hoursSpent).toBe(2);
    expect(data.userId).toBe("bruno");
  });
});
