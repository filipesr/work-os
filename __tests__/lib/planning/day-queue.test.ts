import { describe, it, expect } from "vitest";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";

// Esta função decide o que cada pessoa vê como "o que fazer agora". Erra em silêncio: nenhuma tela
// quebra se a ordem sair errada — só a pessoa trabalha na coisa errada, ou o gestor deixa de ver um
// agendamento que não vai acontecer.

function item(over: Partial<QueueItemInput> & { id: string }): QueueItemInput {
  return {
    available: true,
    plannedOrder: 0,
    referenceHours: 1,
    scheduledStart: null,
    ...over,
  };
}

describe("buildDayQueue — ordem manual", () => {
  it("respeita a ordem da pessoa entre itens liberados", () => {
    const r = buildDayQueue([
      item({ id: "b", plannedOrder: 2 }),
      item({ id: "a", plannedOrder: 1 }),
    ]);
    expect(r.slots.map((s) => s.item.id)).toEqual(["a", "b"]);
    expect(r.slots.every((s) => s.kind === "runnable")).toBe(true);
  });

  it("empate no plannedOrder é desempatado pelo id — a ordem é determinística", () => {
    // Sem desempate, a ordem entre dois itens de mesmo número seria a ordem em que o banco
    // devolveu as linhas, que o Postgres não garante: a mesma célula listaria coisas em ordens
    // diferentes entre dois carregamentos, sem nada ter mudado.
    const entrada = [
      item({ id: "b", plannedOrder: 1 }),
      item({ id: "a", plannedOrder: 1 }),
      item({ id: "c", plannedOrder: 1 }),
    ];
    expect(buildDayQueue(entrada).slots.map((s) => s.item.id)).toEqual(["a", "b", "c"]);
    // E a ordem de entrada não muda o resultado.
    expect(buildDayQueue([...entrada].reverse()).slots.map((s) => s.item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("soma as horas de referência do que é executável", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, referenceHours: 2 }),
      item({ id: "b", plannedOrder: 2, referenceHours: 1.5 }),
    ]);
    expect(r.usedHours).toBeCloseTo(3.5, 5);
  });
});

describe("buildDayQueue — etapa não liberada", () => {
  it("fica visível na posição escolhida, marcada como esperando", () => {
    // Ela não some: a pessoa pôs ali de propósito, e some seria perder a intenção.
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false }),
      item({ id: "b", plannedOrder: 2 }),
    ]);
    expect(r.slots.map((s) => [s.item.id, s.kind])).toEqual([
      ["a", "waiting"],
      ["b", "runnable"],
    ]);
  });

  it("é PULADA: a próxima liberada é a que se faz agora", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false }),
      item({ id: "b", plannedOrder: 2 }),
    ]);
    expect(r.nextRunnableId).toBe("b");
  });

  it("não consome capacidade — não dá para ocupar o dia com o que não pode ser feito", () => {
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1, available: false, referenceHours: 8 }),
      item({ id: "b", plannedOrder: 2, referenceHours: 2 }),
    ]);
    expect(r.usedHours).toBeCloseTo(2, 5);
  });

  it("dia inteiro sem nada liberado não tem próximo", () => {
    const r = buildDayQueue([item({ id: "a", plannedOrder: 1, available: false })]);
    expect(r.nextRunnableId).toBeNull();
  });
});

describe("buildDayQueue — item agendado", () => {
  it("liberado e agendado entra como agendado, e conta as horas", () => {
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
        referenceHours: 3,
      }),
    ]);
    expect(r.slots[0].kind).toBe("scheduled");
    expect(r.usedHours).toBeCloseTo(3, 5);
  });

  it("agendado e NÃO liberado é CONFLITO, nunca 'waiting'", () => {
    // O equipamento está reservado e a etapa anterior não terminou. Pular em silêncio esconderia
    // justamente o que estraga o dia de gravação.
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        available: false,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
      }),
    ]);
    expect(r.slots[0].kind).toBe("conflict");
    expect(r.conflicts.map((c) => c.id)).toEqual(["a"]);
  });

  it("conflito não é o próximo a fazer nem consome capacidade", () => {
    const r = buildDayQueue([
      item({
        id: "a",
        plannedOrder: 1,
        available: false,
        scheduledStart: new Date("2026-08-31T14:00:00Z"),
        referenceHours: 4,
      }),
      item({ id: "b", plannedOrder: 2, referenceHours: 1 }),
    ]);
    expect(r.nextRunnableId).toBe("b");
    expect(r.usedHours).toBeCloseTo(1, 5);
  });

  it("um agendado liberado é o próximo, mesmo com liberado antes dele", () => {
    // Compromisso marcado tem prioridade sobre a ordem manual — é o que "interrompe o concorrente"
    // significa na prática, do ponto de vista de quem olha a fila.
    const r = buildDayQueue([
      item({ id: "a", plannedOrder: 1 }),
      item({ id: "b", plannedOrder: 2, scheduledStart: new Date("2026-08-31T14:00:00Z") }),
    ]);
    expect(r.nextRunnableId).toBe("b");
  });
});

describe("buildDayQueue — dia vazio", () => {
  it("devolve tudo zerado sem quebrar", () => {
    const r = buildDayQueue([]);
    expect(r).toEqual({ slots: [], usedHours: 0, nextRunnableId: null, conflicts: [] });
  });

  it("item reivindicado e sem dia entra DEPOIS do que tem dia", () => {
    // Reivindicar põe o trabalho na fila de agora sem inventar uma data: ele entra no fim, atrás
    // do que o gestor programou para hoje. Sem isto, quem pega uma etapa fura a ordem que a
    // pessoa já montou para o dia.
    const fila = buildDayQueue([
      item({
        id: "semDia",
        plannedOrder: 0,
        semDia: true,
        claimedAt: new Date("2026-09-01T09:00:00Z"),
      }),
      item({ id: "comDia", plannedOrder: 5 }),
    ]);
    expect(fila.slots.map((s) => s.item.id)).toEqual(["comDia", "semDia"]);
  });

  it("entre os sem dia, vale a ordem em que foram reivindicados", () => {
    const fila = buildDayQueue([
      item({ id: "b", semDia: true, claimedAt: new Date("2026-09-01T15:00:00Z") }),
      item({ id: "a", semDia: true, claimedAt: new Date("2026-09-01T09:00:00Z") }),
    ]);
    expect(fila.slots.map((s) => s.item.id)).toEqual(["a", "b"]);
  });

  it("o sem dia consome capacidade — é trabalho de verdade acontecendo", () => {
    // Se não somasse, a régua do dia e o total da semana mentiriam justamente sobre quem está
    // ocupado: a pessoa que puxou trabalho apareceria com o dia mais vazio que o de quem não puxou.
    const fila = buildDayQueue([
      item({
        id: "x",
        referenceHours: 3,
        semDia: true,
        claimedAt: new Date("2026-09-01T09:00:00Z"),
      }),
    ]);
    expect(fila.usedHours).toBe(3);
    expect(fila.slots[0].kind).toBe("runnable");
  });
});
