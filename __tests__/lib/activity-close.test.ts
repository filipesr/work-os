import { describe, it, expect, vi, beforeEach } from "vitest";
import { closeActivityLog, hoursBetween, shouldRecordTime } from "@/lib/activity-close";

const makeClient = () => ({
  activityLog: { update: vi.fn(async (_a: unknown) => ({})) },
  timeLog: { create: vi.fn(async (_a: unknown) => ({})) },
});

const LOG = {
  id: "log-1",
  userId: "u1",
  taskId: "t1",
  stageId: "s1",
  startedAt: new Date("2026-08-12T09:00:00Z"),
};

describe("hoursBetween", () => {
  it("converte para horas com 2 casas", () => {
    expect(hoursBetween(new Date("2026-08-12T09:00:00Z"), new Date("2026-08-12T11:30:00Z"))).toBe(
      2.5
    );
    expect(hoursBetween(new Date("2026-08-12T09:00:00Z"), new Date("2026-08-12T09:20:00Z"))).toBe(
      0.33
    );
  });
});

describe("shouldRecordTime", () => {
  it("ignora duração zero — start/stop acidental não vira linha de ruído", () => {
    expect(shouldRecordTime(0)).toBe(false);
    expect(shouldRecordTime(0.01)).toBe(true);
  });
});

describe("closeActivityLog — o caminho único de fechamento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fecha o log E registra as horas", async () => {
    // O BUG que isso corrige: a troca automática de tarefa só carimbava
    // `endedAt`, sem criar TimeLog — o tempo da tarefa anterior sumia do
    // relatório de horas, da utilização e de todo o resto.
    const client = makeClient();
    const endedAt = new Date("2026-08-12T11:00:00Z");

    const result = await closeActivityLog(client as never, LOG, endedAt, "trocou de prioridade");

    expect(client.activityLog.update).toHaveBeenCalledTimes(1);
    expect(client.timeLog.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ hoursSpent: 2, recorded: true });
  });

  it("o TimeLog herda pessoa, tarefa e etapa do período fechado", async () => {
    const client = makeClient();
    await closeActivityLog(client as never, LOG, new Date("2026-08-12T10:00:00Z"), "motivo");

    const data = (client.timeLog.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      userId: "u1",
      taskId: "t1",
      stageId: "s1",
      hoursSpent: 1,
      description: "motivo",
    });
  });

  it("guarda a justificativa como descrição das horas", async () => {
    const client = makeClient();
    await closeActivityLog(client as never, LOG, new Date("2026-08-12T10:00:00Z"), "  urgência  ");
    const data = (client.timeLog.create.mock.calls[0][0] as { data: { description: string } }).data;
    expect(data.description).toBe("urgência");
  });

  it("descrição vazia vira null, não string em branco", async () => {
    const client = makeClient();
    await closeActivityLog(client as never, LOG, new Date("2026-08-12T10:00:00Z"), "   ");
    const data = (client.timeLog.create.mock.calls[0][0] as { data: { description: null } }).data;
    expect(data.description).toBeNull();
  });

  it("duração zero fecha o log mas NÃO cria TimeLog", async () => {
    const client = makeClient();
    const result = await closeActivityLog(client as never, LOG, LOG.startedAt);

    expect(client.activityLog.update).toHaveBeenCalledTimes(1);
    expect(client.timeLog.create).not.toHaveBeenCalled();
    expect(result.recorded).toBe(false);
  });

  it("libera `openForUserId` ao fechar — senão a pessoa fica travada", async () => {
    // A invariante do schema: `openForUserId` é não-nulo EXATAMENTE enquanto
    // `endedAt` é nulo. Este é o lado perigoso dela. Esquecer de limpar não
    // quebra nada visível na hora: o período fica fechado, as horas entram, o
    // relatório fecha. Mas o índice único continua enxergando a pessoa como
    // ocupada, e o próximo "Iniciar" dela falha — com erro de constraint, longe
    // daqui, sem nada apontando para o fechamento que não limpou.
    const client = makeClient();
    await closeActivityLog(client as never, LOG, new Date("2026-08-12T10:00:00Z"), "x");

    const data = (client.activityLog.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.openForUserId).toBeNull();
  });

  it("fecha e libera na MESMA escrita", async () => {
    // Dois updates separados abririam uma janela em que o período está fechado
    // mas a pessoa ainda consta ocupada. Uma escrita só torna isso atômico.
    const client = makeClient();
    await closeActivityLog(client as never, LOG, new Date("2026-08-12T10:00:00Z"));

    expect(client.activityLog.update).toHaveBeenCalledTimes(1);
    const data = (client.activityLog.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(Object.keys(data).sort()).toEqual(["endedAt", "openForUserId"]);
  });

  it("libera mesmo quando a duração é zero e não há TimeLog", async () => {
    // O caminho que sai mais cedo: sem horas para registrar, é fácil o
    // fechamento virar um atalho que esquece a coluna.
    const client = makeClient();
    await closeActivityLog(client as never, LOG, LOG.startedAt);

    const data = (client.activityLog.update.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.openForUserId).toBeNull();
    expect(client.timeLog.create).not.toHaveBeenCalled();
  });

  it("fecha com o instante recebido, não com 'agora'", async () => {
    // O caller controla o instante para que o fechamento e o TimeLog usem
    // exatamente o mesmo — senão as horas e o `logDate` divergem.
    const client = makeClient();
    const endedAt = new Date("2026-08-12T12:00:00Z");
    await closeActivityLog(client as never, LOG, endedAt, "x");

    const upd = client.activityLog.update.mock.calls[0][0] as { data: { endedAt: Date } };
    const tl = client.timeLog.create.mock.calls[0][0] as { data: { logDate: Date } };
    expect(upd.data.endedAt).toBe(endedAt);
    expect(tl.data.logDate).toBe(endedAt);
  });
});
