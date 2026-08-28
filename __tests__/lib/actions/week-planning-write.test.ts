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
    user: { findMany: vi.fn() },
    taskActiveStage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn(),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { scheduleStage, unscheduleStage, moveStageOrder } from "@/lib/actions/week-planning";

const db = prisma as unknown as {
  taskActiveStage: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
};

describe("scheduleStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.taskActiveStage.aggregate.mockResolvedValue({ _max: { plannedOrder: 2 } });
  });

  it("programa etapa livre: grava dia, ordem no fim e o responsável", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    const r = await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" });
    expect(r).toEqual({ success: true });
    const data = db.taskActiveStage.update.mock.calls[0][0].data;
    expect(data.assigneeId).toBe("u1");
    expect(data.plannedOrder).toBe(3); // entra no fim do dia
    expect(formatUTC(data.plannedDate)).toBe("2026-08-31");
  });

  it("programa etapa AINDA NÃO liberada — programar não é executar", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "INACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa etapa concluída", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "COMPLETED",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "completedStage",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa puxar etapa que já é de outra pessoa", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "outro",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-08-31" })
    ).toEqual({
      error: "alreadyAssigned",
    });
  });

  it("reprogramar quem JÁ é da pessoa é permitido — é mover de dia", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(
      await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "2026-09-01" })
    ).toEqual({
      success: true,
    });
  });

  it("recusa data malformada, sem escrever", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: null,
      status: "ACTIVE",
    });
    expect(await scheduleStage({ activeStageId: "as1", userId: "u1", dateISO: "31/08" })).toEqual({
      error: "invalidDate",
    });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });
});

describe("unscheduleStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limpa dia e ordem, e devolve a etapa ao poço", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
    });
    expect(await unscheduleStage("as1")).toEqual({ success: true });
    expect(db.taskActiveStage.update.mock.calls[0][0].data).toEqual({
      plannedDate: null,
      plannedOrder: null,
      assigneeId: null,
    });
  });
});

describe("moveStageOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("troca a ordem com o vizinho de cima", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 2,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as1", plannedOrder: 1 },
      { id: "as2", plannedOrder: 2 },
    ]);
    expect(await moveStageOrder("as2", "up")).toEqual({ success: true });
    // Não basta contar duas escritas — precisa ser ESTA troca: cada um assume a
    // posição do outro, sem inventar id nem repetir valor.
    expect(db.taskActiveStage.update).toHaveBeenNthCalledWith(1, {
      where: { id: "as2" },
      data: { plannedOrder: 1 },
    });
    expect(db.taskActiveStage.update).toHaveBeenNthCalledWith(2, {
      where: { id: "as1" },
      data: { plannedOrder: 2 },
    });
  });

  it("mover um de dois EMPATADOS troca as posições de verdade", async () => {
    // Com o mesmo `plannedOrder` nos dois, trocar os valores escreveria o mesmo número em ambos:
    // o gestor clicava na seta e nada mudava, sem erro nenhum. No empate o dia é renumerado a
    // partir da ordem que a tela mostra (desempatada por id), com os dois na posição nova.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as1", plannedOrder: 1 },
      { id: "as2", plannedOrder: 1 },
    ]);
    expect(await moveStageOrder("as2", "up")).toEqual({ success: true });

    // O resultado precisa ser uma ordem em que as2 vem antes de as1 — e com números DISTINTOS,
    // senão o próximo clique cairia no mesmo empate.
    const escritas = new Map<string, number>([
      ["as1", 1],
      ["as2", 1],
    ]);
    for (const [call] of db.taskActiveStage.update.mock.calls as [
      { where: { id: string }; data: { plannedOrder: number } },
    ][]) {
      escritas.set(call.where.id, call.data.plannedOrder);
    }
    expect(escritas.get("as2")!).toBeLessThan(escritas.get("as1")!);
  });

  it("pede a lista do dia já desempatada por id", async () => {
    // A seta precisa agir sobre a MESMA ordem que o gestor está vendo; a tela desempata por id.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([{ id: "as1", plannedOrder: 1 }]);
    await moveStageOrder("as1", "up");
    expect(db.taskActiveStage.findMany.mock.calls[0][0].orderBy).toEqual([
      { plannedOrder: "asc" },
      { id: "asc" },
    ]);
  });

  it("subir o primeiro não faz nada e não é erro", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([{ id: "as1", plannedOrder: 1 }]);
    expect(await moveStageOrder("as1", "up")).toEqual({ success: true });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("descer o último item não escreve nada", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 2,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as1", plannedOrder: 1 },
      { id: "as2", plannedOrder: 2 },
    ]);
    expect(await moveStageOrder("as2", "down")).toEqual({ success: true });
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("recusa mover etapa com horário marcado — ela acontece na hora dela, não na vez dela", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as1",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 1,
      scheduledStart: new Date("2026-08-31T14:00:00Z"),
    });
    expect(await moveStageOrder("as1", "down")).toEqual({ error: "scheduledStage" });
    // Recusa antes mesmo de consultar a fila do dia — não há o que reordenar aqui.
    expect(db.taskActiveStage.findMany).not.toHaveBeenCalled();
    expect(db.taskActiveStage.update).not.toHaveBeenCalled();
  });

  it("etapa agendada nunca é candidata a vizinha — fica de fora da consulta da fila manual", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "as2",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 2,
      scheduledStart: null,
    });
    // A consulta traz o dia INTEIRO, agendados inclusive (eles precisam ser renumerados junto no
    // empate, senão saltariam de posição sozinhos); quem os tira da fila manual é o filtro em
    // memória.
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "as2", plannedOrder: 2, scheduledStart: null },
      { id: "asX", plannedOrder: 3, scheduledStart: new Date("2026-08-31T14:00:00Z") },
      { id: "as3", plannedOrder: 4, scheduledStart: null },
    ]);
    expect(await moveStageOrder("as2", "down")).toEqual({ success: true });
    expect(db.taskActiveStage.findMany.mock.calls[0][0].where).not.toHaveProperty("scheduledStart");
    // O comum troca com o próximo NÃO-agendado (as3), saltando o agendado que está no meio: um
    // item com hora marcada não é um degrau da fila.
    expect(db.taskActiveStage.update).toHaveBeenNthCalledWith(1, {
      where: { id: "as2" },
      data: { plannedOrder: 4 },
    });
    expect(db.taskActiveStage.update).toHaveBeenNthCalledWith(2, {
      where: { id: "as3" },
      data: { plannedOrder: 2 },
    });
  });

  it("renumerar no empate não desloca o item agendado", async () => {
    // A renumeração é sobre o dia inteiro, na ordem exibida. Se ela pulasse o agendado, ele
    // ficaria com o número da escala velha e saltaria de posição sozinho — no dia A(1), B(5,
    // agendado), C(10), D(10), subir D renumeraria A=1, D=2, C=3 e jogaria B para o fim, sem
    // ninguém ter tocado nele.
    db.taskActiveStage.findUnique.mockResolvedValue({
      id: "D",
      assigneeId: "u1",
      status: "ACTIVE",
      plannedDate: new Date("2026-08-31T00:00:00Z"),
      plannedOrder: 10,
      scheduledStart: null,
    });
    db.taskActiveStage.findMany.mockResolvedValue([
      { id: "A", plannedOrder: 1, scheduledStart: null },
      { id: "B", plannedOrder: 5, scheduledStart: new Date("2026-08-31T14:00:00Z") },
      { id: "C", plannedOrder: 10, scheduledStart: null },
      { id: "D", plannedOrder: 10, scheduledStart: null },
    ]);
    expect(await moveStageOrder("D", "up")).toEqual({ success: true });

    const ordem = new Map<string, number>([
      ["A", 1],
      ["B", 5],
      ["C", 10],
      ["D", 10],
    ]);
    for (const [call] of db.taskActiveStage.update.mock.calls as [
      { where: { id: string }; data: { plannedOrder: number } },
    ][]) {
      ordem.set(call.where.id, call.data.plannedOrder);
    }
    const ordenado = [...ordem.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    // D subiu uma posição na fila manual; B continua entre A e o resto, onde sempre esteve.
    expect(ordenado).toEqual(["A", "B", "D", "C"]);
  });
});

function formatUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
