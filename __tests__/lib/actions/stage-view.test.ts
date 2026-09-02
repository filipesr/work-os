import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findUnique: vi.fn() },
    taskComment: { findMany: vi.fn() },
    taskArtifact: { findMany: vi.fn() },
  },
}));
// Task 9: as ações passaram a morar na etapa, e a etapa precisa dos alvos de reversão (task-level,
// ver `previousStages` no tipo) e do cronômetro de quem vê a tela. Mockados na borda — a lógica de
// cada um já tem teste próprio em `task.test.ts` / `activity.test.ts`.
vi.mock("@/lib/actions/task", () => ({
  getPreviousStages: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/actions/activity", () => ({
  getCurrentActiveLog: vi.fn().mockResolvedValue(null),
}));

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { getPreviousStages } from "@/lib/actions/task";
import { getCurrentActiveLog } from "@/lib/actions/activity";
import { getStageView } from "@/lib/actions/stage-view";

const db = prisma as unknown as {
  taskActiveStage: { findUnique: ReturnType<typeof vi.fn> };
  taskComment: { findMany: ReturnType<typeof vi.fn> };
  taskArtifact: { findMany: ReturnType<typeof vi.fn> };
};

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as2",
    status: "ACTIVE",
    instructions: "Gravar no estúdio B",
    taskId: "t1",
    stageId: "ts2",
    stage: { name: "Gravação", order: 2 },
    team: { name: "Vídeo" },
    assignee: { id: "u1", name: "Ana", email: "ana@exemplo.com" },
    task: {
      id: "t1",
      title: "Reels de setembro",
      dueDate: new Date("2026-09-10T00:00:00Z"),
      projectId: "p1",
      project: {
        name: "Campanha institucional",
        clientId: "c1",
        client: { name: "ACME" },
      },
    },
    ...over,
  };
}

function commentRow(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    content: "oi",
    createdAt: new Date("2026-09-01T09:00:00Z"),
    kind: "USER",
    activeStageId: null,
    user: { id: "u2", name: "Beto", email: "beto@exemplo.com" },
    ...over,
  };
}

function artifactRow(over: Record<string, unknown> = {}) {
  return {
    id: "art1",
    title: "Roteiro final",
    url: "https://exemplo.com/roteiro",
    type: "DOCUMENT",
    scope: "TASK",
    storageKind: "LINK",
    uploadStatus: "READY",
    mediaType: null,
    fileName: null,
    version: 1,
    createdAt: new Date("2026-09-01T08:00:00Z"),
    user: { name: "Ana", email: "ana@exemplo.com" },
    ...over,
  };
}

describe("getStageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue({ id: "gestor1", role: "MANAGER" } as never);
    vi.mocked(getPreviousStages).mockResolvedValue([]);
    vi.mocked(getCurrentActiveLog).mockResolvedValue(null);
    db.taskActiveStage.findUnique.mockResolvedValue(stageRow());
    db.taskComment.findMany.mockResolvedValue([
      commentRow({ id: "c1", createdAt: new Date("2026-09-01T09:00:00Z") }),
      commentRow({
        id: "c2",
        createdAt: new Date("2026-09-01T10:00:00Z"),
        kind: "STAGE_INSTRUCTION",
        activeStageId: "as2",
        content: "Gravar no estúdio B",
      }),
      commentRow({ id: "c3", createdAt: new Date("2026-09-01T11:00:00Z") }),
    ]);
    db.taskArtifact.findMany.mockResolvedValue([]);
  });

  it("devolve a etapa, a demanda e a conversa INTEIRA", async () => {
    // O mock de `findMany` devolve as três linhas incondicionalmente — não aplica o próprio
    // `where`. Então o que prova que a busca não é recortada pela etapa é o ARGUMENTO passado ao
    // Prisma, verificado abaixo, e não este retorno: quem operar precisa do contexto todo.
    const v = await getStageView("as2", "t1");
    expect(v?.stage.activeStageId).toBe("as2");
    expect(v?.comments.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("busca os comentários pela DEMANDA, não pela etapa", async () => {
    // Esta é a asserção que de fato protege contra a regressão: se alguém acrescentar
    // `activeStageId` ao `where` da implementação, o mock acima continuaria devolvendo as três
    // linhas (mocks não filtram sozinhos) e o teste anterior passaria verde do mesmo jeito. Só a
    // checagem do argumento pego pelo Prisma pega essa regressão.
    await getStageView("as2", "t1");
    const chamada = db.taskComment.findMany.mock.calls[0][0] as { where: unknown };
    expect(chamada.where).toEqual({ taskId: "t1" });
  });

  it("a instrução da etapa vem separada, para o destaque do topo", async () => {
    const v = await getStageView("as2", "t1");
    expect(v?.stage.instruction).toBe("Gravar no estúdio B");
  });

  it("etapa inexistente devolve nulo, e a rota vira 404", async () => {
    db.taskActiveStage.findUnique.mockResolvedValue(null);
    expect(await getStageView("nao-existe", "t1")).toBeNull();
  });

  it("[CRÍTICO] recusa etapa que não pertence à demanda da URL", async () => {
    // `/tasks/t1/stages/as-de-outra-demanda` não pode abrir: o id existir não basta. Sem esta
    // checagem, trocar o taskId na barra de endereço mostraria a conversa de OUTRA demanda no
    // cabeçalho de uma que não é dela.
    db.taskActiveStage.findUnique.mockResolvedValue({ ...stageRow(), taskId: "OUTRA" });
    expect(await getStageView("as2", "t1")).toBeNull();
  });

  it("recusa quem não está autenticado", async () => {
    // Rota nova é onde se esquece a porta. `getSessionUser` é a mesma que /tasks/{id} usa, e este
    // teste é o que impede a tela da etapa de nascer aberta.
    vi.mocked(getSessionUser).mockRejectedValueOnce(new Error("Access Denied"));
    await expect(getStageView("as2", "t1")).rejects.toThrow(/Access Denied/i);
  });

  // --- Task 9: dado que os botões de ação passam a morar aqui ---

  it("expõe o TemplateStage.id — o que as Server Actions de etapa esperam, não a linha TaskActiveStage", async () => {
    // `completeStageAndAdvance`/`revertTaskStage`/`unassignActiveStage`/`ActivityLog.stageId`
    // esperam `TemplateStage.id`. Confundir com `activeStageId` (a linha da instância) faria todo
    // botão movido para a etapa falhar contra um id que não existe em `TemplateStage`.
    const v = await getStageView("as2", "t1");
    expect(v?.stage.templateStageId).toBe("ts2");
  });

  it("quem é responsável pela etapa pode agir nela", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "MEMBER" } as never);
    const v = await getStageView("as2", "t1");
    expect(v?.stage.canPerformActions).toBe(true);
  });

  it("quem não é responsável nem tem papel gerencial não pode agir", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "outro", role: "MEMBER" } as never);
    const v = await getStageView("as2", "t1");
    expect(v?.stage.canPerformActions).toBe(false);
  });

  it("papel gerencial pode agir mesmo sem ser o responsável pela etapa", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "gestor1", role: "MANAGER" } as never);
    const v = await getStageView("as2", "t1");
    expect(v?.stage.canPerformActions).toBe(true);
  });

  it("repassa os alvos de reversão vindos de getPreviousStages, pela DEMANDA (não pela etapa)", async () => {
    vi.mocked(getPreviousStages).mockResolvedValue([
      { id: "ts1", name: "Roteiro", order: 1 } as never,
    ]);
    const v = await getStageView("as2", "t1");
    expect(v?.previousStages).toEqual([{ id: "ts1", name: "Roteiro", order: 1 }]);
    expect(getPreviousStages).toHaveBeenCalledWith("t1");
  });

  it("repassa o cronômetro de QUEM VÊ a tela — pode ser de outra tarefa", async () => {
    vi.mocked(getCurrentActiveLog).mockResolvedValue({
      id: "log1",
      taskId: "outra-tarefa",
      task: { id: "outra-tarefa", title: "Outra demanda" },
    } as never);
    const v = await getStageView("as2", "t1");
    expect(v?.activeLog).toEqual({
      id: "log1",
      taskId: "outra-tarefa",
      task: { id: "outra-tarefa", title: "Outra demanda" },
    });
    expect(getCurrentActiveLog).toHaveBeenCalledWith("gestor1");
  });

  it("junta artefatos de tarefa, projeto e cliente numa única linha unificada", async () => {
    db.taskArtifact.findMany.mockResolvedValue([
      artifactRow({ id: "a-task", scope: "TASK" }),
      artifactRow({ id: "a-proj", scope: "PROJECT", title: "Guia de marca" }),
      artifactRow({ id: "a-cli", scope: "CLIENT", title: "Contrato" }),
    ]);
    const v = await getStageView("as2", "t1");
    expect(v?.artifactRows.map((r) => [r.id, r.origin])).toEqual([
      ["a-task", "TASK"],
      ["a-proj", "PROJECT"],
      ["a-cli", "CLIENT"],
    ]);
    // Só a linha de origem TASK carrega o rótulo da tarefa — projeto/cliente não têm uma.
    expect(v?.artifactRows.find((r) => r.id === "a-task")?.taskTitle).toBe("Reels de setembro");
    expect(v?.artifactRows.find((r) => r.id === "a-proj")?.taskTitle).toBeNull();
  });

  it("MANAGER pode remover artefato escopado; MEMBER e SUPERVISOR não", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", role: "MEMBER" } as never);
    expect((await getStageView("as2", "t1"))?.canManageScoped).toBe(false);

    vi.mocked(getSessionUser).mockResolvedValue({ id: "sup1", role: "SUPERVISOR" } as never);
    expect((await getStageView("as2", "t1"))?.canManageScoped).toBe(false);

    vi.mocked(getSessionUser).mockResolvedValue({ id: "gestor1", role: "MANAGER" } as never);
    expect((await getStageView("as2", "t1"))?.canManageScoped).toBe(true);
  });
});
