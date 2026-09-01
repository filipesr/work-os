import { describe, it, expect } from "vitest";
import { mergeDone, doneHoursOf } from "@/lib/planning/week-done";

const DIAS = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];
const NOMES = new Map([["s1", "Roteiro"]]);

/** Instante REAL: meio-dia em São Paulo é 15h UTC — longe da virada do dia nos dois fusos. */
function meioDia(diaISO: string): Date {
  return new Date(`${diaISO}T15:00:00Z`);
}

function log(over: Partial<Parameters<typeof mergeDone>[0][number]> = {}) {
  return {
    userId: "ana",
    taskId: "t1",
    stageId: "s1",
    hoursSpent: 2,
    logDate: meioDia("2026-09-08"),
    task: { title: "Vídeo institucional" },
    ...over,
  };
}

function conclusao(over: Partial<Parameters<typeof mergeDone>[1][number]> = {}) {
  return {
    assigneeId: "ana",
    taskId: "t1",
    stageId: "s1",
    completedAt: meioDia("2026-09-08"),
    task: { title: "Vídeo institucional" },
    stage: { name: "Roteiro" },
    ...over,
  };
}

describe("mergeDone", () => {
  it("a hora cai no dia em que foi APONTADA", () => {
    const r = mergeDone([log()], [], DIAS, NOMES);
    expect(r.get("ana")?.get("2026-09-08")?.[0]).toMatchObject({ hours: 2, completed: false });
  });

  it("o ✓ cai no dia em que a etapa FECHOU, ainda que as horas sejam de outro dia", () => {
    // Programada para segunda e concluída na quarta: a segunda mostra as horas gastas nela, a
    // quarta mostra o fechamento. Arrastar tudo para um dia só esconderia metade da história.
    const r = mergeDone(
      [log({ logDate: meioDia("2026-09-07"), hoursSpent: 3 })],
      [conclusao({ completedAt: meioDia("2026-09-09") })],
      DIAS,
      NOMES
    );
    expect(r.get("ana")?.get("2026-09-07")?.[0]).toMatchObject({ hours: 3, completed: false });
    expect(r.get("ana")?.get("2026-09-09")?.[0]).toMatchObject({ hours: 0, completed: true });
  });

  it("horas e fechamento no mesmo dia viram UMA linha", () => {
    const r = mergeDone([log()], [conclusao()], DIAS, NOMES);
    const doDia = r.get("ana")?.get("2026-09-08");
    expect(doDia).toHaveLength(1);
    expect(doDia?.[0]).toMatchObject({ hours: 2, completed: true, stageName: "Roteiro" });
  });

  it("dois apontamentos na mesma etapa e dia somam numa linha só", () => {
    const r = mergeDone([log(), log({ hoursSpent: 1.5 })], [], DIAS, NOMES);
    expect(r.get("ana")?.get("2026-09-08")).toHaveLength(1);
    expect(r.get("ana")?.get("2026-09-08")?.[0].hours).toBe(3.5);
  });

  it("etapa concluída SEM apontamento aparece com zero — não se inventa histórico", () => {
    const r = mergeDone([], [conclusao()], DIAS, NOMES);
    expect(r.get("ana")?.get("2026-09-08")?.[0]).toMatchObject({ hours: 0, completed: true });
  });

  it("hora sem etapa não vira linha da grade por etapa", () => {
    const r = mergeDone([log({ stageId: null })], [], DIAS, NOMES);
    expect(r.get("ana")).toBeUndefined();
  });

  it("o que caiu fora da semana em tela não entra", () => {
    const r = mergeDone(
      [log({ logDate: meioDia("2026-09-13") })],
      [conclusao({ completedAt: meioDia("2026-09-06") })],
      DIAS,
      NOMES
    );
    expect(r.size).toBe(0);
  });

  it("cada pessoa vê só o que é dela", () => {
    const r = mergeDone([log(), log({ userId: "bruno", taskId: "t2" })], [], DIAS, NOMES);
    expect(r.get("ana")?.get("2026-09-08")).toHaveLength(1);
    expect(r.get("bruno")?.get("2026-09-08")).toHaveLength(1);
  });

  it("a concluída vem antes das demais no dia", () => {
    const r = mergeDone(
      [log({ stageId: "s2", taskId: "t2", task: { title: "Aberta" } })],
      [conclusao()],
      DIAS,
      NOMES
    );
    expect(
      r
        .get("ana")
        ?.get("2026-09-08")
        ?.map((l) => l.completed)
    ).toEqual([true, false]);
  });
});

describe("doneHoursOf", () => {
  it("soma o dia inteiro, INCLUSIVE a hora sem etapa", () => {
    // A hora sem etapa não cabe na lista por etapa, mas é hora de trabalho igual: fora da soma, o
    // número do dia mentiria para menos.
    const r = doneHoursOf([log(), log({ stageId: null, hoursSpent: 1 })], DIAS);
    expect(r.get("ana")?.get("2026-09-08")).toBe(3);
  });

  it("ignora o que está fora da semana", () => {
    expect(doneHoursOf([log({ logDate: meioDia("2026-09-20") })], DIAS).size).toBe(0);
  });
});
