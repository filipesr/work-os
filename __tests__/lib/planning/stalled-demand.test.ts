import { describe, it, expect } from "vitest";
import {
  checkStalled,
  stalledSince,
  idleDays,
  sortStalled,
  type StalledStage,
  type StalledItem,
} from "@/lib/planning/stalled-demand";

function etapa(over: Partial<StalledStage> = {}): StalledStage {
  return {
    stageId: "s1",
    order: 1,
    status: "ACTIVE",
    assigneeId: null,
    plannedDate: null,
    teamId: null,
    defaultTeamId: "video",
    ...over,
  };
}

function item(over: Partial<StalledItem> = {}): StalledItem {
  return {
    taskId: "t1",
    taskTitle: "Vídeo",
    projectName: "Campanha",
    dueDateISO: null,
    overdue: false,
    noTeam: false,
    idleDays: 1,
    hours: 2,
    ...over,
  };
}

describe("checkStalled", () => {
  it("próxima etapa sem dono e sem dia: parada", () => {
    expect(checkStalled([etapa()])).toEqual({ stalled: true, teamId: "video", stageId: "s1" });
  });

  it("próxima etapa COM dono: não está parada", () => {
    expect(checkStalled([etapa({ assigneeId: "ana" })])).toEqual({ stalled: false });
  });

  it("próxima etapa COM dia: não está parada", () => {
    // Marcada é trabalho distribuído: já aparece na grade, no dia dela.
    expect(checkStalled([etapa({ plannedDate: new Date("2026-09-09T00:00:00Z") })])).toEqual({
      stalled: false,
    });
  });

  it("etapa FUTURA sem dono não conta — só a próxima", () => {
    // Ninguém pega a etapa 4 antes da 1. Sinalizar isso acenderia a coluna em toda demanda
    // saudável do sistema, e um alarme que acende sempre não é alarme.
    const stages = [etapa({ order: 1, assigneeId: "ana" }), etapa({ order: 2 })];
    expect(checkStalled(stages)).toEqual({ stalled: false });
  });

  it("a próxima é a de menor `order` entre as NÃO concluídas", () => {
    const stages = [
      etapa({ stageId: "s1", order: 1, status: "COMPLETED", assigneeId: "ana" }),
      etapa({ stageId: "s2", order: 2, defaultTeamId: "trafego" }),
      etapa({ stageId: "s3", order: 3, assigneeId: "bruno" }),
    ];
    expect(checkStalled(stages)).toEqual({ stalled: true, teamId: "trafego", stageId: "s2" });
  });

  it("a ordem do array não importa — quem manda é o `order`", () => {
    const stages = [
      etapa({ stageId: "s3", order: 3 }),
      etapa({ stageId: "s1", order: 1, assigneeId: "ana" }),
    ];
    expect(checkStalled(stages)).toEqual({ stalled: false });
  });

  it("demanda sem etapa por concluir nunca está parada", () => {
    // É a entregue: ela já aparece na grade, pelo dia em que fechou.
    expect(checkStalled([etapa({ status: "COMPLETED" })])).toEqual({ stalled: false });
    expect(checkStalled([])).toEqual({ stalled: false });
  });

  it("o roteamento da demanda SUBSTITUI o padrão do modelo", () => {
    expect(checkStalled([etapa({ teamId: "trafego", defaultTeamId: "video" })])).toEqual({
      stalled: true,
      teamId: "trafego",
      stageId: "s1",
    });
  });

  it("coringa que ninguém roteou fica sem equipe", () => {
    expect(checkStalled([etapa({ teamId: null, defaultTeamId: null })])).toEqual({
      stalled: true,
      teamId: null,
      stageId: "s1",
    });
  });
});

describe("stalledSince", () => {
  it("o mais recente entre liberação e último apontamento", () => {
    // Sem o apontamento, uma demanda que alguém pegou, trabalhou e largou ontem diria
    // "parado há 40 dias" sobre um trabalho que aconteceu há um dia.
    expect(
      stalledSince({
        releasedISO: "2026-08-01",
        lastLogISO: "2026-09-08",
        createdISO: "2026-07-20",
      })
    ).toBe("2026-09-08");
  });

  it("sem apontamento, vale a liberação", () => {
    expect(
      stalledSince({ releasedISO: "2026-08-01", lastLogISO: null, createdISO: "2026-07-20" })
    ).toBe("2026-08-01");
  });

  it("sem nenhum dos dois, vale a criação — o piso honesto", () => {
    // Dado antigo, sem transição registrada: a demanda existe desde então e não andou.
    expect(stalledSince({ releasedISO: null, lastLogISO: null, createdISO: "2026-07-20" })).toBe(
      "2026-07-20"
    );
  });
});

describe("idleDays", () => {
  it("conta os dias corridos até hoje", () => {
    expect(idleDays("2026-09-01", "2026-09-24")).toBe(23);
  });

  it("mesmo dia é zero", () => {
    expect(idleDays("2026-09-24", "2026-09-24")).toBe(0);
  });

  it("nunca é negativo", () => {
    // Defesa contra relógio ou dado fora de ordem: "parado há -3 dias" não significa nada.
    expect(idleDays("2026-09-30", "2026-09-24")).toBe(0);
  });
});

describe("sortStalled", () => {
  it("com prazo antes de sem prazo, e por prazo crescente", () => {
    // A vencida sobe sozinha: a data dela é a mais antiga de todas. Nenhum ramo especial para
    // "vencida" — um ramo a mais seria uma regra a mais para divergir.
    const r = sortStalled([
      item({ taskId: "sem-prazo" }),
      item({ taskId: "vence-depois", dueDateISO: "2026-09-30" }),
      item({ taskId: "venceu", dueDateISO: "2026-09-01", overdue: true }),
      item({ taskId: "vence-logo", dueDateISO: "2026-09-10" }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["venceu", "vence-logo", "vence-depois", "sem-prazo"]);
  });

  it("entre as SEM prazo, a mais parada primeiro", () => {
    // Elas nunca vão subir por vencimento; sem este critério a mais podre fica no fim para sempre.
    const r = sortStalled([
      item({ taskId: "nova", idleDays: 2 }),
      item({ taskId: "podre", idleDays: 90 }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["podre", "nova"]);
  });

  it("empate resolve pelo título — ordem estável entre carregamentos", () => {
    const r = sortStalled([
      item({ taskId: "b", taskTitle: "Beta", dueDateISO: "2026-09-10" }),
      item({ taskId: "a", taskTitle: "Alfa", dueDateISO: "2026-09-10" }),
    ]);
    expect(r.map((i) => i.taskId)).toEqual(["a", "b"]);
  });

  it("não muda o array recebido", () => {
    const original = [item({ taskId: "x", idleDays: 1 }), item({ taskId: "y", idleDays: 9 })];
    sortStalled(original);
    expect(original.map((i) => i.taskId)).toEqual(["x", "y"]);
  });
});
