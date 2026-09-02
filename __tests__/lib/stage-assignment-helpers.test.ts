import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  parseSelectedStages,
  parseStageTeams,
  parseStageInstructions,
  createTaskStages,
  computeStageReadiness,
  isEffectiveTeamMember,
} from "@/lib/stage-assignment-helpers";

describe("parseSelectedStages", () => {
  it("coleta só os stageIds marcados (checkbox 'stage:<id>')", () => {
    const fd = new FormData();
    fd.append("stage:s1", "on");
    fd.append("stage:s3", "on");
    fd.append("assignee:s1", "u1"); // não é 'stage:' — ignorado
    const sel = parseSelectedStages(fd);
    expect([...sel].sort()).toEqual(["s1", "s3"]);
  });

  it("retorna conjunto vazio quando nenhum checkbox veio", () => {
    expect(parseSelectedStages(new FormData()).size).toBe(0);
  });
});

describe("createTaskStages — seleção de etapas", () => {
  const stages = [
    { id: "s1", optional: false, order: 1, defaultTeamId: null, defaultTeam: null },
    { id: "s2", optional: true, order: 2, defaultTeamId: null, defaultTeam: null },
    { id: "s3", optional: false, order: 3, defaultTeamId: null, defaultTeam: null },
  ];

  function makeTx() {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
      taskActiveStage: { create },
      taskStageLog: { create: vi.fn().mockResolvedValue({}) },
      stageTransition: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
    };
    const createdData = () =>
      create.mock.calls.map((c) => c[0].data as { stageId: string; status: string });
    return { tx: tx as unknown as Prisma.TransactionClient, createdData };
  }

  it("cria só as selecionadas; entrada (ACTIVE) = menor order selecionada", async () => {
    const { tx, createdData } = makeTx();
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      selectedStageIds: new Set(["s2", "s3"]),
    });
    const created = createdData();
    expect(created.map((d) => d.stageId).sort()).toEqual(["s2", "s3"]);
    expect(created.find((d) => d.stageId === "s2")?.status).toBe("ACTIVE"); // menor order selecionada
    expect(created.find((d) => d.stageId === "s3")?.status).toBe("INACTIVE");
  });

  it("sem selectedStageIds inclui só as NÃO-opcionais (batch)", async () => {
    const { tx, createdData } = makeTx();
    await createTaskStages(tx, { taskId: "t1", templateId: "tpl", userId: "u1" });
    expect(
      createdData()
        .map((d) => d.stageId)
        .sort()
    ).toEqual(["s1", "s3"]);
  });

  it("lança se nenhuma etapa incluída", async () => {
    const { tx } = makeTx();
    await expect(
      createTaskStages(tx, {
        taskId: "t1",
        templateId: "tpl",
        userId: "u1",
        selectedStageIds: new Set(),
      })
    ).rejects.toThrow();
  });
});

describe("computeStageReadiness", () => {
  const linear = [
    { id: "A", dependsOnIds: [] },
    { id: "B", dependsOnIds: ["A"] },
    { id: "C", dependsOnIds: ["B"] },
  ];

  it("pass-through: B excluída → concluir A ativa C", () => {
    const r = computeStageReadiness({
      stages: linear,
      includedStageIds: new Set(["A", "C"]), // B excluída (sem linha)
      completedStageIds: new Set(["A"]),
      statusByStage: new Map([
        ["A", "COMPLETED"],
        ["C", "INACTIVE"],
      ]),
    });
    expect(r.get("C")).toBe("ACTIVE");
  });

  it("cadeia normal: concluir A ativa B; C segue INACTIVE (nenhum prereq concluído)", () => {
    const r = computeStageReadiness({
      stages: linear,
      includedStageIds: new Set(["A", "B", "C"]),
      completedStageIds: new Set(["A"]),
      statusByStage: new Map([
        ["A", "COMPLETED"],
        ["B", "INACTIVE"],
        ["C", "INACTIVE"],
      ]),
    });
    expect(r.get("B")).toBe("ACTIVE");
    expect(r.has("C")).toBe(false);
  });

  it("não regride ACTIVE/COMPLETED", () => {
    const r = computeStageReadiness({
      stages: linear,
      includedStageIds: new Set(["A", "B", "C"]),
      completedStageIds: new Set(["A"]),
      statusByStage: new Map([
        ["A", "COMPLETED"],
        ["B", "ACTIVE"],
        ["C", "INACTIVE"],
      ]),
    });
    expect(r.has("B")).toBe(false);
  });

  it("prereqs mistos (um excluído, um incluído pendente) → BLOCKED", () => {
    const stages = [
      { id: "A", dependsOnIds: [] },
      { id: "X", dependsOnIds: [] },
      { id: "D", dependsOnIds: ["A", "X"] },
    ];
    const r = computeStageReadiness({
      stages,
      includedStageIds: new Set(["A", "X", "D"]), // nada excluído aqui
      completedStageIds: new Set(["A"]), // X ainda ACTIVE, não concluída
      statusByStage: new Map([
        ["A", "COMPLETED"],
        ["X", "ACTIVE"],
        ["D", "INACTIVE"],
      ]),
    });
    expect(r.get("D")).toBe("BLOCKED");
  });

  it("todos os prereqs de D excluídos → ativa D ao encontrar qualquer gatilho", () => {
    const stages = [
      { id: "A", dependsOnIds: [] },
      { id: "P", dependsOnIds: ["A"] },
      { id: "D", dependsOnIds: ["P"] },
    ];
    const r = computeStageReadiness({
      stages,
      includedStageIds: new Set(["A", "D"]), // P excluída
      completedStageIds: new Set(["A"]),
      statusByStage: new Map([
        ["A", "COMPLETED"],
        ["D", "INACTIVE"],
      ]),
    });
    expect(r.get("D")).toBe("ACTIVE");
  });
});

describe("parseStageTeams / parseStageInstructions", () => {
  it("lê team:<id> e instructions:<id>, descartando vazios", () => {
    const fd = new FormData();
    fd.append("team:s1", "t1");
    fd.append("team:s2", "   ");
    fd.append("instructions:s1", "  Fazer o corte do vídeo  ");
    fd.append("instructions:s2", "");
    fd.append("assignee:s1", "u1"); // outro prefixo — ignorado
    expect(parseStageTeams(fd)).toEqual({ s1: "t1" });
    expect(parseStageInstructions(fd)).toEqual({ s1: "Fazer o corte do vídeo" });
  });
});

describe("createTaskStages — roteamento de etapa coringa", () => {
  // s1 tem time no template; s2 é coringa (defaultTeamId null).
  const stages = [
    {
      id: "s1",
      optional: false,
      order: 1,
      defaultTeamId: "tA",
      defaultTeam: { members: [{ id: "uA" }] },
    },
    { id: "s2", optional: false, order: 2, defaultTeamId: null, defaultTeam: null },
  ];

  function makeTx(teamRows: { id: string; members: { id: string }[] }[] = []) {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
      team: { findMany: vi.fn().mockResolvedValue(teamRows) },
      taskActiveStage: { create },
      taskStageLog: { create: vi.fn().mockResolvedValue({}) },
      stageTransition: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
    };
    const dataFor = (stageId: string) =>
      create.mock.calls
        .map((c) => c[0].data as Record<string, unknown>)
        .find((d) => d.stageId === stageId);
    return { tx: tx as unknown as Prisma.TransactionClient, dataFor };
  }

  it("grava time e instrução na etapa coringa, e o responsável do time escolhido", async () => {
    const { tx, dataFor } = makeTx([{ id: "tB", members: [{ id: "uB" }] }]);
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      teams: { s2: "tB" },
      instructions: { s2: "Revisar o roteiro" },
      assignments: { s2: "uB" },
    });
    const s2 = dataFor("s2")!;
    expect(s2.teamId).toBe("tB");
    expect(s2.instructions).toBe("Revisar o roteiro");
    expect(s2.assigneeId).toBe("uB");
  });

  it("recusa responsável fora do time escolhido", async () => {
    const { tx, dataFor } = makeTx([{ id: "tB", members: [{ id: "uB" }] }]);
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      teams: { s2: "tB" },
      assignments: { s2: "intruso" },
    });
    expect(dataFor("s2")!.assigneeId).toBeNull();
  });

  it("ignora override numa etapa que já tem time no template — quem manda é o fluxo", async () => {
    const { tx, dataFor } = makeTx();
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      teams: { s1: "tB" },
      instructions: { s1: "não deve entrar" },
    });
    const s1 = dataFor("s1")!;
    expect(s1.teamId).toBeUndefined();
    expect(s1.instructions).toBeUndefined();
  });

  it("time inexistente não derruba a criação: a etapa fica sem roteamento", async () => {
    const { tx, dataFor } = makeTx([]); // nenhum time encontrado
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "u1",
      teams: { s2: "fantasma" },
    });
    expect(dataFor("s2")!.teamId).toBeUndefined();
  });
});

describe("isEffectiveTeamMember — elegibilidade pelo time efetivo", () => {
  const video = { id: "video", members: [{ id: "ana" }] };
  const trafego = { id: "trafego", members: [{ id: "bruno" }] };

  it("aceita quem é do time padrão do modelo", () => {
    const etapa = { teamId: null, team: null, stage: { defaultTeam: video } };
    expect(isEffectiveTeamMember(etapa, "ana")).toBe(true);
    expect(isEffectiveTeamMember(etapa, "bruno")).toBe(false);
  });

  it("o roteamento da demanda SUBSTITUI o padrão do modelo", () => {
    // Etapa coringa roteada para Tráfego: quem vale agora é Tráfego, não o padrão do template.
    // `isValidStageAssignee` erraria aqui — olha só o `defaultTeam` — e é por isso que existem duas.
    const roteada = { teamId: "trafego", team: trafego, stage: { defaultTeam: video } };
    expect(isEffectiveTeamMember(roteada, "bruno")).toBe(true);
    expect(isEffectiveTeamMember(roteada, "ana")).toBe(false);
  });

  it("etapa sem time efetivo aceita qualquer pessoa — não há regra a violar", () => {
    // Coringa que ninguém direcionou. Recusar tiraria da mesa a única porta que programa essas.
    const solta = { teamId: null, team: null, stage: { defaultTeam: null } };
    expect(isEffectiveTeamMember(solta, "quem-quer-que-seja")).toBe(true);
  });

  it("time efetivo sem membro nenhum não aceita ninguém", () => {
    const vazio = { teamId: null, team: null, stage: { defaultTeam: { id: "x", members: [] } } };
    expect(isEffectiveTeamMember(vazio, "ana")).toBe(false);
  });
});

describe("createTaskStages — a instrução da PRIMEIRA etapa também é entregue", () => {
  // A primeira etapa nasce ACTIVE aqui e nunca passa por `activateNextStages`, que é onde a
  // instrução vira comentário. Sem esta entrega, dentro da MESMA demanda algumas etapas tinham a
  // instrução na conversa e a etapa 1 não tinha — a promessa da spec ("quando uma etapa é
  // liberada e tem instrução, nasce um comentário") ficava sem cumprir logo na primeira.
  const stages = [
    { id: "s1", optional: false, order: 1, defaultTeamId: null, defaultTeam: null },
    { id: "s2", optional: false, order: 2, defaultTeamId: null, defaultTeam: null },
  ];

  function makeTx(createdById: string | null = "gestor1") {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `as-${data.stageId}`,
      ...data,
      instructions: data.instructions ?? null,
    }));
    const createMany = vi.fn().mockResolvedValue({});
    const tx = {
      templateStage: { findMany: vi.fn().mockResolvedValue(stages) },
      taskActiveStage: { create },
      taskStageLog: { create: vi.fn().mockResolvedValue({}) },
      stageTransition: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
      task: { findUnique: vi.fn().mockResolvedValue({ createdById }) },
      taskComment: { createMany },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, createMany };
  }

  it("primeira etapa com instrução: nasce o comentário assinado por quem criou a demanda", async () => {
    const { tx, createMany } = makeTx();
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "gestor1",
      instructions: { s1: "Gravar no estúdio B" },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "t1",
          userId: "gestor1",
          activeStageId: "as-s1",
          kind: "STAGE_INSTRUCTION",
          content: "Gravar no estúdio B",
        },
      ],
    });
  });

  it("primeira etapa sem instrução: nada é escrito, nem consulta feita", async () => {
    const { tx, createMany } = makeTx();
    await createTaskStages(tx, { taskId: "t1", templateId: "tpl", userId: "gestor1" });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("só a PRIMEIRA: a instrução da etapa 2 espera a liberação dela", async () => {
    // Entregar aqui a instrução de uma etapa INACTIVE seria direção sem trabalho a fazer — e ela
    // chegaria duas vezes, porque `activateNextStages` a entrega quando a etapa abre de verdade.
    const { tx, createMany } = makeTx();
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "gestor1",
      instructions: { s1: "Gravar no estúdio B", s2: "Editar em 9:16" },
    });
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(createMany.mock.calls[0][0].data[0].activeStageId).toBe("as-s1");
  });

  it("demanda sem criador registrado: instrução escrita, comentário nenhum", async () => {
    // Mesma regra de `buildInstructionComments` — assinar em nome de ninguém seria inventar
    // autoria. Vale para as demandas legadas, criadas antes de `Task.createdById` existir.
    const { tx, createMany } = makeTx(null);
    await createTaskStages(tx, {
      taskId: "t1",
      templateId: "tpl",
      userId: "gestor1",
      instructions: { s1: "Gravar no estúdio B" },
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});
