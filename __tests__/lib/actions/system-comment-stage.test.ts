import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Os quatro comentários de SISTEMA (etapa concluída por gestor, demanda concluída
 * automaticamente, etapa reivindicada, etapa desatribuída) nasciam com dois defeitos irmãos:
 *
 * 1. `activeStageId` nulo, com o id da linha da etapa em escopo na MESMA função (as quatro já o
 *    usam no `revalidatePath(stagePath(...))`). Depois que o histórico passou a filtrar pelo
 *    vínculo, esses comentários não aparecem sob etapa NENHUMA — pior que o palpite por autor que
 *    substituíram, que ao menos os punha perto da etapa certa.
 * 2. O corpo montado em português cravado na action, com `toLocaleString("pt-BR")` — exatamente o
 *    que a entrega tirou de `revertTaskStage` e esqueceu aqui. Quem lê em espanhol recebia frase e
 *    data em português, e a paridade de locales não via nada, porque a string não estava em locale
 *    nenhum.
 *
 * O mock de i18n devolve `chave:paramsJSON` — nunca uma frase. É ele que torna o segundo teste de
 * cada par capaz de falhar: nenhuma palavra do corpo pode sobreviver a ele se vier do locale.
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi
    .fn()
    .mockResolvedValue((k: string, params?: Record<string, unknown>) =>
      params ? `${k}:${JSON.stringify(params)}` : k
    ),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/planning/stage-reference", () => ({
  getStageReferences: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/prisma", () => {
  const db = {
    task: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
    taskActiveStage: {
      updateMany: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    templateStage: {
      findUnique: vi.fn().mockResolvedValue({ templateId: "tpl" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    taskStageLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    taskComment: { create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(1) },
    taskArtifact: { count: vi.fn().mockResolvedValue(1) },
    stageTransition: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn() },
    activityLog: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    timeLog: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { hoursSpent: 1 } }),
      create: vi.fn().mockResolvedValue({}),
    },
    stageCompletionNote: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    default: Object.assign(db, {
      $transaction: vi.fn((arg: unknown) =>
        typeof arg === "function"
          ? (arg as (c: typeof db) => Promise<unknown>)(db)
          : Promise.all(arg as unknown[])
      ),
    }),
    prisma: {},
  };
});

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { completeStageAndAdvance, claimActiveStage, unassignActiveStage } from "@/lib/actions/task";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

/** Frases que estavam cravadas na action — nenhuma pode reaparecer em corpo de comentário. */
const CRAVADAS = [
  "ETAPA CONCLUÍDA",
  "TAREFA CONCLUÍDA",
  "ETAPA REIVINDICADA",
  "ETAPA DESATRIBUÍDA",
  "Etapa:",
  "Data:",
  "Por:",
  "Anterior:",
  "administrador",
  "gerente",
];

function corpoDoComentario() {
  return db.taskComment.create.mock.calls.at(-1)?.[0]?.data?.content as string;
}

function comentario() {
  return db.taskComment.create.mock.calls.at(-1)?.[0]?.data as {
    content: string;
    activeStageId: string | null;
  };
}

function nenhumaFraseDoCodigo(content: string) {
  for (const cravada of CRAVADAS) expect(content).not.toContain(cravada);
  // `toLocaleString("pt-BR")` deixava a data no corpo — em português, para quem lê em espanhol.
  expect(content).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
}

/** Gestor que NÃO é o responsável conclui a etapa: o site do comentário de auditoria. */
function gestorConcluiEtapaDeOutro() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "gestor1", name: "Gestora", email: "gestora@x.com", role: "MANAGER" },
  } as never);
  db.user.findUnique.mockResolvedValue({ role: "MANAGER" });
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "ana",
    stage: { id: "s1", name: "Edição", template: {}, defaultTeam: null },
    task: { id: "t1", project: { client: {} } },
  });
  db.taskActiveStage.count.mockResolvedValue(1);
}

describe("comentários de sistema: a etapa que a action já conhece", () => {
  beforeEach(() => vi.clearAllMocks());

  it("etapa concluída por gestor: o comentário nasce vinculado à etapa", async () => {
    gestorConcluiEtapaDeOutro();
    await completeStageAndAdvance("t1", "s1");
    expect(comentario()).toMatchObject({ taskId: "t1", activeStageId: "as1" });
  });

  it("etapa concluída por gestor: nenhuma frase do corpo vem do código", async () => {
    gestorConcluiEtapaDeOutro();
    await completeStageAndAdvance("t1", "s1");
    nenhumaFraseDoCodigo(corpoDoComentario());
  });

  it("demanda concluída automaticamente: o comentário nasce vinculado à última etapa", async () => {
    gestorConcluiEtapaDeOutro();
    // Nenhuma linha aberta restou → a última etapa fechou e a demanda se conclui sozinha.
    db.taskActiveStage.count.mockResolvedValue(0);
    await completeStageAndAdvance("t1", "s1");
    expect(comentario()).toMatchObject({ taskId: "t1", activeStageId: "as1" });
  });

  it("demanda concluída automaticamente: nenhuma frase do corpo vem do código", async () => {
    gestorConcluiEtapaDeOutro();
    db.taskActiveStage.count.mockResolvedValue(0);
    await completeStageAndAdvance("t1", "s1");
    nenhumaFraseDoCodigo(corpoDoComentario());
  });

  it("etapa reivindicada: o comentário nasce vinculado à etapa assumida", async () => {
    setupReivindicar();
    await claimActiveStage("t1", "s1");
    expect(comentario()).toMatchObject({ taskId: "t1", activeStageId: "as1" });
  });

  it("etapa reivindicada: nenhuma frase do corpo vem do código", async () => {
    setupReivindicar();
    await claimActiveStage("t1", "s1");
    nenhumaFraseDoCodigo(corpoDoComentario());
  });

  it("etapa desatribuída: o comentário nasce vinculado à etapa liberada", async () => {
    setupDesatribuir();
    await unassignActiveStage("t1", "s1");
    expect(comentario()).toMatchObject({ taskId: "t1", activeStageId: "as1" });
  });

  it("etapa desatribuída: nenhuma frase do corpo vem do código", async () => {
    setupDesatribuir();
    await unassignActiveStage("t1", "s1");
    nenhumaFraseDoCodigo(corpoDoComentario());
    // O responsável anterior é DADO, não frase: ele continua no corpo, como parâmetro.
    expect(corpoDoComentario()).toContain("Ana");
  });
});

function setupReivindicar() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "ana", name: "Ana", email: "ana@x.com", role: "MEMBER" },
  } as never);
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: null,
    stage: { id: "s1", name: "Edição", wipLimit: null },
  });
  db.taskActiveStage.updateMany.mockResolvedValue({ count: 1 });
  db.task.updateMany.mockResolvedValue({ count: 1 });
}

function setupDesatribuir() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "gestor1", name: "Gestora", email: "gestora@x.com", role: "MANAGER" },
  } as never);
  db.user.findUnique.mockResolvedValue({ role: "MANAGER" });
  db.taskActiveStage.findUnique.mockResolvedValue({
    id: "as1",
    status: "ACTIVE",
    assigneeId: "ana",
    stage: { id: "s1", name: "Edição" },
    assignee: { name: "Ana", email: "ana@x.com" },
  });
  db.taskActiveStage.count.mockResolvedValue(0);
}
