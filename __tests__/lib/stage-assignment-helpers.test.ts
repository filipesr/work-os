import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  parseSelectedStages,
  createTaskStages,
  computeStageReadiness,
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
