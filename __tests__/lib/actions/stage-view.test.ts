import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "gestor1", role: "MANAGER" }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    taskActiveStage: { findUnique: vi.fn() },
    taskComment: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { getStageView } from "@/lib/actions/stage-view";

const db = prisma as unknown as {
  taskActiveStage: { findUnique: ReturnType<typeof vi.fn> };
  taskComment: { findMany: ReturnType<typeof vi.fn> };
};

function stageRow(over: Record<string, unknown> = {}) {
  return {
    id: "as2",
    status: "ACTIVE",
    instructions: "Gravar no estúdio B",
    taskId: "t1",
    stage: { name: "Gravação", order: 2 },
    team: { name: "Vídeo" },
    assignee: { id: "u1", name: "Ana", email: "ana@exemplo.com" },
    task: {
      id: "t1",
      title: "Reels de setembro",
      dueDate: new Date("2026-09-10T00:00:00Z"),
      project: { name: "Campanha institucional", client: { name: "ACME" } },
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

describe("getStageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue({ id: "gestor1", role: "MANAGER" } as never);
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
});
