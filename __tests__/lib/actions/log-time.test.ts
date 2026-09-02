import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
  requireManagerOrAdmin: vi.fn().mockResolvedValue({ id: "ana", role: "ADMIN" }),
  getSessionUser: vi.fn().mockResolvedValue({ id: "ana", role: "MEMBER" }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    task: { findUnique: vi.fn() },
    taskActiveStage: { findUnique: vi.fn() },
    timeLog: { create: vi.fn().mockResolvedValue({ id: "tl1" }) },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { logTime } from "@/lib/actions/task";
import { formatISODate, nowInSaoPaulo, realInstant } from "@/lib/dates";

/** O que o `<input type="date">` do formulário entrega: meia-noite UTC, que é a convenção
 *  SP-local usada por `plannedDate`. */
function diaEscolhido(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function logGravado(): { logDate: Date; stageId: string | null } {
  return (
    vi.mocked(prisma.timeLog.create).mock.calls[0][0] as never as {
      data: { logDate: Date; stageId: string | null };
    }
  ).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.timeLog.create).mockResolvedValue({ id: "tl1" } as never);
  vi.mocked(prisma.task.findUnique).mockResolvedValue({
    id: "t1",
    projectId: "p1",
    activeStages: [{ stageId: "s1" }],
  } as never);
});

describe("logTime — o dia informado vira INSTANTE REAL", () => {
  it("o apontamento manual cai no dia que a pessoa escolheu, não no anterior", async () => {
    // O defeito: gravar meia-noite UTC numa coluna de instante real. Quem lê agrupando pelo
    // calendário de São Paulo (`/planning/client-load`) via o apontamento de terça na SEGUNDA.
    await logTime("t1", 2, diaEscolhido("2026-09-08"));

    const { logDate } = logGravado();
    expect(formatISODate(nowInSaoPaulo(logDate))).toBe("2026-09-08");
    expect(logDate.toISOString()).toBe("2026-09-08T03:00:00.000Z");
  });

  it("o apontamento de SEGUNDA entra na semana da segunda, e não na fresta entre duas semanas", async () => {
    // A pior versão do mesmo erro: a segunda-feira gravada como meia-noite UTC caía nas três horas
    // ANTES do início real da semana — depois do fim da semana anterior. O log não aparecia em
    // nenhuma das duas.
    const SEGUNDA = "2026-09-07";
    const SABADO = "2026-09-12";
    const inicioReal = realInstant(new Date(`${SEGUNDA}T00:00:00Z`));
    const fimReal = realInstant(new Date(`${SABADO}T23:59:59Z`));
    const fimDaSemanaAnterior = new Date(inicioReal.getTime() - 1);

    await logTime("t1", 2, diaEscolhido(SEGUNDA));

    const { logDate } = logGravado();
    expect(logDate.getTime()).toBeGreaterThanOrEqual(inicioReal.getTime());
    expect(logDate.getTime()).toBeLessThanOrEqual(fimReal.getTime());
    expect(logDate.getTime()).toBeGreaterThan(fimDaSemanaAnterior.getTime());
  });
});

describe("logTime — a etapa vem da TELA, não da adivinhação (fix round 1, Task 9)", () => {
  // `activeStages[0]` era uma etapa qualquer entre as ACTIVE da demanda — com fork/join (duas
  // etapas ACTIVE ao mesmo tempo) apontar hora pela tela da Edição podia gravar na Gravação.

  it("com etapa informada, grava o TemplateStage DAQUELA etapa (não a primeira ACTIVE)", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      taskId: "t1",
      stageId: "ts-edicao",
    } as never);
    // A primeira ACTIVE da demanda é outra etapa — se a função ainda adivinhasse, gravaria "s1".
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      id: "t1",
      projectId: "p1",
      activeStages: [{ stageId: "s1" }],
    } as never);

    await logTime("t1", 2, diaEscolhido("2026-09-08"), undefined, "as-edicao");

    expect(prisma.taskActiveStage.findUnique).toHaveBeenCalledWith({
      where: { id: "as-edicao" },
      select: { taskId: true, stageId: true },
    });
    expect(logGravado().stageId).toBe("ts-edicao");
  });

  it("etapa informada de OUTRA demanda é ignorada — cai no comportamento antigo, não grava errado", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      taskId: "OUTRA-DEMANDA",
      stageId: "ts-de-outra-demanda",
    } as never);

    await logTime("t1", 2, diaEscolhido("2026-09-08"), undefined, "as-de-outra-demanda");

    // Não usa o stageId da etapa alheia — cai no fallback (activeStages[0] do mock global: "s1").
    expect(logGravado().stageId).toBe("s1");
  });

  it("sem etapa informada, cai no comportamento de hoje (primeira ACTIVE da demanda)", async () => {
    await logTime("t1", 2, diaEscolhido("2026-09-08"));

    expect(prisma.taskActiveStage.findUnique).not.toHaveBeenCalled();
    expect(logGravado().stageId).toBe("s1");
  });
});
