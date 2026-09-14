import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Reivindicar uma etapa é o caminho canônico de atribuição — e o poço é COMPARTILHADO.
 *
 * Ana e Bruno, do mesmo time, veem a mesma etapa livre e clicam quase juntos. Com uma leitura
 * seguida de uma escrita por `id`, as duas checagens passam, os dois recebem "etapa assumida" e a
 * etapa fica com quem escreveu por último: o outro atualiza a tela e o trabalho sumiu, sem uma
 * linha dizendo o que aconteceu. Por isso as condições viajam no `where` da escrita — o árbitro é
 * o banco, não o intervalo entre as duas consultas.
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    taskComment: { create: vi.fn().mockResolvedValue({}) },
    taskStageLog: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
  prisma: {},
}));

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { claimActiveStage } from "@/lib/actions/task";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "ana", name: "Ana", email: "ana@example.com", role: "MEMBER" },
  } as never);
  vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: null,
    teamId: null,
    team: null,
    stage: {
      id: "s1",
      name: "Edição",
      wipLimit: null,
      defaultTeam: { id: "video", members: [{ id: "ana" }] },
    },
  } as never);
  vi.mocked(prisma.taskActiveStage.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.task.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("claimActiveStage", () => {
  it("atribui com as condições no where — quem decide o empate é o banco", async () => {
    expect(await claimActiveStage("t1", "s1")).toEqual({ success: true });

    const args = vi.mocked(prisma.taskActiveStage.updateMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { assigneeId: string };
    };
    // As MESMAS condições que a leitura conferiu. Sem elas no `where`, a escrita venceria mesmo
    // depois de outra pessoa já ter levado a etapa.
    expect(args.where).toEqual({ id: "as1", assigneeId: null, status: "ACTIVE" });
    expect(args.data.assigneeId).toBe("ana");

    // E o resto do que reivindicar significa continua acontecendo: log ABERTO da etapa (de onde sai
    // o `activeSince` do envelhecimento) e carimbo write-once de início da tarefa.
    expect(prisma.taskStageLog.create).toHaveBeenCalled();
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", startedAt: null } })
    );
  });

  it("[CRÍTICO] recusa quem não é do time da etapa — o portão não se pega sozinho", async () => {
    // O poço é filtrado por time NA TELA (`getTeamBacklog`), mas a AÇÃO não conferia nada: um
    // designer que alcançasse esta chamada levava uma etapa de Quality Control. É o mesmo defeito
    // que a importação já produziu no acervo — o executor assinando o próprio portão — só que pela
    // porta de uso normal.
    //
    // O princípio é o mesmo que `scheduleStage` já declara: a tela EXPLICA (mostra o time e lista
    // só quem pertence), esta linha GARANTE, que é o que a tela sozinha não faz.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      teamId: null,
      team: null,
      stage: {
        id: "qc",
        name: "Quality Control",
        wipLimit: null,
        defaultTeam: { id: "quality", name: "Quality Control", members: [{ id: "norma" }] },
      },
    } as never);

    expect(await claimActiveStage("t1", "qc")).toMatchObject({ error: expect.any(String) });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("o ROTEAMENTO da demanda vence o padrão do modelo", async () => {
    // Etapa coringa direcionada na criação pertence ao time escolhido, não ao do template (que
    // aqui é justamente nenhum). Conferir só o `defaultTeam` recusaria a pessoa CERTA — é a
    // diferença entre `isEffectiveTeamMember` e a régua estrita da criação.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      teamId: "trafego",
      team: { id: "trafego", members: [{ id: "ana" }] },
      stage: { id: "coringa", name: "Apoio", wipLimit: null, defaultTeam: null },
    } as never);

    expect(await claimActiveStage("t1", "coringa")).toEqual({ success: true });
  });

  it("etapa coringa SEM roteamento continua livre — não há regra a violar", async () => {
    // Recusar aqui inventaria uma regra que não existe e travaria a única porta que hoje pega
    // essas etapas. Mesma decisão que `isEffectiveTeamMember` já documenta.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      teamId: null,
      team: null,
      stage: { id: "coringa", name: "Aprovação", wipLimit: null, defaultTeam: null },
    } as never);

    expect(await claimActiveStage("t1", "coringa")).toEqual({ success: true });
  });

  it("na corrida, quem perde recebe recusa — e nada mais é escrito", async () => {
    // `count: 0` = alguma condição deixou de valer entre a leitura e a escrita. Na prática: alguém
    // chegou antes.
    vi.mocked(prisma.taskActiveStage.updateMany).mockResolvedValue({ count: 0 } as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "stageAlreadyAssigned" });

    // Sem esta parada, o perdedor da corrida promovia a tarefa, carimbava o início e abria um log
    // de etapa em nome de trabalho que é de outra pessoa.
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskStageLog.create).not.toHaveBeenCalled();
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
  });

  it("recusa quando a etapa já tem responsável, antes de tentar escrever", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: "bruno",
      stage: { id: "s1", name: "Edição", wipLimit: null },
    } as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "stageAlreadyAssigned" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("recusa no limite de WIP — o limite existe como restrição de PULL", async () => {
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      stage: { id: "s1", name: "Edição", wipLimit: 2 },
    } as never);
    vi.mocked(prisma.taskActiveStage.count).mockResolvedValue(2 as never);

    expect(await claimActiveStage("t1", "s1")).toEqual({ error: "wipLimitReached" });
    expect(prisma.taskActiveStage.updateMany).not.toHaveBeenCalled();
  });

  it("não abre um SEGUNDO log quando a etapa já tem um aberto", async () => {
    // A etapa de entrada já nasce com log aberto em `createTaskStages`. Sem esta guarda,
    // reivindicá-la abria outro, e o fechamento (`findFirst`) só fecha UM — o outro ficava aberto
    // para sempre, contaminando o tempo por etapa dos relatórios de gargalo.
    vi.mocked(prisma.taskActiveStage.findUnique).mockResolvedValue({
      id: "as1",
      status: "ACTIVE",
      assigneeId: null,
      stage: { id: "s1", name: "Briefing", wipLimit: null },
    } as never);
    vi.mocked(prisma.taskActiveStage.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.taskStageLog.findFirst).mockResolvedValue({ id: "log-aberto" } as never);

    const r = await claimActiveStage("t1", "s1");

    expect(r).toEqual({ success: true });
    expect(prisma.taskStageLog.create).not.toHaveBeenCalled();
  });
});
